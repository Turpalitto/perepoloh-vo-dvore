import type { AnalyticsTracker } from '../game/analytics';
import type { SaveData } from '../game/save';

/** Колбэки на время показа рекламы: пауза/мьют и восстановление. */
export interface AdHandlers {
  onPause(): void;
  onResume(): void;
}

export interface PlatformConfig {
  interstitialEvery: number;
  interstitialMinLevel: number;
  interstitialMinSessionMs: number;
  freeHintsPerSession: number;
}

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  interstitialEvery: 6,
  interstitialMinLevel: 10,
  interstitialMinSessionMs: 240_000,
  freeHintsPerSession: 1
};

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  /** Строка принадлежит текущему игроку (для «ваше место» в UI). */
  isMe?: boolean;
}

/** Один ответ платформы: верхние строки + место текущего игрока (если есть). */
export interface LeaderboardSnapshot {
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}

/**
 * Единственная точка контакта игры с платформой.
 * Реализации: mock (локальная разработка) и yandex (Яндекс Игры).
 */
/**
 * Технические имена лидербордов из консоли Яндекс Игр.
 *
 * `eliteleague` — очки Высшей лиги. Режим называется лигой и имеет ранги, но до
 * этой доски соревнования в нём не было вообще: игрок видел только собственный
 * счёт. Доску нужно завести в консоли под этим же именем — SDK отклонит
 * неизвестное имя, и вызов молча уйдёт в catch (см. yandex.ts).
 *
 * `eliteweekly` — недельный чемпионат (Stage B): одно испытание недели у всех
 * игроков, очки = медаль × 1000 − ходы. Доска опциональна: без неё чемпионат
 * работает как еженедельное испытание с локальным рекордом (см. elite-weekly.ts).
 */
export type LeaderboardName = 'yardstars' | 'dailystreak' | 'eliteleague' | 'eliteweekly';

export interface Platform {
  readonly name: 'mock' | 'yandex' | 'local-fallback';
  readonly config: PlatformConfig;
  /** Устройство определено SDK как телевизор. */
  readonly isTV: boolean;
  init(): Promise<void>;
  /** Язык интерфейса платформы (например 'ru', 'en', 'tr'). */
  getLang(): string;
  /** Отправить результат в лидерборд (тихо игнорируется, если недоступно). */
  submitScore(board: LeaderboardName, value: number): Promise<void>;
  /**
   * Верхние строки + место текущего игрока — один сетевой запрос на таблицу
   * (раньше getLeaderboard/getMyRank дублировали один и тот же запрос).
   */
  getLeaderboardSnapshot(board: LeaderboardName): Promise<LeaderboardSnapshot>;
  /** Предложить оценить игру; true, если нативный диалог удалось вызвать. */
  requestReview(): Promise<boolean>;
  /** Серверное время платформы, fallback — время устройства. */
  serverTime(): number;
  /** Системные пауза/возобновление (включая стартовую рекламу платформы). */
  setLifecycleHandlers(h: AdHandlers): void;
  /** Кнопка Back на ТВ-пульте (SDK HISTORY_BACK). */
  setBackHandler(handler: () => void): void;
  /** Запросить полноэкранный режим после действия пользователя. */
  requestFullscreen(): Promise<void>;
  /** Подтверждённый выход из TV-версии (SDK EXIT). */
  exit(): Promise<void>;
  /** Сигнал «игра загружена и интерактивна» (LoadingAPI.ready). */
  ready(): void;
  /** Разметка геймплея (GameplayAPI.start/stop). */
  gameplayStart(): void;
  gameplayStop(): void;
  loadData(): Promise<SaveData | null>;
  saveData(data: SaveData): Promise<void>;
  /**
   * Полноэкранная реклама между уровнями. Никогда не отклоняется; результат —
   * состоялся ли показ на самом деле. Платформа возвращает false и при отказе
   * (слишком частые вызовы, offline, SDK недоступен), поэтому «вызвали» и
   * «показали» — разные события воронки.
   */
  showInterstitial(h: AdHandlers): Promise<boolean>;
  /** Rewarded-видео; true — награда заслужена. */
  showRewarded(h: AdHandlers): Promise<boolean>;
  /**
   * Трекер воронки этой платформы. Игра не знает, куда именно уходят события:
   * на Яндексе — счётчик Метрики (только если он настроен), локально — консоль.
   * Реализация обязана быть «мягкой»: сбой аналитики не ломает игру.
   */
  createAnalyticsTracker(): AnalyticsTracker;
  /**
   * Sticky-баннер в свободных полях по краям широкого экрана (десктоп/TV).
   * Платформа сама решает, показывать ли его и где — мы только просим.
   * Тихо игнорируется, если недоступно (мобильный/узкий экран/нет SDK).
   */
  showBanner(): Promise<void>;
}
