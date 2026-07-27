import { describe, expect, it } from 'vitest';
import levelsJson from '../src/levels/levels.json';
import type { LevelDef } from '../src/core/types';
import {
  campaignNumber,
  completedCampaignLevels,
  isLevelUnlocked,
  nextLevelToPlay,
  unlockedUpgrades,
  yardMilestone
} from '../src/game/progression';
import { defaultSave } from '../src/game/save';

const levels = levelsJson as LevelDef[];

/** Минимальный «уровень» — прогрессия смотрит только на id и порядок. */
const stub = (id: number): LevelDef => ({ ...levels[0], id, name: `stub-${id}` });

describe('прогрессия двора', () => {
  it('считает только пройденные уровни основной кампании', () => {
    const save = {
      ...defaultSave(),
      stars: {
        '1': 1,
        '2': 3,
        '25': 2,
        '999': 3
      }
    };

    expect(completedCampaignLevels(levels, save)).toBe(3);
  });

  it('открывает новый визуальный этап каждые десять уровней', () => {
    expect(yardMilestone(-1)).toBe(0);
    expect(yardMilestone(0)).toBe(0);
    expect(yardMilestone(9)).toBe(0);
    expect(yardMilestone(10)).toBe(1);
    expect(yardMilestone(59)).toBe(5);
    expect(yardMilestone(100)).toBe(10);
    expect(yardMilestone(140)).toBe(10);
  });

  it('не меняет существующие награды за звёзды', () => {
    expect(unlockedUpgrades(20)).toEqual(new Set(['fence', 'flowers', 'gate']));
    expect(unlockedUpgrades(250).has('celebration')).toBe(true);
  });
});

describe('вставка новых уровней в середину кампании', () => {
  // Кампания «до обновления»: id 1..6 подряд.
  const before = [1, 2, 3, 4, 5, 6].map(stub);
  // Кампания «после обновления»: между 3 и 4 вставлены новые уровни 101 и 102.
  const after = [1, 2, 3, 101, 102, 4, 5, 6].map(stub);
  // Сейв живого игрока: пройдены первые пять уровней старой кампании.
  const save = { ...defaultSave(), stars: { '1': 3, '2': 2, '3': 3, '4': 1, '5': 2 }, lastLevel: 5 };

  it('не закрывает уровни, пройденные до обновления', () => {
    for (const id of [1, 2, 3, 4, 5]) {
      expect(isLevelUnlocked(before, save, id), `до вставки уровень ${id}`).toBe(true);
      expect(isLevelUnlocked(after, save, id), `после вставки уровень ${id}`).toBe(true);
    }
  });

  it('открывает первый вставленный уровень сразу, а следующий за ним — нет', () => {
    expect(isLevelUnlocked(after, save, 101)).toBe(true);
    expect(isLevelUnlocked(after, save, 102)).toBe(false);
  });

  it('уровень сразу за пройденным остаётся открытым, даже если вставка встала перед ним', () => {
    // Уровень 6 не пройден, но его предшественник по массиву (5) пройден.
    expect(isLevelUnlocked(after, save, 6)).toBe(true);
  });

  it('ведёт игрока в новый контент, а не в конец кампании', () => {
    expect(nextLevelToPlay(before, save).id).toBe(6);
    expect(nextLevelToPlay(after, save).id).toBe(101);
  });

  it('нумерация для игрока остаётся непрерывной, id — нет', () => {
    expect(after.map((level) => campaignNumber(after, level.id))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(campaignNumber(after, 4)).toBe(6);
    expect(campaignNumber(after, 777)).toBe(0);
  });
});
