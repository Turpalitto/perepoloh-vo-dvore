/**
 * Id уровней кампании для сидов сейва в браузерных тестах.
 *
 * Раньше сиды строили диапазон 1..100. Уровни, вставленные в середину кампании
 * после релиза, получают свободные id (101+), поэтому диапазон перестал совпадать
 * с реальным составом: «пройдена вся кампания» переставало быть правдой, а сейв
 * содержал звёзды несуществующих уровней. Берём id прямо из данных.
 *
 * Читаем файл, а не `import ... from '*.json'`: ESM-загрузчик Playwright требует
 * для JSON import attribute, которого не понимает остальная сборка.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BOSSES } from '../src/game/boss';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const levels = JSON.parse(readFileSync(join(repoRoot, 'src/levels/levels.json'), 'utf8')) as Array<{ id: number }>;

export const CAMPAIGN_LEVEL_IDS: number[] = levels.map((level) => level.id);

/**
 * Сюжетный финал кампании — слот финального босса. Не последний элемент
 * массива: бонусные уровни (глава 10) лежат после босса 100, и сиды
 * post-campaign тестов должны приводить именно к боссу, а не к уровню 128.
 * Источник тот же, что у игры, — `BOSSES` из src/game/boss.ts.
 */
export const LAST_CAMPAIGN_LEVEL_ID = Math.max(...BOSSES.map((boss) => boss.id));

/** Потолок счётчика звёзд в меню: три звезды за уровень. */
export const CAMPAIGN_MAX_STARS = CAMPAIGN_LEVEL_IDS.length * 3;
