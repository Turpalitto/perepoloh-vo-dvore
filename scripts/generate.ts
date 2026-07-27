/**
 * Поиск уровней случайным перебором с проверкой решателем.
 * Запуск: npx tsx scripts/generate.ts [seed] [iterations] [width] [height] [minOptimal] [maxOptimal] [iceCount] [pieceMax]
 * Печатает найденные уровни (JSON) по убыванию оптимума.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GEN_6X6, GEN_7X7, genCandidate, mulberry32 } from '../src/core/levelgen';
import type { LevelDef } from '../src/core/types';
import { solve } from '../src/core/solver';
import { validateLevel } from '../src/core/validator';
import { canonicalKey } from '../src/core/canonical';

const seed = Number(process.argv[2] ?? 20260718);
const iterations = Number(process.argv[3] ?? 2000);
const width = Number(process.argv[4] ?? 6);
const height = Number(process.argv[5] ?? 6);
const minOptimal = Number(process.argv[6] ?? 6);
const maxOptimal = Number(process.argv[7] ?? Infinity);
const iceCount = Number(process.argv[8] ?? 0);
const pieceMax = Number(process.argv[9] ?? 0);
const GEN_STATE_LIMIT = width > 6 ? 120_000 : 60_000;

const base = width === 7 && height === 7 ? GEN_7X7 : { ...GEN_6X6, width, height, exitRow: Math.floor(height / 2) - (height % 2 === 0 ? 1 : 0) };
const opts = pieceMax > 0 ? { ...base, pieceMin: Math.min(base.pieceMin, pieceMax), pieceMax } : base;
const rng = mulberry32(seed);

/** Клетки без фигур, препятствий и звезды — единственные, куда осмысленно класть лёд. */
function freeCells(level: LevelDef): Array<{ x: number; y: number }> {
  const busy = new Set<string>();
  for (const piece of level.pieces) {
    for (let k = 0; k < piece.len; k++) {
      busy.add(`${piece.x + (piece.dir === 'h' ? k : 0)},${piece.y + (piece.dir === 'v' ? k : 0)}`);
    }
  }
  for (const wall of level.walls ?? []) busy.add(`${wall.x},${wall.y}`);
  if (level.star) busy.add(`${level.star.x},${level.star.y}`);
  if (level.gateSwitch) busy.add(`${level.gateSwitch.x},${level.gateSwitch.y}`);
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) if (!busy.has(`${x},${y}`)) cells.push({ x, y });
  }
  return cells;
}

/**
 * Лёд ставится не случайно, а осознанно: случайная клетка почти никогда не
 * попадает на нужную остановку, и механика остаётся декорацией. Перебираем
 * свободные клетки и берём ту, что реально удлиняет оптимум — только такой
 * уровень учит игрока, что на льду нельзя затормозить по своему желанию.
 */
function addMeaningfulIce(level: LevelDef, baseOptimal: number, count: number): LevelDef | null {
  let current = level;
  let currentOptimal = baseOptimal;
  for (let placed = 0; placed < count; placed++) {
    let best: { level: LevelDef; optimal: number } | null = null;
    for (const cell of freeCells(current)) {
      const cand: LevelDef = { ...current, ice: [...(current.ice ?? []), cell] };
      const result = solve(cand, { stateLimit: GEN_STATE_LIMIT });
      if (!result.solvable || result.optimal <= currentOptimal) continue;
      if (!best || result.optimal > best.optimal) best = { level: cand, optimal: result.optimal };
    }
    if (!best) return null;
    current = best.level;
    currentOptimal = best.optimal;
  }
  return current;
}

// Дедупликация: не предлагать копии уровней кампании и друг друга
// (сравнение по канону — ловит зеркала, повороты и переименования).
const campaignRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const campaign = JSON.parse(readFileSync(join(campaignRoot, 'src/levels/levels.json'), 'utf8')) as LevelDef[];
const seenKeys = new Set(campaign.map((l) => canonicalKey(l)));

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
  const raw = genCandidate(rng, opts);
  if (!raw) continue;
  tried++;
  if (validateLevel(raw).filter((e) => !e.includes('par')).length > 0) continue;
  const key = canonicalKey(raw);
  if (seenKeys.has(key)) continue;
  seenKeys.add(key);
  const rawSolved = solve(raw, { stateLimit: GEN_STATE_LIMIT });
  if (!rawSolved.solvable) continue;

  // Со льдом целевой диапазон проверяем ПОСЛЕ его расстановки: лёд поднимает
  // оптимум, поэтому фильтровать голый расклад по minOptimal бессмысленно.
  let cand = raw;
  if (iceCount > 0) {
    const iced = addMeaningfulIce(raw, rawSolved.optimal, iceCount);
    if (!iced) continue;
    cand = iced;
  }
  const plain = iceCount > 0 ? solve(cand, { stateLimit: GEN_STATE_LIMIT }) : rawSolved;
  if (!plain.solvable || plain.optimal < minOptimal || plain.optimal > maxOptimal) continue;
  if (validateLevel(cand).filter((e) => !e.includes('par')).length > 0) continue;
  solvableCount++;
  const withStar = solve(cand, { requireStar: true, stateLimit: GEN_STATE_LIMIT });
  if (!withStar.solvable || withStar.optimal > plain.optimal + 4) continue;
  found.push({ level: cand, optimal: plain.optimal, withStar: withStar.optimal });
}
found.sort((a, b) => b.optimal - a.optimal);

console.log(
  `seed=${seed} iter=${iterations} ${width}x${height} min=${minOptimal} candidates=${tried} deep=${solvableCount} kept=${found.length} time=${((Date.now() - t0) / 1000).toFixed(1)}s\n`
);
for (const f of found.slice(0, 40)) {
  console.log(JSON.stringify({ ...f.level, par: f.optimal, par2: Math.max(f.optimal + 2, f.withStar) }));
}
