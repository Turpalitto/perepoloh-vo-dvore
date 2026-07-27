import './polyfills';
import './styles.css';
import { createDebugTracker, setAnalyticsTracker, track } from './game/analytics';
import { GameAudio } from './game/audio';
import { applyDaytime } from './game/daytime';
import { initI18n, t } from './game/i18n';
import { initReturnReminder } from './game/reminder';
import { queryParam } from './query';
import { applySeason } from './game/season';
import { SaveStore, defaultSave, mergeSave, totalStars } from './game/save';
import { createPlatform } from './platform';
import { App } from './ui/app';
import { setTargetSkin } from './ui/sprites';

/** Ненавязчивое уведомление, что играем локально (SDK недоступен) — не блокирует UI. */
function showFallbackNotice(): void {
  const el = document.createElement('div');
  el.className = 'platform-fallback-notice';
  el.setAttribute('data-testid', 'platform-fallback-notice');
  el.textContent = t('platform.fallbackNotice');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

async function boot(): Promise<void> {
  const qaTools = (import.meta.env.DEV || import.meta.env.MODE === 'e2e') && queryParam('qaTools') === '1';
  const qaMode = qaTools && queryParam('qa') === '1';
  // Только dev/e2e + явный query-параметр: debug-трекер печатает воронку в
  // консоль и перекрывает трекер платформы (см. ниже), в production недоступен.
  const analyticsDebug =
    (import.meta.env.DEV || import.meta.env.MODE === 'e2e') && queryParam('analyticsDebug') === '1';
  applyDaytime();
  applySeason();
  let platform = await createPlatform();
  let save = defaultSave();
  let qaToolsModule: typeof import('./game/qa-mode') | null = null;
  let hadSave = false;
  try {
    const loaded = await platform.loadData();
    if (loaded) {
      save = mergeSave(save, loaded);
      hadSave = true;
    }
  } catch (e) {
    console.warn('Не удалось загрузить сохранение:', e);
  }
  if (qaMode) {
    qaToolsModule = await import('./game/qa-mode');
    save = qaToolsModule.createQaSave(save);
    platform = qaToolsModule.createQaPlatform(platform);
  }
  // Приёмник воронки выбирает платформа (Метрика на Яндексе, консоль локально).
  // Ставим его после QA-обёртки, иначе game_start ушёл бы из тестового сеанса,
  // и отправляем первое событие уже настоящим трекером, а не в no-op.
  setAnalyticsTracker(analyticsDebug ? createDebugTracker() : platform.createAnalyticsTracker());
  track({ type: 'game_start' });
  // Первый запуск следует языку платформы; ручной выбор хранится в сейве.
  // ?lang= остаётся QA-переопределением и обрабатывается внутри initI18n.
  save.lang = initI18n(hadSave && save.langChosen ? save.lang : platform.getLang());
  document.title = `${t('game.titleTop')} ${t('game.titleBottom')}`;
  setTargetSkin(save.targetSkin);
  document.documentElement.classList.toggle('high-contrast', save.highContrast === true);
  const store = new SaveStore(platform, save);
  initReturnReminder(store);
  const audio = new GameAudio(save.sound, save.music);
  const app = new App(platform, store, audio);
  // Сначала создаём полностью интерактивный экран, затем снимаем загрузчик и
  // сообщаем Game Ready. Только после ready запускаем первый геймплей.
  app.showMenu();
  if (qaTools) {
    qaToolsModule ??= await import('./game/qa-mode');
    qaToolsModule.installQaTools(qaMode, { playCustomLevel: (level) => app.playCustomLevel(level) });
  }
  document.getElementById('boot')?.remove();
  platform.ready();
  // Sticky-баннер в свободных полях по краям широкого экрана; не блокирует запуск.
  if (!platform.isTV) void platform.showBanner();
  // SDK недоступен (сбой загрузки/init) — ненавязчивое уведомление, не блокирует игру.
  if (platform.name === 'local-fallback') showFallbackNotice();
  // первый запуск на Яндексе — сразу в геймплей (конверсия первой сессии);
  // локально и после любого прогресса — обычное меню
  if (platform.name === 'yandex' && totalStars(save) === 0 && !save.daily) {
    app.startLevel(1);
  }
}

boot().catch((e) => {
  console.error('Игра не смогла запуститься:', e);
  const boot = document.getElementById('boot');
  if (boot) boot.innerHTML = '<div class="boot-title">Что-то пошло не так. Обновите страницу.</div>';
});
