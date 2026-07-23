import { describe, expect, it } from 'vitest';
import {
  applyWeeklyClaim,
  applyWeeklyEvent,
  currentWeekKey,
  isWeeklyQuestClaimed,
  selectWeeklyQuests,
  weeklyQuestProgress,
  WEEKLY_QUEST_REWARD_HINTS
} from '../src/game/weekly';
import { SaveStore, defaultSave } from '../src/game/save';
import type { Platform } from '../src/platform/types';

describe('недельные цели', () => {
  it('выбирает по одной цели каждого вида, детерминированно по неделе', () => {
    const quests = selectWeeklyQuests('2026-07-20');
    expect(quests).toHaveLength(3);
    expect(new Set(quests.map((q) => q.kind))).toEqual(new Set(['win', 'perfect', 'endless']));
    expect(selectWeeklyQuests('2026-07-20')).toEqual(quests);
    expect(selectWeeklyQuests('2026-07-27')).not.toEqual(quests);
  });

  it('до открытия Endless выбирает три достижимые кампанийные цели', () => {
    const quests = selectWeeklyQuests('2026-07-20', false);
    expect(quests).toHaveLength(3);
    expect(quests.every((quest) => quest.kind !== 'endless')).toBe(true);
    expect(new Set(quests.map((quest) => quest.key)).size).toBe(quests.length);
    expect(selectWeeklyQuests('2026-07-20', false)).toEqual(quests);
  });

  it('прогресс суммируется в пределах недели и обнуляется с новой неделей', () => {
    const week = '2026-07-20';
    let state = applyWeeklyEvent(undefined, week, 'win', 1);
    state = applyWeeklyEvent(state, week, 'win', 1);
    state = applyWeeklyEvent(state, week, 'perfect', 1);
    expect(state).toMatchObject({ weekKey: week, win: 2, perfect: 1, endlessBest: 0 });

    const quest = { key: 'win5', kind: 'win' as const, goal: 5, icon: '🚗' };
    expect(weeklyQuestProgress(state, week, quest)).toBe(2);

    // новая неделя — счётчики сбрасываются
    const nextWeek = '2026-07-27';
    const reset = applyWeeklyEvent(state, nextWeek, 'win', 1);
    expect(reset).toMatchObject({ weekKey: nextWeek, win: 1, perfect: 0 });
    expect(weeklyQuestProgress(state, nextWeek, quest)).toBe(0); // старое состояние из прошлой недели
  });

  it('endless — максимум серии за неделю, не сумма', () => {
    const week = '2026-07-20';
    let state = applyWeeklyEvent(undefined, week, 'endless', 4);
    state = applyWeeklyEvent(state, week, 'endless', 2); // хуже — не считается
    expect(state.endlessBest).toBe(4);
    state = applyWeeklyEvent(state, week, 'endless', 9); // лучше — обновляется
    expect(state.endlessBest).toBe(9);
  });

  it('прогресс цели не может превысить её goal', () => {
    const week = '2026-07-20';
    const state = applyWeeklyEvent(undefined, week, 'win', 99);
    const quest = { key: 'win5', kind: 'win' as const, goal: 5, icon: '🚗' };
    expect(weeklyQuestProgress(state, week, quest)).toBe(5);
  });

  it('цель можно забрать только один раз', () => {
    const week = '2026-07-20';
    const state = applyWeeklyEvent(undefined, week, 'win', 5);
    const claimed = applyWeeklyClaim(state, week, 'win5');
    expect(claimed).not.toBeNull();
    expect(isWeeklyQuestClaimed(claimed ?? undefined, week, 'win5')).toBe(true);
    expect(applyWeeklyClaim(claimed ?? undefined, week, 'win5')).toBeNull(); // повторно нельзя
  });

  it('claim из прошлой недели невозможен', () => {
    const state = applyWeeklyEvent(undefined, '2026-07-20', 'win', 5);
    expect(applyWeeklyClaim(state, '2026-07-27', 'win5')).toBeNull();
  });

  it('currentWeekKey соответствует понедельнику недели', () => {
    // 2026-07-20 — понедельник
    expect(currentWeekKey(new Date('2026-07-22T12:00:00'))).toBe('2026-07-20');
    expect(currentWeekKey(new Date('2026-07-26T12:00:00'))).toBe('2026-07-20');
    expect(currentWeekKey(new Date('2026-07-27T12:00:00'))).toBe('2026-07-27');
  });
});

describe('SaveStore + недельные цели', () => {
  const platform = { saveData: async () => undefined } as unknown as Platform;

  it('recordWeeklyEvent копит прогресс и переживает sanitizeSave', async () => {
    const store = new SaveStore(platform, defaultSave());
    store.recordWeeklyEvent('2026-07-20', 'win', 1);
    store.recordWeeklyEvent('2026-07-20', 'win', 1);
    expect(store.data.weekly).toMatchObject({ weekKey: '2026-07-20', win: 2 });
  });

  it('claimWeeklyQuest начисляет подсказки один раз', () => {
    const store = new SaveStore(platform, defaultSave());
    store.recordWeeklyEvent('2026-07-20', 'win', 5);
    const before = store.data.hintTokens ?? 0;
    expect(store.claimWeeklyQuest('2026-07-20', 'win5', true, WEEKLY_QUEST_REWARD_HINTS)).toBe(true);
    expect(store.data.hintTokens).toBe(before + WEEKLY_QUEST_REWARD_HINTS);
    // повторная попытка ничего не даёт
    expect(store.claimWeeklyQuest('2026-07-20', 'win5', true, WEEKLY_QUEST_REWARD_HINTS)).toBe(false);
    expect(store.data.hintTokens).toBe(before + WEEKLY_QUEST_REWARD_HINTS);
  });

  it('claimWeeklyQuest отказывает, если цель не выполнена', () => {
    const store = new SaveStore(platform, defaultSave());
    store.recordWeeklyEvent('2026-07-20', 'win', 1);
    expect(store.claimWeeklyQuest('2026-07-20', 'win5', false, WEEKLY_QUEST_REWARD_HINTS)).toBe(false);
  });
});
