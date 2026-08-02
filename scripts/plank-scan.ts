/**
 * Разведка: существует ли вообще клетка, где хрупкая доска отличается от
 * неразрушаемого льда. Перебирает все свободные клетки заданных уровней
 * кампании и сравнивает оптимум «доска» против «лёд».
 *
 * Нужно, чтобы решить судьбу механики: если подъёма нет нигде, доска — это лёд
 * с другой картинкой, и контент под неё писать нельзя.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { LevelDef } from '../src/core/types';
import { solve } from '../src/core/solver';

const LIMIT = 150_000;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const campaign = JSON.parse(readFileSync(join(root, 'src/levels/levels.json'), 'utf8')) as LevelDef[];

const minPar = Number(process.argv[2] ?? 12);
const targets = campaign.filter((l) => l.par >= minPar);
console.log(`сканирую ${targets.length} уровней с par >= ${minPar}`);

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

let hits = 0;
let tried = 0;
for (const level of targets) {
  for (const cell of freeCells(level)) {
    const withPlank = solve({ ...level, planks: [cell] }, { stateLimit: LIMIT });
    if (!withPlank.solvable) continue;
    const asIce = solve({ ...level, ice: [...(level.ice ?? []), cell] }, { stateLimit: LIMIT });
    if (!asIce.solvable) continue;
    tried++;
    if (withPlank.optimal > asIce.optimal) {
      hits++;
      console.log(
        `НАЙДЕНО ${level.id} «${level.name}» (${cell.x},${cell.y}): доска ${withPlank.optimal} > лёд ${asIce.optimal} (база ${level.par})`
      );
    }
  }
}
console.log(`\nпроверено постановок: ${tried}, подъёмов от разрушения: ${hits}`);
