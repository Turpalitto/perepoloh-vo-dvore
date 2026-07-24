import type { LevelDef } from '../core/types';
import type { SaveData } from './save';

/** Этапы улучшения двора (конфиг баланса — вне игрового кода). */
export interface UpgradeStage {
  stars: number;
  key: string;
  title: string;
}

// Пороги смещены ниже теоретического максимума (300): последнее улучшение
// доступно сильному, но не идеальному игроку. Полный сбор 300 звёзд остаётся
// отдельным трофеем-достижением, а не условием косметики.
const UPGRADES: UpgradeStage[] = [
  { stars: 2, key: 'fence', title: 'Забор починен!' },
  { stars: 8, key: 'flowers', title: 'Расцвела клумба!' },
  { stars: 14, key: 'gate', title: 'Ворота покрашены!' },
  { stars: 21, key: 'doghouse', title: 'Новая будка — привет, Шарик!' },
  { stars: 30, key: 'laundry', title: 'Свежее бельё и фонарики!' },
  { stars: 40, key: 'appletree', title: 'Яблоня и качели!' },
  { stars: 60, key: 'workshop', title: 'Открылась дедова мастерская!' },
  { stars: 85, key: 'well', title: 'Старый колодец восстановлен!' },
  { stars: 115, key: 'garden', title: 'Огород снова плодоносит!' },
  { stars: 150, key: 'pond', title: 'Во дворе появился пруд!' },
  { stars: 195, key: 'fair', title: 'Двор готов к ярмарке!' },
  { stars: 250, key: 'celebration', title: 'Большой праздник во дворе!' }
];

export function unlockedUpgrades(total: number): Set<string> {
  return new Set(UPGRADES.filter((u) => u.stars <= total).map((u) => u.key));
}

export function nextUpgrade(total: number): UpgradeStage | null {
  return UPGRADES.find((u) => u.stars > total) ?? null;
}

/** Улучшения, открывшиеся при росте суммы звёзд с before до after. */
export function newlyUnlocked(before: number, after: number): UpgradeStage[] {
  return UPGRADES.filter((u) => u.stars > before && u.stars <= after);
}

/** Число пройденных уровней основной кампании. Не включает daily/endless/elite. */
export function completedCampaignLevels(levels: LevelDef[], save: SaveData): number {
  return levels.reduce((count, level) => count + ((save.stars[String(level.id)] ?? 0) > 0 ? 1 : 0), 0);
}

/**
 * Визуальный этап двора: новая деталь каждые 10 пройденных уровней.
 * Значение вычисляется из сейва и не требует отдельной миграции.
 */
export function yardMilestone(completedLevels: number): number {
  return Math.min(10, Math.max(0, Math.floor(completedLevels / 10)));
}

/** Уровень открыт, если пройден предыдущий (первый открыт всегда). */
export function isLevelUnlocked(levels: LevelDef[], save: SaveData, levelId: number): boolean {
  const idx = levels.findIndex((l) => l.id === levelId);
  if (idx <= 0) return idx === 0;
  return (save.stars[String(levels[idx - 1].id)] ?? 0) > 0;
}

/** Следующий незавершённый уровень для кнопки «Играть». */
export function nextLevelToPlay(levels: LevelDef[], save: SaveData): LevelDef {
  for (const l of levels) {
    if ((save.stars[String(l.id)] ?? 0) === 0) return l;
  }
  return levels[levels.length - 1];
}
