import { describe, expect, it } from 'vitest';
import { pickWeeklyChallenge, weeklyScore } from '../src/game/elite-weekly';
import { ELITE_CHALLENGES } from '../src/levels/elite-challenges';
import { SaveStore, defaultSave, mergeSave, sanitizeSave } from '../src/game/save';

// Формат ключа недели — дата понедельника YYYY-MM-DD (см. currentWeekKey).
const MONDAYS = Array.from({ length: 52 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 0, 5) + i * 7 * 86_400_000); // 05.01.2026 — понедельник
  return d.toISOString().slice(0, 10);
});

describe('недельный чемпионат', () => {
  it('выбор недели детерминирован и валиден', () => {
    const a = pickWeeklyChallenge(MONDAYS[33]);
    const b = pickWeeklyChallenge(MONDAYS[33]);
    expect(a).toBe(b);
    expect(ELITE_CHALLENGES).toContain(a);
  });

  it('разные недели дают разные испытания (на наборе ключей)', () => {
    // 30 испытаний: за год (52 недели) выбор обязан меняться многократно.
    const distinct = new Set(MONDAYS.map(pickWeeklyChallenge));
    expect(distinct.size).toBeGreaterThan(10);
  });

  it('очки: медаль весит больше, при равной медали выигрывают меньшие ходы', () => {
    expect(weeklyScore(0, 5)).toBe(0);
    expect(weeklyScore(3, 20)).toBe(3000 - 20);
    expect(weeklyScore(2, 1)).toBeLessThan(weeklyScore(3, 999)); // бронза-минус не догонит золото
    expect(weeklyScore(3, 30)).toBeGreaterThan(weeklyScore(3, 40));
    // Мусор на входе не уходит в минус.
    expect(weeklyScore(-1, 0)).toBe(0);
    expect(weeklyScore(3, NaN)).toBe(3000);
    expect(weeklyScore(3, 100_500)).toBe(3000 - 999);
  });
});

describe('сохранение результата чемпионата', () => {
  function store(): SaveStore {
    return new SaveStore({ saveData: async () => undefined } as never, defaultSave());
  }

  it('первая попытка засчитывается, худшая — нет', () => {
    const s = store();
    expect(s.recordEliteWeekly('2026-08-17', 2990, 3)).toBe(true);
    expect(s.recordEliteWeekly('2026-08-17', 1500, 2)).toBe(false); // хуже той же недели
    expect(s.eliteWeeklyOf('2026-08-17')?.score).toBe(2990);
    // Новая неделя вытесняет прошлую.
    expect(s.recordEliteWeekly('2026-08-24', 1200, 2)).toBe(true);
    expect(s.eliteWeeklyOf('2026-08-17')).toBeNull();
  });

  it('sanitize отбрасывает битые записи, merge берёт максимум очков одной недели', () => {
    const bad = sanitizeSave({ ...defaultSave(), eliteWeekly: { week: 'нет', score: 5, medal: 3 } });
    expect(bad?.eliteWeekly).toBeUndefined();
    const good = sanitizeSave({ ...defaultSave(), eliteWeekly: { week: '2026-08-17', score: 2500, medal: 3 } });
    expect(good?.eliteWeekly).toMatchObject({ week: '2026-08-17', score: 2500 });

    const merged = mergeSave(
      { ...defaultSave(), eliteWeekly: { week: '2026-08-17', score: 1500, medal: 2 } },
      { ...defaultSave(), eliteWeekly: { week: '2026-08-17', score: 2900, medal: 3 } }
    );
    expect(merged.eliteWeekly?.score).toBe(2900);
    // Разные недели — побеждает более свежая.
    const newer = mergeSave(
      { ...defaultSave(), eliteWeekly: { week: '2026-09-28', score: 1000, medal: 1 } },
      { ...defaultSave(), eliteWeekly: { week: '2026-08-17', score: 2900, medal: 3 } }
    );
    expect(newer.eliteWeekly?.week).toBe('2026-09-28');
  });
});
