import { describe, expect, it, vi } from 'vitest';
import { SampleLoader } from '../src/game/sound-registry';
import type { SampleFetcher } from '../src/game/sound-registry';

const fakeBuffer = { duration: 0.3 } as AudioBuffer;

function okFetcher(): SampleFetcher {
  return {
    fetchArrayBuffer: vi.fn(async () => new ArrayBuffer(8)),
    decode: vi.fn(async () => fakeBuffer)
  };
}

function failingFetcher(): SampleFetcher {
  return {
    fetchArrayBuffer: vi.fn(async () => {
      throw new Error('404');
    }),
    decode: vi.fn(async () => fakeBuffer)
  };
}

describe('SampleLoader — загрузка сэмплов с graceful fallback', () => {
  it('успешная загрузка кэшируется и доступна синхронно через get()', async () => {
    const fetcher = okFetcher();
    const loader = new SampleLoader(fetcher, false);
    expect(loader.get('star_collect')).toBeUndefined();
    const buf = await loader.load('star_collect', '/audio/star_collect.mp3');
    expect(buf).toBe(fakeBuffer);
    expect(loader.get('star_collect')).toBe(fakeBuffer);
    // повторный load() не должен снова дёргать сеть
    await loader.load('star_collect', '/audio/star_collect.mp3');
    expect(fetcher.fetchArrayBuffer).toHaveBeenCalledOnce();
  });

  it('провал загрузки: null, файл помечен failed, повтор не долбит сеть снова', async () => {
    const fetcher = failingFetcher();
    const loader = new SampleLoader(fetcher, false);
    const first = await loader.load('gate_creak', '/audio/gate_creak.mp3');
    expect(first).toBeNull();
    expect(loader.hasFailed('gate_creak')).toBe(true);
    const second = await loader.load('gate_creak', '/audio/gate_creak.mp3');
    expect(second).toBeNull();
    expect(fetcher.fetchArrayBuffer).toHaveBeenCalledOnce();
  });

  it('в dev-режиме предупреждает ровно один раз за отсутствующий файл', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const loader = new SampleLoader(failingFetcher(), true);
    await loader.load('dog_bark', '/audio/dog_bark.mp3');
    await loader.load('dog_bark', '/audio/dog_bark.mp3');
    await loader.load('dog_bark', '/audio/dog_bark.mp3');
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('вне dev-режима не логирует отсутствующие файлы вовсе', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const loader = new SampleLoader(failingFetcher(), false);
    await loader.load('dog_bark', '/audio/dog_bark.mp3');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('параллельные load() одного ключа не запускают повторную загрузку (дедупликация)', async () => {
    const fetcher = okFetcher();
    const loader = new SampleLoader(fetcher, false);
    const [a, b] = await Promise.all([
      loader.load('victory_drive', '/audio/victory_drive.mp3'),
      loader.load('victory_drive', '/audio/victory_drive.mp3')
    ]);
    expect(a).toBe(fakeBuffer);
    expect(b).toBe(fakeBuffer);
    expect(fetcher.fetchArrayBuffer).toHaveBeenCalledOnce();
  });
});
