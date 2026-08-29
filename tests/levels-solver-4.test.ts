import { describe, expect, it } from 'vitest';
import levelsJson from '../src/levels/levels.json';
import type { LevelDef } from '../src/core/types';
import { solveAsync } from '../src/core/solver';
import { SOLVER_SHARDS } from './solver-shards';

// Уровень 93 — самый тяжёлый для решателя в диапазоне 51–99, живёт в своём
// файле, чтобы не складываться с соседями и не подводить vitest-worker RPC.
const SHARD = SOLVER_SHARDS[3];
const LEVELS = (levelsJson as LevelDef[]).filter((l) => SHARD.match(l.id));

describe(`решатель ${SHARD.title}`, () => {
  for (const level of LEVELS) {
    it(`уровень ${level.id}: оптимум и 3 звезды достижимы`, { timeout: 60_000 }, async () => {
      // solveAsync() (не solve()) — BFS сам отдаёт event loop по времени внутри
      // поиска, иначе RPC-пинг репортёра (onTaskUpdate) не успевает достучаться
      // даже с внешним yield между вызовами (см. src/core/solver.ts).
      const result = await solveAsync(level);
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
        const withStar = await solveAsync(level, { requireStar: true });
        expect(withStar.solvable).toBe(true);
        expect(withStar.optimal).toBeLessThanOrEqual(level.par2);
      }
    });
  }
});
