/**
 * Скриншоты для визуального аудита: полный двор, сложные уровни.
 * Запуск: npx tsx scripts/visual-audit.ts [baseUrl]
 */
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:5173';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${base}/?mock=1`);
  // полный прогресс: все 12 уровней на 3 звезды
  await page.evaluate(() => {
    const stars: Record<string, number> = {};
    for (let i = 1; i <= 12; i++) stars[String(i)] = 3;
    localStorage.setItem('parkovka.save.v1', JSON.stringify({ v: 1, stars, sound: true, lastLevel: 12 }));
  });
  await page.reload();
  await page.waitForSelector('[data-testid=menu-play]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/audit-menu-full.png' });

  await page.getByTestId('menu-levels').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/audit-levels-full.png' });

  for (const id of [8, 10, 12]) {
    await page.getByTestId(`level-card-${id}`).click();
    await page.waitForSelector('[data-testid=board]');
    await page.waitForTimeout(900);
    await page.screenshot({ path: `screenshots/audit-level-${id}.png` });
    await page.getByTestId('btn-pause').click();
    await page.waitForTimeout(300);
    if (id === 8) await page.screenshot({ path: 'screenshots/audit-pause.png' });
    await page.getByTestId('btn-exit-menu').click();
    await page.waitForTimeout(300);
    await page.getByTestId('menu-levels').click();
    await page.waitForTimeout(300);
  }
  // уровень 1: полоса допустимого хода (сквозь ворота), затем конфетти на победе
  await page.getByTestId('level-card-1').click();
  await page.waitForSelector('[data-piece="T"]');
  await page.waitForTimeout(400);
  const t1 = (await page.locator('[data-piece="T"]').boundingBox())!;
  await page.mouse.move(t1.x + 30, t1.y + 30);
  await page.mouse.down();
  await page.mouse.move(t1.x + 55, t1.y + 30, { steps: 3 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/audit-drag-range.png' });
  await page.mouse.move(t1.x + 30 + 420, t1.y + 30, { steps: 8 });
  await page.mouse.up();
  await page.waitForSelector('[data-testid=win-overlay]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/audit-win-confetti.png' });

  await browser.close();
  console.log('готово: screenshots/audit-*.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
