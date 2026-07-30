/**
 * Отчёт о значимости кур: доказывает, что ни одна курица не декоративна И что
 * ни одну нельзя заменить обычной стеной.
 *
 * Второе — не придирка, а главная проверка. Курица дороже стены: она добавляет
 * игроку сущность, которую надо держать в голове («где будет через ход»). Если
 * задача решается так же со стеной в клетке A или B, эта цена не оплачена, и
 * механика на таком уровне пустая — тот же дефект, что декоративный лёд.
 *
 * Разбор живёт в `src/core/chicken-impact.ts` — тем же кодом пользуется тест,
 * чтобы отчёт и гарантия не разъезжались.
 *
 * Запуск: npm run verify:chickens   (exit 1 при любом дефекте)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeChickenImpact } from '../src/core/chicken-impact';
import { ELITE_CHALLENGES, sourceLevel } from '../src/levels/elite-challenges';
import type { LevelDef } from '../src/core/types';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const levels = JSON.parse(readFileSync(join(root, 'src/levels/levels.json'), 'utf8')) as LevelDef[];
const remixes = ELITE_CHALLENGES.filter((c) => c.remixed).map(sourceLevel);

const problems: string[] = [];
const chickenLevels = [...levels, ...remixes].filter((level) => (level.chickens?.length ?? 0) > 0);

if (chickenLevels.length === 0) {
  console.log('уровней с курами нет — проверять нечего');
  process.exit(0);
}

for (const level of chickenLevels) {
  const head = `уровень ${level.id} «${level.name}»`;
  const impact = analyzeChickenImpact(level);

  if (!impact.solvable || impact.exhausted) {
    problems.push(`${head}: не решается (exhausted=${impact.exhausted})`);
    continue;
  }
  if (impact.fullOptimal !== level.par) {
    problems.push(`${head}: par ${level.par}, оптимум решателя ${impact.fullOptimal}`);
  }

  for (const entry of impact.chickens) {
    if (entry.required) continue;
    const where = `A(${entry.chicken.a.x},${entry.chicken.a.y})/B(${entry.chicken.b.x},${entry.chicken.b.y})`;
    if (entry.exhaustedWithout) {
      problems.push(`${head}: абляция ${where} упёрлась в лимит состояний — вклад курицы не доказан`);
    } else if (!entry.solvableWithout) {
      problems.push(`${head}: снятие курицы ${where} сделало уровень нерешаемым — противоречие в правилах или данных`);
    } else if (entry.optimalWithout >= impact.fullOptimal) {
      problems.push(
        `${head}: курица ${where} не несёт веса — без неё оптимум ${entry.optimalWithout} (было ${impact.fullOptimal})`
      );
    } else if (entry.exhaustedPinned) {
      problems.push(`${head}: статичный вариант ${where} упёрся в лимит — не доказано, что цикл нужен`);
    } else {
      problems.push(
        `${head}: курица ${where} подменяется стеной — оптимум со стеной A=${entry.optimalPinnedA}, B=${entry.optimalPinnedB} при ${impact.fullOptimal} с циклом`
      );
    }
  }

  const perChicken = impact.chickens
    .map((entry) => {
      const bare = entry.exhaustedWithout ? 'лимит' : entry.solvableWithout ? String(entry.optimalWithout) : 'нерешаем';
      return `A(${entry.chicken.a.x},${entry.chicken.a.y})/B(${entry.chicken.b.x},${entry.chicken.b.y})→без:${bare} стенаA:${entry.optimalPinnedA} стенаB:${entry.optimalPinnedB} [${entry.role}]`;
    })
    .join(' ');
  console.log(`${head}: par ${level.par}, оптимум ${impact.fullOptimal}, ${perChicken}`);
}

if (problems.length > 0) {
  console.error('\nдефекты:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`\nвсе куры значимы и стеной не заменяются (раскладов с курами: ${chickenLevels.length})`);
