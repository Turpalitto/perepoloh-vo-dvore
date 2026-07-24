import { expect, test } from '@playwright/test';

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
  await expect(page.getByTestId('stars-total')).toHaveText('★ 1 / 300');
  await page.getByTestId('menu-settings').click();
  await page.getByTestId('qa-toggle').click();

  await expect(page).toHaveURL(/qa=1/);
  await expect(page.getByTestId('qa-mode-notice')).toBeVisible();
  await expect(page.getByTestId('stars-total')).toHaveText('★ 300 / 300');
  await expect(page.getByTestId('menu-elite')).toBeVisible();
  await expect(page.getByTestId('menu-endless')).toBeVisible();

  await page.getByTestId('menu-levels').click();
  await expect(page.locator('.level-card')).toHaveCount(100);
  await expect(page.locator('.level-card.locked')).toHaveCount(0);
  await page.getByTestId('btn-back').click();

  await page.getByTestId('menu-settings').click();
  await page.getByTestId('qa-toggle').click();
  await expect(page).not.toHaveURL(/(?:\?|&)qa=1/);
  await expect(page.getByTestId('qa-mode-notice')).toHaveCount(0);
  await expect(page.getByTestId('stars-total')).toHaveText('★ 1 / 300');
});

test('QA yard preview selects a campaign milestone without changing unlocked content', async ({ page }) => {
  await page.goto('/?mock=1&qaTools=1&qa=1&qaYard=40&lang=ru&daytime=day');

  const yard = page.locator('.yard-svg');
  await expect(yard).toHaveAttribute('data-yard-stage', '4');
  await expect(yard).toHaveAttribute('data-yard-era', '2');
  await expect(page.locator('[data-yard-detail=birdhouse]')).toBeVisible();
  await expect(page.locator('[data-yard-detail=champion-arch]')).toHaveCount(0);
  await expect(page.getByTestId('stars-total')).toHaveText('★ 300 / 300');
});
