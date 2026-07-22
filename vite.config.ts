/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  base: './',
  plugins: [
    legacy({
      targets: ['Chrome >= 50', 'Firefox >= 52', 'Edge >= 15', 'Safari >= 9', 'iOS >= 9', 'Opera >= 37']
    })
  ],
  build: {
    assetsInlineLimit: 8192
  },
  test: {
    // Тяжёлые BFS-solver-файлы (levels-solver-*, elite, endless, boss) гоняются
    // отдельной командой `npm run test:solver` — см. package.json. Держать их
    // здесь под полной параллельной нагрузкой упирало отдельные тесты в RPC-таймаут
    // репортёра (worker занят синхронным BFS, не отвечает на onTaskUpdate), что
    // раньше маскировалось глобальным dangerouslyIgnoreUnhandledErrors — эта
    // настройка скрывала вообще ЛЮБОЙ unhandled error, не только этот один.
    // Изоляция обычных/тяжёлых тестов в разные команды убирает саму причину.
    include: ['tests/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      'tests/fixtures/**',
      'tests/levels-solver-*.test.ts',
      'tests/elite.test.ts',
      'tests/endless.test.ts',
      'tests/boss.test.ts'
    ],
    environment: 'node'
  }
});
