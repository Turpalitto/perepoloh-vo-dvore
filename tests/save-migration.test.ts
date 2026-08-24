import { afterEach, describe, expect, it } from 'vitest';
import { SAVE_MIGRATIONS, SAVE_VERSION, defaultSave, migrateSave, sanitizeSave } from '../src/game/save';

describe('миграции сейва', () => {
  afterEach(() => {
    delete SAVE_MIGRATIONS[1];
    delete SAVE_MIGRATIONS[2];
  });

  it('сейв текущей версии проходит через sanitizeSave без изменений', () => {
    expect(sanitizeSave({ ...defaultSave(), stars: { '1': 3, '2': 1 } })).toMatchObject({
      v: SAVE_VERSION,
      stars: { '1': 3, '2': 1 }
    });
  });

  it('будущая версия без шага миграции не принимается (не ломается молча)', () => {
    expect(sanitizeSave({ ...defaultSave(), v: SAVE_VERSION + 1 })).toBeNull();
  });

  it('сейв текущей версии не проходит лишних шагов миграции', () => {
    let calls = 0;
    SAVE_MIGRATIONS[1] = (raw) => {
      calls++;
      return { ...raw, v: 2 };
    };
    expect(migrateSave(defaultSave(), SAVE_VERSION)).toMatchObject({ v: SAVE_VERSION });
    expect(calls).toBe(0);
  });

  it('старая версия с зарегистрированным шагом поднимается до целевой', () => {
    // Репетиция bump до v2: шаг переносит данные и повышает версию.
    SAVE_MIGRATIONS[1] = (raw) => ({ ...raw, hintTokens: 5, v: 2 });
    const migrated = migrateSave(
      { ...defaultSave(), stars: { '7': 2 }, langChosen: true },
      2
    ) as { v: number; hintTokens?: number; stars: Record<string, number> };
    expect(migrated.v).toBe(2);
    expect(migrated.hintTokens).toBe(5);
    expect(migrated.stars).toEqual({ '7': 2 });
  });

  it('цепочка шагов применяется по порядку до целевой версии', () => {
    SAVE_MIGRATIONS[1] = (raw) => ({ ...raw, v: 2 });
    SAVE_MIGRATIONS[2] = (raw) => ({ ...raw, reviewAsked: true, v: 3 });
    const migrated = migrateSave({ ...defaultSave(), v: 1 }, 3) as {
      v: number;
      reviewAsked?: boolean;
    };
    expect(migrated.v).toBe(3);
    expect(migrated.reviewAsked).toBe(true);
  });

  it('отсутствующий шаг останавливает миграцию на достигнутой версии', () => {
    const migrated = migrateSave({ ...defaultSave(), stars: {}, v: 1 }, 3) as { v: number };
    expect(migrated.v).toBe(1);
  });

  it('битый шаг (вернул мусор) не крашит — миграция останавливается на исходной версии', () => {
    SAVE_MIGRATIONS[1] = () => null as unknown as Record<string, unknown>;
    const save = { ...defaultSave(), stars: { '3': 1 } };
    const migrated = migrateSave(save, 2) as { v: number; stars: Record<string, number> };
    // Данные остаются в прежней версии нетронутыми: их отбросит проверка
    // версии в sanitizeSave, но потеря происходит явно, а не тихой порчей.
    expect(migrated.v).toBe(1);
    expect(migrated.stars).toEqual({ '3': 1 });
  });

  it('мусор на входе проходит насквозь (sanitize его отбросит)', () => {
    expect(migrateSave(null, 3)).toBeNull();
    expect(migrateSave('garbage', 3)).toBe('garbage');
  });
});
