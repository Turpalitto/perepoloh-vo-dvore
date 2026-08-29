import { describe, expect, it } from 'vitest';
import {
  GRANDPA_TRIAL_ATTEMPTS,
  GRANDPA_TRIALS,
  applyGrandpaTrialAttempt,
  canPlayGrandpaTrial,
  grandpaAttemptsLeft,
  grandpaTrial,
  grandpaTrialMedal,
  grandpaTrialReward
} from '../src/game/grandpa-trial';
import { eliteChallenge } from '../src/levels/elite-challenges';

/** Идеальная попытка: 0 ходов, звезда, без подсказок и отмен — золото на любом испытании. */
const PERFECT = { moves: 0, starCollected: true, usedHint: false, usedUndo: false, usedRestart: false };
/** Провал: ходов заведомо больше любого bronze-лимита. */
const FAILED = { moves: 9999, starCollected: false, usedHint: true, usedUndo: true, usedRestart: true };

describe('испытание деда (Stage D, data-model)', () => {
  it('ровно пять испытаний на тройках мастер-испытаний лиги', () => {
    expect(GRANDPA_TRIALS).toHaveLength(5);
    expect(GRANDPA_TRIAL_ATTEMPTS).toBe(3);
    const challengeIds = GRANDPA_TRIALS.map((trial) => trial.challengeId);
    expect(new Set(challengeIds).size).toBe(5);
    for (const id of challengeIds) expect(eliteChallenge(id), `нет испытания лиги ${id}`).toBeDefined();
    for (const trial of GRANDPA_TRIALS) expect(trial.rewardHints).toBeGreaterThanOrEqual(1);
    // Бонусы растут к последнему испытанию, id стабильны и уникальны.
    expect(GRANDPA_TRIALS.map((trial) => trial.rewardHints)).toEqual([1, 1, 2, 2, 3]);
    expect(new Set(GRANDPA_TRIALS.map((trial) => trial.id)).size).toBe(5);
  });

  it('медаль за попытку считается по порогам базового испытания лиги', () => {
    const trial = GRANDPA_TRIALS[0];
    const challenge = eliteChallenge(trial.challengeId)!;
    expect(grandpaTrialMedal(trial, PERFECT)).toBe(3);
    expect(grandpaTrialMedal(trial, FAILED)).toBe(0);
    // Согласованность с прямым расчётом медали лиги.
    expect(grandpaTrialMedal(trial, { ...FAILED, moves: challenge.bronze.maxMoves })).toBe(1);
  });

  it('попытки ограничены тремя, отсутствие прогресса начинает с чистого листа', () => {
    expect(grandpaAttemptsLeft(undefined)).toBe(3);
    expect(canPlayGrandpaTrial(undefined)).toBe(true);
    let progress = applyGrandpaTrialAttempt(undefined, 0);
    expect(progress).toEqual({ attempts: 1, best: 0 });
    expect(grandpaAttemptsLeft(progress)).toBe(2);
    progress = applyGrandpaTrialAttempt(progress, 2);
    expect(progress).toEqual({ attempts: 2, best: 2, rewarded: undefined });
    progress = applyGrandpaTrialAttempt(progress, 1);
    expect(progress.best).toBe(2); // медаль не ухудшается
    progress = applyGrandpaTrialAttempt(progress, 3);
    expect(grandpaAttemptsLeft(progress)).toBe(0);
    expect(canPlayGrandpaTrial(progress)).toBe(false);
    // Потолок попыток соблюдается даже при лишнем вызове.
    expect(applyGrandpaTrialAttempt(progress, 3).attempts).toBe(3);
  });

  it('бонус подсказок выдаётся только за первую медаль и только раз', () => {
    const trial = GRANDPA_TRIALS[2];
    expect(grandpaTrialReward(trial, undefined, 0)).toBe(0);
    expect(grandpaTrialReward(trial, undefined, 1)).toBe(trial.rewardHints);
    expect(grandpaTrialReward(trial, undefined, 3)).toBe(trial.rewardHints);
    // Медаль уже была — бонуса нет; флаг rewarded блокирует повторную выдачу.
    expect(grandpaTrialReward(trial, { attempts: 2, best: 1 }, 2)).toBe(0);
    expect(grandpaTrialReward(trial, { attempts: 1, best: 0, rewarded: true }, 2)).toBe(0);
  });

  it('неизвестный id не находит испытание, модель не падает', () => {
    expect(grandpaTrial('nope')).toBeUndefined();
    expect(grandpaTrialMedal({ id: 'x', challengeId: 9999, rewardHints: 1 }, PERFECT)).toBe(0);
  });
});
