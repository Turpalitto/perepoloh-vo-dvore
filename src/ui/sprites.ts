/**
 * Вся графика — программный SVG. Техника рисуется горизонтально,
 * «носом» вправо, в боксе (len*100)×100; вертикальные фигуры поворачивает board.ts.
 */
import type { PieceDef, WallKind } from '../core/types';

export const CELL = 100;

interface CarColors {
  body: string;
  dark: string;
  light: string;
}

const CAR_SKINS: CarColors[] = [
  { body: '#d9534a', dark: '#a83a33', light: '#e3766e' },
  { body: '#45968f', dark: '#31716b', light: '#67aca6' },
  { body: '#e0a32e', dark: '#b07c1a', light: '#eab95e' }
];

/** Скины целевого «жигулёнка»; открываются за суммарные звёзды. */
export interface TargetSkin extends CarColors {
  /** Порог суммарных звёзд для открытия. */
  unlockStars: number;
  nameKey: string;
  /** Эксклюзив Высшей лиги: открывается прохождением кампании, а не звёздами. */
  elite?: boolean;
}

export const TARGET_SKINS: TargetSkin[] = [
  { body: '#3f7fd1', dark: '#2d5f9f', light: '#6099dd', unlockStars: 0, nameKey: 'skin.blue' },
  { body: '#8b5fc9', dark: '#6a4499', light: '#a37fd9', unlockStars: 20, nameKey: 'skin.violet' },
  { body: '#e07b39', dark: '#b25a20', light: '#ea9a63', unlockStars: 50, nameKey: 'skin.orange' },
  { body: '#e06a9f', dark: '#b34a7c', light: '#ea8fb8', unlockStars: 85, nameKey: 'skin.pink' },
  { body: '#4a4a52', dark: '#31313a', light: '#68686f', unlockStars: 120, nameKey: 'skin.black' },
  { body: '#4f9e50', dark: '#347236', light: '#75b976', unlockStars: 155, nameKey: 'skin.green' },
  { body: '#eee1bd', dark: '#aa9365', light: '#fff4d5', unlockStars: 190, nameKey: 'skin.cream' },
  { body: '#b9252d', dark: '#81191f', light: '#dc4b52', unlockStars: 220, nameKey: 'skin.red' },
  { body: '#d8ae27', dark: '#987713', light: '#f0cf5a', unlockStars: 250, nameKey: 'skin.gold' },
  // Легендарный эксклюзив: unlockStars недостижимо (999) — открывается только
  // флагом campaignDone, отдельной веткой в UI. Тёмно-изумрудный с золотом.
  { body: '#1f6f52', dark: '#124232', light: '#3fa07a', unlockStars: 999, nameKey: 'skin.legend', elite: true }
];

let targetSkinIdx = 0;

export function setTargetSkin(i: number): void {
  targetSkinIdx = Math.max(0, Math.min(TARGET_SKINS.length - 1, i));
}

export function getTargetSkin(): TargetSkin {
  return TARGET_SKINS[targetSkinIdx];
}

const TARGET: CarColors = TARGET_SKINS[0];
const GLASS = '#c7e6f2';
const GLASS_DARK = '#8fbfd4';
const TIRE = '#332a20';

/** Счётчик для гарантированно уникальных id градиентов на странице. */
let gradSeq = 0;

/** Вертикальный градиент «блик сверху» — даёт плоским фигурам объём. */
function gradFill(top: string, bottom: string): { defs: string; fill: string } {
  const id = `sg${gradSeq++}`;
  return {
    defs: `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`,
    fill: `url(#${id})`
  };
}

function wheels(xs: number[]): string {
  return xs
    .map(
      (x) =>
        `<rect x="${x}" y="2" width="34" height="15" rx="7" fill="${TIRE}"/>` +
        `<rect x="${x}" y="83" width="34" height="15" rx="7" fill="${TIRE}"/>`
    )
    .join('');
}

type CarVariant = 'target' | 0 | 1 | 2;

function carBody(c: CarColors, variant: CarVariant): string {
  const g = gradFill(c.light, c.body);
  if (variant === 'target') {
    return `
      <defs>${g.defs}</defs>
      ${wheels([24, 140])}
      <rect x="5" y="13" width="190" height="74" rx="17" fill="${g.fill}" stroke="${c.dark}" stroke-width="5"/>
      <rect x="2" y="35" width="9" height="30" rx="4" fill="#e8dcc8" stroke="#8f8578" stroke-width="2"/>
      <rect x="189" y="35" width="9" height="30" rx="4" fill="#e8dcc8" stroke="#8f8578" stroke-width="2"/>
      <path d="M31 18 V82 M166 18 V82" stroke="${c.dark}" stroke-width="2.5" opacity="0.65"/>
      <rect x="42" y="23" width="22" height="54" rx="5" fill="${GLASS}" stroke="${GLASS_DARK}" stroke-width="3"/>
      <rect x="69" y="18" width="62" height="64" rx="8" fill="#fff0bf" stroke="${c.dark}" stroke-width="3"/>
      <rect x="75" y="24" width="50" height="52" rx="7" fill="${c.light}"/>
      <rect x="75" y="44" width="50" height="12" rx="4" fill="#f6c445"/>
      <path d="M80 29 H120" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.32"/>
      <rect x="137" y="23" width="22" height="54" rx="5" fill="${GLASS}" stroke="${GLASS_DARK}" stroke-width="3"/>
      <path d="M168 39 L184 50 L168 61 Z" fill="#f6c445" stroke="#8a6114" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="188" cy="29" r="6.5" fill="#fff1a8" stroke="${c.dark}" stroke-width="2"/>
      <circle cx="188" cy="71" r="6.5" fill="#fff1a8" stroke="${c.dark}" stroke-width="2"/>
      <rect x="11" y="23" width="7" height="15" rx="3" fill="#d83f38" stroke="${c.dark}" stroke-width="2"/>
      <rect x="11" y="62" width="7" height="15" rx="3" fill="#d83f38" stroke="${c.dark}" stroke-width="2"/>
      <rect x="88" y="8" width="24" height="6" rx="3" fill="#e8dcc8" opacity="0.9"/>`;
  }

  if (variant === 1) {
    return `
      <defs>${g.defs}</defs>
      ${wheels([24, 140])}
      <rect x="7" y="13" width="186" height="74" rx="15" fill="${g.fill}" stroke="${c.dark}" stroke-width="4"/>
      <rect x="28" y="23" width="25" height="54" rx="6" fill="${GLASS}" stroke="${GLASS_DARK}" stroke-width="2"/>
      <rect x="58" y="18" width="82" height="64" rx="11" fill="${c.light}" stroke="${c.dark}" stroke-width="2"/>
      <rect x="64" y="24" width="31" height="52" rx="7" fill="${GLASS}" opacity="0.9"/>
      <rect x="101" y="24" width="33" height="52" rx="7" fill="${GLASS}" opacity="0.9"/>
      <path d="M98 23 V77" stroke="${GLASS_DARK}" stroke-width="3"/>
      <rect x="148" y="23" width="24" height="54" rx="6" fill="${GLASS}" stroke="${GLASS_DARK}" stroke-width="2"/>
      <circle cx="187" cy="30" r="6" fill="#ffe9a8" stroke="${c.dark}" stroke-width="2"/>
      <circle cx="187" cy="70" r="6" fill="#ffe9a8" stroke="${c.dark}" stroke-width="2"/>
      <rect x="10" y="24" width="7" height="14" rx="3" fill="#d94a3d"/>
      <rect x="10" y="62" width="7" height="14" rx="3" fill="#d94a3d"/>`;
  }

  if (variant === 2) {
    return `
      <defs>${g.defs}</defs>
      ${wheels([32, 128])}
      <rect x="19" y="14" width="168" height="72" rx="31" fill="${g.fill}" stroke="${c.dark}" stroke-width="4"/>
      <rect x="48" y="25" width="21" height="50" rx="8" fill="${GLASS}" stroke="${GLASS_DARK}" stroke-width="2"/>
      <rect x="74" y="20" width="56" height="60" rx="18" fill="${c.light}"/>
      <path d="M81 27 Q102 20 123 27" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.3"/>
      <rect x="136" y="25" width="20" height="50" rx="8" fill="${GLASS}" stroke="${GLASS_DARK}" stroke-width="2"/>
      <circle cx="178" cy="32" r="6" fill="#ffe9a8" stroke="${c.dark}" stroke-width="2"/>
      <circle cx="178" cy="68" r="6" fill="#ffe9a8" stroke="${c.dark}" stroke-width="2"/>
      <circle cx="27" cy="32" r="4.5" fill="#d94a3d"/>
      <circle cx="27" cy="68" r="4.5" fill="#d94a3d"/>`;
  }

  return `
    <defs>${g.defs}</defs>
    ${wheels([26, 138])}
    <rect x="8" y="14" width="184" height="72" rx="24" fill="${g.fill}" stroke="${c.dark}" stroke-width="4"/>
    <rect x="38" y="24" width="18" height="52" rx="6" fill="${GLASS}" stroke="${GLASS_DARK}" stroke-width="2"/>
    <rect x="66" y="20" width="60" height="60" rx="12" fill="${c.light}"/>
    <rect x="132" y="24" width="20" height="52" rx="6" fill="${GLASS}" stroke="${GLASS_DARK}" stroke-width="2"/>
    <path d="M72 25 H120" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.25"/>
    <circle cx="186" cy="30" r="6" fill="#ffe9a8" stroke="${c.dark}" stroke-width="2"/>
    <circle cx="186" cy="70" r="6" fill="#ffe9a8" stroke="${c.dark}" stroke-width="2"/>
    <circle cx="14" cy="30" r="4.5" fill="#d94a3d" stroke="${c.dark}" stroke-width="2"/>
    <circle cx="14" cy="70" r="4.5" fill="#d94a3d" stroke="${c.dark}" stroke-width="2"/>
    <rect x="10" y="42" width="8" height="16" rx="3" fill="#e8dcc8"/>`;
}

function truckBody(): string {
  const box = gradFill('#a9754a', '#8a6134');
  const cab = gradFill('#7fa0c7', '#5b7ea8');
  return `
    <defs>${box.defs}${cab.defs}</defs>
    ${wheels([28, 96, 246])}
    <rect x="6" y="12" width="192" height="76" rx="10" fill="${box.fill}" stroke="#69481f" stroke-width="4"/>
    <line x1="54" y1="16" x2="54" y2="84" stroke="#69481f" stroke-width="3"/>
    <line x1="102" y1="16" x2="102" y2="84" stroke="#69481f" stroke-width="3"/>
    <line x1="150" y1="16" x2="150" y2="84" stroke="#69481f" stroke-width="3"/>
    <circle cx="55" cy="38" r="21" fill="#eac95e" stroke="#c2a03c" stroke-width="3"/>
    <circle cx="100" cy="60" r="23" fill="#e3bf50" stroke="#c2a03c" stroke-width="3"/>
    <circle cx="146" cy="36" r="19" fill="#eac95e" stroke="#c2a03c" stroke-width="3"/>
    <rect x="204" y="14" width="88" height="72" rx="14" fill="${cab.fill}" stroke="#40607f" stroke-width="4"/>
    <rect x="252" y="22" width="20" height="56" rx="6" fill="${GLASS}" stroke="${GLASS_DARK}" stroke-width="2"/>
    <rect x="214" y="30" width="26" height="40" rx="8" fill="#6f92ba"/>
    <circle cx="288" cy="28" r="5" fill="#ffe9a8" stroke="#40607f" stroke-width="2"/>
    <circle cx="288" cy="72" r="5" fill="#ffe9a8" stroke="#40607f" stroke-width="2"/>`;
}

function tractorBody(): string {
  const trailer = gradFill('#c08c54', '#a9743f');
  const cab = gradFill('#dd6a5e', '#c4453c');
  return `
    <defs>${trailer.defs}${cab.defs}</defs>
    <!-- прицеп -->
    <rect x="28" y="4" width="30" height="14" rx="7" fill="${TIRE}"/>
    <rect x="28" y="82" width="30" height="14" rx="7" fill="${TIRE}"/>
    <rect x="120" y="4" width="30" height="14" rx="7" fill="${TIRE}"/>
    <rect x="120" y="82" width="30" height="14" rx="7" fill="${TIRE}"/>
    <rect x="8" y="14" width="172" height="72" rx="10" fill="${trailer.fill}" stroke="#7d5227" stroke-width="4"/>
    <line x1="50" y1="18" x2="50" y2="82" stroke="#7d5227" stroke-width="3"/>
    <line x1="94" y1="18" x2="94" y2="82" stroke="#7d5227" stroke-width="3"/>
    <line x1="138" y1="18" x2="138" y2="82" stroke="#7d5227" stroke-width="3"/>
    <circle cx="60" cy="42" r="22" fill="#eac95e" stroke="#c2a03c" stroke-width="3"/>
    <circle cx="110" cy="58" r="24" fill="#e3bf50" stroke="#c2a03c" stroke-width="3"/>
    <circle cx="146" cy="38" r="17" fill="#eac95e" stroke="#c2a03c" stroke-width="3"/>
    <!-- дышло -->
    <rect x="180" y="46" width="30" height="8" rx="4" fill="#5a4632"/>
    <!-- трактор -->
    <rect x="206" y="0" width="42" height="22" rx="10" fill="${TIRE}"/>
    <rect x="206" y="78" width="42" height="22" rx="10" fill="${TIRE}"/>
    <rect x="262" y="6" width="26" height="14" rx="7" fill="${TIRE}"/>
    <rect x="262" y="80" width="26" height="14" rx="7" fill="${TIRE}"/>
    <rect x="210" y="24" width="82" height="52" rx="12" fill="${cab.fill}" stroke="#93302a" stroke-width="4"/>
    <rect x="218" y="34" width="34" height="32" rx="8" fill="${GLASS}" stroke="${GLASS_DARK}" stroke-width="2"/>
    <rect x="258" y="30" width="28" height="40" rx="6" fill="#d05c50"/>
    <rect x="282" y="40" width="12" height="20" rx="4" fill="#8f8578"/>
    <circle cx="290" cy="32" r="5" fill="#ffe9a8" stroke="#93302a" stroke-width="2"/>
    <circle cx="290" cy="68" r="5" fill="#ffe9a8" stroke="#93302a" stroke-width="2"/>`;
}

function crateBody(): string {
  const wood = gradFill('#e0b978', '#c89b5a');
  return `
    <defs>${wood.defs}</defs>
    <rect x="14" y="14" width="72" height="72" rx="8" fill="${wood.fill}" stroke="#8f6a35" stroke-width="5"/>
    <line x1="20" y1="20" x2="80" y2="80" stroke="#8f6a35" stroke-width="4"/>
    <line x1="80" y1="20" x2="20" y2="80" stroke="#8f6a35" stroke-width="4"/>
    <rect x="14" y="42" width="72" height="16" fill="#b9884a" stroke="#8f6a35" stroke-width="3"/>
    <g class="crate-badge">
      <circle cx="78" cy="24" r="17" fill="#fff7e6" stroke="#8f6a35" stroke-width="3"/>
      <text class="crate-badge-text" x="78" y="31" text-anchor="middle" font-size="22" font-weight="700" fill="#6b4a1f">2</text>
    </g>`;
}

/** Горизонтальный спрайт фигуры (без поворота и без позиции). */
export function pieceArt(def: PieceDef): string {
  const shadow = `<rect x="10" y="20" width="${def.len * CELL - 14}" height="76" rx="20" fill="rgba(43,29,10,0.25)"/>`;
  switch (def.kind) {
    case 'target':
      return shadow + carBody(TARGET_SKINS[targetSkinIdx] ?? TARGET, 'target');
    case 'car':
      return shadow + carBody(CAR_SKINS[(def.skin ?? 0) % CAR_SKINS.length], (def.skin ?? 0) % CAR_SKINS.length as 0 | 1 | 2);
    case 'truck':
      return shadow + truckBody();
    case 'tractor':
      return shadow + tractorBody();
    case 'crate':
      return `<rect x="12" y="18" width="82" height="76" rx="10" fill="rgba(43,29,10,0.25)"/>` + crateBody();
  }
}

export function wallArt(kind: WallKind): string {
  switch (kind) {
    case 'hay':
      return `
        <circle cx="50" cy="52" r="38" fill="#ecc961" stroke="#c9a43e" stroke-width="5"/>
        <path d="M 22 40 A 34 34 0 0 1 78 40" fill="none" stroke="#c9a43e" stroke-width="4"/>
        <path d="M 18 58 A 36 36 0 0 0 82 58" fill="none" stroke="#c9a43e" stroke-width="4"/>
        <circle cx="50" cy="52" r="12" fill="#dcb64e" stroke="#c9a43e" stroke-width="3"/>`;
    case 'barrel':
      return `
        <circle cx="50" cy="52" r="36" fill="#8a5a30" stroke="#63401f" stroke-width="5"/>
        <circle cx="50" cy="52" r="25" fill="none" stroke="#63401f" stroke-width="4"/>
        <circle cx="50" cy="52" r="12" fill="#a06c3c" stroke="#63401f" stroke-width="3"/>
        <line x1="50" y1="16" x2="50" y2="88" stroke="#63401f" stroke-width="3"/>
        <line x1="14" y1="52" x2="86" y2="52" stroke="#63401f" stroke-width="3"/>`;
    case 'log':
      return `
        <rect x="8" y="30" width="84" height="18" rx="9" fill="#8a5a30" stroke="#63401f" stroke-width="4"/>
        <rect x="8" y="54" width="84" height="18" rx="9" fill="#9b6636" stroke="#63401f" stroke-width="4"/>
        <circle cx="16" cy="39" r="7" fill="#d9b877"/>
        <circle cx="16" cy="63" r="7" fill="#d9b877"/>
        <circle cx="84" cy="39" r="7" fill="#d9b877"/>
        <circle cx="84" cy="63" r="7" fill="#d9b877"/>`;
  }
}

/** Символ фигуры, не зависящий от цвета — для режима высокого контраста и миниатюр. */
export function kindBadge(kind: PieceDef['kind']): string {
  switch (kind) {
    case 'target':
      return '★';
    case 'car':
      return '●';
    case 'truck':
      return '■';
    case 'tractor':
      return '▲';
    case 'crate':
      return '◆';
  }
}

/** Ледяная колея (клетка поля, не отдельная фигура): замёрзшая лужа во дворе. */
export function iceArt(): string {
  return `
    <ellipse cx="50" cy="55" rx="42" ry="34" fill="#bfe6f0" opacity="0.55"/>
    <ellipse cx="50" cy="55" rx="42" ry="34" fill="none" stroke="#8fc7dc" stroke-width="4"/>
    <path d="M20 46 Q40 40 50 52 Q60 64 82 58" fill="none" stroke="#e8f7fb" stroke-width="4" stroke-linecap="round" opacity="0.85"/>
    <path d="M30 68 Q45 62 55 68 Q65 74 74 66" fill="none" stroke="#e8f7fb" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
    <circle cx="34" cy="48" r="3" fill="#f5fcfe" opacity="0.9"/>
    <circle cx="66" cy="62" r="2.4" fill="#f5fcfe" opacity="0.9"/>`;
}

export function starArt(): string {
  return `
    <circle cx="50" cy="52" r="30" fill="#fff3c9" opacity="0.7"/>
    <path d="M50 26 L57.6 42.4 L75.6 44.6 L62.3 57.1 L65.8 74.9 L50 66.2 L34.2 74.9 L37.7 57.1 L24.4 44.6 L42.4 42.4 Z"
      fill="#f6c445" stroke="#d9a520" stroke-width="4" stroke-linejoin="round"/>`;
}

/** Хрупкая доска (клетка поля): цела — дощатый настил, сломана — трещина и провал. */
export function plankArt(broken: boolean): string {
  if (broken) {
    return `
      <ellipse cx="50" cy="58" rx="40" ry="30" fill="#3d2c1e" opacity="0.55"/>
      <path d="M18 50 L38 62 L28 74 L50 68 L58 82 L70 60 L86 66" fill="none" stroke="#8f6a35" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M30 40 L46 50" stroke="#8f6a35" stroke-width="4" stroke-linecap="round"/>`;
  }
  return `
    <rect x="10" y="34" width="80" height="16" rx="4" fill="#c89b5a" stroke="#8f6a35" stroke-width="3"/>
    <rect x="10" y="54" width="80" height="16" rx="4" fill="#b9884a" stroke="#8f6a35" stroke-width="3"/>
    <line x1="14" y1="42" x2="86" y2="42" stroke="#8f6a35" stroke-width="2" opacity="0.6"/>
    <line x1="14" y1="62" x2="86" y2="62" stroke="#8f6a35" stroke-width="2" opacity="0.6"/>`;
}

/** Курица на поле (игровой объект, не декорация двора): полупрозрачная — «куда переместится». */
export function fieldChickenArt(ghost: boolean): string {
  return `<g class="field-chicken-art" opacity="${ghost ? 0.38 : 1}" transform="translate(50,58) scale(2.1)">${chickenArt()}</g>`;
}

export function chickenArt(): string {
  return `
    <ellipse cx="0" cy="14" rx="15" ry="4" fill="rgba(43,29,10,0.2)"/>
    <path d="M-14 4 Q-20 -8 -8 -8 L 2 -8 Q 14 -8 12 2 Q 10 12 -2 12 Q -12 12 -14 4 Z" fill="#fdf6e8" stroke="#d8c9a8" stroke-width="2"/>
    <circle cx="8" cy="-10" r="7" fill="#fdf6e8" stroke="#d8c9a8" stroke-width="2"/>
    <path d="M6 -17 Q8 -21 10 -17 Q12 -21 14 -16" fill="none" stroke="#d9534a" stroke-width="3" stroke-linecap="round"/>
    <path d="M14 -10 L21 -8 L14 -5 Z" fill="#e8a33d"/>
    <circle cx="9" cy="-11" r="1.6" fill="#3d2c1e"/>
    <line x1="-4" y1="12" x2="-4" y2="17" stroke="#e8a33d" stroke-width="2.5"/>
    <line x1="3" y1="12" x2="3" y2="17" stroke="#e8a33d" stroke-width="2.5"/>`;
}

/** Декоративный колодец — чисто атмосферный элемент двора. */
export function wellArt(): string {
  return `
    <ellipse cx="50" cy="80" rx="34" ry="8" fill="rgba(43,29,10,0.18)"/>
    <rect x="20" y="46" width="60" height="30" rx="6" fill="#b7a68c" stroke="#8f7a5a" stroke-width="4"/>
    <ellipse cx="50" cy="46" rx="30" ry="9" fill="#cbb996" stroke="#8f7a5a" stroke-width="4"/>
    <ellipse cx="50" cy="46" rx="19" ry="6" fill="#3d3428"/>
    <rect x="14" y="18" width="8" height="34" rx="3" fill="#7d5227"/>
    <rect x="78" y="18" width="8" height="34" rx="3" fill="#7d5227"/>
    <path d="M10 20 L50 2 L90 20" fill="none" stroke="#63401f" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="12" y="19" width="76" height="9" rx="4" fill="#8a5a30" stroke="#63401f" stroke-width="2"/>
    <line x1="50" y1="27" x2="50" y2="48" stroke="#5a4632" stroke-width="2.5"/>
    <rect x="44" y="46" width="12" height="10" rx="2" fill="#63401f"/>`;
}

export function catArt(): string {
  return `
    <path d="M-12 10 Q-14 -6 -4 -10 L-6 -16 L0 -12 L6 -16 L4 -10 Q14 -6 12 10 Z" fill="#5a5350" stroke="#403a37" stroke-width="2"/>
    <path class="cat-tail" d="M12 8 Q22 6 20 -4" fill="none" stroke="#5a5350" stroke-width="5" stroke-linecap="round"/>
    <circle cx="-4" cy="-4" r="1.6" fill="#f6c445"/>
    <circle cx="4" cy="-4" r="1.6" fill="#f6c445"/>`;
}
