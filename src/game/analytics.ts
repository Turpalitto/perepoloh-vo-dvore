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
export type RewardedContext = 'hint' | 'skip' | 'endless-revive';

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
  // Interstitial: вызов и результат — разные события. Платформа выполняет
  // onClose и когда ролик не показан (частые вызовы, offline, нет SDK), и
  // сообщает это в wasShown; без разделения воронка завышала показы.
  | { type: 'interstitial_requested'; levelId: number }
  | { type: 'interstitial_shown'; levelId: number }
  | { type: 'interstitial_not_shown'; levelId: number }
  /** Показ отменён жёстким капом кампании (см. MAX_INTERSTITIALS в app.ts). */
  | { type: 'interstitial_capped'; levelId: number }
  // Ежедневный уровень
  | { type: 'daily_started'; modifier: string; streak: number }
  | { type: 'daily_completed'; modifier: string; streak: number; stars: number }
  // Метапрогрессия
  | { type: 'upgrade_unlocked'; key: string; stars: number }
  | { type: 'campaign_completed'; stars: number }
  // Высшая лига. Режим стоит на гейте «три медали открывают следующий
  // дивизион», и без этих событий нельзя увидеть ни где игрок встаёт, ни
  // доходит ли он вообще до ремиксов — а балансировать вслепую дороже, чем
  // отправить пять событий.
  | { type: 'elite_opened'; points: number; rank: string; medals: number }
  | { type: 'elite_challenge_started'; challengeId: number; division: number; modifier: string; remixed: boolean }
  | {
      type: 'elite_challenge_finished';
      challengeId: number;
      division: number;
      modifier: string;
      remixed: boolean;
      medal: number;
      previousMedal: number;
      moves: number;
    }
  | { type: 'elite_division_unlocked'; division: number }
  | { type: 'elite_rank_up'; rank: string; points: number }
  // Бесконечный двор
  | { type: 'endless_unlocked' }
  | { type: 'endless_started'; best: number }
  | { type: 'endless_finished'; streak: number; best: number }
  // Возврат в меню — именно возврат, а не конец сессии: так же выглядит
  // штатный выход после победы, из рейтинга или настроек.
  | { type: 'returned_to_menu'; screen: string };

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
