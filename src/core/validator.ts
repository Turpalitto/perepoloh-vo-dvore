import type { LevelDef, PieceDef } from './types';
import { createState, exitVector, pieceCells } from './game';
import { solve } from './solver';

const KINDS = new Set(['target', 'car', 'truck', 'tractor', 'crate']);
const LEN_BY_KIND: Record<string, number[]> = {
  target: [2],
  car: [2],
  truck: [3],
  tractor: [3],
  crate: [1]
};

/**
 * Проверяет уровень; возвращает список ошибок (пустой = уровень валиден).
 * withSolver=true дополнительно доказывает проходимость BFS-решателем.
 */
export function validateLevel(level: LevelDef, opts: { withSolver?: boolean } = {}): string[] {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);

  if (!Number.isInteger(level.width) || !Number.isInteger(level.height) || level.width < 3 || level.height < 3 || level.width > 12 || level.height > 12) {
    err(`недопустимый размер поля ${level.width}x${level.height}`);
    return errors;
  }
  const inside = (x: number, y: number) => x >= 0 && x < level.width && y >= 0 && y < level.height;

  // Фигуры: типы, длины, направления, границы
  const ids = new Set<string>();
  for (const p of level.pieces) {
    if (ids.has(p.id)) err(`дубликат id фигуры "${p.id}"`);
    ids.add(p.id);
    if (!KINDS.has(p.kind)) {
      err(`фигура "${p.id}": неизвестный тип "${p.kind}"`);
      continue;
    }
    const lens = LEN_BY_KIND[p.kind];
    if (!lens.includes(p.len)) err(`фигура "${p.id}" (${p.kind}): недопустимая длина ${p.len}`);
    if (p.kind === 'crate') {
      if (p.dir !== 'any') err(`ящик "${p.id}": dir должен быть "any"`);
      if (!Number.isInteger(p.maxMoves) || (p.maxMoves ?? 0) < 1) err(`ящик "${p.id}": maxMoves должен быть >= 1`);
    } else {
      if (p.dir !== 'h' && p.dir !== 'v') err(`фигура "${p.id}": направление должно быть "h" или "v"`);
    }
  }

  // Ровно одна целевая машина
  const targets = level.pieces.filter((p) => p.kind === 'target');
  if (targets.length !== 1) err(`целевых машин: ${targets.length}, должна быть ровно одна`);

  // Границы и пересечения
  const occupied = new Map<string, string>();
  for (const w of level.walls ?? []) {
    if (!inside(w.x, w.y)) err(`стена (${w.x},${w.y}) вне поля`);
    const k = `${w.x},${w.y}`;
    if (occupied.has(k)) err(`стена (${w.x},${w.y}) пересекается с "${occupied.get(k)}"`);
    occupied.set(k, `стена ${w.kind}`);
  }
  const st = createState(level);
  level.pieces.forEach((def: PieceDef, i) => {
    for (const c of pieceCells(def, st.pieces[i])) {
      if (!inside(c.x, c.y)) {
        err(`фигура "${def.id}" выходит за поле в (${c.x},${c.y})`);
        continue;
      }
      const k = `${c.x},${c.y}`;
      if (occupied.has(k)) err(`фигура "${def.id}" пересекается с "${occupied.get(k)}" в (${c.x},${c.y})`);
      occupied.set(k, def.id);
    }
  });

  // Ворота
  const horizontal = level.exit.side === 'left' || level.exit.side === 'right';
  const laneMax = horizontal ? level.height : level.width;
  if (!Number.isInteger(level.exit.index) || level.exit.index < 0 || level.exit.index >= laneMax) {
    err(`ворота: index ${level.exit.index} вне поля`);
  } else if (targets.length === 1) {
    const t = targets[0];
    if (horizontal && (t.dir !== 'h' || t.y !== level.exit.index)) {
      err(`целевая машина не на линии ворот (ряд ${level.exit.index})`);
    }
    if (!horizontal && (t.dir !== 'v' || t.x !== level.exit.index)) {
      err(`целевая машина не на линии ворот (колонка ${level.exit.index})`);
    }
    // Стены между целевой машиной и воротами делают ворота недоступными навсегда
    const v = exitVector(level.exit);
    const walls = level.walls ?? [];
    if (horizontal) {
      const fromX = v.dx > 0 ? t.x + t.len : -1;
      for (const w of walls) {
        if (w.y === level.exit.index && (v.dx > 0 ? w.x >= fromX : w.x < t.x)) {
          err(`стена (${w.x},${w.y}) навсегда перекрывает путь к воротам`);
        }
      }
    } else {
      const fromY = v.dy > 0 ? t.y + t.len : -1;
      for (const w of walls) {
        if (w.x === level.exit.index && (v.dy > 0 ? w.y >= fromY : w.y < t.y)) {
          err(`стена (${w.x},${w.y}) навсегда перекрывает путь к воротам`);
        }
      }
    }
  }

  // Звезда
  if (level.star) {
    if (!inside(level.star.x, level.star.y)) err(`звезда (${level.star.x},${level.star.y}) вне поля`);
    const k = `${level.star.x},${level.star.y}`;
    if (occupied.has(k)) err(`звезда стоит на занятой клетке (${occupied.get(k)})`);
  }

  // Ледяная колея
  for (const ice of level.ice ?? []) {
    if (!inside(ice.x, ice.y)) err(`лёд (${ice.x},${ice.y}) вне поля`);
    const k = `${ice.x},${ice.y}`;
    if (occupied.has(k)) err(`лёд стоит на занятой клетке (${occupied.get(k)})`);
    if (level.star?.x === ice.x && level.star.y === ice.y) err(`лёд пересекается со звездой (${ice.x},${ice.y})`);
  }

  // Нажимная кнопка ворот
  if (level.gateSwitch) {
    const { x, y } = level.gateSwitch;
    if (!inside(x, y)) err(`кнопка ворот (${x},${y}) вне поля`);
    const k = `${x},${y}`;
    if (occupied.has(k)) err(`кнопка ворот стоит на занятой клетке (${occupied.get(k)})`);
    if (level.star?.x === x && level.star.y === y) err(`кнопка ворот пересекается со звездой (${x},${y})`);
  }

  // Пороги звёзд
  if (!Number.isInteger(level.par) || level.par < 1) err(`par должен быть >= 1`);
  if (!Number.isInteger(level.par2) || level.par2 < level.par) err(`par2 должен быть >= par`);

  // Проходимость
  if (opts.withSolver && errors.length === 0) {
    const res = solve(level);
    if (res.exhausted) err('решатель упёрся в лимит состояний — уровень слишком велик');
    else if (!res.solvable) err('уровень непроходим');
    else if (level.star) {
      const withStar = solve(level, { requireStar: true });
      if (!withStar.solvable) err('звезду невозможно собрать');
      else if (withStar.optimal > level.par2) {
        err(`3 звезды недостижимы: сбор звезды требует ${withStar.optimal} ходов при par2=${level.par2}`);
      }
    }
  }
  return errors;
}
