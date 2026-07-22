import { afterEach, describe, expect, it, vi } from 'vitest';
import { createYandexPlatform } from '../src/platform/yandex';
import { DEFAULT_PLATFORM_CONFIG } from '../src/platform/types';

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('адаптер Яндекс Игр', () => {
  it('использует удерживающую паузу между полноэкранной рекламой', () => {
    expect(DEFAULT_PLATFORM_CONFIG).toMatchObject({
      interstitialEvery: 6,
      interstitialMinLevel: 10,
      interstitialMinSessionMs: 240_000
    });
  });

  it('читает язык, флаги, серверное время и системную паузу', async () => {
    const callbacks = new Map<string, () => void>();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        YaGames: {
          init: async () => ({
            environment: { i18n: { lang: 'tr' } },
            serverTime: () => 123456,
            getFlags: async () => ({
              interstitial_every: '6',
              interstitial_min_level: '8',
              interstitial_min_session_ms: '180000',
              free_hints_per_session: '2'
            }),
            on: (name: string, callback: () => void) => callbacks.set(name, callback)
          })
        }
      }
    });
    const pause = vi.fn();
    const resume = vi.fn();
    const platform = createYandexPlatform();
    platform.setLifecycleHandlers({ onPause: pause, onResume: resume });
    await platform.init();
    callbacks.get('game_api_pause')?.();
    callbacks.get('game_api_resume')?.();
    expect(platform.getLang()).toBe('tr');
    expect(platform.serverTime()).toBe(123456);
    expect(platform.config).toMatchObject({ interstitialEvery: 6, interstitialMinLevel: 8, freeHintsPerSession: 2 });
    expect(pause).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
  });

  it('не теряет стартовую паузу, пришедшую до создания UI', async () => {
    const callbacks = new Map<string, () => void>();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        YaGames: {
          init: async () => ({
            on: (name: string, callback: () => void) => callbacks.set(name, callback)
          })
        }
      }
    });
    const platform = createYandexPlatform();
    await platform.init();
    callbacks.get('game_api_pause')?.();

    const pause = vi.fn();
    const resume = vi.fn();
    platform.setLifecycleHandlers({ onPause: pause, onResume: resume });
    expect(pause).toHaveBeenCalledOnce();
    callbacks.get('game_api_resume')?.();
    expect(resume).toHaveBeenCalledOnce();
  });

  it('определяет TV, обрабатывает HISTORY_BACK, fullscreen и EXIT', async () => {
    const callbacks = new Map<string, () => void>();
    const requestFullscreen = vi.fn(async () => undefined);
    const dispatchEvent = vi.fn(async () => undefined);
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        YaGames: {
          init: async () => ({
            deviceInfo: { type: 'tv', isTV: () => true },
            screen: { fullscreen: { request: requestFullscreen } },
            EVENTS: { HISTORY_BACK: 'HISTORY_BACK', EXIT: 'EXIT' },
            dispatchEvent,
            on: (name: string, callback: () => void) => callbacks.set(name, callback)
          })
        }
      }
    });
    const platform = createYandexPlatform();
    await platform.init();
    expect(platform.isTV).toBe(true);

    const back = vi.fn();
    platform.setBackHandler(back);
    callbacks.get('HISTORY_BACK')?.();
    expect(back).toHaveBeenCalledOnce();

    await platform.requestFullscreen();
    await platform.exit();
    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(dispatchEvent).toHaveBeenCalledWith('EXIT');
  });

  it('возобновляет игру после rewarded и выдаёт награду только по onRewarded', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        YaGames: {
          init: async () => ({
            adv: {
              showRewardedVideo: ({ callbacks }: { callbacks: Record<string, () => void> }) => {
                callbacks.onOpen?.();
                callbacks.onRewarded?.();
                callbacks.onClose?.();
              }
            }
          })
        }
      }
    });
    const platform = createYandexPlatform();
    await platform.init();
    const pause = vi.fn();
    const resume = vi.fn();
    await expect(platform.showRewarded({ onPause: pause, onResume: resume })).resolves.toBe(true);
    expect(pause).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
  });

  it('rewarded, зависший без onClose, завершается по таймауту без награды', async () => {
    vi.useFakeTimers();
    try {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
          YaGames: {
            init: async () => ({
              adv: {
                // Реклама «открылась», но SDK потерял onClose/onRewarded.
                showRewardedVideo: ({ callbacks }: { callbacks: Record<string, () => void> }) => {
                  callbacks.onOpen?.();
                }
              }
            })
          }
        }
      });
      const platform = createYandexPlatform();
      await platform.init();
      const pause = vi.fn();
      const resume = vi.fn();
      const promise = platform.showRewarded({ onPause: pause, onResume: resume });
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(promise).resolves.toBe(false);
      expect(pause).toHaveBeenCalledOnce();
      expect(resume).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('interstitial, зависший без onClose, разблокируется по таймауту', async () => {
    vi.useFakeTimers();
    try {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
          YaGames: {
            init: async () => ({
              adv: {
                showFullscreenAdv: ({ callbacks }: { callbacks: Record<string, () => void> }) => {
                  callbacks.onOpen?.();
                }
              }
            })
          }
        }
      });
      const platform = createYandexPlatform();
      await platform.init();
      const pause = vi.fn();
      const resume = vi.fn();
      const promise = platform.showInterstitial({ onPause: pause, onResume: resume });
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(promise).resolves.toBeUndefined();
      expect(pause).toHaveBeenCalledOnce();
      expect(resume).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('не запускает две рекламы одновременно', async () => {
    let callbacks: Record<string, () => void> = {};
    const showRewardedVideo = vi.fn((opts: { callbacks: Record<string, () => void> }) => {
      callbacks = opts.callbacks;
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { YaGames: { init: async () => ({ adv: { showRewardedVideo } }) } }
    });
    const platform = createYandexPlatform();
    await platform.init();
    const pause = vi.fn();
    const resume = vi.fn();

    const first = platform.showRewarded({ onPause: pause, onResume: resume });
    await expect(platform.showRewarded({ onPause: pause, onResume: resume })).resolves.toBe(false);
    expect(showRewardedVideo).toHaveBeenCalledOnce();
    callbacks.onOpen?.();
    callbacks.onRewarded?.();
    callbacks.onClose?.();
    await expect(first).resolves.toBe(true);
    expect(pause).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
  });

  it('мягко завершает рекламу при синхронной ошибке SDK', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        YaGames: {
          init: async () => ({
            adv: {
              showFullscreenAdv: () => {
                throw new Error('SDK unavailable');
              }
            }
          })
        }
      }
    });
    const platform = createYandexPlatform();
    await platform.init();
    await expect(platform.showInterstitial({ onPause: vi.fn(), onResume: vi.fn() })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[platform] interstitial:', expect.any(Error));
    warn.mockRestore();
  });

  it('использует новый API лидербордов и безопасно читает строки', async () => {
    const setScore = vi.fn(async () => undefined);
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        YaGames: {
          init: async () => ({
            isAvailableMethod: async () => true,
            leaderboards: {
              setScore,
              getEntries: async () => ({ entries: [{ rank: 0, score: 42, player: { publicName: 'Сосед' } }] })
            }
          })
        }
      }
    });
    const platform = createYandexPlatform();
    await platform.init();
    await platform.submitScore('yardstars', 42);
    expect(setScore).toHaveBeenCalledWith('yardstars', 42);
    await expect(platform.getLeaderboard('yardstars')).resolves.toEqual([{ rank: 1, name: 'Сосед', score: 42 }]);
  });

  it('находит своё место в лидерборде по uniqueID игрока', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        YaGames: {
          init: async () => ({
            getPlayer: async () => ({ getUniqueID: () => 'me-123' }),
            leaderboards: {
              getEntries: async () => ({
                entries: [
                  { rank: 0, score: 100, player: { publicName: 'Сосед', uniqueID: 'other' } },
                  { rank: 6, score: 42, player: { publicName: 'Я', uniqueID: 'me-123' } }
                ]
              })
            }
          })
        }
      }
    });
    const platform = createYandexPlatform();
    await platform.init();
    await expect(platform.getMyRank('yardstars')).resolves.toEqual({
      rank: 7,
      name: 'Я',
      score: 42,
      isMe: true
    });
  });

  it('без авторизации своё место в лидерборде — null, без ошибки', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { YaGames: { init: async () => ({}) } }
    });
    const platform = createYandexPlatform();
    await platform.init();
    await expect(platform.getMyRank('yardstars')).resolves.toBeNull();
  });

  it('запрашивает баннер только если он ещё не показан', async () => {
    const showBannerAdv = vi.fn(async () => undefined);
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        YaGames: {
          init: async () => ({
            adv: {
              getBannerAdvStatus: async () => ({ stickyAdvIsShowing: false }),
              showBannerAdv
            }
          })
        }
      }
    });
    const platform = createYandexPlatform();
    await platform.init();
    await platform.showBanner();
    expect(showBannerAdv).toHaveBeenCalledOnce();
  });

  it('не дублирует показ уже открытого баннера', async () => {
    const showBannerAdv = vi.fn(async () => undefined);
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        YaGames: {
          init: async () => ({
            adv: {
              getBannerAdvStatus: async () => ({ stickyAdvIsShowing: true }),
              showBannerAdv
            }
          })
        }
      }
    });
    const platform = createYandexPlatform();
    await platform.init();
    await platform.showBanner();
    expect(showBannerAdv).not.toHaveBeenCalled();
  });

  it('без adv.showBannerAdv баннер тихо игнорируется', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { YaGames: { init: async () => ({}) } }
    });
    const platform = createYandexPlatform();
    await platform.init();
    await expect(platform.showBanner()).resolves.toBeUndefined();
  });
});
