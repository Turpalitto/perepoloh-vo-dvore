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
 * BFS по состояниям: 1 ход = скольжение одной фигуры на любую дистанцию.
 * requireStar — искать решение с обязательным сбором звезды.
 */
export function solve(
  level: LevelDef,
  opts: { from?: GameState; requireStar?: boolean; stateLimit?: number } = {}
): SolveResult {
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

  while (frontier.length > 0) {
    depth++;
    const next: { s: GameState; key: string }[] = [];
    for (const node of frontier) {
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
  }
  return { solvable: false, optimal: -1, path: [], exhausted: false };
}

/** Первый ход кратчайшего решения из текущего состояния (для подсказки). */
export function hint(level: LevelDef, from: GameState): SolveMove | null {
  const res = solve(level, { from });
  return res.solvable && res.path.length > 0 ? res.path[0] : null;
}
