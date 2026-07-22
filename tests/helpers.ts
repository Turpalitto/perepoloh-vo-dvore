import type { Dir, LevelDef, PieceDef, PieceKind } from '../src/core/types';

/**
 * Отдаёт event loop между итерациями тяжёлых синхронных циклов (много solve()
 * подряд в одном it()). Без этого воркер непрерывно занят десятки секунд, и
 * репортёр не может достучаться RPC-пингом (onTaskUpdate) — ловится как
 * unhandled error и валит прогон (см. vitest.solver.config.ts).
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export function piece(
  id: string,
  kind: PieceKind,
  x: number,
  y: number,
  dir: Dir,
  extra: Partial<PieceDef> = {}
): PieceDef {
  const len = kind === 'crate' ? 1 : kind === 'truck' || kind === 'tractor' ? 3 : 2;
  return { id, kind, x, y, len, dir, ...extra };
}

export function lvl(partial: Partial<LevelDef>): LevelDef {
  return {
    id: 99,
    name: 'тест',
    width: 6,
    height: 6,
    exit: { side: 'right', index: 2 },
    pieces: [],
    par: 1,
    par2: 99,
    difficulty: 'easy',
    mechanics: [],
    ...partial
  };
}
