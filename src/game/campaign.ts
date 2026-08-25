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
import { BOSSES } from './boss';
import type { LevelDef } from '../core/types';

export const LEVELS = levelsJson as LevelDef[];

/**
 * Сюжетный финал кампании — последний босс (слот 100), а не последний уровень
 * массива: бонусные блоки (глава 10 «Всё сразу») лежат после финала, и сцена
 * завершения с Высшей лигой обязана открываться именно боссом. Раньше финалом
 * считался последний элемент массива — это совпадало с боссом 100, пока после
 * него не появилась глава 10.
 */
export const CAMPAIGN_LAST_ID = Math.max(...BOSSES.map((boss) => boss.id));

/** Потолок счётчика звёзд: три за уровень. */
export const CAMPAIGN_MAX_STARS = LEVELS.length * 3;

/** Id уровней кампании — для отсева чужих ключей сейва (daily, старые уровни). */
export const CAMPAIGN_LEVEL_IDS: ReadonlySet<number> = new Set(LEVELS.map((level) => level.id));

/**
 * Структура глав — данные, а не правило «каждые 12 подряд».
 *
 * Раньше деление жило числом в трёх местах UI. Пока кампания росла ровными
 * блоками, это работало; но контент вставляется в середину, и однажды поделить
 * его поровну станет нельзя — обучающая мини-глава или финальный блок окажутся
 * длиной не 12. Явная таблица позволяет задать такую главу, не трогая код: она
 * же остаётся единственным местом, где номер главы превращается в позиции.
 *
 * Обучающие мини-главы намеренно НЕ выделены в отдельные главы, а растворены
 * в соседних: ледяная четвёрка стоит внутри главы 4 (позиции 42–45), куриная —
 * внутри главы 6 (68–71), про held-кнопку — внутри главы 8 (94–97). Оттого эти
 * главы длиннее прочих. Отделение оставило бы вокруг обрубки в 5 и 7 уровней.
 * Это правится одной строкой здесь, когда для соседних блоков появятся тексты.
 *
 * Глава 10 «Всё сразу» (позиции 117–128) — финальный блок после финального
 * босса главы 9: лёд, куры и held-кнопка встречаются в ней поодиночке, попарно
 * и все вместе сразу (финал 128 — капстоун трёх механик). Уровни собраны из
 * мутаций двора босса id 100 скриптом `scripts/generate-chapter10.ts` (пары
 * механик + ручная досборка финала), значимость каждой проверена решателем.
 *
 * Инварианты (`levels.test.ts`): сумма размеров равна числу уровней, и у каждой
 * главы есть перевод `chapter.N` во всех языках.
 */
const CHAPTER_SIZES: number[] = [12, 12, 12, 12, 12, 16, 12, 16, 12, 12];

/** Границы глав в позициях (с единицы), включительно. */
export const CHAPTERS: ReadonlyArray<{ index: number; from: number; to: number; size: number }> =
  CHAPTER_SIZES.map((size, i) => {
    const from = CHAPTER_SIZES.slice(0, i).reduce((sum, n) => sum + n, 1);
    return { index: i + 1, from, to: from + size - 1, size };
  });

/** Сумма размеров глав: обязана совпадать с длиной кампании. */
export const CHAPTERS_TOTAL = CHAPTER_SIZES.reduce((sum, n) => sum + n, 0);

/** Сколько глав в кампании. */
export function chapterCount(): number {
  return CHAPTERS.length;
}

/** Номер главы (с единицы) для позиции в кампании (тоже с единицы). */
export function chapterOfPosition(position: number): number {
  const chapter = CHAPTERS.find((c) => position >= c.from && position <= c.to);
  // Уровень за пределами таблицы — уже дефект данных, но UI не должен падать:
  // относим его к последней главе, а несоответствие ловит тест.
  return chapter?.index ?? CHAPTERS.length;
}

/** Уровни главы по её номеру (с единицы). */
export function chapterLevels(chapter: number, levels: LevelDef[] = LEVELS): LevelDef[] {
  const bounds = CHAPTERS[chapter - 1];
  return bounds ? levels.slice(bounds.from - 1, bounds.to) : [];
}

/** Позиция закрывает главу — момент «Глава N завершена». */
export function isChapterEnd(position: number, levels: LevelDef[] = LEVELS): boolean {
  if (position <= 0) return false;
  return position === levels.length || CHAPTERS.some((c) => c.to === position);
}

/** Позиция открывает главу (первая тоже — с неё начинается заголовок списка). */
export function isChapterStart(position: number): boolean {
  return CHAPTERS.some((c) => c.from === position);
}

/** Позиция уровня в кампании (с единицы); 0 — уровня нет в данных. */
export function campaignPositionOf(id: number): number {
  return POSITION_BY_ID.get(id) ?? 0;
}

const POSITION_BY_ID = new Map(LEVELS.map((level, index) => [level.id, index + 1]));

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
