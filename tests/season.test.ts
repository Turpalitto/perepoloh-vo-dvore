import { afterEach, describe, expect, it } from 'vitest';
import { currentSeason } from '../src/game/season';

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'location');
});

function withSearch(search: string): void {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { search }
  });
}

describe('сезонные события', () => {
  it('новогодний период: 20 декабря — 10 января', () => {
    withSearch('');
    expect(currentSeason(new Date('2026-12-19T12:00:00'))).toBeNull();
    expect(currentSeason(new Date('2026-12-20T12:00:00'))?.id).toBe('newyear');
    expect(currentSeason(new Date('2026-12-31T12:00:00'))?.id).toBe('newyear');
    expect(currentSeason(new Date('2027-01-10T12:00:00'))?.id).toBe('newyear');
    expect(currentSeason(new Date('2027-01-11T12:00:00'))).toBeNull();
  });

  it('вне события — без сезона', () => {
    withSearch('');
    expect(currentSeason(new Date('2026-07-20T12:00:00'))).toBeNull();
  });

  it('?season= переопределяет для QA', () => {
    withSearch('?season=newyear');
    expect(currentSeason(new Date('2026-07-20T12:00:00'))?.id).toBe('newyear');
    withSearch('?season=none');
    expect(currentSeason(new Date('2026-12-25T12:00:00'))).toBeNull();
  });
});
