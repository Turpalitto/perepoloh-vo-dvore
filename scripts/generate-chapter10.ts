/**
 * Генератор главы 10 (версия 2): финал после финального босса.
 *
 * Почему база — двор босса id 100 (7x7, 13 фигур, par 25), а не процедурная доска:
 * пробы `probe7` показали, что случайные 7x7-дворы не достигают par 25+ (максимум
 * ~19), а поднять их лёд/курами/held до якоря не удаётся. Двор босса доказуемо
 * решается за 25 ходов, поэтому глава строится его мутациями: сдвиги 2–4 фигур
 * ломают заученный маршрут (игрок знает двор по боссу), а лёд, куры и held-кнопка
 * добавляют вес поверх. Ровно как `remix.ts` — узнаваемый двор, неработающее
 * старое решение — но в масштабе целой главы и со значимостью механик.
 *
 * Механики добавляются по одной и проверяются на ИТОГОВОМ (комбинированном)
 * уровне: порядок добавления способен обесценить более раннюю. Критерии те же,
 * что у `verify:ice` / `verify:chickens` / `verify:held` — уровень обязан пройти
 * их, а не только собраться.
 *
 * Кривая: флор ступени задаётся извне (--floor = par предыдущего уровня главы),
 * чтобы глава не понижалась внутри себя. `maxOptimal` ограничивает потолок.
 *
 * Запуск: npx tsx scripts/generate-chapter10.ts <presetName> [--seed N] [--iter N] [--floor N]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { ChickenDef, LevelDef } from '../src/core/types';
import { createState, pieceCells } from '../src/core/game';
import { type SolveMove, solve } from '../src/core/solver';
import { validateLevel } from '../src/core/validator';
import { canonicalKey } from '../src/core/canonical';
import { analyzeIceImpact } from '../src/core/ice-impact';
import { analyzeChickenImpact } from '../src/core/chicken-impact';
import { mulberry32 } from '../src/core/levelgen';

const SEARCH_LIMIT = 150_000;
const STATE_LIMIT = 200_000;

type Mech = 'ice' | 'chickens' | 'held';

interface Preset {
  name: string;
  id: number;
  seed: number;
  iterations: number;
  floor: number;
  maxOptimal: number;
  mechs: Mech[];
  iceCount: number;
  title: string;
}

const PRESETS: Record<string, Preset> = {
  l117: { name: 'l117', id: 117, seed: 20260901, iterations: 4000, floor: 25, maxOptimal: 30, mechs: ['ice'], iceCount: 2, title: 'Всё на льду' },
  l118: { name: 'l118', id: 118, seed: 20260902, iterations: 4000, floor: 25, maxOptimal: 31, mechs: ['chickens'], iceCount: 0, title: 'Куриный переполох' },
  l119: { name: 'l119', id: 119, seed: 20260903, iterations: 4000, floor: 25, maxOptimal: 32, mechs: ['held'], iceCount: 0, title: 'Задержанный выезд' },
  l120: { name: 'l120', id: 120, seed: 20260904, iterations: 4000, floor: 25, maxOptimal: 33, mechs: ['ice'], iceCount: 2, title: 'Лёд и звёзды' },
  l121: { name: 'l121', id: 121, seed: 20260905, iterations: 4000, floor: 25, maxOptimal: 34, mechs: ['chickens'], iceCount: 0, title: 'Куры и звёзды' },
  l122: { name: 'l122', id: 122, seed: 20260906, iterations: 4000, floor: 25, maxOptimal: 35, mechs: ['held'], iceCount: 0, title: 'Ворота на замке' },
  l123: { name: 'l123', id: 123, seed: 20260907, iterations: 4000, floor: 25, maxOptimal: 36, mechs: ['ice', 'chickens'], iceCount: 1, title: 'Скользкий курятник' },
  l124: { name: 'l124', id: 124, seed: 20260908, iterations: 4000, floor: 25, maxOptimal: 37, mechs: ['ice', 'held'], iceCount: 1, title: 'Лёд на страже' },
  l125: { name: 'l125', id: 125, seed: 20260909, iterations: 4000, floor: 25, maxOptimal: 38, mechs: ['chickens', 'held'], iceCount: 0, title: 'Куриный затор' },
  l126: { name: 'l126', id: 126, seed: 20260910, iterations: 4000, floor: 25, maxOptimal: 39, mechs: ['ice', 'chickens'], iceCount: 1, title: 'Тройное испытание' },
  l127: { name: 'l127', id: 127, seed: 20260911, iterations: 4000, floor: 25, maxOptimal: 40, mechs: ['ice', 'held'], iceCount: 1, title: 'Ледяной капкан' },
  l128: { name: 'l128', id: 128, seed: 20260912, iterations: 6000, floor: 25, maxOptimal: 42, mechs: ['ice', 'chickens', 'held'], iceCount: 1, title: 'Всё сразу' }
};

const args = process.argv.slice(2);
const presetName = args[0];
const preset = PRESETS[presetName];
if (!preset) throw new Error(`нет пресета; доступны: ${Object.keys(PRESETS).join(', ')}`);

function argValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}
const run = {
  seed: argValue('--seed') ? Number(argValue('--seed')) : preset.seed,
  iterations: argValue('--iter') ? Number(argValue('--iter')) : preset.iterations,
  floor: argValue('--floor') ? Number(argValue('--floor')) : preset.floor,
  fast: args.includes('--fast')
};
if (run.floor > preset.maxOptimal) {
  throw new Error(`--floor ${run.floor} больше maxOptimal ${preset.maxOptimal}`);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const campaign = JSON.parse(readFileSync(join(root, 'src/levels/levels.json'), 'utf8')) as LevelDef[];
const boss = campaign.find((l) => l.id === 100);
if (!boss) throw new Error('нет босса id 100 в кампании');
if (boss.width !== 7 || boss.height !== 7) throw new Error('босс не 7x7 — база главы изменилась');

const extraPath = join(root, 'scripts/.chapter10-extra.json');
let extra: LevelDef[] = [];
try {
  extra = JSON.parse(readFileSync(extraPath, 'utf8')) as LevelDef[];
} catch {
  extra = [];
}
const seen = new Set([...campaign, ...extra].map((l) => canonicalKey(l)));

/** Клетки, занятые фигурами/препятствиями/звездой/кнопкой. */
function occupiedKeys(level: LevelDef): Set<string> {
  const busy = new Set<string>();
  for (const piece of level.pieces) {
    for (let k = 0; k < piece.len; k++) {
      busy.add(`${piece.x + (piece.dir === 'h' ? k : 0)},${piece.y + (piece.dir === 'v' ? k : 0)}`);
    }
  }
  for (const wall of level.walls ?? []) busy.add(`${wall.x},${wall.y}`);
  if (level.star) busy.add(`${level.star.x},${level.star.y}`);
  if (level.gateSwitch) busy.add(`${level.gateSwitch.x},${level.gateSwitch.y}`);
  return busy;
}

function freeCells(level: LevelDef): Array<{ x: number; y: number }> {
  const busy = occupiedKeys(level);
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) if (!busy.has(`${x},${y}`)) cells.push({ x, y });
  }
  return cells;
}

/** Клетки, прометённые фигурами по оптимальному пути (роль «проезд»). */
function sweptKeys(level: LevelDef, path: SolveMove[]): Set<string> {
  const keys = new Set<string>();
  let state = createState(level);
  for (const move of path) {
    const def = level.pieces[move.piece];
    const from = state.pieces[move.piece];
    for (let t = 0; t <= move.steps; t++) {
      for (const c of pieceCells(def, { x: from.x + move.dx * t, y: from.y + move.dy * t, gone: false })) {
        keys.add(`${c.x},${c.y}`);
      }
    }
    const next = { ...state, pieces: state.pieces.map((p) => ({ ...p })) };
    next.pieces[move.piece] = { ...from, x: from.x + move.dx * move.steps, y: from.y + move.dy * move.steps };
    state = next;
  }
  return keys;
}

/**
 * Сдвиг 2–4 случайных фигур босса на одну клетку. Двор босса плотный, и слепой
 * сдвиг почти всегда наезжает на соседа — поэтому сдвиг принимается инкрементально:
 * каждая пробная фигура проверяется валидатором (границы, наложения, звезда под
 * фигурой), и только валидный ход сохраняется. Сдвиги ломают заученное решение,
 * не меняя состава двора (та же идея, что `shift` в `remix.ts`).
 */
function mutateBoss(rng: () => number, base: LevelDef): LevelDef {
  const axes = ['', 'x', 'y', 'xy'] as const;
  const axis = axes[Math.floor(rng() * axes.length)];
  const hExtent = (p: LevelDef['pieces'][number]) => (p.dir === 'h' ? p.len : 1);
  const vExtent = (p: LevelDef['pieces'][number]) => (p.dir === 'v' ? p.len : 1);
  let pieces = base.pieces.map((p) => ({ ...p }));
  if (axis === 'x') pieces = pieces.map((p) => ({ ...p, x: base.width - p.x - hExtent(p) }));
  if (axis === 'y') pieces = pieces.map((p) => ({ ...p, y: base.height - p.y - vExtent(p) }));
  const exit: LevelDef['exit'] =
    axis === 'x'
      ? base.exit.side === 'left'
        ? { ...base.exit, side: 'right' as const }
        : base.exit.side === 'right'
          ? { ...base.exit, side: 'left' as const }
          : { ...base.exit, index: base.width - 1 - base.exit.index }
      : axis === 'y'
        ? base.exit.side === 'top'
          ? { ...base.exit, side: 'bottom' as const }
          : base.exit.side === 'bottom'
            ? { ...base.exit, side: 'top' as const }
            : { ...base.exit, index: base.height - 1 - base.exit.index }
        : { ...base.exit };
  const walls = base.walls
    ? base.walls.map((w) => {
        let { x, y } = w;
        if (axis === 'x') x = base.width - 1 - x;
        if (axis === 'y') y = base.height - 1 - y;
        return { ...w, x, y };
      })
    : base.walls;
  const star = base.star
    ? (() => {
        let { x, y } = base.star;
        if (axis === 'x') x = base.width - 1 - x;
        if (axis === 'y') y = base.height - 1 - y;
        return { ...base.star, x, y };
      })()
    : base.star;
  const valid = (ps: LevelDef['pieces']): boolean =>
    validateLevel({ ...base, pieces: ps, exit, walls, star }).filter((e) => !e.includes('par')).length === 0;

  const shifted = new Set<string>();
  const shiftCount = 2 + Math.floor(rng() * 3);
  const candidates = pieces.filter((p) => p.kind !== 'target');
  for (let attempt = 0; attempt < 24 && shifted.size < shiftCount; attempt++) {
    const pool = candidates.filter((p) => !shifted.has(p.id));
    if (pool.length === 0) break;
    const piece = pool[Math.floor(rng() * pool.length)];
    const horiz = rng() < 0.5;
    const delta = rng() < 0.5 ? -1 : 1;
    const next = pieces.map((p) =>
      p.id === piece.id ? { ...p, x: p.x + (horiz ? delta : 0), y: p.y + (horiz ? 0 : delta) } : p
    );
    if (!valid(next)) continue;
    pieces = next;
    shifted.add(piece.id);
  }
  return { ...base, pieces, exit, walls, star };
}

/**
 * Лёд ставится жадно по клеткам оптимального пути: только «проездные» клетки
 * способны поднять оптимум, поэтому перебор остальных пустых клеток — трата
 * решений на декоративный лёд (его потом отклонит проверка значимости).
 */
function addMeaningfulIce(level: LevelDef, count: number): LevelDef | null {
  let current = level;
  for (let placed = 0; placed < count; placed++) {
    const full = solve(current, { stateLimit: SEARCH_LIMIT });
    if (!full.solvable || full.exhausted) return null;
    const swept = sweptKeys(current, full.path);
    let best: { level: LevelDef; optimal: number } | null = null;
    for (const cell of freeCells(current)) {
      if (!swept.has(`${cell.x},${cell.y}`)) continue;
      const cand: LevelDef = { ...current, ice: [...(current.ice ?? []), cell] };
      const result = solve(cand, { stateLimit: SEARCH_LIMIT });
      if (!result.solvable || result.exhausted || result.optimal <= full.optimal) continue;
      if (!best || result.optimal > best.optimal) best = { level: cand, optimal: result.optimal };
    }
    if (!best) return null;
    current = best.level;
  }
  return current;
}

/**
 * Курица ставится у оптимального пути и проходит полный разбор значимости:
 * без неё оптимум обязан упасть, и стеной её заменить нельзя. Сначала дешёвый
 * отбор по диапазону на смежных парах, затем дорогой разбор значимости — на
 * лучших по оценке кандидатах.
 *
 * fast=true пропускает дорогой разбор внутри перебора: первый кандидат,
 * проходящий диапазон, возвращается сразу. Это НЕ ослабляет гарантию —
 * finalChecksPass после сборки всё равно гоняет analyzeChickenImpact и
 * отбрасывает декоративную курицу («подменяется стеной»).
 */
function addMeaningfulChicken(level: LevelDef, lo: number, hi: number, fast: boolean): LevelDef | null {
  const full = solve(level, { stateLimit: SEARCH_LIMIT });
  if (!full.solvable || full.exhausted) return null;
  const swept = sweptKeys(level, full.path);
  const cells = freeCells(level);
  const candidates: Array<{ level: LevelDef; optimal: number }> = [];
  for (const a of cells) {
    for (const b of cells) {
      const adjacent = (a.x === b.x && Math.abs(a.y - b.y) === 1) || (a.y === b.y && Math.abs(a.x - b.x) === 1);
      if (!adjacent) continue;
      if (!swept.has(`${a.x},${a.y}`) && !swept.has(`${b.x},${b.y}`)) continue;
      const chickens: ChickenDef[] = [...(level.chickens ?? []), { a, b }];
      const cand: LevelDef = { ...level, chickens };
      const res = solve(cand, { stateLimit: SEARCH_LIMIT });
      if (!res.solvable || res.exhausted || res.optimal < lo || res.optimal > hi) continue;
      if (fast) return cand;
      candidates.push({ level: cand, optimal: res.optimal });
    }
  }
  candidates.sort((x, y) => x.optimal - y.optimal);
  const TOP = 6;
  for (const cand of candidates.slice(0, TOP)) {
    const impact = analyzeChickenImpact({ ...cand.level, par: cand.optimal }, { stateLimit: SEARCH_LIMIT });
    if (!impact.solvable || impact.exhausted) continue;
    if (impact.chickens.some((c) => !c.required)) continue;
    return cand.level;
  }
  return null;
}

/**
 * held-кнопка: босс без ворот, поэтому кнопка добавляется на клетку оптимального
 * пути — целевую. Режим held обязан быть строже once на этой же кнопке: без
 * удержания игрок проезжает переключатель насквозь и не останавливается.
 */
function addHeld(level: LevelDef): LevelDef | null {
  const full = solve(level, { stateLimit: SEARCH_LIMIT });
  if (!full.solvable || full.exhausted) return null;
  const swept = sweptKeys(level, full.path);
  const candidates: Array<{ level: LevelDef; held: number; once: number }> = [];
  for (const cell of freeCells(level)) {
    if (!swept.has(`${cell.x},${cell.y}`)) continue;
    const heldLevel: LevelDef = { ...level, gateSwitch: { x: cell.x, y: cell.y, holdType: 'held' } };
    const held = solve(heldLevel, { stateLimit: SEARCH_LIMIT });
    if (!held.solvable || held.exhausted) continue;
    const once = solve({ ...heldLevel, gateSwitch: { ...heldLevel.gateSwitch!, holdType: 'once' } }, { stateLimit: SEARCH_LIMIT });
    if (!once.solvable) {
      // штатно: с обычной кнопкой уровень вообще не проходится — held обязателен
    } else if (once.optimal >= held.optimal) {
      continue; // held не строже once — кнопка декоративная
    }
    candidates.push({ level: heldLevel, held: held.optimal, once: once.optimal });
  }
  if (candidates.length === 0) return null;
  candidates.sort((x, y) => x.held - y.held);
  return candidates[0].level;
}

/** Финальная проверка значимости всех механик уровня — то же, чем судят verify:*. */
function finalChecksPass(level: LevelDef, mechs: Mech[], floor: number, maxOptimal: number): { ok: boolean; optimal: number; reason?: string } {
  const full = solve(level, { stateLimit: STATE_LIMIT });
  if (!full.solvable || full.exhausted) return { ok: false, optimal: -1, reason: 'не решается' };
  if (full.optimal < floor || full.optimal > maxOptimal) return { ok: false, optimal: full.optimal, reason: `par вне [${floor}, ${maxOptimal}]` };

  if (mechs.includes('ice')) {
    const impact = analyzeIceImpact({ ...level, par: full.optimal }, { stateLimit: STATE_LIMIT });
    if (!impact.solvable || impact.exhausted) return { ok: false, optimal: full.optimal, reason: 'ice: не решается' };
    if (impact.landsOnIce) return { ok: false, optimal: full.optimal, reason: 'ice: остановка на льду' };
    if (impact.cells.some((c) => !c.required)) return { ok: false, optimal: full.optimal, reason: 'ice: декоративная клетка' };
  }
  if (mechs.includes('chickens')) {
    const impact = analyzeChickenImpact({ ...level, par: full.optimal }, { stateLimit: STATE_LIMIT });
    if (!impact.solvable || impact.exhausted) return { ok: false, optimal: full.optimal, reason: 'chickens: не решается' };
    if (impact.chickens.some((c) => !c.required)) return { ok: false, optimal: full.optimal, reason: 'chickens: подменяется стеной' };
  }
  if (mechs.includes('held')) {
    if (!level.gateSwitch) return { ok: false, optimal: full.optimal, reason: 'held: нет кнопки' };
    const once = solve({ ...level, gateSwitch: { ...level.gateSwitch, holdType: 'once' } }, { stateLimit: STATE_LIMIT });
    if (!once.solvable) {
      // штатно: без удержания уровень вообще не проходится
    } else if (once.optimal >= full.optimal) {
      return { ok: false, optimal: full.optimal, reason: 'held: не отличается от once' };
    }
  }
  return { ok: true, optimal: full.optimal };
}

const rng = mulberry32(run.seed);
const drop = { gen: 0, valid: 0, dup: 0, unsolvable: 0, range: 0, noIce: 0, noChicken: 0, noHeld: 0, finalFail: 0, star: 0 };
let found: { level: LevelDef; optimal: number; withStar: number } | null = null;

for (let i = 0; i < run.iterations && !found; i++) {
  if (i % 100 === 0) console.error(`  … итерация ${i}/${run.iterations}, drop=${JSON.stringify(drop)}`);

  const cand0 = mutateBoss(rng, boss);
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

  // Сдвиги и механики добавляют ходы; слишком сложная база без механик не полегчает.
  const base = solve(cand0, { stateLimit: SEARCH_LIMIT });
  if (!base.solvable || base.exhausted) {
    drop.unsolvable++;
    continue;
  }
  if (base.optimal > preset.maxOptimal) {
    drop.range++;
    continue;
  }

  let current = cand0;

  if (preset.mechs.includes('ice')) {
    const iced = addMeaningfulIce(current, preset.iceCount);
    if (!iced) {
      drop.noIce++;
      continue;
    }
    current = iced;
    const r = solve(current, { stateLimit: SEARCH_LIMIT });
    if (!r.solvable || r.exhausted) {
      drop.unsolvable++;
      continue;
    }
  }

  if (preset.mechs.includes('chickens')) {
    const withChicken = addMeaningfulChicken(current, run.floor, preset.maxOptimal + 4, run.fast);
    if (!withChicken) {
      drop.noChicken++;
      continue;
    }
    current = withChicken;
    const r = solve(current, { stateLimit: SEARCH_LIMIT });
    if (!r.solvable || r.exhausted) {
      drop.unsolvable++;
      continue;
    }
  }

  if (preset.mechs.includes('held')) {
    const heldLevel = addHeld(current);
    if (!heldLevel) {
      drop.noHeld++;
      continue;
    }
    current = heldLevel;
    const r = solve(current, { stateLimit: SEARCH_LIMIT });
    if (!r.solvable || r.exhausted) {
      drop.unsolvable++;
      continue;
    }
  }

  const check = finalChecksPass(current, preset.mechs, run.floor, preset.maxOptimal);
  if (!check.ok) {
    drop.finalFail++;
    continue;
  }

  const withStar = solve(current, { requireStar: true, stateLimit: STATE_LIMIT });
  if (!withStar.solvable || withStar.exhausted || withStar.optimal > check.optimal + 4) {
    drop.star++;
    continue;
  }

  found = { level: current, optimal: check.optimal, withStar: withStar.optimal };
}

console.log(`preset=${preset.name} found=${!!found} drop=${JSON.stringify(drop)}`);
if (found) {
  const mechanics = [
    ...new Set(found.level.pieces.map((p) => p.kind).filter((k) => k === 'truck' || k === 'tractor' || k === 'crate')),
    ...(found.level.star ? ['star'] : []),
    ...(found.level.gateSwitch ? ['gate-switch'] : []),
    ...(preset.mechs.includes('ice') ? ['ice'] : []),
    ...(preset.mechs.includes('chickens') ? ['chickens'] : []),
    ...(preset.mechs.includes('held') ? ['gate-switch'] : [])
  ];
  const out: LevelDef = {
    ...found.level,
    id: preset.id,
    name: preset.title,
    par: found.optimal,
    par2: Math.max(found.optimal + 2, found.withStar),
    difficulty: found.optimal <= 5 ? 'easy' : found.optimal <= 10 ? 'medium' : 'hard',
    role: undefined,
    mechanics
  };
  console.log(JSON.stringify(out, null, 1));
  const outDir = join(root, 'scripts/.chapter10-results');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${preset.name}.json`), JSON.stringify(out, null, 1) + '\n');
  writeFileSync(
    join(root, 'scripts/.chapter10-state.json'),
    JSON.stringify(
      {
        [preset.name]: {
          par: found.optimal,
          withStar: found.withStar,
          seed: run.seed,
          iter: run.iterations,
          floor: run.floor
        }
      },
      null,
      4
    ) + '\n'
  );
} else {
  process.exitCode = 1;
}
