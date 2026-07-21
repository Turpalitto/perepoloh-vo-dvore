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
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
});
