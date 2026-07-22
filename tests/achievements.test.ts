import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, achievementProgress, unlockedAchievementKeys } from '../src/game/achievements';
import { defaultSave } from '../src/game/save';

describe('достижения', () => {
  it('новый игрок начинает без наград', () => {
    expect(unlockedAchievementKeys(defaultSave()).size).toBe(0);
  });

  it('считает уровни, идеальные решения, звёзды и daily независимо', () => {
    const save = {
      ...defaultSave(),
      stars: Object.fromEntries(Array.from({ length: 12 }, (_, index) => [String(index + 1), index < 5 ? 3 : 1])),
      daily: { last: '2026-07-24', streak: 7, trophies: 1 }
    };
    const keys = unlockedAchievementKeys(save);
    expect(keys).toEqual(new Set(['firstRide', 'chapter', 'perfect5', 'streak3', 'streak7', 'weeklyCup']));
  });

  it('ограничивает отображаемый прогресс целью', () => {
    const firstRide = ACHIEVEMENTS.find((achievement) => achievement.key === 'firstRide')!;
    const save = { ...defaultSave(), stars: { '1': 3, '2': 3 } };
    expect(achievementProgress(save, firstRide)).toBe(1);
  });
});
