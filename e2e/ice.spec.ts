import { Page, expect, test } from '@playwright/test';

/**
 * Ледяная колея на поле: на льду нельзя закончить ход — ни по своей воле, ни
 * упершись в препятствие. Прежняя редакция правила разрешала вынужденную
 * остановку, и UI опирался на инвариант «до упора (maxSteps) встать можно
 * всегда»: при запрещённой точке остановки жест «доводился» вперёд и
 * гарантированно находил легальную клетку. Инвариант снят, поэтому здесь
 * проверяется именно отказной сценарий — вся полоса вперёд нелегальна.
 */

/** Собираем ошибки страницы; в конце теста их не должно быть. */
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

/**
 * Позиция фигуры в координатах поля: transform самой группы. Экранный
 * boundingBox не годится — анимация отдачи смещает вложенный `.mid`.
 */
async function pieceTransform(page: Page, pieceId: string): Promise<string> {
  return await page.locator(`[data-piece="${pieceId}"]`).evaluate((el) => (el as SVGGElement).style.transform);
}

/**
 * A едет вниз только на лёд: и промежуточная позиция (2,3)+(2,4), и упор в
 * нижний край (2,4)+(2,5) задевают ледяные клетки. Легального стопа вниз нет
 * ни одного — полоса закрыта целиком. Вверх лёд не мешает: там решение.
 */
const ICE_LEVEL = {
  id: 903,
  name: 'Ледяная колея (тест)',
  width: 6,
  height: 6,
  exit: { side: 'right', index: 2 },
  pieces: [
    { id: 'T', kind: 'target', x: 0, y: 2, len: 2, dir: 'h' },
    { id: 'A', kind: 'car', x: 2, y: 2, len: 2, dir: 'v' }
  ],
  ice: [
    { x: 2, y: 4 },
    { x: 2, y: 5 }
  ],
  par: 2,
  par2: 3,
  difficulty: 'easy',
  mechanics: ['ice']
};

async function openIceLevel(page: Page): Promise<void> {
  await page.goto('/?mock=1&qaTools=1&qa=1&lang=ru&daytime=day');
  await page.getByTestId('menu-settings').click();
  await page.getByTestId('editor-open').click();
  await page.getByTestId('editor-json').fill(JSON.stringify(ICE_LEVEL));
  await page.getByTestId('editor-validate').click();
  await expect(page.getByTestId('editor-output')).toContainText('Уровень валиден');
  await page.getByTestId('editor-play').click();
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('hud-moves')).toHaveText('0');
}

test.describe('ледяная колея на поле', () => {
  test('перетаскивание в упор с конечной позицией на льду: ход не проходит, состояние цело', async ({ page }) => {
    const errors = trackErrors(page);
    await openIceLevel(page);

    const before = await pieceTransform(page, 'A');
    await dragPiece(page, 'A', 0, 2); // до упора в нижний край — обе клетки лёд

    await expect(page.getByTestId('hud-moves')).toHaveText('0');
    expect(await pieceTransform(page, 'A')).toBe(before);
    await expect(page.locator('[data-piece="A"] .mid')).toHaveClass(/bump-y/);
    expect(errors).toEqual([]);
  });

  test('промежуточная остановка на льду тоже отклоняется, а ход вверх проходит', async ({ page }) => {
    const errors = trackErrors(page);
    await openIceLevel(page);

    const before = await pieceTransform(page, 'A');
    await dragPiece(page, 'A', 0, 1); // (2,3)+(2,4): нижняя клетка — лёд
    await expect(page.getByTestId('hud-moves')).toHaveText('0');
    expect(await pieceTransform(page, 'A')).toBe(before);

    await dragPiece(page, 'A', 0, -2); // вверх льда нет
    await expect(page.getByTestId('hud-moves')).toHaveText('1');
    expect(await pieceTransform(page, 'A')).not.toBe(before);
    expect(errors).toEqual([]);
  });

  test('клавиатура/пульт: подтверждение хода на лёд отклоняется без зависания', async ({ page }) => {
    const errors = trackErrors(page);
    await openIceLevel(page);

    const before = await pieceTransform(page, 'A');
    await page.getByTestId('board').focus();
    // выбираем A (T — фигура по умолчанию), начинаем ход и ведём вниз до упора
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.piece.tv-active')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-piece="A"].tv-active')).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(220);

    await expect(page.getByTestId('hud-moves')).toHaveText('0');
    expect(await pieceTransform(page, 'A')).toBe(before);
    await expect(page.locator('[data-piece="A"] .mid')).toHaveClass(/bump-y/);

    // управление не залипло: следующий ход вверх проходит штатно
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(220);
    await expect(page.getByTestId('hud-moves')).toHaveText('1');
    expect(errors).toEqual([]);
  });
});
