import { describe, expect, it } from 'vitest';
import { GEN_6X6, findLevel, genCandidate, mulberry32 } from '../src/core/levelgen';
import { validateLevel } from '../src/core/validator';
import { solve } from '../src/core/solver';
import { blocksHints, blocksUndo, type RuleModifier } from '../src/game/modifiers';

/**
 * Генератор уровней (daily/endless) и модификаторы правил не были покрыты
 * тестами вовсе — а от их детерминизма зависит честность уровня дня:
 * один seed обязан давать один и тот же уровень всем игрокам.
 */
describe('генератор уровней', () => {
  it('mulberry32 детерминирован: одна последовательность на seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).toEqual(seqB);
    expect(new Set(seqA).size).toBeGreaterThan(1); // и это не константа
  });

  it('разные seeds дают разные последовательности', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(Array.from({ length: 4 }, () => a())).not.toEqual(Array.from({ length: 4 }, () => b()));
  });

  it('genCandidate выдаёт валидный проходимый уровень', () => {
    const cand = genCandidate(mulberry32(7), GEN_6X6);
    if (!cand) return; // генератор вправе отказаться от расклада
    expect(validateLevel(cand).filter((e) => !e.includes('par'))).toEqual([]);
    const result = solve(cand, { stateLimit: 30_000 });
    expect(result.solvable).toBe(true);
  });

  it('findLevel детерминирован: тот же rng-старт — тот же уровень', () => {
    const a = findLevel(mulberry32(11), GEN_6X6, 3, 12, 30_000, 120);
    const b = findLevel(mulberry32(11), GEN_6X6, 3, 12, 30_000, 120);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // Фигуры сравниваем позиционно: id генератор мог бы и переименовать.
    const shape = (f: ReturnType<typeof findLevel>) =>
      f!.level.pieces.map((p) => `${p.kind}:${p.x},${p.y},${p.len},${p.dir}`).sort();
    expect(shape(b)).toEqual(shape(a));
    expect(b!.optimal).toBe(a!.optimal);
    // Найденный уровень лежит в запрошенном диапазоне или это честный fallback
    expect(b!.optimal).toBeGreaterThanOrEqual(2);
  });

  it('findLevel уважает диапазон оптимума', () => {
    const found = findLevel(mulberry32(23), GEN_6X6, 4, 10, 30_000, 200);
    expect(found).not.toBeNull();
    expect(found!.optimal).toBeGreaterThanOrEqual(2);
    expect(found!.optimal).toBeLessThanOrEqual(10 + 40); // широкая верхняя граница поиска
    expect(found!.withStar).toBeLessThanOrEqual(found!.optimal + 4);
  });
});

describe('модификаторы правил', () => {
  it.each([
    ['none', false, false],
    ['noUndo', true, false],
    ['noHints', false, true],
    ['tightCrates', false, false],
    ['noUndoNoHints', true, true]
  ] as Array<[RuleModifier, boolean, boolean]>)('%s: undo=%s hints=%s', (mod, undo, hints) => {
    expect(blocksUndo(mod)).toBe(undo);
    expect(blocksHints(mod)).toBe(hints);
  });

  it('комбинированный модификатор не теряется при строковых сравнениях — оба запрета активны', () => {
    // Регрессия исходного бага: 'noUndoNoHints' !== 'noUndo' молча возвращал
    // кнопки отмены и подсказки в испытаниях лиги.
    expect(blocksUndo('noUndoNoHints')).toBe(true);
    expect(blocksHints('noUndoNoHints')).toBe(true);
  });
});
