/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

/**
 * Тяжёлые BFS-solver-тесты — отдельный конфиг (npm run test:solver), не общий
 * `vite.config.ts`. Причина: синхронный BFS блокирует воркер, и репортёр не
 * может достучаться RPC-пингом (onTaskUpdate) — раньше это маскировалось
 * глобальным dangerouslyIgnoreUnhandledErrors (убран).
 *
 * ВАЖНО: singleFork:true здесь не годится — он сериализует ВСЕ файлы в один
 * долгоживущий процесс, и синхронное время блокировки накапливается по всей
 * сессии (elite 52с + boss 16с + endless 80с подряд = >148с в одном воркере),
 * пока RPC-пинг всё равно не поймает таймаут — именно так это и упало на CI.
 * maxForks:2 даёт каждому файлу более короткие, изолированные окна блокировки
 * в параллельных процессах — то же снижение CPU-конкуренции без накопления.
 */
export default defineConfig({
  test: {
    include: [
      'tests/levels-solver-*.test.ts',
      'tests/elite.test.ts',
      'tests/endless.test.ts',
      'tests/boss.test.ts'
    ],
    exclude: ['**/node_modules/**', 'tests/fixtures/**'],
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { maxForks: 2 } },
    testTimeout: 180_000,
    hookTimeout: 180_000
  }
});
