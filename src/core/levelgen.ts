/**
 * Генерация уровней случайным перебором с проверкой решателем.
 * Используется офлайн-скриптами (scripts/generate.ts) и «уровнем дня»
 * в браузере — код детерминирован при одинаковом seed.
 */
import type { LevelDef, PieceDef, WallKind } from './types';
import { solve } from './solver';
import { validateLevel } from './validator';

export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenOptions {
  width: number;
  height: number;
  /** Ряд ворот (выход всегда справа). */
  exitRow: number;
  pieceMin: number;
  pieceMax: number;
}

export const GEN_6X6: GenOptions = { width: 6, height: 6, exitRow: 2, pieceMin: 6, pieceMax: 9 };
export const GEN_7X7: GenOptions = { width: 7, height: 7, exitRow: 3, pieceMin: 11, pieceMax: 15 };

/** Случайная расстановка; может вернуть null (не удалось разместить звезду). */
export function genCandidate(rng: () => number, o: GenOptions): LevelDef | null {
  const ri = (n: number) => Math.floor(rng() * n);
  const pick = <T,>(arr: T[]): T => arr[ri(arr.length)];
  const { width: W, height: H, exitRow } = o;

  const occ = new Set<string>();
  const mark = (x: number, y: number) => occ.add(`${x},${y}`);
  const free = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H && !occ.has(`${x},${y}`);

  const pieces: PieceDef[] = [];
  const tx = ri(2);
  pieces.push({ id: 'T', kind: 'target', x: tx, y: exitRow, len: 2, dir: 'h' });
  mark(tx, exitRow);
  mark(tx + 1, exitRow);

  const pieceCount = o.pieceMin + ri(o.pieceMax - o.pieceMin + 1);
  let crates = 0;
  for (let i = 0; i < pieceCount; i++) {
    const roll = rng();
    let kind: PieceDef['kind'];
    if (roll < 0.5) kind = 'car';
    else if (roll < 0.65) kind = 'truck';
    else if (roll < 0.8) kind = 'tractor';
    else kind = 'crate';
    const id = String.fromCharCode(65 + i);
    if (kind === 'crate') {
      if (crates >= 2) continue;
      for (let a = 0; a < 20; a++) {
        const x = ri(W);
        const y = ri(H);
        if (!free(x, y)) continue;
        pieces.push({ id, kind, x, y, len: 1, dir: 'any', maxMoves: 1 + ri(2) });
        mark(x, y);
        crates++;
        break;
      }
      continue;
    }
    const len = kind === 'car' ? 2 : 3;
    for (let a = 0; a < 25; a++) {
      const dir = rng() < 0.5 ? 'h' : 'v';
      // горизонтальные не ставим на ряд ворот: блокируют его навсегда
      let y: number;
      if (dir === 'h') {
        y = ri(H - 1);
        if (y >= exitRow) y++;
      } else {
        y = ri(H - len + 1);
      }
      const x = dir === 'h' ? ri(W - len + 1) : ri(W);
      const cells = Array.from({ length: len }, (_, k) => ({
        x: dir === 'h' ? x + k : x,
        y: dir === 'v' ? y + k : y
      }));
      if (!cells.every((c) => free(c.x, c.y))) continue;
      pieces.push({ id, kind, x, y, len, dir, skin: ri(3) });
      cells.forEach((c) => mark(c.x, c.y));
      break;
    }
  }

  const walls: { x: number; y: number; kind: WallKind }[] = [];
  const wallCount = ri(3);
  for (let i = 0; i < wallCount; i++) {
    for (let a = 0; a < 15; a++) {
      const x = ri(W);
      const y = ri(H);
      if (y === exitRow || !free(x, y)) continue;
      walls.push({ x, y, kind: pick<WallKind>(['hay', 'barrel', 'log']) });
      mark(x, y);
      break;
    }
  }

  let star: { x: number; y: number } | undefined;
  for (let a = 0; a < 30; a++) {
    const x = ri(W);
    const y = ri(H);
    if (y === exitRow || !free(x, y)) continue;
    star = { x, y };
    break;
  }
  if (!star) return null;

  return {
    id: 0,
    name: 'gen',
    width: W,
    height: H,
    exit: { side: 'right', index: exitRow },
    pieces,
    walls,
    star,
    par: 1,
    par2: 99,
    difficulty: 'hard',
    mechanics: []
  };
}

export interface FoundLevel {
  level: LevelDef;
  optimal: number;
  withStar: number;
}

/**
 * Ищет уровень с оптимумом в [minOptimal, maxOptimal] и достижимой звездой.
 * Детерминирован при одном rng. Если за maxTries идеала нет — возвращает
 * лучший проходимый запасной вариант (обычно случается на первых десятках).
 */
export function findLevel(
  rng: () => number,
  o: GenOptions,
  minOptimal: number,
  maxOptimal: number,
  stateLimit = 30_000,
  maxTries = 400
): FoundLevel | null {
  let fallback: FoundLevel | null = null;
  for (let i = 0; i < maxTries; i++) {
    const cand = genCandidate(rng, o);
    if (!cand) continue;
    if (validateLevel(cand).filter((e) => !e.includes('par')).length > 0) continue;
    const plain = solve(cand, { stateLimit });
    if (!plain.solvable || plain.optimal < 2) continue;
    const withStar = solve(cand, { requireStar: true, stateLimit });
    if (!withStar.solvable || withStar.optimal > plain.optimal + 4) continue;
    const found: FoundLevel = { level: cand, optimal: plain.optimal, withStar: withStar.optimal };
    if (plain.optimal >= minOptimal && plain.optimal <= maxOptimal) return found;
    if (!fallback || Math.abs(plain.optimal - minOptimal) < Math.abs(fallback.optimal - minOptimal)) {
      fallback = found;
    }
  }
  return fallback;
}
