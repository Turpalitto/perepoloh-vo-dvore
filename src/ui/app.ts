/**
 * Экраны и игровой контроллер. Никакой игровой логики —
 * только связывание core, BoardView, платформы и сохранений.
 */
import type { LevelDef } from '../core/types';
import {
  CAMPAIGN_LAST_ID,
  LEVELS,
  campaignPositionOf,
  chapterLevels,
  chapterOfPosition,
  isChapterEnd,
  isChapterStart
} from '../game/campaign';
import { GameState, createState, starsFor } from '../core/game';
import { track } from '../game/analytics';
import type { RewardedContext } from '../game/analytics';
import { hint, solve } from '../core/solver';
import { ACHIEVEMENTS, achievementProgress, unlockedAchievementKeys } from '../game/achievements';
import type { GameAudio } from '../game/audio';
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
import { SessionStats } from '../game/session-stats';
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
  ENDLESS_UNLOCK_AT,
  campaignNumber,
  completedCampaignLevels,
  endlessAccess,
  isLevelUnlocked,
  newlyUnlocked,
  nextLevelToPlay,
  nextUpgrade,
  unlockedUpgrades,
  yardMilestone
} from '../game/progression';
import { SaveStore, totalStars } from '../game/save';
import {
  type AttemptResult,
  type Medal,
  elitePoints,
  goldCount,
  medalForAttempt,
  medalOf,
  medaledCount,
  nextRank,
  rankFor
} from '../game/elite';
import {
  DIVISIONS,
  DIVISION_UNLOCK_MEDALS,
  ELITE_CHALLENGES,
  type EliteChallenge,
  campaignImpliedMedals,
  challengeUnlocked,
  originLevel,
  divisionMedals,
  divisionOf,
  divisionUnlocked,
  sourceLevel
} from '../levels/elite-challenges';
import { type RuleModifier, blocksHints, blocksUndo } from '../game/modifiers';
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
import { confettiHtml } from './confetti';
import { SettingsToggles } from './toggles';
import { TVNavigator } from './tv-navigation';
import { pickWeeklyChallenge, weeklyScore } from '../game/elite-weekly';
import { wireDialog, type DialogOptions } from './dialog';

/**
 * Уровни, где подсказка бесплатна и не жжёт платный токен — не только
 * первые три онбординговых, но и вступление в каждую новую механику по всей
 * кампании. Раньше страховка снималась разом после уровня 3, и игрок, только
 * что впервые увидевший лёд/кур/held-кнопку на уровне 17/105/109/113, платил
 * токеном за подсказку по правилу, которому игра ещё не успела научить.
 * Список — id уровней с `role: 'tutorial'` плюс 17 (кнопка ворот, единственная
 * механика без выделенной мини-главы).
 */
const FREE_HINT_LEVEL_IDS = new Set([1, 2, 3, 17, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116]);

/**
 * Жёсткий потолок interstitial за сессию. README обещает «не более 11 за
 * полную кампанию»; без этой константы лимит существовал только арифметикой
 * дефолтов каденса, а ошибка в Remote Config (например `interstitial_every=2`)
 * давала десятки показов за сессию.
 */
const MAX_INTERSTITIALS_PER_SESSION = 11;

const MEDAL_ICON: Record<Medal, string> = { 0: '', 1: '🥉', 2: '🥈', 3: '🥇' };
const MEDAL_KEY: Record<Medal, string> = { 0: 'medal.none', 1: 'medal.bronze', 2: 'medal.silver', 3: 'medal.gold' };

/**
 * Три порога испытания текстом. Ключи для них лежали в словаре, но нигде не
 * выводились: игрок видел медаль и не видел, чего не хватило до следующей.
 * Формулировка зависит от данных уровня — звезда требуется не везде, запрет
 * отмены есть не у всех золот.
 */
function eliteGoalRows(challenge: EliteChallenge): Array<{ medal: Medal; text: string }> {
  return [
    {
      medal: 3,
      text: challenge.gold.noUndo
        ? t('elite.goalGoldNoUndo', { n: challenge.gold.maxMoves })
        : t('elite.goalGold', { n: challenge.gold.maxMoves })
    },
    {
      medal: 2,
      text: challenge.silver.requireStar
        ? t('elite.goalSilver', { n: challenge.silver.maxMoves })
        : t('elite.goalSilverPlain', { n: challenge.silver.maxMoves })
    },
    { medal: 1, text: t('elite.goalBronze', { n: challenge.bronze.maxMoves }) }
  ];
}

const pauseIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor"/></svg>`;
const backIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M14 5 L7 12 L14 19 M7.5 12 H20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const contrastIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 3 a9 9 0 0 1 0 18 Z" fill="currentColor"/></svg>`;
const settingsIcon = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5 7 7M17 17l1.5 1.5M18.5 5.5 17 7M7 17l-1.5 1.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="7.1" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

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
  private toggles: SettingsToggles;
  private tv: TVNavigator;
  private winsSinceAd = 0;
  private interstitialsShown = 0;
  private inGameplay = false;
  private platformPaused = false;
  private userPaused = false;
  private gameplayAtPlatformPause = false;
  private adPauseDepth = 0;
  private readonly sessionStartedAt = performance.now();
  private freeHintsLeft: number;
  private readonly dailyLevels = new DailyLevelService();
  private dailyLoading = false;
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
  /** Счётчики воронки за сессию (номер уровня и попытки) — см. session-stats.ts. */
  private readonly sessionStats = new SessionStats();
  /** Неделя, попытка которой сейчас играется (недельный чемпионат). */
  private weeklyRunWeek: string | null = null;
  /** Один запрос на таблицу лидерборда за раз (TTL 45с) — см. leaderboard-cache.ts. */
  private readonly leaderboardCache: LeaderboardCache;

  constructor(
    private readonly platform: Platform,
    private readonly store: SaveStore,
    private readonly audio: GameAudio
  ) {
    this.toggles = new SettingsToggles({ audio, store, vibrate: (pattern) => this.vibrate(pattern) });
    this.leaderboardCache = createLeaderboardCache((board) => this.platform.getLeaderboardSnapshot(board));
    this.root = document.getElementById('app')!;
    this.tv = new TVNavigator({
      root: this.root,
      overlaySlot: () => this.q('.overlay-slot'),
      isTV: () => platform.isTV,
      requestFullscreen: () => void platform.requestFullscreen(),
      exit: () => void platform.exit()
    });
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
    this.platform.setBackHandler(() => this.tv.handleBack());
    this.tv.attach();
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

  /**
   * Единственная точка показа rewarded: одно предложение — ровно одно
   * завершающее событие (completed при выданной награде, closed иначе).
   * Расставлять эти три события по местам вызова нельзя: воронка разъезжается
   * при первом же новом стоке.
   */
  private async showRewardedFor(context: RewardedContext, levelId: number): Promise<boolean> {
    track({ type: 'rewarded_offer_shown', context, levelId });
    const ok = await this.platform.showRewarded(this.adHandlers());
    track({ type: ok ? 'rewarded_completed' : 'rewarded_closed', context, levelId });
    return ok;
  }

  /**
   * Interstitial всегда через эту обёртку — иначе показ не попадёт в воронку.
   * Событие показа отправляется ПОСЛЕ платформы и по её ответу: Яндекс закрывает
   * рекламу и когда она не показана (слишком частые вызовы, offline, нет SDK),
   * поэтому «вызвали» и «показали» разведены.
   */
  private async showInterstitialTracked(levelId: number): Promise<boolean> {
    track({ type: 'interstitial_requested', levelId });
    const shown = await this.platform.showInterstitial(this.adHandlers());
    track({ type: shown ? 'interstitial_shown' : 'interstitial_not_shown', levelId });
    return shown;
  }

  /**
   * Единственная точка решения «показывать ли interstitial». Обе кнопки
   * «Далее» (кампания и endless) проходят через неё: каденс, пороги сессии
   * и жёсткий кап сессии применяются одинаково. `minLevelOk` — отдельный
   * гейт позиции: у endless его нет, у кампании он считается по позиции,
   * а не по id (см. комментарий в месте вызова).
   */
  private async maybeShowInterstitial(levelId: number, minLevelOk: boolean): Promise<void> {
    this.winsSinceAd++;
    if (!minLevelOk) return;
    const adConfig = this.platform.config;
    if (performance.now() - this.sessionStartedAt < adConfig.interstitialMinSessionMs) return;
    if (this.winsSinceAd < adConfig.interstitialEvery) return;
    if (this.interstitialsShown >= MAX_INTERSTITIALS_PER_SESSION) {
      track({ type: 'interstitial_capped', levelId });
      return;
    }
    this.winsSinceAd = 0;
    const shown = await this.showInterstitialTracked(levelId);
    if (shown) this.interstitialsShown++;
  }

  /**
   * Роль/фокус/ловушка Tab для модальных оверлеев. Тонкая обёртка над
   * wireDialog из ui/dialog.ts — здесь только чтобы не импортировать её
   * в каждом методе экранов.
   */
  private wireDialog(overlay: HTMLElement, opts: DialogOptions = {}): void {
    wireDialog(overlay, opts);
  }

  private dailyKey(): string {
    return todayKey(new Date(this.platform.serverTime()));
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

  /** Пункт настроек: иконка-кнопка + короткая видимая подпись (мобильный UX без tooltip). */
  private settingsItem(control: string, label: string): string {
    if (!control) return '';
    return `<div class="settings-item">${control}<span class="settings-label">${label}</span></div>`;
  }

  /** Гараж: отдельный экран выбора скинов вместо ленты на главном меню. */
  private showGarage(): void {
    const total = totalStars(this.store.data);
    const campaignDone = this.store.data.campaignDone === true;
    // Легендарный скин виден только после кампании; остальные — по звёздам.
    const visibleSkins = TARGET_SKINS.map((skin, index) => ({ skin, index })).filter(({ skin, index }) =>
      skin.elite ? campaignDone : index < 5 || total >= TARGET_SKINS[index - 1].unlockStars
    );
    const selectedIndex = this.store.data.targetSkin ?? 0;
    const selectedSkin = TARGET_SKINS[selectedIndex] ?? TARGET_SKINS[0];
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('data-testid', 'garage-overlay');
    overlay.innerHTML = `
      <div class="dialog garage-dialog">
        <h2>${t('garage.title')}</h2>
        <div class="dialog-sub" data-testid="garage-selected">${t(selectedSkin.nameKey)}</div>
        <div class="skin-row garage-grid" data-testid="skin-row">${visibleSkins
          .map(({ skin: s, index: i }) => {
            const unlockedSkin = s.elite ? campaignDone : total >= s.unlockStars;
            const selected = selectedIndex === i;
            const lockTitle = s.elite ? t('skin.legendLock') : t('skin.locked', { n: s.unlockStars });
            return `<button class="skin-swatch${selected ? ' selected' : ''}${s.elite ? ' skin-elite' : ''}" data-skin="${i}"
              data-testid="skin-${i}" style="--c:${s.body}" ${unlockedSkin ? '' : 'disabled'}
              aria-label="${t(s.nameKey)}" title="${unlockedSkin ? t(s.nameKey) : lockTitle}">${
                unlockedSkin ? '' : `<span class="skin-lock">${s.elite ? '🏅' : `★${s.unlockStars}`}</span>`
              }</button>`;
          })
          .join('')}</div>
        <div class="garage-hint">${t('garage.hint')}</div>
        <button class="btn btn-primary btn-big" data-testid="garage-close">${t('garage.close')}</button>
      </div>`;
    this.q('.overlay-slot').appendChild(overlay);
    this.wireDialog(overlay, { onCancel: () => this.q('[data-testid=garage-close]').click() });
    const close = () => overlay.remove();
    overlay.querySelector('[data-testid=garage-close]')!.addEventListener('click', () => {
      this.audio.play('click');
      close();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelectorAll<HTMLButtonElement>('.skin-swatch:not([disabled])').forEach((b) =>
      b.addEventListener('click', () => {
        const i = Number(b.dataset.skin);
        setTargetSkin(i);
        this.store.setTargetSkin(i);
        this.audio.play('click');
        // Меню перерисовывается (машинка во дворе меняет цвет), гараж остаётся открытым.
        this.transitionScreen(() => {
          this.showMenuInner();
          this.showGarage();
        });
      })
    );
    if (this.platform.isTV)
      overlay.querySelector<HTMLElement>('.skin-swatch.selected, [data-testid=garage-close]')?.focus({ preventScroll: true });
  }

  // ---------- меню ----------

  showMenu(): void {
    // Откуда игрок вышел в меню — воронка «где выходят» (аналитика §11).
    // Читаем testid текущего экрана ДО его замены, не разбрасывая track() по
    // каждому «Меню»/«Назад»-обработчику (их десятки по всему App).
    const fromScreen = this.root.querySelector<HTMLElement>('.screen[data-testid]')?.dataset.testid;
    if (fromScreen && fromScreen !== 'screen-menu') track({ type: 'returned_to_menu', screen: fromScreen });
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
    const completed = completedCampaignLevels(LEVELS, this.store.data);
    const qaYardRaw = import.meta.env.DEV || import.meta.env.MODE === 'e2e' ? queryParam('qaYard') : null;
    const qaYardLevel = qaYardRaw === null ? Number.NaN : Number(qaYardRaw);
    const yardStage = yardMilestone(Number.isFinite(qaYardLevel) ? qaYardLevel : completed);
    const hasProgress = total > 0;
    const dailyKey = this.dailyKey();
    const weekDone = weeklyProgress(this.store.data.daily, new Date(`${dailyKey}T12:00:00`));
    const trophies = weeklyTrophies(this.store.data.daily);
    const achievementCount = unlockedAchievementKeys(this.store.data).size;
    const giftClaimed = this.store.data.lastGift === dailyKey;
    const season = currentSeason();
    const giftAmount = 2 + (season?.giftBonus ?? 0);
    // Единственный источник истины о завершении кампании — флаг сейва;
    // всё меню (CTA, табы, гараж) выводится из этого одного значения.
    const campaignDone = this.store.data.campaignDone === true;
    const endless = endlessAccess(LEVELS, this.store.data);
    const unlockedSkinCount = TARGET_SKINS.filter((skin) =>
      skin.elite ? campaignDone : total >= skin.unlockStars
    ).length;
    const week = currentWeekKey();
    // Недельные цели по «Бесконечному двору» выдаются только тем, кому режим
    // уже доступен: иначе игрок получает заведомо невыполнимую цель и теряет
    // недельную награду. Тизер доступом не считается.
    const weeklyQuests = selectWeeklyQuests(week, endless === 'open').map((quest) => {
      const progress = weeklyQuestProgress(this.store.data.weekly, week, quest);
      const done = progress >= quest.goal;
      const claimed = isWeeklyQuestClaimed(this.store.data.weekly, week, quest.key);
      return { quest, progress, done, claimed };
    });
    // Строка «Глава N · Название» и номер уровня в CTA: игрок видит, куда
    // именно ведёт кнопка, не открывая карту уровней. После кампании кнопка
    // ведёт в лигу, и номер уровня там смысла не имеет.
    const nextLevel = nextLevelToPlay(LEVELS, this.store.data);
    const nextPosition = campaignPositionOf(nextLevel.id);
    const chapterIndex = chapterOfPosition(nextPosition);
    const campaignPercent = Math.round((completed / LEVELS.length) * 100);
    this.root.innerHTML = `
      <div class="screen menu-screen" data-testid="screen-menu">
        <div class="yard-bg">${yardSVG(unlockedUpgrades(total), trophies, season?.id, yardStage)}</div>
        <div class="menu-hud">
          <span class="hud-chip stars-total" data-testid="stars-total">★ ${total} / ${max}</span>
          <span class="hud-chip hud-hints" data-testid="menu-hint-tokens">💡 ${this.store.data.hintTokens ?? 0}</span>
        </div>
        <div class="menu-ui">
          <div class="menu-hero">
            ${season ? `<div class="season-banner" data-testid="season-banner">${t(`season.${season.id}`)}</div>` : ''}
            ${
              campaignDone
                ? ''
                  // `chapter.N` уже содержит и номер, и название («Глава 4 ·
                  // Сенокос») — оборачивать его ещё раз значит получить
                  // «Глава 4 · Глава 4 · Сенокос».
                : `<div class="menu-chapter" data-testid="menu-chapter">${t(`chapter.${chapterIndex}`)}</div>`
            }
            <h1 class="game-title"><span>${t('game.titleTop')}</span><span>${t('game.titleBottom')}</span></h1>
          </div>
          <div class="menu-panel">
          <div class="menu-progress-block">
            <div class="menu-progress-line">
              <span data-testid="menu-campaign-line">${
                campaignDone
                  ? t('menu.campaignDone')
                  : t('menu.levelOf', { n: nextPosition, m: LEVELS.length })
              }</span>
              <span class="next-upgrade">${
                next ? t('menu.nextUpgrade', { n: next.stars }) : campaignDone ? t('menu.fullYard') : t('menu.allUpgrades')
              }</span>
            </div>
            <div class="menu-progress-bar" role="presentation">
              <i style="width:${campaignDone ? 100 : campaignPercent}%"></i>
            </div>
          </div>
          <div class="menu-buttons">
            <button class="btn btn-primary btn-big" data-testid="menu-play">${
              campaignDone
                ? `🏅 ${t('elite.continue')}`
                : `${hasProgress ? t('menu.continue') : t('menu.play')} <small>· ${nextPosition}</small>`
            }</button>
            <div class="mode-switch" data-testid="mode-switch" role="group" aria-label="${t('menu.events')}">
              <button class="mode-tab${campaignDone ? '' : ' active'}" data-testid="menu-levels"><span>${t('mode.campaign')}</span></button>
              ${
                campaignDone
                  ? `<button class="mode-tab active mode-tab-elite" data-testid="menu-elite"><span>🏅 ${t('mode.elite')}</span></button>`
                  : ''
              }
              ${
                endless === 'open'
                  ? `<button class="mode-tab" data-testid="menu-endless"><span>🌀 ${t('mode.endless')}</span>${
                      (this.store.data.endlessBest ?? 0) > 0
                        ? `<small>${t('endless.best', { n: this.store.data.endlessBest ?? 0 })}</small>`
                        : ''
                    }</button>`
                  : endless === 'teaser'
                    ? `<button class="mode-tab mode-tab-locked" data-testid="menu-endless-locked" disabled aria-disabled="true"><span>🔒 ${t(
                        'mode.endless'
                      )}</span><small>${t('endless.teaser', { n: ENDLESS_UNLOCK_AT })}</small></button>`
                    : ''
              }
            </div>
            <div class="menu-events" data-testid="menu-events" aria-label="${t('menu.events')}">
              <div class="event-cards">
                <button class="event-card btn-daily" data-testid="menu-daily">
                  <span class="event-card-title">🔥 ${t('daily.button')}${
                    dailyModifier(dailyKey) !== 'none' ? ' 🎯' : ''
                  }</span>
                  <small class="event-card-sub" data-testid="weekly-progress">${
                    isDoneToday(this.store.data.daily, new Date(`${dailyKey}T12:00:00`))
                      ? `${t('daily.done')} · `
                      : currentStreak(this.store.data.daily) > 0
                        ? `${t('daily.streak', { n: currentStreak(this.store.data.daily) })} · `
                        : ''
                  }${t('daily.week', { n: weekDone })}${trophies > 0 ? ` · 🏆 ${trophies}` : ''}</small>
                </button>
                <button class="event-card gift-btn" data-testid="menu-gift" ${giftClaimed ? 'disabled' : ''}>
                  <span class="event-card-title">${
                    giftClaimed ? `💡 ${t('gift.tokens')}` : `🎁 ${t('gift.claim', { n: giftAmount })}`
                  }</span>
                  <small class="event-card-sub">${
                    giftClaimed
                      ? `${t('gift.hintsLeft', { n: this.store.data.hintTokens ?? 0 })}`
                      : t('gift.hintsAdd', { n: giftAmount })
                  }</small>
                </button>
              </div>
              <div class="menu-meta-row">
                <button class="btn" data-testid="menu-leaderboard" aria-label="${t(
                  'menu.leaderboard'
                )}" title="${t('menu.leaderboard')}">🏆</button>
                <button class="btn" data-testid="menu-achievements" aria-label="${t(
                  'achievements.title'
                )}">🏅 ${achievementCount}/${ACHIEVEMENTS.length}</button>
                <button class="btn${weeklyQuests.some((q) => q.done && !q.claimed) ? ' has-ready' : ''}" data-testid="menu-weekly" aria-label="${t(
                  'weekly.title'
                )}">🎯 ${weeklyQuests.filter((q) => q.claimed).length}/${weeklyQuests.length}</button>
                <button class="btn" data-testid="menu-garage" aria-label="${t('menu.garage')}" title="${t(
                  'menu.garage'
                )}">🚗 ${unlockedSkinCount}/${TARGET_SKINS.length}</button>
              </div>
            </div>
          </div>
          </div>
        </div>
        <div class="menu-settings">
          <button class="icon-btn settings-toggle" data-testid="menu-settings" aria-label="${t('menu.settings')}" aria-expanded="false" aria-controls="menu-settings-panel">${settingsIcon}</button>
          <div class="menu-audio" id="menu-settings-panel" data-testid="menu-settings-panel" hidden>
            ${this.settingsItem(this.toggles.soundHtml('sound-toggle'), t('audio.sound'))}
            ${this.settingsItem(this.toggles.musicHtml('music-toggle'), t('audio.music'))}
            ${this.settingsItem(this.toggles.vibrationHtml('vibration-toggle'), t('audio.vibration'))}
            ${this.settingsItem(this.liveYardToggleHtml('liveyard-toggle'), t('audio.liveYard'))}
            ${this.settingsItem(this.contrastToggleHtml('contrast-toggle'), t('audio.contrast'))}
            ${this.settingsItem(this.toggles.bellHtml('bell-toggle'), t('audio.reminders'))}
            ${this.settingsItem(
              `<button class="icon-btn lang-toggle" data-testid="lang-toggle" aria-label="${t(
                'settings.language'
              )}">🌐<span class="lang-code">${getLang().toUpperCase()}</span></button>`,
              t('settings.language')
            )}
            ${this.settingsItem(
              `<button class="icon-btn" data-testid="menu-rules" aria-label="${t('rules.title')}">📖</button>`,
              t('menu.rules')
            )}
          </div>
        </div>
        <div class="overlay-slot"></div>
      </div>`;
    this.q('[data-testid=menu-play]').addEventListener('click', () => {
      this.audio.play('click');
      // После кампании логичное «продолжить» — Высшая лига, а не повтор 100-го.
      if (campaignDone) this.showEliteScreen();
      else this.startLevel(nextLevelToPlay(LEVELS, this.store.data).id);
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
      this.showLeaderboard();
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
    const settingsToggle = this.q<HTMLButtonElement>('[data-testid=menu-settings]');
    const settingsPanel = this.q<HTMLElement>('[data-testid=menu-settings-panel]');
    settingsToggle.addEventListener('click', () => {
      const opening = settingsPanel.hidden;
      settingsPanel.hidden = !opening;
      settingsToggle.classList.toggle('active', opening);
      settingsToggle.setAttribute('aria-expanded', String(opening));
      this.audio.play('click');
      if (opening && this.platform.isTV) {
        settingsPanel.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
      }
    });
    this.q('[data-testid=menu-garage]').addEventListener('click', () => {
      this.audio.play('click');
      this.showGarage();
    });
    this.toggles.wireSound(this.q('[data-testid=sound-toggle]'));
    this.toggles.wireMusic(this.q('[data-testid=music-toggle]'));
    this.toggles.wireVibration(this.q('[data-testid=vibration-toggle]'));
    this.wireLiveYardToggle(this.q('[data-testid=liveyard-toggle]'));
    this.wireContrastToggle(this.q('[data-testid=contrast-toggle]'));
    const bellEl = this.root.querySelector<HTMLElement>('[data-testid=bell-toggle]');
    if (bellEl) this.toggles.wireBell(bellEl);
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

  private showLeaderboard(): void {
    this.disposeActiveBoard();
    this.setGameplay(false);
    this.transitionScreen(() => {
      this.showLeaderboardShell();
      void this.loadLeaderboardContent();
    });
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
    // Доска лиги грузится только тем, кто в лигу вошёл: остальным она пуста и
    // лишь занимает экран, а запрос всё равно стоит квоты SDK.
    const leagueOpen = this.store.data.campaignDone === true;
    const [starsSnap, streakSnap, leagueSnap, weeklySnap] = await Promise.all([
      this.leaderboardCache.get('yardstars'),
      this.leaderboardCache.get('dailystreak'),
      leagueOpen ? this.leaderboardCache.get('eliteleague') : Promise.resolve(null),
      leagueOpen && this.store.data.eliteWeekly
        ? this.leaderboardCache.get('eliteweekly')
        : Promise.resolve(null)
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
      board(t('leaderboard.streak'), streak, myStreak, ` ${t('leaderboard.days')}`) +
      (leagueSnap ? board(t('leaderboard.league'), leagueSnap.entries, leagueSnap.me, ' 🏅') : '') +
      (weeklySnap ? board(t('leaderboard.weekly'), weeklySnap.entries, weeklySnap.me, ' 🏆') : '');
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
              <span>${t(`achievement.${achievement.key}.desc`, { n: achievement.goal })}</span>
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
    this.wireDialog(overlay, { onCancel: () => overlay.querySelector<HTMLElement>('[data-testid=gift-close]')?.click() });
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
    this.wireDialog(overlay, { onCancel: () => overlay.querySelector<HTMLElement>('[data-testid=weekly-close]')?.click() });
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
    this.wireDialog(overlay, { onCancel: () => overlay.querySelector<HTMLElement>('[data-testid=btn-rules-close]')?.click() });
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
    // Главы режутся по позиции в кампании, а не по id: вставленные уровни
    // получают id 101+, и деление по id развалило бы и заголовки, и подсчёт звёзд.
    LEVELS.forEach((l, index) => {
      const position = index + 1;
      if (isChapterStart(position)) {
        const chapter = chapterOfPosition(position);
        const levelsOfChapter = chapterLevels(chapter);
        const chapterStars = levelsOfChapter.reduce((sum, chapterLevel) => sum + this.store.starsOf(chapterLevel.id), 0);
        parts.push(
          `<div class="chapter-header"><span>${t(`chapter.${chapter}`)}</span><small>★ ${chapterStars} / ${levelsOfChapter.length * 3}</small></div>`
        );
      }
      const unlocked = isLevelUnlocked(LEVELS, this.store.data, l.id);
      const stars = this.store.starsOf(l.id);
      parts.push(`
        <button class="level-card ${unlocked ? '' : 'locked'}${l.id === currentId ? ' current' : ''}" data-level="${l.id}" data-testid="level-card-${l.id}" ${l.id === currentId ? 'data-tv-default' : ''} title="${escapeHTML(levelText('name', l.name) ?? l.name)}" ${
          unlocked ? '' : 'disabled'
        }>
          ${unlocked ? levelThumbnail(l) : ''}
          <span class="level-num">${l.width > 6 ? '👑 ' : ''}${index + 1}</span>
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

  /**
   * Dev-only: запуск произвольного уровня из QA-редактора. Вызывается только
   * qa-модулем (dev/e2e), в QA-режиме сохранение прогресса отключено платформой.
   */
  playCustomLevel(level: LevelDef): void {
    this.runLevel(level, false);
  }

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
    // markCampaignDone идемпотентен: событие уходит ровно один раз за игрока.
    // «Бесконечный двор» больше не привязан к финалу — он открывается в
    // середине кампании, и его событие живёт в finishLevel рядом с условием.
    if (firstEver) track({ type: 'campaign_completed', stars: totalStars(this.store.data) });
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
      const achievementsBefore = unlockedAchievementKeys(this.store.data);
      const starsBefore = totalStars(this.store.data);
      const yardStageBefore = yardMilestone(completedCampaignLevels(LEVELS, this.store.data));
      this.store.recordWeeklyEvent(currentWeekKey(), 'win', 1);
      if (finalStars === 3) this.store.recordWeeklyEvent(currentWeekKey(), 'perfect', 1);
      const improved = this.store.recordResult(def.id, finalStars);
      const starsAfter = totalStars(this.store.data);
      const unlocked = newlyUnlocked(starsBefore, starsAfter);
      for (const upgrade of unlocked) track({ type: 'upgrade_unlocked', key: upgrade.key, stars: starsAfter });
      const newSkins = TARGET_SKINS.filter((s) => !s.elite && s.unlockStars > starsBefore && s.unlockStars <= starsAfter);
      const yardStageAfter = yardMilestone(completedCampaignLevels(LEVELS, this.store.data));
      if (improved) {
        void this.platform.submitScore('yardstars', starsAfter);
        this.leaderboardCache.invalidate('yardstars');
      }
      const newAchievements = ACHIEVEMENTS.filter(
        (achievement) =>
          !achievementsBefore.has(achievement.key) && unlockedAchievementKeys(this.store.data).has(achievement.key)
      );
      // Выданное фиксируется в сейве: цели растут вместе с кампанией, награда — нет.
      this.store.rememberAchievements(unlockedAchievementKeys(this.store.data));
      this.store.markBossDone(def.id);
      // Финальный босс (слот 100) открывает Высшую лигу той же логикой, что и
      // обычный уровень 100: при первом прохождении — финальная сцена вместо
      // боссовой победы; повторно — обычная боссовая победа без повторных наград.
      if (def.id === CAMPAIGN_LAST_ID && this.completeCampaignFinale()) return;
      this.showBossVictory(
        def,
        finalStars,
        unlocked,
        newAchievements,
        yardStageAfter > yardStageBefore ? yardStageAfter : 0,
        newSkins
      );
      return;
    }
    // Короткий переход между фазами — без перезагрузки страницы.
    const nextRun = advancePhase(run, def);
    this.audio.play('bossPhase');
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
  private showBossVictory(
    def: BossLevelDef,
    stars: number,
    unlocked: ReturnType<typeof newlyUnlocked>,
    newAchievements: (typeof ACHIEVEMENTS)[number][],
    newYardStage: number,
    newSkins: (typeof TARGET_SKINS)[number][] = []
  ): void {
    this.audio.play('win');
    this.vibrate([28, 45, 28, 45, 70]);
    this.yardDirector?.react('boss-win');
    const idx = LEVELS.findIndex((l) => l.id === def.id);
    const next = idx >= 0 && idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
    const upgradeNote = unlocked
      .map((upgrade) => `<div class="win-upgrade" data-testid="win-upgrade">🎉 ${t(`upgrade.${upgrade.key}`)}</div>`)
      .join('');
    const yardStageNote = newYardStage
      ? `<div class="win-master yard-stage-unlocked" data-testid="win-yard-stage">${t('win.yardStage', {
          n: newYardStage * 10
        })}</div>`
      : '';
    const achievementNote = newAchievements
      .map(
        (achievement) =>
          `<div class="win-achievement" data-testid="win-achievement">${achievement.icon} ${t(
            'achievements.unlocked'
          )}: ${t(`achievement.${achievement.key}.title`)}</div>`
      )
      .join('');
    const skinNote = newSkins
      .map(
        (skin) =>
          `<div class="win-upgrade" data-testid="win-skin">${t('win.skinUnlocked', { name: t(skin.nameKey) })}</div>`
      )
      .join('');
    const overlay = document.createElement('div');
    overlay.className = 'overlay boss-victory';
    overlay.setAttribute('data-testid', 'boss-victory');
    overlay.innerHTML = `
      ${confettiHtml(40)}
      <div class="dialog boss-dialog win-dialog">
        <div class="boss-badge boss-badge-win">🏆</div>
         <h2>${t(def.nameKey)}</h2>
         <div class="win-stars" data-testid="win-stars" data-stars="${stars}">${starIcons(stars)}</div>
         <p class="boss-victory-text" data-testid="boss-victory-text">${t(def.victoryKey)}</p>
         ${(() => {
           const rewardNotes = [yardStageNote, upgradeNote, skinNote, achievementNote].join('');
           return rewardNotes ? `<div class="win-rewards" data-testid="win-rewards">${rewardNotes}</div>` : '';
         })()}
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
      // Событие — после успешной загрузки: неудачная попытка не считается стартом.
      track({
        type: 'daily_started',
        modifier: level.modifier,
        streak: currentStreak(this.store.data.daily)
      });
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
    // Rewarded-восстановление (Stage C): незавершённый заезд можно продолжить
    // за ролик. Порог отсекает «восстановление» серий из одного-двух уровней —
    // их проще пройти заново, чем смотреть рекламу.
    const resume = this.store.data.endlessResume ?? 0;
    if (resume >= App.ENDLESS_REVIVE_MIN_STREAK) {
      this.showEndlessResumeDialog(resume);
      return;
    }
    this.beginEndlessRun(0);
  }

  /** Порог серии, начиная с которой предлагаем восстановление за rewarded. */
  private static readonly ENDLESS_REVIVE_MIN_STREAK = 3;

  private beginEndlessRun(streak: number): void {
    this.endlessStreak = streak;
    track({ type: 'endless_started', best: this.store.data.endlessBest ?? 0 });
    void this.playNextEndless();
  }

  /** Диалог выбора: восстановить прерванную серию за rewarded или начать заново. */
  private showEndlessResumeDialog(streak: number): void {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('data-testid', 'endless-resume');
    overlay.innerHTML = `
      <div class="dialog win-dialog">
        <h2>🌀 ${t('endless.resume.title', { n: streak })}</h2>
        <div class="dialog-sub">${t('endless.resume.text')}</div>
        <button class="btn btn-primary btn-big" data-tv-default data-testid="endless-resume-yes">${t('endless.resume.yes')}</button>
        <button class="btn" data-testid="endless-resume-no">${t('endless.resume.no')}</button>
      </div>`;
    this.q('.overlay-slot').appendChild(overlay);
    this.wireDialog(overlay, { onCancel: () => overlay.querySelector<HTMLElement>('[data-testid=endless-resume-no]')?.click() });
    overlay.querySelector('[data-testid=endless-resume-yes]')!.addEventListener('click', async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      if (button.disabled) return;
      button.disabled = true;
      this.audio.play('click');
      const ok = await this.showRewardedFor('endless-revive', 0);
      overlay.remove();
      if (ok) this.beginEndlessRun(streak);
      else this.beginEndlessRun(0);
    });
    overlay.querySelector('[data-testid=endless-resume-no]')!.addEventListener('click', () => {
      this.audio.play('click');
      overlay.remove();
      this.store.setEndlessResume(undefined);
      this.beginEndlessRun(0);
    });
    if (this.platform.isTV)
      overlay.querySelector<HTMLElement>('[data-testid=endless-resume-yes]')?.focus({ preventScroll: true });
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
    modifier: RuleModifier = 'none',
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
    // Номер попытки живёт в SessionStats, а не в DOM: рестарт увеличивает его
    // без нового входа на экран, повторный рендер HUD не плодит событий.
    const entry = this.sessionStats.levelStarted(level.id);
    track({
      type: 'level_start',
      levelId: level.id,
      sessionLevelNumber: entry.sessionLevelNumber,
      attemptNumber: entry.attemptNumber
    });
    if (boss && boss.run.phaseIndex === 0) track({ type: 'boss_start', levelId: boss.def.id });
    this.audio.setMood(endless || boss !== undefined || level.difficulty === 'hard');
    const isBoss = level.width > 6;
    const bossPhase = boss ? currentPhase(boss.run, boss.def) : null;
    const bossProg = boss ? bossProgress(boss.run, boss.def) : null;
    const bossWorldClass = bossPhase?.worldChange ?? '';
    const title = boss
      ? `⚡ ${t(boss.def.nameKey)}`
      : challenge
        ? `🏅 ${t('elite.challenge')} ${challenge.id}`
        : daily
          ? `🔥 ${t('daily.title')}`
          : endless
            ? `🌀 ${t('endless.title')} · ${level.name}`
            : `${isBoss ? '👑 ' : ''}${campaignNumber(LEVELS, level.id) || level.id}. ${levelText('name', level.name)}`;
    const starHud = level.star ? `<span class="hud-star" data-testid="hud-star">★</span>` : '';

    // Условие третьей звезды показываем явно: раньше в HUD висел только мягкий
    // лимит par2, и игрок не знал, чем ★★★ отличается от ★★ — на уровнях со
    // звездой это сбор канистры, на остальных более жёсткий лимит ходов.
    // В мастер-испытании тиры звёзд не действуют (там медали), поэтому у него
    // остаётся прежняя одиночная цель.
    // \n вместо пробела перед вторым условием: `.hud-par` рендерит его как
    // разрыв строки (white-space: pre-line) — на 320px «★★ ≤ 7 · ★★★ +★» в
    // одну строку не помещалось и переносилось посреди слова. Playwright
    // toHaveText схлопывает \n обратно в пробел при сравнении, так что текст
    // для тестов не меняется.
    const goalText = challenge
      ? t('hud.goal', { n: level.par2 })
      : `${t('hud.goal2', { n: level.par2 })}\n· ${
          level.star ? t('hud.goal3star') : t('hud.goal3moves', { n: level.par })
        }`;
    const goalAria = challenge
      ? t('hud.goal', { n: level.par2 })
      : level.star
        ? t('hud.goalAriaStar', { n: level.par2 })
        : t('hud.goalAriaMoves', { n: level.par2, m: level.par });
    this.root.innerHTML = `
      <div class="screen game-screen${boss ? ` boss-game-screen ${bossWorldClass}` : ''}" data-testid="screen-game"${
        boss ? ` data-boss-id="${boss.def.id}" data-boss-phase="${boss.run.phaseIndex + 1}"` : ''
      }>
        <div class="hud hud-top">
          <div class="hud-left">
            <button class="icon-btn" data-testid="btn-game-back" aria-label="${t('ingame.back')}" title="${t('ingame.back')}">${backIcon}</button>
            <button class="icon-btn" data-testid="btn-pause" aria-label="${t('pause.title')}">${pauseIcon}</button>
          </div>
          <div class="hud-level${bossProg ? ' hud-level-boss' : ''}">${title}</div>
          ${
            bossProg
              ? `<span class="boss-phase-chip" data-testid="boss-phase">${t('boss.phase', { n: bossProg.phase, m: bossProg.total })}</span>`
              : ''
          }
          <div class="hud-right">
            ${starHud}
            <div class="hud-moves"><span class="hud-moves-label">${t('hud.moves')}</span> <b data-testid="hud-moves">0</b><span class="hud-par" data-testid="hud-goal" title="${escapeHTML(goalAria)}" aria-label="${escapeHTML(goalAria)}">${goalText}</span></div>
          </div>
        </div>
        <div class="board-host" data-testid="board-host"></div>
        <div class="hud hud-bottom">
          <button class="btn" data-testid="btn-undo" disabled ${blocksUndo(modifier) ? 'hidden' : ''}>${t('btn.undo')}</button>
          <button class="btn btn-redo" data-testid="btn-redo" disabled ${blocksUndo(modifier) ? 'hidden' : ''} aria-label="${t('btn.redo')}" title="${t('btn.redo')}">↪</button>
          <button class="btn" data-testid="btn-restart">${t('btn.restart')}</button>
          <button class="btn" data-testid="btn-hint" ${blocksHints(modifier) ? 'hidden' : ''}>${
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
    const redoStack: GameState[] = [];
    const redoBtn = this.q<HTMLButtonElement>('[data-testid=btn-redo]');
    let finished = false;

    const refreshHud = () => {
      movesEl.textContent = String(cur.moves);
      undoBtn.disabled = undoStack.length === 0;
      redoBtn.disabled = redoStack.length === 0;
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
      d.setAttribute('role', 'alert');
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
      onPick: (piece) => {
        this.audio.play('pick');
        if (level.pieces[piece]?.kind === 'tractor') this.audio.play('tractorStart');
        this.audio.engineStart();
        this.hideOnboardingHand();
      },
      onRelease: () => this.audio.engineStop(),
      onDragSpeed: (t) => this.audio.engineSetIntensity(t),
      onBump: () => {
        this.audio.play('thud');
        this.vibrate(14);
        this.yardDirector?.react('collision');
      },
      onIceBlocked: () => {
        // Отдача уже отыграна в onBump; здесь только объяснение правила.
        this.yardDirector?.react('ice');
      },
      onGateSwitch: () => {
        this.audio.play('switch');
        this.vibrate([18, 35, 24]);
      },
      onGateOpen: () => this.audio.play('gate'),
      onGateClose: () => {
        // Держащаяся кнопка: ворота захлопнулись, потому что фигура съехала с
        // кнопки. Вибрация короче, чем у нажатия, — это потеря, а не успех.
        this.audio.play('gateClose');
        this.vibrate(22);
      },
      onPlankBroken: () => {
        this.audio.play('plankBreak');
        this.vibrate([14, 28, 18]);
      },
      onChickenHop: () => this.audio.play('chickenScatter'),
      onExplain: () => this.audio.play('click'),
      onCommit: (res, piece) => {
        undoStack.push(cur);
        redoStack.length = 0; // новый ход открывает новую ветку истории
        cur = res.state;
        if (!firstMoveTracked) {
          firstMoveTracked = true;
          track({ type: 'first_move', levelId: level.id, timeMs: Math.round(performance.now() - levelStartedAt) });
        }
        this.audio.play(level.pieces[piece]?.kind === 'crate' ? 'crateSlide' : 'move');
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
          this.audio.play('victoryDrive');
        }
        // Случайное кудахтанье декоративных кур у забора — только там, где куры
        // НЕ игровой объект. На уровне с курами-блокираторами тот же звук уже
        // означает конкретное событие (`onChickenHop`), и случайный дубль
        // сделал бы обратную связь механики неотличимой от фонового шума.
        if (!level.chickens?.length && Math.random() < 0.25) this.audio.play('cluck');
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
        const elapsedMs = Math.round(performance.now() - levelStartedAt);
        track({
          type: 'level_complete',
          levelId: level.id,
          moves: cur.moves,
          stars: starsFor(level, cur.moves, cur.starCollected),
          timeMs: elapsedMs,
          attemptNumber: this.sessionStats.attemptOf(level.id),
          durationSeconds: Math.round(elapsedMs / 1000),
          hintUsed: attempt.usedHint
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
        // «Начало главы» определяется позицией в кампании: главы режутся по
        // порядку уровней, а не по id, и после вставки новых уровней счёт по id
        // отмечал бы главу не на той карточке.
        if (!finished) {
          const position = campaignNumber(LEVELS, level.id);
          this.yardDirector?.react(isChapterStart(position) ? 'chapter-start' : 'level-start');
        }
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
      redoStack.push(cur);
      cur = prev;
      bv.setState(prev);
      this.audio.play('undo');
      refreshHud();
      updateDeadlock();
    });
    redoBtn.addEventListener('click', () => {
      if (finished || cur.won) return;
      const next = redoStack.pop();
      if (!next) return;
      undoStack.push(cur);
      cur = next;
      bv.setState(next);
      this.audio.play('move');
      refreshHud();
      updateDeadlock();
    });
    const skipBtn = this.q<HTMLButtonElement>('[data-testid=btn-skip]');
    /**
     * «Пропустить за рекламу» существует ради одного случая: игрок застрял в
     * кампании и дальше не идёт. В остальных режимах кнопка не просто лишняя —
     * она ломает сеанс, потому что её обработчик умеет только кампанию: пишет
     * звезду по `level.id` и уходит на следующий уровень СПИСКА кампании.
     *
     * В мастер-испытании это выбрасывало игрока из лиги (у ремикса id вне
     * кампании, поиск не находил соседа — и сеанс заканчивался в меню; у
     * обычного двора находил, и лига внезапно сменялась уровнем кампании).
     * В бою с боссом — обрывало фазу на середине. Лига же вся построена на
     * переигровке ради золота, так что порог в три рестарта там берётся легко,
     * и до этой правки кнопка вылезала почти в каждом испытании.
     */
    const skippable = !daily && !endless && !challenge && !boss;
    const refreshSkip = () => {
      skipBtn.style.display = skippable && (this.restartCounts.get(level.id) ?? 0) >= 3 ? '' : 'none';
    };
    refreshSkip();
    this.q('[data-testid=btn-restart]').addEventListener('click', () => {
      if (finished || cur.won) return;
      attempt.usedRestart = true;
      track({ type: 'level_restart', levelId: level.id, moves: cur.moves });
      this.sessionStats.levelRestarted(level.id);
      undoStack.length = 0;
      redoStack.length = 0;
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
      // Видимость уже ограничена, но обработчик умеет только кампанию —
      // проверка дублируется намеренно, цена ошибки здесь потерянный сеанс.
      if (!skippable || finished || cur.won || skipBtn.disabled) return;
      this.audio.play('click');
      skipBtn.disabled = true;
      bv.interactive = false;
      try {
        const ok = await this.showRewardedFor('skip', level.id);
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
    this.q('[data-testid=btn-game-back]').addEventListener('click', () => {
      if (finished || cur.won) return;
      this.audio.play('click');
      this.showMenu();
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
        const isTutorialLevel = !daily && !challenge && FREE_HINT_LEVEL_IDS.has(level.id);
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
          ok = await this.showRewardedFor('hint', level.id);
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

    // Мастер-испытание навязывает модификатор молча: до этого игрок узнавал о
    // запрете только по пропавшей кнопке. Баннер тот же, что у ежедневного.
    let modifierShown = false;
    if ((daily || challenge) && modifier !== 'none') {
      const banner = document.createElement('div');
      banner.className = 'hint-toast modifier-toast';
      banner.setAttribute('data-testid', 'modifier-toast');
      banner.textContent = `🎯 ${t(challenge ? `elite.mod.${modifier}` : `daily.modifier.${modifier}`)}`;
      this.q('.overlay-slot').appendChild(banner);
      window.setTimeout(() => banner.classList.add('gone'), 5200);
      window.setTimeout(() => banner.remove(), 5800);
      modifierShown = true;
    }

    // обучение: короткая подсказка + стрелка на первом уровне
    const hintText = levelText('hint', level.hint);
    if (hintText) {
      const toast = document.createElement('div');
      // Оба тоста абсолютно позиционированы по одному `top`, и до появления
      // подсказок у испытаний лиги они не могли встретиться: у ремиксов hint не
      // было вообще. Испытания на новых механиках показывают и правило, и
      // модификатор — второй тост уезжает под первый.
      toast.className = modifierShown ? 'hint-toast stacked' : 'hint-toast';
      toast.setAttribute('data-testid', 'hint-toast');
      // Тост появляется сам, без фокуса игрока — скринридер обязан его объявить.
      toast.setAttribute('role', 'status');
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
      <div class="dialog pause-dialog">
        <h2>${t('pause.title')}</h2>
        <div class="dialog-sub">${daily ? t('daily.title') : `${level.id}. ${levelText('name', level.name)}`}</div>
        <button class="btn btn-primary btn-big" data-testid="btn-resume">${t('pause.resume')}</button>
        <button class="btn btn-big" data-testid="btn-pause-restart">${t('pause.restart')}</button>
        <div class="dialog-row pause-actions">
          ${this.toggles.soundHtml('pause-sound')}
          ${this.toggles.musicHtml('pause-music')}
          ${this.toggles.vibrationHtml('pause-vibration')}
          <button class="btn" data-testid="btn-exit-menu">${t('pause.menu')}</button>
        </div>
      </div>`;
    this.q('.overlay-slot').appendChild(overlay);
    this.wireDialog(overlay, { onCancel: () => overlay.querySelector<HTMLElement>('[data-testid=btn-resume]')?.click() });
    this.toggles.wireSound(overlay.querySelector('[data-testid=pause-sound]')!);
    this.toggles.wireMusic(overlay.querySelector('[data-testid=pause-music]')!);
    this.toggles.wireVibration(overlay.querySelector('[data-testid=pause-vibration]')!);
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
    const endlessBefore = endlessAccess(LEVELS, this.store.data);
    const yardStageBefore = yardMilestone(completedCampaignLevels(LEVELS, this.store.data));
    let unlocked: ReturnType<typeof newlyUnlocked> = [];
    let newSkins: (typeof TARGET_SKINS)[number][] = [];
    let justMastered = false;
    let newYardStage = 0;
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
      // Стрик берём уже посчитанный платформой прогресса, а не «+1» на глазок.
      track({ type: 'daily_completed', modifier: dailyModifier(dailyDate ?? this.dailyKey()), streak: dailyStreak, stars });
      void this.platform.submitScore('dailystreak', newDaily.streak);
      this.leaderboardCache.invalidate('dailystreak');
    } else {
      const improved = this.store.recordResult(level.id, stars);
      const after = totalStars(this.store.data);
      // Открытие «Бесконечного двора» — переход доступа, а не побочный эффект
      // финала кампании: событие уходит ровно один раз, на том уровне, который
      // режим и открывает. Повторное прохождение перехода не даёт.
      if (endlessBefore !== 'open' && endlessAccess(LEVELS, this.store.data) === 'open') {
        track({ type: 'endless_unlocked' });
      }
      unlocked = newlyUnlocked(before, after);
      // Пороги считаются по звёздам «до/после», поэтому повторное прохождение
      // уже открытого улучшения событие не повторяет.
      for (const upgrade of unlocked) track({ type: 'upgrade_unlocked', key: upgrade.key, stars: after });
      newSkins = TARGET_SKINS.filter((s) => !s.elite && s.unlockStars > before && s.unlockStars <= after);
      const yardStageAfter = yardMilestone(completedCampaignLevels(LEVELS, this.store.data));
      if (yardStageAfter > yardStageBefore) newYardStage = yardStageAfter;
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
    // Выданное фиксируется в сейве: цели растут вместе с кампанией, награда — нет.
    this.store.rememberAchievements(unlockedAchievementKeys(this.store.data));
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
    const yardStageNote = newYardStage
      ? `<div class="win-master yard-stage-unlocked" data-testid="win-yard-stage">${t('win.yardStage', {
          n: newYardStage * 10
        })}</div>`
      : '';
    // Глава закрывается по позиции в кампании: у вставленных уровней id 101+,
    // и счёт по id объявлял бы «главу пройдена» в произвольных местах.
    const campaignPos = campaignNumber(LEVELS, level.id);
    const chapterNote =
      !daily && isChapterEnd(campaignPos, LEVELS)
        ? `<div class="win-master chapter-complete" data-testid="win-chapter">${t('win.chapter', {
            n: chapterOfPosition(campaignPos)
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
    const skinNote = newSkins
      .map(
        (skin) =>
          `<div class="win-upgrade" data-testid="win-skin">${t('win.skinUnlocked', { name: t(skin.nameKey) })}</div>`
      )
      .join('');
    const confettiCount = justMastered ? 44 : level.width > 6 ? 34 : 20;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('data-testid', 'win-overlay');
    overlay.innerHTML = `
      ${confettiHtml(confettiCount)}
      <div class="dialog win-dialog">
        <h2>${t('win.title')}</h2>
        <div class="win-stars" data-testid="win-stars" data-stars="${stars}">${starIcons(stars)}</div>
        <div class="dialog-sub">${t('win.stats', { moves: endState.moves, par: level.par })}${
          endState.moves <= level.par ? t('win.perfect') : ''
        }</div>
        ${(() => {
          const rewardNotes = [starNote, masterNote, yardStageNote, chapterNote, eliteReplayNote, dailyNote, upgradeNote, skinNote, achievementNote].join('');
          return rewardNotes ? `<div class="win-rewards" data-testid="win-rewards">${rewardNotes}</div>` : '';
        })()}
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
    this.wireDialog(overlay);
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
      // Порог «не раньше N-го уровня» считается по позиции в кампании: у
      // вставленных уровней id 101+, и сравнение по id обошло бы защиту новичка.
      const campaignPosOk = (campaignPos || level.id) >= this.platform.config.interstitialMinLevel;
      await this.maybeShowInterstitial(level.id, campaignPosOk);
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
    // Точка восстановления: если игрок уйдёт из режима (пауза → меню, закрытие
    // вкладки), серию можно будет продолжить за rewarded при следующем входе.
    this.store.setEndlessResume(this.endlessStreak);
    this.store.recordWeeklyEvent(currentWeekKey(), 'endless', this.endlessStreak);
    const stars = starsFor(level, endState.moves, endState.starCollected);
    const achievementsBefore = unlockedAchievementKeys(this.store.data);
    const isNewBest = this.store.recordEndless(this.endlessStreak);
    track({ type: 'endless_finished', streak: this.endlessStreak, best: this.store.data.endlessBest ?? this.endlessStreak });
    const newAchievements = ACHIEVEMENTS.filter(
      (achievement) =>
        !achievementsBefore.has(achievement.key) && unlockedAchievementKeys(this.store.data).has(achievement.key)
    );
    // Выданное фиксируется в сейве: цели растут вместе с кампанией, награда — нет.
    this.store.rememberAchievements(unlockedAchievementKeys(this.store.data));
    this.audio.play('win');
    const achievementNote = newAchievements
      .map(
        (achievement) =>
          `<div class="win-achievement" data-testid="win-achievement">${achievement.icon} ${t(
            'achievements.unlocked'
          )}: ${t(`achievement.${achievement.key}.title`)}</div>`
      )
      .join('');
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('data-testid', 'win-overlay');
    overlay.innerHTML = `
      ${confettiHtml(20)}
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
    this.wireDialog(overlay);
    overlay.querySelectorAll('.win-stars .star.full').forEach((s, i) => {
      (s as HTMLElement).style.animationDelay = `${0.2 + i * 0.28}s`;
      s.classList.add('pop');
    });
    overlay.querySelector<HTMLButtonElement>('[data-testid=btn-next]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      if (button.disabled) return;
      button.disabled = true;
      this.audio.play('click');
      await this.maybeShowInterstitial(level.id, true);
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
      // Явное «Закончить забег» — осознанный финал: точку восстановления снимаем.
      this.store.setEndlessResume(undefined);
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
    // Медали, уже заслуженные в кампании, выдаются при входе: идемпотентно,
    // поэтому повторные заходы ничего не меняют и сейв не переписывают.
    this.store.grantEliteMedals(campaignImpliedMedals(this.store.data.stars));
    const points = elitePoints(this.store.data);
    const rank = rankFor(points);
    track({ type: 'elite_opened', points, rank: rank.key, medals: medaledCount(this.store.data) });
    // Медали за кампанию засчитываются здесь же, поэтому счёт на доске мог
    // измениться без единой сыгранной попытки.
    if (points > 0) void this.platform.submitScore('eliteleague', points);
    const nx = nextRank(points);
    const done = medaledCount(this.store.data);
    const golds = goldCount(this.store.data);
    const medals = this.store.data.eliteMedals ?? {};
    const sections = DIVISIONS.map((division) => {
      const open = divisionUnlocked(medals, division.index);
      const size = division.to - division.from + 1;
      const cards = ELITE_CHALLENGES.filter((c) => divisionOf(c.id) === division.index)
        .map((c) => {
          const medal = medalOf(this.store.data, c.id);
          // Карточка может быть открыта в закрытом дивизионе: медаль по ней
          // засчитана кампанией, и запрещать переигровку было бы враньём.
          const playable = challengeUnlocked(medals, c.id);
          const level = sourceLevel(c);
          const mod = c.modifier !== 'none' ? `<span class="elite-mod">${t(`elite.mod.${c.modifier}`)}</span>` : '';
          // Ремикс подписан честно: игрок должен знать, что двор перестроен, а
          // не решить, что игра переименовала знакомый уровень.
          const remix = c.remixed ? `<span class="elite-mod elite-remix">${t('elite.remix')}</span>` : '';
          return `
        <button class="elite-card${medal ? ' medaled' : ''}${playable ? '' : ' locked'}" data-testid="elite-card-${c.id}" data-challenge="${c.id}" ${
          playable ? '' : 'disabled'
        } title="${escapeHTML(
          playable
            ? [
                c.remixed
                  ? t('elite.remixOrigin', {
                      name: levelText('name', originLevel(c).name) ?? originLevel(c).name
                    })
                  : '',
                ...eliteGoalRows(c).map((r) => r.text)
              ]
                .filter(Boolean)
                .join(' · ')
            : t('elite.divisionLocked', { n: DIVISION_UNLOCK_MEDALS })
        )}">
          <span class="elite-card-medal">${playable ? MEDAL_ICON[medal] || '·' : '🔒'}</span>
          <span class="elite-card-num">${t('elite.challenge')} ${c.id}</span>
          <span class="elite-card-src">${escapeHTML(levelText('name', level.name) ?? level.name)}</span>
          ${remix}${mod}
        </button>`;
        })
        .join('');
      return `
        <h3 class="elite-section${open ? '' : ' locked'}" data-testid="elite-division-${division.index}">
          <span>${t(`division.${division.index}`)}</span>
          <span class="elite-section-sub">${
            open
              ? `🎖️ ${divisionMedals(medals, division.index)}/${size}`
              : `🔒 ${t('elite.divisionLocked', { n: DIVISION_UNLOCK_MEDALS })}`
          }</span>
        </h3>
        <div class="elite-grid">${cards}</div>`;
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
            <span data-testid="elite-medals">🎖️ ${t('elite.medals')}: ${done}/${ELITE_CHALLENGES.length} · 🥇 ${golds}</span>
            ${(this.store.data.endlessBest ?? 0) > 0 ? `<span>🌀 ${t('elite.bestEndless', { n: this.store.data.endlessBest ?? 0 })}</span>` : ''}
          </div>
        </div>
        ${this.weeklyCardHtml()}
        ${sections}
      </div>`;
    this.q('[data-testid=btn-back]').addEventListener('click', () => {
      this.audio.play('click');
      this.showMenu();
    });
    this.q('[data-testid=elite-weekly-play]').addEventListener('click', () => {
      this.audio.play('click');
      this.startWeeklyChallenge(currentWeekKey());
    });
    this.root.querySelectorAll<HTMLButtonElement>('.elite-card').forEach((b) =>
      b.addEventListener('click', () => {
        this.audio.play('click');
        this.startEliteChallenge(Number(b.dataset.challenge));
      })
    );
    // Короткое объяснение при первом заходе. Признак — флаг сейва, а не «нет
    // медалей»: медали теперь могут быть засчитаны по кампании ещё до входа.
    if (this.store.markEliteIntroSeen()) this.showEliteIntro();
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
          <li>${t('elite.intro.4', { n: ELITE_CHALLENGES.filter((c) => c.remixed).length })}</li>
          <li>${t('elite.intro.3')}</li>
          <li>${t('elite.fromCampaign')}</li>
        </ul>
        <button class="btn btn-primary btn-big" data-testid="elite-intro-close">${t('rules.close')}</button>
      </div>`;
    this.q('.elite-screen').appendChild(overlay);
    this.wireDialog(overlay, { onCancel: () => overlay.querySelector<HTMLElement>('[data-testid=elite-intro-close]')?.click() });
    overlay.querySelector('[data-testid=elite-intro-close]')!.addEventListener('click', () => {
      this.audio.play('click');
      overlay.remove();
      if (this.platform.isTV) this.tv.focusDefault(true);
    });
    if (this.platform.isTV) overlay.querySelector<HTMLElement>('[data-testid=elite-intro-close]')!.focus({ preventScroll: true });
  }

  /** Карточка недельного чемпионата над дивизионами лиги. */
  private weeklyCardHtml(): string {
    const challenge = pickWeeklyChallenge(currentWeekKey());
    const level = sourceLevel(challenge);
    const best = this.store.eliteWeeklyOf(currentWeekKey());
    const mod =
      challenge.modifier !== 'none' ? `<span class="elite-mod">${t(`elite.mod.${challenge.modifier}`)}</span>` : '';
    const goals = eliteGoalRows(challenge)
      .map((r) => r.text)
      .join(' · ');
    return `
      <section class="elite-weekly" data-testid="elite-weekly">
        <h3 class="elite-section">🏆 ${t('elite.weekly.title')}</h3>
        <div class="elite-weekly-card">
          <div class="elite-weekly-info">
            <span>${escapeHTML(levelText('name', level.name) ?? level.name)}${mod}</span>
            <span class="elite-weekly-best">${
              best ? t('elite.weekly.best', { n: best.score }) : t('elite.weekly.noAttempt')
            }</span>
            <small class="elite-weekly-rules">${t('elite.weekly.rules')}</small>
          </div>
          <button class="btn btn-primary" data-testid="elite-weekly-play" title="${escapeHTML(goals)}">${t(
            'elite.weekly.play'
          )}</button>
        </div>
      </section>`;
  }

  /** Зачётная попытка чемпионата: то же испытание у всех игроков недели. */
  private startWeeklyChallenge(week: string): void {
    const challenge = pickWeeklyChallenge(week);
    this.weeklyRunWeek = week;
    track({
      type: 'elite_challenge_started',
      challengeId: challenge.id,
      division: divisionOf(challenge.id),
      modifier: challenge.modifier,
      remixed: challenge.remixed
    });
    this.runLevel(sourceLevel(challenge), false, undefined, false, challenge.modifier, challenge);
  }

  private startEliteChallenge(id: number): void {
    const challenge = ELITE_CHALLENGES.find((c) => c.id === id);
    // Дивизион мог закрыться между рендером и кликом (например, «Следующее»
    // после последнего испытания блока) — правило проверяется здесь, а не
    // только атрибутом disabled на кнопке.
    if (!challenge || !challengeUnlocked(this.store.data.eliteMedals ?? {}, id)) {
      this.showEliteScreen();
      return;
    }
    track({
      type: 'elite_challenge_started',
      challengeId: challenge.id,
      division: divisionOf(challenge.id),
      modifier: challenge.modifier,
      remixed: challenge.remixed
    });
    this.runLevel(sourceLevel(challenge), false, undefined, false, challenge.modifier, challenge);
  }

  private finishEliteChallenge(challenge: EliteChallenge, attempt: AttemptResult): void {
    this.setGameplay(false);
    this.audio.engineStop();
    const earned = medalForAttempt(challenge, attempt);
    const rankBefore = rankFor(elitePoints(this.store.data));
    const achievementsBefore = unlockedAchievementKeys(this.store.data);
    const medalsBefore = this.store.data.eliteMedals ?? {};
    const divisionsBefore = DIVISIONS.filter((d) => divisionUnlocked(medalsBefore, d.index)).length;
    const { previous, next } = this.store.recordEliteMedal(challenge.id, earned);
    const improved = next > previous;
    const points = elitePoints(this.store.data);
    const rank = rankFor(points);
    const rankUp = rank.key !== rankBefore.key;
    track({
      type: 'elite_challenge_finished',
      challengeId: challenge.id,
      division: divisionOf(challenge.id),
      modifier: challenge.modifier,
      remixed: challenge.remixed,
      medal: earned,
      previousMedal: previous,
      moves: attempt.moves
    });
    // Открытие дивизиона — ключевая точка воронки: именно здесь режим либо
    // ведёт игрока дальше, либо упирается в гейт.
    const medalsAfter = this.store.data.eliteMedals ?? {};
    for (const division of DIVISIONS) {
      if (division.index > divisionsBefore && divisionUnlocked(medalsAfter, division.index)) {
        track({ type: 'elite_division_unlocked', division: division.index });
      }
    }
    if (rankUp) track({ type: 'elite_rank_up', rank: rank.key, points });
    if (improved) {
      void this.platform.submitScore('eliteleague', points);
      this.leaderboardCache.invalidate('eliteleague');
    }
    // Достижения лиги выдаются здесь: путь кампании сюда не заходит, и без
    // этого блока они молча ждали бы следующего уровня кампании.
    const newAchievements = ACHIEVEMENTS.filter(
      (achievement) =>
        !achievementsBefore.has(achievement.key) && unlockedAchievementKeys(this.store.data).has(achievement.key)
    );
    this.store.rememberAchievements(unlockedAchievementKeys(this.store.data));

    // Недельный чемпионат: попытка засчитана в очки недели, улучшение — в доску.
    let weeklyNote = '';
    if (this.weeklyRunWeek) {
      const week = this.weeklyRunWeek;
      this.weeklyRunWeek = null;
      const score = weeklyScore(earned, attempt.moves);
      if (score > 0 && this.store.recordEliteWeekly(week, score, earned)) {
        void this.platform.submitScore('eliteweekly', score);
        this.leaderboardCache.invalidate('eliteweekly');
        weeklyNote = `<div class="win-upgrade" data-testid="elite-weekly-score">🏆 ${t('elite.weekly.scored', { n: score })}</div>`;
      } else if (score > 0) {
        const kept = this.store.eliteWeeklyOf(week)?.score ?? score;
        weeklyNote = `<div class="win-upgrade" data-testid="elite-weekly-score">🏆 ${t('elite.weekly.bestKept', { n: kept })}</div>`;
      }
    }

    this.audio.play(earned === 3 ? 'win' : earned > 0 ? 'star' : 'thud');
    this.vibrate(earned > 0 ? [28, 45, 28] : 14);

    const medalNow = next as Medal;
    const idx = ELITE_CHALLENGES.findIndex((c) => c.id === challenge.id);
    const following = idx >= 0 && idx < ELITE_CHALLENGES.length - 1 ? ELITE_CHALLENGES[idx + 1] : null;
    // «Следующее» не должно перепрыгивать закрытый дивизион: медаль за это
    // испытание уже записана, поэтому проверка идёт по актуальному сейву.
    const nextCh = following && challengeUnlocked(this.store.data.eliteMedals ?? {}, following.id) ? following : null;
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
        ${weeklyNote}
        ${rankUp ? `<div class="win-master" data-testid="elite-rankup">${t('elite.result.rankUp', { rank: t(`rank.${rank.key}`) })}</div>` : ''}
        ${newAchievements
          .map(
            (achievement) =>
              `<div class="win-note ok" data-testid="elite-achievement">${achievement.icon} ${t(
                'achievements.unlocked'
              )}: ${t(`achievement.${achievement.key}.title`)}</div>`
          )
          .join('')}
        <div class="elite-goals" data-testid="elite-goals">${eliteGoalRows(challenge)
          .map((r) => `<div class="elite-goal${medalNow >= r.medal ? ' done' : ''}">${r.text}</div>`)
          .join('')}</div>
        <button class="btn btn-primary btn-big" data-testid="elite-retry">${t('win.again')}</button>
        <div class="dialog-row">
          ${nextCh ? `<button class="btn" data-testid="elite-next">${t('win.next')}</button>` : ''}
          <button class="btn" data-testid="elite-back">${t('elite.menu')}</button>
        </div>
      </div>`;
    this.q('.overlay-slot').appendChild(overlay);
    this.wireDialog(overlay);
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
