/**
 * События «живого двора» — факты хода, которые UI превращает в декоративные
 * реакции (пыль, куры, ведро, пузырь деда). Core остаётся чистым и о DOM не
 * знает: он отдаёт факты (MoveResult и т.п.), а этот слой их классифицирует.
 * Здесь только типы и чистые помощники (без DOM), поэтому всё тестируемо.
 */

export type YardEventType =
  | 'move-start'
  | 'move-end'
  | 'collision'
  | 'star-collected'
  | 'gate-unlocked'
  | 'tractor-move'
  | 'level-restarted'
  | 'level-won';

export interface YardEvent {
  type: YardEventType;
  /** Идентификатор фигуры (data-piece), если применимо. */
  pieceId?: string;
  /** Тип фигуры (car/truck/tractor/crate/target). */
  kind?: string;
  /** Пройдено клеток за ход (для move-end). */
  distance?: number;
  /** Вид препятствия при упоре. */
  obstacleKind?: string;
  moves?: number;
  stars?: number;
}

/** «Резкий» ход — далеко или тяжёлой техникой: сильнее реакция (куры, пыль). */
export function isSharpMove(event: YardEvent): boolean {
  if (event.kind === 'tractor' || event.kind === 'truck') return true;
  return (event.distance ?? 0) >= 3;
}

/**
 * Простой rate-limiter: пропускает не чаще, чем раз в `intervalMs`. Держит
 * заметные реакции (стая кур, крупная пыль) редкими и производительными.
 * Чистый и детерминированный — время инъектируется.
 */
export class RateLimiter {
  private last = -Infinity;
  constructor(private readonly intervalMs: number) {}

  /** true — можно сыграть реакцию; тогда фиксирует время. */
  allow(now: number): boolean {
    if (now - this.last < this.intervalMs) return false;
    this.last = now;
    return true;
  }

  reset(): void {
    this.last = -Infinity;
  }
}

/** Событие деда, соответствующее факту двора (или null, если деду тут молчать). */
export function grandpaEventFor(
  event: YardEvent
): import('./grandpa').GrandpaEvent | null {
  switch (event.type) {
    case 'collision':
      return 'collision';
    case 'star-collected':
      return 'star';
    case 'gate-unlocked':
      return 'gate';
    case 'tractor-move':
      return 'tractor';
    case 'level-restarted':
      return 'restart-repeat';
    case 'level-won':
      return (event.stars ?? 0) >= 3 ? 'win-perfect' : 'win';
    default:
      return null;
  }
}
