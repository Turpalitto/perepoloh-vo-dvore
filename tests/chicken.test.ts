import { describe, expect, it } from 'vitest';
import { applyMove, buildGrid, createState, EMPTY, WALL } from '../src/core/game';
import { solve } from '../src/core/solver';
import type { LevelDef } from '../src/core/types';
import { validateLevel } from '../src/core/validator';

/**
 * Курица: две фиксированные клетки A/B, детерминированное переключение
 * после каждого хода (любой фигуры), текущая клетка блокирует проезд.
 */
const CHICKEN_LEVEL: LevelDef = {
  id: 0,
  name: 'chicken-proto',
  width: 6,
  height: 6,
  exit: { side: 'right', index: 2 },
  pieces: [
    { id: 'T', kind: 'target', x: 0, y: 2, len: 2, dir: 'h' },
    { id: 'A', kind: 'car', x: 0, y: 0, len: 2, dir: 'h' }
  ],
  chickens: [{ a: { x: 4, y: 4 }, b: { x: 5, y: 5 } }],
  par: 1,
  par2: 1,
  difficulty: 'easy',
  mechanics: ['chicken']
};

describe('курица — блокировка клетки и переключение', () => {
  it('курица блокирует свою текущую клетку (A) в buildGrid', () => {
    const s = createState(CHICKEN_LEVEL);
    expect(s.chickenAt).toEqual(['a']);
    const grid = buildGrid(CHICKEN_LEVEL, s);
    expect(grid[4][4]).toBe(WALL);
    expect(grid[5][5]).toBe(EMPTY); // B пока не занята
  });

  it('после любого успешного хода курица переключается на B', () => {
    const s = createState(CHICKEN_LEVEL);
    // Ходит A (не целевая машина), курица всё равно переключается.
    const r = applyMove(CHICKEN_LEVEL, s, 1, 1, 0, 1);
    expect(r).not.toBeNull();
    expect(r!.state.chickenAt).toEqual(['b']);
    const grid = buildGrid(CHICKEN_LEVEL, r!.state);
    expect(grid[5][5]).toBe(WALL);
    expect(grid[4][4]).toBe(EMPTY);
  });

  it('два хода подряд возвращают курицу на A', () => {
    let s = createState(CHICKEN_LEVEL);
    s = applyMove(CHICKEN_LEVEL, s, 1, 1, 0, 1)!.state;
    s = applyMove(CHICKEN_LEVEL, s, 1, 1, 0, 1)!.state;
    expect(s.chickenAt).toEqual(['a']);
  });

  it('курица не переключается на клетку, занятую фигурой в этот момент', () => {
    // Собственный уровень: фигура C встанет ровно на B курицы после хода —
    // защитная гарантия должна остановить переключение, а не породить
    // нелегальное состояние с двумя объектами на одной клетке.
    const level: LevelDef = {
      id: 0,
      name: 'chicken-guard',
      width: 6,
      height: 6,
      exit: { side: 'right', index: 2 },
      pieces: [
        { id: 'T', kind: 'target', x: 0, y: 2, len: 2, dir: 'h' },
        { id: 'C', kind: 'car', x: 3, y: 0, len: 2, dir: 'v' }
      ],
      chickens: [{ a: { x: 0, y: 5 }, b: { x: 3, y: 2 } }],
      par: 1,
      par2: 1,
      difficulty: 'easy',
      mechanics: ['chicken']
    };
    const s = createState(level);
    // C двигается вниз так, что окажется на (3,2) — клетке B курицы.
    const r = applyMove(level, s, 1, 0, 1, 2);
    expect(r).not.toBeNull();
    expect(r!.state.pieces[1]).toMatchObject({ x: 3, y: 2 });
    // Курица должна остаться на A: переключение на занятую B пропущено.
    expect(r!.state.chickenAt).toEqual(['a']);
  });

  it('уровень с chickens валиден и решается', () => {
    expect(validateLevel(CHICKEN_LEVEL, { withSolver: true })).toEqual([]);
    const res = solve(CHICKEN_LEVEL);
    expect(res.solvable).toBe(true);
  });

  it('валидатор требует различные клетки A и B', () => {
    const same: LevelDef = { ...CHICKEN_LEVEL, chickens: [{ a: { x: 4, y: 4 }, b: { x: 4, y: 4 } }] };
    expect(validateLevel(same).join()).toContain('совпадают');
  });
});
