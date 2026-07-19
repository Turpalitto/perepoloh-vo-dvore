import type { DailyState } from './daily';
import type { Platform } from '../platform/types';

export interface SaveData {
  v: 1;
  /** Лучший результат по уровням: id -> 0..3 звезды. */
  stars: Record<string, number>;
  sound: boolean;
  music: boolean;
  /** Язык интерфейса; по умолчанию русский. */
  lang: 'ru' | 'en' | 'tr';
  lastLevel: number;
  /** Выбранный скин целевой машины. */
  targetSkin: number;
  /** Прогресс «уровня дня». */
  daily?: DailyState;
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
    lastLevel: Number.isInteger(r.lastLevel) && (r.lastLevel as number) >= 1 ? (r.lastLevel as number) : 1,
    targetSkin: Number.isInteger(r.targetSkin) && (r.targetSkin as number) >= 0 ? (r.targetSkin as number) : 0,
    daily:
      r.daily && typeof r.daily.last === 'string' && Number.isInteger(r.daily.streak) && r.daily.streak >= 1
        ? { last: r.daily.last, streak: r.daily.streak }
        : undefined
  };
}

/** Слияние локального и облачного сейва: максимум звёзд по каждому уровню. */
export function mergeSave(a: SaveData, b: SaveData): SaveData {
  const stars: Record<string, number> = { ...a.stars };
  for (const [k, v] of Object.entries(b.stars)) stars[k] = Math.max(stars[k] ?? 0, v);
  return {
    v: 1,
    stars,
    sound: b.sound,
    music: b.music,
    lang: b.lang,
    lastLevel: Math.max(a.lastLevel, b.lastLevel),
    targetSkin: b.targetSkin,
    daily: !a.daily ? b.daily : !b.daily ? a.daily : a.daily.last > b.daily.last ? a.daily : b.daily
  };
}

export function totalStars(s: SaveData): number {
  return Object.values(s.stars).reduce((sum, n) => sum + n, 0);
}

/** Обёртка над Platform.saveData с актуальными данными в памяти. */
export class SaveStore {
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

  setLastLevel(id: number): void {
    if (id !== this.data.lastLevel) {
      this.data.lastLevel = id;
      this.persist();
    }
  }

  persist(): void {
    void this.platform.saveData(this.data).catch((e) => console.warn('Сохранение не удалось:', e));
  }
}
