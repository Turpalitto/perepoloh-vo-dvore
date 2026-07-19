import { Page, expect, test } from '@playwright/test';

/** Собираем ошибки страницы; в конце каждого теста их не должно быть. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** Размер клетки в экранных пикселях из viewBox доски. */
async function cellSize(page: Page): Promise<number> {
  const svg = page.getByTestId('board');
  const vb = (await svg.getAttribute('viewBox'))!.split(' ').map(Number);
  const box = (await svg.boundingBox())!;
  const scale = Math.min(box.width / vb[2], box.height / vb[3]);
  return 100 * scale;
}

/** Тянем фигуру мышью на dx/dy клеток. */
async function dragPiece(page: Page, pieceId: string, dxCells: number, dyCells: number): Promise<void> {
  const piece = page.locator(`[data-piece="${pieceId}"]`);
  const box = (await piece.boundingBox())!;
  const cell = await cellSize(page);
  const sx = box.x + Math.min(box.width, cell) / 2;
  const sy = box.y + Math.min(box.height, cell) / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(sx + (dxCells * cell * i) / steps, sy + (dyCells * cell * i) / steps);
  }
  await page.mouse.up();
  await page.waitForTimeout(220);
}

test.describe('Переполох во дворе', () => {
  test('меню загружается без ошибок консоли', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru');
    await expect(page.getByTestId('menu-play')).toBeVisible();
    await expect(page.getByTestId('screen-menu')).toContainText('Переполох');
    await expect(page.getByTestId('stars-total')).toContainText('★ 0 / 108');
    expect(errors).toEqual([]);
  });

  test('уровень 1 проходится перетаскиванием и даёт 3 звезды', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.getByTestId('hint-toast')).toContainText('Потяни');
    await dragPiece(page, 'T', 5.7, 0);
    await expect(page.getByTestId('win-overlay')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('win-stars')).toHaveAttribute('data-stars', '3');
    await expect(page.getByTestId('hud-moves')).toHaveText('1');
    expect(errors).toEqual([]);
  });

  test('счётчик ходов, отмена и перезапуск работают', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('board')).toBeVisible();
    // ход на 1 клетку вправо (не выезд)
    await dragPiece(page, 'T', 1, 0);
    await expect(page.getByTestId('hud-moves')).toHaveText('1');
    // запрещённое направление: вертикальный свайп ничего не меняет
    await dragPiece(page, 'T', 0, 2);
    await expect(page.getByTestId('hud-moves')).toHaveText('1');
    // отмена
    await page.getByTestId('btn-undo').click();
    await expect(page.getByTestId('hud-moves')).toHaveText('0');
    await expect(page.getByTestId('btn-undo')).toBeDisabled();
    // ход + перезапуск
    await dragPiece(page, 'T', 2, 0);
    await expect(page.getByTestId('hud-moves')).toHaveText('1');
    await page.getByTestId('btn-restart').click();
    await expect(page.getByTestId('hud-moves')).toHaveText('0');
    expect(errors).toEqual([]);
  });

  test('прогресс сохраняется после перезагрузки страницы', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await dragPiece(page, 'T', 5.7, 0);
    await expect(page.getByTestId('win-overlay')).toBeVisible();
    await page.getByTestId('btn-win-menu').click();
    await expect(page.getByTestId('stars-total')).toContainText('★ 3 / 108');
    await page.reload();
    await expect(page.getByTestId('menu-play')).toHaveText('Продолжить');
    await expect(page.getByTestId('stars-total')).toContainText('★ 3 / 108');
    await page.getByTestId('menu-levels').click();
    await expect(page.getByTestId('level-card-1')).toContainText('★★★');
    await expect(page.getByTestId('level-card-2')).toBeEnabled();
    await expect(page.getByTestId('level-card-3')).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('пауза открывается и закрывается', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await page.getByTestId('btn-pause').click();
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    await page.getByTestId('btn-resume').click();
    await expect(page.getByTestId('pause-overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('русский по умолчанию, переключатель языка сохраняется', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1');
    await expect(page.getByTestId('menu-play')).toHaveText('Играть');
    await page.getByTestId('lang-toggle').click();
    await expect(page.getByTestId('menu-play')).toHaveText('Play');
    await page.reload();
    await expect(page.getByTestId('menu-play')).toHaveText('Play');
    await page.getByTestId('lang-toggle').click();
    await expect(page.getByTestId('menu-play')).toHaveText('Oyna');
    await page.getByTestId('lang-toggle').click();
    await expect(page.getByTestId('menu-play')).toHaveText('Играть');
    expect(errors).toEqual([]);
  });

  test('подсказка выдаётся после rewarded-рекламы (mock)', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await page.getByTestId('btn-hint').click();
    await expect(page.getByTestId('mock-ad')).toBeVisible();
    const close = page.getByTestId('mock-ad-close');
    await expect(close).toBeEnabled({ timeout: 5000 });
    await close.click();
    await expect(page.locator('.hint-chevron').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('скриншоты', () => {
  test('основные экраны', async ({ page }, testInfo) => {
    await page.goto('/?mock=1&lang=ru');
    await expect(page.getByTestId('menu-play')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `screenshots/${testInfo.project.name}-menu.png` });
    await page.getByTestId('menu-levels').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/${testInfo.project.name}-levels.png` });
    await page.getByTestId('level-card-1').click();
    await expect(page.getByTestId('board')).toBeVisible();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `screenshots/${testInfo.project.name}-game.png` });
    await dragPiece(page, 'T', 5.7, 0);
    await expect(page.getByTestId('win-overlay')).toBeVisible();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `screenshots/${testInfo.project.name}-win.png` });
  });
});
