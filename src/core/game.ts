import type { ExitDef, LevelDef, PieceDef } from './types';

export interface PieceState {
  x: number;
  y: number;
  /** Потрачено перемещений (важно для ящиков с maxMoves). */
  used: number;
  /** Целевая машина покинула поле. */
  gone: boolean;
}

export interface GameState {
  pieces: PieceState[];
  moves: number;
  starCollected: boolean;
  /** Ворота разблокированы нажимной кнопкой; на обычных уровнях true с начала. */
  gateUnlocked: boolean;
  won: boolean;
}

export interface MoveResult {
  state: GameState;
  /** Звезда собрана именно этим ходом. */
  starCollected: boolean;
  /** Целевая машина выехала этим ходом. */
  exited: boolean;
  /** Нажимная кнопка ворот впервые сработала этим ходом. */
  gateActivated: boolean;
}

export const EMPTY = -1;
export const WALL = -2;

export function createState(level: LevelDef): GameState {
  return {
    pieces: level.pieces.map((p) => ({ x: p.x, y: p.y, used: 0, gone: false })),
    moves: 0,
    starCollected: false,
    gateUnlocked: level.gateSwitch === undefined,
    won: false
  };
}

export function cloneState(s: GameState): GameState {
  return {
    pieces: s.pieces.map((p) => ({ ...p })),
    moves: s.moves,
    starCollected: s.starCollected,
    gateUnlocked: s.gateUnlocked,
    won: s.won
  };
}

export function targetIndex(level: LevelDef): number {
  return level.pieces.findIndex((p) => p.kind === 'target');
}

/** Клетки, занимаемые фигурой в данной позиции (пустой список, если выехала). */
export function pieceCells(def: PieceDef, ps: Pick<PieceState, 'x' | 'y' | 'gone'>): { x: number; y: number }[] {
  if (ps.gone) return [];
  const dx = def.dir === 'h' ? 1 : 0;
  const dy = def.dir === 'v' ? 1 : 0;
  const cells: { x: number; y: number }[] = [];
  for (let i = 0; i < def.len; i++) cells.push({ x: ps.x + dx * i, y: ps.y + dy * i });
  return cells;
}

/** Сетка занятости: EMPTY, WALL или индекс фигуры. Клетки вне поля игнорируются. */
export function buildGrid(level: LevelDef, s: GameState): number[][] {
  const g: number[][] = Array.from({ length: level.height }, () => Array<number>(level.width).fill(EMPTY));
  for (const w of level.walls ?? []) {
    if (w.y >= 0 && w.y < level.height && w.x >= 0 && w.x < level.width) g[w.y][w.x] = WALL;
  }
  level.pieces.forEach((def, i) => {
    for (const c of pieceCells(def, s.pieces[i])) {
      if (c.y >= 0 && c.y < level.height && c.x >= 0 && c.x < level.width) g[c.y][c.x] = i;
    }
  });
  return g;
}

export function exitVector(exit: ExitDef): { dx: number; dy: number } {
  switch (exit.side) {
    case 'right':
      return { dx: 1, dy: 0 };
    case 'left':
      return { dx: -1, dy: 0 };
    case 'bottom':
      return { dx: 0, dy: 1 };
    case 'top':
      return { dx: 0, dy: -1 };
  }
}

export function allowedDirs(def: PieceDef): { dx: number; dy: number }[] {
  if (def.dir === 'h') return [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }];
  if (def.dir === 'v') return [{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
  return [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 }
  ];
}

/** Движется ли фигура в сторону ворот по их ряду/колонке (только целевая). */
function isExitLane(level: LevelDef, i: number, s: GameState, dx: number, dy: number): boolean {
  const def = level.pieces[i];
  if (def.kind !== 'target') return false;
  if (level.gateSwitch && !s.gateUnlocked) return false;
  const v = exitVector(level.exit);
  if (dx !== v.dx || dy !== v.dy) return false;
  if (v.dy === 0) return def.dir === 'h' && s.pieces[i].y === level.exit.index;
  return def.dir === 'v' && s.pieces[i].x === level.exit.index;
}

function leadCell(def: PieceDef, ps: PieceState, dx: number, dy: number): { x: number; y: number } {
  const lx = ps.x + (def.dir === 'h' && dx > 0 ? def.len - 1 : 0);
  const ly = ps.y + (def.dir === 'v' && dy > 0 ? def.len - 1 : 0);
  return { x: lx, y: ly };
}

/**
 * Максимум клеток, на которые фигура i может проскользить в направлении (dx,dy).
 * Для целевой машины на линии ворот включает полный выезд за край
 * (возвращённое число шагов ставит машину целиком за полем).
 */
export function maxSteps(
  level: LevelDef,
  s: GameState,
  i: number,
  dx: number,
  dy: number,
  grid: number[][] = buildGrid(level, s)
): number {
  const def = level.pieces[i];
  const ps = s.pieces[i];
  if (ps.gone || s.won) return 0;
  if (!allowedDirs(def).some((d) => d.dx === dx && d.dy === dy)) return 0;
  if (def.kind === 'crate' && def.maxMoves !== undefined && ps.used >= def.maxMoves) return 0;
  const lead = leadCell(def, ps, dx, dy);
  let k = 0;
  for (;;) {
    const cx = lead.x + (k + 1) * dx;
    const cy = lead.y + (k + 1) * dy;
    const inside = cx >= 0 && cx < level.width && cy >= 0 && cy < level.height;
    if (!inside) {
      if (isExitLane(level, i, s, dx, dy)) k += def.len; // полный выезд
      break;
    }
    if (grid[cy][cx] !== EMPTY) break;
    k++;
  }
  return k;
}

/**
 * Шаги до полного выезда целевой машины, если путь до ворот свободен, иначе -1.
 * (Используется и как признак «ворота можно распахнуть».)
 */
export function exitSteps(level: LevelDef, s: GameState): number {
  const t = targetIndex(level);
  if (t < 0) return -1;
  const v = exitVector(level.exit);
  const k = maxSteps(level, s, t, v.dx, v.dy);
  if (k <= 0) return -1;
  const def = level.pieces[t];
  const ps = s.pieces[t];
  const after = { x: ps.x + v.dx * k, y: ps.y + v.dy * k, gone: false };
  const anyInside = pieceCells(def, after).some(
    (c) => c.x >= 0 && c.x < level.width && c.y >= 0 && c.y < level.height
  );
  return anyInside ? -1 : k;
}

/**
 * Применяет ход (скольжение фигуры i на steps клеток в (dx,dy)).
 * Возвращает null, если ход недопустим (в т.ч. частичный выезд за край).
 * Не мутирует исходное состояние.
 */
export function applyMove(
  level: LevelDef,
  s: GameState,
  i: number,
  dx: number,
  dy: number,
  steps: number
): MoveResult | null {
  if (s.won || steps <= 0) return null;
  const limit = maxSteps(level, s, i, dx, dy);
  if (steps > limit) return null;
  const def = level.pieces[i];
  // Ледяная колея: на льду нельзя остановиться вовсе — ни по своей воле, ни
  // вынужденно. Проехать насквозь можно, встать — нет.
  //
  // Прежняя редакция разрешала вынужденную остановку (steps === limit), и это
  // делало механику пустой: вариант «доехать до упора» оставался доступен
  // всегда, а короткие решения почти всегда им и пользуются. Перебор всех
  // одиночных постановок льда по уровням кампании давал дельту оптимума ноль
  // в 111 случаях из 111 — лёд не создавал ни одной новой задачи. Запрет
  // остановки без исключений отнимает у полосы конкретные позиции покоя и
  // возвращает механике вес.
  if (level.ice?.length) {
    const ps0 = s.pieces[i];
    const landed = pieceCells(def, { x: ps0.x + dx * steps, y: ps0.y + dy * steps, gone: false });
    if (landed.some((c) => level.ice!.some((ice) => ice.x === c.x && ice.y === c.y))) return null;
  }
  const ns = cloneState(s);
  const ps = ns.pieces[i];

  // Сбор звезды: любая клетка, «прометённая» фигурой за время скольжения.
  let starHit = false;
  const star = level.star;
  if (star && !ns.starCollected) {
    for (let t = 0; t <= steps && !starHit; t++) {
      starHit = pieceCells(def, { x: ps.x + dx * t, y: ps.y + dy * t, gone: false }).some(
        (c) => c.x === star.x && c.y === star.y
      );
    }
  }

  let gateActivated = false;
  const gateSwitch = level.gateSwitch;
  if (gateSwitch && !ns.gateUnlocked) {
    for (let t = 0; t <= steps && !gateActivated; t++) {
      gateActivated = pieceCells(def, { x: ps.x + dx * t, y: ps.y + dy * t, gone: false }).some(
        (c) => c.x === gateSwitch.x && c.y === gateSwitch.y
      );
    }
  }

  ps.x += dx * steps;
  ps.y += dy * steps;
  if (def.kind === 'crate') ps.used++;

  let exited = false;
  if (def.kind === 'target') {
    const cells = pieceCells(def, { ...ps, gone: false });
    const inside = cells.filter((c) => c.x >= 0 && c.x < level.width && c.y >= 0 && c.y < level.height);
    if (inside.length === 0) {
      ps.gone = true;
      exited = true;
      ns.won = true;
    } else if (inside.length < cells.length) {
      return null; // частичный выезд не является допустимой позицией
    }
  }

  ns.moves++;
  if (starHit) ns.starCollected = true;
  if (gateActivated) ns.gateUnlocked = true;
  return { state: ns, starCollected: starHit, exited, gateActivated };
}

/** Подсчёт звёзд за результат уровня. */
export function starsFor(level: LevelDef, moves: number, starCollected: boolean): number {
  let stars = 1;
  if (moves <= level.par2) {
    stars = 2;
    if (level.star ? starCollected : moves <= level.par) stars = 3;
  }
  return stars;
}
