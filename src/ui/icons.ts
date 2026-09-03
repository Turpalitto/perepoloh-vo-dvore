import bookOpenUrl from '@phosphor-icons/core/regular/book-open-user.svg';
import carUrl from '@phosphor-icons/core/regular/car-profile.svg';
import circleHalfUrl from '@phosphor-icons/core/regular/circle-half.svg';
import fireUrl from '@phosphor-icons/core/regular/fire.svg';
import gearUrl from '@phosphor-icons/core/regular/gear.svg';
import giftUrl from '@phosphor-icons/core/regular/gift.svg';
import globeUrl from '@phosphor-icons/core/regular/globe.svg';
import lightbulbUrl from '@phosphor-icons/core/regular/lightbulb.svg';
import medalUrl from '@phosphor-icons/core/regular/medal.svg';
import personUrl from '@phosphor-icons/core/regular/person-simple.svg';
import targetUrl from '@phosphor-icons/core/regular/target.svg';
import trophyUrl from '@phosphor-icons/core/regular/trophy.svg';

const ICONS = {
  book: bookOpenUrl,
  car: carUrl,
  contrast: circleHalfUrl,
  fire: fireUrl,
  gift: giftUrl,
  globe: globeUrl,
  lightbulb: lightbulbUrl,
  medal: medalUrl,
  person: personUrl,
  settings: gearUrl,
  target: targetUrl,
  trophy: trophyUrl
} as const;

export type IconName = keyof typeof ICONS;

/** Phosphor Icons are served as real image assets, not text glyphs or emoji. */
export function iconImg(name: IconName, className = 'ui-icon'): string {
  return `<img class="${className}" src="${ICONS[name]}" alt="" aria-hidden="true" draggable="false">`;
}
