import './polyfills';
import './styles.css';
import { GameAudio } from './game/audio';
import { applyDaytime } from './game/daytime';
import { initI18n, t } from './game/i18n';
import { initReturnReminder } from './game/reminder';
import { applySeason } from './game/season';
import { SaveStore, defaultSave, mergeSave, totalStars } from './game/save';
import { createPlatform } from './platform';
import { App } from './ui/app';
import { setTargetSkin } from './ui/sprites';

async function boot(): Promise<void> {
  applyDaytime();
  applySeason();
  const platform = await createPlatform();
  let save = defaultSave();
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
  document.getElementById('boot')?.remove();
  platform.ready();
  // Sticky-баннер в свободных полях по краям широкого экрана; не блокирует запуск.
  if (!platform.isTV) void platform.showBanner();
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
