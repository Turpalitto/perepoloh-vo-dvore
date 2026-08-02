import levelsJson from '../levels/levels.json';
import { ELITE_CHALLENGES } from '../levels/elite-challenges';
import type { Platform } from '../platform/types';
import { noopTracker } from './analytics';
import { getLang } from './i18n';
import type { SaveData } from './save';
import { withQueryParam } from '../query';

export function createQaSave(base: SaveData): SaveData {
  return {
    ...base,
    stars: Object.fromEntries(levelsJson.map((level) => [String(level.id), 3])),
    lastLevel: levelsJson[levelsJson.length - 1].id,
    campaignDone: true,
    endingSeen: true,
    eliteIntroSeen: true,
    /**
     * Бронза по всем испытаниям — чтобы «открыть всё» действительно открывало
     * всё. Пустой список медалей оставлял лигу за её собственным гейтом:
     * дивизион открывается тремя медалями предыдущего, и проверяющий видел
     * только первый блок из пяти.
     *
     * Именно бронза, а не золото: все двадцать пять испытаний доступны, но
     * улучшение медали, повышение ранга и достижения лиги остаются проверяемыми
     * — с золотом по всем и то и другое было бы уже выдано.
     */
    eliteMedals: Object.fromEntries(ELITE_CHALLENGES.map((challenge) => [String(challenge.id), 1])),
    endlessBest: 0,
    hintTokens: 99,
    tutorialSeen: true
  };
}

export function createQaPlatform(platform: Platform): Platform {
  return {
    ...platform,
    saveData: async () => {},
    submitScore: async () => {},
    // QA-сеанс не должен попадать в продуктовую воронку.
    createAnalyticsTracker: () => noopTracker,
    requestReview: async () => false,
    showInterstitial: async () => false,
    showRewarded: async () => true
  };
}

const LABELS = {
  ru: {
    unlock: 'Открыть всё для проверки',
    exit: 'Вернуться к обычному прогрессу',
    notice: 'Режим проверки: прогресс и рейтинги не сохраняются'
  },
  en: {
    unlock: 'Unlock everything for testing',
    exit: 'Return to normal progress',
    notice: 'QA mode: progress and scores are not saved'
  },
  tr: {
    unlock: 'Test için her şeyi aç',
    exit: 'Normal ilerlemeye dön',
    notice: 'Test modu: ilerleme ve skorlar kaydedilmez'
  }
} as const;

export interface QaHooks {
  playCustomLevel: (level: import('../core/types').LevelDef) => void;
}

export function installQaTools(active: boolean, hooks?: QaHooks): void {
  const root = document.getElementById('app');
  if (!root) return;

  const mount = () => {
    const panel = root.querySelector<HTMLElement>('[data-testid=menu-settings-panel]');
    if (active && hooks && panel && !panel.querySelector('[data-testid=editor-open]')) {
      const editorBtn = document.createElement('button');
      editorBtn.className = 'icon-btn';
      editorBtn.setAttribute('data-testid', 'editor-open');
      editorBtn.setAttribute('aria-label', 'Редактор уровней (QA)');
      editorBtn.title = 'Редактор уровней (QA)';
      editorBtn.textContent = '🧱';
      editorBtn.addEventListener('click', () => {
        void import('../ui/editor').then((m) => m.openLevelEditor(hooks));
      });
      panel.appendChild(editorBtn);
    }
    if (panel && !panel.querySelector('[data-testid=qa-toggle]')) {
      const labels = LABELS[getLang()];
      const button = document.createElement('button');
      button.className = 'icon-btn qa-toggle';
      button.setAttribute('data-testid', 'qa-toggle');
      button.setAttribute('aria-label', active ? labels.exit : labels.unlock);
      button.title = active ? labels.exit : labels.unlock;
      button.textContent = '🛠';
      if (active) button.style.background = 'var(--grass)';
      button.addEventListener('click', () => {
        location.assign(withQueryParam('qa', active ? null : '1'));
      });
      panel.appendChild(button);
    }

    const menu = root.querySelector<HTMLElement>('[data-testid=screen-menu]');
    const menuPanel = menu?.querySelector<HTMLElement>('.menu-panel');
    if (active && menuPanel && !menuPanel.querySelector('[data-testid=qa-mode-notice]')) {
      const notice = document.createElement('div');
      notice.setAttribute('data-testid', 'qa-mode-notice');
      notice.className = 'qa-mode-notice';
      notice.textContent = LABELS[getLang()].notice;
      menuPanel.appendChild(notice);
    }
  };

  new MutationObserver(mount).observe(root, { childList: true, subtree: true });
  mount();
}
