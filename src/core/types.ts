/** Ось движения техники; ящики ('any') двигаются по обеим осям. */
export type Dir = 'h' | 'v' | 'any';
type Side = 'left' | 'right' | 'top' | 'bottom';

export type PieceKind = 'target' | 'car' | 'truck' | 'tractor' | 'crate';

export interface PieceDef {
  id: string;
  kind: PieceKind;
  /** Клетка-начало (левая/верхняя). */
  x: number;
  y: number;
  /** Занимаемых клеток вдоль оси. Ящик — всегда 1. */
  len: number;
  dir: Dir;
  /** Только для ящиков: сколько раз всего его можно подвинуть. */
  maxMoves?: number;
  /** Вариант раскраски для рендера. */
  skin?: number;
}

export type WallKind = 'hay' | 'barrel' | 'log';
export interface WallDef {
  x: number;
  y: number;
  kind: WallKind;
}

/** Ворота: сторона поля + номер ряда (left/right) или колонки (top/bottom). */
export interface ExitDef {
  side: Side;
  index: number;
}

interface StarDef {
  x: number;
  y: number;
}

/**
 * Нажимная кнопка во дворе.
 * `holdType: 'once'` (по умолчанию) — прежнее поведение: проезд любой фигуры
 * навсегда разблокирует ворота до конца попытки.
 * `holdType: 'held'` — ворота открыты, только пока клетка кнопки физически
 * занята какой-либо фигурой; уехала — ворота закрылись, даже если целевая
 * машина ещё не успела выехать.
 */
export interface GateSwitchDef {
  x: number;
  y: number;
  holdType?: 'once' | 'held';
}

/**
 * Ледяная колея: фигура не может остановиться на этой клетке — ни по своей
 * воле, ни упершись в препятствие. Проехать насквозь можно, встать нельзя.
 * Меняет тактику: перегородить дорогу можно не где угодно, и часть полос
 * перестаёт годиться для парковки блокиратора.
 */
export interface IceDef {
  x: number;
  y: number;
}

/**
 * Хрупкая доска: как лёд, на ней нельзя останавливаться. Отличие — доска
 * помнит проезд: любая фигура, прометнувшая клетку за ход, ломает её
 * навсегда (`GameState.brokenPlanks`), и с этого момента клетка становится
 * стеной. Проезд один раз, дальше — не проехать вообще.
 *
 * ЗАРЕЗЕРВИРОВАНО: механика полностью реализована в core (game.ts,
 * plank-impact.ts, verify-planks.ts) и покрыта тестами, но пока ни один
 * уровень кампании/лиги её не использует. Удалять не стали: «не ломать
 * доказуемую проходимость» важнее экономии строк, а дизайн-идея капстоуна
 * «проезд один раз» остаётся сильной. Уровни с досками — кандидат на
 * будущую главу; до тех пор код живёт как отключённая механика.
 */
export interface PlankDef {
  x: number;
  y: number;
}

/**
 * Курица во дворе: две фиксированные клетки A/B, между которыми она
 * детерминированно переключается после КАЖДОГО хода игрока — независимо от
 * того, какая фигура ходила. Текущая клетка блокирует проезд, как стена.
 * Никакой случайности; для нескольких кур циклы независимы.
 */
export interface ChickenDef {
  a: { x: number; y: number };
  b: { x: number; y: number };
}

type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Роль уровня в кривой сложности кампании. Обычные уровни роль не задают —
 * им запрещено быть легче предыдущего. Помеченные роли — единственное
 * исключение, разрешённое тестом `levels.test.ts`:
 * `tutorial` — знакомство с новой механикой (осознанно проще соседей),
 * `breather` — передышка после тяжёлого кластера.
 */
export type LevelRole = 'tutorial' | 'breather';

export interface LevelDef {
  id: number;
  name: string;
  width: number;
  height: number;
  exit: ExitDef;
  pieces: PieceDef[];
  walls?: WallDef[];
  star?: StarDef;
  gateSwitch?: GateSwitchDef;
  ice?: IceDef[];
  planks?: PlankDef[];
  chickens?: ChickenDef[];
  /** Оптимум решателя (проверяется тестом). */
  par: number;
  /** Порог двух звёзд: ходов <= par2. */
  par2: number;
  difficulty: Difficulty;
  /** Роль в кривой сложности; задаётся только уровням, которым разрешено быть легче предыдущего. */
  role?: LevelRole;
  mechanics: string[];
  /** Однострочная подсказка-обучение (показывается в начале уровня). */
  hint?: string;
}
