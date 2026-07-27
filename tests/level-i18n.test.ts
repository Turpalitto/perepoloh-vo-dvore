import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import levelsJson from '../src/levels/levels.json';
import type { LevelDef } from '../src/core/types';
import { levelText, setLang } from '../src/game/i18n';

const LEVELS = levelsJson as LevelDef[];

/**
 * Названия и подсказки уровней переводятся не по ключу, а по русскому тексту:
 * забытая строка не падает, а молча показывает русский текст в английском и
 * турецком интерфейсе. Тест закрывает именно этот тихий провал — он всплыл,
 * когда в кампанию начали добавлять уровни после релиза.
 */
describe('локализация текстов уровней', () => {
  // Юнит-тесты гоняются в node-окружении, а setLang проставляет lang документу.
  // Минимальная заглушка дешевле, чем поднимать DOM ради двух присваиваний.
  beforeAll(() => {
    if (typeof globalThis.document === 'undefined') {
      (globalThis as { document?: unknown }).document = { documentElement: { lang: 'ru' } };
    }
  });

  afterEach(() => setLang('ru'));

  for (const lang of ['en', 'tr'] as const) {
    it(`каждое название уровня переведено на ${lang}`, () => {
      setLang(lang);
      const missing = LEVELS.filter((level) => levelText('name', level.name) === level.name).map(
        (level) => `${level.id}: ${level.name}`
      );
      expect(missing).toEqual([]);
    });

    it(`каждая подсказка уровня переведена на ${lang}`, () => {
      setLang(lang);
      const missing = LEVELS.filter(
        (level) => level.hint !== undefined && levelText('hint', level.hint) === level.hint
      ).map((level) => `${level.id}: ${level.hint}`);
      expect(missing).toEqual([]);
    });
  }
});
