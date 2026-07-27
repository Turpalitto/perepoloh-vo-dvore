import { describe, expect, it } from 'vitest';
import { applyMove, createState, maxSteps } from '../src/core/game';
import { solve } from '../src/core/solver';
import type { LevelDef } from '../src/core/types';
import { validateLevel } from '../src/core/validator';

/**
 * «Ледяная колея»: на льду нельзя остановиться вовсе — проехать насквозь
 * можно, встать нельзя. Тесты проверяют семантику applyMove/maxSteps напрямую
 * (руками просчитанные случаи), поскольку solver — просто BFS поверх этих же
 * функций: если они верны, поиск верен по построению.
 *
 * Прежняя редакция правила разрешала вынужденную остановку, и механика была
 * пустой: перебор всех одиночных постановок льда по уровням кампании давал
 * дельту оптимума ноль в 111 случаях из 111. Отдельный тест ниже фиксирует
 * главное следствие новой редакции — лёд умеет менять оптимум.
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
  it('maxSteps не меняется льдом (лёд не блокирует проезд, только запрещает остановку)', () => {
    const s = createState(ICE_LEVEL);
    // без стен/фигур путь свободен; limit включает полный выезд (len=2 сверху).
    expect(maxSteps(ICE_LEVEL, s, 0, 1, 0)).toBe(6);
  });

  it('нельзя остановиться так, что фигура окажется на льду', () => {
    const s = createState(ICE_LEVEL);
    // steps=2: клетки x=2,3 — x=3 это лёд → запрещено.
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

  it('полный выезд разрешён: фигура покидает поле и ни на чём не останавливается', () => {
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

  it('уровень с ice валиден и решатель находит оптимум за один ход', () => {
    expect(validateLevel(ICE_LEVEL, { withSolver: true })).toEqual([]);
    const res = solve(ICE_LEVEL);
    expect(res).toMatchObject({ solvable: true, optimal: 1, exhausted: false });
  });

  it('без поля ice поведение идентично прежнему (нулевая регрессия для уровней кампании)', () => {
    const noIce: LevelDef = { ...ICE_LEVEL, ice: undefined };
    const s = createState(noIce);
    // steps=2 и steps=3 теперь разрешены — лёд не мешает, потому что его нет.
    expect(applyMove(noIce, s, 0, 1, 0, 2)).not.toBeNull();
    expect(applyMove(noIce, s, 0, 1, 0, 3)).not.toBeNull();
    expect(maxSteps(noIce, s, 0, 1, 0)).toBe(6);
  });

  it('вынужденная остановка на льду тоже запрещена — упор в препятствие не оправдание', () => {
    // Блокер A может съехать вниз ровно до упора в нижний край, и обе конечные
    // клетки этого съезда — лёд. Прежняя редакция правила такой ход разрешала
    // («ехать дальше некуда»), новая — нет: полоса вниз для A закрыта, и
    // единственный способ освободить ряд ворот — увести A вверх.
    const level: LevelDef = {
      id: 0,
      name: 'ice-forced',
      width: 6,
      height: 6,
      exit: { side: 'right', index: 2 },
      pieces: [
        { id: 'T', kind: 'target', x: 0, y: 2, len: 2, dir: 'h' },
        { id: 'A', kind: 'car', x: 2, y: 2, len: 2, dir: 'v' }
      ],
      ice: [
        { x: 2, y: 4 },
        { x: 2, y: 5 }
      ],
      par: 2,
      par2: 2,
      difficulty: 'easy',
      mechanics: ['ice']
    };
    const s = createState(level);
    // A вниз на 1: клетки (2,3),(2,4) — (2,4) лёд → запрещено.
    expect(applyMove(level, s, 1, 0, 1, 1)).toBeNull();
    // A вниз на 2 (до упора в край): клетки (2,4),(2,5) — обе лёд → запрещено.
    expect(applyMove(level, s, 1, 0, 1, 2)).toBeNull();
    // Вверх лёд не мешает: (2,0),(2,1) чисты.
    const up = applyMove(level, s, 1, 0, -1, 2);
    expect(up).not.toBeNull();
    expect(up!.state.pieces[1]).toMatchObject({ x: 2, y: 0 });
  });

  it('лёд меняет оптимум: он отнимает позицию покоя, а не только вариант хода', () => {
    // Ряд ворот перекрыт машиной A. Вниз ей ехать дёшево: один ход — и выезд
    // свободен, оптимум 2 хода. Вверх мешает B, которую сперва надо увести.
    // Лёд лежит внизу так, что ни одна из тамошних позиций покоя A не годится
    // (ни промежуточная, ни до упора в край), — дешёвый путь закрыт целиком, и
    // остаётся длинный: сначала B, потом A. Оптимум растёт.
    const base: LevelDef = {
      id: 0,
      name: 'ice-depth',
      width: 6,
      height: 6,
      exit: { side: 'right', index: 2 },
      pieces: [
        { id: 'T', kind: 'target', x: 0, y: 2, len: 2, dir: 'h' },
        { id: 'A', kind: 'car', x: 3, y: 2, len: 2, dir: 'v' },
        { id: 'B', kind: 'car', x: 3, y: 0, len: 2, dir: 'h' }
      ],
      par: 2,
      par2: 2,
      difficulty: 'easy',
      mechanics: ['ice']
    };
    const iced: LevelDef = { ...base, ice: [{ x: 3, y: 4 }] };

    expect(validateLevel(base, { withSolver: true })).toEqual([]);
    expect(validateLevel(iced, { withSolver: true })).toEqual([]);

    const plain = solve(base);
    const withIce = solve(iced);
    expect(plain.solvable && withIce.solvable).toBe(true);
    expect(withIce.optimal).toBeGreaterThan(plain.optimal);
  });
});
