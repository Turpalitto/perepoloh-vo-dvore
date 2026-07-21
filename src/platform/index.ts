import { createYandexPlatform } from './yandex';
import type { Platform } from './types';
import { queryParam } from '../query';

const SDK_URL = '/sdk.js';
const SDK_TIMEOUT_MS = 10_000;
const MOCK_BUILD = import.meta.env.DEV || import.meta.env.MODE === 'e2e';

function loadScript(src: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.async = true;
    const timer = setTimeout(() => {
      s.remove();
      resolve(false);
    }, timeoutMs);
    s.src = src;
    s.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    s.onerror = () => {
      clearTimeout(timer);
      s.remove();
      resolve(false);
    };
    document.head.appendChild(s);
  });
}

/**
 * Mock существует только в dev/e2e-сборках. В production всегда используется
 * официальный относительный /sdk.js: тестовая реклама не попадает в релиз.
 */
export async function createPlatform(): Promise<Platform> {
  const useMock = MOCK_BUILD && (queryParam('mock') === '1' || (import.meta.env.DEV && queryParam('yandex') !== '1'));
  if (useMock) {
    const { createMockPlatform } = await import('./mock');
    const mock = createMockPlatform();
    await mock.init();
    return mock;
  }

  const loaded = await loadScript(SDK_URL, SDK_TIMEOUT_MS);
  if (!loaded || !window.YaGames) throw new Error('Не удалось загрузить SDK Яндекс Игр');
  const platform = createYandexPlatform();
  await platform.init();
  return platform;
}
