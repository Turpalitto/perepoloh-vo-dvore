import { expect, test } from '@playwright/test';

/**
 * Регрессия: на широких невысоких окнах (короткий десктоп / оконный режим,
 * высота 521–700px в ландшафте) меню-двор прижимался к низу через
 * justify-content: flex-end и срезал заголовок «Переполох во дворе» верхним
 * краем. Компактная grid-раскладка раньше включалась только при max-height:520,
 * оставляя провал. Порог поднят до 700; этот тест держит его.
 */
test('заголовок меню не срезается на широких невысоких окнах', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 600 },
    { width: 1480, height: 640 },
    { width: 1366, height: 680 },
    { width: 1024, height: 576 },
    { width: 1280, height: 720 } // выше порога — обычная раскладка, тоже без среза
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/?mock=1&lang=ru&daytime=day');

    // заголовок целиком в кадре сверху
    const title = await page.locator('.game-title').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { y: r.y, bottom: r.y + r.height };
    });
    expect(title.y, `заголовок срезан сверху на ${viewport.width}x${viewport.height}`).toBeGreaterThanOrEqual(-1);
    expect(title.bottom).toBeLessThanOrEqual(viewport.height + 1);

    // ключевые кнопки в кадре, без вертикального переполнения документа
    await expect(page.getByTestId('menu-play')).toBeInViewport();
    await expect(page.getByTestId('menu-rules')).toBeInViewport();
    const overflowY = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight
    );
    expect(overflowY).toBeLessThanOrEqual(1);
  }
});

test('меню ru/en/tr помещается на минимальном поддерживаемом экране', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });

  for (const lang of ['ru', 'en', 'tr'] as const) {
    await page.goto(`/?mock=1&lang=${lang}&daytime=day`);

    await expect(page.getByTestId('menu-play')).toBeInViewport();
    await expect(page.getByTestId('menu-rules')).toBeInViewport();

    const layout = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')].filter(
        (button) => button.getClientRects().length > 0
      );
      return {
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
        overflowY: document.documentElement.scrollHeight - window.innerHeight,
        clippedButtons: buttons
          .filter(
            (button) =>
              button.scrollWidth > button.clientWidth + 1 ||
              button.scrollHeight > button.clientHeight + 1
          )
          .map((button) => button.dataset.testid ?? button.textContent?.trim() ?? 'button')
      };
    });

    expect(layout.overflowX, `${lang}: горизонтальная прокрутка`).toBeLessThanOrEqual(1);
    expect(layout.overflowY, `${lang}: вертикальная прокрутка`).toBeLessThanOrEqual(1);
    expect(layout.clippedButtons, `${lang}: текст не помещается в кнопках`).toEqual([]);
  }
});
