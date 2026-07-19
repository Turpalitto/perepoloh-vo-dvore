/**
 * «Уровень дня»: детерминированная генерация из seed = дата устройства.
 * Один и тот же уровень у всех игроков в один день. Серия (streak) растёт
 * при прохождении в подряд идущие дни.
 */
import type { LevelDef } from '../core/types';
import { GEN_6X6, findLevel, mulberry32 } from '../core/levelgen';

/** Локальная дата YYYY-MM-DD (день игрока, не UTC). */
export function todayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function yesterdayKey(d: Date = new Date()): string {
  const y = new Date(d);
  y.setDate(y.getDate() - 1);
  return todayKey(y);
}

function hashDate(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const dailyCache = new Map<string, LevelDef>();

/**
 * Генерирует уровень дня: оптимум 5–9 ходов, звезда достижима.
 * Детерминирован по дате; лимиты подобраны так, чтобы телефон
 * укладывался в доли секунды.
 */
export function generateDaily(key: string = todayKey()): LevelDef {
  const cached = dailyCache.get(key);
  if (cached) return JSON.parse(JSON.stringify(cached)) as LevelDef;
  const rng = mulberry32(hashDate(key));
  const found = findLevel(rng, GEN_6X6, 5, 9, 15_000, 250);
  if (!found) {
    // теоретически недостижимо (fallback вернёт хоть что-то); страховка
    throw new Error('не удалось сгенерировать уровень дня');
  }
  const level = found.level;
  level.id = 0;
  level.name = key;
  level.par = found.optimal;
  level.par2 = Math.max(found.optimal + 2, found.withStar);
  const kinds = new Set(level.pieces.map((p) => p.kind));
  level.mechanics = (['truck', 'tractor', 'crate'] as const).filter((k) => kinds.has(k));
  if (level.star) level.mechanics.push('star');
  dailyCache.set(key, JSON.parse(JSON.stringify(level)) as LevelDef);
  return level;
}

export interface DailyState {
  /** Дата последнего пройденного уровня дня. */
  last: string;
  streak: number;
}

/** Новый streak после прохождения уровня дня за dateKey. */
export function advanceStreak(prev: DailyState | undefined, dateKey: string): DailyState {
  if (prev?.last === dateKey) return prev; // сегодня уже пройден
  const streak = prev?.last === yesterdayKey(new Date(dateKey + 'T12:00:00')) ? prev.streak + 1 : 1;
  return { last: dateKey, streak };
}

/** Актуальная серия для показа в меню (0, если цепочка оборвана). */
export function currentStreak(state: DailyState | undefined, now: Date = new Date()): number {
  if (!state) return 0;
  if (state.last === todayKey(now) || state.last === yesterdayKey(now)) return state.streak;
  return 0;
}

export function isDoneToday(state: DailyState | undefined, now: Date = new Date()): boolean {
  return state?.last === todayKey(now);
}
