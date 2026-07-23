/**
 * Недельные цели — client-only live-ops петля поверх «уровня дня».
 * Три цели на неделю выбираются детерминированно по номеру недели (без
 * сервера, без рассылок), как «модификатор дня» в daily.ts. Прогресс копится
 * весь текущий core-loop (обычные победы, идеальные уровни, серии
 * «Бесконечного двора») и сбрасывается с новой неделей.
 */
import { hashDate, weekKey } from './daily';

export type WeeklyQuestKind = 'win' | 'perfect' | 'endless';

/** Прогресс недельных целей (live-ops петля поверх daily). */
export interface WeeklyState {
  weekKey: string;
  win: number;
  perfect: number;
  /** Максимум серии «Бесконечного двора» за неделю (не сумма). */
  endlessBest: number;
  /** Ключи уже забранных наград на этой неделе. */
  claimed: string[];
}

export interface WeeklyQuestDef {
  key: string;
  kind: WeeklyQuestKind;
  goal: number;
  icon: string;
}

/** 'endless' — прогресс это максимум серии за неделю, остальные — сумма событий. */
const QUEST_POOL: WeeklyQuestDef[] = [
  { key: 'win5', kind: 'win', goal: 5, icon: '🚗' },
  { key: 'win10', kind: 'win', goal: 10, icon: '🚙' },
  { key: 'perfect3', kind: 'perfect', goal: 3, icon: '⭐' },
  { key: 'perfect6', kind: 'perfect', goal: 6, icon: '🌟' },
  { key: 'endless3', kind: 'endless', goal: 3, icon: '🌀' },
  { key: 'endless6', kind: 'endless', goal: 6, icon: '🐐' }
];

/** Награда за одну выполненную цель — подсказки в общей копилке (как ежедневный подарок). */
export const WEEKLY_QUEST_REWARD_HINTS = 2;

/**
 * Три разные цели, детерминированные по неделе. До открытия Endless выбираем
 * только достижимые кампанийные цели; после кампании добавляем одну Endless-цель.
 */
export function selectWeeklyQuests(currentWeekKey: string, endlessUnlocked = true): WeeklyQuestDef[] {
  const rng = mulberry32(hashDate(`${currentWeekKey}:weekly`));
  const byKind = new Map<WeeklyQuestKind, WeeklyQuestDef[]>();
  for (const q of QUEST_POOL) byKind.set(q.kind, [...(byKind.get(q.kind) ?? []), q]);
  if (!endlessUnlocked) {
    const available = QUEST_POOL.filter((quest) => quest.kind !== 'endless');
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    return available.slice(0, 3);
  }
  const kinds: WeeklyQuestKind[] = ['win', 'perfect', 'endless'];
  return kinds.map((kind) => {
    const options = byKind.get(kind)!;
    return options[Math.floor(rng() * options.length)];
  });
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Текущий ключ недели по дате устройства. */
export function currentWeekKey(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return weekKey(`${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`);
}

/** Прогресс цели за текущую неделю; 0, если состояние из прошлой недели. */
export function weeklyQuestProgress(state: WeeklyState | undefined, week: string, quest: WeeklyQuestDef): number {
  if (!state || state.weekKey !== week) return 0;
  const raw = quest.kind === 'win' ? state.win : quest.kind === 'perfect' ? state.perfect : state.endlessBest;
  return Math.min(quest.goal, raw);
}

export function isWeeklyQuestClaimed(state: WeeklyState | undefined, week: string, questKey: string): boolean {
  return !!state && state.weekKey === week && state.claimed.includes(questKey);
}

/** Применяет событие прогресса; сбрасывает счётчики, если началась новая неделя. */
export function applyWeeklyEvent(
  state: WeeklyState | undefined,
  week: string,
  kind: WeeklyQuestKind,
  amount: number
): WeeklyState {
  const base: WeeklyState =
    state && state.weekKey === week ? state : { weekKey: week, win: 0, perfect: 0, endlessBest: 0, claimed: [] };
  return {
    ...base,
    win: kind === 'win' ? base.win + amount : base.win,
    perfect: kind === 'perfect' ? base.perfect + amount : base.perfect,
    endlessBest: kind === 'endless' ? Math.max(base.endlessBest, amount) : base.endlessBest
  };
}

/** Отмечает цель как забранную; null, если уже забрана или неделя другая — вызывающий код сам решает, начислять ли награду. */
export function applyWeeklyClaim(state: WeeklyState | undefined, week: string, questKey: string): WeeklyState | null {
  if (!state || state.weekKey !== week || state.claimed.includes(questKey)) return null;
  return { ...state, claimed: [...state.claimed, questKey] };
}
