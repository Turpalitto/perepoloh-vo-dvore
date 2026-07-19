import type { SaveData } from '../game/save';
import { sanitizeSave } from '../game/save';
import type { AdHandlers, Platform } from './types';

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

export function createMockPlatform(): Platform {
  return {
    name: 'mock',
    async init(): Promise<void> {
      console.info('[platform] mock-режим (без Яндекс SDK)');
    },
    getLang(): string {
      return navigator.language ?? 'ru';
    },
    async submitScore(totalStars: number): Promise<void> {
      console.info(`[platform] лидерборд (mock): ${totalStars} звёзд`);
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
    }
  };
}
