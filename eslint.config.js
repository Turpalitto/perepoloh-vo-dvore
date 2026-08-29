import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * Минимальный, но осмысленный набор: TypeScript-recommended + типозависимые
 * правила, которые tsc не ловит (плавающие/неправильно использованные promise).
 * Цель — страховка от реальных дефектов, а не косметика; форматирование —
 * забота Prettier/редактора, не линтера.
 */
export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'test-results',
      'playwright-report',
      'release',
      'promo',
      'screenshots',
      'eslint.config.js'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser, ...globals.node, ...globals.worker }
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      // async-обработчики DOM-событий (addEventListener('click', async …)) —
      // штатный паттерн и сами ловят свои ошибки; проверяем только «настоящие»
      // плавающие promise-выражения, а не void-return колбэки.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      // Код осознанно использует non-null (`this.q(...)!` бросает сам) — не ужесточаем.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },
  /**
   * Node-скрипты на чистом JS (`scripts/*.mjs`).
   *
   * `tsconfig.json` включает `scripts`, но без `allowJs`, поэтому `.mjs` в
   * TS-проект не попадает — и `projectService: true` валил линт ошибкой разбора
   * «was not found by the project service». Молчаливое последствие было хуже
   * самой ошибки: `npm run lint` падал, а вместе с ним весь релизный гейт
   * `npm run check` (typecheck + lint + test + solver + verify).
   *
   * Включать такие файлы в tsconfig только ради линтера значило бы тянуть
   * `allowJs` в проверку типов всего проекта. Правильный минимум — линтовать
   * их без типозависимых правил: синтаксис и очевидные дефекты по-прежнему
   * проверяются, а правила, которым нужен тип-чекер, для них отключены.
   */
  {
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      parserOptions: { projectService: false, project: false },
      globals: { ...globals.node }
    }
  }
);
