import { Page, expect, test } from '@playwright/test';
import { CAMPAIGN_LEVEL_IDS } from './campaign-levels';

/**
 * Матрица «состояние игрока × размер экрана» для главного меню.
 *
 * Адаптивные тесты до сих пор проверяли два крайних случая — чистый профиль и
 * завершённую кампанию. Между ними меню заметно меняется: появляются вкладки
 * Endless и Высшей лиги, недельные задания с готовой наградой, подарок,
 * счётчик достижений. Ломается обычно самое перегруженное состояние, а оно как
 * раз и не воспроизводилось.
 *
 * Проверяем три вещи, которые действительно ломаются на узких экранах:
 * горизонтального переполнения нет, ключевые контролы состояния видны, и ничто
 * не залезает под липкий баннер.
 */

const VIEWPORTS = [
  { width: 320, height: 568, name: '320x568' },
  { width: 360, height: 640, name: '360x640' },
  { width: 844, height: 390, name: '844x390 (альбом)' }
] as const;

interface MenuState {
  name: string;
  /** Сейв целиком; id уровней берутся из данных, а не из диапазона 1..N. */
  save: Record<string, unknown>;
  /** Контролы, которые обязаны присутствовать именно в этом состоянии. */
  expect: string[];
}

const starsFor = (count: number, stars = 3): Record<string, number> =>
  Object.fromEntries(CAMPAIGN_LEVEL_IDS.slice(0, count).map((id) => [String(id), stars]));

const BASE = { v: 1, sound: false, music: false, lang: 'ru', targetSkin: 0 };

const STATES: MenuState[] = [
  {
    name: 'новый игрок',
    save: { ...BASE, stars: {}, lastLevel: 1 },
    expect: ['menu-play', 'menu-levels', 'menu-daily']
  },
  {
    name: '20 уровней пройдено (Endless в тизере)',
    save: { ...BASE, stars: starsFor(20), lastLevel: CAMPAIGN_LEVEL_IDS[19] },
    expect: ['menu-play', 'menu-endless-locked']
  },
  {
    name: 'Endless открыт (позиция 35)',
    save: { ...BASE, stars: starsFor(35), lastLevel: CAMPAIGN_LEVEL_IDS[34], endlessBest: 4 },
    expect: ['menu-play', 'menu-endless']
  },
  {
    name: 'кампания завершена: лига, Endless, подарок и недельная награда разом',
    // Самое перегруженное меню игры — здесь ломается раньше всего.
    save: {
      ...BASE,
      stars: starsFor(CAMPAIGN_LEVEL_IDS.length),
      lastLevel: CAMPAIGN_LEVEL_IDS[CAMPAIGN_LEVEL_IDS.length - 1],
      campaignDone: true,
      campaignDoneAt: '2026-07-20',
      endingSeen: true,
      endlessBest: 7,
      daily: { last: '2026-07-01', streak: 5, trophies: 2 },
      eliteMedals: { 'elite-1': 3, 'elite-2': 2 }
    },
    expect: ['menu-play', 'menu-elite', 'menu-endless', 'menu-daily', 'menu-achievements']
  }
];

async function seed(page: Page, save: Record<string, unknown>): Promise<void> {
  await page.addInitScript((data) => {
    localStorage.setItem('parkovka.save.v1', JSON.stringify(data));
  }, save);
}

/** Ширина документа не должна превышать вьюпорт: горизонтальный скролл в меню — дефект. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
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

test.describe('Главное меню: матрица состояний и размеров', () => {
  for (const state of STATES) {
    for (const viewport of VIEWPORTS) {
      test(`${state.name} — ${viewport.name}`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(`console: ${m.text()}`);
        });

        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await seed(page, state.save);
        await page.goto('/?mock=1&lang=ru&daytime=day');
        await expect(page.getByTestId('screen-menu')).toBeVisible();

        for (const testId of state.expect) {
          await expect(page.getByTestId(testId), `${state.name}: нет ${testId}`).toBeVisible();
        }

        expect(await horizontalOverflow(page), `${state.name}: горизонтальное переполнение`).toBeLessThanOrEqual(1);

        // Главная кнопка обязана оставаться доступной и не уходить под баннер.
        await expect(page.getByTestId('menu-play')).toBeInViewport();
        expect(
          await overlapArea(page, '[data-testid="menu-play"]', '[data-testid="mock-banner"]'),
          `${state.name}: «Играть» под липким баннером`
        ).toBe(0);

        expect(errors).toEqual([]);
      });
    }
  }
});
