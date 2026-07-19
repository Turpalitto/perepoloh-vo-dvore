import { describe, expect, it } from 'vitest';
import type { PieceKind } from '../src/core/types';
import { validateLevel } from '../src/core/validator';
import { lvl, piece } from './helpers';

const T = () => piece('T', 'target', 0, 2, 'h');

describe('валидатор', () => {
  it('пропускает корректный уровень', () => {
    const level = lvl({ pieces: [T(), piece('A', 'car', 4, 1, 'v')], par: 2, par2: 3 });
    expect(validateLevel(level, { withSolver: true })).toEqual([]);
  });

  it('ловит выход за пределы поля', () => {
    const level = lvl({ pieces: [T(), piece('A', 'truck', 4, 4, 'v')] });
    expect(validateLevel(level).join()).toContain('выходит за поле');
  });

  it('ловит пересечение фигур', () => {
    const level = lvl({ pieces: [T(), piece('A', 'car', 1, 1, 'v')] }); // (1,1),(1,2) поверх T
    expect(validateLevel(level).join()).toContain('пересекается');
  });

  it('ловит отсутствие и дубли целевой машины', () => {
    expect(validateLevel(lvl({ pieces: [piece('A', 'car', 0, 0, 'h')] })).join()).toContain('целевых машин: 0');
    expect(
      validateLevel(lvl({ pieces: [T(), piece('T2', 'target', 0, 4, 'h')] })).join()
    ).toContain('целевых машин: 2');
  });

  it('ловит несоосность целевой машины и ворот', () => {
    const level = lvl({ pieces: [piece('T', 'target', 0, 3, 'h')] }); // ворота в ряду 2
    expect(validateLevel(level).join()).toContain('не на линии ворот');
  });

  it('ловит ворота вне поля', () => {
    const level = lvl({ pieces: [T()], exit: { side: 'right', index: 9 } });
    expect(validateLevel(level).join()).toContain('вне поля');
  });

  it('ловит неизвестный тип', () => {
    const bad = piece('X', 'car', 4, 4, 'h');
    (bad as { kind: PieceKind | 'ufo' }).kind = 'ufo';
    expect(validateLevel(lvl({ pieces: [T(), bad] })).join()).toContain('неизвестный тип');
  });

  it('ловит неправильные направления и лимиты', () => {
    expect(validateLevel(lvl({ pieces: [T(), piece('A', 'car', 4, 4, 'any')] })).join()).toContain(
      'направление'
    );
    expect(
      validateLevel(lvl({ pieces: [T(), piece('K', 'crate', 4, 4, 'any')] })).join()
    ).toContain('maxMoves');
  });

  it('ловит стену, навсегда перекрывающую ворота', () => {
    const level = lvl({ pieces: [T()], walls: [{ x: 4, y: 2, kind: 'barrel' }] });
    expect(validateLevel(level).join()).toContain('перекрывает путь к воротам');
  });

  it('ловит звезду на занятой клетке', () => {
    const level = lvl({ pieces: [T()], star: { x: 0, y: 2 } });
    expect(validateLevel(level).join()).toContain('звезда');
  });

  it('ловит непроходимость через решатель', () => {
    const level = lvl({
      pieces: [T(), piece('K', 'crate', 4, 2, 'any', { maxMoves: 1 })],
      walls: [
        { x: 4, y: 1, kind: 'hay' },
        { x: 4, y: 3, kind: 'hay' }
      ],
      par: 2,
      par2: 3
    });
    expect(validateLevel(level, { withSolver: true }).join()).toContain('непроходим');
  });

  it('ловит недостижимую звезду', () => {
    const level = lvl({
      pieces: [T()],
      star: { x: 5, y: 5 },
      par: 1,
      par2: 2
    });
    expect(validateLevel(level, { withSolver: true }).join()).toContain('звезду невозможно собрать');
  });

  it('ловит par2 < par', () => {
    const level = lvl({ pieces: [T()], par: 5, par2: 3 });
    expect(validateLevel(level).join()).toContain('par2');
  });
});
