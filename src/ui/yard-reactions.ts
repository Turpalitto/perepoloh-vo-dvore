/**
 * «Живой двор»: дед-комментатор реагирует на события хода. Визуальные реакции
 * окружения (пыль, куры, скрип ворот, искры звезды) уже живут в BoardView —
 * здесь добавляется ПЕРСОНАЖ: маленький портрет деда со сменой настроения и
 * авто-скрывающийся пузырь реплики. Всё декоративно: на логику хода не влияет.
 *
 * Уважает паузу/рекламу/скрытую вкладку (реакции замолкают), prefers-reduced-
 * motion (без прыжков, только текст), и работает как субтитр — реплика видна,
 * даже когда звук выключен (доступность).
 */
import type { GameAudio } from '../game/audio';
import { t } from '../game/i18n';
import {
  type GrandpaEvent,
  type GrandpaMood,
  type GrandpaState,
  commitLine,
  createGrandpaState,
  pickLineVerbose,
  textKeyOf
} from '../game/grandpa';

const MOOD_FACE: Record<GrandpaMood, string> = {
  neutral: '<path class="gp-mouth" d="M20 34 q6 3 12 0"/>',
  happy: '<path class="gp-mouth" d="M19 33 q7 7 14 0"/>',
  surprised: '<ellipse class="gp-mouth" cx="26" cy="35" rx="4" ry="5"/>',
  grumpy: '<path class="gp-mouth" d="M20 36 q6 -4 12 0"/>',
  thinking: '<path class="gp-mouth" d="M21 35 h9"/>',
  celebrating: '<path class="gp-mouth" d="M18 32 q8 9 16 0"/>',
  pointing: '<path class="gp-mouth" d="M20 34 q6 4 12 0"/>'
};

/** SVG-портрет деда: кепка, брови, усы, рот меняется по настроению. */
function grandpaPortrait(mood: GrandpaMood): string {
  const brow = mood === 'surprised' ? -3 : mood === 'grumpy' ? 2 : 0;
  return `<svg viewBox="0 0 52 52" class="gp-face gp-${mood}" aria-hidden="true">
    <circle cx="26" cy="28" r="18" class="gp-skin"/>
    <path d="M8 22 q18 -14 36 0 l-2 -6 q-16 -9 -32 0 Z" class="gp-cap"/>
    <rect x="6" y="20" width="40" height="5" rx="2" class="gp-cap"/>
    <g class="gp-brows" transform="translate(0 ${brow})"><rect x="16" y="23" width="8" height="3" rx="1.5"/><rect x="28" y="23" width="8" height="3" rx="1.5"/></g>
    <circle class="gp-eye" cx="21" cy="29" r="2"/><circle class="gp-eye" cx="33" cy="29" r="2"/>
    ${MOOD_FACE[mood]}
    <path d="M14 38 q12 8 24 0 q-4 8 -12 8 q-8 0 -12 -8Z" class="gp-beard"/>
    <path d="M16 33 q10 6 20 0" class="gp-mustache"/>
  </svg>`;
}

export interface YardDirectorOptions {
  level: number;
  reducedMotion: boolean;
  /** «Живой двор» включён игроком. */
  enabled: boolean;
  /** Уже показанные однократные/сюжетные реплики (из сейва). */
  seen: Iterable<string>;
  /** Вызывается, когда набор seen пополнился (для персиста в сейв). */
  onSeen(id: string): void;
  /**
   * `?grandpaDebug=1` в dev/e2e: логирует в консоль выбранную реплику и причины
   * отсева остальных кандидатов. Никогда не включается в production независимо
   * от query-параметра — гейт по MODE делает вызывающий код (см. app.ts).
   */
  debug?: boolean;
}

export class YardDirector {
  private readonly bubble: HTMLElement;
  private readonly portrait: HTMLElement;
  private readonly state: GrandpaState;
  private paused = false;
  private hideTimer = 0;

  constructor(
    host: HTMLElement,
    private readonly audio: GameAudio,
    private readonly opts: YardDirectorOptions
  ) {
    this.state = createGrandpaState(opts.seen);
    const wrap = document.createElement('div');
    wrap.className = 'grandpa';
    wrap.setAttribute('data-testid', 'grandpa');
    if (!opts.enabled) wrap.classList.add('grandpa-off');
    wrap.innerHTML = `
      <div class="grandpa-portrait" data-testid="grandpa-portrait">${grandpaPortrait('neutral')}</div>
      <div class="grandpa-bubble" data-testid="grandpa-bubble" role="status" aria-live="polite" hidden></div>`;
    host.appendChild(wrap);
    this.portrait = wrap.querySelector('.grandpa-portrait')!;
    this.bubble = wrap.querySelector('.grandpa-bubble')!;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.hide();
  }

  /** Событие двора → возможная реплика деда. Тихо игнорируется, если выключено. */
  react(event: GrandpaEvent, now: number = performance.now()): void {
    if (!this.opts.enabled || this.paused) {
      if (this.opts.debug) console.debug(`[grandpa] ${event}: skipped (director disabled/paused)`);
      return;
    }
    const info = pickLineVerbose(this.state, event, { now, level: this.opts.level });
    if (this.opts.debug) this.logDebug(event, info);
    if (!info.line) return;
    commitLine(this.state, info.line, now);
    if (this.state.seen.has(info.line.id)) this.opts.onSeen(info.line.id);
    this.show(t(textKeyOf(info.line)), info.line.mood, (info.line.priority ?? 0) >= 3);
  }

  private logDebug(event: GrandpaEvent, info: ReturnType<typeof pickLineVerbose>): void {
    if (info.line) {
      console.debug(
        `[grandpa] ${event} -> "${info.line.id}" mood=${info.line.mood} cooldownMs=${info.line.cooldownMs ?? '—'} priority=${info.line.priority ?? 0}`
      );
    } else if (info.blockedByGlobalCooldown !== undefined) {
      console.debug(`[grandpa] ${event} -> none: global cooldown, ${Math.round(info.blockedByGlobalCooldown)}ms left`);
    } else {
      console.debug(`[grandpa] ${event} -> none: no eligible line`, info.skipped);
    }
  }

  private show(text: string, mood: GrandpaMood, sticky: boolean): void {
    this.portrait.innerHTML = grandpaPortrait(mood);
    this.bubble.textContent = text;
    this.bubble.hidden = false;
    this.bubble.classList.toggle('reduced', this.opts.reducedMotion);
    this.bubble.classList.remove('pop');
    if (!this.opts.reducedMotion) {
      void this.bubble.offsetWidth;
      this.bubble.classList.add('pop');
    }
    // «Голос» деда — короткое добродушное бормотание (варьируется в audio).
    this.audio.play('grandpa');
    // Пока дед говорит, фоновая музыка приглушается, чтобы реплика не тонула.
    this.audio.duckMusicFor(sticky ? 5200 : 3200);
    window.clearTimeout(this.hideTimer);
    // Сюжетные реплики висят дольше; обычные — коротко и авто-исчезают.
    this.hideTimer = window.setTimeout(() => this.hide(), sticky ? 5200 : 3200);
  }

  private hide(): void {
    window.clearTimeout(this.hideTimer);
    this.bubble.hidden = true;
    this.bubble.classList.remove('pop');
  }

  destroy(): void {
    window.clearTimeout(this.hideTimer);
  }
}
