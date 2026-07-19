/**
 * Поиск сложных уровней случайным перебором с проверкой решателем.
 * Запуск: npx tsx scripts/generate.ts [seed] [iterations]
 * Печатает лучшие найденные уровни (JSON) по убыванию оптимума.
 */
import type { LevelDef, PieceDef, WallKind } from '../src/core/types';
import { solve } from '../src/core/solver';
import { validateLevel } from '../src/core/validator';

const seed = Number(process.argv[2] ?? 20260718);
const iterations = Number(process.argv[3] ?? 2000);
const GEN_STATE_LIMIT = 60_000; // непроходимые кандидаты не гоняем по всему пространству

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(seed);
const ri = (n: number) => Math.floor(rng() * n);
const pick = <T,>(arr: T[]): T => arr[ri(arr.length)];

const W = 6;
const H = 6;
const EXIT_ROW = 2;

function genCandidate(): LevelDef | null {
  const occ = new Set<string>();
  const mark = (x: number, y: number) => occ.add(`${x},${y}`);
  const free = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H && !occ.has(`${x},${y}`);

  const pieces: PieceDef[] = [];
  const tx = ri(2); // целевая слева
  pieces.push({ id: 'T', kind: 'target', x: tx, y: EXIT_ROW, len: 2, dir: 'h' });
  mark(tx, EXIT_ROW);
  mark(tx + 1, EXIT_ROW);

  const pieceCount = 6 + ri(4); // 6..9
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
      // горизонтальные не ставим на ряд ворот: они блокируют его навсегда
      let y: number;
      if (dir === 'h') {
        y = ri(H - 1);
        if (y >= EXIT_ROW) y++;
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

  // 0..2 стены не на ряду ворот
  const walls: { x: number; y: number; kind: WallKind }[] = [];
  const wallCount = ri(3);
  for (let i = 0; i < wallCount; i++) {
    for (let a = 0; a < 15; a++) {
      const x = ri(W);
      const y = ri(H);
      if (y === EXIT_ROW || !free(x, y)) continue;
      walls.push({ x, y, kind: pick<WallKind>(['hay', 'barrel', 'log']) });
      mark(x, y);
      break;
    }
  }

  // звезда не на ряду ворот (иначе собирается бесплатно)
  let star: { x: number; y: number } | undefined;
  for (let a = 0; a < 30; a++) {
    const x = ri(W);
    const y = ri(H);
    if (y === EXIT_ROW || !free(x, y)) continue;
    star = { x, y };
    break;
  }
  if (!star) return null;

  return {
    id: 0,
    name: 'gen',
    width: W,
    height: H,
    exit: { side: 'right', index: EXIT_ROW },
    pieces,
    walls,
    star,
    par: 1,
    par2: 99,
    difficulty: 'hard',
    mechanics: [],
    hint: undefined
  };
}

interface Found {
  level: LevelDef;
  optimal: number;
  withStar: number;
}

const found: Found[] = [];
let tried = 0;
let solvableCount = 0;
const t0 = Date.now();
for (let i = 0; i < iterations; i++) {
  if (i > 0 && i % 200 === 0) {
    console.log(`# ${i}/${iterations} deep=${solvableCount} kept=${found.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  const cand = genCandidate();
  if (!cand) continue;
  tried++;
  if (validateLevel(cand).filter((e) => !e.includes('par')).length > 0) continue;
  const plain = solve(cand, { stateLimit: GEN_STATE_LIMIT });
  if (!plain.solvable || plain.optimal < 6) continue;
  solvableCount++;
  const withStar = solve(cand, { requireStar: true, stateLimit: GEN_STATE_LIMIT });
  if (!withStar.solvable || withStar.optimal > plain.optimal + 4) continue;
  found.push({ level: cand, optimal: plain.optimal, withStar: withStar.optimal });
}
found.sort((a, b) => b.optimal - a.optimal);

console.log(
  `seed=${seed} iter=${iterations} candidates=${tried} deep(6+)=${solvableCount} kept=${found.length} time=${((Date.now() - t0) / 1000).toFixed(1)}s\n`
);
for (const f of found.slice(0, 8)) {
  const crates = f.level.pieces.filter((p) => p.kind === 'crate').length;
  console.log(`--- optimal=${f.optimal} withStar=${f.withStar} pieces=${f.level.pieces.length} crates=${crates} walls=${f.level.walls?.length ?? 0}`);
  console.log(JSON.stringify({ ...f.level, par: f.optimal, par2: Math.max(f.optimal + 2, f.withStar) }));
}
