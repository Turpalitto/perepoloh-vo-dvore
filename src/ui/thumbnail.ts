/**
 * Компактная схема уровня для карточки в списке — не полноценный рендер
 * (без градиентов и деталей), только форма и цвет фигур, чтобы уровень
 * узнавался с первого взгляда.
 */
import type { LevelDef } from '../core/types';
import { kindBadge } from './sprites';

const KIND_FILL: Record<string, string> = {
  target: '#f6c445',
  car: '#45968f',
  truck: '#a9754a',
  tractor: '#d05c50',
  crate: '#c89b5a'
};

export function levelThumbnail(level: LevelDef): string {
  const CELL = 10;
  const W = level.width * CELL;
  const H = level.height * CELL;
  let pieces = '';
  for (const p of level.pieces) {
    const w = p.dir === 'h' ? p.len * CELL : CELL;
    const h = p.dir === 'v' ? p.len * CELL : CELL;
    const x = p.x * CELL;
    const y = p.y * CELL;
    const fill = KIND_FILL[p.kind] ?? '#999';
    pieces += `<rect x="${x + 0.6}" y="${y + 0.6}" width="${w - 1.2}" height="${h - 1.2}" rx="2" fill="${fill}"/>`;
    if (p.kind === 'target') {
      pieces += `<text x="${x + w / 2}" y="${y + h / 2 + 2.6}" text-anchor="middle" font-size="7" fill="#7a4f10">${kindBadge('target')}</text>`;
    }
  }
  let extras = '';
  for (const w of level.walls ?? []) {
    extras += `<circle cx="${w.x * CELL + CELL / 2}" cy="${w.y * CELL + CELL / 2}" r="${CELL * 0.28}" fill="#8a5a30"/>`;
  }
  if (level.star) {
    extras += `<circle cx="${level.star.x * CELL + CELL / 2}" cy="${level.star.y * CELL + CELL / 2}" r="${CELL * 0.3}" fill="#fff3c9" stroke="#d9a520" stroke-width="1"/>`;
  }
  if (level.gateSwitch) {
    extras += `<circle cx="${level.gateSwitch.x * CELL + CELL / 2}" cy="${level.gateSwitch.y * CELL + CELL / 2}" r="${CELL * 0.28}" fill="#e2574c"/>`;
  }
  const exit = level.exit;
  let exitMark = '';
  if (exit.side === 'right') exitMark = `<rect x="${W - 1}" y="${exit.index * CELL + 1}" width="3" height="${CELL - 2}" fill="#fff1c9"/>`;
  else if (exit.side === 'left') exitMark = `<rect x="-2" y="${exit.index * CELL + 1}" width="3" height="${CELL - 2}" fill="#fff1c9"/>`;
  else if (exit.side === 'bottom') exitMark = `<rect x="${exit.index * CELL + 1}" y="${H - 1}" width="${CELL - 2}" height="3" fill="#fff1c9"/>`;
  else exitMark = `<rect x="${exit.index * CELL + 1}" y="-2" width="${CELL - 2}" height="3" fill="#fff1c9"/>`;

  return `<svg class="level-thumb" viewBox="-3 -3 ${W + 6} ${H + 6}" aria-hidden="true">
    <rect x="-3" y="-3" width="${W + 6}" height="${H + 6}" rx="6" fill="#dbb271"/>
    <rect x="0" y="0" width="${W}" height="${H}" fill="#c9a45e" opacity="0.35"/>
    ${exitMark}
    ${extras}
    ${pieces}
  </svg>`;
}
