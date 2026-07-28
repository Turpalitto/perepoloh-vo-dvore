/**
 * Вклад каждой ледяной клетки в головоломку — постфактум, по готовому уровню.
 *
 * Генератор ставит лёд жадно и доказывает вклад клетки в момент постановки.
 * Этого мало: поздняя клетка способна сделать раннюю избыточной, и набор в
 * целом окажется слабее, чем выглядел по ходу сборки. Поэтому итоговый уровень
 * разбирается заново — каждая клетка убирается по отдельности.
 *
 * Роль клетки важна не меньше цифры. Лёд работает двумя разными способами:
 * «проезд» — оптимальный ход идёт по клетке насквозь; «запрет стоянки» — без
 * клетки короткое решение паркуется ровно на ней. Клетка без роли декоративная,
 * даже если оптимум формально просел: игрок не увидит, за что он платит ходами.
 */
import type { IceDef, LevelDef } from './types';
import { createState, pieceCells } from './game';
import { type SolveMove, solve } from './solver';

export type IceCellRole = 'проезд' | 'запрет стоянки' | 'нет роли';

export interface IceCellImpact {
  cell: IceDef;
  /** Оптимум уровня без этой клетки (-1, если стал нерешаемым). */
  optimalWithout: number;
  solvableWithout: boolean;
  role: IceCellRole;
  /** Клетка несёт вес: без неё задача мельчает и роль в решении есть. */
  required: boolean;
}

export interface IceImpact {
  fullOptimal: number;
  solvable: boolean;
  exhausted: boolean;
  /** Оптимальный ход останавливается на льду (расхождение решателя и правил). */
  landsOnIce: boolean;
  cells: IceCellImpact[];
}

/** Клетки, пройденные фигурой за ход, включая стартовую и конечную позиции. */
function sweptKeys(level: LevelDef, path: SolveMove[]): Set<string> {
  const keys = new Set<string>();
  let state = createState(level);
  for (const move of path) {
    const def = level.pieces[move.piece];
    const from = state.pieces[move.piece];
    for (let t = 0; t <= move.steps; t++) {
      for (const c of pieceCells(def, { x: from.x + move.dx * t, y: from.y + move.dy * t, gone: false })) {
        keys.add(`${c.x},${c.y}`);
      }
    }
    const next = { ...state, pieces: state.pieces.map((p) => ({ ...p })) };
    next.pieces[move.piece] = { ...from, x: from.x + move.dx * move.steps, y: from.y + move.dy * move.steps };
    state = next;
  }
  return keys;
}

/** Конечные позиции каждого хода — где фигуры реально встают. */
function landingKeys(level: LevelDef, path: SolveMove[]): Set<string> {
  const keys = new Set<string>();
  let state = createState(level);
  for (const move of path) {
    const def = level.pieces[move.piece];
    const from = state.pieces[move.piece];
    const to = { x: from.x + move.dx * move.steps, y: from.y + move.dy * move.steps, gone: false };
    for (const c of pieceCells(def, to)) keys.add(`${c.x},${c.y}`);
    const next = { ...state, pieces: state.pieces.map((p) => ({ ...p })) };
    next.pieces[move.piece] = { ...from, x: to.x, y: to.y };
    state = next;
  }
  return keys;
}

export function analyzeIceImpact(level: LevelDef): IceImpact {
  const ice = level.ice ?? [];
  const full = solve(level);
  if (!full.solvable) {
    return {
      fullOptimal: full.optimal,
      solvable: false,
      exhausted: full.exhausted,
      landsOnIce: false,
      cells: ice.map((cell) => ({
        cell,
        optimalWithout: -1,
        solvableWithout: false,
        role: 'нет роли',
        required: false
      }))
    };
  }

  const iceKeys = new Set(ice.map((c) => `${c.x},${c.y}`));
  const swept = sweptKeys(level, full.path);
  const landings = landingKeys(level, full.path);
  const landsOnIce = [...landings].some((key) => iceKeys.has(key));

  const cells = ice.map((cell, index) => {
    const key = `${cell.x},${cell.y}`;
    const without = solve({ ...level, ice: ice.filter((_, k) => k !== index) });
    // Роль «запрет стоянки» доказывается коротким решением без этой клетки:
    // если оно паркуется ровно на ней, лёд отнял у игрока именно эту позицию.
    const altLandsHere = without.solvable && landingKeys(level, without.path).has(key);
    const role: IceCellRole = swept.has(key)
      ? 'проезд'
      : altLandsHere || !without.solvable
        ? 'запрет стоянки'
        : 'нет роли';
    const weighs = !without.solvable || without.optimal < full.optimal;
    return {
      cell,
      optimalWithout: without.optimal,
      solvableWithout: without.solvable,
      role,
      required: weighs && role !== 'нет роли'
    };
  });

  return { fullOptimal: full.optimal, solvable: true, exhausted: full.exhausted, landsOnIce, cells };
}
