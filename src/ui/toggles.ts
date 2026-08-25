import type { GameAudio } from '../game/audio';
import type { SaveStore } from '../game/save';
import { requestReminderPermission } from '../game/reminder';
import { t } from '../game/i18n';

/**
 * Иконки-тумблеры. Жили в app.ts и использовались только методами отсюда —
 * переехали вместе с ними.
 */
const soundOnIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 9 h4 l5 -4 v14 l-5 -4 H4 Z" fill="currentColor"/><path d="M16 8 q3 4 0 8 M18.5 5.5 q5 6.5 0 13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
const soundOffIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 9 h4 l5 -4 v14 l-5 -4 H4 Z" fill="currentColor"/><path d="M16 9 l6 6 M22 9 l-6 6" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`;
const musicOnIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M9 17.5 V6.5 l9 -2 v11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="7" cy="17.5" r="2.6" fill="currentColor"/><circle cx="16" cy="15.5" r="2.6" fill="currentColor"/></svg>`;
const musicOffIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M9 17.5 V6.5 l9 -2 v11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" opacity="0.45"/><circle cx="7" cy="17.5" r="2.6" fill="currentColor" opacity="0.45"/><circle cx="16" cy="15.5" r="2.6" fill="currentColor" opacity="0.45"/><line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const vibrateOnIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><rect x="8" y="4" width="8" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M4 9 v6 M2 11 v2 M20 9 v6 M22 11 v2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
const vibrateOffIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><rect x="8" y="4" width="8" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2.2" opacity="0.45"/><line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const bellOnIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 3.5a5.5 5.5 0 0 0-5.5 5.5v3l-2 3.5h15l-2-3.5V9A5.5 5.5 0 0 0 12 3.5Z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/><path d="M9.5 18.5a2.5 2.5 0 0 0 5 0" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>`;
const bellOffIcon = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 3.5a5.5 5.5 0 0 0-5.5 5.5v3l-2 3.5h15l-2-3.5V9A5.5 5.5 0 0 0 12 3.5Z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" opacity="0.45"/><path d="M9.5 18.5a2.5 2.5 0 0 0 5 0" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" opacity="0.45"/><line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;

export interface ToggleDeps {
  audio: GameAudio;
  store: SaveStore;
  /** Виброотклик игры (учитывает настройку вибрации). */
  vibrate(pattern: number | number[]): void;
}

/**
 * Семейство настроек-переключателей (звук, музыка, вибрация, напоминания).
 * Рисует кнопку с иконкой состояния и вешает обработчик, синхронизирующий
 * движок аудио и сейв. Используется на экране настроек и в паузе — раньше
 * восемь методов этого класса жили прямо в App.
 */
export class SettingsToggles {
  constructor(private readonly deps: ToggleDeps) {}

  private iconBtn(testid: string, ariaKey: string, icon: string, pressed?: boolean): string {
    const pressedAttr = pressed === undefined ? '' : ` aria-pressed="${pressed}"`;
    return `<button class="icon-btn" data-testid="${testid}" aria-label="${t(ariaKey)}"${pressedAttr}>${icon}</button>`;
  }

  soundHtml(testid: string): string {
    return this.iconBtn(
      testid,
      'audio.sound',
      this.deps.audio.enabled ? soundOnIcon : soundOffIcon,
      this.deps.audio.enabled
    );
  }

  wireSound(el: HTMLElement): void {
    el.addEventListener('click', () => {
      const on = !this.deps.audio.enabled;
      this.deps.audio.setEnabled(on);
      this.deps.store.setSound(on);
      el.innerHTML = on ? soundOnIcon : soundOffIcon;
      el.setAttribute('aria-pressed', String(on));
      this.deps.audio.play('click');
    });
  }

  musicHtml(testid: string): string {
    return this.iconBtn(
      testid,
      'audio.music',
      this.deps.audio.musicEnabled ? musicOnIcon : musicOffIcon,
      this.deps.audio.musicEnabled
    );
  }

  wireMusic(el: HTMLElement): void {
    el.addEventListener('click', () => {
      const on = !this.deps.audio.musicEnabled;
      this.deps.audio.setMusicEnabled(on);
      this.deps.store.setMusic(on);
      el.innerHTML = on ? musicOnIcon : musicOffIcon;
      el.setAttribute('aria-pressed', String(on));
      this.deps.audio.play('click');
    });
  }

  vibrationHtml(testid: string): string {
    return this.iconBtn(
      testid,
      'audio.vibration',
      this.deps.store.vibrationEnabled() ? vibrateOnIcon : vibrateOffIcon,
      this.deps.store.vibrationEnabled()
    );
  }

  wireVibration(el: HTMLElement): void {
    el.addEventListener('click', () => {
      const on = !this.deps.store.vibrationEnabled();
      this.deps.store.setVibration(on);
      el.innerHTML = on ? vibrateOnIcon : vibrateOffIcon;
      el.setAttribute('aria-pressed', String(on));
      this.deps.audio.play('click');
      if (on) this.deps.vibrate(20);
    });
  }

  /** Пустая строка, если напоминания платформой не поддерживаются. */
  bellHtml(testid: string): string {
    const supported = typeof Notification !== 'undefined' && Notification.permission !== 'denied';
    if (!supported) return '';
    const on = this.deps.store.data.notifyOptIn === true && Notification.permission === 'granted';
    return this.iconBtn(testid, 'audio.reminders', on ? bellOnIcon : bellOffIcon, on);
  }

  wireBell(el: HTMLElement): void {
    el.addEventListener('click', async () => {
      this.deps.audio.play('click');
      const on = this.deps.store.data.notifyOptIn === true && Notification.permission === 'granted';
      if (on) {
        this.deps.store.setNotifyOptIn(false);
        el.innerHTML = bellOffIcon;
        el.setAttribute('aria-pressed', 'false');
      } else {
        const granted = await requestReminderPermission(this.deps.store);
        el.innerHTML = granted ? bellOnIcon : bellOffIcon;
        el.setAttribute('aria-pressed', String(granted));
      }
    });
  }
}
