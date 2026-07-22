import './mock.css';
import type { SaveData } from '../game/save';
import { sanitizeSave } from '../game/save';
import { queryParam } from '../query';
import { DEFAULT_PLATFORM_CONFIG } from './types';
import type { AdHandlers, LeaderboardSnapshot, Platform } from './types';

const STORAGE_KEY = 'parkovka.save.v1';

/** Оверлей фальшивой рекламы для локальной разработки. */
function fakeAd(kind: 'interstitial' | 'rewarded', h: AdHandlers): Promise<boolean> {
  return new Promise((resolve) => {
    h.onPause();
    const el = document.createElement('div');
    el.className = 'mock-ad';
    el.setAttribute('data-testid', 'mock-ad');
    el.innerHTML = `
      <div class="mock-ad-box">
        <div class="mock-ad-label">Тестовая реклама (mock)</div>
        <div class="mock-ad-kind">${kind === 'rewarded' ? 'Rewarded-видео' : 'Полноэкранная'}</div>
        <button class="btn mock-ad-close" data-testid="mock-ad-close">Закрыть</button>
      </div>`;
    document.body.appendChild(el);
    const done = (ok: boolean) => {
      el.remove();
      h.onResume();
      resolve(ok);
    };
    const btn = el.querySelector<HTMLButtonElement>('.mock-ad-close')!;
    btn.disabled = true;
    let left = kind === 'rewarded' ? 2 : 1;
    btn.textContent = `Закрыть (${left})`;
    const timer = setInterval(() => {
      left--;
      if (left <= 0) {
        clearInterval(timer);
        btn.disabled = false;
        btn.textContent = kind === 'rewarded' ? 'Забрать награду' : 'Закрыть';
      } else {
        btn.textContent = `Закрыть (${left})`;
      }
    }, 1000);
    btn.addEventListener('click', () => done(true));
  });
}

/** Заглушка sticky-баннера для локальной разработки: одна из боковых полос. */
function showMockBanner(): void {
  if (document.querySelector('[data-testid=mock-banner]')) return;
  const el = document.createElement('div');
  el.className = 'mock-banner';
  el.setAttribute('data-testid', 'mock-banner');
  el.innerHTML = `<span>Баннер (mock)</span>`;
  document.body.appendChild(el);
  // Резервируем высоту баннера, чтобы он не перекрывал нижние кнопки —
  // так же, как sticky-баннер Яндекса не должен наезжать на управление.
  document.body.classList.add('mock-banner-on');
}

export function createMockPlatform(): Platform {
  return {
    name: 'mock',
    config: { ...DEFAULT_PLATFORM_CONFIG },
    isTV: queryParam('tv') === '1',
    async init(): Promise<void> {
      console.info('[platform] mock-режим (без Яндекс SDK)');
    },
    getLang(): string {
      return navigator.language ?? 'ru';
    },
    async submitScore(board: 'yardstars' | 'dailystreak', value: number): Promise<void> {
      console.info(`[platform] лидерборд ${board} (mock): ${value}`);
    },
    async getLeaderboardSnapshot(board: 'yardstars' | 'dailystreak'): Promise<LeaderboardSnapshot> {
      const daily = board === 'dailystreak';
      const entries = [
        { rank: 1, name: 'Марфа', score: daily ? 21 : 184 },
        { rank: 2, name: 'Дед Егор', score: daily ? 14 : 142 },
        { rank: 3, name: 'Сосед', score: daily ? 9 : 97 }
      ];
      const raw = localStorage.getItem(STORAGE_KEY);
      const save = raw ? sanitizeSave(JSON.parse(raw)) : null;
      let me = null;
      if (save) {
        const score = daily ? (save.daily?.streak ?? 0) : Object.values(save.stars).reduce((sum, n) => sum + n, 0);
        if (score > 0) {
          const rank = entries.filter((r) => r.score > score).length + 1;
          me = { rank, name: 'Вы', score, isMe: true };
        }
      }
      return { entries, me };
    },
    async requestReview(): Promise<boolean> {
      console.info('[platform] запрос оценки (mock)');
      return true;
    },
    serverTime(): number {
      return Date.now();
    },
    setLifecycleHandlers(): void {
      // В mock системные события платформы отсутствуют.
    },
    setBackHandler(handler: () => void): void {
      window.addEventListener('mock-history-back', handler);
    },
    async requestFullscreen(): Promise<void> {
      // Preview остаётся оконным, чтобы TV e2e не менял окружение браузера.
    },
    async exit(): Promise<void> {
      document.documentElement.dataset.mockExit = 'true';
    },
    ready(): void {
      console.info('[platform] игра готова (mock ready)');
    },
    gameplayStart(): void {},
    gameplayStop(): void {},
    async loadData(): Promise<SaveData | null> {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      try {
        return sanitizeSave(JSON.parse(raw));
      } catch {
        console.warn('[platform] сохранение повреждено, начинаем заново');
        return null;
      }
    },
    async saveData(data: SaveData): Promise<void> {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },
    showInterstitial(h: AdHandlers): Promise<void> {
      return fakeAd('interstitial', h).then(() => undefined);
    },
    showRewarded(h: AdHandlers): Promise<boolean> {
      return fakeAd('rewarded', h);
    },
    async showBanner(): Promise<void> {
      showMockBanner();
    }
  };
}
