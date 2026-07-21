import { describe, expect, it } from 'vitest';
import { applyMove, createState, maxSteps } from '../src/core/game';
import { solve } from '../src/core/solver';
import type { LevelDef } from '../src/core/types';
import { validateLevel } from '../src/core/validator';

/**
 * Прототип «ледяной колеи»: остановиться на льду можно, только если дальше
 * в этом направлении ехать физически некуда. Тесты проверяют семантику
 * applyMove/maxSteps напрямую (руками просчитанные случаи), поскольку solver
 * — просто BFS поверх этих же функций: если они верны, поиск верен по построению.
 */

// 6×6, ворота справа на ряду 2, целевая машина одна на пустом поле,
// лёд лежит прямо на её линии выезда в клетке (3,2).
const ICE_LEVEL: LevelDef = {
  id: 0,
  name: 'ice-proto',
  width: 6,
  height: 6,
  exit: { side: 'right', index: 2 },
  pieces: [{ id: 'T', kind: 'target', x: 0, y: 2, len: 2, dir: 'h' }],
  ice: [{ x: 3, y: 2 }],
  par: 1,
  par2: 1,
  difficulty: 'easy',
  mechanics: ['ice']
};

describe('ледяная колея — семантика applyMove/maxSteps', () => {
  it('maxSteps не меняется льдом (лёд не блокирует ход, только запрещает произвольный стоп)', () => {
    const s = createState(ICE_LEVEL);
    // без стен/фигур путь свободен; limit включает полный выезд (len=2 сверху).
    expect(maxSteps(ICE_LEVEL, s, 0, 1, 0)).toBe(6);
  });

  it('нельзя остановиться так, что фигура окажется на льду, если дальше есть куда ехать', () => {
    const s = createState(ICE_LEVEL);
    // steps=2: клетки x=2,3 — x=3 это лёд; limit=6, 2<6 — есть куда ехать дальше → запрещено.
    expect(applyMove(ICE_LEVEL, s, 0, 1, 0, 2)).toBeNull();
    // steps=3: клетки x=3,4 — тоже задевает лёд (x=3) → запрещено.
    expect(applyMove(ICE_LEVEL, s, 0, 1, 0, 3)).toBeNull();
  });

  it('можно остановиться до льда или сразу после — там фигура его не занимает', () => {
    const s = createState(ICE_LEVEL);
    // steps=1: клетки x=1,2 — льда (x=3) не касается → разрешено.
    const r1 = applyMove(ICE_LEVEL, s, 0, 1, 0, 1);
    expect(r1).not.toBeNull();
    expect(r1!.state.pieces[0]).toMatchObject({ x: 1, y: 2 });
    // steps=4: клетки x=4,5 — лёд (x=3) уже позади → разрешено.
    const r4 = applyMove(ICE_LEVEL, s, 0, 1, 0, 4);
    expect(r4).not.toBeNull();
    expect(r4!.state.pieces[0]).toMatchObject({ x: 4, y: 2 });
  });

  it('полный выезд (steps === limit) разрешён независимо от льда на линии', () => {
    const s = createState(ICE_LEVEL);
    const r = applyMove(ICE_LEVEL, s, 0, 1, 0, 6);
    expect(r).not.toBeNull();
    expect(r!.exited).toBe(true);
    expect(r!.state.won).toBe(true);
  });

  it('частичный выезд по-прежнему недопустим сам по себе (steps=5), независимо от льда', () => {
    const s = createState(ICE_LEVEL);
    expect(applyMove(ICE_LEVEL, s, 0, 1, 0, 5)).toBeNull();
  });

  it('уровень с ice валиден и решатель находит оптимум за один ход (выезд игнорирует внутренний лёд)', () => {
    expect(validateLevel(ICE_LEVEL, { withSolver: true })).toEqual([]);
    const res = solve(ICE_LEVEL);
    expect(res).toMatchObject({ solvable: true, optimal: 1, exhausted: false });
  });

  it('без поля ice поведение идентично прежнему (нулевая регрессия для 100 уровней кампании)', () => {
    const noIce: LevelDef = { ...ICE_LEVEL, ice: undefined };
    const s = createState(noIce);
    // steps=2 и steps=3 теперь разрешены — лёд не мешает, потому что его нет.
    expect(applyMove(noIce, s, 0, 1, 0, 2)).not.toBeNull();
    expect(applyMove(noIce, s, 0, 1, 0, 3)).not.toBeNull();
    expect(maxSteps(noIce, s, 0, 1, 0)).toBe(6);
  });

  it('лёд, блокирующий обходной манёвр, меняет доступные точки остановки другой фигуры', () => {
    // Блокер стоит поперёк поля вертикально; лёд лежит на клетке, где он мог бы
    // «удобно» встать сразу под целевой линией. Ход по-прежнему стоит 1 (цена
    // хода не зависит от пройденных клеток), но конкретная итоговая позиция
    // блокера меняется — доказывает, что solver реально учитывает лёд при
    // выборе состояний, а не игнорирует его.
    const level: LevelDef = {
      id: 0,
      name: 'ice-detour',
      width: 6,
      height: 6,
      exit: { side: 'right', index: 2 },
      pieces: [
        { id: 'T', kind: 'target', x: 0, y: 2, len: 2, dir: 'h' },
        { id: 'A', kind: 'car', x: 2, y: 2, len: 2, dir: 'v' }
      ],
      ice: [{ x: 2, y: 4 }],
      par: 1,
      par2: 1,
      difficulty: 'easy',
      mechanics: ['ice']
    };
    expect(validateLevel(level, { withSolver: true })).toEqual([]);
    const s = createState(level);
    // A вниз на 1 клетку: клетки (2,3),(2,4) — (2,4) это лёд, а дальше (down max = 2) есть куда ехать → запрещено.
    expect(applyMove(level, s, 1, 0, 1, 1)).toBeNull();
    // A вниз на 2 (до упора) — разрешено (вынужденная остановка), хоть и тоже задевает лёд.
    const forced = applyMove(level, s, 1, 0, 1, 2);
    expect(forced).not.toBeNull();
    expect(forced!.state.pieces[1]).toMatchObject({ x: 2, y: 4 });
    // A вверх на 2 (до упора) — не касается льда вовсе, тоже разрешено.
    const alt = applyMove(level, s, 1, 0, -1, 2);
    expect(alt).not.toBeNull();
    expect(alt!.state.pieces[1]).toMatchObject({ x: 2, y: 0 });
  });
});
