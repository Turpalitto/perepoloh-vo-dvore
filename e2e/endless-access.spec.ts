import { Page, expect, test } from '@playwright/test';
import { CAMPAIGN_LEVEL_IDS } from './campaign-levels';

/**
 * «Бесконечный двор» раньше открывался только вместе с Высшей лигой — после
 * всех уровней кампании, то есть подавляющее большинство игроков о нём не
 * узнавало. Теперь в середине кампании появляется заблокированная карточка, а
 * сам режим открывается задолго до финала. Высшая лига остаётся наградой
 * именно за пройденную кампанию и раньше срока не появляется.
 */

const TEASER_AT = 20;
const UNLOCK_AT = 35;

async function seedCleared(page: Page, count: number): Promise<void> {
  const ids = CAMPAIGN_LEVEL_IDS.slice(0, count);
  await page.addInitScript((levelIds: number[]) => {
    const stars = Object.fromEntries(levelIds.map((id) => [String(id), 3]));
    localStorage.setItem(
      'parkovka.save.v1',
      JSON.stringify({
        v: 1,
        stars,
        sound: false,
        music: false,
        lang: 'ru',
        lastLevel: levelIds[levelIds.length - 1] ?? 1,
        targetSkin: 0
      })
    );
  }, ids);
  await page.goto('/?mock=1&lang=ru');
  await expect(page.getByTestId('screen-menu')).toBeVisible();
}

test.describe('доступ к Бесконечному двору', () => {
  test('до первого порога режима не видно вовсе', async ({ page }) => {
    await seedCleared(page, TEASER_AT - 1);
    await expect(page.getByTestId('menu-endless')).toHaveCount(0);
    await expect(page.getByTestId('menu-endless-locked')).toHaveCount(0);
  });

  test('после уровня 20 виден тизер: карточка есть, но выключена', async ({ page }) => {
    await seedCleared(page, TEASER_AT);
    const teaser = page.getByTestId('menu-endless-locked');
    await expect(teaser).toBeVisible();
    await expect(teaser).toBeDisabled();
    await expect(teaser).toContainText(`после уровня ${UNLOCK_AT}`);
    await expect(page.getByTestId('menu-endless')).toHaveCount(0);
  });

  test('после уровня 35 режим открыт и запускается', async ({ page }) => {
    await seedCleared(page, UNLOCK_AT);
    await expect(page.getByTestId('menu-endless-locked')).toHaveCount(0);
    await page.getByTestId('menu-endless').click();
    await expect(page.getByTestId('screen-game')).toBeVisible({ timeout: 15_000 });
  });

  test('Высшая лига остаётся наградой за кампанию и раньше срока не появляется', async ({ page }) => {
    await seedCleared(page, UNLOCK_AT);
    await expect(page.getByTestId('menu-elite')).toHaveCount(0);
  });
});
