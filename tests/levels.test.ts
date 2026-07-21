import { describe, expect, it } from 'vitest';
import levelsJson from '../src/levels/levels.json';
import type { LevelDef } from '../src/core/types';
import { validateLevel } from '../src/core/validator';

const LEVELS = levelsJson as LevelDef[];

describe('уровни игры', () => {
  it('ровно 100 уровней с уникальными id по порядку', () => {
    expect(LEVELS).toHaveLength(100);
    expect(LEVELS.map((l) => l.id)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  it('сложность кампании нигде не падает: каждый уровень не легче предыдущего', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].par).toBeGreaterThanOrEqual(LEVELS[i - 1].par);
    }
  });

  it('сложность сообщает реальный оптимум, а не только место в кампании', () => {
    const expected = (par: number): LevelDef['difficulty'] => {
      if (par <= 5) return 'easy';
      if (par <= 10) return 'medium';
      return 'hard';
    };
    for (const level of LEVELS) expect(level.difficulty).toBe(expected(level.par));
    expect(new Set(LEVELS.map((level) => level.difficulty))).toEqual(new Set(['easy', 'medium', 'hard']));
  });

  it('учебные уровни 5–6 требуют цепочку, а не один блокиратор', () => {
    for (const level of LEVELS.slice(4, 6)) {
      expect(level.par).toBeGreaterThanOrEqual(4);
      expect(level.pieces.filter((piece) => piece.kind !== 'target').length).toBeGreaterThanOrEqual(3);
    }
  });

  it('боссы не становятся легче предыдущего босса', () => {
    const bosses = LEVELS.filter((level) => level.id % 12 === 0).map((level) => level.par);
    for (let i = 1; i < bosses.length; i++) expect(bosses[i]).toBeGreaterThanOrEqual(bosses[i - 1]);
    expect(bosses.at(-1)).toBeGreaterThan(bosses.at(-2)!);
  });

  it('не содержит повторяющихся раскладок', () => {
    const signatures = LEVELS.map((level) =>
      JSON.stringify({
        width: level.width,
        height: level.height,
        exit: level.exit,
        pieces: level.pieces.map(({ kind, x, y, len, dir, maxMoves }) => ({ kind, x, y, len, dir, maxMoves })),
        walls: level.walls,
        star: level.star,
        gateSwitch: level.gateSwitch
      })
    );
    expect(new Set(signatures).size).toBe(LEVELS.length);
  });

  it('финальный босс не легче двух предыдущих уровней', () => {
    const final = LEVELS.at(-1)!;
    expect(final.par).toBeGreaterThanOrEqual(Math.max(LEVELS.at(-2)!.par, LEVELS.at(-3)!.par));
  });

  it('в срезе есть все заявленные механики', () => {
    const all = new Set(LEVELS.flatMap((l) => l.mechanics));
    expect(all).toContain('truck');
    expect(all).toContain('tractor');
    expect(all).toContain('crate');
    expect(all).toContain('star');
    expect(all).toContain('gate-switch');
  });

  for (const level of LEVELS) {
    describe(`уровень ${level.id} «${level.name}»`, () => {
      it('проходит валидатор', () => {
        expect(validateLevel(level)).toEqual([]);
      });

      it('механики соответствуют содержимому', () => {
        const kinds = new Set(level.pieces.map((p) => p.kind));
        for (const m of ['truck', 'tractor', 'crate'] as const) {
          expect(level.mechanics.includes(m)).toBe(kinds.has(m));
        }
        expect(level.mechanics.includes('star')).toBe(level.star !== undefined);
        expect(level.mechanics.includes('gate-switch')).toBe(level.gateSwitch !== undefined);
      });
    });
  }
});
