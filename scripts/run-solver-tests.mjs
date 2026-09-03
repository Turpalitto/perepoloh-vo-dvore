#!/usr/bin/env node
/**
 * Запускает каждый тяжёлый BFS-тестовый файл (`vitest.solver.config.ts`) в
 * СОБСТВЕННОМ дочернем процессе `vitest run <файл>`.
 *
 * Почему не хватает одного `vitest run` со всеми файлами сразу (даже с
 * `pool: 'forks', singleFork: true` и BFS, мигрированным на `solveAsync()`,
 * который сам отдаёт event loop по времени внутри поиска):
 *
 * BFS хранит карту посещённых состояний размером до ~400 000 записей на
 * каждый тяжёлый уровень. Внутри ОДНОГО процесса эти карты накапливаются от
 * файла к файлу — Node не обязан вернуть память ОС между тестами, и после
 * 4+ тяжёлых файлов подряд (несколько сотен МБ живых объектов) следующая
 * значимая GC-пауза (stop-the-world mark-sweep) на границе файлов способна
 * растянуться на десятки секунд. birpc-таймаут `onTaskUpdate` в vitest
 * захардкожен на 60с и не настраивается публичным API — если пауза GC
 * перекрывает этот порог, весь процесс `vitest` падает с "Unhandled Error:
 * [vitest-worker]: Timeout calling onTaskUpdate", и все ЕЩЁ НЕ запущенные
 * файлы просто не выполняются, независимо от того что уже пройденные тесты
 * все "passed" — самих `solve()`/`solveAsync()` вызовов эта пауза не
 * касается (они уже защищены), только межфайловый GC.
 *
 * Запуск каждого файла отдельным процессом даёт то, что `singleFork` внутри
 * одного `vitest run` дать не может: полное освобождение памяти (весь
 * процесс завершается и ОС забирает его heap) между файлами, а не только
 * между тестами внутри процесса.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const testsDir = path.join(root, 'tests');

// Тот же список, что в vitest.solver.config.ts (include), но развёрнутый в
// конкретные файлы — единственный источник правды на списки уровней остаётся
// tests/solver-shards.ts, здесь только имена файлов.
const solverPatterns = [
  /^levels-solver-\d+\.test\.ts$/,
  /^elite\.test\.ts$/,
  /^endless(?:-[a-z0-9-]+)?\.test\.ts$/,
  /^boss\.test\.ts$/,
  /^ice\.test\.ts$/
];

const files = readdirSync(testsDir)
  .filter((name) => solverPatterns.some((re) => re.test(name)))
  .sort();

if (files.length === 0) {
  console.error('run-solver-tests: не найдено ни одного тяжёлого тестового файла в tests/.');
  process.exit(1);
}

console.log(`run-solver-tests: ${files.length} файлов, каждый в отдельном процессе:\n  ${files.join('\n  ')}\n`);

const results = [];
for (const file of files) {
  const rel = path.join('tests', file);
  console.log(`\n▶ vitest run --config vitest.solver.config.ts ${rel}`);
  const started = Date.now();
  const res = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.solver.config.ts', rel], {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  });
  const durationMs = Date.now() - started;
  results.push({ file: rel, code: res.status, durationMs });
  if (res.status !== 0) {
    console.error(`\n✗ ${rel} завершился с кодом ${res.status} (${durationMs}ms)`);
  } else {
    console.log(`\n✓ ${rel} — ${durationMs}ms`);
  }
}

console.log('\n=== Итог run-solver-tests ===');
let failed = 0;
for (const r of results) {
  const mark = r.code === 0 ? '✓' : '✗';
  if (r.code !== 0) failed++;
  console.log(`${mark} ${r.file} (${Math.round(r.durationMs / 1000)}s) ${r.code === 0 ? '' : `exit ${r.code}`}`);
}

if (failed > 0) {
  console.error(`\n${failed} из ${results.length} файлов упали.`);
  process.exit(1);
}
console.log(`\nВсе ${results.length} файлов прошли.`);
