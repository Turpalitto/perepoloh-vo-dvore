/**
 * «Уровень дня»: детерминированная генерация из seed = дата устройства.
 * Один и тот же уровень у всех игроков в один день. Серия (streak) растёт
 * при прохождении в подряд идущие дни.
 */
import type { LevelDef } from '../core/types';
import { GEN_6X6, findLevel, mulberry32 } from '../core/levelgen';
import { solve } from '../core/solver';

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

export function hashDate(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const dailyCache = new Map<string, DailyLevel>();

/** Модификатор дня — меняет правило прохождения, не саму раскладку. */
export type DailyModifier = 'none' | 'noUndo' | 'noHints' | 'tightCrates';

export interface DailyLevel extends LevelDef {
  modifier: DailyModifier;
}

const MODIFIER_POOL: DailyModifier[] = ['none', 'none', 'none', 'noUndo', 'noHints', 'tightCrates'];

/**
 * Чисто по дате, без зависимости от расклада — тот же день даёт тот же
 * модификатор всем. Дёшево вычислить заранее (например, для значка в меню),
 * не дожидаясь генерации самого уровня.
 */
export function dailyModifier(key: string): DailyModifier {
  const h = hashDate(`${key}:modifier`);
  return MODIFIER_POOL[h % MODIFIER_POOL.length];
}

/** Уменьшает лимит ходов ящиков на 1 (не ниже 1) и честно пересчитывает par. */
function applyTightCrates(level: LevelDef): boolean {
  const crates = level.pieces.filter((p) => p.kind === 'crate');
  if (crates.length === 0) return false;
  for (const crate of crates) crate.maxMoves = Math.max(1, (crate.maxMoves ?? 1) - 1);
  const plain = solve(level);
  if (!plain.solvable || plain.exhausted) return false;
  const withStar = level.star ? solve(level, { requireStar: true }) : null;
  if (level.star && (!withStar || !withStar.solvable || withStar.exhausted)) return false;
  level.par = plain.optimal;
  level.par2 = Math.max(plain.optimal + 2, withStar?.optimal ?? plain.optimal);
  return true;
}

/**
 * Генерирует уровень дня: оптимум 5–9 ходов, звезда достижима.
 * Детерминирован по дате; лимиты подобраны так, чтобы телефон
 * укладывался в доли секунды. Модификатор дня — тоже по дате; если он
 * технически неприменим (например, «тесные ящики» без единого ящика или
 * ломает решаемость), честно откатывается на «без модификатора».
 */
export function generateDaily(key: string = todayKey()): DailyLevel {
  const cached = dailyCache.get(key);
  if (cached) return JSON.parse(JSON.stringify(cached)) as DailyLevel;
  const rng = mulberry32(hashDate(key));
  const found = findLevel(rng, GEN_6X6, 5, 9, 15_000, 250);
  if (!found) {
    // теоретически недостижимо (fallback вернёт хоть что-то); страховка
    throw new Error('не удалось сгенерировать уровень дня');
  }
  const level = found.level as DailyLevel;
  level.id = 0;
  level.name = key;
  level.par = found.optimal;
  level.par2 = Math.max(found.optimal + 2, found.withStar);
  let modifier = dailyModifier(key);
  if (modifier === 'tightCrates' && !applyTightCrates(level)) modifier = 'none';
  level.modifier = modifier;
  const kinds = new Set(level.pieces.map((p) => p.kind));
  level.mechanics = (['truck', 'tractor', 'crate'] as const).filter((k) => kinds.has(k));
  if (level.star) level.mechanics.push('star');
  dailyCache.set(key, JSON.parse(JSON.stringify(level)) as DailyLevel);
  return level;
}

export interface DailyState {
  /** Дата последнего пройденного уровня дня. */
  last: string;
  streak: number;
  /** Понедельник текущей недельной серии. */
  weekKey?: string;
  /** Уникальные дни, закрытые на этой неделе. */
  weekDays?: string[];
  /** Число полученных недельных кубков (5 ежедневных уровней за неделю). */
  trophies?: number;
}

/** Ключ недели — дата понедельника в локальном календаре игрока. */
export function weekKey(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  const dayFromMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayFromMonday);
  return todayKey(d);
}

/** Новый streak после прохождения уровня дня за dateKey. */
export function advanceStreak(prev: DailyState | undefined, dateKey: string): DailyState {
  if (prev?.last === dateKey) return prev; // сегодня уже пройден
  const streak = prev?.last === yesterdayKey(new Date(dateKey + 'T12:00:00')) ? prev.streak + 1 : 1;
  const currentWeek = weekKey(dateKey);
  const previousDays = prev?.weekKey === currentWeek ? (prev.weekDays ?? []) : [];
  const weekDays = [...new Set([...previousDays, dateKey])].sort();
  const earnedTrophy = previousDays.length < 5 && weekDays.length >= 5;
  return {
    last: dateKey,
    streak,
    weekKey: currentWeek,
    weekDays,
    trophies: (prev?.trophies ?? 0) + (earnedTrophy ? 1 : 0)
  };
}

export function weeklyProgress(state: DailyState | undefined, now: Date = new Date()): number {
  if (!state || state.weekKey !== weekKey(todayKey(now))) return 0;
  return Math.min(5, new Set(state.weekDays ?? []).size);
}

export function weeklyTrophies(state: DailyState | undefined): number {
  return Math.max(0, state?.trophies ?? 0);
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
