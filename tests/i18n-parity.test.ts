import { describe, expect, it } from 'vitest';
import { DICTS } from '../src/game/i18n';

/**
 * Паритет словарей держался только на дисциплине: ключ, добавленный в ru,
 * но забытый в en/tr, показывал бы игроку сырой ключ или русский текст.
 * Общий тест закрывает это — все три языка обязаны иметь ровно одинаковый
 * набор ключей.
 */
describe('i18n: паритет словарей', () => {
  const langs = ['ru', 'en', 'tr'] as const;

  it('все языки имеют одинаковый набор ключей', () => {
    const [base, ...rest] = langs;
    const baseKeys = Object.keys(DICTS[base]).sort();
    for (const lang of rest) {
      const keys = Object.keys(DICTS[lang]).sort();
      expect(keys, `${lang}: не совпадает набор ключей с ${base}`).toEqual(baseKeys);
    }
  });

  it('пустых строк в словарях нет (кроме согласованно пустых во всех языках)', () => {
    // `elite.mod.none` пуст намеренно во всех трёх языках (отсутствие
    // модификатора испытания не подписывается). Опасны частичные пустоты —
    // строка, пустая только в одном языке.
    for (const [key, value] of Object.entries(DICTS.ru)) {
      if (value === '') {
        expect(
          langs.every((lang) => DICTS[lang][key] === ''),
          `${key}: пустой не во всех языках`
        ).toBe(true);
        continue;
      }
      expect(typeof value === 'string' && value.length > 0, `ru: пустое значение ${key}`).toBe(true);
    }
  });
});
