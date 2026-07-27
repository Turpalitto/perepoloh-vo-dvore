/**
 * Внутренний слой аналитики: игра описывает события, приёмник выбирает
 * платформа (`Platform.createAnalyticsTracker`). На Яндексе это счётчик
 * Метрики, включаемый сборочной переменной `VITE_YM_COUNTER_ID`; без неё и в
 * mock/local-fallback события в сеть не уходят вовсе.
 *
 * Приватность: никаких персональных данных, никакого fingerprinting, не
 * логируется покадровое движение по клеткам — только факты воронки (старт
 * уровня, первый ход, рестарт, подсказка, победа, старт/фаза/победа босса,
 * выход с экрана).
 */

/** Откуда игрок пришёл к rewarded-видео. Расширяется при новых стоках. */
export type RewardedContext = 'hint' | 'skip';

export type GameAnalyticsEvent =
  | { type: 'game_start' }
  /** sessionLevelNumber — какой по счёту уровень запущен за сессию (1-based). */
  | { type: 'level_start'; levelId: number; sessionLevelNumber: number; attemptNumber: number }
  | { type: 'first_move'; levelId: number; timeMs: number }
  | { type: 'level_restart'; levelId: number; moves: number }
  | { type: 'hint_used'; levelId: number; source: 'free' | 'token' | 'rewarded' }
  | {
      type: 'level_complete';
      levelId: number;
      moves: number;
      stars: number;
      timeMs: number;
      /** Номер попытки этого уровня в текущей сессии (рестарт = новая попытка). */
      attemptNumber: number;
      durationSeconds: number;
      hintUsed: boolean;
    }
  | { type: 'boss_start'; levelId: number }
  | { type: 'boss_phase_complete'; levelId: number; phase: number }
  | { type: 'boss_complete'; levelId: number; timeMs: number }
  // Реклама: предложение (до показа) → результат. Ровно одно завершающее
  // событие на предложение: completed (награда) либо closed (без награды).
  | { type: 'rewarded_offer_shown'; context: RewardedContext; levelId: number }
  | { type: 'rewarded_completed'; context: RewardedContext; levelId: number }
  | { type: 'rewarded_closed'; context: RewardedContext; levelId: number }
  | { type: 'interstitial_shown'; levelId: number }
  // Ежедневный уровень
  | { type: 'daily_started'; modifier: string; streak: number }
  | { type: 'daily_completed'; modifier: string; streak: number; stars: number }
  // Метапрогрессия
  | { type: 'upgrade_unlocked'; key: string; stars: number }
  | { type: 'campaign_completed'; stars: number }
  // Бесконечный двор
  | { type: 'endless_unlocked' }
  | { type: 'endless_started'; best: number }
  | { type: 'endless_finished'; streak: number; best: number }
  | { type: 'session_exit'; screen: string };

export interface AnalyticsTracker {
  track(event: GameAnalyticsEvent): void;
}

/** По умолчанию: ничего никуда не отправляет. Безопасный default. */
export const noopTracker: AnalyticsTracker = { track: () => undefined };

/**
 * Только для `?analyticsDebug=1` в dev/e2e (гейт — на вызывающей стороне,
 * см. `createAnalytics` в `main.ts`). Печатает события в консоль вместо
 * реальной отправки — удобно проверять воронку локально.
 */
export function createDebugTracker(): AnalyticsTracker {
  return {
    track(event) {
      console.debug('[analytics]', event.type, event);
    }
  };
}

let tracker: AnalyticsTracker = noopTracker;

export function setAnalyticsTracker(next: AnalyticsTracker): void {
  tracker = next;
}

export function track(event: GameAnalyticsEvent): void {
  tracker.track(event);
}
