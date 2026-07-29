import { describe, expect, it } from 'vitest';
import { applyMove, createState, exitSteps, gateOpen, buildGrid } from '../src/core/game';
import { solve } from '../src/core/solver';
import type { LevelDef } from '../src/core/types';
import { validateLevel } from '../src/core/validator';

/**
 * `holdType: 'held'` — ворота открыты, только пока клетка кнопки физически
 * занята. Кнопка нарочно НЕ на линии ворот (как и в старом `once`-режиме):
 * держатель H паркуется на кнопке (3,4), целевая машина едет по ряду 2.
 */
const HELD_LEVEL: LevelDef = {
  id: 0,
  name: 'gate-held-proto',
  width: 6,
  height: 6,
  exit: { side: 'right', index: 2 },
  pieces: [
    { id: 'T', kind: 'target', x: 0, y: 2, len: 2, dir: 'h' },
    { id: 'H', kind: 'car', x: 3, y: 0, len: 2, dir: 'v' }
  ],
  gateSwitch: { x: 3, y: 4, holdType: 'held' },
  par: 2,
  par2: 2,
  difficulty: 'easy',
  mechanics: ['gate-held']
};

describe('держащаяся кнопка ворот (holdType: held)', () => {
  it('вначале кнопка не занята — ворота закрыты, выезд недоступен', () => {
    const s = createState(HELD_LEVEL);
    expect(gateOpen(HELD_LEVEL, s, buildGrid(HELD_LEVEL, s))).toBe(false);
    expect(exitSteps(HELD_LEVEL, s)).toBe(-1);
  });

  it('держатель встал на кнопку — ворота открыты', () => {
    const s = createState(HELD_LEVEL);
    const r = applyMove(HELD_LEVEL, s, 1, 0, 1, 4); // H вниз: (3,0..1) -> (3,4..5), накрывает кнопку
    expect(r).not.toBeNull();
    expect(r!.state.pieces[1]).toMatchObject({ x: 3, y: 4 });
    expect(gateOpen(HELD_LEVEL, r!.state, buildGrid(HELD_LEVEL, r!.state))).toBe(true);
    expect(exitSteps(HELD_LEVEL, r!.state)).toBeGreaterThan(0);
  });

  it('держатель уехал с кнопки — ворота закрылись поверх ещё не выехавшей целевой', () => {
    let s = createState(HELD_LEVEL);
    s = applyMove(HELD_LEVEL, s, 1, 0, 1, 4)!.state; // H на кнопку
    expect(exitSteps(HELD_LEVEL, s)).toBeGreaterThan(0);
    s = applyMove(HELD_LEVEL, s, 1, 0, -1, 4)!.state; // H обратно вверх, кнопка свободна
    expect(gateOpen(HELD_LEVEL, s, buildGrid(HELD_LEVEL, s))).toBe(false);
    expect(exitSteps(HELD_LEVEL, s)).toBe(-1);
  });

  it('пока держатель на кнопке, целевая машина может полностью выехать', () => {
    let s = createState(HELD_LEVEL);
    s = applyMove(HELD_LEVEL, s, 1, 0, 1, 4)!.state; // H держит кнопку
    const k = exitSteps(HELD_LEVEL, s);
    const r = applyMove(HELD_LEVEL, s, 0, 1, 0, k);
    expect(r).not.toBeNull();
    expect(r!.exited).toBe(true);
    expect(r!.state.won).toBe(true);
  });

  it('уровень с held-кнопкой валиден и решается', () => {
    expect(validateLevel(HELD_LEVEL, { withSolver: true })).toEqual([]);
    const res = solve(HELD_LEVEL);
    expect(res.solvable).toBe(true);
  });

  it('регрессия: без holdType (default "once") поведение прежнее — держатель может уехать, ворота остаются открыты', () => {
    const onceLevel: LevelDef = { ...HELD_LEVEL, gateSwitch: { x: 3, y: 4 } };
    let s = createState(onceLevel);
    expect(s.gateUnlocked).toBe(false);
    s = applyMove(onceLevel, s, 1, 0, 1, 4)!.state; // H проезжает через кнопку
    expect(s.gateUnlocked).toBe(true);
    s = applyMove(onceLevel, s, 1, 0, -1, 4)!.state; // уехал обратно
    expect(gateOpen(onceLevel, s, buildGrid(onceLevel, s))).toBe(true); // sticky — по-прежнему открыто
    expect(exitSteps(onceLevel, s)).toBeGreaterThan(0);
  });

  it('явный holdType: "once" ведёт себя идентично отсутствию поля', () => {
    const explicitOnce: LevelDef = { ...HELD_LEVEL, gateSwitch: { x: 3, y: 4, holdType: 'once' } };
    let s = createState(explicitOnce);
    s = applyMove(explicitOnce, s, 1, 0, 1, 4)!.state;
    s = applyMove(explicitOnce, s, 1, 0, -1, 4)!.state;
    expect(gateOpen(explicitOnce, s, buildGrid(explicitOnce, s))).toBe(true);
  });
});
