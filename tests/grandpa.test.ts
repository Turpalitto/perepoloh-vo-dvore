import { describe, expect, it } from 'vitest';
import {
  GRANDPA_GLOBAL_COOLDOWN_MS,
  GRANDPA_LINES,
  type GrandpaLine,
  commitLine,
  createGrandpaState,
  pickLine,
  textKeyOf
} from '../src/game/grandpa';
import { RateLimiter, grandpaEventFor, isSharpMove } from '../src/game/yard-events';

const ctx = (over: Partial<{ now: number; level: number; rng: () => number }> = {}) => ({
  now: 0,
  level: 5,
  rng: () => 0,
  ...over
});

describe('дед — выбор реплик', () => {
  it('на старте уровня выдаёт реплику нужного события', () => {
    const state = createGrandpaState();
    const line = pickLine(state, 'level-start', ctx());
    expect(line).not.toBeNull();
    expect(line!.event).toBe('level-start');
  });

  it('не повторяет одну и ту же реплику подряд', () => {
    const state = createGrandpaState();
    const first = pickLine(state, 'collision', ctx({ now: 1000 }))!;
    commitLine(state, first, 1000);
    // rng=0 выбрал бы ту же — но анти-повтор обязан дать другую
    const second = pickLine(state, 'collision', ctx({ now: 20000 }));
    expect(second).not.toBeNull();
    expect(second!.id).not.toBe(first.id);
  });

  it('глобальный кулдаун: обычные реплики молчат между ходами', () => {
    const state = createGrandpaState();
    const first = pickLine(state, 'star', ctx({ now: 1000 }))!;
    commitLine(state, first, 1000);
    // слишком рано для другого обычного комментария
    const soon = pickLine(state, 'gate', ctx({ now: 1000 + GRANDPA_GLOBAL_COOLDOWN_MS - 1 }));
    expect(soon).toBeNull();
    const later = pickLine(state, 'gate', ctx({ now: 1000 + GRANDPA_GLOBAL_COOLDOWN_MS + 1 }));
    expect(later).not.toBeNull();
  });

  it('сюжетные реплики (boss) обходят глобальный кулдаун', () => {
    const state = createGrandpaState();
    commitLine(state, pickLine(state, 'star', ctx({ now: 1000 }))!, 1000);
    const boss = pickLine(state, 'boss-intro', ctx({ now: 1200 }));
    expect(boss).not.toBeNull();
    expect(boss!.priority).toBeGreaterThanOrEqual(3);
  });

  it('однократная реплika не повторяется после commit + seen', () => {
    const state = createGrandpaState();
    const line = pickLine(state, 'campaign-done', ctx({ now: 0 }))!;
    expect(line.once).toBe(true);
    commitLine(state, line, 0);
    expect(state.seen.has(line.id)).toBe(true);
    expect(pickLine(state, 'campaign-done', ctx({ now: 999999 }))).toBeNull();
  });

  it('персональный кулдаун не даёт спамить одной репликой', () => {
    // Пул из двух реплик: cooldown у 'a' держит её на паузе, пока идёт 'b'.
    // priority:1 обходит глобальный кулдаун, чтобы проверить именно личный.
    const pool: GrandpaLine[] = [
      { id: 'a', event: 'collision', mood: 'grumpy', cooldownMs: 5000, priority: 1 },
      { id: 'b', event: 'collision', mood: 'surprised', cooldownMs: 5000, priority: 1 }
    ];
    const state = createGrandpaState();
    const first = pickLine(state, 'collision', ctx({ now: 1000, rng: () => 0 }), pool)!;
    expect(first.id).toBe('a');
    commitLine(state, first, 1000);
    // сразу — 'a' на анти-повторе, 'b' доступна
    const second = pickLine(state, 'collision', ctx({ now: 1500 }), pool)!;
    expect(second.id).toBe('b');
    commitLine(state, second, 1500);
    // 'b' анти-повтор, 'a' ещё в кулдауне (1500-1000<5000) → молчок
    expect(pickLine(state, 'collision', ctx({ now: 2000 }), pool)).toBeNull();
    // после кулдауна 'a' снова доступна
    expect(pickLine(state, 'collision', ctx({ now: 6500 }), pool)!.id).toBe('a');
  });

  it('фильтр по уровню (minLevel/maxLevel)', () => {
    const first = GRANDPA_LINES.find((l) => l.id === 'first')!;
    expect(first.maxLevel).toBe(1);
    const state = createGrandpaState();
    expect(pickLine(state, 'first-move', ctx({ level: 3 }), [first])).toBeNull();
    expect(pickLine(state, 'first-move', ctx({ level: 1 }), [first])).not.toBeNull();
  });

  it('все реплики имеют ключ локализации по конвенции', () => {
    for (const l of GRANDPA_LINES) expect(textKeyOf(l)).toBe(`grandpa.${l.id}`);
    expect(GRANDPA_LINES.length).toBeGreaterThanOrEqual(30);
  });
});

describe('события двора', () => {
  it('резкий ход — трактор/грузовик или далеко', () => {
    expect(isSharpMove({ type: 'move-end', kind: 'tractor', distance: 1 })).toBe(true);
    expect(isSharpMove({ type: 'move-end', kind: 'car', distance: 4 })).toBe(true);
    expect(isSharpMove({ type: 'move-end', kind: 'car', distance: 1 })).toBe(false);
  });

  it('rate-limiter пропускает не чаще интервала', () => {
    const rl = new RateLimiter(1000);
    expect(rl.allow(0)).toBe(true);
    expect(rl.allow(500)).toBe(false);
    expect(rl.allow(1001)).toBe(true);
  });

  it('маппинг факта двора в событие деда', () => {
    expect(grandpaEventFor({ type: 'collision' })).toBe('collision');
    expect(grandpaEventFor({ type: 'level-won', stars: 3 })).toBe('win-perfect');
    expect(grandpaEventFor({ type: 'level-won', stars: 2 })).toBe('win');
    expect(grandpaEventFor({ type: 'move-end' })).toBeNull();
  });
});
