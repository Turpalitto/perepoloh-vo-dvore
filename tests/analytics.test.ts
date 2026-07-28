import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDebugTracker, noopTracker, setAnalyticsTracker, track } from '../src/game/analytics';
import type { GameAnalyticsEvent } from '../src/game/analytics';

afterEach(() => {
  setAnalyticsTracker(noopTracker); // не протекаем debug-трекер в другие тесты
});

describe('аналитика — типизированный интерфейс, no-op по умолчанию', () => {
  it('noopTracker ничего не делает и не бросает', () => {
    expect(() => noopTracker.track({ type: 'game_start' })).not.toThrow();
    expect(() => track({ type: 'level_start', levelId: 1, sessionLevelNumber: 1, attemptNumber: 1 })).not.toThrow();
  });

  it('setAnalyticsTracker подменяет получателя событий', () => {
    const calls: string[] = [];
    setAnalyticsTracker({ track: (e) => calls.push(e.type) });
    track({ type: 'level_start', levelId: 5, sessionLevelNumber: 2, attemptNumber: 1 });
    track({ type: 'hint_used', levelId: 5, source: 'free' });
    expect(calls).toEqual(['level_start', 'hint_used']);
  });

  it('debug-трекер печатает событие через console.debug (для ?analyticsDebug=1)', () => {
    const dbg = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    setAnalyticsTracker(createDebugTracker());
    track({ type: 'boss_complete', levelId: 10, timeMs: 4200 });
    expect(dbg).toHaveBeenCalledWith('[analytics]', 'boss_complete', { type: 'boss_complete', levelId: 10, timeMs: 4200 });
    dbg.mockRestore();
  });

  it('события не содержат персональных данных — только числовые/строковые факты воронки', () => {
    // Статическая проверка формы события: нет полей вроде userId/deviceId/ip.
    const events: GameAnalyticsEvent[] = [
      { type: 'game_start' },
      { type: 'level_start', levelId: 1, sessionLevelNumber: 1, attemptNumber: 1 },
      { type: 'first_move', levelId: 1, timeMs: 100 },
      {
        type: 'level_complete',
        levelId: 1,
        moves: 3,
        stars: 3,
        timeMs: 5000,
        attemptNumber: 1,
        durationSeconds: 5,
        hintUsed: false
      },
      { type: 'rewarded_offer_shown', context: 'hint', levelId: 12 },
      { type: 'daily_started', modifier: 'none', streak: 3 },
      { type: 'upgrade_unlocked', key: 'fence', stars: 2 },
      { type: 'endless_finished', streak: 4, best: 7 },
      { type: 'returned_to_menu', screen: 'screen-menu' }
    ];
    for (const e of events) {
      const keys = Object.keys(e);
      expect(keys).not.toContain('userId');
      expect(keys).not.toContain('deviceId');
      expect(keys).not.toContain('ip');
    }
  });
});
