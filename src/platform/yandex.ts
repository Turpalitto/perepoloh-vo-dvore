/**
 * Интеграция с Яндекс Играми (SDK v2, документация июль 2026).
 * Единственный модуль, знающий о YaGames. Все вызовы «мягкие»:
 * без авторизации и при сбоях SDK игра продолжает работать на localStorage.
 */
import type { SaveData } from '../game/save';
import { mergeSave, sanitizeSave } from '../game/save';
import { DEFAULT_PLATFORM_CONFIG } from './types';
import type { AdHandlers, LeaderboardEntry, Platform, PlatformConfig } from './types';

const STORAGE_KEY = 'parkovka.save.v1';

interface YsdkPlayer {
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>;
  getData(keys?: string[]): Promise<Record<string, unknown>>;
  getUniqueID?(): string;
}

interface YsdkLeaderboards {
  setLeaderboardScore?(name: string, score: number): Promise<void>;
  setScore?(name: string, score: number): Promise<void>;
  getEntries?(
    name: string,
    opts?: { includeUser?: boolean; quantityTop?: number; quantityAround?: number }
  ): Promise<{ entries?: YsdkLeaderboardEntry[] }>;
  getLeaderboardEntries?(
    name: string,
    opts?: { includeUser?: boolean; quantityTop?: number; quantityAround?: number }
  ): Promise<{ entries?: YsdkLeaderboardEntry[] }>;
}

interface YsdkLeaderboardEntry {
  rank?: number;
  score?: number;
  player?: { publicName?: string; uniqueID?: string };
  publicName?: string;
}

interface Ysdk {
  environment?: { i18n?: { lang?: string } };
  deviceInfo?: {
    type?: 'desktop' | 'mobile' | 'tablet' | 'tv';
    isTV?(): boolean;
  };
  screen?: { fullscreen?: { request(): Promise<void> } };
  EVENTS?: { HISTORY_BACK?: string; EXIT?: string };
  dispatchEvent?(name: string, detail?: object): Promise<unknown>;
  feedback?: {
    canReview(): Promise<{ value: boolean; reason?: string }>;
    requestReview(): Promise<{ feedbackSent: boolean }>;
  };
  features?: {
    LoadingAPI?: { ready(): void };
    GameplayAPI?: { start(): void; stop(): void };
  };
  leaderboards?: YsdkLeaderboards;
  getLeaderboards?(): Promise<YsdkLeaderboards>;
  getFlags?(opts?: { defaultFlags?: Record<string, string> }): Promise<Record<string, string>> | Record<string, string>;
  isAvailableMethod?(name: string): Promise<boolean>;
  serverTime?(): number;
  on?(name: string, callback: () => void): (() => void) | void;
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
    getBannerAdvStatus?(): Promise<{ stickyAdvIsShowing: boolean; reason?: string }>;
    showBannerAdv?(): Promise<void>;
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
  let myId: string | null = null;
  let adActive = false;
  let lifecycle: AdHandlers | null = null;
  let lifecyclePaused = false;
  let tv = false;
  let backHandler: (() => void) | null = null;
  let unsubscribeBack: (() => void) | null = null;
  let config: PlatformConfig = { ...DEFAULT_PLATFORM_CONFIG };

  const subscribeBack = (): void => {
    unsubscribeBack?.();
    unsubscribeBack = null;
    const eventName = ysdk?.EVENTS?.HISTORY_BACK;
    if (!tv || !eventName || !backHandler) return;
    unsubscribeBack = ysdk?.on?.(eventName, backHandler) ?? null;
  };

  const boundedInt = (raw: string | undefined, fallback: number, min: number, max: number): number => {
    const value = Number(raw);
    return Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
  };

  return {
    name: 'yandex',
    get config(): PlatformConfig {
      return config;
    },
    get isTV(): boolean {
      return tv;
    },

    async init(): Promise<void> {
      if (!window.YaGames) throw new Error('YaGames SDK не загружен');
      ysdk = await window.YaGames.init();
      tv = ysdk.deviceInfo?.isTV?.() ?? ysdk.deviceInfo?.type === 'tv';
      console.info('[platform] Яндекс SDK инициализирован');
      ysdk.on?.('game_api_pause', () => {
        lifecyclePaused = true;
        lifecycle?.onPause();
      });
      ysdk.on?.('game_api_resume', () => {
        lifecyclePaused = false;
        lifecycle?.onResume();
      });
      subscribeBack();
      try {
        const defaults = {
          interstitial_every: String(DEFAULT_PLATFORM_CONFIG.interstitialEvery),
          interstitial_min_level: String(DEFAULT_PLATFORM_CONFIG.interstitialMinLevel),
          interstitial_min_session_ms: String(DEFAULT_PLATFORM_CONFIG.interstitialMinSessionMs),
          free_hints_per_session: String(DEFAULT_PLATFORM_CONFIG.freeHintsPerSession)
        };
        const flags = (await ysdk.getFlags?.({ defaultFlags: defaults })) ?? defaults;
        config = {
          interstitialEvery: boundedInt(flags.interstitial_every, config.interstitialEvery, 2, 8),
          interstitialMinLevel: boundedInt(flags.interstitial_min_level, config.interstitialMinLevel, 1, 30),
          interstitialMinSessionMs: boundedInt(
            flags.interstitial_min_session_ms,
            config.interstitialMinSessionMs,
            60_000,
            600_000
          ),
          freeHintsPerSession: boundedInt(flags.free_hints_per_session, config.freeHintsPerSession, 0, 3)
        };
      } catch (e) {
        console.warn('[platform] remote config недоступен:', e);
      }
      try {
        player = (await ysdk.getPlayer?.({ scopes: false })) ?? null;
        myId = player?.getUniqueID?.() ?? null;
      } catch {
        player = null; // без авторизации — работаем на localStorage
      }
    },

    getLang(): string {
      return ysdk?.environment?.i18n?.lang ?? 'ru';
    },

    /** Лидерборды «yardstars»/«dailystreak» настраиваются в консоли Яндекс Игр. */
    async submitScore(board: 'yardstars' | 'dailystreak', value: number): Promise<void> {
      if (!ysdk) return;
      try {
        if (ysdk.isAvailableMethod && !(await ysdk.isAvailableMethod('leaderboards.setScore'))) return;
        const lb = ysdk.leaderboards ?? (await ysdk.getLeaderboards?.());
        await (lb?.setScore ?? lb?.setLeaderboardScore)?.call(lb, board, value);
      } catch (e) {
        console.warn('[platform] лидерборд недоступен:', e);
      }
    },

    async getLeaderboard(board: 'yardstars' | 'dailystreak'): Promise<LeaderboardEntry[]> {
      if (!ysdk) return [];
      try {
        const lb = ysdk.leaderboards ?? (await ysdk.getLeaderboards?.());
        const result = await (lb?.getEntries ?? lb?.getLeaderboardEntries)?.call(lb, board, {
          includeUser: true,
          quantityTop: 10,
          quantityAround: 3
        });
        return (result?.entries ?? []).map((entry, index) => ({
          rank: (entry.rank ?? index) + 1,
          name: entry.player?.publicName ?? entry.publicName ?? 'Игрок',
          score: entry.score ?? 0
        }));
      } catch (e) {
        console.warn('[platform] чтение лидерборда недоступно:', e);
        return [];
      }
    },

    /**
     * Своя строка находится сравнением player.getUniqueID() с entry.player.uniqueID
     * в том же ответе (includeUser+quantityAround уже приносит игрока рядом с его
     * местом). Без авторизации или вне окна ответа — null, без ошибки.
     */
    async getMyRank(board: 'yardstars' | 'dailystreak'): Promise<LeaderboardEntry | null> {
      if (!ysdk || !myId) return null;
      try {
        const lb = ysdk.leaderboards ?? (await ysdk.getLeaderboards?.());
        const result = await (lb?.getEntries ?? lb?.getLeaderboardEntries)?.call(lb, board, {
          includeUser: true,
          quantityTop: 10,
          quantityAround: 3
        });
        const mine = (result?.entries ?? []).find((entry) => entry.player?.uniqueID === myId);
        if (!mine) return null;
        return {
          rank: (mine.rank ?? 0) + 1,
          name: mine.player?.publicName ?? mine.publicName ?? 'Игрок',
          score: mine.score ?? 0,
          isMe: true
        };
      } catch (e) {
        console.warn('[platform] своё место в лидерборде недоступно:', e);
        return null;
      }
    },

    async requestReview(): Promise<boolean> {
      if (!ysdk?.feedback) return false;
      try {
        const { value } = await ysdk.feedback.canReview();
        if (!value) return false;
        await ysdk.feedback.requestReview();
        return true;
      } catch (e) {
        console.warn('[platform] запрос оценки недоступен:', e);
        return false;
      }
    },

    serverTime(): number {
      return ysdk?.serverTime?.() ?? Date.now();
    },

    setLifecycleHandlers(h: AdHandlers): void {
      lifecycle = h;
      // Стартовая реклама может открыть паузу сразу после YaGames.init(),
      // ещё до создания UI. Передаём приложению уже накопленное состояние.
      if (lifecyclePaused) h.onPause();
    },

    setBackHandler(handler: () => void): void {
      backHandler = handler;
      subscribeBack();
    },

    async requestFullscreen(): Promise<void> {
      if (!tv) return;
      try {
        await ysdk?.screen?.fullscreen?.request();
      } catch {
        // Некоторые ТВ уже запускают специальный бандл в fullscreen.
      }
    },

    async exit(): Promise<void> {
      const eventName = ysdk?.EVENTS?.EXIT;
      if (!tv || !eventName) return;
      try {
        await ysdk?.dispatchEvent?.(eventName);
      } catch {
        // Платформа могла уже закрыть TV-бандл после подтверждения.
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
        if (!ysdk?.adv || adActive) {
          resolve();
          return;
        }
        adActive = true;
        let paused = false;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          adActive = false;
          if (paused) h.onResume();
          resolve();
        };
        try {
          ysdk.adv.showFullscreenAdv({
            callbacks: {
              onOpen: () => {
                if (paused) return;
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
        } catch (e) {
          console.warn('[platform] interstitial:', e);
          finish();
        }
      });
    },

    showRewarded(h: AdHandlers): Promise<boolean> {
      return new Promise((resolve) => {
        if (!ysdk?.adv || adActive) {
          resolve(false);
          return;
        }
        adActive = true;
        let rewarded = false;
        let paused = false;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          adActive = false;
          if (paused) h.onResume();
          resolve(rewarded);
        };
        try {
          ysdk.adv.showRewardedVideo({
            callbacks: {
              onOpen: () => {
                if (paused) return;
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
        } catch (e) {
          console.warn('[platform] rewarded:', e);
          finish();
        }
      });
    },

    async showBanner(): Promise<void> {
      if (!ysdk?.adv?.showBannerAdv) return;
      try {
        const status = await ysdk.adv.getBannerAdvStatus?.();
        if (status?.stickyAdvIsShowing) return;
        await ysdk.adv.showBannerAdv();
      } catch (e) {
        console.warn('[platform] баннер недоступен:', e);
      }
    }
  };
}
