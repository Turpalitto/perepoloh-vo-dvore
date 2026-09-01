import { describe, expect, it } from 'vitest';
import { solveAsync } from '../src/core/solver';
import { validateLevel } from '../src/core/validator';
import { endlessFloor, generateEndless } from '../src/game/endless';

/**
 * Самая тяжёлая проверка Endless вынесена в отдельный vitest-процесс.
 *
 * На GitHub runner весь прежний `endless.test.ts` занимал 61,6 секунды и
 * пересекал жёсткий 60-секундный RPC timeout Vitest (`onTaskUpdate`), хотя
 * каждый тест и все assertions успевали пройти. Отдельный файл освобождает
 * процесс и сообщает результат раньше лимита, не ослабляя саму проверку.
 */
describe('бесконечный двор — нажимная кнопка ворот', () => {
  it('генерируется и остаётся проверенной решателем', { timeout: 120_000 }, async () => {
    let gated: ReturnType<typeof generateEndless> | null = null;
    for (let seed = 1; seed <= 20 && !gated; seed++) {
      const level = generateEndless(8, seed * 3300);
      expect(validateLevel(level)).toEqual([]);
      const plain = await solveAsync(level);
      expect(plain.solvable).toBe(true);
      expect(plain.exhausted).toBe(false);
      expect(level.par).toBe(plain.optimal);
      expect(level.par).toBeGreaterThanOrEqual(endlessFloor(8));
      if (level.star) {
        const withStar = await solveAsync(level, { requireStar: true });
        expect(withStar.solvable).toBe(true);
        expect(withStar.optimal).toBeLessThanOrEqual(level.par2);
      }
      if (level.gateSwitch) gated = level;
    }
    expect(gated, 'ни один seed не дал уровень с кнопкой ворот').not.toBeNull();
    expect(gated!.mechanics).toContain('gate-switch');
    expect(gated!.gateSwitch).toBeDefined();
  });
});
