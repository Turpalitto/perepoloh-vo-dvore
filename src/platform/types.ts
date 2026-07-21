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

/**
 * Единственная точка контакта игры с платформой.
 * Реализации: mock (локальная разработка) и yandex (Яндекс Игры).
 */
export interface Platform {
  readonly name: 'mock' | 'yandex';
  readonly config: PlatformConfig;
  /** Устройство определено SDK как телевизор. */
  readonly isTV: boolean;
  init(): Promise<void>;
  /** Язык интерфейса платформы (например 'ru', 'en', 'tr'). */
  getLang(): string;
  /** Отправить результат в лидерборд (тихо игнорируется, если недоступно). */
  submitScore(board: 'yardstars' | 'dailystreak', value: number): Promise<void>;
  /** Получить первые строки лидерборда. */
  getLeaderboard(board: 'yardstars' | 'dailystreak'): Promise<LeaderboardEntry[]>;
  /** Место текущего игрока (null — неизвестно/неавторизован). */
  getMyRank(board: 'yardstars' | 'dailystreak'): Promise<LeaderboardEntry | null>;
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
  /** Полноэкранная реклама между уровнями. Никогда не отклоняется. */
  showInterstitial(h: AdHandlers): Promise<void>;
  /** Rewarded-видео; true — награда заслужена. */
  showRewarded(h: AdHandlers): Promise<boolean>;
  /**
   * Sticky-баннер в свободных полях по краям широкого экрана (десктоп/TV).
   * Платформа сама решает, показывать ли его и где — мы только просим.
   * Тихо игнорируется, если недоступно (мобильный/узкий экран/нет SDK).
   */
  showBanner(): Promise<void>;
}
