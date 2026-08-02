/**
 * Подбор курицы для ремикса испытания Высшей лиги: перебирает пары клеток A/B
 * на заданном уровне-источнике и оставляет только те, что проходят полный
 * разбор `verify:chickens` — курица не декоративна И не заменяется стеной.
 *
 * Нужен для замены двух испытаний с инертными досками (см. verify-planks.ts):
 * par обязан попасть в ту же ступень дивизиона 6, иначе поедет лестница.
 *
 * Запуск: npx tsx scripts/find-chicken-remix.ts <sourceId> <par> [--flip x|y]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { LevelDef } from '../src/core/types';
import { solve } from '../src/core/solver';
import { analyzeChickenImpact } from '../src/core/chicken-impact';

const LIMIT = 300_000;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const campaign = JSON.parse(readFileSync(join(root, 'src/levels/levels.json'), 'utf8')) as LevelDef[];

const args = process.argv.slice(2);
const sourceId = Number(args[0]);
const targetPar = Number(args[1]);
const flipAt = args.indexOf('--flip');
const flip = flipAt >= 0 ? (args[flipAt + 1] as 'x' | 'y') : undefined;

const source = campaign.find((l) => l.id === sourceId);
if (!source) throw new Error(`нет уровня ${sourceId}`);

/** Зеркалим двор так же, как это делает remix.ts, — чтобы решение не совпало с кампанией. */
function mirror(level: LevelDef, axis: 'x' | 'y' | undefined): LevelDef {
  if (!axis) return level;
  const fx = (x: number, len: number, dir: string) => (axis === 'x' ? level.width - x - (dir === 'h' ? len : 1) : x);
  const fy = (y: number, len: number, dir: string) => (axis === 'y' ? level.height - y - (dir === 'v' ? len : 1) : y);
  return {
    ...level,
    pieces: level.pieces.map((p) => ({ ...p, x: fx(p.x, p.len, p.dir), y: fy(p.y, p.len, p.dir) })),
    walls: level.walls?.map((w) => ({ ...w, x: fx(w.x, 1, 'h'), y: fy(w.y, 1, 'h') })),
    ice: level.ice?.map((c) => ({ x: fx(c.x, 1, 'h'), y: fy(c.y, 1, 'h') })),
    star: level.star ? { x: fx(level.star.x, 1, 'h'), y: fy(level.star.y, 1, 'h') } : undefined,
    gateSwitch: level.gateSwitch
      ? { ...level.gateSwitch, x: fx(level.gateSwitch.x, 1, 'h'), y: fy(level.gateSwitch.y, 1, 'h') }
      : undefined,
    exit:
      axis === 'x' && (level.exit.side === 'left' || level.exit.side === 'right')
        ? { ...level.exit, side: level.exit.side === 'left' ? 'right' : 'left' }
        : axis === 'y' && (level.exit.side === 'top' || level.exit.side === 'bottom')
          ? { ...level.exit, side: level.exit.side === 'top' ? 'bottom' : 'top' }
          : level.exit
  };
}

const base = mirror(source, flip);

function freeCells(level: LevelDef): Array<{ x: number; y: number }> {
  const busy = new Set<string>();
  for (const p of level.pieces) {
    for (let k = 0; k < p.len; k++) busy.add(`${p.x + (p.dir === 'h' ? k : 0)},${p.y + (p.dir === 'v' ? k : 0)}`);
  }
  for (const w of level.walls ?? []) busy.add(`${w.x},${w.y}`);
  for (const c of level.ice ?? []) busy.add(`${c.x},${c.y}`);
  if (level.star) busy.add(`${level.star.x},${level.star.y}`);
  if (level.gateSwitch) busy.add(`${level.gateSwitch.x},${level.gateSwitch.y}`);
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) if (!busy.has(`${x},${y}`)) out.push({ x, y });
  }
  return out;
}

const cells = freeCells(base);
console.log(`источник ${sourceId} «${source.name}» flip=${flip ?? 'нет'}, свободных клеток ${cells.length}, цель par ${targetPar}`);

const hits: string[] = [];
for (const a of cells) {
  for (const b of cells) {
    // Курица ходит между двумя РАЗНЫМИ соседними по прямой клетками.
    const adjacent = (a.x === b.x && Math.abs(a.y - b.y) === 1) || (a.y === b.y && Math.abs(a.x - b.x) === 1);
    if (!adjacent) continue;
    const cand: LevelDef = { ...base, chickens: [{ a, b }] };
    const res = solve(cand, { stateLimit: LIMIT });
    // targetPar=0 — разведка: показать все годные варианты с их par.
    if (!res.solvable || (targetPar > 0 && res.optimal !== targetPar)) continue;
    const impact = analyzeChickenImpact({ ...cand, par: targetPar }, { stateLimit: LIMIT });
    if (!impact.solvable || impact.exhausted) continue;
    if (impact.chickens.some((c) => !c.required)) continue;
    const line = `A(${a.x},${a.y})/B(${b.x},${b.y}) → par ${res.optimal}, ${impact.chickens
      .map((c) => `без:${c.optimalWithout} стенаA:${c.optimalPinnedA} стенаB:${c.optimalPinnedB} [${c.role}]`)
      .join(' ')}`;
    hits.push(line);
    console.log('ГОДНО ' + line);
  }
}
console.log(`\nподходящих кур: ${hits.length}`);
