/**
 * Отчёт о значимости льда: доказывает, что ни одна ледяная клетка кампании не
 * декоративная.
 *
 * Проверка на «уровень стал сложнее» недостаточна — лёд легко поставить так,
 * что он выглядит механикой, но оптимум не трогает (замер прошлой редакции
 * правила: 111 постановок из 111 с нулевой дельтой). Поэтому для каждой клетки
 * отдельно доказывается, что без неё головоломка мельчает.
 *
 * Для каждого уровня с полем `ice`:
 *   1. уровень решаем, `par` совпадает с оптимумом, поиск не упёрся в лимит;
 *   2. удаление ЛЮБОЙ одной ледяной клетки снижает оптимум (клетка несёт вес);
 *   3. у каждой клетки есть понятная роль в решении — одна из двух:
 *      «проезд» (оптимальный ход проезжает по ней насквозь) либо «запрет
 *      стоянки» (без этой клетки короткое решение именно на ней паркуется).
 *      Клетка, не попавшая ни в одну роль, считается декоративной, даже если
 *      оптимум формально просел;
 *   4. ни один ход оптимального решения не заканчивается на льду (страховка от
 *      расхождения решателя и правила: подсказка не может предложить
 *      невозможную остановку).
 *
 * Запуск: npm run verify:ice   (exit 1 при любом дефекте)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createState, pieceCells } from '../src/core/game';
import { solve, type SolveMove } from '../src/core/solver';
import type { LevelDef } from '../src/core/types';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const levels = JSON.parse(readFileSync(join(root, 'src/levels/levels.json'), 'utf8')) as LevelDef[];

interface CellCheck {
  cell: { x: number; y: number };
  optimalWithout: number;
  solvableWithout: boolean;
  /** Роль клетки в решении: проезд насквозь или отнятая позиция покоя. */
  role: 'проезд' | 'запрет стоянки' | 'нет роли';
}

/** Клетки, «прометённые» ходом: от старта до конечной позиции включительно. */
function sweptCells(level: LevelDef, path: SolveMove[]): Array<Set<string>> {
  let state = createState(level);
  const perMove: Array<Set<string>> = [];
  for (const move of path) {
    const def = level.pieces[move.piece];
    const from = state.pieces[move.piece];
    const cells = new Set<string>();
    for (let t = 0; t <= move.steps; t++) {
      for (const c of pieceCells(def, { x: from.x + move.dx * t, y: from.y + move.dy * t, gone: false })) {
        cells.add(`${c.x},${c.y}`);
      }
    }
    perMove.push(cells);
    // применяем ход вручную, без applyMove: нужна только геометрия
    const next = { ...state, pieces: state.pieces.map((p) => ({ ...p })) };
    next.pieces[move.piece] = {
      ...from,
      x: from.x + move.dx * move.steps,
      y: from.y + move.dy * move.steps
    };
    state = next;
  }
  return perMove;
}

/** Конечная позиция каждого хода — для проверки «остановка не на льду». */
function landingCells(level: LevelDef, path: SolveMove[]): Array<Set<string>> {
  let state = createState(level);
  const perMove: Array<Set<string>> = [];
  for (const move of path) {
    const def = level.pieces[move.piece];
    const from = state.pieces[move.piece];
    const to = { x: from.x + move.dx * move.steps, y: from.y + move.dy * move.steps, gone: false };
    perMove.push(new Set(pieceCells(def, to).map((c) => `${c.x},${c.y}`)));
    const next = { ...state, pieces: state.pieces.map((p) => ({ ...p })) };
    next.pieces[move.piece] = { ...from, x: to.x, y: to.y };
    state = next;
  }
  return perMove;
}

const problems: string[] = [];
const iceLevels = levels.filter((level) => (level.ice?.length ?? 0) > 0);

if (iceLevels.length === 0) {
  console.log('уровней со льдом нет — проверять нечего');
  process.exit(0);
}

for (const level of iceLevels) {
  const ice = level.ice!;
  const res = solve(level);
  const head = `уровень ${level.id} «${level.name}»`;

  if (!res.solvable || res.exhausted) {
    problems.push(`${head}: не решается (exhausted=${res.exhausted})`);
    continue;
  }
  if (res.optimal !== level.par) {
    problems.push(`${head}: par ${level.par}, оптимум решателя ${res.optimal}`);
  }

  const iceKeys = new Set(ice.map((c) => `${c.x},${c.y}`));
  const swept = sweptCells(level, res.path);
  const sweptAll = new Set(swept.flatMap((cells) => [...cells]));

  for (const landing of landingCells(level, res.path)) {
    const bad = [...landing].filter((key) => iceKeys.has(key));
    if (bad.length > 0) {
      problems.push(`${head}: оптимальное решение останавливается на льду (${bad.join(' ')})`);
      break;
    }
  }

  const checks: CellCheck[] = [];
  for (let i = 0; i < ice.length; i++) {
    const key = `${ice[i].x},${ice[i].y}`;
    const without: LevelDef = { ...level, ice: ice.filter((_, k) => k !== i) };
    const alt = solve(without);

    // Роль «запрет стоянки» доказывается коротким решением без этой клетки:
    // если оно паркуется ровно на ней, лёд отнял у игрока именно эту позицию.
    const altLands = alt.solvable ? landingCells(without, alt.path).some((cells) => cells.has(key)) : false;
    const role: CellCheck['role'] = sweptAll.has(key)
      ? 'проезд'
      : altLands || !alt.solvable
        ? 'запрет стоянки'
        : 'нет роли';
    checks.push({ cell: ice[i], optimalWithout: alt.optimal, solvableWithout: alt.solvable, role });

    if (role === 'нет роли') {
      problems.push(`${head}: ледяная клетка (${key}) не участвует в решении — декорация`);
    }
    if (alt.solvable && alt.optimal >= res.optimal) {
      problems.push(
        `${head}: ледяная клетка (${key}) не несёт веса — без неё оптимум ${alt.optimal} (было ${res.optimal})`
      );
    }
  }

  const perCell = checks
    .map((c) => `(${c.cell.x},${c.cell.y})→${c.solvableWithout ? c.optimalWithout : 'нерешаем'} [${c.role}]`)
    .join(' ');
  console.log(`${head}: par ${level.par}, оптимум ${res.optimal}, без клетки: ${perCell}`);
}

if (problems.length > 0) {
  console.error('\nдефекты:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`\nвсе ледяные клетки значимы (уровней со льдом: ${iceLevels.length})`);
