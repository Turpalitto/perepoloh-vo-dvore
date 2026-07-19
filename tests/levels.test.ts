import { describe, expect, it } from 'vitest';
import levelsJson from '../src/levels/levels.json';
import type { LevelDef } from '../src/core/types';
import { solve } from '../src/core/solver';
import { validateLevel } from '../src/core/validator';

const LEVELS = levelsJson as LevelDef[];

describe('уровни игры', () => {
  it('ровно 36 уровней с уникальными id по порядку', () => {
    expect(LEVELS).toHaveLength(36);
    expect(LEVELS.map((l) => l.id)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
  });

  it('сложность не убывает и есть все три ступени', () => {
    const rank = { easy: 0, medium: 1, hard: 2 };
    const seq = LEVELS.map((l) => rank[l.difficulty]);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
    expect(new Set(seq).size).toBe(3);
  });

  it('в срезе есть все заявленные механики', () => {
    const all = new Set(LEVELS.flatMap((l) => l.mechanics));
    expect(all).toContain('truck');
    expect(all).toContain('tractor');
    expect(all).toContain('crate');
    expect(all).toContain('star');
  });

  for (const level of LEVELS) {
    describe(`уровень ${level.id} «${level.name}»`, () => {
      it('проходит валидатор', () => {
        expect(validateLevel(level)).toEqual([]);
      });

      it('проходим, par равен оптимуму решателя', () => {
        const res = solve(level);
        expect(res.solvable).toBe(true);
        expect(res.exhausted).toBe(false);
        expect(res.optimal).toBe(level.par);
        expect(level.par2).toBeGreaterThanOrEqual(level.par);
      });

      it('3 звезды достижимы', () => {
        if (level.star) {
          const withStar = solve(level, { requireStar: true });
          expect(withStar.solvable).toBe(true);
          expect(withStar.optimal).toBeLessThanOrEqual(level.par2);
        }
      });

      it('механики соответствуют содержимому', () => {
        const kinds = new Set(level.pieces.map((p) => p.kind));
        for (const m of ['truck', 'tractor', 'crate'] as const) {
          expect(level.mechanics.includes(m)).toBe(kinds.has(m));
        }
        expect(level.mechanics.includes('star')).toBe(level.star !== undefined);
      });
    });
  }
});
