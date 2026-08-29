import { describe, expect, it, vi } from 'vitest';
import { SaveStore, defaultSave, mergeSave, sanitizeSave } from '../src/game/save';
import type { SaveData } from '../src/game/save';
import type { Platform } from '../src/platform/types';

describe('сохранения', () => {
  it('не считает язык платформы ручным выбором', () => {
    const save = sanitizeSave({ ...defaultSave(), lang: 'en' });
    expect(save?.lang).toBe('en');
    expect(save?.langChosen).toBeUndefined();
    expect(sanitizeSave({ ...defaultSave(), lang: 'tr', langChosen: true })?.langChosen).toBe(true);
  });

  it('par-perfect: recordMastered срабатывает один раз, masteredLevels чистится и сливается', () => {
    const base = defaultSave();
    // мусор в сейве отбрасывается: только числовые ключи со значением true
    const dirty = sanitizeSave({ ...base, masteredLevels: { '3': true, x: true, '5': false, '7': 1 } as never });
    expect(dirty?.masteredLevels).toEqual({ '3': true });
    // слияние — объединение множеств (у обоих true → остаётся true)
    const local: SaveData = { ...base, masteredLevels: { '1': true, '2': true } };
    const cloud: SaveData = { ...base, masteredLevels: { '2': true, '9': true } };
    expect(mergeSave(local, cloud).masteredLevels).toEqual({ '1': true, '2': true, '9': true });
    expect(mergeSave(local, { ...cloud, masteredLevels: undefined }).masteredLevels).toEqual({ '1': true, '2': true });

    const platform = { saveData: async () => undefined } as unknown as Platform;
    const store = new SaveStore(platform, base);
    expect(store.recordMastered(12)).toBe(true);
    expect(store.recordMastered(12)).toBe(false);
    expect(store.data.masteredLevels?.['12']).toBe(true);
  });

  it('выданные достижения переживают слияние и не теряются', () => {
    const base = defaultSave();
    const local: SaveData = { ...base, achievements: ['yardLegend'] };
    const cloud: SaveData = { ...base, achievements: ['master'] };
    expect(new Set(mergeSave(local, cloud).achievements)).toEqual(new Set(['yardLegend', 'master']));
    expect(sanitizeSave({ ...base, achievements: ['master', 'master'] })?.achievements).toEqual(['master']);
  });

  it('lastLevel при слиянии выбирается по позиции в кампании, а не по большему id', () => {
    // Уровни, вставленные после релиза, имеют id 105+ и стоят В СЕРЕДИНЕ
    // кампании (105 — это 42-я позиция). Прежний Math.max по id объявлял бы
    // такой сейв «более поздним», чем сейв игрока на уровне 50.
    const base = defaultSave();
    const early: SaveData = { ...base, lastLevel: 105 };
    const late: SaveData = { ...base, lastLevel: 50 };
    expect(mergeSave(early, late).lastLevel).toBe(50);
    expect(mergeSave(late, early).lastLevel).toBe(50);

    // Уровень, которого больше нет в данных, не должен побеждать существующий.
    const unknown: SaveData = { ...base, lastLevel: 9999 };
    expect(mergeSave(unknown, late).lastLevel).toBe(50);
  });

  it('объединяет звёзды, недельные дни и кубки без потери прогресса', () => {
    const a = {
      ...defaultSave(),
      stars: { '1': 3, '2': 1 },
      daily: {
        last: '2026-07-22',
        streak: 3,
        weekKey: '2026-07-20',
        weekDays: ['2026-07-20', '2026-07-22'],
        trophies: 2
      }
    };
    const b = {
      ...defaultSave(),
      stars: { '1': 1, '2': 3 },
      daily: {
        last: '2026-07-23',
        streak: 4,
        weekKey: '2026-07-20',
        weekDays: ['2026-07-21', '2026-07-23'],
        trophies: 1
      }
    };
    const merged = mergeSave(a, b);
    expect(merged.stars).toEqual({ '1': 3, '2': 3 });
    expect(merged.daily?.weekDays).toEqual(['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23']);
    expect(merged.daily?.trophies).toBe(2);
  });

  it('отбрасывает повреждённые значения', () => {
    const save = sanitizeSave({
      ...defaultSave(),
      stars: { '1': 4, '2': 2, bad: -1 },
      targetSkin: -3,
      hintTokens: 500,
      lastGift: 123
    });
    expect(save?.stars).toEqual({ '2': 2 });
    expect(save?.targetSkin).toBe(0);
    expect(save?.hintTokens).toBe(99);
    expect(save?.lastGift).toBeUndefined();
  });

  it('вибрация по умолчанию включена, но сохраняет явное выключение', () => {
    const platform = { saveData: async () => undefined } as unknown as Platform;
    const store = new SaveStore(platform, defaultSave());
    expect(store.vibrationEnabled()).toBe(true);
    store.setVibration(false);
    expect(store.vibrationEnabled()).toBe(false);
    expect(sanitizeSave(store.data)?.vibration).toBe(false);
    store.setVibration(true);
    expect(sanitizeSave(store.data)?.vibration).toBeUndefined();
  });

  it('рекорд «Бесконечного двора» обновляется только при улучшении', () => {
    const platform = { saveData: async () => undefined } as unknown as Platform;
    const store = new SaveStore(platform, defaultSave());
    expect(store.recordEndless(4)).toBe(true);
    expect(store.recordEndless(2)).toBe(false);
    expect(store.data.endlessBest).toBe(4);
    expect(store.recordEndless(9)).toBe(true);
    expect(store.data.endlessBest).toBe(9);
  });

  it('точка восстановления заезда пишется и снимается', () => {
    const platform = { saveData: async () => undefined } as unknown as Platform;
    const store = new SaveStore(platform, defaultSave());
    store.setEndlessResume(5);
    expect(store.data.endlessResume).toBe(5);
    // Явное «Закончить забег» — поле исчезает, а не остаётся нулём.
    store.setEndlessResume(undefined);
    expect(store.data.endlessResume).toBeUndefined();
  });

  it('endlessResume: санитизация мусора и максимум при слиянии', () => {
    const clean = sanitizeSave({ ...defaultSave(), endlessResume: 7 });
    expect(clean?.endlessResume).toBe(7);
    // Отрицательные и нецелые значения отбрасываются, огромные клэмпятся.
    expect(sanitizeSave({ ...defaultSave(), endlessResume: -2 })?.endlessResume).toBeUndefined();
    expect(sanitizeSave({ ...defaultSave(), endlessResume: 1.5 })?.endlessResume).toBeUndefined();
    expect(sanitizeSave({ ...defaultSave(), endlessResume: 99_999 })?.endlessResume).toBe(9999);
    const merged = mergeSave(
      { ...defaultSave(), endlessResume: 3 },
      { ...defaultSave(), endlessResume: 6 }
    );
    expect(merged.endlessResume).toBe(6);
  });

  it('при слиянии не дублирует подарочные подсказки между устройствами', () => {
    const a = { ...defaultSave(), hintTokens: 3, lastGift: '2026-07-19' };
    const b = { ...defaultSave(), hintTokens: 2, lastGift: '2026-07-20' };
    expect(mergeSave(a, b)).toMatchObject({ hintTokens: 3, lastGift: '2026-07-20' });
  });

  it('добавляет подсказки с потолком 99 и игнорирует мусор', () => {
    const platform = { saveData: async () => undefined } as unknown as Platform;
    const store = new SaveStore(platform, defaultSave());
    store.addHintTokens(2);
    expect(store.data.hintTokens).toBe(2);
    store.addHintTokens(0);
    store.addHintTokens(-5);
    expect(store.data.hintTokens).toBe(2);
    store.addHintTokens(200);
    expect(store.data.hintTokens).toBe(99);
  });

  it('испытания деда: санитизация мусора и максимум при слиянии', () => {
    const base = { attempts: 1, best: 2, rewarded: true };
    expect(sanitizeSave({ ...defaultSave(), grandpaTrials: { 'grandpa-1': base } })?.grandpaTrials).toEqual({
      'grandpa-1': base
    });
    const dirty = sanitizeSave({
      ...defaultSave(),
      grandpaTrials: {
        'grandpa-1': { attempts: 4, best: 2 }, // попыток больше лимита — запись битая
        'grandpa-2': { attempts: 1, best: 9 }, // медаль вне 0..3 — запись битая
        'grandpa-3': { attempts: 2, best: 1, rewarded: 'yes' } // rewarded не boolean
      }
    })?.grandpaTrials;
    expect(dirty).toEqual({ 'grandpa-3': { attempts: 2, best: 1 } });
    const merged = mergeSave(
      { ...defaultSave(), grandpaTrials: { 'grandpa-1': { attempts: 1, best: 1 } } },
      { ...defaultSave(), grandpaTrials: { 'grandpa-1': { attempts: 2, best: 0, rewarded: true } } }
    );
    expect(merged.grandpaTrials?.['grandpa-1']).toEqual({ attempts: 2, best: 1, rewarded: true });
    expect(mergeSave(defaultSave(), defaultSave()).grandpaTrials).toBeUndefined();
  });

  it('испытания деда: попытки тратятся до лимита, медаль — максимум, бонус — один раз', () => {
    const platform = { saveData: async () => undefined } as unknown as Platform;
    const store = new SaveStore(platform, defaultSave());
    expect(store.recordGrandpaTrialAttempt('grandpa-1', 0)).toEqual({ previous: 0, next: 0, attempts: 1 });
    expect(store.recordGrandpaTrialAttempt('grandpa-1', 2)).toEqual({ previous: 0, next: 2, attempts: 2 });
    expect(store.recordGrandpaTrialAttempt('grandpa-1', 1)).toEqual({ previous: 2, next: 2, attempts: 3 });
    // Лимит попыток: запись после третьей не меняет счётчик.
    store.recordGrandpaTrialAttempt('grandpa-1', 3);
    expect(store.data.grandpaTrials?.['grandpa-1']).toEqual({ attempts: 3, best: 3 });
    // Бонус выдаётся однократно, подсказки приходят в сейв.
    expect(store.claimGrandpaTrialReward('grandpa-1', 2)).toBe(true);
    expect(store.data.hintTokens).toBe(2);
    expect(store.claimGrandpaTrialReward('grandpa-1', 2)).toBe(false);
    expect(store.data.hintTokens).toBe(2);
    // Без медали бонуса нет.
    store.recordGrandpaTrialAttempt('grandpa-2', 0);
    expect(store.claimGrandpaTrialReward('grandpa-2', 1)).toBe(false);
  });

  it('сериализует сохранения и отправляет неизменяемые снимки', async () => {
    const calls: SaveData[] = [];
    const releases: Array<() => void> = [];
    const platform = {
      saveData: (data: SaveData) => {
        calls.push(data);
        return new Promise<void>((resolve) => releases.push(resolve));
      }
    } as unknown as Platform;
    const store = new SaveStore(platform, defaultSave());

    store.setSound(false);
    store.setMusic(false);
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ sound: false, music: true });

    releases.shift()?.();
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toMatchObject({ sound: false, music: false });
    expect(calls[0].music).toBe(true);
    releases.shift()?.();
  });
});
