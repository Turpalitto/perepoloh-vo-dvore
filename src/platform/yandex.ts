/**
 * Интеграция с Яндекс Играми (SDK v2, документация июль 2026).
 * Единственный модуль, знающий о YaGames. Все вызовы «мягкие»:
 * без авторизации и при сбоях SDK игра продолжает работать на localStorage.
 */
import type { SaveData } from '../game/save';
import { mergeSave, sanitizeSave } from '../game/save';
import type { AdHandlers, Platform } from './types';

const STORAGE_KEY = 'parkovka.save.v1';

interface YsdkPlayer {
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>;
  getData(keys?: string[]): Promise<Record<string, unknown>>;
}

interface YsdkLeaderboards {
  setLeaderboardScore?(name: string, score: number): Promise<void>;
  setScore?(name: string, score: number): Promise<void>;
}

interface Ysdk {
  environment?: { i18n?: { lang?: string } };
  features?: {
    LoadingAPI?: { ready(): void };
    GameplayAPI?: { start(): void; stop(): void };
  };
  leaderboards?: YsdkLeaderboards;
  getLeaderboards?(): Promise<YsdkLeaderboards>;
  adv?: {
    showFullscreenAdv(opts: {
      callbacks: {
        onOpen?: () => void;
        onClose?: (wasShown: boolean) => void;
        onError?: (e: unknown) => void;
        onOffline?: () => void;
      };
    }): void;
    showRewardedVideo(opts: {
      callbacks: {
        onOpen?: () => void;
        onRewarded?: () => void;
        onClose?: () => void;
        onError?: (e: unknown) => void;
      };
    }): void;
  };
  getPlayer?(opts?: { scopes?: boolean }): Promise<YsdkPlayer>;
}

declare global {
  interface Window {
    YaGames?: { init(): Promise<Ysdk> };
  }
}

export function createYandexPlatform(): Platform {
  let ysdk: Ysdk | null = null;
  let player: YsdkPlayer | null = null;

  return {
    name: 'yandex',

    async init(): Promise<void> {
      if (!window.YaGames) throw new Error('YaGames SDK не загружен');
      ysdk = await window.YaGames.init();
      console.info('[platform] Яндекс SDK инициализирован');
      try {
        player = (await ysdk.getPlayer?.({ scopes: false })) ?? null;
      } catch {
        player = null; // без авторизации — работаем на localStorage
      }
    },

    getLang(): string {
      return ysdk?.environment?.i18n?.lang ?? 'ru';
    },

    /** Лидерборд «yardstars» настраивается в консоли Яндекс Игр. */
    async submitScore(totalStars: number): Promise<void> {
      if (!ysdk) return;
      try {
        const lb = ysdk.leaderboards ?? (await ysdk.getLeaderboards?.());
        await (lb?.setLeaderboardScore ?? lb?.setScore)?.call(lb, 'yardstars', totalStars);
      } catch (e) {
        console.warn('[platform] лидерборд недоступен:', e);
      }
    },

    ready(): void {
      ysdk?.features?.LoadingAPI?.ready();
    },

    gameplayStart(): void {
      ysdk?.features?.GameplayAPI?.start();
    },

    gameplayStop(): void {
      ysdk?.features?.GameplayAPI?.stop();
    },

    async loadData(): Promise<SaveData | null> {
      let local: SaveData | null = null;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          local = sanitizeSave(JSON.parse(raw));
        } catch {
          local = null;
        }
      }
      if (player) {
        try {
          const cloud = sanitizeSave((await player.getData(['save']))['save']);
          if (cloud) {
            // сливаем локальный и облачный сейвы: максимум звёзд по каждому уровню,
            // чтобы оффлайн-прогресс не терялся при устаревшем облаке
            return local ? mergeSave(local, cloud) : cloud;
          }
        } catch (e) {
          console.warn('[platform] облачное сохранение недоступно:', e);
        }
      }
      return local;
    },

    async saveData(data: SaveData): Promise<void> {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      if (player) {
        try {
          await player.setData({ save: data }, true);
        } catch (e) {
          console.warn('[platform] не удалось сохранить в облако:', e);
        }
      }
    },

    showInterstitial(h: AdHandlers): Promise<void> {
      return new Promise((resolve) => {
        if (!ysdk?.adv) {
          resolve();
          return;
        }
        let paused = false;
        const finish = () => {
          if (paused) h.onResume();
          resolve();
        };
        ysdk.adv.showFullscreenAdv({
          callbacks: {
            onOpen: () => {
              paused = true;
              h.onPause();
            },
            onClose: finish,
            onError: (e) => {
              console.warn('[platform] interstitial:', e);
              finish();
            },
            onOffline: finish
          }
        });
      });
    },

    showRewarded(h: AdHandlers): Promise<boolean> {
      return new Promise((resolve) => {
        if (!ysdk?.adv) {
          resolve(false);
          return;
        }
        let rewarded = false;
        let paused = false;
        const finish = () => {
          if (paused) h.onResume();
          resolve(rewarded);
        };
        ysdk.adv.showRewardedVideo({
          callbacks: {
            onOpen: () => {
              paused = true;
              h.onPause();
            },
            onRewarded: () => {
              rewarded = true;
            },
            onClose: finish,
            onError: (e) => {
              console.warn('[platform] rewarded:', e);
              finish();
            }
          }
        });
      });
    }
  };
}
