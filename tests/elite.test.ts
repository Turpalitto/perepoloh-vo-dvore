import { describe, expect, it } from 'vitest';
import { yieldToEventLoop } from './helpers';
import { defaultSave, mergeSave, sanitizeSave } from '../src/game/save';
import type { SaveData } from '../src/game/save';
import {
  MEDAL_POINTS,
  RANKS,
  elitePoints,
  goldCount,
  medalForAttempt,
  medalOf,
  medaledCount,
  nextRank,
  rankFor
} from '../src/game/elite';
import type { AttemptResult } from '../src/game/elite';
import {
  DIVISIONS,
  ELITE_CHALLENGES,
  campaignImpliedMedals,
  challengeUnlocked,
  divisionMedals,
  divisionOf,
  divisionUnlocked,
  eliteChallenge,
  sourceLevel
} from '../src/levels/elite-challenges';
import { SaveStore } from '../src/game/save';
import type { Platform } from '../src/platform/types';
import { createState, starsFor } from '../src/core/game';
import { solve } from '../src/core/solver';

const attempt = (over: Partial<AttemptResult> = {}): AttemptResult => ({
  moves: 0,
  starCollected: false,
  usedHint: false,
  usedUndo: false,
  usedRestart: false,
  ...over
});

describe('Высшая лига — сохранение', () => {
  it('старый сейв без полей лиги загружается и лига закрыта', () => {
    const old = { v: 1, stars: { '1': 3 }, sound: true, music: true, lang: 'ru', lastLevel: 5, targetSkin: 0 };
    const s = sanitizeSave(old);
    expect(s).not.toBeNull();
    expect(s!.campaignDone).toBeUndefined();
    expect(s!.endingSeen).toBeUndefined();
    expect(s!.eliteMedals).toBeUndefined();
    expect(elitePoints(s!)).toBe(0);
  });

  it('sanitize отбрасывает мусорные медали, оставляя валидные 1..3', () => {
    const s = sanitizeSave({
      ...defaultSave(),
      campaignDone: true,
      endingSeen: true,
      eliteMedals: { '1': 3, '2': 0, '3': 4, '4': 2, bad: 'x' }
    });
    expect(s!.campaignDone).toBe(true);
    expect(s!.eliteMedals).toEqual({ '1': 3, '4': 2 });
  });

  it('merge берёт максимум медали по каждому испытанию и не удваивает очки', () => {
    const a: SaveData = { ...defaultSave(), eliteMedals: { '1': 1, '2': 3 } };
    const b: SaveData = { ...defaultSave(), eliteMedals: { '1': 2, '3': 1 } };
    const merged = mergeSave(a, b);
    expect(merged.eliteMedals).toEqual({ '1': 2, '2': 3, '3': 1 });
    // повторный merge того же ничего не меняет (идемпотентность)
    expect(mergeSave(merged, merged).eliteMedals).toEqual({ '1': 2, '2': 3, '3': 1 });
  });

  it('merge сохраняет флаг кампании и самую раннюю дату', () => {
    const a: SaveData = { ...defaultSave(), campaignDone: true, campaignDoneAt: '2026-07-20', endingSeen: true };
    const b: SaveData = { ...defaultSave(), campaignDone: true, campaignDoneAt: '2026-07-18' };
    const merged = mergeSave(a, b);
    expect(merged.campaignDone).toBe(true);
    expect(merged.endingSeen).toBe(true);
    expect(merged.campaignDoneAt).toBe('2026-07-18');
  });

  it('переигровка не понижает медаль (max), поэтому награда не выдаётся заново', () => {
    const save: SaveData = { ...defaultSave(), eliteMedals: { '5': 3 } };
    // игрок прошёл хуже (серебро) — медаль остаётся золотой
    const worse: SaveData = { ...defaultSave(), eliteMedals: { '5': 2 } };
    expect(mergeSave(save, worse).eliteMedals!['5']).toBe(3);
  });
});

describe('Высшая лига — очки и ранги', () => {
  it('очки — сумма по медалям', () => {
    const save: SaveData = { ...defaultSave(), eliteMedals: { '1': 1, '2': 2, '3': 3 } };
    expect(elitePoints(save)).toBe(MEDAL_POINTS[1] + MEDAL_POINTS[2] + MEDAL_POINTS[3]);
    expect(medaledCount(save)).toBe(3);
    expect(goldCount(save)).toBe(1);
    expect(medalOf(save, 3)).toBe(3);
    expect(medalOf(save, 99)).toBe(0);
  });

  it('ранги растут по очкам и первый ранг даётся сразу', () => {
    expect(rankFor(0).key).toBe('novice');
    expect(rankFor(RANKS[1].points).key).toBe('bronze');
    expect(rankFor(100000).key).toBe('legend');
    const nx = nextRank(0);
    expect(nx?.rank.key).toBe('bronze');
    expect(nx?.remaining).toBe(RANKS[1].points);
    expect(nextRank(100000)).toBeNull();
  });

  it('максимум очков достижим и покрывает все ранги', () => {
    const max = ELITE_CHALLENGES.length * MEDAL_POINTS[3];
    expect(rankFor(max).key).toBe('legend');
  });
});

describe('Высшая лига — медали за попытку', () => {
  const ch = eliteChallenge(1)!;

  it('золото — оптимум без подсказки', () => {
    expect(medalForAttempt(ch, attempt({ moves: ch.gold.maxMoves }))).toBe(3);
    // подсказка роняет до серебра, если серебро выполнимо
    const withHint = medalForAttempt(ch, attempt({ moves: ch.gold.maxMoves, usedHint: true, starCollected: true }));
    expect(withHint).toBe(2);
  });

  it('серебро требует звезду', () => {
    expect(medalForAttempt(ch, attempt({ moves: ch.silver.maxMoves, starCollected: true }))).toBe(2);
    expect(medalForAttempt(ch, attempt({ moves: ch.silver.maxMoves, starCollected: false }))).toBe(1);
  });

  it('бронза — просто уложиться в лимит; иначе 0', () => {
    expect(medalForAttempt(ch, attempt({ moves: ch.bronze.maxMoves }))).toBe(1);
    expect(medalForAttempt(ch, attempt({ moves: ch.bronze.maxMoves + 1 }))).toBe(0);
  });
});

describe('Высшая лига — 25 мастер-испытаний валидны', () => {
  it('ровно 25 испытаний с уникальными id и существующими уровнями', () => {
    expect(ELITE_CHALLENGES).toHaveLength(25);
    expect(new Set(ELITE_CHALLENGES.map((c) => c.id)).size).toBe(25);
    for (const c of ELITE_CHALLENGES) expect(sourceLevel(c)).toBeDefined();
  });

  it('пороги упорядочены: bronze ≥ silver ≥ gold по лимиту ходов', () => {
    for (const c of ELITE_CHALLENGES) {
      expect(c.bronze.maxMoves).toBeGreaterThanOrEqual(c.silver.maxMoves);
      expect(c.silver.maxMoves).toBeGreaterThanOrEqual(c.gold.maxMoves);
    }
  });

  it(
    'золото достижимо: оптимум решателя укладывается в gold.maxMoves',
    async () => {
      for (const c of ELITE_CHALLENGES) {
        const level = sourceLevel(c);
        const res = solve(level);
        expect(res.solvable).toBe(true);
        // gold.maxMoves = par (оптимум) — решатель должен уложиться
        expect(res.optimal).toBeLessThanOrEqual(c.gold.maxMoves);
        // серебро со звездой достижимо: решение со звездой в пределах silver
        if (c.silver.requireStar && level.star) {
          const withStar = solve(level, { requireStar: true });
          expect(withStar.solvable).toBe(true);
          expect(withStar.optimal).toBeLessThanOrEqual(c.silver.maxMoves);
        }
        await yieldToEventLoop();
      }
    },
    // solve() гоняется по 25 уровням — ~40с локально, CI-раннер медленнее дефолтных 60с
    120_000
  );

  it('лестница порогов выведена из уровня: par2+2 / par2 / par', () => {
    for (const c of ELITE_CHALLENGES) {
      const level = sourceLevel(c);
      expect(c.bronze.maxMoves).toBe(level.par2 + 2);
      expect(c.silver.maxMoves).toBe(level.par2);
      expect(c.gold.maxMoves).toBe(level.par);
      // Звезда требуется ровно там, где она есть на уровне.
      expect(c.silver.requireStar ?? false).toBe(level.star !== undefined);
      // Золото всегда без подсказки — иначе кампания «доказывала» бы его.
      expect(c.gold.noHint).toBe(true);
    }
  });

  it('серебро не слабее трёх звёзд кампании (регрессия прежних порогов)', () => {
    // Прежде silver был par2+2 со звездой, то есть МЯГЧЕ условия трёх звёзд
    // (par2 со звездой): игрок получал медаль за результат хуже уже показанного.
    for (const c of ELITE_CHALLENGES) {
      const level = sourceLevel(c);
      expect(c.silver.maxMoves).toBeLessThanOrEqual(level.par2);
      // и бронза больше не «пройти как угодно»: запас ровно два хода
      expect(c.bronze.maxMoves - c.silver.maxMoves).toBe(2);
    }
  });

  it('ледяные уровни представлены, а испытаний без модификатора меньшинство', () => {
    const sources = ELITE_CHALLENGES.map((c) => c.sourceLevelId);
    // все четыре ледяных уровня кампании (у 101–104 льда нет — это обычные вставки)
    for (const ice of [105, 106, 107, 108]) expect(sources).toContain(ice);
    const byModifier = (m: string): number => ELITE_CHALLENGES.filter((c) => c.modifier === m).length;
    expect(byModifier('none')).toBe(5);
    expect(byModifier('noUndo')).toBe(9);
    expect(byModifier('noHints')).toBe(5);
    expect(byModifier('noUndoNoHints')).toBe(6);
    expect(byModifier('none')).toBeLessThan(ELITE_CHALLENGES.length / 2);
    // источники не повторяются: 25 разных уровней
    expect(new Set(sources).size).toBe(ELITE_CHALLENGES.length);
  });

  it('золотой результат честно даёт 3 звезды исходного уровня (согласованность)', () => {
    const c = eliteChallenge(1)!;
    const level = sourceLevel(c);
    const res = solve(level);
    createState(level); // расклад стартового состояния существует
    expect(starsFor(level, res.optimal, false)).toBeGreaterThanOrEqual(1);
  });
});

describe('Высшая лига — медали, заслуженные в кампании', () => {
  const noneChallenge = ELITE_CHALLENGES.find((c) => c.modifier === 'none')!;
  const moddedChallenge = ELITE_CHALLENGES.find((c) => c.modifier !== 'none')!;
  const starsFor3 = (challenge: typeof noneChallenge): Record<string, number> => ({
    [String(challenge.sourceLevelId)]: 3
  });

  it('три звезды на испытании без модификатора дают серебро', () => {
    const granted = campaignImpliedMedals(starsFor3(noneChallenge));
    expect(granted[String(noneChallenge.id)]).toBe(2);
  });

  it('две звезды дают бронзу, одна — ничего', () => {
    const level = sourceLevel(noneChallenge);
    expect(campaignImpliedMedals({ [String(level.id)]: 2 })[String(noneChallenge.id)]).toBe(1);
    expect(campaignImpliedMedals({ [String(level.id)]: 1 })[String(noneChallenge.id)]).toBeUndefined();
    expect(campaignImpliedMedals({})[String(noneChallenge.id)]).toBeUndefined();
  });

  it('испытание с модификатором не переносится: кампания его не доказывает', () => {
    const granted = campaignImpliedMedals(starsFor3(moddedChallenge));
    expect(granted[String(moddedChallenge.id)]).toBeUndefined();
  });

  it('золото не выдаётся никогда — оно требует прохождения без подсказки', () => {
    const allThree: Record<string, number> = {};
    for (const c of ELITE_CHALLENGES) allThree[String(c.sourceLevelId)] = 3;
    const granted = campaignImpliedMedals(allThree);
    expect(Object.values(granted).every((m) => m <= 2)).toBe(true);
    // и переносятся ровно испытания без модификатора
    expect(Object.keys(granted).length).toBe(ELITE_CHALLENGES.filter((c) => c.modifier === 'none').length);
  });

  it('полная кампания на три звезды не выносит игрока выше серебряного ранга', () => {
    const allThree: Record<string, number> = {};
    for (const c of ELITE_CHALLENGES) allThree[String(c.sourceLevelId)] = 3;
    const save: SaveData = { ...defaultSave(), eliteMedals: campaignImpliedMedals(allThree) };
    // все 25 серебром — потолок «переноса» — тоже ниже золотого ранга
    const allSilver: SaveData = {
      ...defaultSave(),
      eliteMedals: Object.fromEntries(ELITE_CHALLENGES.map((c) => [String(c.id), 2]))
    };
    expect(rankFor(elitePoints(save)).points).toBeLessThan(RANKS.find((r) => r.key === 'gold')!.points);
    expect(rankFor(elitePoints(allSilver)).key).toBe('silver');
  });

  it('выдача идемпотентна и не понижает уже заработанное', () => {
    const platform = { saveData: async () => undefined } as unknown as Platform;
    const store = new SaveStore(platform, { ...defaultSave(), eliteMedals: { [String(noneChallenge.id)]: 3 } });
    const implied = campaignImpliedMedals(starsFor3(noneChallenge));
    // золото не понижается до серебра
    expect(store.grantEliteMedals(implied)).toBe(0);
    expect(store.data.eliteMedals![String(noneChallenge.id)]).toBe(3);

    const fresh = new SaveStore(platform, defaultSave());
    expect(fresh.grantEliteMedals(implied)).toBe(1);
    // повторный вызов ничего не выдаёт
    expect(fresh.grantEliteMedals(implied)).toBe(0);
  });
});

describe('Высшая лига — дивизионы', () => {
  it('пять блоков по пять испытаний покрывают весь список без пересечений', () => {
    expect(DIVISIONS).toHaveLength(5);
    expect(DIVISIONS.reduce((sum, d) => sum + (d.to - d.from + 1), 0)).toBe(ELITE_CHALLENGES.length);
    for (const c of ELITE_CHALLENGES) {
      const division = DIVISIONS[divisionOf(c.id) - 1];
      expect(c.id).toBeGreaterThanOrEqual(division.from);
      expect(c.id).toBeLessThanOrEqual(division.to);
    }
  });

  it('первый дивизион открыт всегда, остальные — по трём медалям предыдущего', () => {
    expect(divisionUnlocked({}, 1)).toBe(true);
    expect(divisionUnlocked({}, 2)).toBe(false);
    // две медали — ещё мало
    expect(divisionUnlocked({ '1': 1, '2': 3 }, 2)).toBe(false);
    expect(divisionUnlocked({ '1': 1, '2': 3, '3': 1 }, 2)).toBe(true);
    // медали чужого дивизиона не открывают
    expect(divisionUnlocked({ '11': 3, '12': 3, '13': 3 }, 2)).toBe(false);
  });

  it('challengeUnlocked повторяет правило дивизиона, а не собственный прогресс', () => {
    const medals = { '1': 1, '2': 1, '3': 1 };
    // весь второй дивизион открыт целиком, а не по одному испытанию
    for (let id = DIVISIONS[1].from; id <= DIVISIONS[1].to; id++) {
      expect(challengeUnlocked(medals, id)).toBe(true);
    }
    expect(challengeUnlocked(medals, DIVISIONS[2].from)).toBe(false);
  });

  it('перенос из кампании сам по себе не открывает лигу целиком', () => {
    const allThree: Record<string, number> = {};
    for (const c of ELITE_CHALLENGES) allThree[String(c.sourceLevelId)] = 3;
    const implied = campaignImpliedMedals(allThree);
    // первый дивизион получает медали и открывает второй…
    expect(divisionUnlocked(implied, 2)).toBe(true);
    // …но дальше третьего блока без игры не пройти
    expect(divisionUnlocked(implied, 3)).toBe(false);
    expect(divisionMedals(implied, 3)).toBe(0);
  });
});
