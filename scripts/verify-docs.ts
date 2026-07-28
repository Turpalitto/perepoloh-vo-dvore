/**
 * Сверка документации с данными игры.
 *
 * Проект развивается через ИИ-агентов, и устаревший документ здесь опаснее
 * обычного: следующий агент примет «100 уровней, 300 звёзд» за источник правды
 * и вернёт фиксированные значения в код. Это уже случалось.
 *
 * Проверяется два вида расхождений:
 *   1. трёхзначные числа рядом со словами «уровень» и «звезда» в прозе —
 *      единственные места, где документы называют размер кампании (двузначные
 *      не трогаем: «12 уровней» в описании достижения — законная цифра);
 *   2. GENERATED_PROJECT_STATS.md — снимок актуальных чисел; расходится с
 *      данными, если файл не перегенерирован.
 *
 * Запуск: npm run verify:docs        (exit 1 при расхождении)
 *         npm run verify:docs -- --write   (перегенерировать снимок)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ACHIEVEMENTS } from '../src/game/achievements';
import { CAMPAIGN_MAX_STARS, CHAPTERS, LEVELS } from '../src/game/campaign';
import { ELITE_CHALLENGES } from '../src/levels/elite-challenges';
import { ENDLESS_TEASER_AT, ENDLESS_UNLOCK_AT } from '../src/game/progression';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DOCS = ['README.md', 'PRODUCT_SPEC.md', 'IMPLEMENTATION_PLAN.md', 'TECHNICAL_DESIGN.md', 'CLAUDE.md'];
const SNAPSHOT = 'GENERATED_PROJECT_STATS.md';

const iceLevels = LEVELS.filter((level) => (level.ice?.length ?? 0) > 0);

function snapshot(): string {
  return [
    '# Актуальные числа проекта',
    '',
    'Файл генерируется `npm run verify:docs -- --write`. Руками не править:',
    'при расхождении с данными падает `npm run verify:docs`.',
    '',
    `- Уровней кампании: ${LEVELS.length}`,
    `- Звёзд за кампанию: ${CAMPAIGN_MAX_STARS}`,
    `- Глав: ${CHAPTERS.length} (размеры: ${CHAPTERS.map((c) => c.size).join(', ')})`,
    `- Уровней со льдом: ${iceLevels.length} (id ${iceLevels.map((l) => l.id).join(', ')})`,
    `- Достижений: ${ACHIEVEMENTS.length}`,
    `- Испытаний Высшей лиги: ${ELITE_CHALLENGES.length}`,
    `- Endless: тизер с позиции ${ENDLESS_TEASER_AT}, открытие с позиции ${ENDLESS_UNLOCK_AT}`,
    ''
  ].join('\n');
}

if (process.argv.includes('--write')) {
  writeFileSync(join(root, SNAPSHOT), snapshot(), 'utf8');
  console.log(`${SNAPSHOT} перегенерирован`);
  process.exit(0);
}

const problems: string[] = [];

for (const doc of DOCS) {
  let text: string;
  try {
    text = readFileSync(join(root, doc), 'utf8');
  } catch {
    continue; // документа нет — не наша забота
  }
  for (const match of text.matchAll(/(\d{3,})\s+уровн\w*/g)) {
    if (Number(match[1]) !== LEVELS.length) {
      problems.push(`${doc}: «${match[0]}», а уровней ${LEVELS.length}`);
    }
  }
  for (const match of text.matchAll(/(\d{3,})\s+(?:звёзд\w*|звезд\w*)/g)) {
    if (Number(match[1]) !== CAMPAIGN_MAX_STARS) {
      problems.push(`${doc}: «${match[0]}», а звёзд ${CAMPAIGN_MAX_STARS}`);
    }
  }
}

let current = '';
try {
  current = readFileSync(join(root, SNAPSHOT), 'utf8');
} catch {
  problems.push(`${SNAPSHOT} отсутствует — запусти npm run verify:docs -- --write`);
}
if (current && current !== snapshot()) {
  problems.push(`${SNAPSHOT} устарел — запусти npm run verify:docs -- --write`);
}

if (problems.length > 0) {
  console.error('расхождения документации и данных:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`документация согласована с данными (уровней ${LEVELS.length}, звёзд ${CAMPAIGN_MAX_STARS})`);
