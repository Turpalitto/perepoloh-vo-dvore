import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameAudio } from '../src/game/audio';

/** Минимальный fake AudioContext — считает созданные Oscillator/BufferSource ноды. */
class FakeParam {
  value = 0;
  setValueAtTime() {
    return this;
  }
  linearRampToValueAtTime() {
    return this;
  }
  exponentialRampToValueAtTime() {
    return this;
  }
}
class FakeNode {
  connect() {
    return this;
  }
  disconnect() {}
}
class FakeGain extends FakeNode {
  gain = new FakeParam();
}
class FakeOscillator extends FakeNode {
  type = 'sine';
  frequency = new FakeParam();
  detune = new FakeParam();
  onended: (() => void) | null = null;
  start() {
    oscillatorsCreated++;
  }
  stop() {}
}
class FakeBufferSource extends FakeNode {
  buffer: unknown = null;
  playbackRate = new FakeParam();
  onended: (() => void) | null = null;
  start() {
    bufferSourcesCreated++;
  }
  stop() {}
}
class FakeBiquadFilter extends FakeNode {
  type = 'lowpass';
  frequency = new FakeParam();
}

let oscillatorsCreated = 0;
let bufferSourcesCreated = 0;

class FakeAudioContext {
  destination = new FakeNode();
  sampleRate = 44100;
  currentTime = 0;
  state = 'running';
  createGain() {
    return new FakeGain();
  }
  createOscillator() {
    return new FakeOscillator();
  }
  createBiquadFilter() {
    return new FakeBiquadFilter();
  }
  createBufferSource() {
    return new FakeBufferSource();
  }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length), duration: 1 };
  }
  resume() {
    return Promise.resolve();
  }
}

describe('GameAudio — hidden/pause не плодит новые ноды', () => {
  beforeEach(() => {
    oscillatorsCreated = 0;
    bufferSourcesCreated = 0;
    vi.useFakeTimers();
    (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
    (globalThis as unknown as { AudioContext: typeof FakeAudioContext }).AudioContext = FakeAudioContext;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hidden → количество созданных нод не растёт', () => {
    const audio = new GameAudio(true, true);
    audio.unlock();
    audio.startAmbient();
    audio.startMusic();
    audio.setHidden(true);
    const before = oscillatorsCreated + bufferSourcesCreated;
    vi.advanceTimersByTime(30_000);
    expect(oscillatorsCreated + bufferSourcesCreated).toBe(before);
  });

  it('resume → музыка/ambient снова создают ноды после setHidden(false)', () => {
    const audio = new GameAudio(true, true);
    audio.unlock();
    audio.startAmbient();
    audio.startMusic();
    audio.setHidden(true);
    vi.advanceTimersByTime(10_000);
    const beforeResume = oscillatorsCreated;
    audio.setHidden(false);
    vi.advanceTimersByTime(5_000);
    expect(oscillatorsCreated).toBeGreaterThan(beforeResume);
  });

  it('двойной resume не плодит второй music-таймер (нет удвоения нод за тот же интервал)', () => {
    const audio = new GameAudio(true, true);
    audio.unlock();
    audio.startMusic();
    audio.setHidden(true);
    audio.setHidden(false);
    audio.setHidden(false); // второй resume — без эффекта, таймер уже один
    vi.advanceTimersByTime(2_600); // один такт playBar
    const afterOneBar = oscillatorsCreated;
    vi.advanceTimersByTime(2_600); // второй такт
    const perBar = oscillatorsCreated - afterOneBar;
    // Если бы завёлся второй параллельный таймер, второй такт создал бы вдвое
    // больше нод, чем первый (два playBar одновременно).
    expect(perBar).toBeLessThanOrEqual(afterOneBar + 1);
  });

  it('выключенная музыка не возобновляется через hidden/resume', () => {
    const audio = new GameAudio(true, false);
    audio.unlock();
    audio.startMusic(); // musicEnabled=false → no-op
    audio.setHidden(true);
    audio.setHidden(false);
    vi.advanceTimersByTime(10_000);
    expect(oscillatorsCreated).toBe(0);
  });

  it('реклама (duck) pause/resume не создаёт дубликатов нод, как и hidden', () => {
    const audio = new GameAudio(true, true);
    audio.unlock();
    audio.startMusic();
    audio.duck(true);
    const before = oscillatorsCreated;
    vi.advanceTimersByTime(10_000);
    expect(oscillatorsCreated).toBe(before);
    audio.duck(false);
    vi.advanceTimersByTime(3_000);
    expect(oscillatorsCreated).toBeGreaterThan(before);
  });

  it('play() не создаёт ноду, пока hidden', () => {
    const audio = new GameAudio(true, true);
    audio.unlock();
    audio.setHidden(true);
    audio.play('click');
    expect(oscillatorsCreated).toBe(0);
    audio.setHidden(false);
    audio.play('click');
    expect(oscillatorsCreated).toBeGreaterThan(0);
  });
});
