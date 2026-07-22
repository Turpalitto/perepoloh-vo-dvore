import { it } from 'vitest';

/**
 * НЕ тест в обычном смысле — фикстура для probe-теста
 * tests/unhandled-error-probe.test.ts, который запускает этот файл в
 * дочернем процессе vitest и проверяет, что настоящий unhandled rejection
 * валит прогон (exit != 0). Имя без суффикса `.test.ts`, поэтому обычным
 * `include`-глобом ни основного, ни solver-конфига этот файл не подхватывается.
 */
it('фикстура: намеренный unhandled rejection', () => {
  void Promise.reject(new Error('намеренный unhandled rejection для probe-теста'));
});
