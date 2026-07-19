/**
 * Генерация промо-графики для каталога Яндекс Игр из фирменного SVG:
 * promo/icon-512.png, promo/cover-800x470.png, promo/cover-1080x608.png.
 * Запуск: npx tsx scripts/promo.ts
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const TIRE = '#332a20';
const GLASS = '#c7e6f2';

/**
 * Синий «жигулёнок» — те же пропорции, что в игре (кузов 200×100, нос вправо),
 * масштаб задаётся снаружи. Читается как машина, а не автобус.
 */
function heroCar(): string {
  return `
    <rect x="26" y="-3" width="38" height="18" rx="8" fill="${TIRE}"/>
    <rect x="26" y="85" width="38" height="18" rx="8" fill="${TIRE}"/>
    <rect x="136" y="-3" width="38" height="18" rx="8" fill="${TIRE}"/>
    <rect x="136" y="85" width="38" height="18" rx="8" fill="${TIRE}"/>
    <rect x="8" y="12" width="184" height="76" rx="24" fill="#3f7fd1" stroke="#2d5f9f" stroke-width="5"/>
    <rect x="38" y="22" width="18" height="56" rx="6" fill="${GLASS}" stroke="#8fbfd4" stroke-width="2.5"/>
    <rect x="66" y="18" width="60" height="64" rx="12" fill="#6099dd"/>
    <rect x="66" y="42" width="60" height="14" rx="5" fill="#f6c445"/>
    <rect x="132" y="22" width="20" height="56" rx="6" fill="${GLASS}" stroke="#8fbfd4" stroke-width="2.5"/>
    <circle cx="186" cy="28" r="7" fill="#ffe9a8" stroke="#2d5f9f" stroke-width="2.5"/>
    <circle cx="186" cy="72" r="7" fill="#ffe9a8" stroke="#2d5f9f" stroke-width="2.5"/>
    <rect x="10" y="42" width="9" height="18" rx="4" fill="#e8dcc8"/>
    <rect x="62" y="6" width="8" height="12" rx="3" fill="#2d5f9f"/>
    <rect x="62" y="82" width="8" height="12" rx="3" fill="#2d5f9f"/>`;
}

function chicken(scale = 1): string {
  return `
    <g transform="scale(${scale})">
      <path d="M-20 6 Q-29 -12 -12 -12 L 3 -12 Q 21 -12 18 3 Q 15 18 -3 18 Q -17 18 -20 6 Z" fill="#fdf6e8" stroke="#d8c9a8" stroke-width="3"/>
      <circle cx="12" cy="-15" r="10" fill="#fdf6e8" stroke="#d8c9a8" stroke-width="3"/>
      <path d="M9 -25 Q12 -31 15 -25 Q18 -31 21 -24" fill="none" stroke="#d9534a" stroke-width="4" stroke-linecap="round"/>
      <path d="M21 -15 L31 -12 L21 -8 Z" fill="#e8a33d"/>
      <circle cx="13" cy="-16" r="2.4" fill="#3d2c1e"/>
      <path d="M-14 -2 q-12 -6 -18 2" fill="none" stroke="#d8c9a8" stroke-width="4" stroke-linecap="round"/>
      <line x1="-6" y1="18" x2="-6" y2="26" stroke="#e8a33d" stroke-width="4"/>
      <line x1="5" y1="18" x2="5" y2="26" stroke="#e8a33d" stroke-width="4"/>
    </g>`;
}

function dust(x: number, y: number, s: number): string {
  return `
    <g transform="translate(${x},${y}) scale(${s})" opacity="0.75">
      <circle cx="0" cy="0" r="16" fill="#d9c39a"/>
      <circle cx="20" cy="8" r="11" fill="#d9c39a"/>
      <circle cx="-18" cy="9" r="10" fill="#d9c39a"/>
    </g>`;
}

function star(x: number, y: number, s: number): string {
  return `
    <g transform="translate(${x},${y}) scale(${s})">
      <path d="M0 -30 L8.8 -11 L29.5 -8.4 L14.2 6 L18.3 26.5 L0 16.4 L-18.3 26.5 L-14.2 6 L-29.5 -8.4 L-8.8 -11 Z"
        fill="#f6c445" stroke="#d9a520" stroke-width="5" stroke-linejoin="round"/>
    </g>`;
}

function fencePost(x: number, y: number, h: number): string {
  return `<rect x="${x}" y="${y}" width="20" height="${h}" rx="7" fill="#7d5227"/>`;
}

/** Иконка 512×512: машина крупно, курица, звезда. Без скруглений и рамок. */
function iconSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="#79b34c"/>
    <path d="M-20 132 q120 -26 260 -12 q160 14 292 -8 L532 -20 L-20 -20 Z" fill="#6cae46"/>
    <ellipse cx="256" cy="330" rx="252" ry="170" fill="#dbb271"/>
    <ellipse cx="256" cy="330" rx="252" ry="170" fill="none" stroke="rgba(93,64,25,0.25)" stroke-width="6" stroke-dasharray="22 18"/>
    ${fencePost(56, 56, 52)}${fencePost(156, 40, 52)}${fencePost(256, 34, 52)}${fencePost(356, 40, 52)}${fencePost(456, 56, 52)}
    <rect x="30" y="66" width="452" height="16" rx="8" fill="#a9743f" transform="rotate(-1 256 74)"/>
    ${star(438, 130, 1.35)}
    ${dust(74, 330, 1.3)}
    <g transform="translate(96,200) rotate(10) scale(1.62)">
      <ellipse cx="100" cy="106" rx="108" ry="18" fill="rgba(43,29,10,0.28)"/>
      ${heroCar()}
    </g>
    <g transform="translate(120,448) scale(1.7) rotate(-8)">${chicken()}</g>
    <g transform="translate(420,430) scale(1.35) scale(-1,1) rotate(6)">${chicken()}</g>
    <path d="M60 300 q6 -20 14 0 M92 322 q6 -20 14 0" fill="none" stroke="rgba(93,64,25,0.3)" stroke-width="6" stroke-linecap="round"/>
  </svg>`;
}

/** Обложка (viewBox 1080×608): машина мчит к распахнутым воротам, куры врассыпную, вывеска. */
function coverSVG(): string {
  const w = 1080;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 608">
    <rect width="${w}" height="608" fill="#bfe3f2"/>
    <circle cx="950" cy="86" r="54" fill="#f6c445"/>
    <circle cx="950" cy="86" r="72" fill="#f6c445" opacity="0.25"/>
    <ellipse cx="240" cy="80" rx="80" ry="26" fill="#fff" opacity="0.85"/>
    <ellipse cx="640" cy="60" rx="64" ry="20" fill="#fff" opacity="0.75"/>
    <rect x="0" y="196" width="${w}" height="412" fill="#79b34c"/>
    <path d="M0 196 Q540 176 ${w} 196 L${w} 216 Q540 196 0 216 Z" fill="#6cae46"/>
    <ellipse cx="560" cy="470" rx="520" ry="150" fill="#dbb271"/>

    <!-- забор с распахнутыми воротами справа -->
    ${[80, 200, 320, 440, 560, 680].map((x) => fencePost(x, 236, 66)).join('')}
    <rect x="60" y="252" width="654" height="16" rx="8" fill="#a9743f"/>
    <rect x="60" y="290" width="654" height="16" rx="8" fill="#a9743f"/>
    <rect x="714" y="228" width="26" height="86" rx="9" fill="#6b4a1f"/>
    <rect x="948" y="228" width="26" height="86" rx="9" fill="#6b4a1f"/>
    <!-- створки распахнуты на 180°: лежат вдоль забора снаружи проёма -->
    <g transform="translate(714,252) rotate(-6)">
      <rect x="-96" y="0" width="92" height="30" rx="9" fill="#8a5a30" stroke="#63401f" stroke-width="4"/>
      <line x1="-88" y1="15" x2="-12" y2="15" stroke="rgba(0,0,0,0.2)" stroke-width="5"/>
    </g>
    <g transform="translate(974,252) rotate(6)">
      <rect x="4" y="0" width="92" height="30" rx="9" fill="#8a5a30" stroke="#63401f" stroke-width="4"/>
      <line x1="12" y1="15" x2="88" y2="15" stroke="rgba(0,0,0,0.2)" stroke-width="5"/>
    </g>
    <!-- дорожка от ворот до края кадра -->
    <path d="M716 310 L1080 296 L1080 404 L716 396 Z" fill="#c9a45e"/>
    <line x1="744" y1="352" x2="1080" y2="350" stroke="#dbb271" stroke-width="10" stroke-dasharray="26 24"/>

    <!-- сено и трактор-намёк слева -->
    <circle cx="150" cy="384" r="46" fill="#ecc961" stroke="#c9a43e" stroke-width="6"/>
    <path d="M116 370 A 42 42 0 0 1 184 370" fill="none" stroke="#c9a43e" stroke-width="5"/>
    <circle cx="150" cy="384" r="15" fill="#dcb64e" stroke="#c9a43e" stroke-width="4"/>

    <!-- машина мчит к воротам -->
    ${dust(348, 452, 1.8)}
    ${dust(298, 416, 1.2)}
    <g transform="translate(400,332) rotate(3) scale(1.55)">
      <ellipse cx="100" cy="108" rx="112" ry="18" fill="rgba(43,29,10,0.28)"/>
      ${heroCar()}
    </g>

    <!-- куры врассыпную -->
    <g transform="translate(330,560) scale(1.6) rotate(-14)">${chicken()}</g>
    <g transform="translate(560,556) scale(1.4) scale(-1,1) rotate(10)">${chicken()}</g>
    <g transform="translate(850,470) scale(1.3) rotate(-6)">${chicken()}</g>
    ${star(1006, 262, 1.2)}

    <!-- деревянная вывеска -->
    <g transform="translate(64,64) rotate(-3)">
      <rect x="-26" y="-38" width="500" height="150" rx="22" fill="#a9743f" stroke="#7d5227" stroke-width="8"/>
      <rect x="-12" y="-24" width="472" height="122" rx="14" fill="#c89b5a"/>
      <text x="224" y="24" text-anchor="middle" font-family="'Segoe UI', system-ui, sans-serif" font-size="56" font-weight="900" fill="#fff7e6" stroke="#7d5227" stroke-width="10" paint-order="stroke" letter-spacing="1">ПЕРЕПОЛОХ</text>
      <text x="224" y="82" text-anchor="middle" font-family="'Segoe UI', system-ui, sans-serif" font-size="46" font-weight="900" fill="#fff7e6" stroke="#7d5227" stroke-width="9" paint-order="stroke" letter-spacing="1">ВО ДВОРЕ</text>
    </g>
  </svg>`;
}

async function render(svg: string, width: number, height: number, path: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;overflow:hidden}svg{display:block;width:${width}px;height:${height}px}</style>` +
      svg.replace('<svg ', '<svg preserveAspectRatio="xMidYMid slice" ')
  );
  await page.waitForTimeout(150);
  await page.screenshot({ path });
  await browser.close();
  console.log('создано:', path);
}

async function main() {
  mkdirSync('promo', { recursive: true });
  await render(iconSVG(), 512, 512, 'promo/icon-512.png');
  await render(coverSVG(), 800, 470, 'promo/cover-800x470.png');
  await render(coverSVG(), 1080, 608, 'promo/cover-1080x608.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
