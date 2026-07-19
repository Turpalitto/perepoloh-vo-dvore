/** Ось движения техники; ящики ('any') двигаются по обеим осям. */
export type Dir = 'h' | 'v' | 'any';
export type Side = 'left' | 'right' | 'top' | 'bottom';

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

export interface StarDef {
  x: number;
  y: number;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface LevelDef {
  id: number;
  name: string;
  width: number;
  height: number;
  exit: ExitDef;
  pieces: PieceDef[];
  walls?: WallDef[];
  star?: StarDef;
  /** Оптимум решателя (проверяется тестом). */
  par: number;
  /** Порог двух звёзд: ходов <= par2. */
  par2: number;
  difficulty: Difficulty;
  mechanics: string[];
  /** Однострочная подсказка-обучение (показывается в начале уровня). */
  hint?: string;
}
