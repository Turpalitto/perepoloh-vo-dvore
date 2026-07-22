/**
 * Локальное напоминание вернуться в игру — лучшее, что доступно статичной
 * игре без сервера и push-инфраструктуры: обычный Notification API,
 * запланированный, пока вкладка/процесс остаются открытыми. Это НЕ настоящий
 * push — если вкладку закрыть, таймер умирает вместе с ней. Честная замена
 * push для казуальной игры без бэкенда, а не его полноценный аналог.
 */
import type { SaveStore } from './save';

const REMINDER_DELAY_MS = 20 * 60 * 60 * 1000; // 20 часов — раньше, чем сгорит daily-streak

let scheduled = false;

export function initReturnReminder(store: SaveStore): void {
  if (typeof Notification === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) scheduleReminder(store);
  });
}

function scheduleReminder(store: SaveStore): void {
  if (scheduled || !store.data.notifyOptIn || Notification.permission !== 'granted') return;
  scheduled = true;
  window.setTimeout(() => {
    scheduled = false;
    if (!document.hidden || !store.data.notifyOptIn) return;
    try {
      new Notification('Переполох во дворе', {
        body: 'Дедов жигулёнок заскучал во дворе — загляни и не теряй серию 🔥',
        tag: 'return-reminder'
      });
    } catch {
      // Некоторые окружения (например iOS Safari) не поддерживают Notification вне PWA.
    }
  }, REMINDER_DELAY_MS);
}

/** Запрашивает разрешение у пользователя; возвращает итоговое состояние opt-in. */
export async function requestReminderPermission(store: SaveStore): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'denied') return false;
  const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  const granted = result === 'granted';
  store.setNotifyOptIn(granted);
  return granted;
}
