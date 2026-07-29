/**
 * Оценка сложности уровня по фактической структуре пространства состояний.
 * Строит полный граф достижимых состояний (в пределах лимита) тем же движком,
 * что и решатель, затем reverse-BFS от победных состояний. Никаких копий правил.
 */
import type { LevelDef } from './types';
import { GameState, allowedDirs, applyMove, buildGrid, createState, maxSteps } from './game';
import { solve } from './solver';

export type DifficultyTier = 'tutorial' | 'easy' | 'medium' | 'hard' | 'expert';

export interface DifficultyMetrics {
  /** Минимум ходов до победы (из решателя по графу). */
  optimalMoves: number;
  /** Всего достижимых состояний (включая победные). */
  reachableStates: number;
  /** Средний коэффициент ветвления (ходов из состояния). */
  branchingAvg: number;
  /** Доля доказуемо тупиковых состояний (решение из них не существует). */
  deadRatio: number;
  /** Доля ходов из старта, не приближающих к цели (ложные направления). */
  falseStartRatio: number;
  /** Ширина «бутылочного горлышка»: минимум состояний на одной глубине оптимальных путей. */
  bottleneckWidth: number;
  /** Число фигур и из них ящиков с лимитом ходов. */
  pieces: number;
  crates: number;
  /** Граф построен полностью (false — упёрлись в лимит, deadRatio ненадёжен). */
  complete: boolean;
}

export interface DifficultyResult {
  /** Итоговый балл; растёт со сложностью, сопоставим между уровнями. */
  score: number;
  tier: DifficultyTier;
  metrics: DifficultyMetrics;
  explanation: string[];
}

const STATE_LIMIT = 250_000;

function stateKey(s: GameState): string {
  let k = `${s.starCollected ? 'S' : '.'}${s.gateUnlocked ? 'G' : '.'}`;
  for (const p of s.pieces) k += p.gone ? '|g' : `|${p.x},${p.y},${p.used}`;
  if (s.brokenPlanks.length) k += `|p:${[...s.brokenPlanks].sort().join(',')}`;
  if (s.chickenAt.length) k += `|c:${s.chickenAt.join('')}`;
  return k;
}

/**
 * Анализ сложности. Детерминирован: одинаковый уровень — одинаковый результат.
 * При превышении лимита состояний метрики честно помечаются complete=false.
 */
export function analyzeDifficulty(level: LevelDef, opts: { stateLimit?: number } = {}): DifficultyResult {
  const stateLimit = opts.stateLimit ?? STATE_LIMIT;
  const start = createState(level);
  const startKey = stateKey(start);

  // Прямой BFS: полный граф достижимых состояний с рёбрами.
  const index = new Map<string, number>([[startKey, 0]]);
  const states: GameState[] = [start];
  const edges: number[][] = [[]]; // исходящие рёбра
  const winIdx: number[] = [];
  let complete = true;

  for (let cur = 0; cur < states.length; cur++) {
    const s = states[cur];
    if (s.won) {
      winIdx.push(cur);
      continue; // из победного состояния дальше не ходим
    }
    const grid = buildGrid(level, s);
    for (let i = 0; i < level.pieces.length; i++) {
      if (s.pieces[i].gone) continue;
      for (const d of allowedDirs(level.pieces[i])) {
        const m = maxSteps(level, s, i, d.dx, d.dy, grid);
        for (let steps = 1; steps <= m; steps++) {
          const res = applyMove(level, s, i, d.dx, d.dy, steps);
          if (!res) continue;
          const key = stateKey(res.state);
          let to = index.get(key);
          if (to === undefined) {
            if (states.length >= stateLimit) {
              complete = false;
              continue;
            }
            to = states.length;
            index.set(key, to);
            states.push(res.state);
            edges.push([]);
          }
          edges[cur].push(to);
        }
      }
    }
  }

  // Reverse-BFS от победных состояний: дистанция до цели для каждого состояния.
  const rev: number[][] = states.map(() => []);
  edges.forEach((outs, from) => outs.forEach((to) => rev[to].push(from)));
  const dist = new Array<number>(states.length).fill(-1);
  let frontier = winIdx;
  for (const w of winIdx) dist[w] = 0;
  let d = 0;
  while (frontier.length > 0) {
    d++;
    const next: number[] = [];
    for (const node of frontier) {
      for (const from of rev[node]) {
        if (dist[from] === -1) {
          dist[from] = d;
          next.push(from);
        }
      }
    }
    frontier = next;
  }

  // На оборванном графе цель могла остаться за пределами лимита — тогда
  // оптимум берём у решателя (тот же движок, больший лимит), не выдумывая -1.
  let optimalMoves = dist[0] === -1 ? -1 : dist[0];
  if (optimalMoves === -1 && !complete) {
    const fallback = solve(level, { stateLimit: stateLimit * 2 });
    if (fallback.solvable) optimalMoves = fallback.optimal;
  }
  const reachableStates = states.length;
  const branchingAvg = reachableStates > 0 ? edges.reduce((sum, e) => sum + e.length, 0) / reachableStates : 0;
  const dead = dist.filter((x) => x === -1).length;
  // При неполном графе «недостижимость цели» может быть артефактом обрыва.
  const deadRatio = complete && reachableStates > 0 ? dead / reachableStates : 0;
  const falseStarts = edges[0].filter((to) => dist[to] === -1 || dist[to] >= (optimalMoves === -1 ? Infinity : optimalMoves)).length;
  const falseStartRatio = edges[0].length > 0 ? falseStarts / edges[0].length : 0;

  // Ширина бутылочного горлышка: состояния, лежащие на каком-либо оптимальном пути,
  // сгруппированные по глубине от старта (dist от цели убывает ровно на 1).
  let bottleneckWidth = 0;
  if (optimalMoves > 0) {
    const onOptimal = new Array<boolean>(states.length).fill(false);
    onOptimal[0] = true;
    let layer = [0];
    const widths: number[] = [];
    for (let depth = optimalMoves; depth > 0; depth--) {
      const nextLayer = new Set<number>();
      for (const node of layer) {
        for (const to of edges[node]) if (dist[to] === depth - 1) nextLayer.add(to);
      }
      layer = [...nextLayer];
      layer.forEach((n) => (onOptimal[n] = true));
      if (depth > 1) widths.push(layer.length); // финальный победный слой не учитываем
    }
    bottleneckWidth = widths.length > 0 ? Math.min(...widths) : 1;
  }

  const crates = level.pieces.filter((p) => p.kind === 'crate').length;
  const metrics: DifficultyMetrics = {
    optimalMoves,
    reachableStates,
    branchingAvg: Number(branchingAvg.toFixed(2)),
    deadRatio: Number(deadRatio.toFixed(3)),
    falseStartRatio: Number(falseStartRatio.toFixed(3)),
    bottleneckWidth,
    pieces: level.pieces.length,
    crates,
    complete
  };

  // Балл: длина решения — основа, остальное — модификаторы восприятия сложности.
  const score = Number(
    (
      (optimalMoves === -1 ? 100 : optimalMoves * 3) +
      Math.log10(Math.max(reachableStates, 1)) * 4 +
      deadRatio * 25 +
      falseStartRatio * 10 +
      (optimalMoves >= 4 && bottleneckWidth > 0 ? 3 / bottleneckWidth : 0) +
      crates * 2 +
      (level.mechanics?.length ?? 0)
    ).toFixed(1)
  );

  const tier: DifficultyTier =
    optimalMoves >= 0 && optimalMoves <= 3 && score < 26
      ? 'tutorial'
      : score < 40
        ? 'easy'
        : score < 58
          ? 'medium'
          : score < 80
            ? 'hard'
            : 'expert';

  const explanation: string[] = [];
  explanation.push(`оптимум ${optimalMoves} ходов, состояний ${reachableStates}${complete ? '' : '+ (лимит)'}`);
  if (deadRatio > 0.15) explanation.push(`тупиков ${(deadRatio * 100).toFixed(0)}% — легко испортить позицию`);
  if (falseStartRatio > 0.6) explanation.push(`${(falseStartRatio * 100).toFixed(0)}% первых ходов не ведут к цели`);
  if (bottleneckWidth === 1) explanation.push('решение проходит через единственное узкое место');
  if (crates > 0) explanation.push(`ящиков с лимитом ходов: ${crates}`);
  if (!complete) explanation.push('граф оборван лимитом — метрики частичные');

  return { score, tier, metrics, explanation };
}
