import { describe, expect, it } from 'vitest';
import { yieldToEventLoop } from './helpers';
import {
  ENDLESS_MILESTONE_STEP,
  endlessConfig,
  endlessFloor,
  endlessMilestoneHints,
  endlessMultiplier,
  generateEndless
} from '../src/game/endless';
import { solve } from '../src/core/solver';
import { validateLevel } from '../src/core/validator';

/** Проверяет, что сгенерированный уровень корректен и его par честный. */
function assertVerified(streak: number, seed: number): ReturnType<typeof generateEndless> {
  const level = generateEndless(streak, seed);
  expect(validateLevel(level)).toEqual([]);
  const plain = solve(level);
  expect(plain.solvable).toBe(true);
  expect(plain.exhausted).toBe(false);
  // par в JSON обязан совпадать с оптимумом решателя — тот же инвариант, что в кампании.
  expect(level.par).toBe(plain.optimal);
  expect(level.par).toBeGreaterThanOrEqual(endlessFloor(streak));
  if (level.star) {
    const withStar = solve(level, { requireStar: true });
    expect(withStar.solvable).toBe(true);
    // третья звезда достижима в пределах порога par2.
    expect(withStar.optimal).toBeLessThanOrEqual(level.par2);
  }
  return level;
}

describe('бесконечный двор', () => {
  it('сложность растёт по серии и не превышает потолок', () => {
    expect(endlessFloor(0)).toBe(4);
    expect(endlessFloor(4)).toBe(8); // потолок
    expect(endlessFloor(20)).toBe(8);
    expect(endlessConfig(0).width).toBe(6);
    expect(endlessConfig(0).gateChance).toBe(0);
    expect(endlessConfig(8).width).toBe(6); // всегда 6×6 ради скорости генерации
    expect(endlessConfig(8).gateChance ?? 0).toBeGreaterThan(0);
    expect(endlessConfig(8).pieceMax).toBeGreaterThan(endlessConfig(0).pieceMax); // плотнее
  });

  it('генерирует проверенные решателем уровни на разных сериях', { timeout: 90_000 }, async () => {
    for (const streak of [0, 2, 5, 8]) {
      assertVerified(streak, 12345 + streak * 777);
      await yieldToEventLoop();
    }
  });

  it('детерминирован по seed', { timeout: 30_000 }, () => {
    const a = generateEndless(3, 424242);
    const b = generateEndless(3, 424242);
    expect(a).toEqual(b);
    const c = generateEndless(3, 999983);
    expect(c).not.toEqual(a); // другой seed — другой расклад
  });

  it('на первых уровнях кнопки ворот нет', { timeout: 30_000 }, () => {
    for (let seed = 1; seed <= 6; seed++) {
      expect(generateEndless(0, seed * 101).gateSwitch).toBeUndefined();
    }
  });

  it('умеет вводить нажимную кнопку ворот, сохраняя проходимость', { timeout: 120_000 }, async () => {
    let gated: ReturnType<typeof generateEndless> | null = null;
    for (let seed = 1; seed <= 20 && !gated; seed++) {
      const level = assertVerified(8, seed * 3300);
      if (level.gateSwitch) gated = level;
      await yieldToEventLoop();
    }
    expect(gated, 'ни один seed не дал уровень с кнопкой ворот').not.toBeNull();
    expect(gated!.mechanics).toContain('gate-switch');
    expect(gated!.gateSwitch).toBeDefined();
  });
});

describe('множитель серии и этапы (Stage C)', () => {
  it('множитель растёт по границам тиров сложности', () => {
    expect(endlessMultiplier(0)).toBe(1);
    expect(endlessMultiplier(5)).toBe(1);
    expect(endlessMultiplier(6)).toBe(2);
    expect(endlessMultiplier(9)).toBe(2);
    expect(endlessMultiplier(10)).toBe(3);
    expect(endlessMultiplier(25)).toBe(3);
  });

  it('бонус подсказками даётся только на каждом 4-м уровне и равен множителю', () => {
    expect(ENDLESS_MILESTONE_STEP).toBe(4);
    expect(endlessMilestoneHints(0)).toBe(0);
    expect(endlessMilestoneHints(3)).toBe(0);
    expect(endlessMilestoneHints(4)).toBe(1);
    expect(endlessMilestoneHints(5)).toBe(0);
    expect(endlessMilestoneHints(8)).toBe(2);
    expect(endlessMilestoneHints(12)).toBe(3);
    expect(endlessMilestoneHints(20)).toBe(3);
    // Отрицательная серия — мусор, бонуса нет.
    expect(endlessMilestoneHints(-4)).toBe(0);
  });
});
