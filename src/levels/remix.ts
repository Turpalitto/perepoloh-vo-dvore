/**
 * Ремиксы — уровни кампании, преобразованные так, что старое решение перестаёт
 * работать, а сам двор остаётся узнаваемым.
 *
 * Зачем это, а не двадцать пять новых уровней: пост-кампанию видит небольшая
 * доля игроков, и рисовать под неё отдельную кампанию невыгодно. Но лига из
 * одних только знакомых раскладов читается как «пройди то же ещё раз», сколько
 * ограничений на неё ни навешивай. Преобразование даёт третий вариант: игрок
 * узнаёт двор и обнаруживает, что заученный маршрут больше не ведёт к выходу.
 *
 * Два класса преобразований, и разница между ними принципиальная:
 *
 * - `flip` — изоморфизм. Отражение поля вместе с фигурами, воротами, звездой и
 *   льдом сохраняет оптимум в точности: та же задача в другой системе
 *   координат. Ломается только узнавание маршрута, сложность не меняется.
 * - `ice` и `walls` — настоящее изменение задачи. Оптимум сдвигается, а может и
 *   вовсе исчезнуть решение. Поэтому ни одно такое число здесь не выводится
 *   формулой: `par` объявляется в данных, а тест сверяет его с решателем ровно
 *   так же, как для уровней кампании.
 *
 * Модуль остаётся чистым: на вход `LevelDef`, на выход `LevelDef`. Решатель тут
 * не вызывается — иначе он бы отработал на старте игры.
 */
import type { ChickenDef, IceDef, LevelDef, PieceDef, PlankDef, WallDef } from '../core/types';

/** Ось отражения: 'x' — левое-правое, 'y' — верх-низ. */
export type FlipAxis = 'x' | 'y';

export interface RemixSpec {
  /** Уровень-источник кампании. */
  source: number;
  /** Отражение поля; без него ремикс отличается только добавленным. */
  flip?: FlipAxis;
  /** Ледяные клетки поверх уровня — в координатах ПОСЛЕ отражения. */
  ice?: IceDef[];
  /** Препятствия поверх уровня — в координатах ПОСЛЕ отражения. */
  walls?: WallDef[];
  /**
   * Сдвиг стартовой позиции фигур (по id, ПОСЛЕ отражения).
   *
   * Самый дешёвый способ сломать заученное решение, не трогая состав двора:
   * машины те же, узор тот же, а порядок разъезда другой. Проверка на выход за
   * поле и наложения — на валидаторе, отдельного контроля здесь нет намеренно:
   * дублировать правила размещения значит однажды их разойти.
   */
  shift?: Array<{ piece: string; dx: number; dy: number }>;
  /** Хрупкие доски поверх уровня — в координатах ПОСЛЕ отражения. */
  planks?: PlankDef[];
  /** Куры поверх уровня — в координатах ПОСЛЕ отражения (обе клетки уже отражённые). */
  chickens?: ChickenDef[];
  /**
   * Переключает существующую кнопку ворот источника на held-режим (ворота
   * открыты, только пока кнопка физически занята). Применим только если у
   * источника уже есть `gateSwitch` — новую кнопку ремикс не добавляет.
   */
  holdType?: 'held';
  /** Название ремикса (русское; переводы — через тот же словарь имён уровней). */
  name: string;
  /**
   * Обучающая подсказка ремикса.
   *
   * Унаследованная от источника подсказка всегда выбрасывается: она описывает
   * исходный расклад и после преобразования врёт. Но у ремикса может быть своя
   * — и для новых механик движка (доски, куры, held-кнопка) она обязательна:
   * игрок встречает правило впервые, а в кампании его нигде не объясняли.
   */
  hint?: string;
  /** Оптимум решателя. Сверяется тестом, как `par` уровня кампании. */
  par: number;
  /** Порог двух звёзд. */
  par2: number;
}

/**
 * Категория сложности по оптимуму. Полосы взяты из самой кампании (easy ≤ 5,
 * medium 6–10, hard ≥ 11) — там они распределены именно так.
 *
 * Наследовать `difficulty` источника нельзя: добавленная бочка или ледяная
 * клетка сдвигает оптимум на несколько ходов, и унаследованное значение
 * начинает врать. Поле сейчас не читается игровым кодом, но данные, которые
 * врут, в этом проекте уже один раз обошлись дорого.
 */
function difficultyForPar(par: number): LevelDef['difficulty'] {
  if (par <= 5) return 'easy';
  return par <= 10 ? 'medium' : 'hard';
}

/** Клетки, занятые фигурой (ящик — одна). */
function extent(piece: PieceDef): { w: number; h: number } {
  if (piece.dir === 'h') return { w: piece.len, h: 1 };
  if (piece.dir === 'v') return { w: 1, h: piece.len };
  return { w: 1, h: 1 };
}

function flipPiece(piece: PieceDef, width: number, height: number, axis: FlipAxis): PieceDef {
  const { w, h } = extent(piece);
  return axis === 'x'
    ? { ...piece, x: width - piece.x - w }
    : { ...piece, y: height - piece.y - h };
}

function flipCell<T extends { x: number; y: number }>(cell: T, width: number, height: number, axis: FlipAxis): T {
  return axis === 'x' ? { ...cell, x: width - 1 - cell.x } : { ...cell, y: height - 1 - cell.y };
}

function flipExit(exit: LevelDef['exit'], width: number, height: number, axis: FlipAxis): LevelDef['exit'] {
  if (axis === 'x') {
    // index у левых/правых ворот — номер РЯДА, он при отражении по x не меняется;
    // у верхних/нижних это номер колонки, и его отразить нужно.
    if (exit.side === 'left') return { side: 'right', index: exit.index };
    if (exit.side === 'right') return { side: 'left', index: exit.index };
    return { ...exit, index: width - 1 - exit.index };
  }
  if (exit.side === 'top') return { side: 'bottom', index: exit.index };
  if (exit.side === 'bottom') return { side: 'top', index: exit.index };
  return { ...exit, index: height - 1 - exit.index };
}

/**
 * Собирает ремикс. `id` задаётся вызывающим кодом и намеренно лежит вне
 * диапазона кампании: по нему не должны считаться звёзды, главы и достижения.
 */
export function buildRemix(source: LevelDef, spec: RemixSpec, id: number): LevelDef {
  const { width, height } = source;
  const axis = spec.flip;
  const level: LevelDef = {
    ...source,
    id,
    name: spec.name,
    par: spec.par,
    par2: spec.par2,
    difficulty: difficultyForPar(spec.par),
    // Подсказка источника привязана к его раскладу и после преобразования
    // врёт — она отбрасывается всегда. Своя подсказка ремикса (spec.hint)
    // ставится явно: для новых механик она и есть единственное объяснение
    // правила, потому что в кампании их нет.
    hint: spec.hint,
    role: undefined,
    pieces: source.pieces.map((p) => (axis ? flipPiece(p, width, height, axis) : { ...p })),
    exit: axis ? flipExit(source.exit, width, height, axis) : { ...source.exit },
    walls: source.walls?.map((w) => (axis ? flipCell(w, width, height, axis) : { ...w })),
    star: source.star ? (axis ? flipCell(source.star, width, height, axis) : { ...source.star }) : undefined,
    gateSwitch: source.gateSwitch
      ? {
          ...(axis ? flipCell(source.gateSwitch, width, height, axis) : { ...source.gateSwitch }),
          ...(spec.holdType ? { holdType: spec.holdType } : {})
        }
      : undefined,
    ice: source.ice?.map((c) => (axis ? flipCell(c, width, height, axis) : { ...c })),
    mechanics: [...source.mechanics]
  };

  if (spec.shift?.length) {
    const byId = new Map(spec.shift.map((s) => [s.piece, s]));
    level.pieces = level.pieces.map((p) => {
      const s = byId.get(p.id);
      return s ? { ...p, x: p.x + s.dx, y: p.y + s.dy } : p;
    });
  }
  if (spec.walls?.length) level.walls = [...(level.walls ?? []), ...spec.walls.map((w) => ({ ...w }))];
  if (spec.ice?.length) {
    level.ice = [...(level.ice ?? []), ...spec.ice.map((c) => ({ ...c }))];
    if (!level.mechanics.includes('ice')) level.mechanics.push('ice');
  }
  if (spec.planks?.length) {
    level.planks = [...(level.planks ?? []), ...spec.planks.map((p) => ({ ...p }))];
    if (!level.mechanics.includes('plank')) level.mechanics.push('plank');
  }
  if (spec.chickens?.length) {
    level.chickens = [...(level.chickens ?? []), ...spec.chickens.map((c) => ({ a: { ...c.a }, b: { ...c.b } }))];
    if (!level.mechanics.includes('chickens')) level.mechanics.push('chickens');
  }
  if (spec.holdType && !level.mechanics.includes('gate-held')) level.mechanics.push('gate-held');
  if (!level.walls?.length) delete level.walls;
  if (!level.ice?.length) delete level.ice;
  return level;
}

/** Ремикс меняет задачу, а не только систему координат. */
export function remixChangesRules(spec: RemixSpec): boolean {
  return Boolean(
    spec.ice?.length || spec.walls?.length || spec.shift?.length || spec.planks?.length || spec.chickens?.length || spec.holdType
  );
}
