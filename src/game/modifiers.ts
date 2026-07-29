/**
 * Семантика модификаторов правил — единственное место, где решается, что именно
 * модификатор отключает.
 *
 * Модификаторы приходят из двух источников (ежедневный уровень и мастер-испытания
 * лиги), а проверки на них были разбросаны по UI строковыми сравнениями вида
 * `modifier === 'noUndo'`. Пока модификаторы были одиночными, это работало;
 * комбинированный `noUndoNoHints` ломает каждое такое сравнение по отдельности,
 * причём молча — кнопка просто остаётся на экране.
 */

/** Объединение всех модификаторов: `DailyModifier` ∪ `EliteModifier`. */
export type RuleModifier = 'none' | 'noUndo' | 'noHints' | 'tightCrates' | 'noUndoNoHints';

/** Модификатор запрещает отмену хода (кнопки undo/redo скрыты). */
export function blocksUndo(modifier: RuleModifier): boolean {
  return modifier === 'noUndo' || modifier === 'noUndoNoHints';
}

/** Модификатор запрещает подсказку (кнопка скрыта). */
export function blocksHints(modifier: RuleModifier): boolean {
  return modifier === 'noHints' || modifier === 'noUndoNoHints';
}
