import { expect, test } from '@playwright/test';
import { CAMPAIGN_LEVEL_IDS, CAMPAIGN_MAX_STARS } from './campaign-levels';

test('QA button unlocks everything without changing real progress', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('qa-seeded') === '1') return;
    localStorage.setItem(
      'parkovka.save.v1',
      JSON.stringify({
        v: 1,
        stars: { '1': 1 },
        sound: false,
        music: false,
        lang: 'ru',
        lastLevel: 1,
        targetSkin: 0
      })
    );
    sessionStorage.setItem('qa-seeded', '1');
  });

  await page.goto('/?mock=1&qaTools=1&lang=ru&daytime=day');
  await expect(page.getByTestId('stars-total')).toHaveText(`★ 1 / ${CAMPAIGN_MAX_STARS}`);
  await page.getByTestId('menu-settings').click();
  await page.getByTestId('qa-toggle').click();

  await expect(page).toHaveURL(/qa=1/);
  await expect(page.getByTestId('qa-mode-notice')).toBeVisible();
  await expect(page.getByTestId('stars-total')).toHaveText(`★ ${CAMPAIGN_MAX_STARS} / ${CAMPAIGN_MAX_STARS}`);
  await expect(page.getByTestId('menu-elite')).toBeVisible();
  await expect(page.getByTestId('menu-endless')).toBeVisible();

  // «Открыть всё» обязано открывать и лигу целиком: без медалей она осталась бы
  // за собственным гейтом дивизионов, и проверяющий увидел бы блок из пяти
  // испытаний вместо двадцати пяти.
  await page.getByTestId('menu-elite').click();
  await expect(page.locator('.elite-card')).toHaveCount(25);
  await expect(page.locator('.elite-card.locked')).toHaveCount(0);
  // Золота нет намеренно: улучшение медали и повышение ранга остаются проверяемыми.
  await expect(page.getByTestId('elite-medals')).toContainText('🥇 0');
  await page.getByTestId('btn-back').click();

  await page.getByTestId('menu-levels').click();
  await expect(page.locator('.level-card')).toHaveCount(CAMPAIGN_LEVEL_IDS.length);
  await expect(page.locator('.level-card.locked')).toHaveCount(0);
  await page.getByTestId('btn-back').click();

  await page.getByTestId('menu-settings').click();
  await page.getByTestId('qa-toggle').click();
  await expect(page).not.toHaveURL(/(?:\?|&)qa=1/);
  await expect(page.getByTestId('qa-mode-notice')).toHaveCount(0);
  await expect(page.getByTestId('stars-total')).toHaveText(`★ 1 / ${CAMPAIGN_MAX_STARS}`);
});

test('QA-редактор уровней: проверка, решение и тестовый запуск черновика', async ({ page }) => {
  await page.goto('/?mock=1&qaTools=1&qa=1&lang=ru&daytime=day');
  await page.getByTestId('menu-settings').click();
  await page.getByTestId('editor-open').click();
  await expect(page.getByTestId('editor-panel')).toBeVisible();
  // превью стартового черновика отрисовано
  await expect(page.getByTestId('editor-preview').locator('svg')).toBeVisible();

  await page.getByTestId('editor-validate').click();
  await expect(page.getByTestId('editor-output')).toContainText('Уровень валиден');
  await page.getByTestId('editor-solve').click();
  await expect(page.getByTestId('editor-output')).toContainText('Решается за 2 ходов');
  await page.getByTestId('editor-difficulty').click();
  await expect(page.getByTestId('editor-output')).toContainText('Балл');

  // сломанный JSON — понятная ошибка, без падений
  await page.getByTestId('editor-json').fill('{ this is not json');
  await page.getByTestId('editor-validate').click();
  await expect(page.getByTestId('editor-output')).toContainText('JSON не разбирается');

  // невалидный уровень не запускается
  await page.getByTestId('editor-json').fill(JSON.stringify({
    id: 901, name: 'x', width: 6, height: 6,
    exit: { side: 'right', index: 2 },
    pieces: [{ id: 'T', kind: 'target', x: 0, y: 1, len: 2, dir: 'h' }],
    par: 1, par2: 2, difficulty: 'easy', mechanics: []
  }));
  await page.getByTestId('editor-play').click();
  await expect(page.getByTestId('editor-output')).toContainText('Запуск отменён');
  await expect(page.getByTestId('editor-panel')).toBeVisible();

  // валидный черновик запускается как игровой уровень
  await page.getByTestId('editor-json').fill(JSON.stringify({
    id: 902, name: 'Тест из редактора', width: 6, height: 6,
    exit: { side: 'right', index: 2 },
    pieces: [
      { id: 'T', kind: 'target', x: 0, y: 2, len: 2, dir: 'h' },
      { id: 'A', kind: 'car', x: 3, y: 0, len: 2, dir: 'v' }
    ],
    par: 1, par2: 2, difficulty: 'easy', mechanics: []
  }));
  await page.getByTestId('editor-play').click();
  await expect(page.getByTestId('editor-panel')).toHaveCount(0);
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('screen-game')).toContainText('Тест из редактора');
});

test('QA yard preview selects a campaign milestone without changing unlocked content', async ({ page }) => {
  await page.goto('/?mock=1&qaTools=1&qa=1&qaYard=40&lang=ru&daytime=day');

  const yard = page.locator('.yard-svg');
  await expect(yard).toHaveAttribute('data-yard-stage', '4');
  await expect(yard).toHaveAttribute('data-yard-era', '2');
  await expect(page.locator('[data-yard-detail=birdhouse]')).toBeVisible();
  await expect(page.locator('[data-yard-detail=champion-arch]')).toHaveCount(0);
  await expect(page.getByTestId('stars-total')).toHaveText(`★ ${CAMPAIGN_MAX_STARS} / ${CAMPAIGN_MAX_STARS}`);
});
