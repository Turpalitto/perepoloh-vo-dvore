import { createDebugTracker } from '../game/analytics';
import type { SaveData } from '../game/save';
import { sanitizeSave } from '../game/save';
import { DEFAULT_PLATFORM_CONFIG } from './types';
import type { LeaderboardSnapshot, Platform } from './types';

const STORAGE_KEY = 'parkovka.save.v1';
const SAFE_LANG_FALLBACK = 'ru';

/**
 * Production-safe fallback, когда Яндекс SDK не загрузился или упал на init().
 * Не маскирует поломку интеграции: ошибка логируется один раз в createPlatform
 * (index.ts) перед выбором этого fallback. Здесь — честная локальная игра:
 * localStorage-сейв, язык браузера, без рекламы/лидербордов/mock-ad/dev-UI.
 * Это НЕ dev mock — в нём нет фальшивой рекламы и тестовых оверлеев.
 */
export function createLocalFallbackPlatform(): Platform {
  return {
    name: 'local-fallback',
    config: { ...DEFAULT_PLATFORM_CONFIG },
    isTV: false,
    async init(): Promise<void> {
      // no-op: инициализация уже произошла в createPlatform до выбора fallback.
    },
    getLang(): string {
      try {
        return navigator.language?.split('-')[0] || SAFE_LANG_FALLBACK;
      } catch {
        return SAFE_LANG_FALLBACK;
      }
    },
    async submitScore(): Promise<void> {
      // Лидерборды недоступны без платформы — тихо игнорируем.
    },
    async getLeaderboardSnapshot(): Promise<LeaderboardSnapshot> {
      return { entries: [], me: null };
    },
    async requestReview(): Promise<boolean> {
      return false;
    },
    serverTime(): number {
      return Date.now();
    },
    setLifecycleHandlers(): void {
      // Системных пауз платформы нет — вкладка управляется браузером напрямую.
    },
    setBackHandler(): void {
      // TV-пульта в fallback-режиме нет (isTV: false).
    },
    async requestFullscreen(): Promise<void> {
      // Не запрашиваем полноэкранный режим без платформы.
    },
    async exit(): Promise<void> {
      // Некуда «выходить» вне SDK — no-op.
    },
    ready(): void {
      // no-op: LoadingAPI недоступен.
    },
    gameplayStart(): void {},
    gameplayStop(): void {},
    async loadData(): Promise<SaveData | null> {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return sanitizeSave(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    async saveData(data: SaveData): Promise<void> {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        // localStorage недоступен (приватный режим/квота) — прогресс не персистится в этой сессии.
      }
    },
    async showInterstitial(): Promise<boolean> {
      // Реклама недоступна без платформы — показа не было.
      return false;
    },
    async showRewarded(): Promise<boolean> {
      return false;
    },
    // Без платформы отправлять воронку некуда — только консоль для отладки.
    createAnalyticsTracker: () => createDebugTracker(),
    async showBanner(): Promise<void> {
      // Баннер недоступен без платформы.
    }
  };
}
