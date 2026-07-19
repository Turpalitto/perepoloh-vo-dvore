import type { LevelDef } from '../core/types';
import type { SaveData } from './save';

/** Этапы улучшения двора (конфиг баланса — вне игрового кода). */
export interface UpgradeStage {
  stars: number;
  key: string;
  title: string;
}

export const UPGRADES: UpgradeStage[] = [
  { stars: 2, key: 'fence', title: 'Забор починен!' },
  { stars: 6, key: 'flowers', title: 'Расцвела клумба!' },
  { stars: 10, key: 'gate', title: 'Ворота покрашены!' },
  { stars: 15, key: 'doghouse', title: 'Новая будка — привет, Шарик!' },
  { stars: 21, key: 'laundry', title: 'Свежее бельё и фонарики!' },
  { stars: 28, key: 'appletree', title: 'Яблоня и качели!' }
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

/** Показывать interstitial перед каждым третьим переходом «Дальше». */
export const INTERSTITIAL_EVERY = 3;
