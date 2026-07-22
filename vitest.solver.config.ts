/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

/**
 * Тяжёлые BFS-solver-тесты — отдельный конфиг (npm run test:solver), не общий
 * `vite.config.ts`. Причина: синхронный BFS блокирует воркер, и репортёр не
 * может достучаться RPC-пингом (onTaskUpdate) — раньше это маскировалось
 * глобальным dangerouslyIgnoreUnhandledErrors (убран).
 *
 * Пробовали maxForks:2 (параллельно) — на CI (мало ядер) это создало
 * CPU-конкуренцию между форками и уронило отдельные тесты по их собственному
 * (более короткому) testTimeout. Серийное исполнение (singleFork) не даёт
 * форкам конкурировать за CPU, но само по себе копило синхронное время
 * блокировки на весь процесс — решается не топологией пула, а периодическим
 * `await yieldToEventLoop()` внутри многоитерационных тестов (elite/boss/
 * endless — см. tests/helpers.ts), чтобы репортёр успевал получать RPC-пинг.
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
