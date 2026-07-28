/**
 * Генератор ледяных уровней. Этим скриптом сделана обучающая мини-глава
 * 105–108, и он же — способ её воспроизвести или продолжить: сиды пресетов
 * фиксированы, выдача детерминирована.
 *
 * Отличий от `scripts/generate.ts` два, и оба существенные:
 *   1. набор механик задаётся явно — обучающему уровню нельзя вывалить разом
 *      лёд, звезду, грузовик и ящик;
 *   2. лёд не расставляется случайно. Каждая клетка ставится только туда, где
 *      она поднимает оптимум: случайный лёд почти всегда декоративный (замер
 *      старой редакции правила — 0 подъёмов на 111 постановок).
 *
 * Итоговую значимость всё равно доказывает `npm run verify:ice` по уже
 * вставленным уровням: здесь клетка проверяется в момент постановки, а там —
 * в финальной комбинации и с обязательной ролью («проезд» / «запрет стоянки»).
 *
 * Запуск: npx tsx scripts/generate-ice.ts <preset> [--preview]
 *   preset — intro | lane | truck | star (см. PRESETS)
 *   --preview — печатать ASCII-схему и оптимальный путь каждого кандидата
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
  iceCount: number;
  pieceMin: number;
  pieceMax: number;
  kinds: Array<PieceDef['kind']>;
  star: boolean;
  maxWalls: number;
  minWalls: number;
  /** Требовать, чтобы ледяные клетки лежали одной сплошной линией. */
  iceLine: boolean;
}

/**
 * Мини-глава стоит между id 41 (par 9) и id 42 (par 9), поэтому её par обязан
 * расти внутри себя и остаться ниже 9: 5 → 6 → 7 → 8. Отсюда узкие диапазоны
 * оптимума у пресетов — каждый отвечает ровно за одну ступень.
 *
 * Какой кандидат каждого пресета попал в кампанию (индекс в выдаче):
 *   intro → 2 (id 105), lane → 1 (id 106), truck → 5 (id 107), star → 4 (id 108).
 */
const PRESETS: Record<string, Preset> = {
  // 105 — знакомство: одна ледяная клетка, ничего кроме машин.
  intro: {
    name: 'intro',
    seed: 20260727,
    iterations: 60000,
    minOptimal: 4,
    maxOptimal: 5,
    iceCount: 1,
    pieceMin: 5,
    pieceMax: 7,
    kinds: ['car'],
    star: false,
    maxWalls: 2,
    minWalls: 0,
    iceLine: false
  },
  // 106 — «проехать насквозь»: ледяная полоса из нескольких клеток подряд.
  lane: {
    name: 'lane',
    seed: 20260728,
    iterations: 120000,
    minOptimal: 6,
    maxOptimal: 6,
    iceCount: 2,
    pieceMin: 4,
    pieceMax: 7,
    kinds: ['car'],
    star: false,
    maxWalls: 3,
    minWalls: 0,
    iceLine: true
  },
  // 107 — лёд ломает очевидный короткий путь; появляется грузовик.
  truck: {
    name: 'truck',
    seed: 20260729,
    iterations: 120000,
    minOptimal: 7,
    maxOptimal: 7,
    iceCount: 2,
    pieceMin: 5,
    pieceMax: 8,
    kinds: ['car', 'truck'],
    star: false,
    maxWalls: 2,
    minWalls: 0,
    iceLine: false
  },
  // 108 — выход главы на кривую кампании: лёд плюс одна знакомая механика (звезда).
  star: {
    name: 'star',
    seed: 20260730,
    iterations: 120000,
    minOptimal: 8,
    maxOptimal: 8,
    iceCount: 2,
    pieceMin: 6,
    pieceMax: 9,
    kinds: ['car', 'truck', 'tractor'],
    star: true,
    maxWalls: 3,
    minWalls: 0,
    iceLine: false
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

/** Лёд ставится только туда, где он реально удлиняет оптимум (иначе — декорация). */
function addMeaningfulIce(level: LevelDef, baseOptimal: number, count: number, line: boolean): LevelDef | null {
  let current = level;
  let currentOptimal = baseOptimal;
  for (let placed = 0; placed < count; placed++) {
    let best: { level: LevelDef; optimal: number } | null = null;
    for (const cell of freeCells(current)) {
      // Полоса «проехать насквозь» должна читаться как одна колея, а не как
      // россыпь клеток: каждая следующая примыкает к предыдущей по прямой.
      if (line && placed > 0) {
        const prev = current.ice!.at(-1)!;
        const adjacent =
          (prev.x === cell.x && Math.abs(prev.y - cell.y) === 1) ||
          (prev.y === cell.y && Math.abs(prev.x - cell.x) === 1);
        if (!adjacent) continue;
      }
      const cand: LevelDef = { ...current, ice: [...(current.ice ?? []), cell] };
      const result = solve(cand, { stateLimit: STATE_LIMIT });
      if (!result.solvable || result.optimal <= currentOptimal) continue;
      if (!best || result.optimal > best.optimal) best = { level: cand, optimal: result.optimal };
    }
    if (!best) return null;
    current = best.level;
    currentOptimal = best.optimal;
  }
  return current;
}

const args = process.argv.slice(2);
const preview = args.includes('--preview');
const preset = PRESETS[args.find((a) => !a.startsWith('--')) ?? 'intro'];
if (!preset) throw new Error(`нет пресета; доступны: ${Object.keys(PRESETS).join(', ')}`);

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const campaign = JSON.parse(readFileSync(join(root, 'src/levels/levels.json'), 'utf8')) as LevelDef[];
const seen = new Set(campaign.map((l) => canonicalKey(l)));

const rng = mulberry32(preset.seed);
const opts = { ...GEN_6X6, pieceMin: preset.pieceMin, pieceMax: preset.pieceMax };
const found: Array<{ level: LevelDef; optimal: number; withStar: number }> = [];
const drop = { gen: 0, kinds: 0, walls: 0, valid: 0, dup: 0, unsolvable: 0, noIce: 0, range: 0, star: 0 };

for (let i = 0; i < preset.iterations; i++) {
  const raw = genCandidate(rng, opts);
  if (!raw) {
    drop.gen++;
    continue;
  }

  // Генератор всегда кладёт звезду и тянет случайный набор фигур — обучающей
  // главе нужен ровно заданный набор механик, поэтому лишнее отсекаем здесь.
  if (raw.pieces.some((p) => p.kind !== 'target' && !preset.kinds.includes(p.kind))) {
    drop.kinds++;
    continue;
  }
  const walls = raw.walls ?? [];
  if (walls.length > preset.maxWalls || walls.length < preset.minWalls) {
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

  const plain0 = solve(cand0, { stateLimit: STATE_LIMIT });
  if (!plain0.solvable) {
    drop.unsolvable++;
    continue;
  }

  const iced = addMeaningfulIce(cand0, plain0.optimal, preset.iceCount, preset.iceLine);
  if (!iced) {
    drop.noIce++;
    continue;
  }
  const plain = solve(iced, { stateLimit: STATE_LIMIT });
  if (!plain.solvable || plain.optimal < preset.minOptimal || plain.optimal > preset.maxOptimal) {
    drop.range++;
    continue;
  }

  const withStar = preset.star ? solve(iced, { requireStar: true, stateLimit: STATE_LIMIT }) : plain;
  if (!withStar.solvable || withStar.optimal > plain.optimal + 3) {
    drop.star++;
    continue;
  }

  found.push({ level: iced, optimal: plain.optimal, withStar: withStar.optimal });
  if (found.length >= 12) break;
}

/** ASCII-схема кандидата: `*` — лёд, `#` — стена, `$` — звезда, `T` — целевая. */
function renderBoard(level: LevelDef): string {
  const grid: string[][] = Array.from({ length: level.height }, () => Array<string>(level.width).fill('.'));
  for (const cell of level.ice ?? []) grid[cell.y][cell.x] = '*';
  for (const wall of level.walls ?? []) grid[wall.y][wall.x] = '#';
  level.pieces.forEach((p, i) => {
    const tag = p.kind === 'target' ? 'T' : String.fromCharCode(97 + i);
    for (let k = 0; k < p.len; k++) grid[p.y + (p.dir === 'v' ? k : 0)][p.x + (p.dir === 'h' ? k : 0)] = tag;
  });
  if (level.star) grid[level.star.y][level.star.x] = '$';
  return grid.map((row, y) => row.join(' ') + (y === level.exit.index ? '  <- выезд' : '')).join('\n');
}

console.log(`preset=${preset.name} kept=${found.length} drop=${JSON.stringify(drop)}`);
found.forEach((f, index) => {
  // Вклад каждой клетки по отдельности: без неё оптимум обязан просесть, иначе
  // клетка держится только за компанию с соседней и в кампанию её брать нельзя.
  const ice = f.level.ice ?? [];
  const perCell = ice
    .map((cell, i) => {
      const without = solve({ ...f.level, ice: ice.filter((_, k) => k !== i) }, { stateLimit: STATE_LIMIT });
      return `(${cell.x},${cell.y})→${without.solvable ? without.optimal : 'нерешаем'}`;
    })
    .join(' ');
  console.log(`# ${index}: par ${f.optimal}, без клетки: ${perCell}`);
  if (preview) {
    console.log(renderBoard(f.level));
    const path = solve(f.level, { stateLimit: STATE_LIMIT }).path;
    console.log(
      'путь: ' +
        path
          .map(
            (m) =>
              `${f.level.pieces[m.piece].id}${m.dx > 0 ? '→' : m.dx < 0 ? '←' : m.dy > 0 ? '↓' : '↑'}${m.steps}`
          )
          .join(' ')
    );
  }
});
for (const f of found) {
  const mechanics = [
    ...new Set(f.level.pieces.map((p) => p.kind).filter((k) => k === 'truck' || k === 'tractor' || k === 'crate')),
    ...(f.level.star ? ['star'] : []),
    'ice'
  ];
  console.log(
    JSON.stringify({
      ...f.level,
      ice: f.level.ice,
      par: f.optimal,
      par2: Math.max(f.optimal + 2, f.withStar),
      difficulty: f.optimal <= 5 ? 'easy' : f.optimal <= 10 ? 'medium' : 'hard',
      role: 'tutorial',
      mechanics
    })
  );
}
