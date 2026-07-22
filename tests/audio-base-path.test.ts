import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

/**
 * Реальная сборка с base=/game-build/ (каталожное размещение) — единственный
 * надёжный способ проверить, что URL сэмплов base-aware, а не гадать по
 * исходнику. Раньше `/audio/...` был абсолютным от корня домена и сломался бы
 * именно в таком размещении.
 */
describe('base-aware пути аудиосэмплов (production build)', () => {
  let outDir: string;

  afterAll(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true });
  });

  it('под base=/game-build/ пути сэмплов становятся /game-build/audio/..., без абсолютных /audio/...', async () => {
    outDir = await mkdtemp(join(tmpdir(), 'parkovka-base-test-'));
    await execFileAsync(
      'npx',
      ['vite', 'build', '--base=/game-build/', `--outDir=${outDir}`, '--emptyOutDir', '--mode=production'],
      { cwd: process.cwd(), shell: process.platform === 'win32', env: { ...process.env, MSYS_NO_PATHCONV: '1' } }
    );
    const assetsDir = join(outDir, 'assets');
    const files = await readdir(assetsDir);
    const jsFiles = files.filter((f) => f.endsWith('.js'));
    expect(jsFiles.length).toBeGreaterThan(0);
    const contents = await Promise.all(jsFiles.map((f) => readFile(join(assetsDir, f), 'utf8')));
    const bundle = contents.join('\n');
    expect(bundle).toContain('game-build/audio/');
    // Ни одного абсолютного /audio/... от корня домена (старый баг).
    expect(bundle).not.toMatch(/["'`]\/audio\//);
  }, 60_000);
});
