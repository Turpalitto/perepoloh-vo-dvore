import { describe, expect, it } from 'vitest';
import {
  advanceStreak,
  currentStreak,
  dailyModifier,
  generateDaily,
  isDoneToday,
  todayKey,
  weeklyProgress,
  weeklyTrophies,
  yesterdayKey
} from '../src/game/daily';
import { solve } from '../src/core/solver';
import { validateLevel } from '../src/core/validator';

describe('уровень дня', () => {
  it('детерминирован: один seed-день — один уровень', { timeout: 30_000 }, () => {
    const a = generateDaily('2026-07-19');
    const b = generateDaily('2026-07-19');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('разные дни — разные уровни', { timeout: 30_000 }, () => {
    const a = generateDaily('2026-07-19');
    const b = generateDaily('2026-07-20');
    expect(JSON.stringify(a.pieces)).not.toBe(JSON.stringify(b.pieces));
  });

  it('валиден, проходим, par честный (несколько дат подряд)', { timeout: 60_000 }, () => {
    for (const key of ['2026-07-19', '2026-07-20', '2026-07-21', '2026-12-31', '2027-01-01']) {
      const level = generateDaily(key);
      expect(validateLevel(level)).toEqual([]);
      const res = solve(level);
      expect(res.solvable).toBe(true);
      expect(res.optimal).toBe(level.par);
      expect(level.par).toBeGreaterThanOrEqual(3);
      expect(level.par).toBeLessThanOrEqual(12);
      const withStar = solve(level, { requireStar: true });
      expect(withStar.solvable).toBe(true);
      expect(withStar.optimal).toBeLessThanOrEqual(level.par2);
    }
  });

  it('модификатор дня детерминирован и честно отражён в уровне', { timeout: 30_000 }, () => {
    for (const key of ['2026-07-19', '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24']) {
      const expected = dailyModifier(key);
      expect(dailyModifier(key)).toBe(expected); // чистая функция ключа
      const level = generateDaily(key);
      // Модификатор либо совпадает с предсказанным по дате, либо честно откатился на 'none'.
      expect(level.modifier === expected || level.modifier === 'none').toBe(true);
      expect(['none', 'noUndo', 'noHints', 'tightCrates']).toContain(level.modifier);
      if (level.modifier === 'tightCrates') {
        expect(level.pieces.some((p) => p.kind === 'crate')).toBe(true);
        for (const p of level.pieces) if (p.kind === 'crate') expect(p.maxMoves).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('серия дней', () => {
  it('первое прохождение — серия 1', () => {
    expect(advanceStreak(undefined, '2026-07-19')).toMatchObject({ last: '2026-07-19', streak: 1 });
  });

  it('подряд идущие дни наращивают серию', () => {
    const d1 = advanceStreak(undefined, '2026-07-19');
    const d2 = advanceStreak(d1, '2026-07-20');
    expect(d2).toMatchObject({ last: '2026-07-20', streak: 2 });
  });

  it('повтор в тот же день не меняет серию', () => {
    const d1 = advanceStreak(undefined, '2026-07-19');
    expect(advanceStreak(d1, '2026-07-19')).toEqual(d1);
  });

  it('пропуск дня сбрасывает серию', () => {
    const d1 = { last: '2026-07-17', streak: 5 };
    expect(advanceStreak(d1, '2026-07-19')).toMatchObject({ last: '2026-07-19', streak: 1 });
  });

  it('смена месяца/года считается подряд', () => {
    expect(advanceStreak({ last: '2026-12-31', streak: 3 }, '2027-01-01').streak).toBe(4);
  });

  it('currentStreak гаснет после пропуска', () => {
    const now = new Date('2026-07-19T10:00:00');
    expect(currentStreak({ last: todayKey(now), streak: 4 }, now)).toBe(4);
    expect(currentStreak({ last: yesterdayKey(now), streak: 4 }, now)).toBe(4);
    expect(currentStreak({ last: '2026-07-10', streak: 4 }, now)).toBe(0);
    expect(currentStreak(undefined, now)).toBe(0);
  });

  it('isDoneToday', () => {
    const now = new Date('2026-07-19T10:00:00');
    expect(isDoneToday({ last: todayKey(now), streak: 1 }, now)).toBe(true);
    expect(isDoneToday({ last: yesterdayKey(now), streak: 1 }, now)).toBe(false);
  });

  it('пять разных дней недели дают один кубок', () => {
    let state = advanceStreak(undefined, '2026-07-20');
    for (const day of ['2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24']) state = advanceStreak(state, day);
    expect(weeklyProgress(state, new Date('2026-07-24T12:00:00'))).toBe(5);
    expect(weeklyTrophies(state)).toBe(1);
    expect(advanceStreak(state, '2026-07-24')).toEqual(state);
  });
});
