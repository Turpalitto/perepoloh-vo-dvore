import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalFallbackPlatform } from '../src/platform/local-fallback';
import { defaultSave } from '../src/game/save';

/** Node не даёт localStorage — минимальный in-memory стаб, без jsdom-зависимости. */
function installFakeLocalStorage(): void {
  const data = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    }
  };
}

describe('local-fallback платформа', () => {
  beforeEach(() => {
    installFakeLocalStorage();
  });

  it('название явно отличает fallback от dev mock', () => {
    expect(createLocalFallbackPlatform().name).toBe('local-fallback');
  });

  it('сохранение работает через localStorage', async () => {
    const platform = createLocalFallbackPlatform();
    const save = { ...defaultSave(), lastLevel: 5 };
    await platform.saveData(save);
    const loaded = await platform.loadData();
    expect(loaded?.lastLevel).toBe(5);
  });

  it('rewarded возвращает false', async () => {
    const platform = createLocalFallbackPlatform();
    await expect(platform.showRewarded({ onPause: () => {}, onResume: () => {} })).resolves.toBe(false);
  });

  it('interstitial завершается сразу и сообщает, что показа не было', async () => {
    const platform = createLocalFallbackPlatform();
    await expect(platform.showInterstitial({ onPause: () => {}, onResume: () => {} })).resolves.toBe(false);
  });

  it('leaderboards возвращают пустой результат', async () => {
    const platform = createLocalFallbackPlatform();
    await expect(platform.getLeaderboardSnapshot('yardstars')).resolves.toEqual({ entries: [], me: null });
  });

  it('язык — непустая строка (безопасный fallback без исключений)', () => {
    const platform = createLocalFallbackPlatform();
    expect(typeof platform.getLang()).toBe('string');
    expect(platform.getLang().length).toBeGreaterThan(0);
  });

  it('isTV всегда false (TV нельзя определить без SDK)', () => {
    expect(createLocalFallbackPlatform().isTV).toBe(false);
  });

  it('serverTime — через Date.now()', () => {
    const platform = createLocalFallbackPlatform();
    const before = Date.now();
    expect(platform.serverTime()).toBeGreaterThanOrEqual(before);
  });

  it('review/banner/back-handler — no-op, не бросают', async () => {
    const platform = createLocalFallbackPlatform();
    await expect(platform.requestReview()).resolves.toBe(false);
    await expect(platform.showBanner()).resolves.toBeUndefined();
    expect(() => platform.setBackHandler(() => {})).not.toThrow();
    expect(() => platform.setLifecycleHandlers({ onPause: () => {}, onResume: () => {} })).not.toThrow();
  });
});
