import type { SaveData } from '../game/save';

/** Колбэки на время показа рекламы: пауза/мьют и восстановление. */
export interface AdHandlers {
  onPause(): void;
  onResume(): void;
}

/**
 * Единственная точка контакта игры с платформой.
 * Реализации: mock (локальная разработка) и yandex (Яндекс Игры).
 */
export interface Platform {
  readonly name: 'mock' | 'yandex';
  init(): Promise<void>;
  /** Язык интерфейса платформы (например 'ru', 'en', 'tr'). */
  getLang(): string;
  /** Отправить сумму звёзд в лидерборд (тихо игнорируется, если недоступно). */
  submitScore(totalStars: number): Promise<void>;
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
}
