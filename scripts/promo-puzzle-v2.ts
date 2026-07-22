/** Нарезает финальные иконку и обложку с реальной механикой для каталога. */
import { existsSync, readFileSync } from 'node:fs';
import { chromium, type Browser } from '@playwright/test';

const SOURCE = 'promo/ai-cover-puzzle-v2-src.png';

function dataUrl(path: string): string {
  return `data:image/png;base64,${readFileSync(path).toString('base64')}`;
}

async function render(browser: Browser, width: number, height: number, output: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width, height } });
  const image = dataUrl(SOURCE);
  await page.setContent(
    `<style>html,body{margin:0;overflow:hidden}div{width:${width}px;height:${height}px;background:url('${image}') center/cover no-repeat}</style><div></div>`
  );
  await page.screenshot({ path: output });
  await page.close();
  console.log(`создано: ${output}`);
}

async function main(): Promise<void> {
  if (!existsSync(SOURCE)) throw new Error(`Не найден исходник: ${SOURCE}`);
  const browser = await chromium.launch();
  try {
    await render(browser, 800, 470, 'promo/ai-cover-puzzle-v2-800x470.png');
    await render(browser, 512, 512, 'promo/ai-icon-puzzle-v2-512.png');
  } finally {
    await browser.close();
  }
}

void main();
