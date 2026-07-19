import './styles.css';
import { GameAudio } from './game/audio';
import { applyDaytime } from './game/daytime';
import { initI18n } from './game/i18n';
import { SaveStore, defaultSave, mergeSave } from './game/save';
import { createPlatform } from './platform';
import { App } from './ui/app';

async function boot(): Promise<void> {
  applyDaytime();
  const platform = await createPlatform();
  let save = defaultSave();
  try {
    const loaded = await platform.loadData();
    if (loaded) save = mergeSave(save, loaded);
  } catch (e) {
    console.warn('Не удалось загрузить сохранение:', e);
  }
  // по умолчанию русский; выбор игрока хранится в сейве, ?lang= — переопределение
  initI18n(save.lang);
  const store = new SaveStore(platform, save);
  const audio = new GameAudio(save.sound, save.music);
  const app = new App(platform, store, audio);
  app.showMenu();
  document.getElementById('boot')?.remove();
  platform.ready();
}

boot().catch((e) => {
  console.error('Игра не смогла запуститься:', e);
  const boot = document.getElementById('boot');
  if (boot) boot.innerHTML = '<div class="boot-title">Что-то пошло не так. Обновите страницу.</div>';
});
