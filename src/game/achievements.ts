import levelsJson from '../levels/levels.json';
import type { SaveData } from './save';
import { totalStars } from './save';

/** Цели «пройти всё» деривируются из данных кампании — иначе вставка уровней делает их ложью. */
const CAMPAIGN_LEVELS = levelsJson.length;
const CAMPAIGN_MAX_STARS = CAMPAIGN_LEVELS * 3;

export interface Achievement {
  key: string;
  icon: string;
  goal: number;
  progress(save: SaveData): number;
}

const completed = (save: SaveData): number => Object.values(save.stars).filter((stars) => stars > 0).length;
const perfect = (save: SaveData): number => Object.values(save.stars).filter((stars) => stars === 3).length;
const streak = (save: SaveData): number => save.daily?.streak ?? 0;
const trophies = (save: SaveData): number => save.daily?.trophies ?? 0;
const endless = (save: SaveData): number => save.endlessBest ?? 0;

export const ACHIEVEMENTS: Achievement[] = [
  { key: 'firstRide', icon: '🚗', goal: 1, progress: completed },
  { key: 'chapter', icon: '📖', goal: 12, progress: completed },
  { key: 'halfway', icon: '🛠️', goal: 50, progress: completed },
  { key: 'yardLegend', icon: '👑', goal: CAMPAIGN_LEVELS, progress: completed },
  { key: 'perfect5', icon: '🎯', goal: 5, progress: perfect },
  { key: 'perfect24', icon: '💎', goal: 24, progress: perfect },
  { key: 'collector', icon: '⭐', goal: 100, progress: totalStars },
  { key: 'master', icon: '🏆', goal: CAMPAIGN_MAX_STARS, progress: totalStars },
  { key: 'streak3', icon: '🔥', goal: 3, progress: streak },
  { key: 'streak7', icon: '🌞', goal: 7, progress: streak },
  { key: 'weeklyCup', icon: '🏅', goal: 1, progress: trophies },
  { key: 'cupShelf', icon: '🎖️', goal: 4, progress: trophies },
  { key: 'endlessRunner', icon: '🌀', goal: 5, progress: endless },
  { key: 'endlessLegend', icon: '🐐', goal: 15, progress: endless }
];

export function achievementProgress(save: SaveData, achievement: Achievement): number {
  return Math.min(achievement.goal, Math.max(0, achievement.progress(save)));
}

export function unlockedAchievementKeys(save: SaveData): Set<string> {
  return new Set(
    ACHIEVEMENTS.filter((achievement) => achievementProgress(save, achievement) >= achievement.goal).map(
      (achievement) => achievement.key
    )
  );
}
