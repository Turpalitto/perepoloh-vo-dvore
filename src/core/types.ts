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
interface WallDef {
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

/** Нажимная кнопка во дворе: проезд любой фигуры разблокирует ворота до конца попытки. */
export interface GateSwitchDef {
  x: number;
  y: number;
}

/**
 * Ледяная колея: фигура не может произвольно остановиться на этой клетке —
 * только если дальше в том же направлении путь физически перекрыт. Меняет
 * тактику: нельзя перегородить дорогу где угодно, лёд «продавливает» ход дальше.
 */
export interface IceDef {
  x: number;
  y: number;
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
