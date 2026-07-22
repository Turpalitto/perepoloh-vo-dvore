import { describe, expect, it } from 'vitest';
import levelsJson from '../src/levels/levels.json';
import type { LevelDef } from '../src/core/types';
import { solve } from '../src/core/solver';

const LEVELS = (levelsJson as LevelDef[]).slice(0, 50);

describe('решатель уровней 1–50', () => {
  for (const level of LEVELS) {
    const timeout = level.par >= 15 || level.pieces.length >= 13 ? 60_000 : 20_000;
    it(`уровень ${level.id}: оптимум и 3 звезды достижимы`, { timeout }, () => {
      const result = solve(level);
      expect(result.solvable).toBe(true);
      expect(result.exhausted).toBe(false);
      expect(result.optimal).toBe(level.par);
      expect(level.par2).toBeGreaterThanOrEqual(level.par);
      if (level.id >= 5) {
        const blockers = level.pieces.filter((piece) => piece.kind !== 'target').length;
        const movedBlockers = new Set(
          result.path
            .filter((move) => level.pieces[move.piece].kind !== 'target')
            .map((move) => level.pieces[move.piece].id)
        ).size;
        expect(movedBlockers * 2).toBeGreaterThanOrEqual(blockers);
      }
      if (level.star) {
        const withStar = solve(level, { requireStar: true });
        expect(withStar.solvable).toBe(true);
        expect(withStar.optimal).toBeLessThanOrEqual(level.par2);
      }
    });
  }
});
