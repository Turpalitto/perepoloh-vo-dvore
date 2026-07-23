/**
 * Интеграция с Яндекс Играми (SDK v2, документация июль 2026).
 * Единственный модуль, знающий о YaGames. Все вызовы «мягкие»:
 * без авторизации и при сбоях SDK игра продолжает работать на localStorage.
 */
import type { SaveData } from '../game/save';
import { mergeSave, sanitizeSave } from '../game/save';
import { DEFAULT_PLATFORM_CONFIG } from './types';
import type { AdHandlers, LeaderboardSnapshot, Platform, PlatformConfig } from './types';

const STORAGE_KEY = 'parkovka.save.v1';

/**
 * Предохранитель на «немой» SDK: если реклама открылась, но соответствующий
 * onClose/onError потерялся (свёрнутая вкладка, зависший iframe), промис не
 * должен висеть вечно и держать adActive=true — иначе игра блокирует и подсказки,
 * и следующую рекламу. По таймауту завершаем показ; для rewarded награда при
 * этом НЕ выдаётся (rewarded остаётся false, если onRewarded не пришёл).
 */
const AD_SAFETY_TIMEOUT_MS = 30_000;

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
    showBannerAdv?(): Promise<{ stickyAdvIsShowing: boolean; reason?: string } | void>;
  };
  /**
   * Актуальная сигнатура на 2026-07-22 (yandex.com/dev/games/doc/en/sdk/sdk-player):
   * getPlayer(opts?: { signed?: boolean }). `scopes` в текущей документации не
   * упоминается — используем только signed, и то не запрашиваем (нет бэкенда для
   * проверки подписи). Без авторизации ответ содержит только ID (getUniqueID).
   */
  getPlayer?(opts?: { signed?: boolean }): Promise<YsdkPlayer>;
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
  let deviceType: NonNullable<Ysdk['deviceInfo']>['type'] = 'desktop';
  let backHandler: (() => void) | null = null;
  let unsubscribeBack: (() => void) | null = null;
  let config: PlatformConfig = { ...DEFAULT_PLATFORM_CONFIG };

  const syncStickyBannerLayout = (showing: boolean): void => {
    if (typeof document === 'undefined') return;
    const usesBottomBanner = deviceType === 'mobile' || deviceType === 'tablet';
    document.body.classList.toggle('sticky-banner-bottom', showing && usesBottomBanner);
  };

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
      deviceType = ysdk.deviceInfo?.type ?? 'desktop';
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
        // Без опций: signed не нужен (нет серверной проверки подписи), а
        // устаревший scopes в текущем SDK не документирован. getUniqueID() —
        // рекомендованный способ получить постоянный ID (getID() deprecated).
        player = (await ysdk.getPlayer?.()) ?? null;
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

    /**
     * Один запрос на таблицу (includeUser+quantityAround уже приносит игрока
     * рядом с его местом) — верхние строки и своя строка извлекаются из одного
     * ответа вместо двух отдельных вызовов getEntries. Своя строка находится
     * сравнением player.getUniqueID() с entry.player.uniqueID в том же ответе.
     * Без авторизации или вне окна ответа — me: null, без ошибки.
     */
    async getLeaderboardSnapshot(board: 'yardstars' | 'dailystreak'): Promise<LeaderboardSnapshot> {
      if (!ysdk) return { entries: [], me: null };
      try {
        const lb = ysdk.leaderboards ?? (await ysdk.getLeaderboards?.());
        const result = await (lb?.getEntries ?? lb?.getLeaderboardEntries)?.call(lb, board, {
          includeUser: true,
          quantityTop: 10,
          quantityAround: 3
        });
        const raw = result?.entries ?? [];
        const entries = raw.map((entry, index) => ({
          rank: (entry.rank ?? index) + 1,
          name: entry.player?.publicName ?? entry.publicName ?? 'Игрок',
          score: entry.score ?? 0
        }));
        const mineRaw = myId ? raw.find((entry) => entry.player?.uniqueID === myId) : undefined;
        const me = mineRaw
          ? {
              rank: (mineRaw.rank ?? 0) + 1,
              name: mineRaw.player?.publicName ?? mineRaw.publicName ?? 'Игрок',
              score: mineRaw.score ?? 0,
              isMe: true
            }
          : null;
        return { entries, me };
      } catch (e) {
        console.warn('[platform] чтение лидерборда недоступно:', e);
        return { entries: [], me: null };
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
        let timer = 0;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          adActive = false;
          if (paused) h.onResume();
          resolve();
        };
        timer = setTimeout(finish, AD_SAFETY_TIMEOUT_MS) as unknown as number;
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
        let timer = 0;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          adActive = false;
          if (paused) h.onResume();
          resolve(rewarded);
        };
        // По таймауту награду не выдаём: rewarded станет true только из onRewarded.
        timer = setTimeout(finish, AD_SAFETY_TIMEOUT_MS) as unknown as number;
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
      if (!ysdk?.adv?.showBannerAdv) {
        syncStickyBannerLayout(false);
        return;
      }
      try {
        const status = await ysdk.adv.getBannerAdvStatus?.();
        if (status?.stickyAdvIsShowing) {
          syncStickyBannerLayout(true);
          return;
        }
        const shown = await ysdk.adv.showBannerAdv();
        syncStickyBannerLayout(shown?.stickyAdvIsShowing ?? true);
      } catch (e) {
        syncStickyBannerLayout(false);
        console.warn('[platform] баннер недоступен:', e);
      }
    }
  };
}
