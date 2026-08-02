/**
 * Подбор ледяной клетки для ремикса испытания Высшей лиги: перебирает свободные
 * клетки уровня-источника и оставляет только те, что проходят разбор
 * `verify:ice` — клетка не декоративна и имеет роль («проезд» / «запрет
 * стоянки»).
 *
 * Тот же инструмент, что `find-chicken-remix.ts`, только для льда: нужен для
 * замены испытаний с инертными досками, когда куры на источнике не находятся.
 *
 * Запуск: npx tsx scripts/find-ice-remix.ts <sourceId> <par|0> [--flip x|y]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { LevelDef } from '../src/core/types';
import { solve } from '../src/core/solver';
import { analyzeIceImpact } from '../src/core/ice-impact';

const LIMIT = 300_000;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const campaign = JSON.parse(readFileSync(join(root, 'src/levels/levels.json'), 'utf8')) as LevelDef[];

const args = process.argv.slice(2);
const sourceId = Number(args[0]);
const targetPar = Number(args[1] ?? 0);
const flipAt = args.indexOf('--flip');
const flip = flipAt >= 0 ? (args[flipAt + 1] as 'x' | 'y') : undefined;

const source = campaign.find((l) => l.id === sourceId);
if (!source) throw new Error(`нет уровня ${sourceId}`);

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
console.log(
  `источник ${sourceId} «${source.name}» flip=${flip ?? 'нет'}, свободных клеток ${cells.length}, цель par ${targetPar || 'любой'}`
);

let hits = 0;
for (const cell of cells) {
  const ice = [...(base.ice ?? []), cell];
  const cand: LevelDef = { ...base, ice };
  const res = solve(cand, { stateLimit: LIMIT });
  if (!res.solvable || (targetPar > 0 && res.optimal !== targetPar)) continue;
  const impact = analyzeIceImpact({ ...cand, par: res.optimal }, { stateLimit: LIMIT });
  if (!impact.solvable || impact.exhausted) continue;
  if (impact.cells.some((c) => !c.required)) continue;
  hits++;
  console.log(
    `ГОДНО (${cell.x},${cell.y}) → par ${res.optimal}, ${impact.cells
      .map((c) => `(${c.cell.x},${c.cell.y})→без:${c.optimalWithout} [${c.role}]`)
      .join(' ')}`
  );
}
console.log(`\nподходящих клеток: ${hits}`);
