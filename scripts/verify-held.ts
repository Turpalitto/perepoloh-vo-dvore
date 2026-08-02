/**
 * Отчёт о значимости held-кнопки: доказывает, что режим `holdType: 'held'`
 * (ворота открыты, только пока клетка кнопки занята) реально меняет задачу, а
 * не только текст правила.
 *
 * Сравнение ровно по одному фактору: тот же уровень с той же кнопкой в режиме
 * `once`. Если оптимум совпал, `held` — косметический флаг: игрок читает новое
 * правило, а решает прежнюю головоломку.
 *
 * Проверка появилась после разбора хрупких досок (2026-08-02): там механика
 * оказалась неотличима ни ото льда, ни от обычной стены, и `verify:planks` это
 * пропускал, потому что доказывал лишь «клетка что-то меняет». Общее правило,
 * выведенное оттуда: механику сравнивают не с пустотой, а с самым дешёвым
 * способом изобразить то же самое.
 *
 * Запуск: npm run verify:held   (exit 1 при любом дефекте)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { solve } from '../src/core/solver';
import { ELITE_CHALLENGES, sourceLevel } from '../src/levels/elite-challenges';
import type { LevelDef } from '../src/core/types';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const levels = JSON.parse(readFileSync(join(root, 'src/levels/levels.json'), 'utf8')) as LevelDef[];
const remixes = ELITE_CHALLENGES.filter((c) => c.remixed).map(sourceLevel);

const problems: string[] = [];
const heldLevels = [...levels, ...remixes].filter((level) => level.gateSwitch?.holdType === 'held');

if (heldLevels.length === 0) {
  console.log('уровней с held-кнопкой нет — проверять нечего');
  process.exit(0);
}

for (const level of heldLevels) {
  const head = `уровень ${level.id} «${level.name}»`;
  const held = solve(level);
  const once = solve({ ...level, gateSwitch: { ...level.gateSwitch!, holdType: 'once' } });

  if (!held.solvable || held.exhausted) {
    problems.push(`${head}: не решается (exhausted=${held.exhausted})`);
    continue;
  }
  if (held.optimal !== level.par) {
    problems.push(`${head}: par ${level.par}, оптимум решателя ${held.optimal}`);
  }
  if (!once.solvable) {
    // Штатный случай: без удержания уровень вообще не проходится — режим несёт
    // максимальный вес.
    console.log(`${head}: par ${level.par}, held ${held.optimal}, в режиме once нерешаем`);
    continue;
  }
  if (once.optimal >= held.optimal) {
    problems.push(
      `${head}: удержание не играет — в режиме once оптимум ${once.optimal} при ${held.optimal} с held`
    );
    continue;
  }
  console.log(`${head}: par ${level.par}, held ${held.optimal}, once ${once.optimal} (+${held.optimal - once.optimal})`);
}

if (problems.length > 0) {
  console.error('\nдефекты:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`\nвсе held-кнопки значимы (раскладов: ${heldLevels.length})`);
