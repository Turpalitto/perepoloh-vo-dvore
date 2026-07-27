/**
 * Счётчики текущей игровой сессии для воронки аналитики.
 * Чистое состояние в памяти: не пишется в сейв, не зависит от DOM, обнуляется
 * вместе со вкладкой. Вынесено из App, чтобы номера попыток проверялись
 * юнит-тестами, а не только глазами в браузере.
 */
export interface LevelAttempt {
  /** Какой по счёту уровень запущен за сессию (1-based, любой режим). */
  sessionLevelNumber: number;
  /** Номер попытки конкретного уровня в этой сессии (рестарт = новая попытка). */
  attemptNumber: number;
}

export class SessionStats {
  private levelsStarted = 0;
  private readonly attempts = new Map<number, number>();

  /** Уровень открыт (вход на экран уровня, включая переход «Дальше»). */
  levelStarted(levelId: number): LevelAttempt {
    this.levelsStarted++;
    const attemptNumber = (this.attempts.get(levelId) ?? 0) + 1;
    this.attempts.set(levelId, attemptNumber);
    return { sessionLevelNumber: this.levelsStarted, attemptNumber };
  }

  /**
   * Рестарт внутри уровня: новая попытка того же уровня, но не новый вход
   * (sessionLevelNumber не растёт — иначе воронка «сколько уровней за сессию»
   * ломается о кнопку «Заново»).
   */
  levelRestarted(levelId: number): number {
    const attemptNumber = (this.attempts.get(levelId) ?? 1) + 1;
    this.attempts.set(levelId, attemptNumber);
    return attemptNumber;
  }

  /** Текущий номер попытки уровня (для событий завершения). */
  attemptOf(levelId: number): number {
    return this.attempts.get(levelId) ?? 1;
  }
}
