import { Page, expect, test } from '@playwright/test';

/**
 * Слой сохранений поверх Яндекс SDK:
 * - облачный merge: локальный прогресс и облако объединяются по максимуму,
 *   ничего не теряется ни с одной из сторон;
 * - отказ localStorage (квота/приватный режим): игра продолжает работать,
   а ошибка записи не валит страницу unhandled-исключением.
 */

/** Минимальный двойник YaGames: игрок с «облаком» в window.__cloudSave. */
function installYandexStub(page: Page): void {
  void page.addInitScript(() => {
    const cloud = { save: (window as unknown as { __seedCloud?: unknown }).__seedCloud };
    (window as unknown as { __cloudWrites: unknown[] }).__cloudWrites = [];
    (window as unknown as { __YaGamesReady: unknown }).__YaGamesReady = true;
    Object.defineProperty(window, 'YaGames', {
      configurable: true,
      value: {
        init: async () => ({
          environment: { i18n: { lang: 'ru' } },
          serverTime: () => Date.now(),
          getFlags: async () => ({}),
          on: () => undefined,
          getPlayer: async () => ({
            setData: async (data: Record<string, unknown>) => {
              (window as unknown as { __cloudWrites: unknown[] }).__cloudWrites.push(data);
              cloud.save = data.save;
            },
            getData: async () => ({ save: cloud.save ?? null })
          })
        })
      }
    });
  });
}

async function readSave(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('parkovka.save.v1') ?? '{}'));
}

test.describe('Сохранения: облако и отказ хранилища', () => {
  test('локальный сейв и облако сливаются по максимуму без потерь', async ({ page }) => {
    // Облако: звёзды за 5 и 9, рекорд endless 4.
    await page.addInitScript(() => {
      (window as unknown as { __seedCloud: unknown }).__seedCloud = {
        v: 1,
        stars: { '5': 3, '9': 2 },
        sound: true,
        music: true,
        lang: 'ru',
        lastLevel: 9,
        targetSkin: 0,
        endlessBest: 4
      };
    });
    installYandexStub(page);
    // Локально: звёзды за 5 и 12, рекорд endless 7 — свежее облака.
    await page.addInitScript(() => {
      localStorage.setItem(
        'parkovka.save.v1',
        JSON.stringify({
          v: 1,
          stars: { '5': 1, '12': 3 },
          sound: true,
          music: true,
          lang: 'ru',
          lastLevel: 12,
          targetSkin: 0,
          endlessBest: 7
        })
      );
    });

    await page.route('**/sdk.js', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: '/* stub: YaGames определён addInitScript */' })
    );
    await page.goto('/?mock=0&yandex=1&lang=ru');
    await expect(page.getByTestId('menu-play')).toBeVisible({ timeout: 15_000 });

    // Триггер записи: переключение звука проходит через persist().
    await page.getByTestId('menu-settings').click();
    await page.getByTestId('sound-toggle').click();

    const merged = await readSave(page);
    // Максимум звёзд по каждому уровню с обеих сторон.
    expect(merged.stars).toMatchObject({ '5': 3, '9': 2, '12': 3 });
    expect(merged.endlessBest).toBe(7);
    // Облако получило объединённый снимок.
    const writes = await page.evaluate(
      () => (window as unknown as { __cloudWrites: Array<{ save: Record<string, unknown> }> }).__cloudWrites
    );
    expect(writes.length).toBeGreaterThan(0);
    expect(writes[0].save.stars).toMatchObject({ '5': 3, '9': 2, '12': 3 });
  });

  test('отказ localStorage не мешает игре и не роняет страницу', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await page.addInitScript(() => {
      const boom = () => {
        throw new DOMException('quota exceeded (тест)', 'QuotaExceededError');
      };
      // Подменяем оба метода: чтение (битое хранилище) и запись (квота).
      Object.defineProperty(Storage.prototype, 'getItem', { value: boom, configurable: true });
      Object.defineProperty(Storage.prototype, 'setItem', { value: boom, configurable: true });
      Object.defineProperty(Storage.prototype, 'removeItem', { value: boom, configurable: true });
    });

    await page.goto('/?mock=1&lang=ru');
    // Игра загрузилась в меню на дефолтном сейве.
    await expect(page.getByTestId('menu-play')).toBeVisible({ timeout: 15_000 });
    // Пользовательское действие с записью сейва не ломает интерфейс.
    await page.getByTestId('menu-settings').click();
    await page.getByTestId('sound-toggle').click();
    await expect(page.getByTestId('sound-toggle')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
