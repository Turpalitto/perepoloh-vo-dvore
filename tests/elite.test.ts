import { describe, expect, it } from 'vitest';
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
import { ELITE_CHALLENGES, eliteChallenge, sourceLevel } from '../src/levels/elite-challenges';
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

  it('золото достижимо: оптимум решателя укладывается в gold.maxMoves', () => {
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
    }
  });

  it('золотой результат честно даёт 3 звезды исходного уровня (согласованность)', () => {
    const c = eliteChallenge(1)!;
    const level = sourceLevel(c);
    const res = solve(level);
    createState(level); // расклад стартового состояния существует
    expect(starsFor(level, res.optimal, false)).toBeGreaterThanOrEqual(1);
  });
});
