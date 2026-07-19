/**
 * Отчёт решателя по всем уровням: валидность, оптимум, оптимум со звездой,
 * сверка с par/par2. Выход с кодом 1 при любой проблеме.
 * Запуск: npm run solve
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { LevelDef } from '../src/core/types';
import { solve } from '../src/core/solver';
import { validateLevel } from '../src/core/validator';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const levels = JSON.parse(readFileSync(join(root, 'src/levels/levels.json'), 'utf8')) as LevelDef[];

let failed = false;
const rows: string[][] = [['id', 'название', 'слож.', 'оптимум', 'со звездой', 'par', 'par2', 'статус']];

for (const level of levels) {
  const errors = validateLevel(level);
  if (errors.length > 0) {
    failed = true;
    rows.push([String(level.id), level.name, level.difficulty, '-', '-', String(level.par), String(level.par2), `ОШИБКИ: ${errors.join('; ')}`]);
    continue;
  }
  const plain = solve(level);
  const withStar = level.star ? solve(level, { requireStar: true }) : null;
  const problems: string[] = [];
  if (!plain.solvable) problems.push(plain.exhausted ? 'ЛИМИТ ПОИСКА' : 'НЕПРОХОДИМ');
  else {
    if (plain.optimal !== level.par) problems.push(`par!=${plain.optimal}`);
    if (withStar && !withStar.solvable) problems.push('звезда недостижима');
    if (withStar && withStar.solvable && withStar.optimal > level.par2) problems.push(`par2<${withStar.optimal}`);
  }
  if (problems.length > 0) failed = true;
  rows.push([
    String(level.id),
    level.name,
    level.difficulty,
    plain.solvable ? String(plain.optimal) : '—',
    withStar ? (withStar.solvable ? String(withStar.optimal) : '—') : '·',
    String(level.par),
    String(level.par2),
    problems.length > 0 ? problems.join(', ') : 'ок'
  ]);
}

const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
for (const r of rows) {
  console.log(r.map((cell, c) => cell.padEnd(widths[c])).join('  '));
}
console.log(failed ? '\nЕсть проблемы — см. таблицу.' : `\nВсе ${levels.length} уровней валидны и проходимы.`);
process.exit(failed ? 1 : 0);
