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

/** Что завершает фазу. Пока — прохождение под-уровня, опц. со звездой. */
export interface BossObjective {
  kind: 'clear';
  requireStar?: boolean;
}

export interface BossPhase {
  id: string;
  /** Под-уровень фазы (существующий уровень кампании — проверяем решателем). */
  sourceLevelId: number;
  objective: BossObjective;
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

/** Пять сюжетных боссов. Фазы собраны из проходимых уровней кампании. */
export const BOSSES: BossLevelDef[] = [
  {
    id: 10,
    nameKey: 'boss.tractor.name',
    introKey: 'boss.tractor.intro',
    victoryKey: 'boss.tractor.victory',
    phases: [
      { id: 'free', sourceLevelId: 9, objective: { kind: 'clear' }, grandpaLineKey: 'boss.tractor.p1', worldChange: 'boss-dust' },
      { id: 'start', sourceLevelId: 10, objective: { kind: 'clear' }, grandpaLineKey: 'boss.tractor.p2', worldChange: 'boss-smoke' }
    ]
  },
  {
    id: 25,
    nameKey: 'boss.chickens.name',
    introKey: 'boss.chickens.intro',
    victoryKey: 'boss.chickens.victory',
    phases: [
      { id: 'lure', sourceLevelId: 24, objective: { kind: 'clear' }, grandpaLineKey: 'boss.chickens.p1', worldChange: 'boss-chickens' },
      { id: 'gate', sourceLevelId: 25, objective: { kind: 'clear', requireStar: true }, grandpaLineKey: 'boss.chickens.p2', worldChange: 'boss-gate-rush' }
    ]
  },
  {
    id: 50,
    nameKey: 'boss.truck.name',
    introKey: 'boss.truck.intro',
    victoryKey: 'boss.truck.victory',
    phases: [
      { id: 'free', sourceLevelId: 49, objective: { kind: 'clear' }, grandpaLineKey: 'boss.truck.p1', worldChange: 'boss-convoy' },
      { id: 'park', sourceLevelId: 50, objective: { kind: 'clear' }, grandpaLineKey: 'boss.truck.p2', worldChange: 'boss-neighbor' }
    ]
  },
  {
    id: 75,
    nameKey: 'boss.storm.name',
    introKey: 'boss.storm.intro',
    victoryKey: 'boss.storm.victory',
    phases: [
      { id: 'crates', sourceLevelId: 74, objective: { kind: 'clear' }, grandpaLineKey: 'boss.storm.p1', worldChange: 'boss-wind' },
      { id: 'buttons', sourceLevelId: 75, objective: { kind: 'clear' }, grandpaLineKey: 'boss.storm.p2', worldChange: 'boss-wind' }
    ]
  },
  {
    id: 100,
    nameKey: 'boss.grand.name',
    introKey: 'boss.grand.intro',
    victoryKey: 'boss.grand.victory',
    phases: [
      { id: 'tractor', sourceLevelId: 88, objective: { kind: 'clear' }, grandpaLineKey: 'boss.grand.p1', worldChange: 'boss-smoke' },
      { id: 'truck', sourceLevelId: 98, objective: { kind: 'clear' }, grandpaLineKey: 'boss.grand.p2', worldChange: 'boss-neighbor' },
      { id: 'final', sourceLevelId: 100, objective: { kind: 'clear', requireStar: true }, grandpaLineKey: 'boss.grand.p3', worldChange: 'boss-finale' }
    ]
  }
];

/** Проверяет выполнение цели фазы по итоговому состоянию уровня (чистая функция, без DOM). */
export function bossObjectiveSatisfied(phase: BossPhase, state: { starCollected: boolean }): boolean {
  if (phase.objective.requireStar) return state.starCollected;
  return true;
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
