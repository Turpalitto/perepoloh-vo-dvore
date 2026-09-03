import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKUP_KEY,
  STORAGE_KEY,
  readLocalSave,
  resetBackupStateForTests,
  writeLocalSave
} from '../src/platform/local-store';
import { defaultSave } from '../src/game/save';
import { createYandexPlatform } from '../src/platform/yandex';

/**
 * Node не даёт localStorage — in-memory стаб с управляемым отказом записи.
 * `failOn` эмулирует приватный режим Safari / исчерпанную квоту: именно там
 * `setItem` бросает, и именно этот путь раньше уносил с собой облачный сейв.
 */
function installFakeLocalStorage(failOn?: (key: string) => boolean): Map<string, string> {
  const data = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failOn?.(k)) throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    }
  };
  return data;
}

describe('local-store: чтение, запись и восстановление сейва', () => {
  beforeEach(() => {
    resetBackupStateForTests();
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('запись и чтение через основной ключ', () => {
    installFakeLocalStorage();
    expect(writeLocalSave({ ...defaultSave(), lastLevel: 7 })).toBe(true);
    expect(readLocalSave()?.lastLevel).toBe(7);
  });

  it('отказ хранилища не бросает наружу и честно возвращает false', () => {
    installFakeLocalStorage(() => true);
    expect(() => writeLocalSave(defaultSave())).not.toThrow();
    expect(writeLocalSave(defaultSave())).toBe(false);
  });

  it('повреждённый основной ключ восстанавливается из резервной копии', () => {
    const data = installFakeLocalStorage();
    // первый сеанс: валидный сейв лежит в основном ключе
    writeLocalSave({ ...defaultSave(), lastLevel: 42 });
    // новый сеанс: запись создаёт резервную копию прежнего значения
    resetBackupStateForTests();
    writeLocalSave({ ...defaultSave(), lastLevel: 43 });
    expect(data.get(BACKUP_KEY)).toBeDefined();
    // основной ключ портится (обрыв записи, чужой код, повреждение хранилища)
    data.set(STORAGE_KEY, '{битый JSON');
    // прежний путь загрузки вернул бы null ⇒ полный сброс прогресса
    expect(readLocalSave()?.lastLevel).toBe(42);
  });

  it('оба ключа повреждены — честный null, без исключения', () => {
    const data = installFakeLocalStorage();
    data.set(STORAGE_KEY, 'не json');
    data.set(BACKUP_KEY, 'тоже не json');
    expect(() => readLocalSave()).not.toThrow();
    expect(readLocalSave()).toBeNull();
  });

  it('резервная копия никогда не содержит невалидные данные', () => {
    const data = installFakeLocalStorage();
    data.set(STORAGE_KEY, '{битый JSON'); // мусор в основном ключе
    writeLocalSave({ ...defaultSave(), lastLevel: 3 });
    // копировать мусор значило бы размножить повреждение
    expect(data.get(BACKUP_KEY)).toBeUndefined();
    expect(readLocalSave()?.lastLevel).toBe(3);
  });
});

describe('yandex: отказ localStorage не отменяет облачное сохранение', () => {
  beforeEach(() => {
    resetBackupStateForTests();
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  /**
   * Регрессия на конкретный дефект: `saveData` вызывал `localStorage.setItem`
   * ПЕРЕД `player.setData`, без try/catch. В приватном режиме Safari или при
   * полной квоте исключение уходило до облака, и авторизованный игрок терял
   * облачный сейв — при полностью исправном облаке.
   */
  it('setData вызывается даже когда setItem бросает', async () => {
    installFakeLocalStorage((k) => k.startsWith('parkovka.save'));
    const setData = vi.fn().mockResolvedValue(undefined);
    const player = { getData: vi.fn().mockResolvedValue({}), setData };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        YaGames: {
          init: async () => ({
            environment: { i18n: { lang: 'ru' } },
            getPlayer: async () => player
          })
        }
      }
    });

    const platform = createYandexPlatform();
    await platform.init();
    const save = { ...defaultSave(), lastLevel: 9 };
    await expect(platform.saveData(save)).resolves.toBeUndefined();
    expect(setData).toHaveBeenCalledTimes(1);
    expect(setData.mock.calls[0][0]).toEqual({ save });
  });
});
