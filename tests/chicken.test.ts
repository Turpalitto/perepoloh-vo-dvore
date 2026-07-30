import { describe, expect, it } from 'vitest';
import { applyMove, buildGrid, createState, EMPTY, WALL } from '../src/core/game';
import { solve } from '../src/core/solver';
import type { LevelDef } from '../src/core/types';
import { validateLevel } from '../src/core/validator';
import { chickenCarriesWeight } from '../src/core/chicken-impact';
import type { AblationOutcome } from '../src/core/ice-impact';

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

  it('перелёт сообщается в chickensHopped, пропуск такта — нет', () => {
    const s = createState(CHICKEN_LEVEL);
    const r = applyMove(CHICKEN_LEVEL, s, 1, 1, 0, 1);
    expect(r!.chickensHopped).toBe(true);
    // Уровень без кур вовсе — событию нечего сообщать.
    const noChickens: LevelDef = { ...CHICKEN_LEVEL, chickens: undefined };
    const plain = applyMove(noChickens, createState(noChickens), 1, 1, 0, 1);
    expect(plain!.chickensHopped).toBe(false);
  });
});

describe('несколько кур — независимые циклы', () => {
  // Каждая курица живёт своим циклом. Раньше это было только заявлено типами:
  // покрыт был случай одной курицы, а общий флаг/общая фаза сломали бы
  // мультикурином уровень молча.
  const TWO: LevelDef = {
    id: 0,
    name: 'chicken-two',
    width: 6,
    height: 6,
    exit: { side: 'right', index: 2 },
    pieces: [
      { id: 'T', kind: 'target', x: 0, y: 2, len: 2, dir: 'h' },
      { id: 'A', kind: 'car', x: 0, y: 0, len: 2, dir: 'h' }
    ],
    chickens: [
      { a: { x: 4, y: 4 }, b: { x: 5, y: 4 } },
      { a: { x: 1, y: 5 }, b: { x: 2, y: 5 } }
    ],
    par: 1,
    par2: 1,
    difficulty: 'easy',
    mechanics: ['chicken']
  };

  it('обе курицы блокируют свои текущие клетки', () => {
    const s = createState(TWO);
    expect(s.chickenAt).toEqual(['a', 'a']);
    const grid = buildGrid(TWO, s);
    expect(grid[4][4]).toBe(WALL);
    expect(grid[5][1]).toBe(WALL);
    expect(grid[4][5]).toBe(EMPTY);
    expect(grid[5][2]).toBe(EMPTY);
  });

  it('один ход переключает обе курицы, каждую в своей паре', () => {
    const s = createState(TWO);
    const r = applyMove(TWO, s, 1, 1, 0, 1);
    expect(r!.state.chickenAt).toEqual(['b', 'b']);
    const grid = buildGrid(TWO, r!.state);
    expect(grid[4][5]).toBe(WALL);
    expect(grid[5][2]).toBe(WALL);
    expect(grid[4][4]).toBe(EMPTY);
    expect(grid[5][1]).toBe(EMPTY);
  });

  it('заблокированная курица пропускает такт, не мешая остальным', () => {
    // C встанет ровно на клетку B первой курицы: она пропускает переключение,
    // вторая курица переключается как обычно — фазы расходятся.
    const level: LevelDef = {
      ...TWO,
      pieces: [
        { id: 'T', kind: 'target', x: 0, y: 2, len: 2, dir: 'h' },
        { id: 'C', kind: 'car', x: 5, y: 0, len: 2, dir: 'v' }
      ],
      chickens: [
        { a: { x: 4, y: 4 }, b: { x: 5, y: 2 } },
        { a: { x: 1, y: 5 }, b: { x: 2, y: 5 } }
      ]
    };
    const s = createState(level);
    const r = applyMove(level, s, 1, 0, 1, 1); // C: (5,0..1) -> (5,1..2), накрывает (5,2)
    expect(r).not.toBeNull();
    expect(r!.state.chickenAt).toEqual(['a', 'b']);
    // Перелёт всё равно был — у второй курицы.
    expect(r!.chickensHopped).toBe(true);
  });

  it('состояние обеих кур попадает в ключ решателя (фазы не путаются)', () => {
    const res = solve(TWO, { stateLimit: 50_000 });
    expect(res.solvable).toBe(true);
    expect(res.exhausted).toBe(false);
  });
});

describe('значимость курицы — правило «стеной не заменить»', () => {
  // Курица дороже стены: игрок обязан держать в голове, где она будет через
  // ход. Если задача решается так же со статичной стеной в A или в B, эта цена
  // не оплачена — механика на таком уровне пустая, как декоративный лёд.
  const proven: AblationOutcome = {
    solvableWithout: true,
    exhaustedWithout: false,
    optimalWithout: 9,
    role: 'проезд'
  };

  it('цикл, отличающийся от обоих статичных вариантов, несёт вес', () => {
    expect(chickenCarriesWeight(proven, 17, { a: 12, b: 9, exhausted: false })).toBe(true);
  });

  it('совпадение с любым статичным вариантом — курица подменяется стеной', () => {
    expect(chickenCarriesWeight(proven, 17, { a: 17, b: 9, exhausted: false })).toBe(false);
    expect(chickenCarriesWeight(proven, 17, { a: 12, b: 17, exhausted: false })).toBe(false);
  });

  it('исчерпанный статичный поиск ничего не доказывает', () => {
    expect(chickenCarriesWeight(proven, 17, { a: 12, b: 9, exhausted: true })).toBe(false);
  });

  it('без курицы не легче — декорация, даже если цикл отличается', () => {
    expect(
      chickenCarriesWeight({ ...proven, optimalWithout: 17 }, 17, { a: 12, b: 9, exhausted: false })
    ).toBe(false);
  });
});
