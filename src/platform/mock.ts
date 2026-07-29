import './mock.css';
import { createDebugTracker } from '../game/analytics';
import type { SaveData } from '../game/save';
import { sanitizeSave } from '../game/save';
import { queryParam } from '../query';
import { DEFAULT_PLATFORM_CONFIG } from './types';
import type { AdHandlers, LeaderboardName, LeaderboardSnapshot, Platform } from './types';
import { elitePoints } from '../game/elite';

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

/** Заглушка нижнего мобильного sticky-баннера для локальной разработки. */
function showMockBanner(): void {
  if (document.querySelector('[data-testid=mock-banner]')) return;
  const el = document.createElement('div');
  el.className = 'mock-banner';
  el.setAttribute('data-testid', 'mock-banner');
  el.innerHTML = `<span>Баннер (mock)</span>`;
  document.body.appendChild(el);
  // Общий layout-класс резервирует место на всех экранах и в оверлеях.
  document.body.classList.add('mock-banner-on');
  document.body.classList.add('sticky-banner-bottom');
}

export function createMockPlatform(): Platform {
  // `?adNow=1` снимает пороги показа interstitial (частота, минимальный уровень,
  // прогрев сессии). Иначе рекламный путь недостижим в тестах: штатно он ждёт
  // шестой победы, десятой позиции кампании и четырёх минут сессии.
  const adNow = queryParam('adNow') === '1';
  return {
    name: 'mock',
    config: adNow
      ? { ...DEFAULT_PLATFORM_CONFIG, interstitialEvery: 1, interstitialMinLevel: 1, interstitialMinSessionMs: 0 }
      : { ...DEFAULT_PLATFORM_CONFIG },
    isTV: queryParam('tv') === '1',
    async init(): Promise<void> {
      console.info('[platform] mock-режим (без Яндекс SDK)');
    },
    getLang(): string {
      return navigator.language ?? 'ru';
    },
    async submitScore(board: LeaderboardName, value: number): Promise<void> {
      console.info(`[platform] лидерборд ${board} (mock): ${value}`);
    },
    async getLeaderboardSnapshot(board: LeaderboardName): Promise<LeaderboardSnapshot> {
      const daily = board === 'dailystreak';
      const league = board === 'eliteleague';
      const top = (streak: number, points: number, stars: number): number =>
        daily ? streak : league ? points : stars;
      const entries = [
        { rank: 1, name: 'Марфа', score: top(21, 1150, 184) },
        { rank: 2, name: 'Дед Егор', score: top(14, 720, 142) },
        { rank: 3, name: 'Сосед', score: top(9, 310, 97) }
      ];
      const raw = localStorage.getItem(STORAGE_KEY);
      const save = raw ? sanitizeSave(JSON.parse(raw)) : null;
      let me = null;
      if (save) {
        const score = daily
          ? (save.daily?.streak ?? 0)
          : league
            ? elitePoints(save)
            : Object.values(save.stars).reduce((sum, n) => sum + n, 0);
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
    showInterstitial(h: AdHandlers): Promise<boolean> {
      // `?adSkip=1` эмулирует отказ платформы: у Яндекса interstitial штатно не
      // показывается при слишком частых вызовах и offline, и этот путь нужно
      // уметь проверять — иначе воронка «вызвали/показали» тестами не покрыта.
      if (queryParam('adSkip') === '1') return Promise.resolve(false);
      return fakeAd('interstitial', h);
    },
    showRewarded(h: AdHandlers): Promise<boolean> {
      return fakeAd('rewarded', h);
    },
    // Локально события никуда не уходят — их видно в консоли (см. analytics.ts).
    createAnalyticsTracker: () => createDebugTracker(),
    async showBanner(): Promise<void> {
      showMockBanner();
    }
  };
}
