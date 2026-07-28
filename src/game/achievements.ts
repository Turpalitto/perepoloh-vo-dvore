import type { SaveData } from './save';
import { CAMPAIGN_LEVEL_IDS, CAMPAIGN_MAX_STARS, LEVELS, campaignCleared, campaignStars } from './campaign';
import { goldCount, medaledCount } from './elite';
import { ELITE_CHALLENGES } from '../levels/elite-challenges';

/** Цели «пройти всё» деривируются из данных кампании — иначе вставка уровней делает их ложью. */
const CAMPAIGN_LEVELS = LEVELS.length;

export interface Achievement {
  key: string;
  icon: string;
  goal: number;
  progress(save: SaveData): number;
}

// Считаем только уровни кампании: в `save.stars` могут лежать ключи, которых уже
// нет в данных (сейв игрока со старой версией), и они завышали бы прогресс.
const completed = (save: SaveData): number => campaignCleared(save.stars);
const perfect = (save: SaveData): number =>
  Object.entries(save.stars).filter(([id, stars]) => stars === 3 && CAMPAIGN_LEVEL_IDS.has(Number(id))).length;
const streak = (save: SaveData): number => save.daily?.streak ?? 0;
const trophies = (save: SaveData): number => save.daily?.trophies ?? 0;
const endless = (save: SaveData): number => save.endlessBest ?? 0;
// Медали лиги считаем по сейву, а не по списку испытаний: ключи испытаний,
// которых уже нет в конфигурации, не должны завышать прогресс — та же причина,
// по которой звёзды фильтруются по CAMPAIGN_LEVEL_IDS.
const eliteMedals = (save: SaveData): number => medaledCount(save);
const eliteGolds = (save: SaveData): number => goldCount(save);

export const ACHIEVEMENTS: Achievement[] = [
  { key: 'firstRide', icon: '🚗', goal: 1, progress: completed },
  { key: 'chapter', icon: '📖', goal: 12, progress: completed },
  { key: 'halfway', icon: '🛠️', goal: 50, progress: completed },
  { key: 'yardLegend', icon: '👑', goal: CAMPAIGN_LEVELS, progress: completed },
  { key: 'perfect5', icon: '🎯', goal: 5, progress: perfect },
  { key: 'perfect24', icon: '💎', goal: 24, progress: perfect },
  { key: 'collector', icon: '⭐', goal: 100, progress: (save) => campaignStars(save.stars) },
  { key: 'master', icon: '🏆', goal: CAMPAIGN_MAX_STARS, progress: (save) => campaignStars(save.stars) },
  { key: 'streak3', icon: '🔥', goal: 3, progress: streak },
  { key: 'streak7', icon: '🌞', goal: 7, progress: streak },
  { key: 'weeklyCup', icon: '🏅', goal: 1, progress: trophies },
  { key: 'cupShelf', icon: '🎖️', goal: 4, progress: trophies },
  { key: 'endlessRunner', icon: '🌀', goal: 5, progress: endless },
  { key: 'endlessLegend', icon: '🐐', goal: 15, progress: endless },
  // Высшая лига. Цели деривируются из числа испытаний, иначе правка
  // кураторского списка молча превратит их в недостижимые или бесплатные.
  { key: 'leagueEntry', icon: '🥉', goal: 5, progress: eliteMedals },
  { key: 'leagueFull', icon: '🎖️', goal: ELITE_CHALLENGES.length, progress: eliteMedals },
  { key: 'leagueGold', icon: '🥇', goal: 5, progress: eliteGolds },
  { key: 'leagueLegend', icon: '👑', goal: ELITE_CHALLENGES.length, progress: eliteGolds }
];

export function achievementProgress(save: SaveData, achievement: Achievement): number {
  return Math.min(achievement.goal, Math.max(0, achievement.progress(save)));
}

/** Достижения, заслуженные текущим прогрессом (без учёта уже выданных). */
export function earnedAchievementKeys(save: SaveData): Set<string> {
  return new Set(
    ACHIEVEMENTS.filter((achievement) => achievementProgress(save, achievement) >= achievement.goal).map(
      (achievement) => achievement.key
    )
  );
}

/**
 * Открытые достижения: заслуженные сейчас ПЛЮС выданные когда-то.
 *
 * Цели «пройти всю кампанию» и «собрать все звёзды» деривируются из данных,
 * поэтому растут вместе с контентом. Без объединения с сохранённым списком
 * игрок, честно закрывший кампанию из 100 уровней, после расширения до 108
 * увидел бы «Легенду двора» и «Мастера» снова закрытыми — то есть обновление
 * отняло бы у него награду. Это тот же принцип, по которому не поднимаются
 * старые пороги улучшений двора.
 */
export function unlockedAchievementKeys(save: SaveData): Set<string> {
  const keys = earnedAchievementKeys(save);
  for (const key of save.achievements ?? []) {
    if (ACHIEVEMENTS.some((achievement) => achievement.key === key)) keys.add(key);
  }
  return keys;
}
