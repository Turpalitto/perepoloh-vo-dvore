import { Page, expect, test } from '@playwright/test';

/**
 * Условие третьей звезды на экране уровня. Раньше HUD показывал только мягкий
 * лимит par2, и игрок не мог отличить ★★ от ★★★: на уровнях со звездой третья
 * даётся за сбор канистры, на остальных — за более жёсткий лимит ходов.
 */

async function openLevel(page: Page, levelId: number, unlockedUpTo: number): Promise<void> {
  const stars: Record<string, number> = {};
  for (let id = 1; id <= unlockedUpTo; id++) stars[String(id)] = 3;
  await page.addInitScript((stars) => {
    localStorage.setItem(
      'parkovka.save.v1',
      JSON.stringify({ v: 1, stars, sound: true, music: true, lang: 'ru', lastLevel: 1, targetSkin: 0, tutorialSeen: true })
    );
  }, stars);
  await page.goto('/?mock=1&lang=ru');
  await page.getByTestId('menu-levels').click();
  await page.getByTestId(`level-card-${levelId}`).click();
  await expect(page.getByTestId('screen-game')).toBeVisible();
}

test.describe('условие третьей звезды', () => {
  test('уровень без звезды показывает оба лимита ходов', async ({ page }) => {
    // Уровень 4: звезды на поле нет, поэтому ★★★ — это более жёсткий лимит par.
    await openLevel(page, 4, 3);
    await expect(page.getByTestId('hud-goal')).toHaveText('★★ ≤ 5 · ★★★ ≤ 4');
    await expect(page.getByTestId('hud-star')).toHaveCount(0);
  });

  test('уровень со звездой требует именно звезду, а не меньше ходов', async ({ page }) => {
    // Уровень 5: канистра на поле, ★★★ = уложиться в par2 и забрать её.
    await openLevel(page, 5, 4);
    await expect(page.getByTestId('hud-goal')).toHaveText('★★ ≤ 6 · ★★★ +★');
    await expect(page.getByTestId('hud-star')).toBeVisible();
  });

  test('цель читается и не вылезает из плашки на 320x568', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openLevel(page, 5, 4);
    const overflow = await page.evaluate(() => {
      const goal = document.querySelector<HTMLElement>('[data-testid="hud-goal"]');
      const chip = goal?.closest<HTMLElement>('.hud-moves');
      const hud = chip?.closest<HTMLElement>('.hud-top');
      if (!goal || !chip || !hud) return null;
      const g = goal.getBoundingClientRect();
      const h = hud.getBoundingClientRect();
      return { clipped: goal.scrollWidth > goal.clientWidth + 1, outside: g.right > h.right + 1 || g.left < h.left - 1 };
    });
    expect(overflow).toEqual({ clipped: false, outside: false });
  });
});
