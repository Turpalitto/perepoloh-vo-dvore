/**
 * Недельный чемпионат Высшей лиги (Stage B).
 *
 * У всех игроков одну неделю — одно и то же испытание: детерминированный выбор
 * по ключу недели, без сервера и без случайности на клиенте. Результат — очки
 * в лидерборд `eliteweekly`; доска опциональна (см. platform/types.ts), без неё
 * чемпионат остаётся еженедельным испытанием с локальным рекордом.
 */
import type { EliteChallenge } from '../levels/elite-challenges';
import { ELITE_CHALLENGES } from '../levels/elite-challenges';

/** FNV-1a: стабильный 32-битный хеш строки. */
function fnv1a(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Испытание недели: одинаковое у всех игроков всю неделю, меняется в понедельник. */
export function pickWeeklyChallenge(weekKey: string): EliteChallenge {
  const index = fnv1a(weekKey) % ELITE_CHALLENGES.length;
  return ELITE_CHALLENGES[index];
}

/**
 * Очки зачётной попытки: медаль × 1000 минус ходы. Выше медаль всегда лучше;
 * при равной медали выигрывает решение в меньшее число ходов — иначе лидерборд
 * выравнивался бы по времени достижения счёта, а это шум.
 * Ходы клэмпятся, чтобы один «затяжной» результат не ушёл в минус.
 */
export function weeklyScore(medal: number, moves: number): number {
  if (!Number.isInteger(medal) || medal <= 0) return 0;
  const clamped = Number.isFinite(moves) ? Math.max(0, Math.min(999, Math.floor(moves))) : 0;
  return medal * 1000 - clamped;
}
