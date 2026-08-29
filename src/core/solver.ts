import type { LevelDef } from './types';
import {
  GameState,
  allowedDirs,
  applyMove,
  buildGrid,
  createState,
  maxSteps
} from './game';

export interface SolveMove {
  piece: number;
  dx: number;
  dy: number;
  steps: number;
}

export interface SolveResult {
  solvable: boolean;
  /** Минимум ходов (-1, если непроходим). */
  optimal: number;
  /** Кратчайший путь (пустой, если непроходим). */
  path: SolveMove[];
  /** Поиск упёрся в лимит состояний — результат недостоверен. */
  exhausted: boolean;
}

const STATE_LIMIT = 400_000;

function stateKey(s: GameState): string {
  let k = `${s.starCollected ? 'S' : '.'}${s.gateUnlocked ? 'G' : '.'}`;
  for (const p of s.pieces) {
    k += p.gone ? '|g' : `|${p.x},${p.y},${p.used}`;
  }
  if (s.brokenPlanks.length) k += `|p:${[...s.brokenPlanks].sort().join(',')}`;
  if (s.chickenAt.length) k += `|c:${s.chickenAt.join('')}`;
  return k;
}

/**
 * Генератор BFS-ядра. Вынесен из `solve()`, чтобы поиск можно было приостановить
 * между уровнями глубины BFS (`yield` без значения) — на этих точках и `solve()`
 * (синхронно, до конца), и `solveAsync()` (отдавая event loop) продолжают проход
 * одинаковым кодом. Без этого разделения асинхронная версия дублировала бы весь
 * алгоритм БФС отдельной копией, которая неизбежно разошлась бы с синхронной.
 */
function* solveSteps(
  level: LevelDef,
  opts: { from?: GameState; requireStar?: boolean; stateLimit?: number }
): Generator<void, SolveResult, void> {
  const stateLimit = opts.stateLimit ?? STATE_LIMIT;
  const start = opts.from ?? createState(level);
  const requireStar = (opts.requireStar ?? false) && level.star !== undefined;

  const isGoal = (s: GameState) => s.won && (!requireStar || s.starCollected);
  if (isGoal(start)) return { solvable: true, optimal: 0, path: [], exhausted: false };
  if (start.won) return { solvable: false, optimal: -1, path: [], exhausted: false };

  const startKey = stateKey(start);
  const parents = new Map<string, { prev: string; move: SolveMove } | null>();
  parents.set(startKey, null);
  let frontier: { s: GameState; key: string }[] = [{ s: start, key: startKey }];
  let depth = 0;

  // Внутри одного уровня BFS-глубины фронт может содержать десятки тысяч
  // узлов (широкие уровни) — точки приостановки только между уровнями глубины
  // не спасли бы от долгого блока event loop внутри такого прохода. Поэтому
  // помимо `yield` в конце `while`, отдаём точку и каждые NODE_YIELD_EVERY
  // обработанных узлов фронта.
  const NODE_YIELD_EVERY = 2000;
  let processedInLevel = 0;

  while (frontier.length > 0) {
    depth++;
    const next: { s: GameState; key: string }[] = [];
    for (const node of frontier) {
      processedInLevel++;
      if (processedInLevel % NODE_YIELD_EVERY === 0) yield;
      const grid = buildGrid(level, node.s);
      for (let i = 0; i < level.pieces.length; i++) {
        if (node.s.pieces[i].gone) continue;
        for (const d of allowedDirs(level.pieces[i])) {
          const m = maxSteps(level, node.s, i, d.dx, d.dy, grid);
          for (let steps = 1; steps <= m; steps++) {
            const res = applyMove(level, node.s, i, d.dx, d.dy, steps, grid);
            if (!res) continue; // частичный выезд
            const key = stateKey(res.state);
            if (parents.has(key)) continue;
            const move: SolveMove = { piece: i, dx: d.dx, dy: d.dy, steps };
            parents.set(key, { prev: node.key, move });
            if (isGoal(res.state)) {
              const path: SolveMove[] = [];
              let cur: string | null = key;
              while (cur) {
                const entry: { prev: string; move: SolveMove } | null | undefined = parents.get(cur);
                if (!entry) break;
                path.unshift(entry.move);
                cur = entry.prev;
              }
              return { solvable: true, optimal: depth, path, exhausted: false };
            }
            if (parents.size > stateLimit) {
              return { solvable: false, optimal: -1, path: [], exhausted: true };
            }
            next.push({ s: res.state, key });
          }
        }
      }
    }
    frontier = next;
    // Одна точка приостановки на уровень глубины BFS — после неё вызывающий
    // код решает, продолжать ли синхронно или отдать event loop.
    yield;
  }
  return { solvable: false, optimal: -1, path: [], exhausted: false };
}

/**
 * BFS по состояниям: 1 ход = скольжение одной фигуры на любую дистанцию.
 * requireStar — искать решение с обязательным сбором звезды.
 */
export function solve(
  level: LevelDef,
  opts: { from?: GameState; requireStar?: boolean; stateLimit?: number } = {}
): SolveResult {
  const gen = solveSteps(level, opts);
  let step = gen.next();
  while (!step.done) step = gen.next();
  return step.value;
}

/**
 * Асинхронный двойник `solve()` для тяжёлых тестовых прогонов (кампания
 * целиком, элитные испытания, боссы) — на полях со множеством фигур BFS может
 * непрерывно занимать событийный цикл десятками секунд. Раньше единственной
 * защитой был точечный `await yieldToEventLoop()` МЕЖДУ вызовами `solve()`, но
 * если один-единственный вызов сам по себе близок к RPC-таймауту vitest-воркера
 * (60с, `onTaskUpdate` — см. vitest.solver.config.ts), внешний yield не
 * помогает: событийный цикл всё равно блокируется внутри этого одного вызова.
 * `solveAsync()` отдаёт цикл каждые `yieldEveryMs` миллисекунд РЕАЛЬНОГО
 * времени внутри самого поиска (не по числу итераций — время на один уровень
 * BFS-глубины растёт с шириной фронта непредсказуемо), поэтому защита не
 * зависит ни от размера уровня, ни от нагрузки на CPU от соседних процессов.
 */
export async function solveAsync(
  level: LevelDef,
  opts: { from?: GameState; requireStar?: boolean; stateLimit?: number; yieldEveryMs?: number } = {}
): Promise<SolveResult> {
  const yieldEveryMs = opts.yieldEveryMs ?? 250;
  const gen = solveSteps(level, opts);
  let step = gen.next();
  let sliceStart = Date.now();
  while (!step.done) {
    if (Date.now() - sliceStart >= yieldEveryMs) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      sliceStart = Date.now();
    }
    step = gen.next();
  }
  return step.value;
}

/** Первый ход кратчайшего решения из текущего состояния (для подсказки). */
export function hint(level: LevelDef, from: GameState): SolveMove | null {
  const res = solve(level, { from });
  return res.solvable && res.path.length > 0 ? res.path[0] : null;
}
