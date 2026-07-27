import levelsJson from '../levels/levels.json';
import type { Platform } from '../platform/types';
import { noopTracker } from './analytics';
import { getLang } from './i18n';
import type { SaveData } from './save';
import { withQueryParam } from '../query';

export function createQaSave(base: SaveData): SaveData {
  return {
    ...base,
    stars: Object.fromEntries(levelsJson.map((level) => [String(level.id), 3])),
    lastLevel: 100,
    campaignDone: true,
    endingSeen: true,
    eliteMedals: {},
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
    showInterstitial: async () => {},
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
    if (active && menu && !menu.querySelector('[data-testid=qa-mode-notice]')) {
      const notice = document.createElement('div');
      notice.setAttribute('data-testid', 'qa-mode-notice');
      notice.textContent = LABELS[getLang()].notice;
      Object.assign(notice.style, {
        position: 'absolute',
        left: '50%',
        bottom: 'calc(max(10px, env(safe-area-inset-bottom)) + var(--sticky-banner-height))',
        zIndex: '3',
        width: 'min(92vw, 440px)',
        transform: 'translateX(-50%)',
        padding: '8px 12px',
        borderRadius: '8px',
        background: 'rgba(61, 44, 30, 0.92)',
        color: '#fff7e6',
        fontSize: '13px',
        fontWeight: '800',
        textAlign: 'center'
      });
      menu.appendChild(notice);
    }
  };

  new MutationObserver(mount).observe(root, { childList: true, subtree: true });
  mount();
}
