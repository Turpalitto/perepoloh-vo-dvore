/**
 * Единственное место, где сейв касается localStorage.
 *
 * Раньше чтение и запись были скопированы в три платформы (`yandex.ts`,
 * `mock.ts`, `local-fallback.ts`), и копии успели разойтись в главном:
 * `local-fallback` оборачивал запись в try/catch, а `yandex` и `mock` — нет.
 * На платформе Яндекса это стоило дорого: `setItem` стоял ПЕРЕД записью в
 * облако, поэтому в приватном режиме Safari (или при полной квоте, или под
 * ITP) исключение уходило до `player.setData`, и авторизованный игрок терял
 * облачное сохранение целиком — при полностью исправном облаке.
 *
 * Здесь же решается вторая задача: восстановление из повреждённых данных.
 * Прежний путь загрузки при битом JSON возвращал `null`, и игра стартовала с
 * `defaultSave()` — то есть с полным сбросом прогресса. Вероятность низкая,
 * ущерб максимальный, страховка стоит один дополнительный ключ.
 *
 * Политика резервной копии намеренно скромная: `.bak` пишется НЕ на каждом
 * сохранении (сейв растёт с прогрессом, а `persist()` вызывается на каждом
 * ходе — удвоение записи бьёт по батарее), а один раз за сеанс, перед первой
 * перезаписью основного ключа. Копируется при этом СТАРОЕ значение, уже
 * прошедшее валидацию: копия непроверенных данных лишь размножила бы
 * повреждение.
 *
 * Формат `SaveData` эти ключи не меняют — они лежат рядом, а не внутри, —
 * поэтому `SAVE_VERSION` остаётся прежним и миграция не требуется.
 */
import { sanitizeSave } from '../game/save';
import type { SaveData } from '../game/save';

export const STORAGE_KEY = 'parkovka.save.v1';
/** Предыдущий валидный сейв: страховка от повреждения основного ключа. */
export const BACKUP_KEY = 'parkovka.save.v1.bak';

/** Резервная копия за этот сеанс уже сделана (см. политику в шапке модуля). */
let backupWrittenThisSession = false;

/** Только для тестов: сбрасывает флаг «копия за сеанс сделана». */
export function resetBackupStateForTests(): void {
  backupWrittenThisSession = false;
}

/**
 * Чтение ключа. Любая ошибка (недоступное хранилище, битый JSON, чужие данные)
 * даёт `null`: отличать «нет сейва» от «сейв не читается» вызывающему коду
 * незачем — обработка одна и та же.
 */
function readKey(key: string): SaveData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return sanitizeSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Локальный сейв: основной ключ, при неудаче — резервная копия.
 *
 * Возврат `null` означает «валидных локальных данных нет» и приводит к
 * честному старту с нуля; но теперь для этого должны испортиться ОБА ключа,
 * а не один.
 */
export function readLocalSave(): SaveData | null {
  const primary = readKey(STORAGE_KEY);
  if (primary) return primary;
  const backup = readKey(BACKUP_KEY);
  if (backup) {
    console.warn('[storage] основной сейв не прочитан, восстановлен из резервной копии');
    return backup;
  }
  return null;
}

/**
 * Запись сейва. Никогда не бросает: отказ хранилища не должен ломать ни ход
 * игрока, ни — на платформе Яндекса — последующую запись в облако.
 * Возвращает признак успеха для тестов и диагностики.
 */
export function writeLocalSave(data: SaveData): boolean {
  const serialized = (() => {
    try {
      return JSON.stringify(data);
    } catch {
      return null;
    }
  })();
  if (serialized === null) return false;

  // Один раз за сеанс сохраняем прежнее значение как резервную копию — и
  // только если оно проходит валидацию.
  if (!backupWrittenThisSession) {
    backupWrittenThisSession = true;
    try {
      const previous = localStorage.getItem(STORAGE_KEY);
      if (previous && sanitizeSave(JSON.parse(previous))) {
        localStorage.setItem(BACKUP_KEY, previous);
      }
    } catch {
      // Копия — страховка, а не обязательство: её неудача не должна помешать
      // основной записи ниже.
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch (e) {
    // Приватный режим, исчерпанная квота, отключённое хранилище. Прогресс не
    // персистится локально в этой сессии — но игра продолжается, а на Яндексе
    // облачная запись всё равно будет выполнена вызывающим кодом.
    console.warn('[storage] локальное сохранение недоступно:', e);
    return false;
  }
}

/**
 * Незавершённая попытка уровня (см. `src/game/run-resume.ts`).
 *
 * Лежит в отдельном ключе, а не внутри `SaveData`, по трём причинам:
 * попытка эфемерна и не должна попадать в облако и в `mergeSave`
 * (объединение двух устройств по правилу «максимум» бессмысленно для
 * позиции на доске); её потеря не смеет задевать прогресс кампании; и
 * формат сейва остаётся неизменным, то есть без миграции.
 */
export const RUN_KEY = 'parkovka.run.v1';

/** Строка попытки как есть. Разбор и валидация — в `decodeRun`. */
export function readRunRaw(): string | null {
  try {
    return localStorage.getItem(RUN_KEY);
  } catch {
    return null;
  }
}

/** Запись попытки. Никогда не бросает: попытка — удобство, а не контракт. */
export function writeRunRaw(raw: string): void {
  try {
    localStorage.setItem(RUN_KEY, raw);
  } catch {
    // Нет места или нет хранилища — просто не будет восстановления.
  }
}

/** Удаление попытки: уровень пройден, перезапущен или заброшен. */
export function clearRunRaw(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    // Игнорируем: невозможность удалить не хуже невозможности записать —
    // отпечаток в `decodeRun` всё равно отсечёт неподходящую попытку.
  }
}
