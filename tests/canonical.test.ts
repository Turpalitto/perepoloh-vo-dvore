import { describe, expect, it } from 'vitest';
import levelsJson from '../src/levels/levels.json';
import type { LevelDef } from '../src/core/types';
import { canonicalKey, findSimilarLevels } from '../src/core/canonical';
import { validateLevel } from '../src/core/validator';

const LEVELS = levelsJson as LevelDef[];
const byId = (id: number) => LEVELS.find((l) => l.id === id)!;

/** Горизонтальное зеркало уровня: валидная трансформация правил игры. */
function mirrorX(level: LevelDef): LevelDef {
  const w = level.width;
  const flipPiece = (p: LevelDef['pieces'][number]) => ({
    ...p,
    x: p.dir === 'h' ? w - p.len - p.x : w - 1 - p.x
  });
  const flipCell = <T extends { x: number; y: number }>(c: T): T => ({ ...c, x: w - 1 - c.x });
  const exit =
    level.exit.side === 'left'
      ? { ...level.exit, side: 'right' as const }
      : level.exit.side === 'right'
        ? { ...level.exit, side: 'left' as const }
        : { ...level.exit, index: w - 1 - level.exit.index };
  return {
    ...level,
    exit,
    pieces: level.pieces.map(flipPiece),
    walls: level.walls?.map(flipCell),
    star: level.star ? flipCell(level.star) : undefined,
    gateSwitch: level.gateSwitch ? flipCell(level.gateSwitch) : undefined,
    ice: level.ice?.map(flipCell)
  };
}

describe('каноническое представление уровней', () => {
  it('переименование фигур и перестановка порядка не меняют канон', () => {
    const level = byId(10);
    const renamed: LevelDef = {
      ...level,
      pieces: [...level.pieces].reverse().map((p, i) => ({ ...p, id: `renamed-${i}` }))
    };
    expect(canonicalKey(renamed)).toBe(canonicalKey(level));
  });

  it('зеркальная копия распознаётся как дубликат', () => {
    const level = byId(12);
    const mirrored = mirrorX(level);
    // зеркало остаётся валидным уровнем — иначе сравнение бессмысленно
    expect(validateLevel(mirrored)).toEqual([]);
    expect(canonicalKey(mirrored)).toBe(canonicalKey(level));
  });

  it('разные уровни имеют разные ключи', () => {
    expect(canonicalKey(byId(1))).not.toBe(canonicalKey(byId(2)));
  });

  it('канон детерминирован', () => {
    expect(canonicalKey(byId(50))).toBe(canonicalKey(byId(50)));
  });

  it('почти-дубликат находится: один сдвинутый блокер', () => {
    const level = byId(20);
    const moved = LEVELS.map((l) => l);
    // сдвигаем одну не-целевую фигуру в свободную клетку не меняя остального
    const clone: LevelDef = JSON.parse(JSON.stringify(level));
    clone.id = 9999;
    const victim = clone.pieces.find((p) => p.kind !== 'target')!;
    victim.id = 'shifted';
    const pairs = findSimilarLevels([...moved, clone], 0.85);
    const hit = pairs.find((p) => (p.a === level.id && p.b === 9999) || (p.a === 9999 && p.b === level.id));
    expect(hit).toBeDefined();
    expect(hit!.similarity).toBeGreaterThanOrEqual(0.85);
  });

  it('в кампании нет точных логических дубликатов', () => {
    const exact = findSimilarLevels(LEVELS).filter((p) => p.similarity === 1);
    expect(exact).toEqual([]);
  });
});
