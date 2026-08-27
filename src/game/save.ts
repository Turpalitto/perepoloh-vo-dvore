import { campaignPositionOf } from './campaign';
import type { DailyState } from './daily';
import type { Platform } from '../platform/types';
import { applyWeeklyClaim, applyWeeklyEvent, type WeeklyQuestKind, type WeeklyState } from './weekly';

export interface SaveData {
  v: 1;
  /** Лучший результат по уровням: id -> 0..3 звезды. */
  stars: Record<string, number>;
  /** Лучшие ходы по уровням: id -> минимальное число ходов, за которое пройден. */
  bestMoves?: Record<string, number>;
  sound: boolean;
  music: boolean;
  /** Язык интерфейса; по умолчанию русский. */
  lang: 'ru' | 'en' | 'tr';
  /** Игрок вручную менял язык; иначе используем язык платформы. */
  langChosen?: boolean;
  lastLevel: number;
  /** Выбранный скин целевой машины. */
  targetSkin: number;
  /** Прогресс «уровня дня». */
  daily?: DailyState;
  /** Накопленные подсказки из ежедневных подарков. */
  hintTokens?: number;
  /** Дата последнего полученного подарка в формате YYYY-MM-DD. */
  lastGift?: string;
  /** Диалог оценки уже предлагали (не навязываемся повторно). */
  reviewAsked?: boolean;
  /** Вибрация отклика (по умолчанию включена, независимо от звука). */
  vibration?: boolean;
  /** Крупные контрастные значки на фигурах — для дальтоников и слабого зрения. */
  highContrast?: boolean;
  /** Игрок разрешил локальные напоминания вернуться в игру. */
  notifyOptIn?: boolean;
  /** Лучшая серия в «Бесконечном дворе» (доступен после кампании). */
  endlessBest?: number;
  /** История последних серий «Бесконечного двора» (≤10, новые в конце). */
  endlessHistory?: number[];
  /**
   * Незавершённая серия «Бесконечного двора»: точка для rewarded-восстановления
   * (Stage C). Пишется после каждой победы в заезде; «Закончить забег» снимает.
   * Отсутствие поля = активного заезда нет. При merge берётся максимум —
   * лучший из локального и облачного незавершённых заездов.
   */
  endlessResume?: number;
  /** Обучающая подсказка-жест на уровне 1 уже показана. */
  tutorialSeen?: boolean;
  /** Прогресс недельных целей. */
  weekly?: WeeklyState;
  /** Основная кампания (уровень 100) пройдена — открыта Высшая лига. */
  campaignDone?: boolean;
  /** Дата первого прохождения кампании (YYYY-MM-DD) — для порядка при merge. */
  campaignDoneAt?: string;
  /** Финальная сцена кампании показана (однократно). */
  endingSeen?: boolean;
  /**
   * Вступление в Высшую лигу показано (однократно).
   *
   * Раньше признаком «первый заход» служило отсутствие медалей. Это перестало
   * работать, когда медали начали засчитываться по результату кампании: игрок
   * заходит в лигу уже с серебром и объяснения правил не видит вообще.
   */
  eliteIntroSeen?: boolean;
  /**
   * Лучшая медаль по каждому мастер-испытанию Высшей лиги: id -> 1|2|3
   * (бронза/серебро/золото). Очки лиги ДЕРИВИРУЮТСЯ из этих медалей — отдельного
   * счётчика очков нет, поэтому награда не может быть выдана повторно: merge
   * берёт максимум медали по каждому испытанию, перезагрузка ничего не удваивает.
   */
  eliteMedals?: Record<string, number>;
  /** Показанные однократные/сюжетные реплики деда (чтобы не повторять). */
  grandpaSeen?: string[];
  /** «Живой двор» (реакции деда) выключен игроком; по умолчанию включён. */
  liveYard?: boolean;
  /** Слоты пройденных сюжетных боссов (прогресс пишется только после победы). */
  bossDone?: number[];
  /**
   * Уже выданные достижения. Раньше набор вычислялся заново из прогресса, и
   * это ломалось при росте кампании: цели «пройти всё» и «собрать все звёзды»
   * деривируются из данных, поэтому игрок со 100 из 100 уровней после
   * расширения до 108 увидел бы достижение снова закрытым. Выданное не
   * отнимается — список только пополняется.
   */
  achievements?: string[];
  /**
   * Результат недельного чемпионата (Stage B): лучшая зачётная попытка недели.
   * Смена недели вытесняет прошлый результат; при merge одной недели берётся
   * максимум очков, разных — более свежая неделя (та же политика, что у weekly).
   */
  eliteWeekly?: { week: string; score: number; medal: number };
}

export function defaultSave(): SaveData {
  return { v: SAVE_VERSION, stars: {}, sound: true, music: true, lang: 'ru', lastLevel: 1, targetSkin: 0 };
}

/**
 * Текущая версия формата сейва. При несовместимой правке формата:
 * 1. Увеличить SAVE_VERSION на единицу.
 * 2. Добавить шаг в SAVE_MIGRATIONS под номером прежней версии.
 * 3. Обновить тесты миграций (`tests/save-migration.test.ts`).
 * Правило AGENTS.md «не менять формат без миграции» обеспечивается этим
 * механизмом, а не только дисциплиной.
 */
export const SAVE_VERSION = 1;

/**
 * Шаги миграции: ключ — версия, ИЗ которой переходим. Шаг получает сырой
 * объект прежней версии и обязан вернуть объект с новой `v`. Применяются
 * цепочкой до достижения SAVE_VERSION; отсутствие шага оставляет данные как
 * есть — их отбросит проверка версии ниже (сейв «не узнанной» будущей версии
 * мигрировать нельзя).
 */
export const SAVE_MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

const MAX_MIGRATION_STEPS = 32;

/**
 * Поднимает сырой сейв до `targetVersion` цепочкой шагов из SAVE_MIGRATIONS.
 * Экспортирована для тестов: механизм репетируется на «будущей» целевой
 * версии до реального bump формата.
 */
export function migrateSave(raw: unknown, targetVersion: number): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  let data = raw as Record<string, unknown>;
  for (let guard = 0; guard < MAX_MIGRATION_STEPS; guard++) {
    const v = data.v;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v >= targetVersion) break;
    const step = SAVE_MIGRATIONS[v];
    if (!step) break;
    const next = step(data);
    if (typeof next !== 'object' || next === null) break;
    data = next as Record<string, unknown>;
  }
  return data;
}

export function sanitizeSave(raw: unknown): SaveData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = migrateSave(raw, SAVE_VERSION) as Partial<SaveData>;
  if (r.v !== SAVE_VERSION || typeof r.stars !== 'object' || r.stars === null) return null;
  const stars: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.stars)) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0 && n <= 3) stars[k] = n;
  }
  return {
    v: SAVE_VERSION,
    stars,
    sound: typeof r.sound === 'boolean' ? r.sound : true,
    music: typeof r.music === 'boolean' ? r.music : true,
    lang: r.lang === 'en' || r.lang === 'tr' ? r.lang : 'ru',
    langChosen: r.langChosen === true ? true : undefined,
    lastLevel: Number.isInteger(r.lastLevel) && (r.lastLevel as number) >= 1 ? (r.lastLevel as number) : 1,
    targetSkin: Number.isInteger(r.targetSkin) && (r.targetSkin as number) >= 0 ? (r.targetSkin as number) : 0,
    daily:
      r.daily && typeof r.daily.last === 'string' && Number.isInteger(r.daily.streak) && r.daily.streak >= 1
        ? {
            last: r.daily.last,
            streak: r.daily.streak,
            weekKey: typeof r.daily.weekKey === 'string' ? r.daily.weekKey : undefined,
            weekDays: Array.isArray(r.daily.weekDays)
              ? [...new Set(r.daily.weekDays.filter((d): d is string => typeof d === 'string'))].slice(0, 7)
              : undefined,
            trophies:
              Number.isInteger(r.daily.trophies) && (r.daily.trophies as number) >= 0
                ? (r.daily.trophies as number)
                : undefined
          }
        : undefined,
    hintTokens:
      Number.isInteger(r.hintTokens) && (r.hintTokens as number) >= 0
        ? Math.min(99, r.hintTokens as number)
        : undefined,
    lastGift: typeof r.lastGift === 'string' ? r.lastGift : undefined,
    reviewAsked: r.reviewAsked === true ? true : undefined,
    vibration: r.vibration === false ? false : undefined,
    highContrast: r.highContrast === true ? true : undefined,
    notifyOptIn: r.notifyOptIn === true ? true : undefined,
    endlessBest:
      Number.isInteger(r.endlessBest) && (r.endlessBest as number) >= 0 ? (r.endlessBest as number) : undefined,
    endlessHistory: Array.isArray(r.endlessHistory)
      ? (() => {
          const list = r.endlessHistory
            .filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 9999)
            .slice(-10);
          return list.length ? list : undefined;
        })()
      : undefined,
    endlessResume:
      Number.isInteger(r.endlessResume) && (r.endlessResume as number) >= 0
        ? Math.min(9999, r.endlessResume as number)
        : undefined,
    tutorialSeen: r.tutorialSeen === true ? true : undefined,
    weekly:
      r.weekly &&
      typeof r.weekly.weekKey === 'string' &&
      Number.isInteger(r.weekly.win) &&
      Number.isInteger(r.weekly.perfect) &&
      Number.isInteger(r.weekly.endlessBest)
        ? {
            weekKey: r.weekly.weekKey,
            win: Math.max(0, r.weekly.win),
            perfect: Math.max(0, r.weekly.perfect),
            endlessBest: Math.max(0, r.weekly.endlessBest),
            claimed: Array.isArray(r.weekly.claimed)
              ? [...new Set(r.weekly.claimed.filter((k): k is string => typeof k === 'string'))]
              : []
          }
        : undefined,
    campaignDone: r.campaignDone === true ? true : undefined,
    campaignDoneAt: typeof r.campaignDoneAt === 'string' ? r.campaignDoneAt : undefined,
    endingSeen: r.endingSeen === true ? true : undefined,
    eliteIntroSeen: r.eliteIntroSeen === true ? true : undefined,
    eliteMedals: sanitizeMedals(r.eliteMedals),
    grandpaSeen: Array.isArray(r.grandpaSeen)
      ? (() => {
          const list = [...new Set(r.grandpaSeen.filter((k): k is string => typeof k === 'string'))].slice(0, 200);
          return list.length ? list : undefined;
        })()
      : undefined,
    liveYard: r.liveYard === false ? false : undefined,
    achievements: Array.isArray(r.achievements)
      ? (() => {
          const list = [...new Set(r.achievements.filter((k): k is string => typeof k === 'string'))].slice(0, 100);
          return list.length ? list : undefined;
        })()
      : undefined,
    bossDone: Array.isArray(r.bossDone)
      ? (() => {
          const list = [...new Set(r.bossDone.filter((n): n is number => Number.isInteger(n) && n > 0))];
          return list.length ? list : undefined;
        })()
      : undefined,
    eliteWeekly: sanitizeEliteWeekly(r.eliteWeekly),
    bestMoves: sanitizeBestMoves(r.bestMoves)
  };
}

/** Личные рекорды ходов: только целые ≥1 по строковым id. */
function sanitizeBestMoves(raw: unknown): Record<string, number> | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 1 && n <= 999) out[k] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Медали Высшей лиги: только целые 1..3 по строковым id испытаний. */
function sanitizeMedals(raw: unknown): Record<string, number> | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 1 && n <= 3) out[k] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Какой из двух `lastLevel` «дальше» по кампании. Раньше брался Math.max по id,
 * и это молча сломалось, когда уровни начали вставлять в середину: id 105 стоит
 * на 42-й позиции, то есть РАНЬШЕ уровня 50. Считаем по позиции; уровень,
 * которого уже нет в данных, проигрывает известному (а из двух неизвестных
 * берём больший id — прежнее поведение).
 */
function laterLevel(a: number, b: number): number {
  const posA = campaignPositionOf(a);
  const posB = campaignPositionOf(b);
  if (posA === 0 && posB === 0) return Math.max(a, b);
  if (posA === 0) return b;
  if (posB === 0) return a;
  return posA >= posB ? a : b;
}

/**
 * Слияние локального и облачного сейва: максимум звёзд по каждому уровню.
 * Прогресс (звёзды, streak, кубки, endless, подсказки) объединяется без потерь
 * через max/union. Настройки (звук, музыка, язык, скин) НЕ порядко-независимы:
 * берутся из `b`. Вызов из loadData — mergeSave(local, cloud) ⇒ облако авторитетно
 * для настроек, чтобы выбор с любого устройства был единым; локальный прогресс при
 * этом не теряется. Осознанное решение, а не баг.
 */
export function mergeSave(a: SaveData, b: SaveData): SaveData {
  const stars: Record<string, number> = { ...a.stars };
  for (const [k, v] of Object.entries(b.stars)) stars[k] = Math.max(stars[k] ?? 0, v);
  const recentDaily = !a.daily ? b.daily : !b.daily ? a.daily : a.daily.last > b.daily.last ? a.daily : b.daily;
  const daily = recentDaily
    ? {
        ...recentDaily,
        trophies: Math.max(a.daily?.trophies ?? 0, b.daily?.trophies ?? 0),
        weekDays:
          a.daily?.weekKey && a.daily.weekKey === b.daily?.weekKey
            ? [...new Set([...(a.daily.weekDays ?? []), ...(b.daily.weekDays ?? [])])].sort()
            : recentDaily.weekDays
      }
    : undefined;
  return {
    v: SAVE_VERSION,
    stars,
    sound: b.sound,
    music: b.music,
    lang: b.lang,
    langChosen: a.langChosen || b.langChosen || undefined,
    lastLevel: laterLevel(a.lastLevel, b.lastLevel),
    targetSkin: b.targetSkin,
    daily,
    hintTokens: Math.max(a.hintTokens ?? 0, b.hintTokens ?? 0) || undefined,
    lastGift: !a.lastGift ? b.lastGift : !b.lastGift ? a.lastGift : a.lastGift > b.lastGift ? a.lastGift : b.lastGift,
    reviewAsked: a.reviewAsked || b.reviewAsked || undefined,
    vibration: a.vibration === false || b.vibration === false ? false : undefined,
    highContrast: a.highContrast || b.highContrast || undefined,
    notifyOptIn: a.notifyOptIn || b.notifyOptIn || undefined,
    endlessBest: Math.max(a.endlessBest ?? 0, b.endlessBest ?? 0) || undefined,
    // История серий не объединяется поэлементно (порядок неизвестен) —
    // берём более длинную историю, при равенстве облачную (свежее по времени).
    endlessHistory:
      (a.endlessHistory?.length ?? 0) > (b.endlessHistory?.length ?? 0) ? a.endlessHistory : b.endlessHistory,
    tutorialSeen: a.tutorialSeen || b.tutorialSeen || undefined,
    weekly: mergeWeekly(a.weekly, b.weekly),
    campaignDone: a.campaignDone || b.campaignDone || undefined,
    // Самая ранняя дата прохождения кампании (одноразовое событие «когда»).
    campaignDoneAt: !a.campaignDoneAt
      ? b.campaignDoneAt
      : !b.campaignDoneAt
        ? a.campaignDoneAt
        : a.campaignDoneAt < b.campaignDoneAt
          ? a.campaignDoneAt
          : b.campaignDoneAt,
    endingSeen: a.endingSeen || b.endingSeen || undefined,
    eliteIntroSeen: a.eliteIntroSeen || b.eliteIntroSeen || undefined,
    eliteMedals: mergeMedals(a.eliteMedals, b.eliteMedals),
    grandpaSeen: mergeSeen(a.grandpaSeen, b.grandpaSeen),
    liveYard: a.liveYard === false || b.liveYard === false ? false : undefined,
    bossDone: (() => {
      const set = new Set([...(a.bossDone ?? []), ...(b.bossDone ?? [])]);
      return set.size ? [...set] : undefined;
    })(),
    achievements: mergeSeen(a.achievements, b.achievements),
    endlessResume: Math.max(a.endlessResume ?? 0, b.endlessResume ?? 0) || undefined,
    eliteWeekly: mergeEliteWeekly(sanitizeEliteWeekly(a.eliteWeekly), sanitizeEliteWeekly(b.eliteWeekly)),
    bestMoves: (() => {
      const out = { ...(a.bestMoves ?? {}) };
      for (const [k, v] of Object.entries(b.bestMoves ?? {})) {
        const n = Number(v);
        if (Number.isInteger(n) && n >= 1) out[k] = Math.min(out[k] ?? 999, n);
      }
      return Object.keys(out).length ? out : undefined;
    })()
  };
}

/** Та же неделя — максимум очков; разные недели — более свежая. */
function mergeEliteWeekly(
  a: SaveData['eliteWeekly'],
  b: SaveData['eliteWeekly']
): SaveData['eliteWeekly'] {
  if (!a) return b;
  if (!b) return a;
  if (a.week !== b.week) return a.week > b.week ? a : b;
  return a.score >= b.score ? a : b;
}

/** Валидация результата недельного чемпионата (форма и диапазоны). */
function sanitizeEliteWeekly(raw: unknown): SaveData['eliteWeekly'] {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as { week?: unknown; score?: unknown; medal?: unknown };
  const week = r.week;
  const score = r.score;
  const medal = r.medal;
  // Формат ключа недели задаёт currentWeekKey() (дата понедельника YYYY-MM-DD);
  // проверяем форму, чтобы не связать сейв с внутренним форматом.
  if (typeof week !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return undefined;
  if (!Number.isInteger(score) || (score as number) < 0 || (score as number) > 3999) return undefined;
  if (![1, 2, 3].includes(medal as number)) return undefined;
  return { week, score: score as number, medal: medal as number };
}

/**
 * Та же неделя — берём максимум по каждому счётчику (не сумму: так повторная
 * синхронизация одного и того же прогресса не удваивает его) и объединяем
 * забранные награды; разные недели — берём более свежую по ключу.
 */
function mergeWeekly(a: WeeklyState | undefined, b: WeeklyState | undefined): WeeklyState | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.weekKey !== b.weekKey) return a.weekKey > b.weekKey ? a : b;
  return {
    weekKey: a.weekKey,
    win: Math.max(a.win, b.win),
    perfect: Math.max(a.perfect, b.perfect),
    endlessBest: Math.max(a.endlessBest, b.endlessBest),
    claimed: [...new Set([...a.claimed, ...b.claimed])]
  };
}

/**
 * Медали Высшей лиги — максимум по каждому испытанию. Так повторная синхронизация
 * или переигровка не понижает результат и не «выдаёт» награду заново: очки лиги
 * считаются из этих медалей (сумма), поэтому идемпотентность встроена.
 */
function mergeMedals(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined
): Record<string, number> | undefined {
  if (!a && !b) return undefined;
  const out: Record<string, number> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = Math.max(out[k] ?? 0, v);
  return Object.keys(out).length ? out : undefined;
}

/** Объединение множеств показанных реплик деда (union, без потерь). */
function mergeSeen(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
  if (!a && !b) return undefined;
  const set = new Set([...(a ?? []), ...(b ?? [])]);
  return set.size ? [...set].slice(0, 200) : undefined;
}

export function totalStars(s: SaveData): number {
  return Object.values(s.stars).reduce((sum, n) => sum + n, 0);
}

/** Обёртка над Platform.saveData с актуальными данными в памяти. */
export class SaveStore {
  private saveChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly platform: Platform,
    public data: SaveData
  ) {}

  starsOf(levelId: number): number {
    return this.data.stars[String(levelId)] ?? 0;
  }

  /** Записывает результат уровня; возвращает true, если он улучшен. */
  recordResult(levelId: number, stars: number): boolean {
    if (stars <= this.starsOf(levelId)) return false;
    this.data.stars[String(levelId)] = stars;
    this.persist();
    return true;
  }

  bestMovesOf(levelId: number): number | undefined {
    return this.data.bestMoves?.[String(levelId)];
  }

  /** Личный рекорд ходов: сохраняем только лучший (меньший) результат. */
  recordBestMoves(levelId: number, moves: number): void {
    if (!Number.isInteger(moves) || moves < 1) return;
    const prev = this.bestMovesOf(levelId);
    if (prev !== undefined && prev <= moves) return;
    this.data.bestMoves = { ...(this.data.bestMoves ?? {}), [String(levelId)]: moves };
    this.persist();
  }

  setSound(on: boolean): void {
    this.data.sound = on;
    this.persist();
  }

  setMusic(on: boolean): void {
    this.data.music = on;
    this.persist();
  }

  setLang(lang: SaveData['lang']): void {
    this.data.lang = lang;
    this.data.langChosen = true;
    this.persist();
  }

  setTargetSkin(i: number): void {
    this.data.targetSkin = i;
    this.persist();
  }

  setDaily(state: DailyState): void {
    this.data.daily = state;
    this.persist();
  }

  claimDailyGift(dateKey: string, amount = 2): boolean {
    if (this.data.lastGift === dateKey) return false;
    this.data.lastGift = dateKey;
    this.data.hintTokens = Math.min(99, (this.data.hintTokens ?? 0) + amount);
    this.persist();
    return true;
  }

  spendHintToken(): boolean {
    if ((this.data.hintTokens ?? 0) <= 0) return false;
    this.data.hintTokens = (this.data.hintTokens ?? 0) - 1;
    this.persist();
    return true;
  }

  markReviewAsked(): void {
    this.data.reviewAsked = true;
    this.persist();
  }

  vibrationEnabled(): boolean {
    return this.data.vibration !== false;
  }

  setVibration(on: boolean): void {
    this.data.vibration = on ? undefined : false;
    this.persist();
  }

  setHighContrast(on: boolean): void {
    this.data.highContrast = on ? true : undefined;
    this.persist();
  }

  setNotifyOptIn(on: boolean): void {
    this.data.notifyOptIn = on ? true : undefined;
    this.persist();
  }

  markTutorialSeen(): void {
    if (this.data.tutorialSeen) return;
    this.data.tutorialSeen = true;
    this.persist();
  }

  /** Возвращает true, если результат стал новым личным рекордом. */
  recordEndless(streak: number): boolean {
    if (streak <= (this.data.endlessBest ?? 0)) return false;
    this.data.endlessBest = streak;
    this.persist();
    return true;
  }

  /** Дописывает завершённую серию в историю (последние 10). */
  recordEndlessStreak(streak: number): void {
    const list = [...(this.data.endlessHistory ?? []), Math.max(0, Math.min(9999, Math.floor(streak)))];
    this.data.endlessHistory = list.slice(-10);
    this.persist();
  }

  /**
   * Точка восстановления заезда: пишется после каждой победы, снимается
   * явным «Закончить забег». undefined = активного заезда нет.
   */
  setEndlessResume(streak: number | undefined): void {
    this.data.endlessResume = streak;
    this.persist();
  }

  /**
   * Результат зачётной попытки недельного чемпионата. Возвращает true, если
   * он стал лучшим результатом этой недели (и его стоит отправить в доску).
   */
  recordEliteWeekly(week: string, score: number, medal: number): boolean {
    const current = this.data.eliteWeekly;
    if (current?.week === week && current.score >= score) return false;
    this.data.eliteWeekly = { week, score, medal };
    this.persist();
    return true;
  }

  /** Результат чемпионата актуален для переданной недели. */
  eliteWeeklyOf(week: string): { score: number; medal: number } | null {
    const entry = this.data.eliteWeekly;
    return entry?.week === week ? { score: entry.score, medal: entry.medal } : null;
  }

  /** Записывает событие недельной цели (win/perfect — сумма, endless — максимум серии). */
  recordWeeklyEvent(week: string, kind: WeeklyQuestKind, amount: number): void {
    this.data.weekly = applyWeeklyEvent(this.data.weekly, week, kind, amount);
    this.persist();
  }

  /** Забирает награду недельной цели; true, если начислена (цель выполнена и ещё не забрана). */
  claimWeeklyQuest(week: string, questKey: string, goalReached: boolean, rewardHints: number): boolean {
    if (!goalReached) return false;
    const next = applyWeeklyClaim(this.data.weekly, week, questKey);
    if (!next) return false;
    this.data.weekly = next;
    this.data.hintTokens = Math.min(99, (this.data.hintTokens ?? 0) + rewardHints);
    this.persist();
    return true;
  }

  /** Отмечает прохождение кампании; true — если это первый раз. */
  markCampaignDone(dateKey: string): boolean {
    if (this.data.campaignDone) return false;
    this.data.campaignDone = true;
    this.data.campaignDoneAt = dateKey;
    this.persist();
    return true;
  }

  markEndingSeen(): void {
    if (this.data.endingSeen) return;
    this.data.endingSeen = true;
    this.persist();
  }

  /** Первый заход в лигу: возвращает true один раз за игрока. */
  markEliteIntroSeen(): boolean {
    if (this.data.eliteIntroSeen) return false;
    this.data.eliteIntroSeen = true;
    this.persist();
    return true;
  }

  /**
   * Записывает результат мастер-испытания: медаль по id хранится как максимум.
   * Возвращает предыдущую и новую медаль (для показа «улучшение»/«без изменений»).
   * Награда деривируется из медали, поэтому повторная запись ничего не удваивает.
   */
  recordEliteMedal(challengeId: number, medal: number): { previous: number; next: number } {
    const key = String(challengeId);
    const previous = this.data.eliteMedals?.[key] ?? 0;
    const next = Math.max(previous, medal);
    if (next !== previous) {
      this.data.eliteMedals = { ...(this.data.eliteMedals ?? {}), [key]: next };
      this.persist();
    }
    return { previous, next };
  }

  /**
   * Массовая выдача медалей по максимуму — для медалей, заслуженных в кампании.
   * Идемпотентно (max), поэтому повторные вызовы при каждом заходе в лигу
   * ничего не меняют и не пишут сейв. Возвращает число реально выданных.
   */
  grantEliteMedals(medals: Record<string, number>): number {
    const current = this.data.eliteMedals ?? {};
    const next = { ...current };
    let granted = 0;
    for (const [key, medal] of Object.entries(medals)) {
      const best = Math.max(current[key] ?? 0, medal);
      if (best !== (current[key] ?? 0)) {
        next[key] = best;
        granted++;
      }
    }
    if (granted > 0) {
      this.data.eliteMedals = next;
      this.persist();
    }
    return granted;
  }

  liveYardEnabled(): boolean {
    return this.data.liveYard !== false;
  }

  setLiveYard(on: boolean): void {
    this.data.liveYard = on ? undefined : false;
    this.persist();
  }

  isBossDone(bossId: number): boolean {
    return (this.data.bossDone ?? []).includes(bossId);
  }

  /** Отмечает босса пройденным (прогресс — только после полной победы). */
  markBossDone(bossId: number): void {
    const set = new Set(this.data.bossDone ?? []);
    if (set.has(bossId)) return;
    set.add(bossId);
    this.data.bossDone = [...set];
    this.persist();
  }

  /**
   * Фиксирует выданные достижения. Вызывается после каждого пересчёта: набор
   * целей может измениться вместе с данными кампании, а уже полученная награда
   * — нет.
   */
  rememberAchievements(keys: Iterable<string>): void {
    const seen = new Set(this.data.achievements ?? []);
    const before = seen.size;
    for (const key of keys) seen.add(key);
    if (seen.size === before) return;
    this.data.achievements = [...seen].slice(0, 100);
    this.persist();
  }

  /** Запоминает показанную однократную/сюжетную реплику деда. */
  markGrandpaSeen(id: string): void {
    const seen = new Set(this.data.grandpaSeen ?? []);
    if (seen.has(id)) return;
    seen.add(id);
    this.data.grandpaSeen = [...seen].slice(0, 200);
    this.persist();
  }

  setLastLevel(id: number): void {
    if (id !== this.data.lastLevel) {
      this.data.lastLevel = id;
      this.persist();
    }
  }

  persist(): void {
    // Platform.saveData может завершаться позже следующего изменения. Очередь и
    // неизменяемый снимок не дают старому облачному запросу затереть новый.
    const snapshot = JSON.parse(JSON.stringify(this.data)) as SaveData;
    this.saveChain = this.saveChain
      .then(() => this.platform.saveData(snapshot))
      .catch((e) => console.warn('Сохранение не удалось:', e));
  }
}
