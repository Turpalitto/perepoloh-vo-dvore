import { describe, expect, it } from 'vitest';
import { SessionStats } from '../src/game/session-stats';

describe('счётчики сессии для воронки', () => {
  it('нумерует уровни сессии подряд независимо от их id', () => {
    const stats = new SessionStats();
    expect(stats.levelStarted(1).sessionLevelNumber).toBe(1);
    expect(stats.levelStarted(2).sessionLevelNumber).toBe(2);
    expect(stats.levelStarted(40).sessionLevelNumber).toBe(3);
  });

  it('первая попытка уровня — 1, повторный вход — 2', () => {
    const stats = new SessionStats();
    expect(stats.levelStarted(7).attemptNumber).toBe(1);
    stats.levelStarted(8);
    expect(stats.levelStarted(7).attemptNumber).toBe(2);
  });

  it('рестарт увеличивает попытку, но не номер уровня в сессии', () => {
    const stats = new SessionStats();
    const first = stats.levelStarted(5);
    expect(first).toEqual({ sessionLevelNumber: 1, attemptNumber: 1 });
    expect(stats.levelRestarted(5)).toBe(2);
    expect(stats.levelRestarted(5)).toBe(3);
    expect(stats.attemptOf(5)).toBe(3);
    // следующий реальный вход — второй уровень сессии, четвёртая попытка
    const second = stats.levelStarted(5);
    expect(second).toEqual({ sessionLevelNumber: 2, attemptNumber: 4 });
  });

  it('попытки уровней не смешиваются между собой', () => {
    const stats = new SessionStats();
    stats.levelStarted(1);
    stats.levelRestarted(1);
    stats.levelStarted(2);
    expect(stats.attemptOf(1)).toBe(2);
    expect(stats.attemptOf(2)).toBe(1);
  });

  it('attemptOf для незапущенного уровня — 1, без исключений', () => {
    expect(new SessionStats().attemptOf(99)).toBe(1);
  });
});
