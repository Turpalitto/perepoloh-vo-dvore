/**
 * Метаданные кампании: единственный источник правды о её составе.
 *
 * Раньше эти сведения были рассыпаны константами: «последний уровень — id 100»,
 * «глава — это 12 подряд», «звёзд всего 300». Кампания перестала быть
 * фиксированной (уровни вставляются в середину и получают id вне исходного
 * диапазона), и каждая такая константа — отдельный тихий баг: она продолжает
 * работать ровно до следующей вставки.
 *
 * Правило то же, что и в остальном коде кампании: считать по позиции в массиве,
 * а не по id. Id — ключ сейва и ссылок (боссы, мастер-испытания), он намеренно
 * не совпадает с видимым номером уровня.
 */
import levelsJson from '../levels/levels.json';
import type { LevelDef } from '../core/types';

export const LEVELS = levelsJson as LevelDef[];

/** Финал кампании — последний по порядку, а не «тот, у которого id 100». */
export const CAMPAIGN_LAST_ID = LEVELS[LEVELS.length - 1].id;

/** Потолок счётчика звёзд: три за уровень. */
export const CAMPAIGN_MAX_STARS = LEVELS.length * 3;

/** Id уровней кампании — для отсева чужих ключей сейва (daily, старые уровни). */
export const CAMPAIGN_LEVEL_IDS: ReadonlySet<number> = new Set(LEVELS.map((level) => level.id));

/**
 * Длина главы в позициях. Держится числом, а не набором явных границ, потому
 * что деление ровное и правит его только вставка контента; важно лишь, чтобы
 * оно было записано один раз. Число глав обязано укладываться в переводы
 * `chapter.N` — это проверяет `levels.test.ts`.
 */
export const CHAPTER_SIZE = 12;

/** Сколько глав в кампании сейчас (последняя может быть неполной). */
export function chapterCount(levels: LevelDef[] = LEVELS): number {
  return Math.ceil(levels.length / CHAPTER_SIZE);
}

/** Номер главы (с единицы) для позиции в кампании (тоже с единицы). */
export function chapterOfPosition(position: number): number {
  return Math.ceil(position / CHAPTER_SIZE);
}

/** Уровни главы по её номеру (с единицы). */
export function chapterLevels(chapter: number, levels: LevelDef[] = LEVELS): LevelDef[] {
  return levels.slice((chapter - 1) * CHAPTER_SIZE, chapter * CHAPTER_SIZE);
}

/** Позиция закрывает главу — момент «Глава N завершена». */
export function isChapterEnd(position: number, levels: LevelDef[] = LEVELS): boolean {
  return position > 0 && (position % CHAPTER_SIZE === 0 || position === levels.length);
}

/** Позиция открывает главу (кроме самой первой — там своё приветствие). */
export function isChapterStart(position: number): boolean {
  return position > 1 && (position - 1) % CHAPTER_SIZE === 0;
}

/** Сумма звёзд по уровням кампании: чужие ключи сейва не считаются. */
export function campaignStars(stars: Record<string, number>): number {
  let sum = 0;
  for (const [id, value] of Object.entries(stars)) {
    if (CAMPAIGN_LEVEL_IDS.has(Number(id))) sum += value;
  }
  return sum;
}

/** Число пройденных уровней кампании (звёзд больше нуля). */
export function campaignCleared(stars: Record<string, number>): number {
  let count = 0;
  for (const [id, value] of Object.entries(stars)) {
    if (value > 0 && CAMPAIGN_LEVEL_IDS.has(Number(id))) count++;
  }
  return count;
}
