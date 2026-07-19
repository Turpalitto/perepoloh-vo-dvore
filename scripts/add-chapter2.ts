/**
 * Сборка 72 уровней: обучение 1–9 закреплено, остальные отсортированы
 * по сложности, каждый 12-й слот — босс 7×7.
 * Запуск: npx tsx scripts/add-chapter2.ts <файл-кандидатов-6x6> <файл-боссов-7x7>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { LevelDef } from '../src/core/types';
import { solve } from '../src/core/solver';
import { validateLevel } from '../src/core/validator';

const NEW_NAMES = [
  'Рассвет над полем', 'Гости с ярмарки', 'Сарай на замке', 'Молочный рейс', 'Тропинка к бане',
  'Сосед на тракторе', 'Бочки на счету', 'Огородная страда', 'Тесный сеновал', 'Вечерний разъезд',
  'Дровяной затор', 'Курятник шумит', 'Хитрый закуток', 'Три подводы', 'Северный угол',
  'Задний двор', 'Гараж деда', 'Обходной путь', 'Сенная лихорадка', 'Узкие воротца',
  'Долгий выезд', 'Круговорот', 'Стальной затор', 'Хмурое утро', 'Точный расчёт',
  'Лабиринт из ящиков', 'Час пик в деревне', 'Великая уборка', 'Последняя миля', 'Дворовый гамбит'
];
const BOSS_NAMES = [
  'Босс: Большая ярмарка', 'Босс: Осенний завал', 'Босс: Тракторный слёт',
  'Босс: Сенокосный аврал', 'Босс: Деревенский узел', 'Босс: Царь двора'
];
const BOSS_SLOTS = [12, 24, 36, 48, 60, 72];

function readCandidates(file: string): LevelDef[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('{"id"'))
    .map((l) => JSON.parse(l) as LevelDef);
}

function fillMeta(l: LevelDef): void {
  const kinds = new Set(l.pieces.map((p) => p.kind));
  l.mechanics = (['truck', 'tractor', 'crate'] as const).filter((k) => kinds.has(k)) as string[];
  if (l.star) l.mechanics.push('star');
  l.difficulty = 'hard';
}

const existing = JSON.parse(readFileSync('src/levels/levels.json', 'utf8')) as LevelDef[];
const pinned = existing.filter((l) => l.id <= 9);
const oldPool = existing.filter((l) => l.id >= 10);

const ch2All = readCandidates(process.argv[2]);
const bossAll = readCandidates(process.argv[3]);

// дедупликация и отбор
const seen = new Set<string>();
const uniq = (arr: LevelDef[]) =>
  arr.filter((c) => {
    const k = JSON.stringify(c.pieces) + JSON.stringify(c.star);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

const ch2 = uniq(ch2All).slice(0, 30);
ch2.forEach((l, i) => {
  l.name = NEW_NAMES[i];
  delete l.hint;
  fillMeta(l);
});

// боссы: 6 самых сложных, по возрастанию — финальный босс сильнейший
const bosses = uniq(bossAll)
  .sort((a, b) => b.par - a.par)
  .slice(0, 6)
  .sort((a, b) => a.par - b.par);
if (bosses.length < 6) {
  console.error(`боссов только ${bosses.length}, нужно 6`);
  process.exit(1);
}
bosses.forEach((l, i) => {
  l.name = BOSS_NAMES[i];
  delete l.hint;
  fillMeta(l);
});

const pool = [...oldPool, ...ch2].sort((a, b) => a.par - b.par || a.par2 - b.par2);
if (pool.length !== 57) {
  console.error(`в пуле ${pool.length} уровней, нужно 57`);
  process.exit(1);
}

const result: LevelDef[] = [...pinned];
let poolIdx = 0;
let bossIdx = 0;
for (let id = 10; id <= 72; id++) {
  const src = BOSS_SLOTS.includes(id) ? bosses[bossIdx++] : pool[poolIdx++];
  src.id = id;
  result.push(src);
}

// контрольная проверка каждого уровня решателем
for (const l of result) {
  const errors = validateLevel(l);
  if (errors.length > 0) {
    console.error(`уровень ${l.id} «${l.name}»:`, errors);
    process.exit(1);
  }
  const plain = solve(l, { stateLimit: 600_000 });
  if (!plain.solvable || plain.optimal !== l.par) {
    console.error(`уровень ${l.id} «${l.name}»: par=${l.par}, решатель=${plain.optimal}`);
    process.exit(1);
  }
  const withStar = l.star ? solve(l, { requireStar: true, stateLimit: 600_000 }) : null;
  if (withStar && (!withStar.solvable || withStar.optimal > l.par2)) {
    console.error(`уровень ${l.id} «${l.name}»: звезда ${withStar.optimal} > par2=${l.par2}`);
    process.exit(1);
  }
  console.log(`${l.id}\t${l.width}x${l.height}\tpar=${l.par}\t${l.name}`);
}

writeFileSync('src/levels/levels.json', JSON.stringify(result, null, 2) + '\n');
console.log(`\nsrc/levels/levels.json: ${result.length} уровней`);
