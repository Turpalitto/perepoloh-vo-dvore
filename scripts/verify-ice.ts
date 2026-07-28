/**
 * Отчёт о значимости льда: доказывает, что ни одна ледяная клетка кампании не
 * декоративная.
 *
 * Проверка на «уровень стал сложнее» недостаточна — лёд легко поставить так,
 * что он выглядит механикой, но оптимум не трогает (замер прошлой редакции
 * правила: 111 постановок из 111 с нулевой дельтой). Поэтому для каждой клетки
 * отдельно доказывается, что без неё головоломка мельчает И что у клетки есть
 * роль в решении. Сам разбор живёт в `src/core/ice-impact.ts` — тем же кодом
 * пользуется тест кампании, чтобы отчёт и гарантия не разъезжались.
 *
 * Для каждого уровня с полем `ice`:
 *   1. уровень решаем, `par` совпадает с оптимумом, поиск не упёрся в лимит;
 *   2. удаление ЛЮБОЙ одной ледяной клетки ДОКАЗАННО снижает оптимум: поиск без
 *      клетки обязан завершиться, исчерпанный лимит состояний — не доказательство,
 *      а отсутствие ответа (и отклоняется отдельной ошибкой);
 *   3. у каждой клетки есть роль — «проезд» либо «запрет стоянки»;
 *   4. ни один ход оптимального решения не заканчивается на льду (страховка от
 *      расхождения решателя и правила: подсказка не может предложить
 *      невозможную остановку).
 *
 * Запуск: npm run verify:ice   (exit 1 при любом дефекте)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeIceImpact } from '../src/core/ice-impact';
import type { LevelDef } from '../src/core/types';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const levels = JSON.parse(readFileSync(join(root, 'src/levels/levels.json'), 'utf8')) as LevelDef[];

const problems: string[] = [];
const iceLevels = levels.filter((level) => (level.ice?.length ?? 0) > 0);

if (iceLevels.length === 0) {
  console.log('уровней со льдом нет — проверять нечего');
  process.exit(0);
}

for (const level of iceLevels) {
  const head = `уровень ${level.id} «${level.name}»`;
  const impact = analyzeIceImpact(level);

  if (!impact.solvable || impact.exhausted) {
    problems.push(`${head}: не решается (exhausted=${impact.exhausted})`);
    continue;
  }
  if (impact.fullOptimal !== level.par) {
    problems.push(`${head}: par ${level.par}, оптимум решателя ${impact.fullOptimal}`);
  }
  if (impact.landsOnIce) {
    problems.push(`${head}: оптимальное решение останавливается на льду`);
  }

  for (const cell of impact.cells) {
    if (cell.required) continue;
    const where = `(${cell.cell.x},${cell.cell.y})`;
    if (cell.exhaustedWithout) {
      // Ответа нет вовсе: принимать исчерпанный поиск за доказательство нельзя.
      problems.push(`${head}: абляция ${where} упёрлась в лимит состояний — вклад клетки не доказан`);
    } else if (!cell.solvableWithout) {
      // Честно случиться не может: снятие льда только добавляет остановки.
      problems.push(`${head}: снятие льда ${where} сделало уровень нерешаемым — противоречие в правилах или данных`);
    } else if (cell.optimalWithout >= impact.fullOptimal) {
      problems.push(
        `${head}: ледяная клетка ${where} не несёт веса — без неё оптимум ${cell.optimalWithout} (было ${impact.fullOptimal})`
      );
    } else if (cell.role === 'нет роли') {
      problems.push(`${head}: ледяная клетка ${where} не участвует в решении — декорация`);
    } else {
      problems.push(`${head}: ледяная клетка ${where} не признана значимой (роль «${cell.role}»)`);
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
  console.log(`${head}: par ${level.par}, оптимум ${impact.fullOptimal}, без клетки: ${perCell}`);
}

if (problems.length > 0) {
  console.error('\nдефекты:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`\nвсе ледяные клетки значимы (уровней со льдом: ${iceLevels.length})`);
