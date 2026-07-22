import { describe, expect, it } from 'vitest';
import levelsJson from '../src/levels/levels.json';
import type { LevelDef } from '../src/core/types';
import { solve } from '../src/core/solver';

// Уровень 93 — самый тяжёлый для решателя в диапазоне 51–99, живёт в своём
// файле, чтобы не складываться с соседями и не подводить vitest-worker RPC.
const LEVELS = (levelsJson as LevelDef[]).filter((l) => l.id === 93);

describe('решатель уровня 93', () => {
  for (const level of LEVELS) {
    it(`уровень ${level.id}: оптимум и 3 звезды достижимы`, { timeout: 60_000 }, () => {
      const result = solve(level);
      expect(result.solvable).toBe(true);
      expect(result.exhausted).toBe(false);
      expect(result.optimal).toBe(level.par);
      expect(level.par2).toBeGreaterThanOrEqual(level.par);
      const blockers = level.pieces.filter((piece) => piece.kind !== 'target').length;
      const movedBlockers = new Set(
        result.path
          .filter((move) => level.pieces[move.piece].kind !== 'target')
          .map((move) => level.pieces[move.piece].id)
      ).size;
      expect(movedBlockers * 2).toBeGreaterThanOrEqual(blockers);
      if (level.star) {
        const withStar = solve(level, { requireStar: true });
        expect(withStar.solvable).toBe(true);
        expect(withStar.optimal).toBeLessThanOrEqual(level.par2);
      }
    });
  }
});
