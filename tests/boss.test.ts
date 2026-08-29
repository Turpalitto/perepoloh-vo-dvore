import { describe, expect, it } from 'vitest';
import { yieldToEventLoop } from './helpers';
import levelsJson from '../src/levels/levels.json';
import type { LevelDef } from '../src/core/types';
import { solve } from '../src/core/solver';
import {
  BOSSES,
  advancePhase,
  bossFor,
  bossObjectiveSatisfied,
  bossPhaseLevel,
  bossProgress,
  createBossRun,
  currentPhase,
  restartBoss,
  reviveBossRun
} from '../src/game/boss';
import { validateLevel } from '../src/core/validator';

const LEVELS = levelsJson as LevelDef[];
const levelById = (id: number) => LEVELS.find((l) => l.id === id);

describe('боссы — структура', () => {
  it('минимум 5 боссов, каждый с ≥2 фазами в известных слотах', () => {
    expect(BOSSES.length).toBeGreaterThanOrEqual(5);
    expect(BOSSES.map((b) => b.id).sort((a, b) => a - b)).toEqual([10, 25, 50, 75, 100]);
    for (const b of BOSSES) expect(b.phases.length).toBeGreaterThanOrEqual(2);
  });

  it('bossFor находит босса по слоту', () => {
    expect(bossFor(10)?.nameKey).toBe('boss.truck.name');
    expect(bossFor(50)?.nameKey).toBe('boss.tractor.name');
    expect(bossFor(7)).toBeUndefined();
  });

  it('каждая фаза ссылается на существующий уровень', () => {
    for (const b of BOSSES) for (const p of b.phases) expect(levelById(p.sourceLevelId)).toBeDefined();
  });

  it('каждая фаза задаёт визуальное состояние двора', () => {
    for (const b of BOSSES) {
      for (const p of b.phases) expect(p.worldChange, `boss ${b.id} phase ${p.id}`).toMatch(/^boss-/);
    }
  });
});

describe('боссы — проходимость (решатель)', () => {
  it(
    'каждая фаза каждого босса решается штатным solver',
    async () => {
      for (const b of BOSSES) {
        for (const [phaseIndex, p] of b.phases.entries()) {
          const phaseLevel = bossPhaseLevel(p, levelById(p.sourceLevelId)!, b.id, phaseIndex);
          const res = solve(phaseLevel);
          expect(res.solvable, `boss ${b.id} phase ${p.id}`).toBe(true);
          expect(res.optimal).toBeGreaterThan(0);
          // если фаза требует звезду — решение со звездой тоже существует
          if (p.objective.requireStar && phaseLevel.star) {
            const withStar = solve(phaseLevel, { requireStar: true });
            expect(withStar.solvable, `boss ${b.id} phase ${p.id} star`).toBe(true);
          }
          await yieldToEventLoop();
        }
      }
    },
    120_000
  );

  it('объявленный par ремикса фазы совпадает с оптимумом решателя', async () => {
    for (const b of BOSSES) {
      for (const [phaseIndex, p] of b.phases.entries()) {
        if (!p.remix) continue;
        const phaseLevel = bossPhaseLevel(p, levelById(p.sourceLevelId)!, b.id, phaseIndex);
        expect(validateLevel(phaseLevel, { withSolver: false }), `boss ${b.id} phase ${p.id} valid`).toEqual([]);
        const res = solve(phaseLevel);
        expect(res.solvable, `boss ${b.id} phase ${p.id}`).toBe(true);
        expect(res.optimal, `boss ${b.id} phase ${p.id} par`).toBe(p.remix.par);
        expect(p.remix.par2).toBeGreaterThan(p.remix.par);
        await yieldToEventLoop();
      }
    }
  }, 120_000);
});

describe('боссы — контроллер фаз', () => {
  const boss = bossFor(10)!;

  it('старт → первая фаза; advance проходит по фазам до done', () => {
    let run = createBossRun(boss);
    expect(run.phaseIndex).toBe(0);
    expect(currentPhase(run, boss)!.id).toBe('free');
    run = advancePhase(run, boss);
    expect(run.phaseIndex).toBe(1);
    expect(currentPhase(run, boss)!.id).toBe('park');
    run = advancePhase(run, boss);
    expect(run.done).toBe(true);
    expect(currentPhase(run, boss)).toBeNull();
  });

  it('restart возвращает к первой фазе', () => {
    let run = advancePhase(createBossRun(boss), boss);
    run = restartBoss(run);
    expect(run.phaseIndex).toBe(0);
    expect(run.done).toBe(false);
  });

  it('прогресс фаз для HUD', () => {
    const run = advancePhase(createBossRun(boss), boss);
    expect(bossProgress(run, boss)).toEqual({ phase: 2, total: 2 });
  });

  it('сериализация/восстановление состояния', () => {
    const run = advancePhase(createBossRun(boss), boss);
    const json = JSON.parse(JSON.stringify(run));
    expect(reviveBossRun(json, boss)).toEqual(run);
    // мусор → с начала
    expect(reviveBossRun({ bossId: 999, phaseIndex: 5 }, boss)).toEqual(createBossRun(boss));
    expect(reviveBossRun(null, boss)).toEqual(createBossRun(boss));
    expect(reviveBossRun({ bossId: 10, phaseIndex: 99 }, boss)).toEqual(createBossRun(boss));
  });
});

describe('bossObjectiveSatisfied', () => {
  it('requireStar не задан — обычное прохождение разрешено вне зависимости от звезды', () => {
    const phase = { id: 'x', sourceLevelId: 1, objective: { kind: 'clear' as const } };
    expect(bossObjectiveSatisfied(phase, { starCollected: false })).toBe(true);
    expect(bossObjectiveSatisfied(phase, { starCollected: true })).toBe(true);
  });

  it('requireStar: true, звезда не собрана — запрещено', () => {
    const phase = { id: 'x', sourceLevelId: 1, objective: { kind: 'clear' as const, requireStar: true } };
    expect(bossObjectiveSatisfied(phase, { starCollected: false })).toBe(false);
  });

  it('requireStar: true, звезда собрана — разрешено', () => {
    const phase = { id: 'x', sourceLevelId: 1, objective: { kind: 'clear' as const, requireStar: true } };
    expect(bossObjectiveSatisfied(phase, { starCollected: true })).toBe(true);
  });

  it('фазы 25 (gate) и 100 (final) реально требуют звезду в данных', () => {
    const boss25 = bossFor(25)!;
    const boss100 = bossFor(100)!;
    expect(boss25.phases.find((p) => p.id === 'gate')?.objective.requireStar).toBe(true);
    expect(boss100.phases.find((p) => p.id === 'final')?.objective.requireStar).toBe(true);
  });
});
