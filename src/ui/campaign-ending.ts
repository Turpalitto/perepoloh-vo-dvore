/**
 * Финальная сцена кампании: показывается ОДИН раз при первом прохождении
 * уровня 100. Самодостаточный модуль — принимает контейнер, локализатор и
 * колбэки входа в лигу / возврата во двор. Без зависимости от App и его runLevel.
 * Текст вставляется только через textContent (никакого innerHTML для строк).
 */
import type { t as translate } from '../game/i18n';

export interface CampaignEndingHandlers {
  onEnterLeague(): void;
  onReturn(): void;
  /** Опциональный «продолжить»-звук/вибро на каждой фразе. */
  onBeat?(): void;
}

/**
 * Рисует финальную сцену как overlay в переданный slot. Фразы появляются
 * последовательно; кнопки — после последней. Возвращает функцию очистки.
 */
export function showCampaignEnding(
  slot: HTMLElement,
  t: typeof translate,
  isTV: boolean,
  handlers: CampaignEndingHandlers
): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'overlay campaign-ending';
  overlay.setAttribute('data-testid', 'campaign-ending');

  const scene = document.createElement('div');
  scene.className = 'ending-scene';
  // Силуэты машин соседей на «отдаляющейся» дороге — чистая декорация (SVG-строка
  // безопасна: без пользовательских данных).
  scene.innerHTML = `
    <div class="ending-road">
      <svg viewBox="0 0 320 120" class="ending-cars" aria-hidden="true">
        <rect x="0" y="70" width="320" height="50" fill="rgba(61,44,30,.25)"/>
        ${[20, 90, 160, 230, 285]
          .map(
            (x, i) =>
              `<g transform="translate(${x},${74 + (i % 2) * 10}) scale(${0.7 + (i % 3) * 0.15})" opacity="${0.35 + i * 0.12}"><rect x="0" y="6" width="46" height="16" rx="6" fill="#3d2c1e"/><rect x="8" y="-2" width="26" height="12" rx="5" fill="#3d2c1e"/><circle cx="12" cy="24" r="5" fill="#1c140c"/><circle cx="36" cy="24" r="5" fill="#1c140c"/></g>`
          )
          .join('')}
      </svg>
    </div>`;

  const lines = document.createElement('div');
  lines.className = 'ending-lines';
  scene.appendChild(lines);
  overlay.appendChild(scene);

  const buttons = document.createElement('div');
  buttons.className = 'ending-buttons';
  buttons.style.opacity = '0';
  overlay.appendChild(buttons);
  slot.appendChild(overlay);

  const beats = [t('elite.ending.1'), t('elite.ending.2'), t('elite.ending.title')];
  const timers: number[] = [];
  beats.forEach((text, i) => {
    timers.push(
      window.setTimeout(
        () => {
          const el = document.createElement('div');
          el.className = i === beats.length - 1 ? 'ending-line ending-title' : 'ending-line';
          el.textContent = text;
          lines.appendChild(el);
          handlers.onBeat?.();
        },
        700 + i * 1600
      )
    );
  });

  timers.push(
    window.setTimeout(
      () => {
        const reward = document.createElement('div');
        reward.className = 'ending-reward';
        reward.setAttribute('data-testid', 'ending-reward');
        reward.textContent = t('elite.ending.reward');
        lines.appendChild(reward);

        const enter = document.createElement('button');
        enter.className = 'btn btn-primary btn-big';
        enter.setAttribute('data-testid', 'ending-enter');
        enter.setAttribute('data-tv-default', 'true');
        enter.textContent = t('elite.enter');
        enter.addEventListener('click', handlers.onEnterLeague);

        const ret = document.createElement('button');
        ret.className = 'btn ending-return';
        ret.setAttribute('data-testid', 'ending-return');
        ret.textContent = t('elite.return');
        ret.addEventListener('click', handlers.onReturn);

        buttons.append(enter, ret);
        buttons.style.opacity = '1';
        if (isTV) enter.focus({ preventScroll: true });
      },
      700 + beats.length * 1600
    )
  );

  return () => {
    for (const id of timers) window.clearTimeout(id);
    overlay.remove();
  };
}
