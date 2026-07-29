/**
 * Отчёт о значимости хрупких досок: доказывает, что ни одна доска не
 * декоративная. Копия `verify-ice.ts`, разбор — `plank-impact.ts`.
 *
 * Запуск: npm run verify:planks   (exit 1 при любом дефекте)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzePlankImpact } from '../src/core/plank-impact';
import { ELITE_CHALLENGES, sourceLevel } from '../src/levels/elite-challenges';
import type { LevelDef } from '../src/core/types';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const levels = JSON.parse(readFileSync(join(root, 'src/levels/levels.json'), 'utf8')) as LevelDef[];
const remixes = ELITE_CHALLENGES.filter((c) => c.remixed).map(sourceLevel);

const problems: string[] = [];
const plankLevels = [...levels, ...remixes].filter((level) => (level.planks?.length ?? 0) > 0);

if (plankLevels.length === 0) {
  console.log('уровней с досками нет — проверять нечего');
  process.exit(0);
}

for (const level of plankLevels) {
  const head = `уровень ${level.id} «${level.name}»`;
  const impact = analyzePlankImpact(level);

  if (!impact.solvable || impact.exhausted) {
    problems.push(`${head}: не решается (exhausted=${impact.exhausted})`);
    continue;
  }
  if (impact.fullOptimal !== level.par) {
    problems.push(`${head}: par ${level.par}, оптимум решателя ${impact.fullOptimal}`);
  }
  if (impact.landsOnPlank) {
    problems.push(`${head}: оптимальное решение останавливается на целой доске`);
  }

  for (const cell of impact.cells) {
    if (cell.required) continue;
    const where = `(${cell.cell.x},${cell.cell.y})`;
    if (cell.exhaustedWithout) {
      problems.push(`${head}: абляция ${where} упёрлась в лимит состояний — вклад доски не доказан`);
    } else if (!cell.solvableWithout) {
      problems.push(`${head}: снятие доски ${where} сделало уровень нерешаемым — противоречие в правилах или данных`);
    } else if (cell.optimalWithout >= impact.fullOptimal) {
      problems.push(
        `${head}: доска ${where} не несёт веса — без неё оптимум ${cell.optimalWithout} (было ${impact.fullOptimal})`
      );
    } else if (cell.role === 'нет роли') {
      problems.push(`${head}: доска ${where} не участвует в решении — декорация`);
    } else {
      problems.push(`${head}: доска ${where} не признана значимой (роль «${cell.role}»)`);
    }
  }

  const perCell = impact.cells
    .map((c) => {
      const outcome = c.exhaustedWithout
        ? 'лимит состояний'
        : c.solvableWithout
          ? String(c.optimalWithout)
          : 'нерешаем';
      return `(${c.cell.x},${c.cell.y})→${outcome} [${c.role}]`;
    })
    .join(' ');
  console.log(`${head}: par ${level.par}, оптимум ${impact.fullOptimal}, без доски: ${perCell}`);
}

if (problems.length > 0) {
  console.error('\nдефекты:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`\nвсе доски значимы (раскладов с досками: ${plankLevels.length})`);
