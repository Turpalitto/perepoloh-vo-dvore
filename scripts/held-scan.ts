/**
 * Разведка по held-кнопке: на каких уровнях кампании с `gateSwitch` режим
 * `held` (ворота открыты, только пока кнопка занята) поднимает оптимум против
 * обычного `once`. Там, где не поднимает, режим — косметика.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { LevelDef } from '../src/core/types';
import { solve } from '../src/core/solver';

const LIMIT = 300_000;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const campaign = JSON.parse(readFileSync(join(root, 'src/levels/levels.json'), 'utf8')) as LevelDef[];
const withSwitch = campaign.filter((l) => l.gateSwitch);

console.log(`уровней с кнопкой ворот: ${withSwitch.length}`);
let meaningful = 0;
for (const level of withSwitch) {
  const once = solve({ ...level, gateSwitch: { ...level.gateSwitch!, holdType: 'once' } }, { stateLimit: LIMIT });
  const held = solve({ ...level, gateSwitch: { ...level.gateSwitch!, holdType: 'held' } }, { stateLimit: LIMIT });
  const gain = held.solvable ? held.optimal - once.optimal : NaN;
  if (held.solvable && gain > 0) meaningful++;
  console.log(
    `${String(level.id).padStart(3)} «${level.name}»: once ${once.optimal} → held ${
      held.solvable ? held.optimal : 'нерешаем'
    }${held.solvable && gain > 0 ? `  (+${gain})` : ''}`
  );
}
console.log(`\nheld поднимает оптимум на ${meaningful} из ${withSwitch.length}`);
