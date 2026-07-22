import type { DailyState } from './daily';
import type { Platform } from '../platform/types';
import { applyWeeklyClaim, applyWeeklyEvent, type WeeklyQuestKind, type WeeklyState } from './weekly';

export interface SaveData {
  v: 1;
  /** Лучший результат по уровням: id -> 0..3 звезды. */
  stars: Record<string, number>;
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
}

export function defaultSave(): SaveData {
  return { v: 1, stars: {}, sound: true, music: true, lang: 'ru', lastLevel: 1, targetSkin: 0 };
}

export function sanitizeSave(raw: unknown): SaveData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<SaveData>;
  if (r.v !== 1 || typeof r.stars !== 'object' || r.stars === null) return null;
  const stars: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.stars)) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0 && n <= 3) stars[k] = n;
  }
  return {
    v: 1,
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
    eliteMedals: sanitizeMedals(r.eliteMedals),
    grandpaSeen: Array.isArray(r.grandpaSeen)
      ? (() => {
          const list = [...new Set(r.grandpaSeen.filter((k): k is string => typeof k === 'string'))].slice(0, 200);
          return list.length ? list : undefined;
        })()
      : undefined,
    liveYard: r.liveYard === false ? false : undefined,
    bossDone: Array.isArray(r.bossDone)
      ? (() => {
          const list = [...new Set(r.bossDone.filter((n): n is number => Number.isInteger(n) && n > 0))];
          return list.length ? list : undefined;
        })()
      : undefined
  };
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
    v: 1,
    stars,
    sound: b.sound,
    music: b.music,
    lang: b.lang,
    langChosen: a.langChosen || b.langChosen || undefined,
    lastLevel: Math.max(a.lastLevel, b.lastLevel),
    targetSkin: b.targetSkin,
    daily,
    hintTokens: Math.max(a.hintTokens ?? 0, b.hintTokens ?? 0) || undefined,
    lastGift: !a.lastGift ? b.lastGift : !b.lastGift ? a.lastGift : a.lastGift > b.lastGift ? a.lastGift : b.lastGift,
    reviewAsked: a.reviewAsked || b.reviewAsked || undefined,
    vibration: a.vibration === false || b.vibration === false ? false : undefined,
    highContrast: a.highContrast || b.highContrast || undefined,
    notifyOptIn: a.notifyOptIn || b.notifyOptIn || undefined,
    endlessBest: Math.max(a.endlessBest ?? 0, b.endlessBest ?? 0) || undefined,
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
    eliteMedals: mergeMedals(a.eliteMedals, b.eliteMedals),
    grandpaSeen: mergeSeen(a.grandpaSeen, b.grandpaSeen),
    liveYard: a.liveYard === false || b.liveYard === false ? false : undefined,
    bossDone: (() => {
      const set = new Set([...(a.bossDone ?? []), ...(b.bossDone ?? [])]);
      return set.size ? [...set] : undefined;
    })()
  };
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
