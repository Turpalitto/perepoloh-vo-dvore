import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

/**
 * Гарантия того, что мы не молчим об unhandled errors: dangerouslyIgnoreUnhandledErrors
 * убран из vite.config.ts, но это надо доказывать, а не декларировать. Спавним
 * vitest в дочернем процессе на fixture с намеренным unhandled rejection
 * (vitest.probe.config.ts, отдельно от основного/solver конфига) и проверяем,
 * что процесс реально падает — если кто-то вернёт dangerouslyIgnoreUnhandledErrors,
 * этот тест покраснеет.
 */
describe('unhandled errors не игнорируются глобально', () => {
  it('настоящий unhandled rejection валит прогон vitest (exit code != 0)', async () => {
    await expect(
      execFileAsync('npx', ['vitest', 'run', '--config', 'vitest.probe.config.ts'], {
        cwd: process.cwd(),
        shell: process.platform === 'win32'
      })
    ).rejects.toMatchObject({ code: expect.any(Number) });
  }, 30_000);
});
