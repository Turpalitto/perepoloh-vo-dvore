import { Page, expect, test } from '@playwright/test';

type SaveData = {
  campaignDone?: boolean;
  endingSeen?: boolean;
  endlessBest?: number;
  eliteMedals?: Record<string, number>;
  targetSkin?: number;
  [key: string]: unknown;
};

const NO_UNDO = new Set([2, 6, 10, 14, 18, 22]);
const NO_HINTS = new Set([4, 8, 12, 16, 20, 24]);

async function seedSave(page: Page, overrides: SaveData = {}): Promise<void> {
  await page.addInitScript((data) => {
    if (sessionStorage.getItem('post-campaign-seeded') === '1') return;
    localStorage.setItem('parkovka.save.v1', JSON.stringify(data));
    sessionStorage.setItem('post-campaign-seeded', '1');
  }, {
    v: 1,
    stars: { '100': 3 },
    sound: true,
    music: true,
    lang: 'ru',
    lastLevel: 100,
    targetSkin: 0,
    campaignDone: true,
    endingSeen: true,
    ...overrides
  });
}

async function seedBeforeFinalBoss(page: Page): Promise<void> {
  const stars = Object.fromEntries(Array.from({ length: 99 }, (_, index) => [String(index + 1), 3]));
  await seedSave(page, {
    stars,
    lastLevel: 99,
    campaignDone: undefined,
    endingSeen: undefined
  });
}

async function readSave(page: Page): Promise<SaveData> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('parkovka.save.v1') ?? '{}'));
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

async function completeFinalBoss(page: Page): Promise<void> {
  await page.getByTestId('menu-play').click();
  await expect(page.getByTestId('boss-name')).toHaveText('Великий переполох');
  await page.getByTestId('boss-start').click();

  for (let phase = 1; phase <= 3; phase++) {
    await expect(page.getByTestId('boss-phase')).toHaveText(`Фаза ${phase} из 3`);
    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts: { starCollected: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    if (phase < 3) await page.getByTestId('boss-continue').click();
  }

  await expect(page.getByTestId('campaign-ending')).toBeVisible();
}

async function openElite(page: Page): Promise<void> {
  await page.getByTestId('menu-elite').click();
  await expect(page.getByTestId('screen-elite')).toBeVisible();
  const intro = page.getByTestId('elite-intro-close');
  if (await intro.isVisible().catch(() => false)) await intro.click();
}

test.describe('Post-campaign', () => {
  test('first finale enters Elite League and unlocks persistent rewards', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedBeforeFinalBoss(page);
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await completeFinalBoss(page);

    await expect(page.getByTestId('ending-reward')).toHaveText(
      'Награда: легендарный скин и доступ к мастер-испытаниям',
      { timeout: 7000 }
    );
    await expect(page.getByTestId('ending-enter')).toBeVisible();
    await expect(page.getByTestId('ending-return')).toBeVisible();
    await page.getByTestId('ending-enter').click();
    await expect(page.getByTestId('screen-elite')).toBeVisible();
    await expect(page.getByTestId('elite-intro')).toBeVisible();
    await page.getByTestId('elite-intro-close').click();
    await page.getByTestId('btn-back').click();

    await expect(page.getByTestId('menu-elite')).toBeVisible();
    await expect(page.getByTestId('menu-endless')).toBeVisible();
    await page.getByTestId('menu-garage').click();
    await expect(page.getByTestId('skin-9')).toBeEnabled();
    await page.getByTestId('skin-9').click();
    await expect(page.getByTestId('skin-9')).toHaveClass(/selected/);
    await page.reload();
    await page.getByTestId('menu-garage').click();
    await expect(page.getByTestId('skin-9')).toHaveClass(/selected/);

    const save = await readSave(page);
    expect(save.campaignDone).toBe(true);
    expect(save.endingSeen).toBe(true);
    expect(save.targetSkin).toBe(9);
  });

  test('finale can return to the yard without losing post-campaign unlocks', async ({ page }) => {
    await seedBeforeFinalBoss(page);
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await completeFinalBoss(page);

    await expect(page.getByTestId('ending-return')).toBeVisible({ timeout: 7000 });
    await page.getByTestId('ending-return').click();
    await expect(page.getByTestId('screen-menu')).toBeVisible();
    await expect(page.getByTestId('menu-elite')).toBeVisible();
    await expect(page.getByTestId('menu-endless')).toBeVisible();
  });

  test('all 25 Elite challenges open and enforce their configured modifiers', async ({ page }) => {
    test.setTimeout(120_000);
    await seedSave(page, { eliteMedals: { '1': 1 } });
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await openElite(page);
    await expect(page.locator('.elite-card')).toHaveCount(25);

    for (let id = 1; id <= 25; id++) {
      await page.getByTestId(`elite-card-${id}`).click();
      await expect(page.getByTestId('screen-game')).toContainText(`Испытание ${id}`);
      await expect(page.getByTestId('board')).toBeVisible();

      if (NO_UNDO.has(id)) await expect(page.getByTestId('btn-undo')).toBeHidden();
      else await expect(page.getByTestId('btn-undo')).toBeVisible();
      if (NO_HINTS.has(id)) await expect(page.getByTestId('btn-hint')).toBeHidden();
      else await expect(page.getByTestId('btn-hint')).toBeVisible();

      await page.getByTestId('btn-pause').click();
      await page.getByTestId('btn-exit-menu').click();
      await openElite(page);
    }
  });

  test('Elite medals improve once, rank up, retry, next and persist', async ({ page }) => {
    const firstEightGold = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [String(index + 1), 3])
    );
    await seedSave(page, { eliteMedals: firstEightGold });
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await openElite(page);
    await expect(page.getByTestId('elite-rank')).toHaveText('Серебряный мастер');
    await expect(page.getByTestId('elite-points')).toContainText('400');

    await page.getByTestId('elite-card-9').click();
    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts: { starCollected: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    await expect(page.getByTestId('elite-result-medal')).toHaveAttribute('data-medal', '3');
    await expect(page.getByTestId('elite-rankup')).toContainText('Золотой мастер');

    await page.getByTestId('elite-retry').click();
    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts: { starCollected: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    await expect(page.getByTestId('elite-result')).toContainText('Лучшее: золото');
    await expect(page.getByTestId('elite-rankup')).toHaveCount(0);

    await page.getByTestId('elite-next').click();
    await expect(page.getByTestId('screen-game')).toContainText('Испытание 10');
    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts: { starCollected: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    await page.getByTestId('elite-back').click();
    await expect(page.getByTestId('elite-rank')).toHaveText('Золотой мастер');
    await expect(page.getByTestId('elite-points')).toContainText('500');

    await page.reload();
    await openElite(page);
    await expect(page.getByTestId('elite-rank')).toHaveText('Золотой мастер');
    const save = await readSave(page);
    expect(save.eliteMedals?.['9']).toBe(3);
    expect(save.eliteMedals?.['10']).toBe(3);
  });

  test('Endless Yard continues, stores best streak and resets a new run', async ({ page }) => {
    test.setTimeout(120_000);
    await seedSave(page);
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await page.getByTestId('menu-endless').click();
    await expect(page.getByTestId('screen-game')).toContainText('Бесконечный двор', { timeout: 30_000 });

    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts: { starCollected: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    await expect(page.getByTestId('endless-streak')).toContainText('серия: 1');
    await expect(page.getByTestId('endless-new-best')).toBeVisible();
    await page.getByTestId('btn-next').click();
    await expect(page.getByTestId('screen-game')).toContainText('Бесконечный двор', { timeout: 30_000 });

    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts: { starCollected: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    await expect(page.getByTestId('endless-streak')).toContainText('серия: 2');
    await page.getByTestId('btn-win-menu').click();
    await expect(page.getByTestId('menu-endless')).toContainText('рекорд: 2');

    await page.reload();
    await expect(page.getByTestId('menu-endless')).toContainText('рекорд: 2');
    await page.getByTestId('menu-endless').click();
    await expect(page.getByTestId('screen-game')).toContainText('Бесконечный двор', { timeout: 30_000 });
    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts: { starCollected: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    await expect(page.getByTestId('endless-streak')).toContainText('серия: 1');
    await expect(page.getByTestId('endless-new-best')).toHaveCount(0);
    expect((await readSave(page)).endlessBest).toBe(2);
  });

  test('finale and the last Elite challenge stay clear of the banner at 320x568', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await seedSave(page, { eliteIntroSeen: true });
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await openElite(page);
    await page.getByTestId('screen-elite').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(page.getByTestId('elite-card-25')).toBeInViewport();
    expect(
      await overlapArea(page, '[data-testid="elite-card-25"]', '[data-testid="mock-banner"]')
    ).toBe(0);

    await page.getByTestId('btn-back').click();
    const stars = Object.fromEntries(
      Array.from({ length: 99 }, (_, index) => [String(index + 1), 3])
    );
    await page.evaluate((stars) => {
      localStorage.setItem(
        'parkovka.save.v1',
        JSON.stringify({
          v: 1,
          stars,
          sound: false,
          music: false,
          lang: 'ru',
          lastLevel: 99,
          targetSkin: 0
        })
      );
    }, stars);
    await page.reload();
    await completeFinalBoss(page);
    await expect(page.getByTestId('ending-reward')).toBeVisible({ timeout: 7000 });
    await expect(page.getByTestId('ending-enter')).toBeInViewport();
    await expect(page.getByTestId('ending-return')).toBeInViewport();
    expect(
      await overlapArea(page, '[data-testid="ending-return"]', '[data-testid="mock-banner"]')
    ).toBe(0);
  });
});
