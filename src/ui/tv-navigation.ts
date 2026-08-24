import { t } from '../game/i18n';

export interface TVNavDeps {
  /** Корневой элемент приложения (область поиска фокуса и подписки keydown). */
  root: HTMLElement;
  /** Слот оверлеев (сюда рисуется диалог выхода). */
  overlaySlot(): HTMLElement;
  isTV(): boolean;
  requestFullscreen(): void;
  exit(): void;
}

/**
 * Навигация Android TV-пульта: фокус по стрелкам (геометрический выбор
 * ближайшего контроля), Enter-активация, автофокус на новом UI через
 * MutationObserver и стек «назад» (handleBack). Раньше ~175 строк жили
 * в App; граница вынесения чистая — блок трогает только DOM внутри root
 * и платформенные fullscreen/exit.
 */
export class TVNavigator {
  private timer = 0;
  private observer: MutationObserver | null = null;
  private fullscreenRequested = false;
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.deps.isTV()) return;
    const isBack = event.key === 'Escape' || event.key === 'BrowserBack' || event.key === 'GoBack';
    if (isBack) {
      if (event.repeat) return;
      event.preventDefault();
      this.handleBack();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) return;
    this.requestFullscreen();
    if (event.defaultPrevented) return;
    if (event.key === 'Enter') {
      if (event.repeat) return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.matches('button:not([disabled])')) {
        event.preventDefault();
        active.click();
      } else {
        this.focusDefault(true);
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
    this.moveFocus(direction.dx, direction.dy);
  };

  constructor(private readonly deps: TVNavDeps) {}

  /** Подписки клавиатуры и наблюдателя DOM. Вызывать один раз при старте. */
  attach(): void {
    if (!this.deps.isTV()) return;
    document.addEventListener('keydown', this.onKeyDown);
    this.observer = new MutationObserver(() => this.scheduleFocus());
    this.observer.observe(this.deps.root, { childList: true, subtree: true });
  }

  detach(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.observer?.disconnect();
    this.observer = null;
    window.clearTimeout(this.timer);
  }

  scheduleFocus(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.focusDefault(), 0);
  }

  focusDefault(force = false): void {
    if (!this.deps.isTV()) return;
    const root = this.deps.root;
    const active = document.activeElement as HTMLElement | null;
    if (!force && active && root.contains(active) && this.visibleControls().includes(active)) return;
    const overlay = root.querySelector<HTMLElement>('.overlay:last-of-type');
    const target =
      overlay?.querySelector<HTMLElement>('[data-tv-default], button:not([disabled])') ??
      root.querySelector<HTMLElement>(
        '[data-tv-default], .level-card.current:not([disabled]), .board[tabindex], button:not([disabled])'
      );
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private visibleControls(): HTMLElement[] {
    const overlays = this.deps.root.querySelectorAll<HTMLElement>('.overlay');
    const scope = overlays.length > 0 ? overlays[overlays.length - 1] : this.deps.root;
    return Array.from(scope.querySelectorAll<HTMLElement>('button:not([disabled]), .board[tabindex]')).filter(
      (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      }
    );
  }

  private moveFocus(dx: number, dy: number): void {
    const controls = this.visibleControls();
    if (controls.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    if (!active || !controls.includes(active)) {
      this.focusDefault(true);
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
      // Поперечное отклонение штрафуется: пульт ведёт по направлению, а не
      // к ближайшей геометрически клетке.
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

  private requestFullscreen(): void {
    if (this.fullscreenRequested) return;
    this.fullscreenRequested = true;
    this.deps.requestFullscreen();
  }

  /**
   * Стек «назад»: настройки → диалог выхода → пауза → закрываемые оверлеи →
   * btn-back → btn-pause → диалог выхода. Порядок важен и покрыт e2e.
   */
  handleBack(): void {
    if (!this.deps.isTV()) return;
    const root = this.deps.root;
    const settingsPanel = root.querySelector<HTMLElement>('[data-testid=menu-settings-panel]:not([hidden])');
    if (settingsPanel) {
      settingsPanel.hidden = true;
      const settingsToggle = root.querySelector<HTMLElement>('[data-testid=menu-settings]');
      settingsToggle?.classList.remove('active');
      settingsToggle?.setAttribute('aria-expanded', 'false');
      root.querySelector<HTMLElement>('[data-testid=menu-play]')?.focus({ preventScroll: true });
      return;
    }
    const exitOverlay = root.querySelector<HTMLElement>('[data-testid=tv-exit-overlay]');
    if (exitOverlay) {
      exitOverlay.remove();
      this.scheduleFocus();
      return;
    }
    const pauseOverlay = root.querySelector('[data-testid=pause-overlay]');
    if (pauseOverlay) {
      this.showExitDialog();
      return;
    }
    const dismiss = root.querySelector<HTMLElement>(
      '[data-testid=gift-close], [data-testid=btn-rules-close], [data-testid=btn-win-menu], [data-testid=btn-final-menu]'
    );
    if (dismiss) {
      dismiss.click();
      return;
    }
    const back = root.querySelector<HTMLElement>('[data-testid=btn-back]');
    if (back) {
      back.click();
      return;
    }
    const pause = root.querySelector<HTMLElement>('[data-testid=btn-pause]');
    if (pause) {
      pause.click();
      return;
    }
    this.showExitDialog();
  }

  private showExitDialog(): void {
    if (this.deps.root.querySelector('[data-testid=tv-exit-overlay]')) return;
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
    this.deps.overlaySlot().appendChild(overlay);
    overlay.querySelector('[data-testid=tv-exit-stay]')!.addEventListener('click', () => {
      overlay.remove();
      this.focusDefault(true);
    });
    overlay.querySelector('[data-testid=tv-exit-confirm]')!.addEventListener('click', () => {
      this.deps.exit();
    });
    overlay.querySelector<HTMLElement>('[data-testid=tv-exit-stay]')!.focus({ preventScroll: true });
  }
}
