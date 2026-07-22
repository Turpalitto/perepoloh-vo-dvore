/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

/**
 * Тяжёлые BFS-solver-тесты — отдельный конфиг (npm run test:solver), не общий
 * `vite.config.ts`. Причина: под полной параллельной нагрузкой основного сьюта
 * синхронный BFS на воркере не успевал ответить на RPC-пинг репортёра
 * (onTaskUpdate) в разумный срок — это ловилось как unhandled error и раньше
 * маскировалось глобальным dangerouslyIgnoreUnhandledErrors (убран).
 * pool: 'forks' с одним форком — устойчивее к CPU-конкуренции, чем threads;
 * testTimeout выше, потому что отдельные уровни считаются десятки секунд.
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
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 180_000,
    hookTimeout: 180_000
  }
});
