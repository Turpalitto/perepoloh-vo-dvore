/**
 * Дед — главный персонаж-комментатор. Чистая, data-driven логика без DOM:
 * набор реплик (текст — в ключах локализации) и детерминированный выбор с
 * учётом кулдауна, анти-повтора, приоритета сюжетных реплик и однократных фраз.
 * UI держит состояние (`GrandpaState`) и рисует пузырь/портрет.
 */

/** Настроение деда — влияет только на портрет/озвучку, не на логику. */
export type GrandpaMood = 'neutral' | 'happy' | 'surprised' | 'grumpy' | 'thinking' | 'celebrating' | 'pointing';

/** События, на которые дед может отреагировать. */
export type GrandpaEvent =
  | 'level-start'
  | 'first-move'
  | 'move-far'
  | 'collision'
  | 'blocked'
  | 'tractor'
  | 'star'
  | 'gate'
  | 'hint'
  | 'win'
  | 'win-perfect'
  | 'many-moves'
  | 'restart-repeat'
  | 'chapter-start'
  | 'boss-intro'
  | 'boss-phase'
  | 'boss-win'
  | 'campaign-done'
  | 'return';

export interface GrandpaLine {
  id: string;
  event: GrandpaEvent;
  mood: GrandpaMood;
  /** Ключ локализации текста реплики. По умолчанию `grandpa.<id>`. */
  textKey?: string;
  /** Относительный вес при случайном выборе (по умолчанию 1). */
  weight?: number;
  /** Личный кулдаун именно этой реплики, мс. */
  cooldownMs?: number;
  minLevel?: number;
  maxLevel?: number;
  /** Показать один раз за всё время (запоминается в сейве). */
  once?: boolean;
  /**
   * Приоритет: сюжетные реплики (boss-*, chapter, campaign) обходят глобальный
   * кулдаун «дед не болтает каждый ход». Обычные комментарии — priority 0.
   */
  priority?: number;
}

/** Глобальный кулдаун обычных комментариев: дед молчит между ходами. */
export const GRANDPA_GLOBAL_COOLDOWN_MS = 6000;

/** Изменяемое состояние диалога (живёт в UI, сериализуемая часть — в сейве). */
export interface GrandpaState {
  /** id последней показанной реплики — не повторяем подряд. */
  lastId?: string;
  /** Время последней обычной реплики (для глобального кулдауна). */
  lastAt: number;
  /** Персональные времена показа по id реплики. */
  shownAt: Record<string, number>;
  /** id уже показанных однократных/важных реплик (персистится). */
  seen: Set<string>;
}

export function createGrandpaState(seen: Iterable<string> = []): GrandpaState {
  return { lastAt: -Infinity, shownAt: {}, seen: new Set(seen) };
}

/**
 * Реплики деда. Текст хранится в i18n под `grandpa.<id>`. Набор осознанно
 * небольшой на событие (2–3 варианта), чтобы не раздувать локализацию, но
 * достаточный, чтобы фразы не повторялись подряд.
 */
export const GRANDPA_LINES: GrandpaLine[] = [
  // Встреча/старт уровня
  { id: 'start1', event: 'level-start', mood: 'neutral', weight: 2 },
  { id: 'start2', event: 'level-start', mood: 'thinking' },
  { id: 'start3', event: 'level-start', mood: 'pointing' },
  { id: 'first', event: 'first-move', mood: 'neutral', minLevel: 1, maxLevel: 1, once: true },
  // Упор в препятствие
  { id: 'bump1', event: 'collision', mood: 'grumpy', cooldownMs: 9000 },
  { id: 'bump2', event: 'collision', mood: 'grumpy', cooldownMs: 9000 },
  { id: 'bump3', event: 'collision', mood: 'surprised', cooldownMs: 9000 },
  { id: 'blocked1', event: 'blocked', mood: 'grumpy', cooldownMs: 12000 },
  // Трактор
  { id: 'tractor1', event: 'tractor', mood: 'happy', cooldownMs: 15000 },
  { id: 'tractor2', event: 'tractor', mood: 'surprised', cooldownMs: 15000 },
  // Звезда
  { id: 'star1', event: 'star', mood: 'celebrating' },
  { id: 'star2', event: 'star', mood: 'happy' },
  // Ворота
  { id: 'gate1', event: 'gate', mood: 'happy', cooldownMs: 10000 },
  { id: 'gate2', event: 'gate', mood: 'pointing', cooldownMs: 10000 },
  // Подсказка
  { id: 'hint1', event: 'hint', mood: 'thinking', cooldownMs: 8000 },
  // Победа
  { id: 'win1', event: 'win', mood: 'happy', weight: 2 },
  { id: 'win2', event: 'win', mood: 'celebrating' },
  { id: 'win3', event: 'win', mood: 'happy' },
  { id: 'perfect1', event: 'win-perfect', mood: 'celebrating', priority: 1 },
  { id: 'perfect2', event: 'win-perfect', mood: 'happy', priority: 1 },
  // Много ходов
  { id: 'many1', event: 'many-moves', mood: 'thinking' },
  { id: 'many2', event: 'many-moves', mood: 'grumpy' },
  // Повторный рестарт
  { id: 'restart1', event: 'restart-repeat', mood: 'thinking', cooldownMs: 20000 },
  { id: 'restart2', event: 'restart-repeat', mood: 'grumpy', cooldownMs: 20000 },
  // Начало главы
  { id: 'chapter1', event: 'chapter-start', mood: 'pointing', priority: 2 },
  // Возвращение
  { id: 'return1', event: 'return', mood: 'happy', priority: 1, once: false },
  // Боссы (сюжетные — высокий приоритет, обходят кулдаун)
  { id: 'bossIntro', event: 'boss-intro', mood: 'surprised', priority: 3 },
  { id: 'bossPhase', event: 'boss-phase', mood: 'pointing', priority: 3 },
  { id: 'bossWin', event: 'boss-win', mood: 'celebrating', priority: 3 },
  { id: 'campaign', event: 'campaign-done', mood: 'celebrating', priority: 4, once: true }
];

export interface PickContext {
  now: number;
  level: number;
  /** Инъекция ГСЧ для детерминизма в тестах (0..1). */
  rng?: () => number;
}

/**
 * Выбирает реплику для события (или null, если сейчас говорить не время).
 * НЕ мутирует state — возвращает выбранную реплику; вызывающий вызывает
 * `commitLine`, если реально показал её.
 */
export function pickLine(
  state: GrandpaState,
  event: GrandpaEvent,
  ctx: PickContext,
  lines: GrandpaLine[] = GRANDPA_LINES
): GrandpaLine | null {
  return pickLineVerbose(state, event, ctx, lines).line;
}

/** Почему конкретная реплика не подходит сейчас (null — подходит). Чистая функция. */
function lineSkipReason(l: GrandpaLine, state: GrandpaState, event: GrandpaEvent, ctx: PickContext): string | null {
  if (l.event !== event) return 'wrong-event';
  if (l.minLevel !== undefined && ctx.level < l.minLevel) return `minLevel ${l.minLevel} > ${ctx.level}`;
  if (l.maxLevel !== undefined && ctx.level > l.maxLevel) return `maxLevel ${l.maxLevel} < ${ctx.level}`;
  if (l.once && state.seen.has(l.id)) return 'already seen (once)';
  if (l.id === state.lastId) return 'same as last line (anti-repeat)';
  const shownAt = state.shownAt[l.id];
  if (l.cooldownMs !== undefined && shownAt !== undefined && ctx.now - shownAt < l.cooldownMs) {
    return `cooldown ${l.cooldownMs - (ctx.now - shownAt)}ms left`;
  }
  return null;
}

export interface PickLineDebugInfo {
  line: GrandpaLine | null;
  /** Почему каждая НЕподошедшая реплика этого события была отсеяна. */
  skipped: Array<{ id: string; reason: string }>;
  /** Заполнено, если весь пул событий был заблокирован глобальным кулдауном. */
  blockedByGlobalCooldown?: number;
}

/**
 * Как `pickLine`, но с прозрачным объяснением решения — для `?grandpaDebug=1`.
 * Логику не дублирует: `pickLine` — тонкая обёртка над этой функцией.
 */
export function pickLineVerbose(
  state: GrandpaState,
  event: GrandpaEvent,
  ctx: PickContext,
  lines: GrandpaLine[] = GRANDPA_LINES
): PickLineDebugInfo {
  const rng = ctx.rng ?? Math.random;
  const skipped: Array<{ id: string; reason: string }> = [];
  const candidates: GrandpaLine[] = [];
  for (const l of lines) {
    if (l.event !== event) continue; // не засоряем debug лог репликами других событий
    const reason = lineSkipReason(l, state, event, ctx);
    if (reason) skipped.push({ id: l.id, reason });
    else candidates.push(l);
  }
  if (candidates.length === 0) return { line: null, skipped };

  const priority = Math.max(...candidates.map((l) => l.priority ?? 0));
  // Обычные (priority 0) реплики подчиняются глобальному кулдауну — дед не
  // комментирует каждый ход. Сюжетные (priority>0) его обходят.
  if (priority === 0 && ctx.now - state.lastAt < GRANDPA_GLOBAL_COOLDOWN_MS) {
    return { line: null, skipped, blockedByGlobalCooldown: GRANDPA_GLOBAL_COOLDOWN_MS - (ctx.now - state.lastAt) };
  }

  const pool = candidates.filter((l) => (l.priority ?? 0) === priority);
  const total = pool.reduce((s, l) => s + (l.weight ?? 1), 0);
  let r = rng() * total;
  for (const l of pool) {
    r -= l.weight ?? 1;
    if (r < 0) return { line: l, skipped };
  }
  return { line: pool[pool.length - 1], skipped };
}

/** Фиксирует показ реплики в состоянии (мутирует переданное state). */
export function commitLine(state: GrandpaState, line: GrandpaLine, now: number): void {
  state.lastId = line.id;
  state.lastAt = now;
  state.shownAt[line.id] = now;
  if (line.once || (line.priority ?? 0) >= 3) state.seen.add(line.id);
}

export function textKeyOf(line: GrandpaLine): string {
  return line.textKey ?? `grandpa.${line.id}`;
}
