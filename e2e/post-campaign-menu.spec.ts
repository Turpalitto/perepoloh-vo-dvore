import { Page, expect, test } from '@playwright/test';

/**
 * Регрессия дизайн-аудита: посткампанийное главное меню на маленьких телефонах.
 * Обычные адаптивные тесты меню не воспроизводили состояние campaignDone, и на
 * 320x568 заголовок с основной CTA уходили выше видимой области. Тест сидит
 * реальный сейв завершённой кампании (тот же формат, что и в игре) и держит
 * граничные размеры 320x568, 360x640 и 360x800.
 */

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 360, height: 800 }
] as const;

async function seedCampaignDone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const stars = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [String(index + 1), 3]));
    localStorage.setItem(
      'parkovka.save.v1',
      JSON.stringify({
        v: 1,
        stars,
        sound: false,
        music: false,
        lang: 'ru',
        lastLevel: 100,
        targetSkin: 0,
        campaignDone: true,
        campaignDoneAt: '2026-07-20',
        endingSeen: true,
        endlessBest: 3
      })
    );
  });
}

async function seedMidCampaign(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const stars = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [String(index + 1), 3]));
    localStorage.setItem(
      'parkovka.save.v1',
      JSON.stringify({ v: 1, stars, sound: false, music: false, lang: 'ru', lastLevel: 5, targetSkin: 0 })
    );
  });
}

async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  expect(box, `${selector} отсутствует`).not.toBeNull();
  return box!;
}

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

test.describe('Посткампанийное меню: граничные мобильные размеры', () => {
  for (const viewport of VIEWPORTS) {
    test(`campaignDone-меню целиком видно на ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await seedCampaignDone(page);
      await page.goto('/?mock=1&lang=ru&daytime=day');

      // Посткампанийное состояние действительно активно, а не обычное меню.
      await expect(page.getByTestId('menu-play')).toContainText('Высшей лиге');
      await expect(page.getByTestId('menu-elite')).toBeVisible();

      // Заголовок полностью внутри видимой области (без предварительного скролла).
      const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
      expect(scroll).toEqual({ x: 0, y: 0 });
      const title = await boxOf(page, '.game-title');
      expect(title.y, 'заголовок срезан сверху').toBeGreaterThanOrEqual(-1);
      expect(title.x, 'заголовок срезан слева').toBeGreaterThanOrEqual(-1);
      expect(title.x + title.width, 'заголовок срезан справа').toBeLessThanOrEqual(viewport.width + 1);
      expect(title.y + title.height, 'заголовок срезан снизу').toBeLessThanOrEqual(viewport.height + 1);

      // Основная CTA целиком видима и доступна без скролла.
      const cta = await boxOf(page, '[data-testid="menu-play"]');
      expect(cta.y).toBeGreaterThanOrEqual(-1);
      expect(cta.x).toBeGreaterThanOrEqual(-1);
      expect(cta.x + cta.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(cta.y + cta.height).toBeLessThanOrEqual(viewport.height + 1);
      await expect(page.getByTestId('menu-play')).toBeInViewport({ ratio: 1 });

      // Ключевые блоки не перекрывают друг друга.
      const blocks = [
        '.game-title',
        '[data-testid="menu-play"]',
        '[data-testid="mode-switch"]',
        '[data-testid="menu-daily"]',
        '.menu-meta-row',
        '.menu-progress'
      ];
      for (let i = 0; i < blocks.length; i++) {
        for (let j = i + 1; j < blocks.length; j++) {
          expect(
            await overlapArea(page, blocks[i], blocks[j]),
            `${blocks[i]} перекрывает ${blocks[j]}`
          ).toBe(0);
        }
      }

      // Важные элементы не выходят за верх и бока экрана, ниже заголовка.
      for (const selector of blocks.slice(1)) {
        const box = await boxOf(page, selector);
        expect(box.x, `${selector} за левой границей`).toBeGreaterThanOrEqual(-1);
        expect(box.x + box.width, `${selector} за правой границей`).toBeLessThanOrEqual(viewport.width + 1);
        expect(box.y, `${selector} за верхней границей`).toBeGreaterThanOrEqual(-1);
      }

      // Горизонтального скролла нет.
      const overflow = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - window.innerWidth,
        y: document.documentElement.scrollHeight - window.innerHeight
      }));
      expect(overflow.x, 'горизонтальный overflow').toBeLessThanOrEqual(1);
      expect(overflow.y, 'вертикальный overflow').toBeLessThanOrEqual(1);
    });
  }

  test('до конца кампании CTA продолжает кампанию, после — открывает Высшую лигу', async ({ page }) => {
    await seedMidCampaign(page);
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await expect(page.getByTestId('menu-play')).toHaveText('Продолжить');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('screen-game')).toBeVisible();
    await expect(page.getByTestId('board')).toBeVisible();
  });

  test('после кампании CTA открывает Высшую лигу, а не уровень 100', async ({ page }) => {
    await seedCampaignDone(page);
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await expect(page.getByTestId('menu-play')).toContainText('Продолжить в Высшей лиге');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('screen-elite')).toBeVisible();
  });

  test('дом-ориентир двора виден в портретной колонке', async ({ page }) => {
    // Регрессия: на портрете slice-обрезка viewBox уводила дом (x 52–282 из 900)
    // целиком за левую границу кадра; портретная композиция возвращает его в кадр.
    await seedCampaignDone(page);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto('/?mock=1&lang=ru&daytime=day');
      const house = await page.locator('.yard-house').boundingBox();
      expect(house, `дом отсутствует на ${viewport.width}x${viewport.height}`).not.toBeNull();
      const visibleWidth = Math.min(house!.x + house!.width, viewport.width) - Math.max(house!.x, 0);
      expect(visibleWidth, `дом за кадром на ${viewport.width}x${viewport.height}`).toBeGreaterThanOrEqual(100);
      expect(house!.y).toBeGreaterThanOrEqual(-1);
      // машинка-жигулёнок тоже в кадре
      const car = await page.locator("[data-tap='honk']").boundingBox();
      expect(car).not.toBeNull();
      expect(car!.x).toBeGreaterThanOrEqual(-1);
      expect(car!.x + car!.width).toBeLessThanOrEqual(viewport.width + 1);
    }
  });

  test('метапанель сохраняет все четыре функции и гараж после кампании', async ({ page }) => {
    await seedCampaignDone(page);
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await expect(page.getByTestId('menu-gift')).toBeVisible();
    await expect(page.getByTestId('menu-leaderboard')).toBeVisible();
    await expect(page.getByTestId('menu-achievements')).toBeVisible();
    await expect(page.getByTestId('menu-weekly')).toBeVisible();
    await page.getByTestId('menu-garage').click();
    await expect(page.getByTestId('garage-overlay')).toBeVisible();
    await expect(page.getByTestId('skin-9')).toBeEnabled();
  });
});
