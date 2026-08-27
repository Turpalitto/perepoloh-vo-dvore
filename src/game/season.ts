/**
 * Сезонное оформление двора — чисто клиентское, без сервера и рассылок:
 * определяется календарной датой устройства (или ?season= для QA).
 * Даёт праздничный вид и небольшой бонус к ежедневному подарку, пока
 * событие активно; не создаёт нового контента и не требует бэкенда.
 */
import { queryParam } from '../query';

export type SeasonId = 'newyear' | 'spring' | 'harvest';

export interface SeasonDef {
  id: SeasonId;
  /** Бонус к базовым 2 подсказкам ежедневного подарка на время события. */
  giftBonus: number;
}

const SEASONS: Record<SeasonId, SeasonDef> = {
  newyear: { id: 'newyear', giftBonus: 1 },
  spring: { id: 'spring', giftBonus: 1 },
  harvest: { id: 'harvest', giftBonus: 1 }
};

/** Новогодний период: 20 декабря — 10 января (переходит через год). */
function isNewYear(date: Date): boolean {
  const m = date.getMonth();
  const d = date.getDate();
  return (m === 11 && d >= 20) || (m === 0 && d <= 10);
}

/** Весна: 1–10 мая — лепестки яблонь по двору. */
function isSpring(date: Date): boolean {
  return date.getMonth() === 4 && date.getDate() <= 10;
}

/** Урожай: 1–15 сентября — золотые листья. */
function isHarvest(date: Date): boolean {
  return date.getMonth() === 8 && date.getDate() <= 15;
}

export function currentSeason(date: Date = new Date()): SeasonDef | null {
  const override = queryParam('season');
  if (override === 'none') return null;
  if (override && override in SEASONS) return SEASONS[override as SeasonId];
  if (isNewYear(date)) return SEASONS.newyear;
  if (isSpring(date)) return SEASONS.spring;
  if (isHarvest(date)) return SEASONS.harvest;
  return null;
}

export function applySeason(date: Date = new Date()): SeasonDef | null {
  const season = currentSeason(date);
  document.documentElement.dataset.season = season?.id ?? '';
  return season;
}
