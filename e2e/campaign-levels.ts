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

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const levels = JSON.parse(readFileSync(join(repoRoot, 'src/levels/levels.json'), 'utf8')) as Array<{ id: number }>;

export const CAMPAIGN_LEVEL_IDS: number[] = levels.map((level) => level.id);

/** Последний уровень кампании — финал, он же слот финального босса. */
export const LAST_CAMPAIGN_LEVEL_ID = CAMPAIGN_LEVEL_IDS[CAMPAIGN_LEVEL_IDS.length - 1];
