import { describe, expect, it } from 'vitest';
import levelsJson from '../src/levels/levels.json';
import type { LevelDef } from '../src/core/types';
import { analyzeDifficulty } from '../src/core/difficulty';
import { solve } from '../src/core/solver';

const LEVELS = levelsJson as LevelDef[];
const byId = (id: number) => LEVELS.find((l) => l.id === id)!;

describe('оценка сложности', () => {
  it('оптимум совпадает с решателем (один источник правил)', () => {
    for (const id of [1, 6, 25, 60]) {
      const level = byId(id);
      const res = analyzeDifficulty(level);
      expect(res.metrics.optimalMoves, `уровень ${id}`).toBe(solve(level).optimal);
      expect(res.metrics.complete).toBe(true);
    }
  });

  it('детерминирована: два запуска дают одинаковый результат', () => {
    const a = analyzeDifficulty(byId(14));
    const b = analyzeDifficulty(byId(14));
    expect(a).toEqual(b);
  });

  it('уровень 1 — обучающий, поздний уровень ощутимо сложнее', () => {
    const first = analyzeDifficulty(byId(1));
    const late = analyzeDifficulty(byId(90));
    expect(first.tier).toBe('tutorial');
    expect(late.score).toBeGreaterThan(first.score + 15);
  });

  it('уровень с ящиками имеет доказуемые тупики, уровень без ящиков — нет', () => {
    // уровень 6 — ящик можно загнать в невозвратную позицию (см. deadlock.test.ts)
    const crated = analyzeDifficulty(byId(6));
    expect(crated.metrics.crates).toBeGreaterThan(0);
    expect(crated.metrics.deadRatio).toBeGreaterThan(0);
    // уровень 4 — без ящиков; любое достижимое состояние решаемо
    const clean = analyzeDifficulty(byId(4));
    expect(clean.metrics.crates).toBe(0);
    expect(clean.metrics.deadRatio).toBe(0);
  });

  it('метрики в разумных диапазонах', () => {
    const res = analyzeDifficulty(byId(30));
    const m = res.metrics;
    expect(m.optimalMoves).toBeGreaterThan(0);
    expect(m.reachableStates).toBeGreaterThan(m.optimalMoves);
    expect(m.branchingAvg).toBeGreaterThan(0);
    expect(m.deadRatio).toBeGreaterThanOrEqual(0);
    expect(m.deadRatio).toBeLessThan(1);
    expect(m.falseStartRatio).toBeGreaterThanOrEqual(0);
    expect(m.falseStartRatio).toBeLessThanOrEqual(1);
    expect(m.bottleneckWidth).toBeGreaterThanOrEqual(1);
    expect(res.explanation.length).toBeGreaterThan(0);
  });

  it('лимит состояний даёт честный complete=false, а не выдуманные метрики', () => {
    const res = analyzeDifficulty(byId(90), { stateLimit: 50 });
    expect(res.metrics.complete).toBe(false);
    expect(res.metrics.deadRatio).toBe(0); // не утверждаем тупики на оборванном графе
    expect(res.explanation.join(' ')).toContain('лимит');
  });
});
