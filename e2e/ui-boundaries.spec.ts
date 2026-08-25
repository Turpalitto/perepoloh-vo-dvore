import { Page, expect, test } from '@playwright/test';

async function overlapArea(page: Page, first: string, second: string): Promise<number> {
  return page.evaluate(
    ({ first, second }) => {
      const a = document.querySelector<HTMLElement>(first)?.getBoundingClientRect();
      const b = document.querySelector<HTMLElement>(second)?.getBoundingClientRect();
      if (!a || !b) return 0;
      return (
        Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
        Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
      );
    },
    { first, second }
  );
}

test.describe('UI boundaries', () => {
  test('localized menu controls stay above the sticky banner at 320x568', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });

    for (const lang of ['ru', 'en', 'tr'] as const) {
      await page.goto(`/?mock=1&lang=${lang}&daytime=day`);
      await expect(page.getByTestId('mock-banner')).toBeVisible();
      await expect(page.locator('.menu-progress-block')).toBeInViewport();
      expect(
        await overlapArea(page, '.menu-progress-block', '[data-testid="mock-banner"]'),
        `${lang}: progress line overlaps the sticky banner`
      ).toBe(0);
    }
  });

  test('sticky banner does not cover scrollable screen content at 320x568', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await expect(page.getByTestId('mock-banner')).toBeVisible();

    await page.getByTestId('menu-levels').click();
    await page.locator('.levels-grid').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    // Последняя карточка по позиции, а не «уровень 100»: после финального босса
    // в кампании лежит глава 10, и низ списка — это её уровни.
    const lastLevelCard = '.levels-grid .level-card:last-child';
    await expect(page.locator(lastLevelCard)).toBeInViewport();
    expect(await overlapArea(page, lastLevelCard, '[data-testid="mock-banner"]')).toBe(0);

    await page.getByTestId('btn-back').click();
    await page.getByTestId('menu-achievements').click();
    await page.locator('.achievements-grid').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const lastAchievement = '.achievement-card:last-child';
    await expect(page.locator(lastAchievement)).toBeInViewport();
    expect(await overlapArea(page, lastAchievement, '[data-testid="mock-banner"]')).toBe(0);

    const headerBounds = await page.locator('.achievements-screen .panel-top').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        viewportWidth: window.innerWidth
      };
    });
    expect(headerBounds.left).toBeGreaterThanOrEqual(0);
    expect(headerBounds.right).toBeLessThanOrEqual(headerBounds.viewportWidth);
    expect(headerBounds.scrollWidth).toBeLessThanOrEqual(headerBounds.clientWidth + 1);
  });

  test('пауза на боссовом экране остаётся целиком в кадре', async ({ page }) => {
    // Регрессия: .boss-game-screen > * делал .overlay-slot относительным,
    // и диалог паузы уезжал за нижнюю границу окна.
    await page.addInitScript(() => {
      const stars = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index + 1), 3]));
      localStorage.setItem(
        'parkovka.save.v1',
        JSON.stringify({ v: 1, stars, sound: false, music: false, lang: 'ru', lastLevel: 9, targetSkin: 0 })
      );
    });
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 320, height: 568 }
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/?mock=1&lang=ru&daytime=day');
      await page.getByTestId('menu-play').click();
      await page.getByTestId('boss-start').click();
      await expect(page.getByTestId('board')).toBeVisible();
      await page.getByTestId('btn-pause').click();
      await expect(page.getByTestId('pause-overlay')).toBeVisible();
      const dialog = await page.locator('.pause-dialog').boundingBox();
      expect(dialog, `нет диалога паузы на ${viewport.width}x${viewport.height}`).not.toBeNull();
      expect(dialog!.y, `пауза срезана сверху на ${viewport.width}x${viewport.height}`).toBeGreaterThanOrEqual(0);
      expect(
        dialog!.y + dialog!.height,
        `пауза уезжает за низ на ${viewport.width}x${viewport.height}`
      ).toBeLessThanOrEqual(viewport.height + 1);
      await expect(page.getByTestId('btn-exit-menu')).toBeInViewport({ ratio: 1 });
      await page.getByTestId('btn-resume').click();
    }
  });

  test('leaderboard replaces loading state after its shell is mounted', async ({ page }) => {
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await page.getByTestId('menu-leaderboard').click();
    await expect(page.getByTestId('leaderboard-content').locator('.leaderboard-board')).toHaveCount(2);
    await expect(page.getByTestId('leaderboard-content').locator('.leaderboard-loading')).toHaveCount(0);
  });

  test('pause and grandpa stay inside their UI layers at 320x568', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('grandpa-portrait')).toBeVisible();

    expect(
      await overlapArea(page, '[data-testid="grandpa-portrait"]', '[data-testid="btn-undo"]')
    ).toBe(0);

    await page.getByTestId('btn-pause').click();
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    const pauseBounds = await page.locator('.pause-dialog').evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      right: element.getBoundingClientRect().right,
      viewportWidth: window.innerWidth
    }));
    expect(pauseBounds.scrollWidth).toBeLessThanOrEqual(pauseBounds.clientWidth + 1);
    expect(pauseBounds.right).toBeLessThanOrEqual(pauseBounds.viewportWidth);
    expect(
      await overlapArea(page, '[data-testid="pause-overlay"]', '[data-testid="mock-banner"]')
    ).toBe(0);

    const layerOrder = await page.evaluate(() => ({
      grandpa: Number(
        getComputedStyle(document.querySelector<HTMLElement>('[data-testid="grandpa"]')!).zIndex
      ),
      overlay: Number(getComputedStyle(document.querySelector<HTMLElement>('.overlay-slot')!).zIndex)
    }));
    expect(layerOrder.grandpa).toBeLessThan(layerOrder.overlay);
  });
});
