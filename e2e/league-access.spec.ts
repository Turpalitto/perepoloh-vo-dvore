import { Page, expect, test } from '@playwright/test';
import { CAMPAIGN_LEVEL_IDS, LAST_CAMPAIGN_LEVEL_ID } from './campaign-levels';

const TEASER_AT = 50;
const PREVIEW_AT = 65;

async function seedCampaign(page: Page, count: number, extras: Record<string, unknown> = {}): Promise<void> {
  const ids = CAMPAIGN_LEVEL_IDS.slice(0, count);
  await page.addInitScript(
    ({ levelIds, extra }) => {
      localStorage.setItem(
        'parkovka.save.v1',
        JSON.stringify({
          v: 1,
          stars: Object.fromEntries(levelIds.map((id) => [String(id), 3])),
          sound: false,
          music: false,
          lang: 'ru',
          lastLevel: levelIds[levelIds.length - 1] ?? 1,
          targetSkin: 0,
          ...extra
        })
      );
    },
    { levelIds: ids, extra: extras }
  );
  await page.goto('/?mock=1&lang=ru&season=none');
  await expect(page.getByTestId('screen-menu')).toBeVisible();
}

test.describe('ранний доступ к Высшей лиге', () => {
  test('до порога скрыта, затем показывает выключенный тизер', async ({ page }) => {
    await seedCampaign(page, TEASER_AT - 1);
    await expect(page.getByTestId('menu-elite')).toHaveCount(0);
    await expect(page.getByTestId('menu-elite-locked')).toHaveCount(0);

    await seedCampaign(page, TEASER_AT);
    const teaser = page.getByTestId('menu-elite-locked');
    await expect(teaser).toBeDisabled();
    await expect(teaser).toContainText(`после уровня ${PREVIEW_AT}`);
  });

  test('после уровня 65 открывает только первый дивизион', async ({ page }) => {
    await seedCampaign(page, PREVIEW_AT);
    await page.getByTestId('menu-elite').click();
    await expect(page.getByTestId('screen-elite')).toBeVisible();
    await expect(page.getByTestId('elite-card-1')).toBeEnabled();
    await expect(page.getByTestId('elite-division-2')).toContainText('после прохождения кампании');
    await expect(page.getByTestId('elite-weekly-locked')).toBeVisible();
    await expect(page.getByTestId('grandpa-trials-entry')).toHaveCount(0);
  });
});

test.describe('Испытания деда', () => {
  test('после финала открываются, тратят попытку и один раз выдают награду', async ({ page }) => {
    await seedCampaign(page, 0, {
      stars: { [String(LAST_CAMPAIGN_LEVEL_ID)]: 3 },
      lastLevel: LAST_CAMPAIGN_LEVEL_ID,
      campaignDone: true,
      endingSeen: true,
      eliteIntroSeen: true
    });
    await page.getByTestId('menu-elite').click();
    await page.getByTestId('grandpa-trials-open').click();
    await expect(page.getByTestId('screen-grandpa-trials')).toBeVisible();
    await expect(page.getByTestId('grandpa-trial-grandpa-1')).toContainText('Попыток осталось: 3');

    await page.getByTestId('grandpa-trial-grandpa-1').click();
    await expect(page.getByTestId('screen-game')).toBeVisible();
    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts: { starCollected: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    await expect(page.getByTestId('grandpa-trial-result')).toBeVisible();
    await expect(page.getByTestId('grandpa-trial-reward')).toContainText('+1');
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('parkovka.save.v1') ?? '{}'));
    expect(save.grandpaTrials['grandpa-1']).toEqual({ attempts: 1, best: 3, rewarded: true });
    expect(save.hintTokens).toBe(1);
  });

  test('после трёх попыток карточка недоступна', async ({ page }) => {
    await seedCampaign(page, 0, {
      stars: { [String(LAST_CAMPAIGN_LEVEL_ID)]: 3 },
      lastLevel: LAST_CAMPAIGN_LEVEL_ID,
      campaignDone: true,
      endingSeen: true,
      eliteIntroSeen: true,
      grandpaTrials: { 'grandpa-1': { attempts: 3, best: 1, rewarded: true } }
    });
    await page.getByTestId('menu-elite').click();
    await page.getByTestId('grandpa-trials-open').click();
    await expect(page.getByTestId('grandpa-trial-grandpa-1')).toBeDisabled();
    await expect(page.getByTestId('grandpa-trial-grandpa-1')).toContainText('Попыток осталось: 0');
  });
});
