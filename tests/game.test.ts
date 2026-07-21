import { describe, expect, it } from 'vitest';
import {
  applyMove,
  buildGrid,
  cloneState,
  createState,
  EMPTY,
  exitSteps,
  maxSteps,
  pieceCells,
  starsFor,
  WALL
} from '../src/core/game';
import { lvl, piece } from './helpers';

describe('сетка и клетки', () => {
  it('строит сетку с фигурами и стенами', () => {
    const level = lvl({
      pieces: [piece('T', 'target', 0, 2, 'h'), piece('A', 'truck', 3, 0, 'v')],
      walls: [{ x: 5, y: 5, kind: 'hay' }]
    });
    const g = buildGrid(level, createState(level));
    expect(g[2][0]).toBe(0);
    expect(g[2][1]).toBe(0);
    expect(g[0][3]).toBe(1);
    expect(g[1][3]).toBe(1);
    expect(g[2][3]).toBe(1);
    expect(g[5][5]).toBe(WALL);
    expect(g[0][0]).toBe(EMPTY);
  });

  it('pieceCells пустой для выехавшей машины', () => {
    const def = piece('T', 'target', 0, 2, 'h');
    expect(pieceCells(def, { x: 6, y: 2, gone: true })).toEqual([]);
  });
});

describe('maxSteps', () => {
  const level = lvl({
    pieces: [
      piece('T', 'target', 0, 2, 'h'),
      piece('A', 'car', 4, 1, 'v'), // (4,1),(4,2)
      piece('B', 'car', 0, 4, 'h') // (0,4),(1,4)
    ],
    walls: [{ x: 3, y: 4, kind: 'barrel' }]
  });
  const s = createState(level);

  it('останавливается перед фигурой', () => {
    // T вправо: (2,2),(3,2) свободны, (4,2) занята A
    expect(maxSteps(level, s, 0, 1, 0)).toBe(2);
  });

  it('останавливается перед стеной', () => {
    // B вправо: (2,4) свободна, (3,4) стена
    expect(maxSteps(level, s, 2, 1, 0)).toBe(1);
  });

  it('не двигается поперёк оси', () => {
    expect(maxSteps(level, s, 0, 0, 1)).toBe(0);
    expect(maxSteps(level, s, 1, 1, 0)).toBe(0);
  });

  it('край поля ограничивает обычную фигуру', () => {
    expect(maxSteps(level, s, 1, 0, -1)).toBe(1); // A вверх до края
  });

  it('целевая на линии ворот получает шаги полного выезда', () => {
    const free = lvl({ pieces: [piece('T', 'target', 3, 2, 'h')] });
    // lead (4,2): (5,2) свободна → 1, дальше край + len 2 → всего 3
    expect(maxSteps(free, createState(free), 0, 1, 0)).toBe(3);
  });
});

describe('applyMove', () => {
  it('двигает, считает ход, не мутирует исходное состояние', () => {
    const level = lvl({ pieces: [piece('T', 'target', 0, 2, 'h'), piece('A', 'car', 4, 1, 'v')] });
    const s = createState(level);
    const r = applyMove(level, s, 1, 0, 1, 2)!;
    expect(r).not.toBeNull();
    expect(r.state.pieces[1]).toMatchObject({ x: 4, y: 3 });
    expect(r.state.moves).toBe(1);
    expect(s.pieces[1].y).toBe(1);
    expect(s.moves).toBe(0);
  });

  it('отклоняет ход сквозь препятствие и нулевой ход', () => {
    const level = lvl({ pieces: [piece('T', 'target', 0, 2, 'h'), piece('A', 'car', 4, 1, 'v')] });
    const s = createState(level);
    expect(applyMove(level, s, 0, 1, 0, 3)).toBeNull(); // сквозь A
    expect(applyMove(level, s, 0, 1, 0, 0)).toBeNull();
  });

  it('ящик двигается по обеим осям и тратит лимит', () => {
    const level = lvl({
      pieces: [piece('T', 'target', 0, 2, 'h'), piece('K', 'crate', 4, 2, 'any', { maxMoves: 1 })]
    });
    const s = createState(level);
    expect(maxSteps(level, s, 1, 0, 1)).toBeGreaterThan(0);
    expect(maxSteps(level, s, 1, 1, 0)).toBeGreaterThan(0);
    const r = applyMove(level, s, 1, 0, 1, 1)!;
    expect(r.state.pieces[1].used).toBe(1);
    expect(maxSteps(level, r.state, 1, 0, 1)).toBe(0); // лимит исчерпан
    expect(applyMove(level, r.state, 1, 0, -1, 1)).toBeNull();
  });

  it('собирает звезду с прометённой клетки, один раз', () => {
    const level = lvl({
      pieces: [piece('T', 'target', 0, 2, 'h'), piece('A', 'car', 4, 0, 'v')],
      star: { x: 4, y: 3 }
    });
    const s = createState(level);
    const short = applyMove(level, s, 1, 0, 1, 1)!; // (4,1),(4,2) — не дотянулись
    expect(short.starCollected).toBe(false);
    const long = applyMove(level, s, 1, 0, 1, 2)!; // прометает (4,3)
    expect(long.starCollected).toBe(true);
    expect(long.state.starCollected).toBe(true);
    // повторный проезд не «собирает» снова
    const back = applyMove(level, long.state, 1, 0, -1, 2)!;
    expect(back.starCollected).toBe(false);
    expect(back.state.starCollected).toBe(true);
  });
});

describe('выезд и победа', () => {
  const level = lvl({ pieces: [piece('T', 'target', 3, 2, 'h')] });

  it('exitSteps считает полный выезд', () => {
    expect(exitSteps(level, createState(level))).toBe(3);
  });

  it('exitSteps = -1 при заблокированных воротах', () => {
    const blocked = lvl({ pieces: [piece('T', 'target', 0, 2, 'h'), piece('A', 'car', 4, 1, 'v')] });
    expect(exitSteps(blocked, createState(blocked))).toBe(-1);
  });

  it('частичный выезд запрещён, полный — победа', () => {
    const s = createState(level);
    expect(applyMove(level, s, 0, 1, 0, 2)).toBeNull(); // наполовину в воротах
    const r = applyMove(level, s, 0, 1, 0, 3)!;
    expect(r.exited).toBe(true);
    expect(r.state.won).toBe(true);
    expect(r.state.pieces[0].gone).toBe(true);
    // после победы ходов нет
    expect(applyMove(level, r.state, 0, -1, 0, 1)).toBeNull();
  });

  it('звезда на линии ворот собирается при выезде', () => {
    const withStar = lvl({ pieces: [piece('T', 'target', 3, 2, 'h')], star: { x: 5, y: 2 } });
    const r = applyMove(withStar, createState(withStar), 0, 1, 0, 3)!;
    expect(r.starCollected).toBe(true);
  });
});

describe('нажимная кнопка ворот', () => {
  const level = lvl({
    pieces: [piece('T', 'target', 3, 2, 'h'), piece('A', 'car', 0, 0, 'v')],
    gateSwitch: { x: 0, y: 3 },
    mechanics: ['gate-switch']
  });

  it('не выпускает цель до активации и срабатывает при проезде любой машины', () => {
    const start = createState(level);
    expect(start.gateUnlocked).toBe(false);
    expect(exitSteps(level, start)).toBe(-1);

    const pressed = applyMove(level, start, 1, 0, 1, 3)!;
    expect(pressed.gateActivated).toBe(true);
    expect(pressed.state.gateUnlocked).toBe(true);
    expect(exitSteps(level, pressed.state)).toBe(3);

    const exit = applyMove(level, pressed.state, 0, 1, 0, 3)!;
    expect(exit.state.won).toBe(true);
  });

  it('состояние кнопки участвует в независимом клоне для отмены хода', () => {
    const start = createState(level);
    const pressed = applyMove(level, start, 1, 0, 1, 3)!.state;
    const copy = cloneState(pressed);
    copy.gateUnlocked = false;
    expect(pressed.gateUnlocked).toBe(true);
  });
});

describe('cloneState (основа undo)', () => {
  it('клон независим', () => {
    const level = lvl({ pieces: [piece('T', 'target', 0, 2, 'h')] });
    const s = createState(level);
    const c = cloneState(s);
    c.pieces[0].x = 5;
    c.moves = 10;
    expect(s.pieces[0].x).toBe(0);
    expect(s.moves).toBe(0);
  });
});

describe('starsFor', () => {
  const noStar = lvl({ par: 4, par2: 6 });
  const withStar = lvl({ par: 4, par2: 6, star: { x: 0, y: 0 } });

  it('без звезды на поле: 3★ за оптимум', () => {
    expect(starsFor(noStar, 4, false)).toBe(3);
    expect(starsFor(noStar, 6, false)).toBe(2);
    expect(starsFor(noStar, 7, false)).toBe(1);
  });

  it('со звездой: 3★ = собрать и уложиться в par2', () => {
    expect(starsFor(withStar, 6, true)).toBe(3);
    expect(starsFor(withStar, 4, false)).toBe(2);
    expect(starsFor(withStar, 7, true)).toBe(1);
  });
});
