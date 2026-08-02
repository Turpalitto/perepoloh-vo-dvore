/**
 * Генератор уровней с held-кнопкой (`gateSwitch.holdType: 'held'` — ворота
 * открыты, только пока клетка кнопки занята). Тот же подход, что
 * `scripts/generate-ice.ts`.
 *
 * Критерий отбора здесь один и жёсткий: расклад берётся, только если режим
 * `held` поднимает оптимум против обычного `once` на этой же кнопке. Иначе
 * `holdType` — косметический флаг: игрок читает новое правило, а задача от него
 * не меняется.
 *
 * Проверка обязательна, а не «на всякий случай»: ровно на такой пустоте
 * 2026-08-02 попались хрупкие доски (см. `verify-planks.ts`), а до них — лёд.
 * По кампании режим `held` поднимает оптимум лишь на 2 уровнях из 21
 * (`scripts/held-scan.ts`), так что случайная кнопка почти всегда пустая.
 *
 * Запуск: npx tsx scripts/generate-held.ts <preset> [--preview] [--min N] [--max N]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GEN_6X6, genCandidate, mulberry32 } from '../src/core/levelgen';
import type { LevelDef, PieceDef } from '../src/core/types';
import { solve } from '../src/core/solver';
import { validateLevel } from '../src/core/validator';
import { canonicalKey } from '../src/core/canonical';

const STATE_LIMIT = 60_000;

interface Preset {
  name: string;
  seed: number;
  iterations: number;
  minOptimal: number;
  maxOptimal: number;
  pieceMin: number;
  pieceMax: number;
  kinds: Array<PieceDef['kind']>;
  star: boolean;
  maxWalls: number;
}

/** Ступени мини-главы: par обязан расти внутри неё (правило `levels.test.ts`). */
const PRESETS: Record<string, Preset> = {
  intro: {
    name: 'intro',
    seed: 20260809,
    iterations: 80000,
    minOptimal: 9,
    maxOptimal: 9,
    pieceMin: 5,
    pieceMax: 7,
    kinds: ['car'],
    star: false,
    maxWalls: 2
  },
  hold: {
    name: 'hold',
    seed: 20260810,
    iterations: 120000,
    minOptimal: 10,
    maxOptimal: 10,
    pieceMin: 5,
    pieceMax: 8,
    kinds: ['car'],
    star: false,
    maxWalls: 3
  },
  truck: {
    name: 'truck',
    seed: 20260811,
    iterations: 120000,
    minOptimal: 11,
    maxOptimal: 11,
    pieceMin: 5,
    pieceMax: 8,
    kinds: ['car', 'truck'],
    star: false,
    maxWalls: 2
  },
  star: {
    name: 'star',
    seed: 20260812,
    iterations: 120000,
    minOptimal: 12,
    maxOptimal: 12,
    pieceMin: 6,
    pieceMax: 9,
    kinds: ['car', 'truck', 'tractor'],
    star: true,
    maxWalls: 3
  }
};

const args = process.argv.slice(2);
const preview = args.includes('--preview');
const flag = (name: string): number | undefined => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? Number(args[at + 1]) : undefined;
};
const base = PRESETS[args.find((a) => !a.startsWith('--') && Number.isNaN(Number(a))) ?? 'intro'];
if (!base) throw new Error(`нет пресета; доступны: ${Object.keys(PRESETS).join(', ')}`);
const preset: Preset = {
  ...base,
  minOptimal: flag('min') ?? base.minOptimal,
  maxOptimal: flag('max') ?? base.maxOptimal,
  iterations: flag('iters') ?? base.iterations
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const campaign = JSON.parse(readFileSync(join(root, 'src/levels/levels.json'), 'utf8')) as LevelDef[];
const seen = new Set(campaign.map((l) => canonicalKey(l)));

const rng = mulberry32(preset.seed);
const opts = { ...GEN_6X6, pieceMin: preset.pieceMin, pieceMax: preset.pieceMax, gateChance: 1, kinds: preset.kinds };
const found: Array<{ level: LevelDef; optimal: number; once: number; withStar: number }> = [];
const drop = { gen: 0, noGate: 0, kinds: 0, walls: 0, valid: 0, dup: 0, onceBad: 0, heldBad: 0, sameAsOnce: 0, range: 0, star: 0 };

for (let i = 0; i < preset.iterations; i++) {
  const raw = genCandidate(rng, opts);
  if (!raw) {
    drop.gen++;
    continue;
  }
  if (!raw.gateSwitch) {
    drop.noGate++;
    continue;
  }
  if (raw.pieces.some((p) => p.kind !== 'target' && !preset.kinds.includes(p.kind))) {
    drop.kinds++;
    continue;
  }
  if ((raw.walls ?? []).length > preset.maxWalls) {
    drop.walls++;
    continue;
  }
  const cand0: LevelDef = preset.star ? raw : { ...raw, star: undefined };
  if (validateLevel(cand0).filter((e) => !e.includes('par')).length > 0) {
    drop.valid++;
    continue;
  }
  const key = canonicalKey(cand0);
  if (seen.has(key)) {
    drop.dup++;
    continue;
  }
  seen.add(key);

  const once = solve(
    { ...cand0, gateSwitch: { ...cand0.gateSwitch!, holdType: 'once' } },
    { stateLimit: STATE_LIMIT }
  );
  if (!once.solvable) {
    drop.onceBad++;
    continue;
  }
  const heldLevel: LevelDef = { ...cand0, gateSwitch: { ...cand0.gateSwitch!, holdType: 'held' } };
  const held = solve(heldLevel, { stateLimit: STATE_LIMIT });
  if (!held.solvable) {
    drop.heldBad++;
    continue;
  }
  // Главный фильтр: режим обязан менять задачу, а не только текст правила.
  if (held.optimal <= once.optimal) {
    drop.sameAsOnce++;
    continue;
  }
  if (held.optimal < preset.minOptimal || held.optimal > preset.maxOptimal) {
    drop.range++;
    continue;
  }
  const withStar = preset.star ? solve(heldLevel, { requireStar: true, stateLimit: STATE_LIMIT }) : held;
  if (!withStar.solvable || withStar.optimal > held.optimal + 3) {
    drop.star++;
    continue;
  }

  found.push({ level: heldLevel, optimal: held.optimal, once: once.optimal, withStar: withStar.optimal });
  // Печатаем сразу: перебор длинный, прерванный запуск должен оставить найденное.
  console.log(
    `НАЙДЕН par ${held.optimal} (once ${once.optimal}): ` +
      JSON.stringify({
        ...heldLevel,
        par: held.optimal,
        par2: Math.max(held.optimal + 2, withStar.optimal),
        difficulty: held.optimal <= 5 ? 'easy' : held.optimal <= 10 ? 'medium' : 'hard',
        role: 'tutorial',
        mechanics: [
          ...new Set(
            heldLevel.pieces.map((p) => p.kind).filter((k) => k === 'truck' || k === 'tractor' || k === 'crate')
          ),
          ...(heldLevel.star ? ['star'] : []),
          'gate-switch'
        ]
      })
  );
  if (found.length >= 8) break;
}

/** ASCII-схема: `!` — held-кнопка, `#` — стена, `$` — звезда, `T` — целевая. */
function renderBoard(level: LevelDef): string {
  const grid: string[][] = Array.from({ length: level.height }, () => Array<string>(level.width).fill('.'));
  for (const wall of level.walls ?? []) grid[wall.y][wall.x] = '#';
  level.pieces.forEach((p, i) => {
    const tag = p.kind === 'target' ? 'T' : String.fromCharCode(65 + i);
    for (let k = 0; k < p.len; k++) grid[p.y + (p.dir === 'v' ? k : 0)][p.x + (p.dir === 'h' ? k : 0)] = tag;
  });
  if (level.star) grid[level.star.y][level.star.x] = '$';
  if (level.gateSwitch) grid[level.gateSwitch.y][level.gateSwitch.x] = '!';
  return grid.map((row, y) => row.join(' ') + (y === level.exit.index ? '  <- выезд' : '')).join('\n');
}

console.log(
  `preset=${preset.name} par=${preset.minOptimal}..${preset.maxOptimal} kept=${found.length} drop=${JSON.stringify(drop)}`
);
found.forEach((f, index) => {
  console.log(`# ${index}: held ${f.optimal} (once ${f.once}, +${f.optimal - f.once})`);
  if (preview) console.log(renderBoard(f.level));
});
for (const f of found) {
  const mechanics = [
    ...new Set(f.level.pieces.map((p) => p.kind).filter((k) => k === 'truck' || k === 'tractor' || k === 'crate')),
    ...(f.level.star ? ['star'] : []),
    'gate-switch'
  ];
  console.log(
    JSON.stringify({
      ...f.level,
      par: f.optimal,
      par2: Math.max(f.optimal + 2, f.withStar),
      difficulty: f.optimal <= 5 ? 'easy' : f.optimal <= 10 ? 'medium' : 'hard',
      role: 'tutorial',
      mechanics
    })
  );
}
