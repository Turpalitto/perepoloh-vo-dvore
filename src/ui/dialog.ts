/**
 * Доступность модальных оверлеев. Игра рисует их сама (без <dialog>), поэтому
 * роль, ловушка фокуса и Escape навешиваются вручную:
 *
 * - role="dialog" + aria-modal — скринридеры объявляют модальность;
 * - фокус входит в диалог при открытии (data-tv-default или первая кнопка)
 *   и возвращается на открывший элемент после удаления оверлея;
 * - Tab циклится внутри диалога, чтобы фокус не убегал под оверлей;
 * - Escape вызывает onCancel, если у диалога есть безопасная отмена.
 *
 * В TV-режиме фокусом управляет TVNavigator (пульт), поэтому здесь остаётся
 * только семантика ролей: перехват Tab/автофокус отключается по data-атрибуту
 * корня .tv-mode, чтобы не спорить с пультовой навигацией.
 */

const FOCUSABLE = 'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])';

function visibleFocusables(scope: HTMLElement): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  });
}

export interface DialogOptions {
  /** Понятное имя диалога для скринридеров, если внутри нет заголовка. */
  label?: string;
  /** Что делать по Escape (например, нажать программно кнопку отмены). */
  onCancel?: () => void;
}

export function wireDialog(overlay: HTMLElement, opts: DialogOptions = {}): void {
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const heading = overlay.querySelector('h1, h2, h3');
  if (heading && !heading.id) {
    // Стабильный id из testid: несколько диалогов не живут одновременно.
    const base = overlay.getAttribute('data-testid') ?? 'dialog';
    heading.id = `${base}-title`;
  }
  if (heading) overlay.setAttribute('aria-labelledby', heading.id);
  else if (opts.label) overlay.setAttribute('aria-label', opts.label);

  const isTV = document.documentElement.classList.contains('tv-mode') || document.body.classList.contains('tv-mode');
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  // Возврат фокуса: когда оверлей удалят из DOM (любым существующим кодом).
  const restore = (): void => {
    observer.disconnect();
    if (!isTV && opener?.isConnected) opener.focus({ preventScroll: true });
  };
  const observer = new MutationObserver(() => {
    if (!overlay.isConnected) restore();
  });

  if (!isTV) {
    const first = overlay.querySelector<HTMLElement>('[data-tv-default]') ?? visibleFocusables(overlay)[0];
    first?.focus({ preventScroll: true });
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && opts.onCancel) {
        event.preventDefault();
        event.stopPropagation();
        opts.onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const list = visibleFocusables(overlay);
      if (list.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const index = list.indexOf(active!);
      event.preventDefault();
      const next =
        event.shiftKey || index === -1
          ? list[(Math.max(index, 0) - 1 + list.length) % list.length]
          : list[(index + 1) % list.length];
      next.focus({ preventScroll: true });
    });
  }

  observer.observe(overlay.parentElement ?? overlay, { childList: true });
}
