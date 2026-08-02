/**
 * Генератор уровней с курами. Тот же подход, что `scripts/generate-ice.ts`
 * (там разобрано, зачем генератору знать про механику), с одним отличием —
 * критерием отбора.
 *
 * Курица дороже стены: она добавляет игроку сущность, которую надо держать в
 * голове («где она будет через ход»). Поэтому мало, чтобы клетка что-то меняла
 * — расклад отбирается только если он проходит полный разбор
 * `analyzeChickenImpact`, тот же, которым судит `npm run verify:chickens`:
 * без курицы оптимум обязан просесть И курицу нельзя подменить обычной стеной
 * ни в клетке A, ни в клетке B.
 *
 * Проверка «а не дешевле ли изобразить то же самое стеной» здесь не
 * перестраховка: ровно на этом 2026-08-02 попались хрупкие доски — механика
 * оказалась неотличима от стены на всех своих уровнях (см. verify-planks.ts).
 *
 * Запуск: npx tsx scripts/generate-chickens.ts <preset> [--preview] [--min N] [--max N]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GEN_6X6, genCandidate, mulberry32 } from '../src/core/levelgen';
import type { LevelDef, PieceDef } from '../src/core/types';
import { solve } from '../src/core/solver';
import { validateLevel } from '../src/core/validator';
import { canonicalKey } from '../src/core/canonical';
import { analyzeChickenImpact } from '../src/core/chicken-impact';

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

/**
 * Ступени мини-главы: par обязан расти внутри неё (правило `levels.test.ts`).
 * Глава встаёт после «Куры и бочки» (позиция 67, par 11), поэтому ступени
 * 8 → 9 → 10 → 11 — просадка того же порядка, что у ледяной главы (9 → 5).
 */
const PRESETS: Record<string, Preset> = {
  // Знакомство: только машины, ничего кроме курицы не отвлекает.
  intro: {
    name: 'intro',
    seed: 20260805,
    iterations: 80000,
    minOptimal: 8,
    maxOptimal: 8,
    pieceMin: 5,
    pieceMax: 7,
    kinds: ['car'],
    star: false,
    maxWalls: 2
  },
  // Курица на пути: считать её такт становится обязательным.
  timing: {
    name: 'timing',
    seed: 20260806,
    iterations: 120000,
    minOptimal: 9,
    maxOptimal: 9,
    pieceMin: 5,
    pieceMax: 8,
    kinds: ['car'],
    star: false,
    maxWalls: 3
  },
  // Появляется грузовик: длинной фигуре труднее разминуться с тактом курицы.
  truck: {
    name: 'truck',
    seed: 20260807,
    iterations: 120000,
    minOptimal: 10,
    maxOptimal: 10,
    pieceMin: 5,
    pieceMax: 8,
    kinds: ['car', 'truck'],
    star: false,
    maxWalls: 2
  },
  // Выход на кривую кампании: курица плюс знакомая звезда.
  star: {
    name: 'star',
    seed: 20260808,
    iterations: 120000,
    minOptimal: 11,
    maxOptimal: 11,
    pieceMin: 6,
    pieceMax: 9,
    kinds: ['car', 'truck', 'tractor'],
    star: true,
    maxWalls: 3
  }
};

function freeCells(level: LevelDef): Array<{ x: number; y: number }> {
  const busy = new Set<string>();
  for (const piece of level.pieces) {
    for (let k = 0; k < piece.len; k++) {
      busy.add(`${piece.x + (piece.dir === 'h' ? k : 0)},${piece.y + (piece.dir === 'v' ? k : 0)}`);
    }
  }
  for (const wall of level.walls ?? []) busy.add(`${wall.x},${wall.y}`);
  if (level.star) busy.add(`${level.star.x},${level.star.y}`);
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) if (!busy.has(`${x},${y}`)) cells.push({ x, y });
  }
  return cells;
}

/**
 * Курица ставится только туда, где она проходит полный разбор значимости:
 * поднимает оптимум и не подменяется стеной. Из годных берём ту, что даёт
 * наибольший подъём — такая читается игроком отчётливее всего.
 */
function addMeaningfulChicken(level: LevelDef, lo: number, hi: number): LevelDef | null {
  const cells = freeCells(level);
  let best: { level: LevelDef; optimal: number } | null = null;
  for (const a of cells) {
    for (const b of cells) {
      const adjacent = (a.x === b.x && Math.abs(a.y - b.y) === 1) || (a.y === b.y && Math.abs(a.x - b.x) === 1);
      if (!adjacent) continue;
      const cand: LevelDef = { ...level, chickens: [{ a, b }] };
      const res = solve(cand, { stateLimit: STATE_LIMIT });
      // Диапазон ступени проверяем ДО разбора значимости: сам разбор стоит
      // четырёх запусков решателя на курицу, и гонять его на раскладах, которые
      // всё равно не попадут в ступень, — основная трата времени генератора.
      if (!res.solvable || res.optimal < lo || res.optimal > hi) continue;
      if (best && res.optimal <= best.optimal) continue;
      const impact = analyzeChickenImpact({ ...cand, par: res.optimal }, { stateLimit: STATE_LIMIT });
      if (!impact.solvable || impact.exhausted) continue;
      if (impact.chickens.some((c) => !c.required)) continue;
      best = { level: cand, optimal: res.optimal };
    }
  }
  return best?.level ?? null;
}

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
const opts = { ...GEN_6X6, pieceMin: preset.pieceMin, pieceMax: preset.pieceMax, kinds: preset.kinds };
const found: Array<{ level: LevelDef; optimal: number; withStar: number }> = [];
const drop = { gen: 0, kinds: 0, walls: 0, valid: 0, dup: 0, unsolvable: 0, noChicken: 0, range: 0, star: 0 };
/** Сколько раскладов дошло до дорогой части (перебор пар клеток). */
let heavy = 0;

for (let i = 0; i < preset.iterations; i++) {
  const raw = genCandidate(rng, opts);
  if (!raw) {
    drop.gen++;
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

  if (!solve(cand0, { stateLimit: STATE_LIMIT }).solvable) {
    drop.unsolvable++;
    continue;
  }

  heavy++;
  if (heavy % 25 === 0) console.error(`  …разобрано раскладов: ${heavy}, найдено: ${found.length}`);
  const withChicken = addMeaningfulChicken(cand0, preset.minOptimal, preset.maxOptimal);
  if (!withChicken) {
    drop.noChicken++;
    continue;
  }
  const plain = solve(withChicken, { stateLimit: STATE_LIMIT });
  if (!plain.solvable || plain.optimal < preset.minOptimal || plain.optimal > preset.maxOptimal) {
    drop.range++;
    continue;
  }
  const withStar = preset.star ? solve(withChicken, { requireStar: true, stateLimit: STATE_LIMIT }) : plain;
  if (!withStar.solvable || withStar.optimal > plain.optimal + 3) {
    drop.star++;
    continue;
  }

  found.push({ level: withChicken, optimal: plain.optimal, withStar: withStar.optimal });
  // Печатаем сразу: перебор длинный, и прерванный по времени запуск должен
  // оставить уже найденное, а не потерять всё.
  console.log(
    `НАЙДЕН par ${plain.optimal}: ` +
      JSON.stringify({
        ...withChicken,
        par: plain.optimal,
        par2: Math.max(plain.optimal + 2, withStar.optimal),
        difficulty: plain.optimal <= 5 ? 'easy' : plain.optimal <= 10 ? 'medium' : 'hard',
        role: 'tutorial',
        mechanics: [
          ...new Set(
            withChicken.pieces.map((p) => p.kind).filter((k) => k === 'truck' || k === 'tractor' || k === 'crate')
          ),
          ...(withChicken.star ? ['star'] : []),
          'chickens'
        ]
      })
  );
  if (found.length >= 8) break;
}

/** ASCII-схема: `a`/`b` — клетки курицы, `#` — стена, `$` — звезда, `T` — целевая. */
function renderBoard(level: LevelDef): string {
  const grid: string[][] = Array.from({ length: level.height }, () => Array<string>(level.width).fill('.'));
  for (const wall of level.walls ?? []) grid[wall.y][wall.x] = '#';
  level.pieces.forEach((p, i) => {
    const tag = p.kind === 'target' ? 'T' : String.fromCharCode(65 + i);
    for (let k = 0; k < p.len; k++) grid[p.y + (p.dir === 'v' ? k : 0)][p.x + (p.dir === 'h' ? k : 0)] = tag;
  });
  for (const ch of level.chickens ?? []) {
    grid[ch.a.y][ch.a.x] = 'a';
    grid[ch.b.y][ch.b.x] = 'b';
  }
  if (level.star) grid[level.star.y][level.star.x] = '$';
  return grid.map((row, y) => row.join(' ') + (y === level.exit.index ? '  <- выезд' : '')).join('\n');
}

console.log(
  `preset=${preset.name} par=${preset.minOptimal}..${preset.maxOptimal} kept=${found.length} drop=${JSON.stringify(drop)}`
);
found.forEach((f, index) => {
  const impact = analyzeChickenImpact({ ...f.level, par: f.optimal }, { stateLimit: STATE_LIMIT });
  const per = impact.chickens
    .map(
      (c) =>
        `A(${c.chicken.a.x},${c.chicken.a.y})/B(${c.chicken.b.x},${c.chicken.b.y})→без:${c.optimalWithout} стенаA:${c.optimalPinnedA} стенаB:${c.optimalPinnedB} [${c.role}]`
    )
    .join(' ');
  console.log(`# ${index}: par ${f.optimal}, ${per}`);
  if (preview) console.log(renderBoard(f.level));
});
for (const f of found) {
  const mechanics = [
    ...new Set(f.level.pieces.map((p) => p.kind).filter((k) => k === 'truck' || k === 'tractor' || k === 'crate')),
    ...(f.level.star ? ['star'] : []),
    'chickens'
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
