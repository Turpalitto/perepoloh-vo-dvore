/**
 * Обработка сгенерированных ИИ промо-исходников под форматы Яндекс Игр.
 * Входные файлы (положить руками):
 *   promo/ai-icon-src.png  — квадратная иконка (скруглённые углы будут срезаны кропом)
 *   promo/ai-cover-src.png — широкая обложка
 * Выход:
 *   promo/ai-icon-512.png
 *   promo/ai-cover-800x470.png
 *   promo/ai-cover-1080x608.png
 *   promo/ai-cover-titled-1080x608.png (с вывеской «Переполох во дворе»)
 * Запуск: npx tsx scripts/promo-ai.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { chromium, Browser } from '@playwright/test';

const ICON_SRC = 'promo/ai-icon-src.png';
const COVER_SRC = 'promo/ai-cover-src.png';
/** Доля кропа с каждой стороны иконки — срезает скруглённые углы (радиус до ~25%). */
const ICON_INSET = 0.075;

function dataUrl(path: string): string {
  return `data:image/png;base64,${readFileSync(path).toString('base64')}`;
}

/** Деревянная вывеска с названием (та же, что в scripts/promo.ts). */
function signSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -52 540 184" style="position:absolute;left:2.5%;top:3%;width:44%;transform:rotate(-3deg)">
    <rect x="-26" y="-38" width="500" height="150" rx="22" fill="#a9743f" stroke="#7d5227" stroke-width="8"/>
    <rect x="-12" y="-24" width="472" height="122" rx="14" fill="#c89b5a"/>
    <text x="224" y="24" text-anchor="middle" font-family="'Segoe UI', system-ui, sans-serif" font-size="56" font-weight="900" fill="#fff7e6" stroke="#7d5227" stroke-width="10" paint-order="stroke" letter-spacing="1">ПЕРЕПОЛОХ</text>
    <text x="224" y="82" text-anchor="middle" font-family="'Segoe UI', system-ui, sans-serif" font-size="46" font-weight="900" fill="#fff7e6" stroke="#7d5227" stroke-width="9" paint-order="stroke" letter-spacing="1">ВО ДВОРЕ</text>
  </svg>`;
}

async function shoot(browser: Browser, html: string, w: number, h: number, out: string) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<style>html,body{margin:0;padding:0;overflow:hidden}</style>${html}`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: out });
  await page.close();
  console.log('создано:', out);
}

async function main() {
  const missing = [ICON_SRC, COVER_SRC].filter((p) => !existsSync(p));
  if (missing.length > 0) {
    console.error(`Не найдены исходники: ${missing.join(', ')}\nСохраните сгенерированные картинки под этими именами и повторите запуск.`);
    process.exit(1);
  }
  const icon = dataUrl(ICON_SRC);
  const cover = dataUrl(COVER_SRC);
  const browser = await chromium.launch();

  // иконка: увеличиваем фон так, чтобы скруглённые углы ушли за кадр
  const zoom = (100 / (1 - 2 * ICON_INSET)).toFixed(2);
  await shoot(
    browser,
    `<div style="width:512px;height:512px;background-image:url('${icon}');background-size:${zoom}% ${zoom}%;background-position:center"></div>`,
    512,
    512,
    'promo/ai-icon-512.png'
  );

  // обложки: центр-кроп под форматы каталога
  const coverDiv = (w: number, h: number, extra = '') =>
    `<div style="position:relative;width:${w}px;height:${h}px;background-image:url('${cover}');background-size:cover;background-position:center">${extra}</div>`;
  await shoot(browser, coverDiv(800, 470), 800, 470, 'promo/ai-cover-800x470.png');
  await shoot(browser, coverDiv(1080, 608), 1080, 608, 'promo/ai-cover-1080x608.png');
  await shoot(browser, coverDiv(1080, 608, signSVG()), 1080, 608, 'promo/ai-cover-titled-1080x608.png');

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
