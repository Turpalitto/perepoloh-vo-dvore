import { describe, expect, it, vi } from 'vitest';
import type { LeaderboardName } from '../src/platform/types';
import { createLeaderboardCache } from '../src/game/leaderboard-cache';
import type { LeaderboardSnapshot } from '../src/platform/types';

const snap = (score: number): LeaderboardSnapshot => ({ entries: [{ rank: 1, name: 'X', score }], me: null });

describe('leaderboard-cache', () => {
  it('один запрос на таблицу yardstars за одно получение', async () => {
    const fetchSnapshot = vi.fn(async () => snap(1));
    const cache = createLeaderboardCache(fetchSnapshot);
    await cache.get('yardstars');
    await cache.get('yardstars');
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it('dailystreak кэшируется отдельно от yardstars', async () => {
    const fetchSnapshot = vi.fn(async (board: LeaderboardName) => snap(board === 'dailystreak' ? 2 : 1));
    const cache = createLeaderboardCache(fetchSnapshot);
    await cache.get('yardstars');
    await cache.get('dailystreak');
    expect(fetchSnapshot).toHaveBeenCalledTimes(2);
    expect(fetchSnapshot).toHaveBeenCalledWith('yardstars');
    expect(fetchSnapshot).toHaveBeenCalledWith('dailystreak');
  });

  it('одновременные вызовы используют один in-flight promise', async () => {
    let resolveFetch: (v: LeaderboardSnapshot) => void = () => {};
    const fetchSnapshot = vi.fn(() => new Promise<LeaderboardSnapshot>((res) => (resolveFetch = res)));
    const cache = createLeaderboardCache(fetchSnapshot);
    const p1 = cache.get('yardstars');
    const p2 = cache.get('yardstars');
    resolveFetch(snap(5));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it('после TTL выполняется новый запрос', async () => {
    let time = 0;
    const fetchSnapshot = vi.fn(async () => snap(1));
    const cache = createLeaderboardCache(fetchSnapshot, 1000, () => time);
    await cache.get('yardstars');
    time = 500;
    await cache.get('yardstars');
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    time = 1500;
    await cache.get('yardstars');
    expect(fetchSnapshot).toHaveBeenCalledTimes(2);
  });

  it('после submit (invalidate) следующий get снова запрашивает', async () => {
    const fetchSnapshot = vi.fn(async () => snap(1));
    const cache = createLeaderboardCache(fetchSnapshot);
    await cache.get('yardstars');
    cache.invalidate('yardstars');
    await cache.get('yardstars');
    expect(fetchSnapshot).toHaveBeenCalledTimes(2);
  });

  it('ошибка не остаётся закэшированной навсегда — следующий get пробует снова', async () => {
    const fetchSnapshot = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(snap(1));
    const cache = createLeaderboardCache(fetchSnapshot);
    await expect(cache.get('yardstars')).rejects.toThrow('network');
    await expect(cache.get('yardstars')).resolves.toEqual(snap(1));
    expect(fetchSnapshot).toHaveBeenCalledTimes(2);
  });

  it('текущий игрок находится из того же ответа (snapshot.me)', async () => {
    const withMe: LeaderboardSnapshot = { entries: [snap(9).entries[0]], me: { rank: 3, name: 'Я', score: 9, isMe: true } };
    const fetchSnapshot = vi.fn(async () => withMe);
    const cache = createLeaderboardCache(fetchSnapshot);
    const result = await cache.get('yardstars');
    expect(result.me).toEqual({ rank: 3, name: 'Я', score: 9, isMe: true });
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });
});
