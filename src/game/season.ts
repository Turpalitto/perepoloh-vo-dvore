/**
 * Сезонное оформление двора — чисто клиентское, без сервера и рассылок:
 * определяется календарной датой устройства (или ?season= для QA).
 * Даёт праздничный вид и небольшой бонус к ежедневному подарку, пока
 * событие активно; не создаёт нового контента и не требует бэкенда.
 */
import { queryParam } from '../query';

export type SeasonId = 'newyear';

export interface SeasonDef {
  id: SeasonId;
  /** Бонус к базовым 2 подсказкам ежедневного подарка на время события. */
  giftBonus: number;
}

const SEASONS: Record<SeasonId, SeasonDef> = {
  newyear: { id: 'newyear', giftBonus: 1 }
};

/** Новогодний период: 20 декабря — 10 января (переходит через год). */
function isNewYear(date: Date): boolean {
  const m = date.getMonth();
  const d = date.getDate();
  return (m === 11 && d >= 20) || (m === 0 && d <= 10);
}

export function currentSeason(date: Date = new Date()): SeasonDef | null {
  const override = queryParam('season');
  if (override === 'none') return null;
  if (override && override in SEASONS) return SEASONS[override as SeasonId];
  if (isNewYear(date)) return SEASONS.newyear;
  return null;
}

export function applySeason(date: Date = new Date()): SeasonDef | null {
  const season = currentSeason(date);
  document.documentElement.dataset.season = season?.id ?? '';
  return season;
}
