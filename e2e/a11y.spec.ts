import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Автоматический a11y-скан ключевых экранов (axe-core, wcag2a+wcag2aa).
 * Критичные нарушения (violations с impact critical/serious) считаем падением;
 * moderate и ниже — отчёт в консоль без падения, чтобы не блокировать CI
 * на спорных правилах, которые чиним отдельно.
 */

test.skip(({ browserName }) => browserName !== 'chromium', 'a11y-скан гоняем только на Chromium');

async function scan(page: import('@playwright/test').Page) {
  // Экраны появляются с fade-in (screen-in 0.26s): скан посреди анимации даёт
  // ложные color-contrast на полупрозрачных цветах — ждём полной отрисовки.
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  for (const v of results.violations) {
    const targets = v.nodes.map((n) => n.target.join(' ')).join(', ');
    console.log(`[axe] ${v.id} (${v.impact ?? '?'}) x${v.nodes.length}: ${targets}`);
    if (v.impact === 'critical' || v.impact === 'serious') {
      console.log(`[axe]   ${v.help} — ${v.nodes[0]?.failureSummary ?? ''}`);
      console.log(`[axe]   html: ${v.nodes[0]?.html.slice(0, 200)}`);
    }
  }
  return results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
}

test('меню: нет критичных a11y-нарушений', async ({ page }) => {
  await page.goto('/?mock=1&lang=ru');
  await expect(page.getByTestId('menu-play')).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test('список уровней: нет критичных a11y-нарушений', async ({ page }) => {
  await page.goto('/?mock=1&lang=ru');
  await page.getByTestId('menu-levels').click();
  await expect(page.locator('.levels-grid .level-card').first()).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test('диалог настроек: нет критичных a11y-нарушений', async ({ page }) => {
  await page.goto('/?mock=1&lang=ru');
  await expect(page.getByTestId('menu-play')).toBeVisible();
  // Панель настроек скрыта атрибутом hidden; axe сканирует только видимое.
  await page.getByTestId('menu-settings').click();
  await expect(page.getByTestId('menu-settings-panel')).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test('правила: нет критичных a11y-нарушений', async ({ page }) => {
  await page.goto('/?mock=1&lang=ru');
  await expect(page.getByTestId('menu-play')).toBeVisible();
  // Кнопка правил живёт внутри сворачиваемой панели настроек.
  await page.getByTestId('menu-settings').click();
  await expect(page.getByTestId('menu-rules')).toBeVisible();
  await page.getByTestId('menu-rules').click();
  await expect(page.getByTestId('rules-overlay')).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test('игра и пауза: нет критичных a11y-нарушений', async ({ page }) => {
  await page.goto('/?mock=1&lang=ru');
  await page.getByTestId('menu-play').click();
  await expect(page.getByTestId('board')).toBeVisible();
  expect(await scan(page)).toEqual([]);

  await page.getByTestId('btn-pause').click();
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
  expect(await scan(page)).toEqual([]);
});
