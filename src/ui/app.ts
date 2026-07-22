/**
 * Экраны и игровой контроллер. Никакой игровой логики —
 * только связывание core, BoardView, платформы и сохранений.
 */
import levelsJson from '../levels/levels.json';
import type { LevelDef } from '../core/types';
import { GameState, createState, starsFor } from '../core/game';
import { track } from '../game/analytics';
import { hint, solve } from '../core/solver';
import { ACHIEVEMENTS, achievementProgress, unlockedAchievementKeys } from '../game/achievements';
import type { GameAudio } from '../game/audio';
import type { DailyModifier } from '../game/daily';
import {
  advanceStreak,
  currentStreak,
  dailyModifier,
  isDoneToday,
  todayKey,
  weeklyProgress,
  weeklyTrophies
} from '../game/daily';
import { DailyLevelService } from '../game/daily-client';
import { generateEndless } from '../game/endless';
import { requestReminderPermission } from '../game/reminder';
import { currentSeason } from '../game/season';
import {
  WEEKLY_QUEST_REWARD_HINTS,
  currentWeekKey,
  isWeeklyQuestClaimed,
  selectWeeklyQuests,
  weeklyQuestProgress
} from '../game/weekly';
import { getLang, levelText, setLang, t } from '../game/i18n';
import {
  isLevelUnlocked,
  newlyUnlocked,
  nextLevelToPlay,
  nextUpgrade,
  unlockedUpgrades
} from '../game/progression';
import { SaveStore, totalStars } from '../game/save';
import {
  type AttemptResult,
  type Medal,
  elitePoints,
  medalForAttempt,
  medalOf,
  medaledCount,
  nextRank,
  rankFor
} from '../game/elite';
import { ELITE_CHALLENGES, type EliteChallenge, sourceLevel } from '../levels/elite-challenges';
import {
  type BossLevelDef,
  type BossPhase,
  type BossRun,
  advancePhase,
  bossFor,
  bossObjectiveSatisfied,
  bossProgress,
  createBossRun,
  currentPhase
} from '../game/boss';
import type { AdHandlers, LeaderboardEntry, Platform } from '../platform/types';
import { createLeaderboardCache, type LeaderboardCache } from '../game/leaderboard-cache';
import { queryParam } from '../query';
import { BoardView } from './board';
import { YardDirector } from './yard-reactions';
import { showCampaignEnding } from './campaign-ending';
import { TARGET_SKINS, setTargetSkin } from './sprites';
import { levelThumbnail } from './thumbnail';
import { yardSVG } from './yard';

const CAMPAIGN_LAST_ID = 100;
const MEDAL_ICON: Record<Medal, string> = { 0: '', 1: '🥉', 2: '🥈', 3: '🥇' };
const MEDAL_KEY: Record<Medal, string> = { 0: 'medal.none', 1: 'medal.bronze', 2: 'medal.silver', 3: 'medal.gold' };

const LEVELS = levelsJson as LevelDef[];

const soundOnIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 9 h4 l5 -4 v14 l-5 -4 H4 Z" fill="currentColor"/><path d="M16 8 q3 4 0 8 M18.5 5.5 q5 6.5 0 13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
const soundOffIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 9 h4 l5 -4 v14 l-5 -4 H4 Z" fill="currentColor"/><path d="M16 9 l6 6 M22 9 l-6 6" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`;
const pauseIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor"/></svg>`;
const musicOnIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M9 17.5 V6.5 l9 -2 v11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="7" cy="17.5" r="2.6" fill="currentColor"/><circle cx="16" cy="15.5" r="2.6" fill="currentColor"/></svg>`;
const musicOffIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M9 17.5 V6.5 l9 -2 v11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" opacity="0.45"/><circle cx="7" cy="17.5" r="2.6" fill="currentColor" opacity="0.45"/><circle cx="16" cy="15.5" r="2.6" fill="currentColor" opacity="0.45"/><line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const vibrateOnIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><rect x="8" y="4" width="8" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M4 9 v6 M2 11 v2 M20 9 v6 M22 11 v2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
const vibrateOffIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><rect x="8" y="4" width="8" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2.2" opacity="0.45"/><line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const contrastIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 3 a9 9 0 0 1 0 18 Z" fill="currentColor"/></svg>`;
const bellOnIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 3.5a5.5 5.5 0 0 0-5.5 5.5v3l-2 3.5h15l-2-3.5V9A5.5 5.5 0 0 0 12 3.5Z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/><path d="M9.5 18.5a2.5 2.5 0 0 0 5 0" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>`;
const bellOffIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 3.5a5.5 5.5 0 0 0-5.5 5.5v3l-2 3.5h15l-2-3.5V9A5.5 5.5 0 0 0 12 3.5Z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" opacity="0.45"/><path d="M9.5 18.5a2.5 2.5 0 0 0 5 0" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" opacity="0.45"/><line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;

function starIcons(n: number, of = 3): string {
  let s = '';
  for (let i = 0; i < of; i++) s += `<span class="star ${i < n ? 'full' : ''}">★</span>`;
  return s;
}

function escapeHTML(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
}

export class App {
  private root: HTMLElement;
  private winsSinceAd = 0;
  private inGameplay = false;
  private platformPaused = false;
  private userPaused = false;
  private gameplayAtPlatformPause = false;
  private adPauseDepth = 0;
  private readonly sessionStartedAt = performance.now();
  private freeHintsLeft: number;
  private readonly dailyLevels = new DailyLevelService();
  private dailyLoading = false;
  private tvFullscreenRequested = false;
  private tvFocusTimer = 0;
  private tvFocusObserver: MutationObserver | null = null;
  private activeBoard: BoardView | null = null;
  private yardDirector: YardDirector | null = null;
  /** Момент показа интро текущего босса — для аналитики `boss_complete.timeMs`. */
  private bossStartedAt = 0;
  /**
   * `?grandpaDebug=1`: логирует в консоль выбор реплики деда и причины отсева
   * остальных. Только dev/e2e — в production build (`import.meta.env.DEV`
   * false, `MODE` не 'e2e') остаётся выключенным независимо от query-строки.
   */
  private readonly grandpaDebug =
    (import.meta.env.DEV || import.meta.env.MODE === 'e2e') && queryParam('grandpaDebug') === '1';
  private onboardingHandEl: HTMLElement | null = null;
  private endlessStreak = 0;
  /** Первый экран сессии не анимируем — переходить не от чего, и он может
   *  тут же смениться синхронно (автостарт уровня 1 у новых игроков в main.ts). */
  private firstRender = true;
  private screenTransitionActive = false;
  /** Рестарты за сессию по уровням — после 3 предлагаем пропуск за рекламу. */
  private restartCounts = new Map<number, number>();
  /** Один запрос на таблицу лидерборда за раз (TTL 45с) — см. leaderboard-cache.ts. */
  private readonly leaderboardCache: LeaderboardCache;

  constructor(
    private readonly platform: Platform,
    private readonly store: SaveStore,
    private readonly audio: GameAudio
  ) {
    this.leaderboardCache = createLeaderboardCache((board) => this.platform.getLeaderboardSnapshot(board));
    this.root = document.getElementById('app')!;
    this.root.classList.toggle('tv-mode', platform.isTV);
    this.root.addEventListener('contextmenu', (event) => event.preventDefault());
    this.freeHintsLeft = platform.config.freeHintsPerSession;
    this.platform.setLifecycleHandlers({
      onPause: () => {
        if (this.platformPaused) return;
        this.platformPaused = true;
        this.gameplayAtPlatformPause = this.inGameplay;
        this.syncAudioPause();
        this.audio.engineStop();
        this.root.classList.add('platform-paused');
      },
      onResume: () => {
        if (!this.platformPaused) return;
        this.platformPaused = false;
        this.root.classList.remove('platform-paused');
        this.syncAudioPause();
        // SDK сам восстанавливает GameplayAPI в состояние до pause. Если экран
        // успел измениться во время стартовой рекламы, синхронизируем отличие.
        if (this.inGameplay !== this.gameplayAtPlatformPause) {
          if (this.inGameplay) this.platform.gameplayStart();
          else this.platform.gameplayStop();
        }
      }
    });
    this.platform.setBackHandler(this.handleTVBack);
    if (this.platform.isTV) {
      document.addEventListener('keydown', this.onTVKeyDown);
      this.tvFocusObserver = new MutationObserver(() => this.scheduleTVFocus());
      this.tvFocusObserver.observe(this.root, { childList: true, subtree: true });
    }
    document.addEventListener('visibilitychange', () => {
      this.audio.setHidden(document.hidden);
      if (document.hidden) this.yardDirector?.setPaused(true);
      else this.syncAudioPause();
    });
    const unlockAudio = () => {
      this.audio.unlock();
      this.audio.startAmbient();
      this.audio.startMusic();
    };
    document.addEventListener('pointerdown', unlockAudio, { capture: true });
    document.addEventListener('touchstart', unlockAudio, { capture: true, passive: true });
    document.addEventListener('mousedown', unlockAudio, { capture: true });
    // Генерация идёт в Worker: можно прогреть daily без заморозки первого уровня.
    this.dailyLevels.prewarm(this.dailyKey());
  }

  private visibleTVControls(): HTMLElement[] {
    const overlays = this.root.querySelectorAll<HTMLElement>('.overlay');
    const scope = overlays.length > 0 ? overlays[overlays.length - 1] : this.root;
    return Array.from(scope.querySelectorAll<HTMLElement>('button:not([disabled]), .board[tabindex]')).filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
  }

  private scheduleTVFocus(): void {
    window.clearTimeout(this.tvFocusTimer);
    this.tvFocusTimer = window.setTimeout(() => this.focusTVDefault(), 0);
  }

  private focusTVDefault(force = false): void {
    if (!this.platform.isTV) return;
    const active = document.activeElement as HTMLElement | null;
    if (!force && active && this.root.contains(active) && this.visibleTVControls().includes(active)) return;
    const overlay = this.root.querySelector<HTMLElement>('.overlay:last-of-type');
    const target =
      overlay?.querySelector<HTMLElement>('[data-tv-default], button:not([disabled])') ??
      this.root.querySelector<HTMLElement>(
        '[data-tv-default], .level-card.current:not([disabled]), .board[tabindex], button:not([disabled])'
      );
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private moveTVFocus(dx: number, dy: number): void {
    const controls = this.visibleTVControls();
    if (controls.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    if (!active || !controls.includes(active)) {
      this.focusTVDefault(true);
      return;
    }
    const from = active.getBoundingClientRect();
    const fromX = from.left + from.width / 2;
    const fromY = from.top + from.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of controls) {
      if (candidate === active) continue;
      const rect = candidate.getBoundingClientRect();
      const deltaX = rect.left + rect.width / 2 - fromX;
      const deltaY = rect.top + rect.height / 2 - fromY;
      const primary = deltaX * dx + deltaY * dy;
      if (primary <= 0) continue;
      const lateral = Math.abs(deltaX * dy - deltaY * dx);
      const score = primary + lateral * 3;
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (!best) {
      const ordered = [...controls].sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return dx + dy > 0 ? ar.top + ar.left - (br.top + br.left) : br.top + br.left - (ar.top + ar.left);
      });
      best = ordered.find((candidate) => candidate !== active) ?? null;
    }
    best?.focus({ preventScroll: true });
    best?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private requestTVFullscreen(): void {
    if (this.tvFullscreenRequested) return;
    this.tvFullscreenRequested = true;
    void this.platform.requestFullscreen();
  }

  private onTVKeyDown = (event: KeyboardEvent): void => {
    if (!this.platform.isTV) return;
    const isBack = event.key === 'Escape' || event.key === 'BrowserBack' || event.key === 'GoBack';
    if (isBack) {
      if (event.repeat) return;
      event.preventDefault();
      this.handleTVBack();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) return;
    this.requestTVFullscreen();
    if (event.defaultPrevented) return;
    if (event.key === 'Enter') {
      if (event.repeat) return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.matches('button:not([disabled])')) {
        event.preventDefault();
        active.click();
      } else {
        this.focusTVDefault(true);
      }
      return;
    }
    event.preventDefault();
    const direction =
      event.key === 'ArrowLeft'
        ? { dx: -1, dy: 0 }
        : event.key === 'ArrowRight'
          ? { dx: 1, dy: 0 }
          : event.key === 'ArrowUp'
            ? { dx: 0, dy: -1 }
            : { dx: 0, dy: 1 };
    this.moveTVFocus(direction.dx, direction.dy);
  };

  private handleTVBack = (): void => {
    if (!this.platform.isTV) return;
    const exitOverlay = this.root.querySelector<HTMLElement>('[data-testid=tv-exit-overlay]');
    if (exitOverlay) {
      exitOverlay.remove();
      this.scheduleTVFocus();
      return;
    }
    const pauseOverlay = this.root.querySelector('[data-testid=pause-overlay]');
    if (pauseOverlay) {
      this.showTVExitDialog();
      return;
    }
    const dismiss = this.root.querySelector<HTMLElement>(
      '[data-testid=gift-close], [data-testid=btn-rules-close], [data-testid=btn-win-menu], [data-testid=btn-final-menu]'
    );
    if (dismiss) {
      dismiss.click();
      return;
    }
    const back = this.root.querySelector<HTMLElement>('[data-testid=btn-back]');
    if (back) {
      back.click();
      return;
    }
    const pause = this.root.querySelector<HTMLElement>('[data-testid=btn-pause]');
    if (pause) {
      pause.click();
      return;
    }
    this.showTVExitDialog();
  };

  private showTVExitDialog(): void {
    if (this.root.querySelector('[data-testid=tv-exit-overlay]')) return;
    const overlay = document.createElement('div');
    overlay.className = 'overlay tv-exit-overlay';
    overlay.setAttribute('data-testid', 'tv-exit-overlay');
    overlay.innerHTML = `
      <div class="dialog">
        <h2>${t('tv.exitTitle')}</h2>
        <div class="dialog-sub">${t('tv.exitQuestion')}</div>
        <button class="btn btn-primary btn-big" data-tv-default data-testid="tv-exit-stay">${t('tv.stay')}</button>
        <button class="btn btn-big" data-testid="tv-exit-confirm">${t('tv.exit')}</button>
      </div>`;
    this.q('.overlay-slot').appendChild(overlay);
    overlay.querySelector('[data-testid=tv-exit-stay]')!.addEventListener('click', () => {
      overlay.remove();
      this.focusTVDefault(true);
    });
    overlay.querySelector('[data-testid=tv-exit-confirm]')!.addEventListener('click', () => {
      void this.platform.exit();
    });
    overlay.querySelector<HTMLElement>('[data-testid=tv-exit-stay]')!.focus({ preventScroll: true });
  }

  private setGameplay(on: boolean): void {
    if (on === this.inGameplay) return;
    this.inGameplay = on;
    // Во время game_api_pause SDK уже остановил разметку. Нужное состояние
    // будет отправлено после resume только если экран действительно сменился.
    if (this.platformPaused) return;
    if (on) this.platform.gameplayStart();
    else this.platform.gameplayStop();
  }

  private syncAudioPause(): void {
    const paused = this.platformPaused || this.userPaused || this.adPauseDepth > 0;
    this.audio.duck(paused);
    this.yardDirector?.setPaused(paused);
  }

  private vibrate(pattern: number | number[]): void {
    if (this.store.vibrationEnabled()) navigator.vibrate?.(pattern);
  }

  private disposeActiveBoard(): void {
    this.activeBoard?.destroy();
    this.activeBoard = null;
    this.yardDirector?.destroy();
    this.yardDirector = null;
    this.hideOnboardingHand();
  }

  /**
   * Плавная смена экрана через View Transitions API, где браузер её умеет:
   * кросс-фейд/сдвиг между старым и новым DOM без ручной хореографии на JS.
   * Прогрессивное улучшение — без поддержки или при prefers-reduced-motion
   * экран просто меняется мгновенно, как раньше.
   */
  /**
   * Порог-предохранитель: если API на этом устройстве реально глючит или
   * тормозит, не пытаемся героически чинить — тихо и навсегда откатываемся
   * на мгновенную смену экрана. Порог хранится в localStorage, так что один
   * раз словив проблему, устройство больше не наступает на неё в будущих
   * сессиях — включать обратно вручную незачем, риска для геймплея нет.
   */
  private static readonly VT_DISABLE_KEY = 'parkovka.vt-disabled';
  private static readonly VT_FAIL_LIMIT = 2;
  private static readonly VT_SLOW_MS = 1500;
  private vtFailCount = 0;

  private viewTransitionsDisabled(): boolean {
    try {
      return localStorage.getItem(App.VT_DISABLE_KEY) === '1';
    } catch {
      return false; // приватный режим без localStorage — не блокируем анимацию из-за этого
    }
  }

  private disableViewTransitionsPermanently(reason: string): void {
    console.warn('[ui] View Transitions отключены на этом устройстве в обход:', reason);
    try {
      localStorage.setItem(App.VT_DISABLE_KEY, '1');
    } catch {
      // приватный режим — переживёт только текущую сессию, и ладно
    }
  }

  private transitionScreen(update: () => void): void {
    const dt = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };
    // Пока предыдущий переход ещё не улёгся — не запускаем второй поверх него
    // (двойной клик по навигации иначе даёт рваный визуальный конфликт),
    // просто применяем изменение сразу.
    const skip =
      this.firstRender ||
      this.screenTransitionActive ||
      !dt.startViewTransition ||
      this.viewTransitionsDisabled() ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.firstRender = false;
    if (skip) {
      update();
      return;
    }
    this.screenTransitionActive = true;
    // ran-флаг: если startViewTransition бросит синхронно уже после вызова
    // update() (нестандартная реализация), не выполняем смену экрана дважды.
    let ran = false;
    const guardedUpdate = () => {
      ran = true;
      update();
    };
    const startedAt = performance.now();
    try {
      dt.startViewTransition(guardedUpdate)
        .finished.then(
          () => {
            // Затянувшийся переход — верный признак, что устройству/браузеру
            // API не по силам; лучше выключить, чем каждый раз подтормаживать.
            if (performance.now() - startedAt > App.VT_SLOW_MS) {
              this.disableViewTransitionsPermanently('переход занял слишком долго');
            }
          },
          (e: unknown) => {
            // Пропущенный/прерванный переход (повторная навигация, скрытая
            // вкладка) — штатный сценарий API, а не баг, не считаем сбоем.
            const expected = e instanceof DOMException && e.name === 'AbortError';
            if (expected) return;
            console.warn('[ui] переход экрана завершился с ошибкой:', e);
            this.vtFailCount++;
            if (this.vtFailCount >= App.VT_FAIL_LIMIT) {
              this.disableViewTransitionsPermanently(`${this.vtFailCount} ошибок подряд`);
            }
          }
        )
        .finally(() => {
          this.screenTransitionActive = false;
        });
    } catch (e) {
      // Нестандартная/частичная реализация API у браузера — не даём упасть навигации.
      this.screenTransitionActive = false;
      this.disableViewTransitionsPermanently('startViewTransition бросил синхронно');
      console.warn('[ui] startViewTransition недоступен, экран сменён без анимации:', e);
      if (!ran) update();
    }
  }

  private adHandlers(extraPause?: () => void, extraResume?: () => void): AdHandlers {
    const resumeGameplay = this.inGameplay;
    return {
      onPause: () => {
        this.adPauseDepth++;
        this.syncAudioPause();
        this.setGameplay(false);
        extraPause?.();
      },
      onResume: () => {
        this.adPauseDepth = Math.max(0, this.adPauseDepth - 1);
        this.syncAudioPause();
        if (resumeGameplay && !document.hidden) this.setGameplay(true);
        extraResume?.();
      }
    };
  }

  private dailyKey(): string {
    return todayKey(new Date(this.platform.serverTime()));
  }

  private soundToggleHtml(testid: string): string {
    return `<button class="icon-btn sound-toggle" data-testid="${testid}" aria-label="${t('audio.sound')}">${
      this.audio.enabled ? soundOnIcon : soundOffIcon
    }</button>`;
  }

  private wireSoundToggle(el: HTMLElement): void {
    el.addEventListener('click', () => {
      const on = !this.audio.enabled;
      this.audio.setEnabled(on);
      this.store.setSound(on);
      el.innerHTML = on ? soundOnIcon : soundOffIcon;
      this.audio.play('click');
    });
  }

  private musicToggleHtml(testid: string): string {
    return `<button class="icon-btn" data-testid="${testid}" aria-label="${t('audio.music')}">${
      this.audio.musicEnabled ? musicOnIcon : musicOffIcon
    }</button>`;
  }

  private wireMusicToggle(el: HTMLElement): void {
    el.addEventListener('click', () => {
      const on = !this.audio.musicEnabled;
      this.audio.setMusicEnabled(on);
      this.store.setMusic(on);
      el.innerHTML = on ? musicOnIcon : musicOffIcon;
      this.audio.play('click');
    });
  }

  private vibrationToggleHtml(testid: string): string {
    return `<button class="icon-btn" data-testid="${testid}" aria-label="${t('audio.vibration')}">${
      this.store.vibrationEnabled() ? vibrateOnIcon : vibrateOffIcon
    }</button>`;
  }

  private wireVibrationToggle(el: HTMLElement): void {
    el.addEventListener('click', () => {
      const on = !this.store.vibrationEnabled();
      this.store.setVibration(on);
      el.innerHTML = on ? vibrateOnIcon : vibrateOffIcon;
      this.audio.play('click');
      if (on) this.vibrate(20);
    });
  }

  private bellToggleHtml(testid: string): string {
    const supported = typeof Notification !== 'undefined' && Notification.permission !== 'denied';
    if (!supported) return '';
    const on = this.store.data.notifyOptIn === true && Notification.permission === 'granted';
    return `<button class="icon-btn bell-toggle" data-testid="${testid}" aria-pressed="${on}" aria-label="${t('audio.reminders')}">${
      on ? bellOnIcon : bellOffIcon
    }</button>`;
  }

  private wireBellToggle(el: HTMLElement): void {
    el.addEventListener('click', async () => {
      this.audio.play('click');
      const on = this.store.data.notifyOptIn === true && Notification.permission === 'granted';
      if (on) {
        this.store.setNotifyOptIn(false);
        el.innerHTML = bellOffIcon;
        el.setAttribute('aria-pressed', 'false');
      } else {
        const granted = await requestReminderPermission(this.store);
        el.innerHTML = granted ? bellOnIcon : bellOffIcon;
        el.setAttribute('aria-pressed', String(granted));
      }
    });
  }

  private liveYardToggleHtml(testid: string): string {
    const on = this.store.liveYardEnabled();
    return `<button class="icon-btn liveyard-toggle${on ? ' active' : ''}" data-testid="${testid}" aria-pressed="${on}" aria-label="${t('audio.liveYard')}">🧑‍🌾</button>`;
  }

  private wireLiveYardToggle(el: HTMLElement): void {
    el.addEventListener('click', () => {
      const on = !this.store.liveYardEnabled();
      this.store.setLiveYard(on);
      el.classList.toggle('active', on);
      el.setAttribute('aria-pressed', String(on));
      this.audio.play('click');
    });
  }

  private contrastToggleHtml(testid: string): string {
    const on = this.store.data.highContrast === true;
    return `<button class="icon-btn contrast-toggle${on ? ' active' : ''}" data-testid="${testid}" aria-pressed="${on}" aria-label="${t('audio.contrast')}">${contrastIcon}</button>`;
  }

  private wireContrastToggle(el: HTMLElement): void {
    el.addEventListener('click', () => {
      const on = this.store.data.highContrast !== true;
      this.store.setHighContrast(on);
      document.documentElement.classList.toggle('high-contrast', on);
      el.classList.toggle('active', on);
      el.setAttribute('aria-pressed', String(on));
      this.audio.play('click');
    });
  }

  // ---------- меню ----------

  showMenu(): void {
    // Откуда игрок вышел в меню — воронка «где выходят» (аналитика §11).
    // Читаем testid текущего экрана ДО его замены, не разбрасывая track() по
    // каждому «Меню»/«Назад»-обработчику (их десятки по всему App).
    const fromScreen = this.root.querySelector<HTMLElement>('.screen[data-testid]')?.dataset.testid;
    if (fromScreen && fromScreen !== 'screen-menu') track({ type: 'session_exit', screen: fromScreen });
    this.transitionScreen(() => this.showMenuInner());
  }

  private showMenuInner(): void {
    this.disposeActiveBoard();
    this.userPaused = false;
    this.syncAudioPause();
    this.setGameplay(false);
    this.audio.engineStop();
    this.audio.setMood(false);
    const total = totalStars(this.store.data);
    const max = LEVELS.length * 3;
    const next = nextUpgrade(total);
    const hasProgress = total > 0;
    const dailyKey = this.dailyKey();
    const weekDone = weeklyProgress(this.store.data.daily, new Date(`${dailyKey}T12:00:00`));
    const trophies = weeklyTrophies(this.store.data.daily);
    const achievementCount = unlockedAchievementKeys(this.store.data).size;
    const giftClaimed = this.store.data.lastGift === dailyKey;
    const season = currentSeason();
    const giftAmount = 2 + (season?.giftBonus ?? 0);
    const campaignDone = this.store.data.campaignDone === true;
    // Легендарный скин виден только после кампании; остальные — по звёздам.
    const visibleSkins = TARGET_SKINS.map((skin, index) => ({ skin, index })).filter(({ skin, index }) =>
      skin.elite ? campaignDone : index < 5 || total >= TARGET_SKINS[index - 1].unlockStars
    );
    const week = currentWeekKey();
    const weeklyQuests = selectWeeklyQuests(week).map((quest) => {
      const progress = weeklyQuestProgress(this.store.data.weekly, week, quest);
      const done = progress >= quest.goal;
      const claimed = isWeeklyQuestClaimed(this.store.data.weekly, week, quest.key);
      return { quest, progress, done, claimed };
    });
    this.root.innerHTML = `
      <div class="screen menu-screen" data-testid="screen-menu">
        <div class="yard-bg">${yardSVG(unlockedUpgrades(total), trophies, season?.id)}</div>
        <div class="menu-ui">
          ${season ? `<div class="season-banner" data-testid="season-banner">${t(`season.${season.id}`)}</div>` : ''}
          <h1 class="game-title"><span>${t('game.titleTop')}</span><span>${t('game.titleBottom')}</span></h1>
          <div class="menu-buttons">
            <button class="btn btn-primary btn-big" data-testid="menu-play">${
              hasProgress ? t('menu.continue') : t('menu.play')
            }</button>
            <button class="btn btn-big" data-testid="menu-levels">${t('menu.levels')}</button>
            <button class="btn btn-big btn-daily" data-testid="menu-daily">🔥 ${t('daily.button')}${
              dailyModifier(dailyKey) !== 'none' ? ' 🎯' : ''
            }${
              isDoneToday(this.store.data.daily, new Date(`${dailyKey}T12:00:00`))
                ? ` · ${t('daily.done')}`
                : currentStreak(this.store.data.daily) > 0
                  ? ` · ${t('daily.streak', { n: currentStreak(this.store.data.daily) })}`
                  : ''
            }</button>
            ${
              campaignDone
                ? `<button class="btn btn-big btn-elite" data-testid="menu-elite">🏅 ${t('elite.menu')}</button>`
                : ''
            }
            ${
              this.store.starsOf(LEVELS[LEVELS.length - 1].id) > 0
                ? `<button class="btn btn-big btn-endless" data-testid="menu-endless">${t('menu.endless')}${
                    (this.store.data.endlessBest ?? 0) > 0 ? ` · ${t('endless.best', { n: this.store.data.endlessBest ?? 0 })}` : ''
                  }</button>`
                : ''
            }
            <div class="retention-row">
              <div class="weekly-progress" data-testid="weekly-progress">${t('daily.week', {
                n: weekDone
              })}${trophies > 0 ? ` · 🏆 ${trophies}` : ''}</div>
              <button class="btn gift-btn" data-testid="menu-gift" ${giftClaimed ? 'disabled' : ''}>${
                giftClaimed
                  ? `💡 ${this.store.data.hintTokens ?? 0}`
                  : `🎁 ${t('gift.claim', { n: giftAmount })}`
              }</button>
            </div>
            <div class="menu-meta-row">
              <button class="btn" data-testid="menu-leaderboard">🏆 ${t('menu.leaderboard')}</button>
              <button class="btn" data-testid="menu-achievements" aria-label="${t(
                'achievements.title'
              )}">🏅 ${achievementCount}/${ACHIEVEMENTS.length}</button>
              <button class="btn${weeklyQuests.some((q) => q.done && !q.claimed) ? ' has-ready' : ''}" data-testid="menu-weekly" aria-label="${t(
                'weekly.title'
              )}">🎯 ${weeklyQuests.filter((q) => q.claimed).length}/${weeklyQuests.length}</button>
            </div>
          </div>
          <div class="skin-row" data-testid="skin-row">${visibleSkins.map(({ skin: s, index: i }) => {
            const unlockedSkin = s.elite ? campaignDone : total >= s.unlockStars;
            const selected = this.store.data.targetSkin === i;
            const lockTitle = s.elite ? t('skin.legendLock') : t('skin.locked', { n: s.unlockStars });
            return `<button class="skin-swatch${selected ? ' selected' : ''}${s.elite ? ' skin-elite' : ''}" data-skin="${i}"
              data-testid="skin-${i}" style="--c:${s.body}" ${unlockedSkin ? '' : 'disabled'}
              aria-label="${t(s.nameKey)}" title="${unlockedSkin ? t(s.nameKey) : lockTitle}">${
                unlockedSkin ? '' : `<span class="skin-lock">${s.elite ? '🏅' : `★${s.unlockStars}`}</span>`
              }</button>`;
          }).join('')}</div>
          <div class="menu-progress">
            <span class="stars-total" data-testid="stars-total">★ ${total} / ${max}</span>
            <span class="next-upgrade">${
              next ? t('menu.nextUpgrade', { n: next.stars }) : t('menu.fullYard')
            }</span>
          </div>
          <button class="btn menu-rules-btn" data-testid="menu-rules">${t('menu.rules')}</button>
        </div>
        <div class="menu-audio">
          ${this.soundToggleHtml('sound-toggle')}
          ${this.musicToggleHtml('music-toggle')}
          ${this.vibrationToggleHtml('vibration-toggle')}
          ${this.liveYardToggleHtml('liveyard-toggle')}
          ${this.contrastToggleHtml('contrast-toggle')}
          ${this.bellToggleHtml('bell-toggle')}
          <button class="icon-btn lang-toggle" data-testid="lang-toggle" aria-label="Language">🌐<span class="lang-code">${getLang().toUpperCase()}</span></button>
        </div>
        <div class="overlay-slot"></div>
      </div>`;
    this.q('[data-testid=menu-play]').addEventListener('click', () => {
      this.audio.play('click');
      this.startLevel(nextLevelToPlay(LEVELS, this.store.data).id);
    });
    this.q('[data-testid=menu-levels]').addEventListener('click', () => {
      this.audio.play('click');
      this.showLevels();
    });
    this.q('[data-testid=menu-daily]').addEventListener('click', () => {
      this.audio.play('click');
      void this.startDaily();
    });
    this.root.querySelector('[data-testid=menu-endless]')?.addEventListener('click', () => {
      this.audio.play('click');
      this.startEndless();
    });
    this.root.querySelector('[data-testid=menu-elite]')?.addEventListener('click', () => {
      this.audio.play('click');
      this.showEliteScreen();
    });
    this.q('[data-testid=menu-leaderboard]').addEventListener('click', () => {
      this.audio.play('click');
      void this.showLeaderboard();
    });
    this.q('[data-testid=menu-achievements]').addEventListener('click', () => {
      this.audio.play('click');
      this.showAchievements();
    });
    this.q('[data-testid=menu-weekly]').addEventListener('click', () => {
      this.audio.play('click');
      this.showWeeklyQuestsDialog(week, weeklyQuests);
    });
    this.q('[data-testid=menu-gift]').addEventListener('click', () => {
      if (!this.store.claimDailyGift(dailyKey, giftAmount)) return;
      this.audio.play('star');
      // Один переход на оба изменения: обновлённое меню и диалог поверх него
      // должны появиться синхронно, без гонки со сроками View Transition.
      this.transitionScreen(() => {
        this.showMenuInner();
        this.showGiftDialog(giftAmount);
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('.skin-swatch:not([disabled])').forEach((b) =>
      b.addEventListener('click', () => {
        const i = Number(b.dataset.skin);
        setTargetSkin(i);
        this.store.setTargetSkin(i);
        this.audio.play('click');
        this.showMenu();
      })
    );
    window.requestAnimationFrame(() => {
      this.root
        .querySelector<HTMLElement>('.skin-swatch.selected')
        ?.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
    this.wireSoundToggle(this.q('[data-testid=sound-toggle]'));
    this.wireMusicToggle(this.q('[data-testid=music-toggle]'));
    this.wireVibrationToggle(this.q('[data-testid=vibration-toggle]'));
    this.wireLiveYardToggle(this.q('[data-testid=liveyard-toggle]'));
    this.wireContrastToggle(this.q('[data-testid=contrast-toggle]'));
    const bellEl = this.root.querySelector<HTMLElement>('[data-testid=bell-toggle]');
    if (bellEl) this.wireBellToggle(bellEl);
    this.q('[data-testid=lang-toggle]').addEventListener('click', () => {
      const order = ['ru', 'en', 'tr'] as const;
      const next = order[(order.indexOf(getLang()) + 1) % order.length];
      setLang(next);
      this.store.setLang(next);
      document.title = `${t('game.titleTop')} ${t('game.titleBottom')}`;
      this.audio.play('click');
      this.showMenu();
    });
    // живой двор: обитатели отзываются на тап
    this.q('.yard-bg').addEventListener('click', (e) => {
      const g = (e.target as Element).closest<SVGGElement>('[data-tap]');
      if (!g) return;
      const inner = g.querySelector<SVGGElement>('.tap-inner') ?? g;
      inner.classList.remove('tap-anim');
      void inner.getBoundingClientRect();
      inner.classList.add('tap-anim');
      inner.addEventListener('animationend', () => inner.classList.remove('tap-anim'), { once: true });
      const sound = g.getAttribute('data-tap') as 'cluck' | 'bark' | 'meow' | 'honk';
      this.audio.play(sound);
    });
    this.q('[data-testid=menu-rules]').addEventListener('click', () => {
      this.audio.play('click');
      this.showRules();
    });
    if (this.platform.isTV) this.q<HTMLElement>('[data-testid=menu-play]').focus({ preventScroll: true });
  }

  private async showLeaderboard(): Promise<void> {
    this.disposeActiveBoard();
    this.setGameplay(false);
    this.transitionScreen(() => this.showLeaderboardShell());
    await this.loadLeaderboardContent();
  }

  private showLeaderboardShell(): void {
    this.root.innerHTML = `
      <div class="screen leaderboard-screen" data-testid="screen-leaderboard">
        <div class="panel-top">
          <button class="btn" data-testid="btn-back">${t('levels.back')}</button>
          <h2>${t('leaderboard.title')}</h2>
          <span></span>
        </div>
        <div class="leaderboard-content" data-testid="leaderboard-content">
          <div class="leaderboard-loading">${t('leaderboard.loading')}</div>
        </div>
        <button class="btn invite-btn" data-testid="btn-invite">${t('leaderboard.invite')}</button>
      </div>`;
    this.q('[data-testid=btn-back]').addEventListener('click', () => {
      this.audio.play('click');
      this.showMenu();
    });
    if (this.platform.isTV) this.q<HTMLElement>('[data-testid=btn-back]').focus({ preventScroll: true });
    this.q<HTMLButtonElement>('[data-testid=btn-invite]').addEventListener('click', async (event) => {
      this.audio.play('click');
      await this.inviteNeighbor(event.currentTarget as HTMLButtonElement);
    });
  }

  private async loadLeaderboardContent(): Promise<void> {
    const [starsSnap, streakSnap] = await Promise.all([
      this.leaderboardCache.get('yardstars'),
      this.leaderboardCache.get('dailystreak')
    ]);
    const stars = starsSnap.entries;
    const streak = streakSnap.entries;
    const myStars = starsSnap.me;
    const myStreak = streakSnap.me;
    const content = this.root.querySelector<HTMLElement>('[data-testid=leaderboard-content]');
    if (!content) return;
    const row = (r: LeaderboardEntry, suffix: string) =>
      `<li class="${r.isMe ? 'leaderboard-me' : ''}"><span class="leaderboard-rank">${r.rank}</span><span class="leaderboard-name">${
        r.isMe ? escapeHTML(t('leaderboard.you')) : escapeHTML(r.name)
      }</span><strong>${r.score}${suffix}</strong></li>`;
    const board = (title: string, rows: LeaderboardEntry[], mine: LeaderboardEntry | null, suffix: string) => {
      const mineShown = mine && rows.some((r) => r.rank === mine.rank && r.score === mine.score);
      return `
      <section class="leaderboard-board">
        <h3>${title}</h3>
        ${
          rows.length
            ? `<ol>${rows.map((r) => row(r, suffix)).join('')}${mine && !mineShown ? `<li class="leaderboard-gap">···</li>${row(mine, suffix)}` : ''}</ol>`
            : `<p>${t('leaderboard.empty')}</p>`
        }
      </section>`;
    };
    content.innerHTML =
      board(t('leaderboard.stars'), stars, myStars, ' ★') +
      board(t('leaderboard.streak'), streak, myStreak, ` ${t('leaderboard.days')}`);
  }

  private async inviteNeighbor(button: HTMLButtonElement): Promise<void> {
    const text = t('leaderboard.inviteText', { url: location.href.split('?')[0] });
    await this.shareText(text, button, t('leaderboard.invited'));
  }

  private showAchievements(): void {
    this.disposeActiveBoard();
    this.setGameplay(false);
    this.transitionScreen(() => this.showAchievementsInner());
  }

  private showAchievementsInner(): void {
    const unlocked = unlockedAchievementKeys(this.store.data);
    this.root.innerHTML = `
      <div class="screen achievements-screen" data-testid="screen-achievements">
        <div class="panel-top">
          <button class="btn" data-testid="btn-back">${t('levels.back')}</button>
          <h2>${t('achievements.title')}</h2>
          <span class="stars-total">${unlocked.size}/${ACHIEVEMENTS.length}</span>
        </div>
        <div class="achievements-grid">${ACHIEVEMENTS.map((achievement) => {
          const progress = achievementProgress(this.store.data, achievement);
          const done = unlocked.has(achievement.key);
          return `<article class="achievement-card${done ? ' done' : ''}" data-testid="achievement-${achievement.key}">
            <div class="achievement-icon">${achievement.icon}</div>
            <div class="achievement-copy"><strong>${t(`achievement.${achievement.key}.title`)}</strong>
              <span>${t(`achievement.${achievement.key}.desc`)}</span>
              <div class="achievement-track"><i style="width:${Math.round((progress / achievement.goal) * 100)}%"></i></div>
              <small>${done ? `✓ ${t('achievements.done')}` : `${progress} / ${achievement.goal}`}</small>
            </div>
          </article>`;
        }).join('')}</div>
      </div>`;
    this.q('[data-testid=btn-back]').addEventListener('click', () => {
      this.audio.play('click');
      this.showMenu();
    });
    if (this.platform.isTV) this.q<HTMLElement>('[data-testid=btn-back]').focus({ preventScroll: true });
  }

  private showGiftDialog(amount: number): void {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('data-testid', 'gift-overlay');
    overlay.innerHTML = `<div class="dialog gift-dialog"><div class="gift-big">🎁</div><h2>${t('gift.title')}</h2>
      <p>${t('gift.reward', { n: amount })}</p><button class="btn btn-primary" data-testid="gift-close">${t(
        'gift.close'
      )}</button></div>`;
    this.q('.overlay-slot').appendChild(overlay);
    overlay.querySelector('[data-testid=gift-close]')!.addEventListener('click', () => overlay.remove());
    if (this.platform.isTV) overlay.querySelector<HTMLElement>('[data-testid=gift-close]')!.focus({ preventScroll: true });
  }

  /**
   * Диалог, а не встроенный в меню блок: три интерактивные кнопки-цели
   * (44px touch target каждая) не помещаются в бюджет высоты меню на
   * маленьких портретных экранах — диалог сам умеет скроллиться.
   */
  private showWeeklyQuestsDialog(
    week: string,
    quests: { quest: ReturnType<typeof selectWeeklyQuests>[number]; progress: number; done: boolean; claimed: boolean }[]
  ): void {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('data-testid', 'weekly-overlay');
    const render = () => {
      overlay.innerHTML = `
        <div class="dialog weekly-dialog">
          <h2>${t('weekly.title')}</h2>
          <div class="weekly-quests-list">
            ${quests
              .map(
                ({ quest, progress, done, claimed }) => `
              <div class="weekly-quest${done ? ' done' : ''}" data-testid="weekly-quest-${quest.key}">
                <span class="weekly-quest-icon">${quest.icon}</span>
                <span class="weekly-quest-label">${t(`weekly.${quest.key}`)} · ${progress}/${quest.goal}</span>
                <button class="btn btn-small weekly-claim" data-testid="weekly-claim-${quest.key}"
                  data-quest="${quest.key}" ${done && !claimed ? '' : 'disabled'}>${
                  claimed ? `✓ ${t('weekly.claimed')}` : `💡 ${t('weekly.claim')}`
                }</button>
              </div>`
              )
              .join('')}
          </div>
          <button class="btn btn-primary btn-big" data-testid="weekly-close">${t('rules.close')}</button>
        </div>`;
      overlay.querySelectorAll<HTMLButtonElement>('.weekly-claim:not([disabled])').forEach((b) =>
        b.addEventListener('click', () => {
          const key = b.dataset.quest!;
          const entry = quests.find((q) => q.quest.key === key);
          if (!entry) return;
          if (!this.store.claimWeeklyQuest(week, key, entry.done, WEEKLY_QUEST_REWARD_HINTS)) return;
          entry.claimed = true;
          this.audio.play('star');
          render();
          this.q('[data-testid=menu-weekly]').textContent = `🎯 ${quests.filter((q) => q.claimed).length}/${quests.length}`;
          this.q('[data-testid=menu-weekly]').classList.toggle('has-ready', quests.some((q) => q.done && !q.claimed));
        })
      );
      overlay.querySelector('[data-testid=weekly-close]')!.addEventListener('click', () => {
        this.audio.play('click');
        overlay.remove();
      });
      if (this.platform.isTV) overlay.querySelector<HTMLElement>('[data-testid=weekly-close]')!.focus({ preventScroll: true });
    };
    render();
    this.q('.overlay-slot').appendChild(overlay);
  }

  private showRules(): void {
    const items = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<li>${t(`rules.${i}`)}</li>`).join('');
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('data-testid', 'rules-overlay');
    overlay.innerHTML = `
      <div class="dialog rules-dialog">
        <h2>${t('rules.title')}</h2>
        <ul class="rules-list">${items}</ul>
        <button class="btn btn-primary btn-big" data-testid="btn-rules-close">${t('rules.close')}</button>
      </div>`;
    this.q('.overlay-slot').appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('[data-testid=btn-rules-close]')!.addEventListener('click', () => {
      this.audio.play('click');
      close();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    if (this.platform.isTV)
      overlay.querySelector<HTMLElement>('[data-testid=btn-rules-close]')!.focus({ preventScroll: true });
  }

  // ---------- выбор уровня ----------

  showLevels(): void {
    this.transitionScreen(() => this.showLevelsInner());
  }

  private showLevelsInner(): void {
    this.disposeActiveBoard();
    this.setGameplay(false);
    const parts: string[] = [];
    const currentId = nextLevelToPlay(LEVELS, this.store.data).id;
    LEVELS.forEach((l) => {
      if ((l.id - 1) % 12 === 0) {
        const chapter = Math.floor((l.id - 1) / 12) + 1;
        const chapterLevels = LEVELS.slice((chapter - 1) * 12, chapter * 12);
        const chapterStars = chapterLevels.reduce((sum, chapterLevel) => sum + this.store.starsOf(chapterLevel.id), 0);
        parts.push(
          `<div class="chapter-header"><span>${t(`chapter.${chapter}`)}</span><small>★ ${chapterStars} / ${chapterLevels.length * 3}</small></div>`
        );
      }
      const unlocked = isLevelUnlocked(LEVELS, this.store.data, l.id);
      const stars = this.store.starsOf(l.id);
      parts.push(`
        <button class="level-card ${unlocked ? '' : 'locked'}${l.id === currentId ? ' current' : ''}" data-level="${l.id}" data-testid="level-card-${l.id}" ${l.id === currentId ? 'data-tv-default' : ''} title="${escapeHTML(levelText('name', l.name) ?? l.name)}" ${
          unlocked ? '' : 'disabled'
        }>
          ${unlocked ? levelThumbnail(l) : ''}
          <span class="level-num">${l.width > 6 ? '👑 ' : ''}${l.id}</span>
          <span class="level-stars">${
            unlocked
              ? starIcons(stars)
              : `<svg class="lock" viewBox="0 0 24 24" width="22" height="22" aria-label="Закрыт"><rect x="5" y="10.5" width="14" height="10" rx="3" fill="#a08c66"/><path d="M8 11 V7.5 a4 4 0 0 1 8 0 V11" fill="none" stroke="#a08c66" stroke-width="2.6"/></svg>`
          }</span>
        </button>`);
    });
    const cards = parts.join('');
    this.root.innerHTML = `
      <div class="screen levels-screen" data-testid="screen-levels">
        <div class="panel-top">
          <button class="btn" data-testid="btn-back">${t('levels.back')}</button>
          <h2>${t('levels.title')}</h2>
          <span class="stars-total">★ ${totalStars(this.store.data)}</span>
        </div>
        <div class="levels-grid">${cards}</div>
      </div>`;
    this.q('[data-testid=btn-back]').addEventListener('click', () => {
      this.audio.play('click');
      this.showMenu();
    });
    this.root.querySelectorAll<HTMLButtonElement>('.level-card:not(.locked)').forEach((b) =>
      b.addEventListener('click', () => {
        this.audio.play('click');
        this.startLevel(Number(b.dataset.level));
      })
    );
    window.setTimeout(() => {
      this.root.querySelector<HTMLElement>('.level-card.current')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    if (this.platform.isTV)
      this.root.querySelector<HTMLElement>('.level-card.current')?.focus({ preventScroll: true });
  }

  // ---------- игра ----------

  startLevel(id: number): void {
    const level = LEVELS.find((l) => l.id === id);
    if (!level) {
      this.showMenu();
      return;
    }
    this.store.setLastLevel(id);
    // Сюжетный босс на этом слоте: играется как многофазное событие, где
    // финальная фаза — сам уровень слота (прогресс кампании сохраняется).
    const boss = bossFor(id);
    if (boss) {
      this.startBoss(boss);
      return;
    }
    this.runLevel(level, false);
  }

  // ---------- сюжетные боссы ----------

  private levelById(id: number): LevelDef {
    return LEVELS.find((l) => l.id === id)!;
  }

  /**
   * Единая логика завершения кампании (уровень 100 — обычный или как финальный
   * босс). Помечает кампанию пройденной (идемпотентно), и при самом первом разе
   * показывает финальную сцену Высшей лиги, вернув true (вызывающий прекращает
   * обычную/боссовую победу). Повторное прохождение → false, без повторных наград.
   */
  private completeCampaignFinale(): boolean {
    const firstEver = this.store.markCampaignDone(this.dailyKey());
    if (firstEver && !this.store.data.endingSeen) {
      this.store.markEndingSeen();
      this.showCampaignEnding();
      return true;
    }
    return false;
  }

  /** Запускает босса: вступление деда → первая фаза. */
  private startBoss(def: BossLevelDef): void {
    const run = createBossRun(def);
    this.bossStartedAt = performance.now();
    this.disposeActiveBoard();
    this.setGameplay(false);
    this.audio.setMood(true);
    this.root.innerHTML = `<div class="screen boss-intro-screen" data-testid="screen-boss-intro"><div class="overlay-slot"></div></div>`;
    const overlay = document.createElement('div');
    overlay.className = 'overlay boss-intro';
    overlay.setAttribute('data-testid', 'boss-intro');
    overlay.innerHTML = `
      <div class="dialog boss-dialog">
        <div class="boss-badge">⚡</div>
        <h2 data-testid="boss-name">${t(def.nameKey)}</h2>
        <p class="boss-intro-text">${t(def.introKey)}</p>
        <button class="btn btn-primary btn-big" data-testid="boss-start" data-tv-default>${t('boss.begin')}</button>
      </div>`;
    this.q('.overlay-slot').appendChild(overlay);
    overlay.querySelector('[data-testid=boss-start]')!.addEventListener('click', () => {
      this.audio.play('click');
      this.playBossPhase(def, run);
    });
    if (this.platform.isTV) overlay.querySelector<HTMLElement>('[data-testid=boss-start]')!.focus({ preventScroll: true });
  }

  /** Играет текущую фазу босса как обычный уровень с boss-контекстом. */
  private playBossPhase(def: BossLevelDef, run: BossRun): void {
    const phase = currentPhase(run, def);
    if (!phase) {
      this.showMenu();
      return;
    }
    this.runLevel(this.levelById(phase.sourceLevelId), false, undefined, false, 'none', undefined, { def, run });
  }

  /** Фаза пройдена: сюжетная реплика, переход к следующей или финал. */
  private onBossPhaseDone(def: BossLevelDef, run: BossRun, endState: GameState): void {
    this.setGameplay(false);
    this.audio.engineStop();
    const isLast = run.phaseIndex >= def.phases.length - 1;
    track({ type: 'boss_phase_complete', levelId: def.id, phase: run.phaseIndex + 1 });
    if (isLast) {
      track({ type: 'boss_complete', levelId: def.id, timeMs: Math.round(performance.now() - this.bossStartedAt) });
      // Прогресс кампании и завершение босса — только сейчас, после полной победы.
      const finalStars = starsFor(this.levelById(def.id), endState.moves, endState.starCollected);
      this.store.recordResult(def.id, finalStars);
      this.store.markBossDone(def.id);
      // Финальный босс (слот 100) открывает Высшую лигу той же логикой, что и
      // обычный уровень 100: при первом прохождении — финальная сцена вместо
      // боссовой победы; повторно — обычная боссовая победа без повторных наград.
      if (def.id === CAMPAIGN_LAST_ID && this.completeCampaignFinale()) return;
      this.showBossVictory(def, finalStars);
      return;
    }
    // Короткий переход между фазами — без перезагрузки страницы.
    const nextRun = advancePhase(run, def);
    this.yardDirector?.react('boss-phase');
    const overlay = document.createElement('div');
    overlay.className = 'overlay boss-transition';
    overlay.setAttribute('data-testid', 'boss-transition');
    const prog = bossProgress(nextRun, def);
    overlay.innerHTML = `
      <div class="dialog boss-dialog">
        <div class="boss-badge">✓</div>
        <div class="dialog-sub" data-testid="boss-phase-cleared">${t('boss.phaseCleared', { n: run.phaseIndex + 1, m: def.phases.length })}</div>
        <p class="boss-intro-text">${currentPhase(nextRun, def)?.grandpaLineKey ? t(currentPhase(nextRun, def)!.grandpaLineKey!) : ''}</p>
        <button class="btn btn-primary btn-big" data-testid="boss-continue" data-tv-default>${t('boss.next', { n: prog.phase, m: prog.total })}</button>
      </div>`;
    this.q('.overlay-slot').appendChild(overlay);
    overlay.querySelector('[data-testid=boss-continue]')!.addEventListener('click', () => {
      this.audio.play('click');
      this.playBossPhase(def, nextRun);
    });
    if (this.platform.isTV) overlay.querySelector<HTMLElement>('[data-testid=boss-continue]')!.focus({ preventScroll: true });
  }

  /**
   * Цель фазы (например, «забрать звезду») не выполнена при выезде — не боссовая
   * реплика деда, а явный, локализованный, не зависящий от него блокирующий экран.
   */
  private showBossObjectiveUnmet(def: BossLevelDef, run: BossRun, phase: BossPhase): void {
    const key = phase.objective.requireStar ? 'boss.objectiveStarRequired' : 'boss.objectiveUnmet';
    const overlay = document.createElement('div');
    overlay.className = 'overlay boss-objective-unmet';
    overlay.setAttribute('data-testid', 'boss-objective-unmet');
    overlay.innerHTML = `
      <div class="dialog boss-dialog">
        <div class="boss-badge">★</div>
        <p class="boss-intro-text" data-testid="boss-objective-unmet-text">${t(key)}</p>
        <button class="btn btn-primary btn-big" data-testid="boss-objective-retry" data-tv-default>${t('boss.retryPhase')}</button>
      </div>`;
    this.q('.overlay-slot').appendChild(overlay);
    overlay.querySelector('[data-testid=boss-objective-retry]')!.addEventListener('click', () => {
      this.audio.play('click');
      // Полный пересбор текущей фазы (та же run/phaseIndex) — надёжнее, чем клик
      // по btn-restart: у только что выехавшей машины cur.won уже true и обычный
      // restart-гард его бы заблокировал.
      this.playBossPhase(def, run);
    });
    if (this.platform.isTV) overlay.querySelector<HTMLElement>('[data-testid=boss-objective-retry]')!.focus({ preventScroll: true });
  }

  /** Уникальная победная сцена босса. */
  private showBossVictory(def: BossLevelDef, stars: number): void {
    this.audio.play('win');
    this.vibrate([28, 45, 28, 45, 70]);
    this.yardDirector?.react('boss-win');
    const confettiColors = ['#e2574c', '#f6c445', '#45968f', '#3f7fd1', '#e88fb6'];
    const confetti = Array.from({ length: 40 }, () => {
      const c = confettiColors[Math.floor(Math.random() * confettiColors.length)];
      return `<span style="--x:${Math.round(Math.random() * 100)}%;--d:${(Math.random() * 0.6).toFixed(2)}s;--r:${Math.round(180 + Math.random() * 420)}deg;background:${c}"></span>`;
    }).join('');
    const idx = LEVELS.findIndex((l) => l.id === def.id);
    const next = idx >= 0 && idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
    const overlay = document.createElement('div');
    overlay.className = 'overlay boss-victory';
    overlay.setAttribute('data-testid', 'boss-victory');
    overlay.innerHTML = `
      <div class="confetti">${confetti}</div>
      <div class="dialog boss-dialog win-dialog">
        <div class="boss-badge boss-badge-win">🏆</div>
        <h2>${t(def.nameKey)}</h2>
        <div class="win-stars" data-testid="win-stars" data-stars="${stars}">${starIcons(stars)}</div>
        <p class="boss-victory-text" data-testid="boss-victory-text">${t(def.victoryKey)}</p>
        ${next ? `<button class="btn btn-primary btn-big" data-testid="btn-next">${t('win.next')}</button>` : ''}
        <button class="btn" data-testid="btn-win-menu">${t('win.menu')}</button>
      </div>`;
    this.q('.overlay-slot').appendChild(overlay);
    overlay.querySelectorAll('.win-stars .star.full').forEach((s, i) => {
      (s as HTMLElement).style.animationDelay = `${0.2 + i * 0.28}s`;
      s.classList.add('pop');
    });
    overlay.querySelector('[data-testid=btn-next]')?.addEventListener('click', () => {
      this.audio.play('click');
      if (next) this.startLevel(next.id);
    });
    overlay.querySelector('[data-testid=btn-win-menu]')!.addEventListener('click', () => {
      this.audio.play('click');
      this.showMenu();
    });
    if (this.platform.isTV)
      overlay.querySelector<HTMLElement>('[data-testid=btn-next], [data-testid=btn-win-menu]')!.focus({ preventScroll: true });
  }

  /** «Уровень дня»: Worker генерирует его из стабильного seed-дня. */
  async startDaily(): Promise<void> {
    if (this.dailyLoading) return;
    this.dailyLoading = true;
    const key = this.dailyKey();
    const button = this.root.querySelector<HTMLButtonElement>('[data-testid=menu-daily]');
    if (button) {
      button.disabled = true;
      button.textContent = t('daily.loading');
    }
    try {
      const level = await this.dailyLevels.get(key);
      this.runLevel(level, true, key, false, level.modifier);
    } catch (error) {
      console.error('Уровень дня не загрузился:', error);
      if (button) {
        button.disabled = false;
        button.textContent = t('daily.retry');
      }
    } finally {
      this.dailyLoading = false;
    }
  }

  /** «Бесконечный двор»: доступен после первого прохождения уровня 100. */
  startEndless(): void {
    this.endlessStreak = 0;
    void this.playNextEndless();
  }

  private async playNextEndless(): Promise<void> {
    this.disposeActiveBoard();
    this.root.innerHTML = `<div class="screen game-screen endless-loading" data-testid="screen-endless-loading">
      <div class="hint-toast">🌀 ${t('endless.loading')}</div>
    </div>`;
    const streak = this.endlessStreak;
    const seed = (Date.now() ^ (streak * 2654435761)) >>> 0;
    // Генерация синхронна, но модальный экран уже отрисован — отдаём кадр браузеру.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    try {
      const level = generateEndless(streak, seed);
      this.runLevel(level, false, undefined, true);
    } catch (error) {
      console.error('Бесконечный двор не сгенерировался:', error);
      this.showMenu();
    }
  }

  private runLevel(
    level: LevelDef,
    daily: boolean,
    dailyDate?: string,
    endless = false,
    modifier: DailyModifier = 'none',
    challenge?: EliteChallenge,
    boss?: { def: BossLevelDef; run: BossRun }
  ): void {
    this.disposeActiveBoard();
    this.userPaused = false;
    this.syncAudioPause();
    // Мастер-испытание навязывает свой модификатор (без подсказок / без отмены).
    if (challenge) modifier = challenge.modifier;
    // Отслеживаем «чистоту» прохождения для расчёта медали.
    const attempt: AttemptResult = { moves: 0, starCollected: false, usedHint: false, usedUndo: false, usedRestart: false };
    const levelStartedAt = performance.now();
    let firstMoveTracked = false;
    track({ type: 'level_start', levelId: level.id });
    if (boss && boss.run.phaseIndex === 0) track({ type: 'boss_start', levelId: boss.def.id });
    this.audio.setMood(endless || boss !== undefined || level.difficulty === 'hard');
    const isBoss = level.width > 6;
    const bossProg = boss ? bossProgress(boss.run, boss.def) : null;
    const title = boss
      ? `⚡ ${t(boss.def.nameKey)}`
      : challenge
        ? `🏅 ${t('elite.challenge')} ${challenge.id}`
        : daily
          ? `🔥 ${t('daily.title')}`
          : endless
            ? `🌀 ${t('endless.title')} · ${level.name}`
            : `${isBoss ? '👑 ' : ''}${level.id}. ${levelText('name', level.name)}`;
    const starHud = level.star ? `<span class="hud-star" data-testid="hud-star">★</span>` : '';
    this.root.innerHTML = `
      <div class="screen game-screen" data-testid="screen-game">
        <div class="hud hud-top">
          <button class="icon-btn" data-testid="btn-pause" aria-label="${t('pause.title')}">${pauseIcon}</button>
          <div class="hud-level">${title}${
            bossProg ? ` <span class="boss-phase-chip" data-testid="boss-phase">${t('boss.phase', { n: bossProg.phase, m: bossProg.total })}</span>` : ''
          }</div>
          <div class="hud-right">
            ${starHud}
            <div class="hud-moves">${t('hud.moves')} <b data-testid="hud-moves">0</b><span class="hud-par">${t('hud.goal', { n: level.par2 })}</span></div>
          </div>
        </div>
        <div class="board-host" data-testid="board-host"></div>
        <div class="hud hud-bottom">
          <button class="btn" data-testid="btn-undo" disabled ${modifier === 'noUndo' ? 'hidden' : ''}>${t('btn.undo')}</button>
          <button class="btn" data-testid="btn-restart">${t('btn.restart')}</button>
          <button class="btn" data-testid="btn-hint" ${modifier === 'noHints' ? 'hidden' : ''}>${
            !daily && !challenge && level.id >= 1 && level.id <= 3
              ? t('btn.hintFree')
              : (this.store.data.hintTokens ?? 0) > 0
                ? `💡 ${t('btn.hintTokens', { n: this.store.data.hintTokens ?? 0 })}`
                : this.freeHintsLeft > 0
                  ? t('btn.hintFree')
                  : t('btn.hintAd')
          }</button>
          <button class="btn btn-skip" data-testid="btn-skip" style="display:none">${t('btn.skipAd')}</button>
        </div>
        <div class="overlay-slot"></div>
      </div>`;

    const host = this.q('.board-host');
    const movesEl = this.q('[data-testid=hud-moves]');
    const undoBtn = this.q<HTMLButtonElement>('[data-testid=btn-undo]');
    const hudStar = level.star ? this.q('[data-testid=hud-star]') : null;

    let cur: GameState = createState(level);
    const undoStack: GameState[] = [];
    let finished = false;

    const refreshHud = () => {
      movesEl.textContent = String(cur.moves);
      undoBtn.disabled = undoStack.length === 0;
      hudStar?.classList.toggle('collected', cur.starCollected);
    };

    // детектор тупика: без ящиков любой ход обратим, уровень всегда проходим;
    // после траты ящика честно проверяем решателем
    const deadlock = { el: null as HTMLDivElement | null, timer: 0 };
    const hideDeadlock = () => {
      deadlock.el?.remove();
      deadlock.el = null;
    };
    const showDeadlock = () => {
      if (deadlock.el) return;
      const d = document.createElement('div');
      d.className = 'hint-toast deadlock-toast';
      d.setAttribute('data-testid', 'deadlock-toast');
      d.textContent = t('deadlock.warn');
      this.q('.overlay-slot').appendChild(d);
      deadlock.el = d;
    };
    const updateDeadlock = () => {
      if (!level.pieces.some((p) => p.kind === 'crate')) return;
      window.clearTimeout(deadlock.timer);
      deadlock.timer = window.setTimeout(() => {
        if (finished || cur.won) return;
        if (!cur.pieces.some((p) => p.used > 0)) {
          hideDeadlock();
          return;
        }
        const res = solve(level, { from: cur, stateLimit: 12_000 });
        if (!res.solvable && !res.exhausted) showDeadlock();
        else hideDeadlock();
      }, 250);
    };

    const bv = new BoardView(host, level, cur, {
      onPick: () => {
        this.audio.play('pick');
        this.audio.engineStart();
        this.hideOnboardingHand();
      },
      onRelease: () => this.audio.engineStop(),
      onBump: () => {
        this.audio.play('thud');
        this.vibrate(14);
        this.yardDirector?.react('collision');
      },
      onGateSwitch: () => {
        this.audio.play('switch');
        this.vibrate([18, 35, 24]);
      },
      onGateOpen: () => this.audio.play('gate'),
      onCommit: (res, piece) => {
        undoStack.push(cur);
        cur = res.state;
        if (!firstMoveTracked) {
          firstMoveTracked = true;
          track({ type: 'first_move', levelId: level.id, timeMs: Math.round(performance.now() - levelStartedAt) });
        }
        this.audio.play('move');
        this.hideOnboardingHand();
        this.store.markTutorialSeen();
        if (res.starCollected) {
          this.audio.play('star');
          this.vibrate(25);
          this.flyStarToHud();
        }
        if (res.exited) {
          this.audio.play('honk');
          this.audio.play('exitRev');
        }
        if (Math.random() < 0.25) this.audio.play('cluck');
        // Живой двор: дед комментирует самое заметное событие хода.
        if (res.starCollected) this.yardDirector?.react('star');
        else if (res.gateActivated) this.yardDirector?.react('gate');
        else if (level.pieces[piece]?.kind === 'tractor') this.yardDirector?.react('tractor');
        else if (level.id === 1 && cur.moves === 1) this.yardDirector?.react('first-move');
        refreshHud();
        updateDeadlock();
      },
      onExitDone: () => completeLevel()
    });
    // Единая точка завершения уровня (реальный выезд машины и e2e-хук ведут сюда).
    const completeLevel = (): void => {
      if (finished) return;
      if (boss) {
        const phase = currentPhase(boss.run, boss.def);
        if (phase && !bossObjectiveSatisfied(phase, cur)) {
          // Цель фазы (например, забрать звезду) не выполнена — выезд не засчитывается:
          // прогресс/награды не пишутся, фаза не продвигается. Даём перезапустить фазу.
          this.showBossObjectiveUnmet(boss.def, boss.run, phase);
          return;
        }
        finished = true;
        this.onBossPhaseDone(boss.def, boss.run, cur);
      } else if (challenge) {
        finished = true;
        this.finishEliteChallenge(challenge, { ...attempt, moves: cur.moves, starCollected: cur.starCollected });
      } else {
        finished = true;
        track({
          type: 'level_complete',
          levelId: level.id,
          moves: cur.moves,
          stars: starsFor(level, cur.moves, cur.starCollected),
          timeMs: Math.round(performance.now() - levelStartedAt)
        });
        this.finishLevel(level, cur, daily, dailyDate, endless);
      }
    };
    // Только в e2e-сборке: детерминированно «выиграть» уровень, минуя ручной
    // подбор решения многофазных пазлов. Хук лишь подставляет тестовое состояние
    // доски (opts.starCollected) — completeLevel всё равно валидирует objective
    // фазы боем реальной проверкой, обойти её нельзя. В production этот код отсутствует.
    if (import.meta.env.MODE === 'e2e') {
      (window as unknown as { __e2eWinLevel?: (opts?: { starCollected?: boolean }) => void }).__e2eWinLevel = (
        opts
      ) => {
        if (opts?.starCollected) cur = { ...cur, starCollected: true };
        completeLevel();
      };
    }
    this.activeBoard = bv;
    // «Живой двор»: дед-комментатор. Обычные уровни — да; на испытаниях лиги
    // без подсказок он всё равно уместен, но во время рекламы/паузы молчит.
    this.yardDirector = new YardDirector(this.q('.game-screen'), this.audio, {
      level: level.id,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      enabled: this.store.liveYardEnabled(),
      seen: this.store.data.grandpaSeen ?? [],
      onSeen: (id) => this.store.markGrandpaSeen(id),
      debug: this.grandpaDebug
    });
    // Реплика-встреча на старте. Если у уровня есть обучающий hint-toast (id
    // 1-6, 10, ...), он уже занимает экран текстом до ~4.8с — ждём, пока он
    // сойдёт, иначе игрок видит два конкурирующих текстовых сообщения в первую
    // секунду (реальный баг: старый комментарий обещал «не наложится», но 650мс
    // попадали прямо в окно показа toast'а). Без обучающего текста — как раньше.
    const hasOnboardingToast = !!levelText('hint', level.hint);
    window.setTimeout(
      () => {
        if (!finished) this.yardDirector?.react(level.id === 1 ? 'level-start' : (level.id - 1) % 12 === 0 ? 'chapter-start' : 'level-start');
      },
      hasOnboardingToast ? 5000 : 650
    );
    this.setGameplay(true);
    if (this.platform.isTV) bv.svg.focus({ preventScroll: true });

    undoBtn.addEventListener('click', () => {
      if (finished || cur.won) return; // не отменяем победный выезд
      const prev = undoStack.pop();
      if (!prev) return;
      attempt.usedUndo = true;
      cur = prev;
      bv.setState(prev);
      this.audio.play('undo');
      refreshHud();
      updateDeadlock();
    });
    const skipBtn = this.q<HTMLButtonElement>('[data-testid=btn-skip]');
    const refreshSkip = () => {
      skipBtn.style.display = !daily && !endless && (this.restartCounts.get(level.id) ?? 0) >= 3 ? '' : 'none';
    };
    refreshSkip();
    this.q('[data-testid=btn-restart]').addEventListener('click', () => {
      if (finished || cur.won) return;
      attempt.usedRestart = true;
      track({ type: 'level_restart', levelId: level.id, moves: cur.moves });
      undoStack.length = 0;
      cur = createState(level);
      bv.setState(cur);
      this.audio.play('click');
      refreshHud();
      hideDeadlock();
      if (!daily) {
        const count = (this.restartCounts.get(level.id) ?? 0) + 1;
        this.restartCounts.set(level.id, count);
        refreshSkip();
        if (count >= 2) this.yardDirector?.react('restart-repeat');
      }
    });
    skipBtn.addEventListener('click', async () => {
      if (finished || cur.won || skipBtn.disabled) return;
      this.audio.play('click');
      skipBtn.disabled = true;
      bv.interactive = false;
      try {
        const ok = await this.platform.showRewarded(this.adHandlers());
        if (ok) {
          finished = true;
          this.restartCounts.delete(level.id);
          this.store.recordResult(level.id, 1);
          const idx = LEVELS.findIndex((l) => l.id === level.id);
          const nxt = idx >= 0 && idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
          if (nxt) this.startLevel(nxt.id);
          else this.showMenu();
          return;
        }
      } finally {
        if (!finished) {
          bv.interactive = true;
          skipBtn.disabled = false;
        }
      }
    });
    this.q('[data-testid=btn-pause]').addEventListener('click', () => {
      if (finished || cur.won) return;
      this.audio.play('click');
      this.showPause(level, bv, daily);
    });
    const hintBtn = this.q<HTMLButtonElement>('[data-testid=btn-hint]');
    hintBtn.addEventListener('click', async () => {
      if (finished || cur.won || hintBtn.disabled) return;
      this.audio.play('click');
      hintBtn.disabled = true;
      bv.interactive = false;
      try {
        let ok = true;
        let hintSource: 'free' | 'token' | 'rewarded' = 'free';
        // Обучающие уровни кампании: подсказка бесплатна и не жжёт платный токен —
        // это часть онбординга, не рекламной/платной экономики подсказок.
        const isTutorialLevel = !daily && !challenge && level.id >= 1 && level.id <= 3;
        if (isTutorialLevel) {
          hintBtn.textContent = t('btn.hintFree');
        } else if (this.store.spendHintToken()) {
          hintSource = 'token';
          const tokens = this.store.data.hintTokens ?? 0;
          hintBtn.innerHTML =
            tokens > 0
              ? `💡 ${t('btn.hintTokens', { n: tokens })}`
              : this.freeHintsLeft > 0
                ? t('btn.hintFree')
                : t('btn.hintAd');
        } else if (this.freeHintsLeft > 0) {
          this.freeHintsLeft--;
          hintBtn.textContent = t('btn.hintAd');
        } else {
          hintSource = 'rewarded';
          ok = await this.platform.showRewarded(this.adHandlers());
        }
        if (ok) {
          attempt.usedHint = true;
          track({ type: 'hint_used', levelId: level.id, source: hintSource });
          const move = hint(level, cur);
          if (move) bv.showHint(move);
          this.yardDirector?.react('hint');
        }
      } finally {
        bv.interactive = true;
        hintBtn.disabled = false;
      }
    });

    if (this.platform.isTV) {
      const controls = document.createElement('div');
      controls.className = 'hint-toast tv-controls-toast';
      controls.setAttribute('data-testid', 'tv-controls');
      controls.textContent = t('tv.controls');
      this.q('.overlay-slot').appendChild(controls);
      window.setTimeout(() => controls.classList.add('gone'), 6800);
      window.setTimeout(() => controls.remove(), 7400);
    }

    if (daily && modifier !== 'none') {
      const banner = document.createElement('div');
      banner.className = 'hint-toast modifier-toast';
      banner.setAttribute('data-testid', 'modifier-toast');
      banner.textContent = `🎯 ${t(`daily.modifier.${modifier}`)}`;
      this.q('.overlay-slot').appendChild(banner);
      window.setTimeout(() => banner.classList.add('gone'), 5200);
      window.setTimeout(() => banner.remove(), 5800);
    }

    // обучение: короткая подсказка + стрелка на первом уровне
    const hintText = levelText('hint', level.hint);
    if (hintText) {
      const toast = document.createElement('div');
      toast.className = 'hint-toast';
      toast.setAttribute('data-testid', 'hint-toast');
      toast.textContent = hintText;
      this.q('.overlay-slot').appendChild(toast);
      window.setTimeout(() => toast.classList.add('gone'), 4200);
      window.setTimeout(() => toast.remove(), 4800);
    }
    if (level.id === 1) {
      window.setTimeout(() => {
        if (!finished && cur.moves === 0) {
          const move = hint(level, cur);
          if (move) bv.showHint(move);
        }
      }, 900);
      if (!this.store.data.tutorialSeen) this.showOnboardingHand(bv, level);
    }
  }

  /**
   * Первый в жизни игрок: подсказка направления поверх целевой машины на уровне 1.
   * Обычно — покачивающаяся рука-свайп; при `prefers-reduced-motion` глобальное
   * правило схлопывает `animation-iteration-count` до 1, из-за чего бесконечный
   * свайп-цикл рисуется один раз и застывает БЕЗ смещения (opacity:1, transform:
   * none) — направление вообще не считывается. Вместо анимации показываем
   * статичную стрелку, направленную к воротам, без анимации совсем.
   */
  private showOnboardingHand(bv: BoardView, level: LevelDef): void {
    const pieceEl = bv.svg.querySelector<SVGGElement>('[data-piece="T"]');
    if (!pieceEl) return;
    const v = { dx: level.exit.side === 'left' ? -1 : level.exit.side === 'right' ? 1 : 0, dy: level.exit.side === 'top' ? -1 : level.exit.side === 'bottom' ? 1 : 0 };
    const box = pieceEl.getBoundingClientRect();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hand = document.createElement('div');
    hand.className = reducedMotion ? 'onboarding-hand onboarding-hand-static' : 'onboarding-hand';
    hand.setAttribute('data-testid', 'onboarding-hand');
    hand.style.setProperty('--dx', `${v.dx * 46}px`);
    hand.style.setProperty('--dy', `${v.dy * 46}px`);
    hand.style.left = `${box.x + box.width * (v.dx !== 0 ? 0.3 : 0.5)}px`;
    hand.style.top = `${box.y + box.height * (v.dy !== 0 ? 0.3 : 0.5)}px`;
    const arrow = v.dx > 0 ? '➡️' : v.dx < 0 ? '⬅️' : v.dy > 0 ? '⬇️' : '⬆️';
    hand.textContent = reducedMotion ? arrow : '👆';
    document.body.appendChild(hand);
    this.onboardingHandEl = hand;
  }

  private hideOnboardingHand(): void {
    this.onboardingHandEl?.remove();
    this.onboardingHandEl = null;
  }

  /** Собранная звезда улетает с поля в HUD. */
  private flyStarToHud(): void {
    const from = this.root.querySelector('[data-testid=star]')?.getBoundingClientRect();
    const to = this.root.querySelector('[data-testid=hud-star]')?.getBoundingClientRect();
    if (!from || !to) return;
    const el = document.createElement('div');
    el.className = 'star-fly';
    el.textContent = '★';
    el.style.left = `${from.x + from.width / 2 - 22}px`;
    el.style.top = `${from.y + from.height / 2 - 22}px`;
    document.body.appendChild(el);
    void el.getBoundingClientRect();
    el.style.transform = `translate(${to.x + to.width / 2 - (from.x + from.width / 2)}px, ${
      to.y + to.height / 2 - (from.y + from.height / 2)
    }px) scale(0.55)`;
    el.style.opacity = '0.25';
    window.setTimeout(() => el.remove(), 820);
  }

  private showPause(level: LevelDef, bv: BoardView, daily = false): void {
    this.userPaused = true;
    this.syncAudioPause();
    this.setGameplay(false);
    this.audio.engineStop();
    bv.interactive = false;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('data-testid', 'pause-overlay');
    overlay.innerHTML = `
      <div class="dialog">
        <h2>${t('pause.title')}</h2>
        <div class="dialog-sub">${daily ? t('daily.title') : `${level.id}. ${levelText('name', level.name)}`}</div>
        <button class="btn btn-primary btn-big" data-testid="btn-resume">${t('pause.resume')}</button>
        <button class="btn btn-big" data-testid="btn-pause-restart">${t('pause.restart')}</button>
        <div class="dialog-row">
          ${this.soundToggleHtml('pause-sound')}
          ${this.musicToggleHtml('pause-music')}
          ${this.vibrationToggleHtml('pause-vibration')}
          <button class="btn" data-testid="btn-exit-menu">${t('pause.menu')}</button>
        </div>
      </div>`;
    this.q('.overlay-slot').appendChild(overlay);
    this.wireSoundToggle(overlay.querySelector('[data-testid=pause-sound]')!);
    this.wireMusicToggle(overlay.querySelector('[data-testid=pause-music]')!);
    this.wireVibrationToggle(overlay.querySelector('[data-testid=pause-vibration]')!);
    overlay.querySelector('[data-testid=btn-resume]')!.addEventListener('click', () => {
      this.audio.play('click');
      this.userPaused = false;
      this.syncAudioPause();
      overlay.remove();
      bv.interactive = true;
      this.setGameplay(true);
      if (this.platform.isTV) bv.svg.focus({ preventScroll: true });
    });
    overlay.querySelector('[data-testid=btn-pause-restart]')!.addEventListener('click', () => {
      this.audio.play('click');
      if (daily) void this.startDaily();
      else {
        this.restartCounts.set(level.id, (this.restartCounts.get(level.id) ?? 0) + 1);
        this.startLevel(level.id);
      }
    });
    overlay.querySelector('[data-testid=btn-exit-menu]')!.addEventListener('click', () => {
      this.audio.play('click');
      this.showMenu();
    });
    if (this.platform.isTV)
      overlay.querySelector<HTMLElement>('[data-testid=btn-resume]')!.focus({ preventScroll: true });
  }

  private finishLevel(level: LevelDef, endState: GameState, daily = false, dailyDate?: string, endless = false): void {
    if (endless) {
      this.finishEndless(level, endState);
      return;
    }
    this.setGameplay(false);
    this.audio.engineStop();
    this.vibrate([28, 45, 28]);
    const stars = starsFor(level, endState.moves, endState.starCollected);
    // Дед реагирует на победу: перебор ходов — поворчит, три звезды — похвалит.
    this.yardDirector?.react(
      stars >= 3 ? 'win-perfect' : endState.moves > level.par2 + 4 ? 'many-moves' : 'win'
    );
    const achievementsBefore = unlockedAchievementKeys(this.store.data);
    const before = totalStars(this.store.data);
    let unlocked: ReturnType<typeof newlyUnlocked> = [];
    let justMastered = false;
    let dailyStreak = 0;
    let weeklyCup = false;
    this.store.recordWeeklyEvent(currentWeekKey(), 'win', 1);
    if (stars === 3) this.store.recordWeeklyEvent(currentWeekKey(), 'perfect', 1);
    if (daily) {
      const previousTrophies = weeklyTrophies(this.store.data.daily);
      const newDaily = advanceStreak(this.store.data.daily, dailyDate ?? this.dailyKey());
      this.store.setDaily(newDaily);
      dailyStreak = newDaily.streak;
      weeklyCup = weeklyTrophies(newDaily) > previousTrophies;
      void this.platform.submitScore('dailystreak', newDaily.streak);
      this.leaderboardCache.invalidate('dailystreak');
    } else {
      const improved = this.store.recordResult(level.id, stars);
      const after = totalStars(this.store.data);
      unlocked = newlyUnlocked(before, after);
      if (improved) {
        void this.platform.submitScore('yardstars', after);
        this.leaderboardCache.invalidate('yardstars');
      }
      const maxTotal = LEVELS.length * 3;
      justMastered = before < maxTotal && after === maxTotal;
      if (justMastered) this.vibrate([20, 40, 20, 40, 60]);
      // после пятого пройденного уровня один раз предлагаем оценить игру
      if (level.id >= 5 && !this.store.data.reviewAsked) {
        window.setTimeout(async () => {
          if (await this.platform.requestReview()) this.store.markReviewAsked();
        }, 1600);
      }
    }
    // Финал кампании: первое прохождение уровня 100 открывает Высшую лигу.
    // При самом первом разе показываем отдельную финальную сцену вместо обычной
    // победы; повторно — обычная победа с пометкой «лига уже открыта».
    if (!daily && level.id === CAMPAIGN_LAST_ID && this.completeCampaignFinale()) return;
    const newAchievements = ACHIEVEMENTS.filter(
      (achievement) =>
        !achievementsBefore.has(achievement.key) && unlockedAchievementKeys(this.store.data).has(achievement.key)
    );
    this.audio.play('win');

    const idx = daily ? -1 : LEVELS.findIndex((l) => l.id === level.id);
    const next = !daily && idx >= 0 && idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
    const starNote = level.star
      ? endState.starCollected
        ? `<div class="win-note ok">${t('win.starOk')}</div>`
        : `<div class="win-note">${t('win.starMissed')}</div>`
      : '';
    const upgradeNote = unlocked.length
      ? unlocked
          .map((u) => `<div class="win-upgrade" data-testid="win-upgrade">🎉 ${t(`upgrade.${u.key}`)}</div>`)
          .join('')
      : '';
    const masterNote = justMastered ? `<div class="win-master" data-testid="win-master">${t('win.master')}</div>` : '';
    const chapterNote =
      !daily && level.width > 6
        ? `<div class="win-master chapter-complete" data-testid="win-chapter">${t('win.chapter', {
            n: Math.ceil(level.id / 12)
          })}</div>`
        : '';
    const eliteReplayNote =
      !daily && level.id === CAMPAIGN_LAST_ID
        ? `<div class="win-note ok" data-testid="win-elite-open">🏅 ${t('elite.alreadyOpen')}</div>`
        : '';
    const dailyNote = daily
      ? `<div class="win-upgrade" data-testid="win-daily-streak">${t('daily.winStreak', { n: dailyStreak })}</div>
         ${weeklyCup ? `<div class="win-master" data-testid="win-weekly-cup">${t('daily.weeklyCup')}</div>` : ''}`
      : '';
    const achievementNote = newAchievements
      .map(
        (achievement) =>
          `<div class="win-achievement" data-testid="win-achievement">${achievement.icon} ${t(
            'achievements.unlocked'
          )}: ${t(`achievement.${achievement.key}.title`)}</div>`
      )
      .join('');
    const confettiColors = ['#e2574c', '#f6c445', '#45968f', '#3f7fd1', '#e88fb6'];
    const confetti = Array.from({ length: justMastered ? 44 : level.width > 6 ? 34 : 20 }, () => {
      const c = confettiColors[Math.floor(Math.random() * confettiColors.length)];
      return `<span style="--x:${Math.round(Math.random() * 100)}%;--d:${(Math.random() * 0.6).toFixed(2)}s;--r:${Math.round(
        180 + Math.random() * 420
      )}deg;background:${c}"></span>`;
    }).join('');
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('data-testid', 'win-overlay');
    overlay.innerHTML = `
      <div class="confetti">${confetti}</div>
      <div class="dialog win-dialog">
        <h2>${t('win.title')}</h2>
        <div class="win-stars" data-testid="win-stars" data-stars="${stars}">${starIcons(stars)}</div>
        <div class="dialog-sub">${t('win.stats', { moves: endState.moves, par: level.par })}${
          endState.moves <= level.par ? t('win.perfect') : ''
        }</div>
        ${starNote}
        ${masterNote}
        ${chapterNote}
        ${eliteReplayNote}
        ${dailyNote}
        ${upgradeNote}
        ${achievementNote}
        <button class="btn share-btn" data-testid="btn-share">↗ ${t('daily.share')}</button>
        ${
          next
            ? `<button class="btn btn-primary btn-big" data-testid="btn-next">${t('win.next')}</button>`
            : daily
              ? `<button class="btn btn-primary btn-big" data-testid="btn-final-menu">${t('win.menu')}</button>`
              : `<div class="win-note ok">${t('win.allDone')}</div><button class="btn btn-primary btn-big" data-testid="btn-final-menu">${t('win.menu')}</button>`
        }
        <div class="dialog-row">
          <button class="btn" data-testid="btn-again">${t('win.again')}</button>
          ${next ? `<button class="btn" data-testid="btn-win-menu">${t('win.menu')}</button>` : ''}
        </div>
      </div>`;
    this.q('.overlay-slot').appendChild(overlay);
    const starEls = overlay.querySelectorAll('.win-stars .star.full');
    starEls.forEach((s, i) => {
      (s as HTMLElement).style.animationDelay = `${0.2 + i * 0.28}s`;
      s.classList.add('pop');
    });

    overlay.querySelector<HTMLButtonElement>('[data-testid=btn-next]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      if (button.disabled) return;
      button.disabled = true;
      this.audio.play('click');
      this.winsSinceAd++;
      const adConfig = this.platform.config;
      const canShowAd =
        level.id >= adConfig.interstitialMinLevel &&
        performance.now() - this.sessionStartedAt >= adConfig.interstitialMinSessionMs;
      if (canShowAd && this.winsSinceAd >= adConfig.interstitialEvery) {
        this.winsSinceAd = 0;
        await this.platform.showInterstitial(this.adHandlers());
      }
      if (next) this.startLevel(next.id);
      else button.disabled = false;
    });
    overlay.querySelector<HTMLButtonElement>('[data-testid=btn-share]')?.addEventListener('click', async (event) => {
      this.audio.play('click');
      const text = daily
        ? t('daily.shareText', {
            date: dailyDate ?? this.dailyKey(),
            moves: endState.moves,
            par: level.par,
            stars: '★'.repeat(stars) + '☆'.repeat(3 - stars),
            streak: dailyStreak
          })
        : t('win.shareText', {
            level: levelText('name', level.name) ?? level.name,
            moves: endState.moves,
            par: level.par,
            stars: '★'.repeat(stars) + '☆'.repeat(3 - stars)
          });
      await this.shareText(text, event.currentTarget as HTMLButtonElement, t('daily.shared'));
    });
    overlay.querySelector('[data-testid=btn-again]')?.addEventListener('click', () => {
      this.audio.play('click');
      if (daily) void this.startDaily();
      else this.startLevel(level.id);
    });
    overlay.querySelector('[data-testid=btn-win-menu]')?.addEventListener('click', () => {
      this.audio.play('click');
      this.showMenu();
    });
    overlay.querySelector('[data-testid=btn-final-menu]')?.addEventListener('click', () => {
      this.audio.play('click');
      this.showMenu();
    });
    if (this.platform.isTV)
      overlay.querySelector<HTMLElement>('[data-testid=btn-next], [data-testid=btn-final-menu]')?.focus({ preventScroll: true });
  }

  private finishEndless(level: LevelDef, endState: GameState): void {
    this.setGameplay(false);
    this.audio.engineStop();
    this.vibrate([28, 45, 28]);
    this.endlessStreak++;
    this.store.recordWeeklyEvent(currentWeekKey(), 'endless', this.endlessStreak);
    const stars = starsFor(level, endState.moves, endState.starCollected);
    const achievementsBefore = unlockedAchievementKeys(this.store.data);
    const isNewBest = this.store.recordEndless(this.endlessStreak);
    const newAchievements = ACHIEVEMENTS.filter(
      (achievement) =>
        !achievementsBefore.has(achievement.key) && unlockedAchievementKeys(this.store.data).has(achievement.key)
    );
    this.audio.play('win');
    const achievementNote = newAchievements
      .map(
        (achievement) =>
          `<div class="win-achievement" data-testid="win-achievement">${achievement.icon} ${t(
            'achievements.unlocked'
          )}: ${t(`achievement.${achievement.key}.title`)}</div>`
      )
      .join('');
    const confettiColors = ['#e2574c', '#f6c445', '#45968f', '#3f7fd1', '#e88fb6'];
    const confetti = Array.from({ length: 20 }, () => {
      const c = confettiColors[Math.floor(Math.random() * confettiColors.length)];
      return `<span style="--x:${Math.round(Math.random() * 100)}%;--d:${(Math.random() * 0.6).toFixed(2)}s;--r:${Math.round(
        180 + Math.random() * 420
      )}deg;background:${c}"></span>`;
    }).join('');
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('data-testid', 'win-overlay');
    overlay.innerHTML = `
      <div class="confetti">${confetti}</div>
      <div class="dialog win-dialog">
        <h2>${t('win.title')}</h2>
        <div class="win-stars" data-testid="win-stars" data-stars="${stars}">${starIcons(stars)}</div>
        <div class="dialog-sub">${t('win.stats', { moves: endState.moves, par: level.par })}${
          endState.moves <= level.par ? t('win.perfect') : ''
        }</div>
        <div class="win-upgrade" data-testid="endless-streak">🌀 ${t('endless.streak', { n: this.endlessStreak })} · ${t('endless.best', { n: this.store.data.endlessBest ?? 0 })}</div>
        ${isNewBest ? `<div class="win-master" data-testid="endless-new-best">${t('endless.newBest')}</div>` : ''}
        ${achievementNote}
        <button class="btn share-btn" data-testid="btn-share">↗ ${t('daily.share')}</button>
        <button class="btn btn-primary btn-big" data-testid="btn-next">${t('endless.continue')}</button>
        <div class="dialog-row">
          <button class="btn" data-testid="btn-win-menu">${t('endless.stop')}</button>
        </div>
      </div>`;
    this.q('.overlay-slot').appendChild(overlay);
    overlay.querySelectorAll('.win-stars .star.full').forEach((s, i) => {
      (s as HTMLElement).style.animationDelay = `${0.2 + i * 0.28}s`;
      s.classList.add('pop');
    });
    overlay.querySelector<HTMLButtonElement>('[data-testid=btn-next]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      if (button.disabled) return;
      button.disabled = true;
      this.audio.play('click');
      this.winsSinceAd++;
      const adConfig = this.platform.config;
      const canShowAd =
        performance.now() - this.sessionStartedAt >= adConfig.interstitialMinSessionMs;
      if (canShowAd && this.winsSinceAd >= adConfig.interstitialEvery) {
        this.winsSinceAd = 0;
        await this.platform.showInterstitial(this.adHandlers());
      }
      void this.playNextEndless();
    });
    overlay.querySelector<HTMLButtonElement>('[data-testid=btn-share]')?.addEventListener('click', async (event) => {
      this.audio.play('click');
      const text = t('win.shareText', {
        level: t('endless.title'),
        moves: endState.moves,
        par: level.par,
        stars: '★'.repeat(stars)
      });
      await this.shareText(text, event.currentTarget as HTMLButtonElement, t('daily.shared'));
    });
    overlay.querySelector('[data-testid=btn-win-menu]')?.addEventListener('click', () => {
      this.audio.play('click');
      this.showMenu();
    });
    if (this.platform.isTV)
      overlay.querySelector<HTMLElement>('[data-testid=btn-next]')?.focus({ preventScroll: true });
  }

  // ---------- Высшая лига ----------

  /** Финальная сцена кампании (один раз). Вход в лигу / возврат во двор. */
  private showCampaignEnding(): void {
    this.disposeActiveBoard();
    this.setGameplay(false);
    this.audio.play('win');
    this.audio.setMood(false);
    this.root.innerHTML = `<div class="screen ending-screen" data-testid="screen-ending"><div class="overlay-slot"></div></div>`;
    showCampaignEnding(this.q('.overlay-slot'), t, this.platform.isTV, {
      onEnterLeague: () => {
        this.audio.play('click');
        this.showEliteScreen();
      },
      onReturn: () => {
        this.audio.play('click');
        this.showMenu();
      },
      onBeat: () => this.audio.play('star')
    });
  }

  showEliteScreen(): void {
    this.transitionScreen(() => this.showEliteInner());
  }

  private showEliteInner(): void {
    this.disposeActiveBoard();
    this.setGameplay(false);
    const points = elitePoints(this.store.data);
    const rank = rankFor(points);
    const nx = nextRank(points);
    const done = medaledCount(this.store.data);
    const cards = ELITE_CHALLENGES.map((c) => {
      const medal = medalOf(this.store.data, c.id);
      const level = sourceLevel(c);
      const mod = c.modifier !== 'none' ? `<span class="elite-mod">${t(`elite.mod.${c.modifier}`)}</span>` : '';
      return `
        <button class="elite-card${medal ? ' medaled' : ''}" data-testid="elite-card-${c.id}" data-challenge="${c.id}">
          <span class="elite-card-medal">${MEDAL_ICON[medal] || '·'}</span>
          <span class="elite-card-num">${t('elite.challenge')} ${c.id}</span>
          <span class="elite-card-src">${escapeHTML(levelText('name', level.name) ?? level.name)}</span>
          ${mod}
        </button>`;
    }).join('');
    this.root.innerHTML = `
      <div class="screen elite-screen" data-testid="screen-elite">
        <div class="panel-top">
          <button class="btn" data-testid="btn-back">${t('levels.back')}</button>
          <h2>${t('elite.title')}</h2>
          <span></span>
        </div>
        <div class="elite-status" data-testid="elite-status">
          <div class="elite-rank"><span class="elite-rank-name" data-testid="elite-rank">${t(`rank.${rank.key}`)}</span>
            <span class="elite-rank-sub">${
              nx ? t('elite.nextRank', { rank: t(`rank.${nx.rank.key}`), n: nx.remaining }) : t('elite.maxRank')
            }</span></div>
          <div class="elite-figures">
            <span data-testid="elite-points">🏅 ${t('elite.points')}: ${points}</span>
            <span>🎖️ ${t('elite.medals')}: ${done}/${ELITE_CHALLENGES.length}</span>
            ${(this.store.data.endlessBest ?? 0) > 0 ? `<span>🌀 ${t('elite.bestEndless', { n: this.store.data.endlessBest ?? 0 })}</span>` : ''}
          </div>
        </div>
        <h3 class="elite-section">${t('elite.challenges')}</h3>
        <div class="elite-grid">${cards}</div>
      </div>`;
    this.q('[data-testid=btn-back]').addEventListener('click', () => {
      this.audio.play('click');
      this.showMenu();
    });
    this.root.querySelectorAll<HTMLButtonElement>('.elite-card').forEach((b) =>
      b.addEventListener('click', () => {
        this.audio.play('click');
        this.startEliteChallenge(Number(b.dataset.challenge));
      })
    );
    // Короткое объяснение при первом заходе (пока нет ни одной медали).
    if (done === 0) this.showEliteIntro();
    if (this.platform.isTV) this.q<HTMLElement>('[data-testid=btn-back]').focus({ preventScroll: true });
  }

  private showEliteIntro(): void {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('data-testid', 'elite-intro');
    overlay.innerHTML = `
      <div class="dialog elite-intro-dialog">
        <h2>${t('elite.intro.title')}</h2>
        <ul class="rules-list">
          <li>${t('elite.intro.1')}</li>
          <li>${t('elite.intro.2')}</li>
          <li>${t('elite.intro.3')}</li>
        </ul>
        <button class="btn btn-primary btn-big" data-testid="elite-intro-close">${t('rules.close')}</button>
      </div>`;
    this.q('.elite-screen').appendChild(overlay);
    overlay.querySelector('[data-testid=elite-intro-close]')!.addEventListener('click', () => {
      this.audio.play('click');
      overlay.remove();
      if (this.platform.isTV) this.focusTVDefault(true);
    });
    if (this.platform.isTV) overlay.querySelector<HTMLElement>('[data-testid=elite-intro-close]')!.focus({ preventScroll: true });
  }

  private startEliteChallenge(id: number): void {
    const challenge = ELITE_CHALLENGES.find((c) => c.id === id);
    if (!challenge) {
      this.showEliteScreen();
      return;
    }
    this.runLevel(sourceLevel(challenge), false, undefined, false, challenge.modifier, challenge);
  }

  private finishEliteChallenge(challenge: EliteChallenge, attempt: AttemptResult): void {
    this.setGameplay(false);
    this.audio.engineStop();
    const earned = medalForAttempt(challenge, attempt);
    const rankBefore = rankFor(elitePoints(this.store.data));
    const { previous, next } = this.store.recordEliteMedal(challenge.id, earned);
    const improved = next > previous;
    const points = elitePoints(this.store.data);
    const rank = rankFor(points);
    const rankUp = rank.key !== rankBefore.key;
    this.audio.play(earned === 3 ? 'win' : earned > 0 ? 'star' : 'thud');
    this.vibrate(earned > 0 ? [28, 45, 28] : 14);

    const medalNow = next as Medal;
    const idx = ELITE_CHALLENGES.findIndex((c) => c.id === challenge.id);
    const nextCh = idx >= 0 && idx < ELITE_CHALLENGES.length - 1 ? ELITE_CHALLENGES[idx + 1] : null;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('data-testid', 'elite-result');
    overlay.innerHTML = `
      <div class="dialog elite-result-dialog">
        <div class="elite-result-medal" data-testid="elite-result-medal" data-medal="${medalNow}">${MEDAL_ICON[medalNow] || '—'}</div>
        <h2>${earned > 0 ? t('elite.result.title') : t('win.starMissed')}</h2>
        <div class="dialog-sub">${
          improved ? t('elite.result.newMedal', { medal: t(MEDAL_KEY[medalNow]) }) : t('elite.result.kept', { medal: t(MEDAL_KEY[medalNow]) })
        }</div>
        ${improved ? `<div class="win-upgrade">${t('elite.result.improved')}</div>` : ''}
        <div class="win-note">🏅 ${t('elite.points')}: ${points}</div>
        ${rankUp ? `<div class="win-master" data-testid="elite-rankup">${t('elite.result.rankUp', { rank: t(`rank.${rank.key}`) })}</div>` : ''}
        <button class="btn btn-primary btn-big" data-testid="elite-retry">${t('win.again')}</button>
        <div class="dialog-row">
          ${nextCh ? `<button class="btn" data-testid="elite-next">${t('win.next')}</button>` : ''}
          <button class="btn" data-testid="elite-back">${t('elite.menu')}</button>
        </div>
      </div>`;
    this.q('.overlay-slot').appendChild(overlay);
    overlay.querySelector('[data-testid=elite-retry]')!.addEventListener('click', () => {
      this.audio.play('click');
      this.startEliteChallenge(challenge.id);
    });
    overlay.querySelector('[data-testid=elite-next]')?.addEventListener('click', () => {
      this.audio.play('click');
      if (nextCh) this.startEliteChallenge(nextCh.id);
    });
    overlay.querySelector('[data-testid=elite-back]')!.addEventListener('click', () => {
      this.audio.play('click');
      this.showEliteScreen();
    });
    if (this.platform.isTV) overlay.querySelector<HTMLElement>('[data-testid=elite-retry]')!.focus({ preventScroll: true });
  }

  private async shareText(text: string, button: HTMLButtonElement, doneLabel: string): Promise<void> {
    try {
      if (navigator.share) {
        await navigator.share({ title: `${t('game.titleTop')} ${t('game.titleBottom')}`, text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        return;
      }
      button.textContent = `✓ ${doneLabel}`;
    } catch {
      // Закрытый системный share-диалог не считается ошибкой игры.
    }
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    const el = this.root.querySelector<T>(sel);
    if (!el) throw new Error(`не найден элемент ${sel}`);
    return el;
  }
}
