/**
 * Одноразовая сборка уровней 13–24 из выводов генератора.
 * Запуск: npx tsx scripts/merge-levels.ts <файл-вывода-1> <файл-вывода-2>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { LevelDef } from '../src/core/types';
import { solve } from '../src/core/solver';
import { validateLevel } from '../src/core/validator';

const NAMES: [string, string | undefined][] = [
  ['Утренняя суета', undefined],
  ['Ярмарочный день', undefined],
  ['Упрямое стадо', undefined],
  ['Переулок ящиков', undefined],
  ['Урожайный хаос', undefined],
  ['Старый двор', undefined],
  ['Двойная беда', undefined],
  ['Дворовый узел', undefined],
  ['Час петуха', undefined],
  ['Большой манёвр', undefined],
  ['Мастерский план', undefined],
  ['Великий побег', undefined]
];

const candidates: LevelDef[] = [];
for (const file of process.argv.slice(2)) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('{"id":0')) candidates.push(JSON.parse(line) as LevelDef);
  }
}
console.log(`кандидатов: ${candidates.length}`);

// дедупликация по расстановке, сортировка по сложности (par по возрастанию)
const seen = new Set<string>();
const unique = candidates.filter((c) => {
  const key = JSON.stringify(c.pieces) + JSON.stringify(c.walls) + JSON.stringify(c.star);
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
unique.sort((a, b) => a.par - b.par || a.pieces.length - b.pieces.length);
const picked = unique.slice(0, 12);
if (picked.length < 12) {
  console.error('мало кандидатов');
  process.exit(1);
}

const existing = JSON.parse(readFileSync('src/levels/levels.json', 'utf8')) as LevelDef[];
const base = existing.filter((l) => l.id <= 12);

picked.forEach((lvl, i) => {
  lvl.id = 13 + i;
  lvl.name = NAMES[i][0];
  if (NAMES[i][1] !== undefined) lvl.hint = NAMES[i][1];
  else delete lvl.hint;
  lvl.difficulty = 'hard';
  const kinds = new Set(lvl.pieces.map((p) => p.kind));
  lvl.mechanics = (['truck', 'tractor', 'crate'] as const).filter((k) => kinds.has(k));
  if (lvl.star) lvl.mechanics.push('star');
  // контрольная проверка
  const errors = validateLevel(lvl, { withSolver: true });
  if (errors.length > 0) {
    console.error(`уровень ${lvl.id} не прошёл проверку:`, errors);
    process.exit(1);
  }
  const plain = solve(lvl);
  console.log(`уровень ${lvl.id} «${lvl.name}»: par=${lvl.par} (решатель: ${plain.optimal}), par2=${lvl.par2}`);
});

writeFileSync('src/levels/levels.json', JSON.stringify([...base, ...picked], null, 2) + '\n');
console.log('src/levels/levels.json обновлён: ' + (base.length + picked.length) + ' уровней');
