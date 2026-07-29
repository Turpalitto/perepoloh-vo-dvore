/**
 * Вклад каждой хрупкой доски в головоломку — постфактум, по готовому уровню.
 * Копия подхода `ice-impact.ts`: то же правило значимости (`cellCarriesWeight`,
 * переиспользуется отсюда), только клетка убирается из `level.planks`.
 *
 * Роль доски считается ровно так же, как у льда: «проезд» — оптимальное
 * решение прометает клетку насквозь; «запрет стоянки» — без доски короткое
 * решение паркуется ровно на ней. Декоративная доска (без роли) запрещена
 * тем же правилом, что и декоративный лёд.
 */
import type { PlankDef, LevelDef } from './types';
import { createState, pieceCells } from './game';
import { type SolveMove, solve } from './solver';
import { type AblationOutcome, cellCarriesWeight, type IceCellRole } from './ice-impact';

export type PlankCellImpact = {
  cell: PlankDef;
  optimalWithout: number;
  solvableWithout: boolean;
  exhaustedWithout: boolean;
  role: IceCellRole;
  required: boolean;
};

export interface PlankImpact {
  fullOptimal: number;
  solvable: boolean;
  exhausted: boolean;
  /** Оптимальное решение останавливается на целой доске (расхождение решателя и правил). */
  landsOnPlank: boolean;
  cells: PlankCellImpact[];
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

export function analyzePlankImpact(level: LevelDef, opts: { stateLimit?: number } = {}): PlankImpact {
  const planks = level.planks ?? [];
  const full = solve(level, opts);
  if (!full.solvable) {
    return {
      fullOptimal: full.optimal,
      solvable: false,
      exhausted: full.exhausted,
      landsOnPlank: false,
      cells: planks.map((cell) => ({
        cell,
        optimalWithout: -1,
        solvableWithout: false,
        exhaustedWithout: false,
        role: 'нет роли',
        required: false
      }))
    };
  }

  const plankKeys = new Set(planks.map((c) => `${c.x},${c.y}`));
  const swept = sweptKeys(level, full.path);
  const landings = landingKeys(level, full.path);
  const landsOnPlank = [...landings].some((key) => plankKeys.has(key));

  const cells = planks.map((cell, index) => {
    const key = `${cell.x},${cell.y}`;
    const without = solve({ ...level, planks: planks.filter((_, k) => k !== index) }, opts);
    const altLandsHere = without.solvable && landingKeys(level, without.path).has(key);
    const role: IceCellRole = swept.has(key) ? 'проезд' : altLandsHere ? 'запрет стоянки' : 'нет роли';
    const outcome: AblationOutcome = {
      solvableWithout: without.solvable,
      exhaustedWithout: without.exhausted,
      optimalWithout: without.optimal,
      role
    };
    return {
      cell,
      ...outcome,
      required: cellCarriesWeight(outcome, full.optimal)
    };
  });

  return { fullOptimal: full.optimal, solvable: true, exhausted: full.exhausted, landsOnPlank, cells };
}
