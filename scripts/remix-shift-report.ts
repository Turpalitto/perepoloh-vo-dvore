/**
 * Второй проход перебора ремиксов: сдвиг стартовой позиции одной фигуры.
 *
 * Первый проход (`remix-report.ts`) добавлял бочку или ледяную клетку и дал
 * варианты лишь по семи источникам из двадцати трёх — на большинстве дворов
 * лишняя клетка либо ничего не меняет, либо убивает звезду. Сдвиг стартовой
 * позиции бьёт по другому месту: состав двора тот же, а порядок разъезда
 * другой, поэтому заученное решение перестаёт работать даже там, где для
 * препятствия просто нет места.
 *
 *   npx tsx scripts/remix-shift-report.ts --sources 25,28,31,50,55,64,72
 */
import levelsJson from '../src/levels/levels.json';
import { solve } from '../src/core/solver';
import { validateLevel } from '../src/core/validator';
import { buildRemix, type FlipAxis, type RemixSpec } from '../src/levels/remix';
import type { LevelDef } from '../src/core/types';

const LEVELS = levelsJson as LevelDef[];
const REMIX_ID = 900;
const FLIPS: FlipAxis[] = ['x', 'y'];
const DELTAS = [-2, -1, 1, 2];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const sources = (arg('sources') ?? '')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);
const candidates = sources.length ? LEVELS.filter((l) => sources.includes(l.id)) : LEVELS;

let total = 0;

for (const source of candidates) {
  const found: string[] = [];
  for (const flip of FLIPS) {
    const base: Omit<RemixSpec, 'shift'> = {
      source: source.id,
      flip,
      name: 'проба',
      par: source.par,
      par2: source.par2
    };
    for (const piece of source.pieces) {
      // Целевую машину не двигаем: её стартовая клетка — это узнаваемость двора
      // и половина обучающего смысла уровня.
      if (piece.kind === 'target') continue;
      for (const dx of [0, ...DELTAS]) {
        for (const dy of [0, ...DELTAS]) {
          if (dx === 0 && dy === 0) continue;
          const spec: RemixSpec = { ...base, shift: [{ piece: piece.id, dx, dy }] };
          const level = buildRemix(source, spec, REMIX_ID);
          if (validateLevel(level).filter((e) => !e.includes('par')).length) continue;
          const res = solve(level);
          if (!res.solvable || res.exhausted) continue;
          if (res.optimal <= source.par) continue;
          const withStar = level.star ? solve(level, { requireStar: true }) : res;
          if (!withStar.solvable || withStar.optimal > res.optimal + 2) continue;
          found.push(`${piece.id}${dx >= 0 ? '+' : ''}${dx}/${dy >= 0 ? '+' : ''}${dy} flip:${flip} par ${res.optimal} (+${res.optimal - source.par}, звезда ${withStar.optimal})`);
          total++;
        }
      }
    }
  }
  console.log(
    `уровень ${source.id} «${source.name}» (par ${source.par}): ${found.length}` +
      (found.length ? ` — ${found.slice(0, 5).join('; ')}` : '')
  );
}

console.log(`\nвсего пригодных сдвигов: ${total}`);
