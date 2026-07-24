import { describe, expect, it } from 'vitest';
import levelsJson from '../src/levels/levels.json';
import type { LevelDef } from '../src/core/types';
import {
  completedCampaignLevels,
  unlockedUpgrades,
  yardMilestone
} from '../src/game/progression';
import { defaultSave } from '../src/game/save';

const levels = levelsJson as LevelDef[];

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
