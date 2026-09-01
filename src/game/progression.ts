import type { LevelDef } from '../core/types';
import type { SaveData } from './save';

/** Этапы улучшения двора (конфиг баланса — вне игрового кода). */
export interface UpgradeStage {
  stars: number;
  key: string;
  title: string;
}

// Пороги смещены ниже теоретического максимума: последнее улучшение доступно
// сильному, но не идеальному игроку. Полный сбор звёзд остаётся отдельным
// трофеем-достижением, а не условием косметики.
//
// Пороги НЕ пересчитываются при добавлении уровней: `unlockedUpgrades` —
// чистая деривация от суммы звёзд, поэтому поднятие порога отняло бы у живого
// игрока уже показанное улучшение двора. Новые уровни лишь смягчают ладдер.
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

/**
 * Уровень открыт, если пройден предыдущий по порядку кампании (первый открыт
 * всегда). Уже пройденный уровень открыт безусловно: новые уровни вставляются
 * в середину кампании, и без этой проверки обновление закрыло бы живому игроку
 * всё, что он прошёл после точки вставки (его предшественником стал бы новый
 * уровень с нулём звёзд).
 */
export function isLevelUnlocked(levels: LevelDef[], save: SaveData, levelId: number): boolean {
  if ((save.stars[String(levelId)] ?? 0) > 0) return true;
  const idx = levels.findIndex((l) => l.id === levelId);
  if (idx <= 0) return idx === 0;
  return (save.stars[String(levels[idx - 1].id)] ?? 0) > 0;
}

/**
 * Видимый игроку номер уровня — позиция в кампании (1-based), а не `id`.
 * `id` остаётся внутренним ключом: по нему хранятся звёзды и на него ссылаются
 * боссы и мастер-испытания, поэтому вставленные позже уровни получают id 101+.
 * Нумерация в интерфейсе при этом остаётся непрерывной.
 */
export function campaignNumber(levels: LevelDef[], levelId: number): number {
  return levels.findIndex((l) => l.id === levelId) + 1;
}

/**
 * Доступ к «Бесконечному двору». Раньше режим открывался только вместе с
 * Высшей лигой — после всех уровней кампании, то есть подавляющее большинство
 * игроков не узнавало о его существовании вовсе. Теперь он показывается
 * заблокированной карточкой в середине кампании и открывается задолго до
 * финала; Высшая лига остаётся исключительно наградой за пройденную кампанию.
 *
 * Пороги заданы позицией в кампании, а не id: вставка уровней не должна
 * сдвигать момент открытия режима.
 */
export const ENDLESS_TEASER_AT = 20;
export const ENDLESS_UNLOCK_AT = 35;

export type EndlessAccess = 'hidden' | 'teaser' | 'open';

/** Пройден ли уровень, стоящий на позиции `position` (1-based) в кампании. */
function isPositionCleared(levels: LevelDef[], save: SaveData, position: number): boolean {
  const level = levels[position - 1];
  return level !== undefined && (save.stars[String(level.id)] ?? 0) > 0;
}

export function endlessAccess(levels: LevelDef[], save: SaveData): EndlessAccess {
  // Пройденная кампания открывает режим безусловно. Порог по позиции — это
  // способ открыть его РАНЬШЕ, а не новое условие: сейв игрока, добравшегося до
  // финала ещё по старым правилам, не обязан содержать звёзды всех уровней, и
  // отнимать у него уже доступный режим нельзя.
  if (save.campaignDone === true) return 'open';
  if (isPositionCleared(levels, save, ENDLESS_UNLOCK_AT)) return 'open';
  if (isPositionCleared(levels, save, ENDLESS_TEASER_AT)) return 'teaser';
  return 'hidden';
}

/**
 * Доступ к «Высшей лиге». Первый дивизион становится видимым до финала,
 * чтобы игрок успел познакомиться с главным replay-режимом, но недельный
 * чемпионат и дивизионы 2+ остаются наградой за завершение кампании.
 */
export const LEAGUE_TEASER_AT = 50;
export const LEAGUE_PREVIEW_AT = 65;
export const LEAGUE_PREVIEW_DIVISIONS = 1;

export type LeagueAccess = 'hidden' | 'teaser' | 'preview' | 'full';

export function leagueAccess(levels: LevelDef[], save: SaveData): LeagueAccess {
  if (save.campaignDone === true) return 'full';
  if (isPositionCleared(levels, save, LEAGUE_PREVIEW_AT)) return 'preview';
  if (isPositionCleared(levels, save, LEAGUE_TEASER_AT)) return 'teaser';
  return 'hidden';
}

/** Число дивизионов, разрешённых текущей стадией доступа. */
export function maxLeagueDivision(access: LeagueAccess, totalDivisions: number): number {
  const total = Math.max(0, Math.floor(totalDivisions));
  if (access === 'full') return total;
  if (access === 'preview') return Math.min(LEAGUE_PREVIEW_DIVISIONS, total);
  return 0;
}

/** Следующий незавершённый уровень для кнопки «Играть». */
export function nextLevelToPlay(levels: LevelDef[], save: SaveData): LevelDef {
  for (const l of levels) {
    if ((save.stars[String(l.id)] ?? 0) === 0) return l;
  }
  return levels[levels.length - 1];
}
