/**
 * Сюжетные боссы — многофазные события. Ключевое архитектурное решение (по
 * требованию: «не ломай BFS-решатель, доказуемая проходимость»): босс НЕ меняет
 * core и не вводит многоцелевой solver. Босс — это ПОСЛЕДОВАТЕЛЬНОСТЬ обычных,
 * по отдельности решаемых под-уровней (фаз). Каждая фаза ссылается на реальный
 * `sourceLevelId`, поэтому её проходимость доказывается штатным решателем
 * (тест `boss.test.ts`), restart возвращает к фазе 0, undo работает внутри фазы
 * средствами обычного уровня, а состояние (индекс фазы) тривиально сериализуемо.
 *
 * Здесь только чистые данные и логика фаз (без DOM). Постановка (интро, реплики
 * деда, победная сцена) навешивается UI поверх этих фактов.
 */

import type { LevelDef } from '../core/types';
import { buildRemix } from '../levels/remix';

/** Что завершает фазу. Пока — прохождение под-уровня, опц. со звездой. */
export interface BossObjective {
  kind: 'clear';
  requireStar?: boolean;
}

/**
 * Ремикс фазы: двор источника, узнаётся, но заученный маршрут больше не
 * работает. Часть спецификации ремикса (`src/levels/remix.ts`); `par` — оптимум
 * решателя конкретного ремикса, сверяется тестом `boss.test.ts` так же, как
 * `par` уровней кампании.
 */
export interface BossRemixSpec {
  flip?: 'x' | 'y';
  shift?: Array<{ piece: string; dx: number; dy: number }>;
  par: number;
  par2: number;
}

export interface BossPhase {
  id: string;
  /** Под-уровень фазы (существующий уровень кампании — проверяем решателем). */
  sourceLevelId: number;
  objective: BossObjective;
  /** Ремикс под-уровня; без него фаза играется исходным уровнем. */
  remix?: BossRemixSpec;
  /** Ключ короткой реплики деда на входе в фазу. */
  grandpaLineKey?: string;
  /** Декоративное изменение мира на этой фазе (класс на игровом экране). */
  worldChange?: string;
}

export interface BossLevelDef {
  /** Слот в кампании, где живёт босс (не заменяет уровень, а надстраивает вход). */
  id: number;
  nameKey: string;
  introKey: string;
  victoryKey: string;
  phases: BossPhase[];
}

/** Пять сюжетных боссов. Фазы — ремиксы проходимых уровней кампании (solver-проверены). */
export const BOSSES: BossLevelDef[] = [
  {
    id: 10,
    nameKey: 'boss.truck.name',
    introKey: 'boss.truck.intro',
    victoryKey: 'boss.truck.victory',
    phases: [
      {
        id: 'free',
        sourceLevelId: 9,
        objective: { kind: 'clear' },
        remix: { flip: 'x', shift: [{ piece: 'A', dx: 0, dy: 1 }], par: 4, par2: 8 },
        grandpaLineKey: 'boss.truck.p1',
        worldChange: 'boss-convoy'
      },
      {
        id: 'park',
        sourceLevelId: 10,
        objective: { kind: 'clear' },
        remix: { flip: 'x', shift: [{ piece: 'A', dx: 0, dy: -1 }], par: 6, par2: 10 },
        grandpaLineKey: 'boss.truck.p2',
        worldChange: 'boss-neighbor'
      }
    ]
  },
  {
    id: 25,
    nameKey: 'boss.cellar.name',
    introKey: 'boss.cellar.intro',
    victoryKey: 'boss.cellar.victory',
    phases: [
      {
        id: 'lure',
        sourceLevelId: 24,
        objective: { kind: 'clear' },
        remix: { flip: 'x', shift: [{ piece: 'B', dx: 1, dy: 0 }], par: 7, par2: 11 },
        grandpaLineKey: 'boss.cellar.p1',
        worldChange: 'boss-chickens'
      },
      {
        id: 'gate',
        sourceLevelId: 25,
        objective: { kind: 'clear', requireStar: true },
        remix: { flip: 'x', shift: [{ piece: 'A', dx: 1, dy: 0 }], par: 9, par2: 13 },
        grandpaLineKey: 'boss.cellar.p2',
        worldChange: 'boss-gate-rush'
      }
    ]
  },
  {
    id: 50,
    nameKey: 'boss.tractor.name',
    introKey: 'boss.tractor.intro',
    victoryKey: 'boss.tractor.victory',
    phases: [
      {
        id: 'free',
        sourceLevelId: 49,
        objective: { kind: 'clear' },
        remix: { flip: 'x', shift: [{ piece: 'A', dx: 0, dy: 1 }], par: 10, par2: 14 },
        grandpaLineKey: 'boss.tractor.p1',
        worldChange: 'boss-dust'
      },
      {
        id: 'start',
        sourceLevelId: 50,
        objective: { kind: 'clear' },
        remix: { flip: 'x', shift: [{ piece: 'A', dx: 0, dy: 1 }], par: 10, par2: 14 },
        grandpaLineKey: 'boss.tractor.p2',
        worldChange: 'boss-smoke'
      }
    ]
  },
  {
    id: 75,
    nameKey: 'boss.storm.name',
    introKey: 'boss.storm.intro',
    victoryKey: 'boss.storm.victory',
    phases: [
      {
        id: 'crates',
        sourceLevelId: 74,
        objective: { kind: 'clear' },
        remix: { flip: 'x', shift: [{ piece: 'A', dx: -1, dy: 0 }], par: 12, par2: 16 },
        grandpaLineKey: 'boss.storm.p1',
        worldChange: 'boss-wind'
      },
      {
        id: 'buttons',
        sourceLevelId: 75,
        objective: { kind: 'clear' },
        remix: { flip: 'x', shift: [{ piece: 'B', dx: 0, dy: 1 }], par: 12, par2: 16 },
        grandpaLineKey: 'boss.storm.p2',
        worldChange: 'boss-wind'
      }
    ]
  },
  {
    id: 100,
    nameKey: 'boss.grand.name',
    introKey: 'boss.grand.intro',
    victoryKey: 'boss.grand.victory',
    phases: [
      {
        id: 'tractor',
        sourceLevelId: 88,
        objective: { kind: 'clear' },
        remix: { flip: 'x', shift: [{ piece: 'B', dx: -1, dy: 0 }], par: 12, par2: 16 },
        grandpaLineKey: 'boss.grand.p1',
        worldChange: 'boss-smoke'
      },
      {
        id: 'truck',
        sourceLevelId: 98,
        objective: { kind: 'clear' },
        remix: { flip: 'x', shift: [{ piece: 'A', dx: -1, dy: 0 }], par: 20, par2: 24 },
        grandpaLineKey: 'boss.grand.p2',
        worldChange: 'boss-neighbor'
      },
      {
        id: 'final',
        sourceLevelId: 100,
        objective: { kind: 'clear', requireStar: true },
        remix: { flip: 'x', shift: [{ piece: 'A', dx: -1, dy: 0 }], par: 25, par2: 29 },
        grandpaLineKey: 'boss.grand.p3',
        worldChange: 'boss-finale'
      }
    ]
  }
];

/** Проверяет выполнение цели фазы по итоговому состоянию уровня (чистая функция, без DOM). */
export function bossObjectiveSatisfied(phase: BossPhase, state: { starCollected: boolean }): boolean {
  if (phase.objective.requireStar) return state.starCollected;
  return true;
}

/**
 * Уровень фазы: ремикс источника, если он задан, иначе сам источник.
 * Id ремикса — 2000 + id босса × 10 + индекс фазы: вне кампании (1-128) и
 * вне id-пространства лиги (901-930), по нему не считаются звёзды/главы.
 */
export function bossPhaseLevel(phase: BossPhase, source: LevelDef, bossId: number, phaseIndex: number): LevelDef {
  if (!phase.remix) return source;
  return buildRemix(
    source,
    { source: source.id, name: `${source.name} ⚡`, ...phase.remix },
    2000 + bossId * 10 + phaseIndex
  );
}

export function bossFor(levelId: number): BossLevelDef | undefined {
  return BOSSES.find((b) => b.id === levelId);
}

/** Сериализуемое состояние прохождения босса (индекс текущей фазы). */
export interface BossRun {
  bossId: number;
  phaseIndex: number;
  done: boolean;
}

export function createBossRun(boss: BossLevelDef): BossRun {
  return { bossId: boss.id, phaseIndex: 0, done: false };
}

export function currentPhase(run: BossRun, boss: BossLevelDef): BossPhase | null {
  if (run.done) return null;
  return boss.phases[run.phaseIndex] ?? null;
}

/** Отмечает текущую фазу пройденной, переходит к следующей или помечает done. */
export function advancePhase(run: BossRun, boss: BossLevelDef): BossRun {
  const next = run.phaseIndex + 1;
  if (next >= boss.phases.length) return { ...run, done: true };
  return { ...run, phaseIndex: next };
}

/** Полный рестарт босса — к первой фазе. */
export function restartBoss(run: BossRun): BossRun {
  return { ...run, phaseIndex: 0, done: false };
}

/** Восстановление состояния из сейва с валидацией (иначе — с начала). */
export function reviveBossRun(raw: unknown, boss: BossLevelDef): BossRun {
  if (
    typeof raw === 'object' &&
    raw !== null &&
    (raw as BossRun).bossId === boss.id &&
    Number.isInteger((raw as BossRun).phaseIndex) &&
    (raw as BossRun).phaseIndex >= 0 &&
    (raw as BossRun).phaseIndex < boss.phases.length
  ) {
    const r = raw as BossRun;
    return { bossId: boss.id, phaseIndex: r.phaseIndex, done: r.done === true };
  }
  return createBossRun(boss);
}

export function bossProgress(run: BossRun, boss: BossLevelDef): { phase: number; total: number } {
  return { phase: Math.min(run.phaseIndex + 1, boss.phases.length), total: boss.phases.length };
}
