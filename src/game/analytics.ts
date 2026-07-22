/**
 * Внутренний слой аналитики. Никакого внешнего SDK не подключено — по
 * умолчанию все события уходят в no-op трекер. Интерфейс типизирован заранее,
 * чтобы позже подключить реальную платформу (Яндекс Метрику/AppMetrica и т.п.)
 * без переписывания мест вызова.
 *
 * Приватность: никаких персональных данных, никакого fingerprinting, не
 * логируется покадровое движение по клеткам — только факты воронки (старт
 * уровня, первый ход, рестарт, подсказка, победа, старт/фаза/победа босса,
 * выход с экрана).
 */

export type GameAnalyticsEvent =
  | { type: 'game_start' }
  | { type: 'level_start'; levelId: number }
  | { type: 'first_move'; levelId: number; timeMs: number }
  | { type: 'level_restart'; levelId: number; moves: number }
  | { type: 'hint_used'; levelId: number; source: 'free' | 'token' | 'rewarded' }
  | { type: 'level_complete'; levelId: number; moves: number; stars: number; timeMs: number }
  | { type: 'boss_start'; levelId: number }
  | { type: 'boss_phase_complete'; levelId: number; phase: number }
  | { type: 'boss_complete'; levelId: number; timeMs: number }
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
