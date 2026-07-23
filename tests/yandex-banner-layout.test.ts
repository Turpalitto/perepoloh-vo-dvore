import { afterEach, describe, expect, it, vi } from 'vitest';
import { createYandexPlatform } from '../src/platform/yandex';

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'document');
});

describe('Yandex sticky banner layout', () => {
  it('reserves bottom space for a visible mobile banner', async () => {
    const toggle = vi.fn();
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { body: { classList: { toggle } } }
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        YaGames: {
          init: async () => ({
            deviceInfo: { type: 'mobile' },
            adv: {
              getBannerAdvStatus: async () => ({ stickyAdvIsShowing: false }),
              showBannerAdv: async () => ({ stickyAdvIsShowing: true })
            }
          })
        }
      }
    });

    const platform = createYandexPlatform();
    await platform.init();
    await platform.showBanner();

    expect(toggle).toHaveBeenCalledWith('sticky-banner-bottom', true);
  });

  it('does not reserve bottom space for a desktop side banner', async () => {
    const toggle = vi.fn();
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { body: { classList: { toggle } } }
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        YaGames: {
          init: async () => ({
            deviceInfo: { type: 'desktop' },
            adv: {
              getBannerAdvStatus: async () => ({ stickyAdvIsShowing: true }),
              showBannerAdv: vi.fn()
            }
          })
        }
      }
    });

    const platform = createYandexPlatform();
    await platform.init();
    await platform.showBanner();

    expect(toggle).toHaveBeenCalledWith('sticky-banner-bottom', false);
  });
});
