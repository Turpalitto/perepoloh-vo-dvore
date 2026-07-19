import { createMockPlatform } from './mock';
import { createYandexPlatform } from './yandex';
import type { Platform } from './types';

const SDK_URL = '/sdk.js';
const SDK_FALLBACK_URL = 'https://sdk.games.s3.yandex.net/sdk.js';
const SDK_TIMEOUT_MS = 3000;

function loadScript(src: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = document.createElement('script');
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
 * Выбор платформы: в дев-режиме и по ?mock=1 — mock;
 * иначе пытаемся поднять Яндекс SDK, при неудаче тихо падаем в mock.
 */
export async function createPlatform(): Promise<Platform> {
  const params = new URLSearchParams(location.search);
  const forceMock = params.get('mock') === '1' || (import.meta.env.DEV && params.get('yandex') !== '1');
  if (!forceMock) {
    const loaded = (await loadScript(SDK_URL, SDK_TIMEOUT_MS)) || (await loadScript(SDK_FALLBACK_URL, SDK_TIMEOUT_MS));
    if (loaded && window.YaGames) {
      const platform = createYandexPlatform();
      try {
        await platform.init();
        return platform;
      } catch (e) {
        console.warn('[platform] SDK не инициализировался, переходим в mock:', e);
      }
    }
  }
  const mock = createMockPlatform();
  await mock.init();
  return mock;
}
