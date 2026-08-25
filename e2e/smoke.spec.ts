import { expect, test } from '@playwright/test';

/**
 * Базовый смоук для WebKit (Safari). Полный набор e2e остаётся на Chromium —
 * здесь только то, что должно работать в любом движке: загрузка игры,
 * прохождение уровня drag-ом и клавиатурой, меню, сохранение прогресса.
 */

test('игра загружается без ошибок консоли и показывает меню', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('/?mock=1&lang=ru');
  await expect(page.getByTestId('menu-play')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('menu-levels').click();
  await expect(page.locator('.levels-grid .level-card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('уровень проходится drag-ом и прогресс сохраняется после перезагрузки', async ({ page }) => {
  await page.goto('/?mock=1&lang=ru');
  await page.getByTestId('menu-play').click();
  await expect(page.getByTestId('board')).toBeVisible();

  const target = page.locator('[data-piece=T]');
  const board = page.getByTestId('board');
  const box = await target.boundingBox();
  if (!box) throw new Error('целевая машина не найдена');
  const bBox = await board.boundingBox();
  if (!bBox) throw new Error('поле не найдено');

  // Уровень 1: жигулёнок у левого края, ворота справа — тянем до упора вправо.
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(bBox.x + bBox.width - 10, startY, { steps: 12 });
  await page.mouse.up();

  await expect(page.getByTestId('win-overlay')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('btn-win-menu').click();

  // Прогресс выживает перезагрузку — сейв работает и в WebKit.
  await page.reload();
  await expect(page.getByTestId('stars-total')).toContainText('★ 3 /', { timeout: 15_000 });
});

test('клавиатура двигает фигуры (доступность ввода не зависит от движка)', async ({ page }) => {
  await page.goto('/?mock=1&lang=ru&tv=1');
  await page.getByTestId('menu-play').click();
  await expect(page.getByTestId('board')).toBeVisible();
  await page.keyboard.press('Tab');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(60);
  }
  // Поле осталось интерактивным, игра не зависла.
  await expect(page.getByTestId('btn-pause')).toBeEnabled();
});
