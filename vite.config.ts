/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2018',
    assetsInlineLimit: 8192
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
});
