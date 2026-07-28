/**
 * Level Intelligence: отчёт по сложности и дубликатам всей кампании И ремиксов
 * Высшей лиги.
 *
 * Ремиксы включены намеренно: это полноценные раскладки, просто собранные из
 * конфигурации, а не записанные в levels.json. Именно поэтому дубликат в них
 * заметить труднее всего — глазами их никто не листает.
 *
 * Запуск: npm run analyze [-- --json out.json]
 * Выход 1 только при реальных дефектах: невалидный уровень или точный дубликат.
 * Находки кривой сложности — рекомендации, уровни не переставляются.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { LevelDef } from '../src/core/types';
import { analyzeDifficulty, DifficultyResult } from '../src/core/difficulty';
import { findSimilarLevels } from '../src/core/canonical';
import { validateLevel } from '../src/core/validator';
import { ELITE_CHALLENGES, sourceLevel } from '../src/levels/elite-challenges';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const campaign = JSON.parse(readFileSync(join(root, 'src/levels/levels.json'), 'utf8')) as LevelDef[];
const remixes = ELITE_CHALLENGES.filter((c) => c.remixed).map(sourceLevel);
const levels = [...campaign, ...remixes];

const jsonArgIndex = process.argv.indexOf('--json');
const jsonPath = jsonArgIndex >= 0 ? process.argv[jsonArgIndex + 1] : null;

const t0 = Date.now();
let defects = 0;

interface Row {
  id: number;
  name: string;
  declared: string;
  result: DifficultyResult;
  errors: string[];
}

const rows: Row[] = [];
for (const level of levels) {
  const errors = validateLevel(level);
  if (errors.length > 0) defects++;
  rows.push({ id: level.id, name: level.name, declared: level.difficulty, result: analyzeDifficulty(level), errors });
}

// Таблица
const table: string[][] = [['id', 'название', 'заявлено', 'tier', 'балл', 'опт', 'состояний', 'тупики', 'узкое место']];
for (const r of rows) {
  const m = r.result.metrics;
  table.push([
    String(r.id),
    r.name,
    r.declared,
    r.result.tier,
    String(r.result.score),
    String(m.optimalMoves),
    `${m.reachableStates}${m.complete ? '' : '+'}`,
    `${(m.deadRatio * 100).toFixed(0)}%`,
    String(m.bottleneckWidth)
  ]);
}
const widths = table[0].map((_, c) => Math.max(...table.map((row) => row[c].length)));
for (const row of table) console.log(row.map((cell, c) => cell.padEnd(widths[c])).join('  '));

// Находки кривой сложности
const findings: string[] = [];
for (let i = 1; i < rows.length; i++) {
  const jump = rows[i].result.score - rows[i - 1].result.score;
  if (jump >= 30) findings.push(`скачок сложности: уровень ${rows[i - 1].id} (${rows[i - 1].result.score}) → ${rows[i].id} (${rows[i].result.score})`);
}
for (const r of rows) {
  if (r.id <= 12 && (r.result.tier === 'hard' || r.result.tier === 'expert')) {
    findings.push(`ранний уровень ${r.id} оценён как ${r.result.tier} (балл ${r.result.score})`);
  }
  if (r.id > 40 && r.result.tier === 'tutorial') {
    findings.push(`поздний уровень ${r.id} слишком лёгкий (${r.result.score})`);
  }
  if (r.id > 30 && r.result.metrics.optimalMoves >= 0 && r.result.metrics.optimalMoves < 5) {
    findings.push(`подозрительно короткое решение: уровень ${r.id} — ${r.result.metrics.optimalMoves} ходов`);
  }
  for (const e of r.errors) findings.push(`ДЕФЕКТ уровня ${r.id}: ${e}`);
}

/**
 * Ремикс-отражение обязано совпадать со своим источником с точностью до
 * симметрии — это и есть определение отражения. Такая пара не дефект, а
 * доказательство, что преобразование сработало; дефектом было бы её
 * отсутствие. Любое другое стопроцентное совпадение остаётся дефектом.
 */
const allowedIdenticalPairs = new Set(
  ELITE_CHALLENGES.filter((c) => c.remixed).map((c) => {
    const level = sourceLevel(c);
    return [level.id, c.sourceLevelId].sort((a, b) => a - b).join('↔');
  })
);

// Дубликаты
const similar = findSimilarLevels(levels, 0.9);
for (const p of similar) {
  const line = `сходство ${p.a} ↔ ${p.b}: ${(p.similarity * 100).toFixed(0)}% — ${p.reason}`;
  const pairKey = [p.a, p.b].sort((a, b) => a - b).join('↔');
  if (p.similarity === 1 && allowedIdenticalPairs.has(pairKey)) {
    findings.push(`${line} (ремикс-отражение своего источника — так и задумано)`);
  } else if (p.similarity === 1) {
    defects++;
    findings.push(`ДЕФЕКТ: ${line}`);
  } else {
    findings.push(line);
  }
}

console.log(`\nНаходки (${findings.length}):`);
for (const f of findings) console.log(`- ${f}`);
if (findings.length === 0) console.log('- нет');
console.log(`\nУровней: ${levels.length}, дефектов: ${defects}, время: ${((Date.now() - t0) / 1000).toFixed(1)}с`);

if (jsonPath) {
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - t0,
        levels: rows.map((r) => ({ id: r.id, name: r.name, declared: r.declared, ...r.result, errors: r.errors })),
        similar,
        findings
      },
      null,
      2
    )
  );
  console.log(`JSON: ${jsonPath}`);
}

process.exit(defects > 0 ? 1 : 0);
