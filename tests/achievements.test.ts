import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  achievementProgress,
  earnedAchievementKeys,
  unlockedAchievementKeys
} from '../src/game/achievements';
import { defaultSave } from '../src/game/save';
import type { SaveData } from '../src/game/save';
import { ELITE_CHALLENGES } from '../src/levels/elite-challenges';

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

  it('уже выданное достижение не отнимается при росте кампании', () => {
    // Цели «пройти всю кампанию» и «собрать все звёзды» деривируются из данных
    // и растут вместе с контентом. Игрок, закрывший кампанию из 100 уровней,
    // после расширения до 108 не должен увидеть награду снова закрытой.
    const save = { ...defaultSave(), achievements: ['yardLegend', 'master'] };
    const keys = unlockedAchievementKeys(save);
    expect(keys.has('yardLegend')).toBe(true);
    expect(keys.has('master')).toBe(true);
    // Заслуженного сейчас среди них нет — прогресс пустой.
    expect(earnedAchievementKeys(save).size).toBe(0);
  });

  it('чужие ключи в сейве игнорируются', () => {
    const save = { ...defaultSave(), achievements: ['ктоТоПодменилСейв'] };
    expect(unlockedAchievementKeys(save).size).toBe(0);
  });

  it('ограничивает отображаемый прогресс целью', () => {
    const firstRide = ACHIEVEMENTS.find((achievement) => achievement.key === 'firstRide')!;
    const save = { ...defaultSave(), stars: { '1': 3, '2': 3 } };
    expect(achievementProgress(save, firstRide)).toBe(1);
  });
});

describe('достижения Высшей лиги', () => {
  const medals = (count: number, medal: number): Record<string, number> =>
    Object.fromEntries(Array.from({ length: count }, (_, i) => [String(i + 1), medal]));

  it('цели лиги деривируются из числа испытаний, а не заданы числом', () => {
    const full = ACHIEVEMENTS.find((a) => a.key === 'leagueFull')!;
    const legend = ACHIEVEMENTS.find((a) => a.key === 'leagueLegend')!;
    expect(full.goal).toBe(ELITE_CHALLENGES.length);
    expect(legend.goal).toBe(ELITE_CHALLENGES.length);
  });

  it('медали открывают комплект, золото — золотые достижения', () => {
    const bronzeAll: SaveData = { ...defaultSave(), eliteMedals: medals(ELITE_CHALLENGES.length, 1) };
    const goldAll: SaveData = { ...defaultSave(), eliteMedals: medals(ELITE_CHALLENGES.length, 3) };
    const unlockedBronze = unlockedAchievementKeys(bronzeAll);
    expect(unlockedBronze.has('leagueEntry')).toBe(true);
    expect(unlockedBronze.has('leagueFull')).toBe(true);
    // Бронза не даёт золотых достижений — иначе они не значили бы мастерство.
    expect(unlockedBronze.has('leagueGold')).toBe(false);
    expect(unlockedBronze.has('leagueLegend')).toBe(false);
    const unlockedGold = unlockedAchievementKeys(goldAll);
    expect(unlockedGold.has('leagueGold')).toBe(true);
    expect(unlockedGold.has('leagueLegend')).toBe(true);
  });

  it('чужие ключи медалей не завышают прогресс лиги', () => {
    const noisy: SaveData = { ...defaultSave(), eliteMedals: { ...medals(4, 3), '999': 3 } };
    const entry = ACHIEVEMENTS.find((a) => a.key === 'leagueEntry')!;
    // Пять медалей нужно набрать испытаниями, а не мусорным ключом в сейве…
    expect(achievementProgress(noisy, entry)).toBe(5);
    // …но 999 не существует, поэтому «полный комплект» остаётся закрытым.
    expect(unlockedAchievementKeys(noisy).has('leagueFull')).toBe(false);
  });
});
