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
 *
 * Отдельная тонкость — неопределённый результат. Снятие ледяной клетки только
 * ДОБАВЛЯЕТ легальные остановки, поэтому решаемый уровень без неё не может стать
 * нерешаемым. Значит `solvable: false` от абляции — это всегда исчерпанный лимит
 * состояний, то есть отсутствие ответа, а не доказательство значимости. Такой
 * исход помечается `exhaustedWithout` и НЕ засчитывается как вклад клетки.
 */
import type { IceDef, LevelDef } from './types';
import { createState, pieceCells } from './game';
import { type SolveMove, solve, solveAsync } from './solver';

export type IceCellRole = 'проезд' | 'запрет стоянки' | 'нет роли';

export interface IceCellImpact {
  cell: IceDef;
  /** Оптимум уровня без этой клетки (-1, если ответа нет). */
  optimalWithout: number;
  solvableWithout: boolean;
  /**
   * Абляционный поиск упёрся в лимит состояний — ответа нет вообще. Отдельно от
   * `solvableWithout`, потому что исчерпанный поиск возвращает те же
   * `solvable: false, optimal: -1`, что и доказанная нерешаемость, и раньше
   * молча принимался за доказательство значимости клетки.
   */
  exhaustedWithout: boolean;
  role: IceCellRole;
  /** Клетка несёт вес: доказано, что без неё задача мельчает, и роль есть. */
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

/** Итог абляции одной клетки — вход правила «клетка несёт вес». */
export interface AblationOutcome {
  solvableWithout: boolean;
  exhaustedWithout: boolean;
  optimalWithout: number;
  role: IceCellRole;
}

/**
 * Правило значимости, вынесенное отдельно: его нельзя проверить на настоящем
 * поле, потому что подобрать расклад с исчерпанной абляцией и завершённым
 * полным поиском практически невозможно — снятие льда обычно УМЕНЬШАЕТ глубину
 * решения. А ошибиться в правиле легко: именно здесь незнание («ответа нет»)
 * когда-то трактовалось как доказательство.
 */
export function cellCarriesWeight(outcome: AblationOutcome, fullOptimal: number): boolean {
  if (outcome.exhaustedWithout) return false; // ответа нет — доказательства нет
  if (!outcome.solvableWithout) return false; // невозможно честно: лёд только ограничивает
  if (outcome.optimalWithout >= fullOptimal) return false; // без клетки не легче — декорация
  return outcome.role !== 'нет роли';
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

function emptyImpact(full: { optimal: number; exhausted: boolean }, ice: IceDef[]): IceImpact {
  return {
    fullOptimal: full.optimal,
    solvable: false,
    exhausted: full.exhausted,
    landsOnIce: false,
    cells: ice.map((cell) => ({
      cell,
      optimalWithout: -1,
      solvableWithout: false,
      exhaustedWithout: false,
      role: 'нет роли',
      required: false
    }))
  };
}

function buildCellImpact(
  level: LevelDef,
  full: { path: SolveMove[]; optimal: number },
  ice: IceDef[],
  index: number,
  without: { solvable: boolean; exhausted: boolean; optimal: number; path: SolveMove[] }
): IceCellImpact {
  const cellDef = ice[index];
  const key = `${cellDef.x},${cellDef.y}`;
  const swept = sweptKeys(level, full.path);
  // Роль «запрет стоянки» доказывается коротким решением без этой клетки:
  // если оно паркуется ровно на ней, лёд отнял у игрока именно эту позицию.
  // Отсутствие решения такой ролью НЕ считается: снятие льда только добавляет
  // легальные остановки, поэтому решаемый уровень без клетки не может стать
  // нерешаемым — такой ответ означает исчерпанный поиск, то есть незнание.
  const altLandsHere = without.solvable && landingKeys(level, without.path).has(key);
  const role: IceCellRole = swept.has(key) ? 'проезд' : altLandsHere ? 'запрет стоянки' : 'нет роли';
  const outcome: AblationOutcome = {
    solvableWithout: without.solvable,
    exhaustedWithout: without.exhausted,
    optimalWithout: without.optimal,
    role
  };
  return { cell: cellDef, ...outcome, required: cellCarriesWeight(outcome, full.optimal) };
}

export function analyzeIceImpact(level: LevelDef, opts: { stateLimit?: number } = {}): IceImpact {
  const ice = level.ice ?? [];
  const full = solve(level, opts);
  if (!full.solvable) return emptyImpact(full, ice);

  const iceKeys = new Set(ice.map((c) => `${c.x},${c.y}`));
  const landings = landingKeys(level, full.path);
  const landsOnIce = [...landings].some((key) => iceKeys.has(key));

  const cells = ice.map((_cell, index) => {
    const without = solve({ ...level, ice: ice.filter((_, k) => k !== index) }, opts);
    return buildCellImpact(level, full, ice, index, without);
  });

  return { fullOptimal: full.optimal, solvable: true, exhausted: full.exhausted, landsOnIce, cells };
}

/**
 * Асинхронный двойник `analyzeIceImpact()` для тяжёлых тестовых прогонов:
 * использует `solveAsync()` (yield по времени внутри BFS) вместо синхронного
 * `solve()`, иначе полная абляция уровней главы 10 может заблокировать event
 * loop дольше RPC-таймаута репортёра vitest (см. src/core/solver.ts).
 * CLI-скрипты (verify-ice.ts, generate-chapter10.ts, find-ice-remix.ts) вне
 * vitest не подвержены этому таймауту и продолжают использовать синхронную
 * версию без изменений.
 */
export async function analyzeIceImpactAsync(level: LevelDef, opts: { stateLimit?: number } = {}): Promise<IceImpact> {
  const ice = level.ice ?? [];
  const full = await solveAsync(level, opts);
  if (!full.solvable) return emptyImpact(full, ice);

  const iceKeys = new Set(ice.map((c) => `${c.x},${c.y}`));
  const landings = landingKeys(level, full.path);
  const landsOnIce = [...landings].some((key) => iceKeys.has(key));

  const cells: IceCellImpact[] = [];
  for (let index = 0; index < ice.length; index++) {
    const without = await solveAsync({ ...level, ice: ice.filter((_, k) => k !== index) }, opts);
    cells.push(buildCellImpact(level, full, ice, index, without));
  }

  return { fullOptimal: full.optimal, solvable: true, exhausted: full.exhausted, landsOnIce, cells };
}
