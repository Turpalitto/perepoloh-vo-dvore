/**
 * Экраны и игровой контроллер. Никакой игровой логики —
 * только связывание core, BoardView, платформы и сохранений.
 */
import levelsJson from '../levels/levels.json';
import type { LevelDef } from '../core/types';
import { GameState, createState, starsFor } from '../core/game';
import { hint } from '../core/solver';
import type { GameAudio } from '../game/audio';
import { getLang, levelText, setLang, t } from '../game/i18n';
import {
  INTERSTITIAL_EVERY,
  UPGRADES,
  isLevelUnlocked,
  newlyUnlocked,
  nextLevelToPlay,
  nextUpgrade,
  unlockedUpgrades
} from '../game/progression';
import { SaveStore, totalStars } from '../game/save';
import type { AdHandlers, Platform } from '../platform/types';
import { BoardView } from './board';
import { yardSVG } from './yard';

const LEVELS = levelsJson as LevelDef[];

const soundOnIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 9 h4 l5 -4 v14 l-5 -4 H4 Z" fill="currentColor"/><path d="M16 8 q3 4 0 8 M18.5 5.5 q5 6.5 0 13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
const soundOffIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 9 h4 l5 -4 v14 l-5 -4 H4 Z" fill="currentColor"/><path d="M16 9 l6 6 M22 9 l-6 6" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`;
const pauseIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor"/></svg>`;
const musicOnIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M9 17.5 V6.5 l9 -2 v11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="7" cy="17.5" r="2.6" fill="currentColor"/><circle cx="16" cy="15.5" r="2.6" fill="currentColor"/></svg>`;
const musicOffIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M9 17.5 V6.5 l9 -2 v11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" opacity="0.45"/><circle cx="7" cy="17.5" r="2.6" fill="currentColor" opacity="0.45"/><circle cx="16" cy="15.5" r="2.6" fill="currentColor" opacity="0.45"/><line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;

function starIcons(n: number, of = 3): string {
  let s = '';
  for (let i = 0; i < of; i++) s += `<span class="star ${i < n ? 'full' : ''}">★</span>`;
  return s;
}

export class App {
  private root: HTMLElement;
  private winsSinceAd = 0;
  private inGameplay = false;

  constructor(
    private readonly platform: Platform,
    private readonly store: SaveStore,
    private readonly audio: GameAudio
  ) {
    this.root = document.getElementById('app')!;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.inGameplay) this.platform.gameplayStop();
      } else if (this.inGameplay) {
        this.platform.gameplayStart();
      }
    });
    document.addEventListener(
      'pointerdown',
      () => {
        this.audio.unlock();
        this.audio.startAmbient();
        this.audio.startMusic();
      },
      { capture: true }
    );
  }

  private setGameplay(on: boolean): void {
    if (on === this.inGameplay) return;
    this.inGameplay = on;
    if (on) this.platform.gameplayStart();
    else this.platform.gameplayStop();
  }

  private adHandlers(extraPause?: () => void, extraResume?: () => void): AdHandlers {
    return {
      onPause: () => {
        this.audio.duck(true);
        this.setGameplay(false);
        extraPause?.();
      },
      onResume: () => {
        this.audio.duck(false);
        extraResume?.();
      }
    };
  }

  private soundToggleHtml(testid: string): string {
    return `<button class="icon-btn sound-toggle" data-testid="${testid}" aria-label="Звук">${
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
    return `<button class="icon-btn" data-testid="${testid}" aria-label="Музыка">${
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

  // ---------- меню ----------

  showMenu(): void {
    this.setGameplay(false);
    this.audio.engineStop();
    const total = totalStars(this.store.data);
    const max = LEVELS.length * 3;
    const next = nextUpgrade(total);
    const hasProgress = total > 0;
    this.root.innerHTML = `
      <div class="screen menu-screen" data-testid="screen-menu">
        <div class="yard-bg">${yardSVG(unlockedUpgrades(total))}</div>
        <div class="menu-ui">
          <h1 class="game-title"><span>Переполох</span><span>во дворе</span></h1>
          <div class="menu-buttons">
            <button class="btn btn-primary btn-big" data-testid="menu-play">${
              hasProgress ? t('menu.continue') : t('menu.play')
            }</button>
            <button class="btn btn-big" data-testid="menu-levels">${t('menu.levels')}</button>
          </div>
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
          <button class="icon-btn lang-toggle" data-testid="lang-toggle" aria-label="Language">${getLang().toUpperCase()}</button>
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
    this.wireSoundToggle(this.q('[data-testid=sound-toggle]'));
    this.wireMusicToggle(this.q('[data-testid=music-toggle]'));
    this.q('[data-testid=lang-toggle]').addEventListener('click', () => {
      const order = ['ru', 'en', 'tr'] as const;
      const next = order[(order.indexOf(getLang()) + 1) % order.length];
      setLang(next);
      this.store.setLang(next);
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
  }

  private showRules(): void {
    const items = [1, 2, 3, 4, 5, 6, 7].map((i) => `<li>${t(`rules.${i}`)}</li>`).join('');
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
  }

  // ---------- выбор уровня ----------

  showLevels(): void {
    this.setGameplay(false);
    const cards = LEVELS.map((l) => {
      const unlocked = isLevelUnlocked(LEVELS, this.store.data, l.id);
      const stars = this.store.starsOf(l.id);
      return `
        <button class="level-card ${unlocked ? '' : 'locked'}" data-level="${l.id}" data-testid="level-card-${l.id}" ${
          unlocked ? '' : 'disabled'
        }>
          <span class="level-num">${l.id}</span>
          <span class="level-stars">${
            unlocked
              ? starIcons(stars)
              : `<svg class="lock" viewBox="0 0 24 24" width="22" height="22" aria-label="Закрыт"><rect x="5" y="10.5" width="14" height="10" rx="3" fill="#a08c66"/><path d="M8 11 V7.5 a4 4 0 0 1 8 0 V11" fill="none" stroke="#a08c66" stroke-width="2.6"/></svg>`
          }</span>
        </button>`;
    }).join('');
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
  }

  // ---------- игра ----------

  startLevel(id: number): void {
    const level = LEVELS.find((l) => l.id === id);
    if (!level) {
      this.showMenu();
      return;
    }
    this.store.setLastLevel(id);
    const starHud = level.star ? `<span class="hud-star" data-testid="hud-star">★</span>` : '';
    this.root.innerHTML = `
      <div class="screen game-screen" data-testid="screen-game">
        <div class="hud hud-top">
          <button class="icon-btn" data-testid="btn-pause" aria-label="${t('pause.title')}">${pauseIcon}</button>
          <div class="hud-level">${level.id}. ${levelText('name', level.name)}</div>
          <div class="hud-right">
            ${starHud}
            <div class="hud-moves">${t('hud.moves')} <b data-testid="hud-moves">0</b><span class="hud-par">${t('hud.goal', { n: level.par2 })}</span></div>
          </div>
        </div>
        <div class="board-host" data-testid="board-host"></div>
        <div class="hud hud-bottom">
          <button class="btn" data-testid="btn-undo" disabled>${t('btn.undo')}</button>
          <button class="btn" data-testid="btn-restart">${t('btn.restart')}</button>
          <button class="btn" data-testid="btn-hint">${t('btn.hint')}</button>
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

    const bv = new BoardView(host, level, cur, {
      onPick: () => {
        this.audio.play('pick');
        this.audio.engineStart();
      },
      onRelease: () => this.audio.engineStop(),
      onBump: () => {
        this.audio.play('thud');
        navigator.vibrate?.(14);
      },
      onGateOpen: () => this.audio.play('gate'),
      onCommit: (res) => {
        undoStack.push(cur);
        cur = res.state;
        this.audio.play('move');
        if (res.starCollected) {
          this.audio.play('star');
          navigator.vibrate?.(25);
          this.flyStarToHud();
        }
        if (res.exited) this.audio.play('honk');
        if (Math.random() < 0.25) this.audio.play('cluck');
        refreshHud();
      },
      onExitDone: () => {
        if (!finished) {
          finished = true;
          this.finishLevel(level, cur);
        }
      }
    });
    this.setGameplay(true);

    undoBtn.addEventListener('click', () => {
      if (finished || cur.won) return; // не отменяем победный выезд
      const prev = undoStack.pop();
      if (!prev) return;
      cur = prev;
      bv.setState(prev);
      this.audio.play('undo');
      refreshHud();
    });
    this.q('[data-testid=btn-restart]').addEventListener('click', () => {
      if (finished || cur.won) return;
      undoStack.length = 0;
      cur = createState(level);
      bv.setState(cur);
      this.audio.play('click');
      refreshHud();
    });
    this.q('[data-testid=btn-pause]').addEventListener('click', () => {
      if (finished || cur.won) return;
      this.audio.play('click');
      this.showPause(level, bv);
    });
    this.q('[data-testid=btn-hint]').addEventListener('click', async () => {
      if (finished || cur.won) return;
      this.audio.play('click');
      bv.interactive = false;
      try {
        const ok = await this.platform.showRewarded(this.adHandlers());
        if (ok) {
          const move = hint(level, cur);
          if (move) bv.showHint(move);
        }
      } finally {
        bv.interactive = true;
      }
    });

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
    }
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

  private showPause(level: LevelDef, bv: BoardView): void {
    this.setGameplay(false);
    this.audio.engineStop();
    bv.interactive = false;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.setAttribute('data-testid', 'pause-overlay');
    overlay.innerHTML = `
      <div class="dialog">
        <h2>${t('pause.title')}</h2>
        <div class="dialog-sub">${level.id}. ${levelText('name', level.name)}</div>
        <button class="btn btn-primary btn-big" data-testid="btn-resume">${t('pause.resume')}</button>
        <button class="btn btn-big" data-testid="btn-pause-restart">${t('pause.restart')}</button>
        <div class="dialog-row">
          ${this.soundToggleHtml('pause-sound')}
          ${this.musicToggleHtml('pause-music')}
          <button class="btn" data-testid="btn-exit-menu">${t('pause.menu')}</button>
        </div>
      </div>`;
    this.q('.overlay-slot').appendChild(overlay);
    this.wireSoundToggle(overlay.querySelector('[data-testid=pause-sound]')!);
    this.wireMusicToggle(overlay.querySelector('[data-testid=pause-music]')!);
    overlay.querySelector('[data-testid=btn-resume]')!.addEventListener('click', () => {
      this.audio.play('click');
      overlay.remove();
      bv.interactive = true;
      this.setGameplay(true);
    });
    overlay.querySelector('[data-testid=btn-pause-restart]')!.addEventListener('click', () => {
      this.audio.play('click');
      this.startLevel(level.id);
      this.setGameplay(true);
    });
    overlay.querySelector('[data-testid=btn-exit-menu]')!.addEventListener('click', () => {
      this.audio.play('click');
      this.showMenu();
    });
  }

  private finishLevel(level: LevelDef, endState: GameState): void {
    this.setGameplay(false);
    this.audio.engineStop();
    navigator.vibrate?.([28, 45, 28]);
    const stars = starsFor(level, endState.moves, endState.starCollected);
    const before = totalStars(this.store.data);
    const improved = this.store.recordResult(level.id, stars);
    const after = totalStars(this.store.data);
    const unlocked = newlyUnlocked(before, after);
    if (improved) void this.platform.submitScore(after);
    this.audio.play('win');
    const maxTotal = LEVELS.length * 3;
    const justMastered = before < maxTotal && after === maxTotal;
    if (justMastered) navigator.vibrate?.([20, 40, 20, 40, 60]);

    const idx = LEVELS.findIndex((l) => l.id === level.id);
    const next = idx >= 0 && idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
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
    const confettiColors = ['#e2574c', '#f6c445', '#45968f', '#3f7fd1', '#e88fb6'];
    const confetti = Array.from({ length: justMastered ? 44 : 20 }, () => {
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
        ${upgradeNote}
        ${
          next
            ? `<button class="btn btn-primary btn-big" data-testid="btn-next">${t('win.next')}</button>`
            : `<div class="win-note ok">${t('win.allDone')}</div><button class="btn btn-primary btn-big" data-testid="btn-final-menu">${t('win.menu')}</button>`
        }
        <div class="dialog-row">
          <button class="btn" data-testid="btn-again">${t('win.again')}</button>
          <button class="btn" data-testid="btn-win-menu">${t('win.menu')}</button>
        </div>
      </div>`;
    this.q('.overlay-slot').appendChild(overlay);
    const starEls = overlay.querySelectorAll('.win-stars .star.full');
    starEls.forEach((s, i) => {
      (s as HTMLElement).style.animationDelay = `${0.2 + i * 0.28}s`;
      s.classList.add('pop');
    });

    overlay.querySelector('[data-testid=btn-next]')?.addEventListener('click', async () => {
      this.audio.play('click');
      this.winsSinceAd++;
      if (this.winsSinceAd >= INTERSTITIAL_EVERY) {
        this.winsSinceAd = 0;
        await this.platform.showInterstitial(this.adHandlers());
      }
      if (next) this.startLevel(next.id);
    });
    overlay.querySelector('[data-testid=btn-again]')?.addEventListener('click', () => {
      this.audio.play('click');
      this.startLevel(level.id);
    });
    overlay.querySelector('[data-testid=btn-win-menu]')?.addEventListener('click', () => {
      this.audio.play('click');
      this.showMenu();
    });
    overlay.querySelector('[data-testid=btn-final-menu]')?.addEventListener('click', () => {
      this.audio.play('click');
      this.showMenu();
    });
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    const el = this.root.querySelector<T>(sel);
    if (!el) throw new Error(`не найден элемент ${sel}`);
    return el;
  }
}

export { LEVELS, UPGRADES };
