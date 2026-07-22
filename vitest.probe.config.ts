/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

/**
 * Только для tests/unhandled-error-probe.test.ts: запускает фикстуру
 * tests/fixtures/unhandled-rejection.fixture.test.ts в отдельном процессе и
 * проверяет, что настоящий unhandled rejection валит прогон (exit != 0).
 * Никакого dangerouslyIgnoreUnhandledErrors — это ровно то, что мы проверяем.
 */
export default defineConfig({
  test: {
    include: ['tests/fixtures/*.fixture.test.ts'],
    environment: 'node'
  }
});
