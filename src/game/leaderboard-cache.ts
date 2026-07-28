import type { LeaderboardSnapshot } from '../platform/types';

import type { LeaderboardName } from '../platform/types';

type Board = LeaderboardName;

interface CacheEntry {
  snapshot: LeaderboardSnapshot;
  at: number;
}

/**
 * Дедупликация запросов к лидерборду поверх Platform.getLeaderboardSnapshot:
 * один сетевой запрос на таблицу за раз (in-flight promise переиспользуется),
 * результат живёт TTL мс, submit(board) инвалидирует кэш этой таблицы.
 * Ошибка не кэшируется — следующий get() снова попробует запрос.
 */
export function createLeaderboardCache(
  fetchSnapshot: (board: Board) => Promise<LeaderboardSnapshot>,
  ttlMs = 45_000,
  now: () => number = Date.now
) {
  const cache = new Map<Board, CacheEntry>();
  const inFlight = new Map<Board, Promise<LeaderboardSnapshot>>();

  async function get(board: Board): Promise<LeaderboardSnapshot> {
    const cached = cache.get(board);
    if (cached && now() - cached.at < ttlMs) return cached.snapshot;
    const pending = inFlight.get(board);
    if (pending) return pending;
    const promise = fetchSnapshot(board)
      .then((snapshot) => {
        cache.set(board, { snapshot, at: now() });
        inFlight.delete(board);
        return snapshot;
      })
      .catch((e) => {
        inFlight.delete(board);
        throw e;
      });
    inFlight.set(board, promise);
    return promise;
  }

  function invalidate(board: Board): void {
    cache.delete(board);
    inFlight.delete(board);
  }

  return { get, invalidate };
}

export type LeaderboardCache = ReturnType<typeof createLeaderboardCache>;
