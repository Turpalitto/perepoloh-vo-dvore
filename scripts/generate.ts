/**
 * Поиск уровней случайным перебором с проверкой решателем.
 * Запуск: npx tsx scripts/generate.ts [seed] [iterations] [width] [height] [minOptimal]
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
const GEN_STATE_LIMIT = width > 6 ? 120_000 : 60_000;

const opts = width === 7 && height === 7 ? GEN_7X7 : { ...GEN_6X6, width, height, exitRow: Math.floor(height / 2) - (height % 2 === 0 ? 1 : 0) };
const rng = mulberry32(seed);

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
  const cand = genCandidate(rng, opts);
  if (!cand) continue;
  tried++;
  if (validateLevel(cand).filter((e) => !e.includes('par')).length > 0) continue;
  const key = canonicalKey(cand);
  if (seenKeys.has(key)) continue;
  seenKeys.add(key);
  const plain = solve(cand, { stateLimit: GEN_STATE_LIMIT });
  if (!plain.solvable || plain.optimal < minOptimal) continue;
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
