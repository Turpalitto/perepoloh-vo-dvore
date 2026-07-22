import { chromium, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseURL = process.argv[2] ?? 'http://127.0.0.1:4173';
const output = resolve('screenshots');

async function openLevel(page: Page, level: 1 | 72): Promise<void> {
  await page.goto(`${baseURL}/?mock=1&lang=ru&daytime=day`);
  if (level === 72) {
    await page.evaluate(() => {
      const stars = Object.fromEntries(Array.from({ length: 71 }, (_, index) => [String(index + 1), 3]));
      localStorage.setItem(
        'parkovka.save.v1',
        JSON.stringify({
          v: 1,
          stars,
          sound: false,
          music: false,
          lang: 'ru',
          langChosen: true,
          lastLevel: 72,
          targetSkin: 4,
          reviewAsked: true
        })
      );
    });
    await page.reload();
    await page.getByTestId('menu-levels').click();
    // Экран сам плавно доводит текущий уровень до центра; DOM-click не ждёт
    // окончания этой декоративной прокрутки и даёт детерминированный кадр.
    await page.getByTestId('level-card-72').evaluate((element) => (element as HTMLElement).click());
  } else {
    await page.getByTestId('menu-play').click();
  }
  await page.getByTestId('board').waitFor({ state: 'visible' });
  await page.waitForTimeout(900);
}

async function capture(): Promise<void> {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    const mobile = await browser.newPage({ viewport: { width: 720, height: 1280 }, isMobile: true, hasTouch: true });
    await openLevel(mobile, 1);
    await mobile.screenshot({ path: resolve(output, 'mobile-game.png') });
    await openLevel(mobile, 72);
    await mobile.screenshot({ path: resolve(output, 'mobile-boss.png') });
    await mobile.close();

    const desktop = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await openLevel(desktop, 1);
    await desktop.screenshot({ path: resolve(output, 'desktop-game.png') });
    await openLevel(desktop, 72);
    await desktop.screenshot({ path: resolve(output, 'desktop-boss.png') });
    await desktop.close();
  } finally {
    await browser.close();
  }
}

void capture();
