import { describe, expect, it } from 'vitest';
import { applyMove, createState, maxSteps } from '../src/core/game';
import { solve } from '../src/core/solver';
import type { LevelDef } from '../src/core/types';
import { validateLevel } from '../src/core/validator';
import { analyzePlankImpact } from '../src/core/plank-impact';

/**
 * Хрупкая доска: как лёд — остановиться на целой доске нельзя, проехать
 * можно. Отличие — проезд её ломает, и сломанная доска становится стеной
 * (непроходима вовсе, а не просто «нельзя вставать»).
 */
const PLANK_LEVEL: LevelDef = {
  id: 0,
  name: 'plank-proto',
  width: 6,
  height: 6,
  exit: { side: 'right', index: 2 },
  pieces: [{ id: 'T', kind: 'target', x: 0, y: 2, len: 2, dir: 'h' }],
  planks: [{ x: 3, y: 2 }],
  par: 1,
  par2: 1,
  difficulty: 'easy',
  mechanics: ['plank']
};

describe('хрупкая доска — семантика applyMove/buildGrid', () => {
  it('целая доска не блокирует проезд, только запрещает остановку', () => {
    const s = createState(PLANK_LEVEL);
    expect(maxSteps(PLANK_LEVEL, s, 0, 1, 0)).toBe(6);
    expect(applyMove(PLANK_LEVEL, s, 0, 1, 0, 2)).toBeNull(); // клетки 2,3 — 3 доска
  });

  it('проезд ломает доску: brokenPlanks фиксирует клетку', () => {
    const s = createState(PLANK_LEVEL);
    const r = applyMove(PLANK_LEVEL, s, 0, 1, 0, 6); // полный выезд, прометает (3,2)
    expect(r).not.toBeNull();
    expect(r!.state.brokenPlanks).toEqual(['3,2']);
  });

  it('сломанная доска становится стеной — непроходима вовсе', () => {
    let s = createState(PLANK_LEVEL);
    const piece2: LevelDef = {
      ...PLANK_LEVEL,
      pieces: [
        { id: 'T', kind: 'target', x: 0, y: 2, len: 2, dir: 'h' },
        { id: 'A', kind: 'car', x: 1, y: 4, len: 2, dir: 'v' }
      ]
    };
    s = createState(piece2);
    // ломаем доску сдвигом A вниз через (3,2)? A не на той оси — упростим: ломаем T слегка вперёд-назад невозможно (T один выезд).
    // Проверяем напрямую через мутацию brokenPlanks (как после реального хода).
    const broken = { ...s, brokenPlanks: ['3,2'] };
    expect(maxSteps(piece2, broken, 0, 1, 0)).toBe(1); // упирается в сломанную (3,2) как в стену
  });

  it('уровень с planks валиден и решатель находит оптимум', () => {
    expect(validateLevel(PLANK_LEVEL, { withSolver: true })).toEqual([]);
    const res = solve(PLANK_LEVEL);
    expect(res).toMatchObject({ solvable: true, optimal: 1, exhausted: false });
  });

  it('без поля planks поведение идентично прежнему', () => {
    const noPlank: LevelDef = { ...PLANK_LEVEL, planks: undefined };
    const s = createState(noPlank);
    expect(applyMove(noPlank, s, 0, 1, 0, 2)).not.toBeNull();
  });

  it('доска меняет оптимум, если несёт вес', () => {
    const base: LevelDef = {
      id: 0,
      name: 'plank-depth',
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
      mechanics: ['plank']
    };
    const planked: LevelDef = { ...base, planks: [{ x: 3, y: 4 }] };
    expect(validateLevel(base, { withSolver: true })).toEqual([]);
    expect(validateLevel(planked, { withSolver: true })).toEqual([]);
    const plain = solve(base);
    const withPlank = solve(planked);
    expect(plain.solvable && withPlank.solvable).toBe(true);
    expect(withPlank.optimal).toBeGreaterThan(plain.optimal);
    const impact = analyzePlankImpact(planked);
    expect(impact.cells[0].required).toBe(true);
  });

  it('валидатор ловит доску на занятой клетке', () => {
    const onWall: LevelDef = { ...PLANK_LEVEL, walls: [{ x: 3, y: 2, kind: 'hay' }] };
    expect(validateLevel(onWall).join()).toContain('занятой клетке');
  });
});

describe('несколько досок на одном уровне', () => {
  // Типы разрешают массив досок, а покрыт был только случай одной. Ход,
  // прометающий сразу две доски, ломает обе — и `planksBroken` обязан
  // перечислить именно их, иначе UI отыграет одну поломку вместо двух.
  const TWO: LevelDef = {
    id: 0,
    name: 'plank-two',
    width: 6,
    height: 6,
    exit: { side: 'right', index: 2 },
    pieces: [{ id: 'T', kind: 'target', x: 0, y: 2, len: 2, dir: 'h' }],
    planks: [
      { x: 2, y: 2 },
      { x: 3, y: 2 }
    ],
    par: 1,
    par2: 1,
    difficulty: 'easy',
    mechanics: ['plank']
  };

  it('один ход через две доски ломает обе и сообщает обе в planksBroken', () => {
    const s = createState(TWO);
    const r = applyMove(TWO, s, 0, 1, 0, 6); // полный выезд прометает (2,2) и (3,2)
    expect(r).not.toBeNull();
    expect(r!.planksBroken.sort()).toEqual(['2,2', '3,2']);
    expect(r!.state.brokenPlanks.sort()).toEqual(['2,2', '3,2']);
  });

  it('уже сломанная доска не попадает в planksBroken второй раз', () => {
    const s = { ...createState(TWO), brokenPlanks: ['2,2'] };
    // (2,2) уже стена — фигура упирается в неё и дальше не едет.
    expect(maxSteps(TWO, s, 0, 1, 0)).toBe(0);
    // Ставим фигуру так, чтобы прометался только (3,2): целая доска ломается,
    // а уже сломанная в отчёт не попадает.
    const moved = { ...s, pieces: [{ x: 3, y: 2, used: 0, gone: false }] };
    const r = applyMove(TWO, moved, 0, 1, 0, 3);
    expect(r).not.toBeNull();
    expect(r!.planksBroken).toEqual(['3,2']);
  });

  it('каждая доска проверяется на значимость независимо', () => {
    const impact = analyzePlankImpact(TWO, { stateLimit: 50_000 });
    expect(impact.cells).toHaveLength(2);
    // Обе клетки перечислены и разобраны по отдельности — общий вердикт по
    // уровню не должен подменять поклеточный (поздняя доска способна сделать
    // раннюю избыточной, ровно как со льдом).
    expect(impact.cells.map((c) => `${c.cell.x},${c.cell.y}`)).toEqual(['2,2', '3,2']);
  });
});
