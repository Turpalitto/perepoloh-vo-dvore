/**
 * Каноническое представление уровня для поиска дубликатов.
 * Правила игры симметричны относительно отражений и поворотов (оси движения
 * и ворота преобразуются вместе с полем), поэтому канон — минимальная строка
 * по всем восьми преобразованиям диэдральной группы. Имена фигур и порядок
 * в массиве не влияют: фигуры сортируются по позиции.
 */
import type { Dir, ExitDef, LevelDef } from './types';

interface Cell {
  x: number;
  y: number;
}

type Transform = (c: Cell, w: number, h: number) => Cell;

/** 8 симметрий: id, зеркала, повороты. Повороты меняют ширину и высоту местами. */
const TRANSFORMS: { map: Transform; swapDims: boolean; swapAxes: boolean; name: string }[] = [
  { name: 'id', map: (c) => c, swapDims: false, swapAxes: false },
  { name: 'mirrorX', map: (c, w) => ({ x: w - 1 - c.x, y: c.y }), swapDims: false, swapAxes: false },
  { name: 'mirrorY', map: (c, _w, h) => ({ x: c.x, y: h - 1 - c.y }), swapDims: false, swapAxes: false },
  { name: 'rot180', map: (c, w, h) => ({ x: w - 1 - c.x, y: h - 1 - c.y }), swapDims: false, swapAxes: false },
  { name: 'rot90', map: (c, _w, h) => ({ x: h - 1 - c.y, y: c.x }), swapDims: true, swapAxes: true },
  { name: 'rot270', map: (c, w) => ({ x: c.y, y: w - 1 - c.x }), swapDims: true, swapAxes: true },
  { name: 'diag', map: (c) => ({ x: c.y, y: c.x }), swapDims: true, swapAxes: true },
  { name: 'antidiag', map: (c, w, h) => ({ x: h - 1 - c.y, y: w - 1 - c.x }), swapDims: true, swapAxes: true }
];

function transformDir(dir: Dir, swapAxes: boolean): Dir {
  if (dir === 'any' || !swapAxes) return dir;
  return dir === 'h' ? 'v' : 'h';
}

/** Ворота как направленная клетка сразу за краем — преобразуются как обычная точка. */
function exitCell(exit: ExitDef, w: number, h: number): Cell {
  switch (exit.side) {
    case 'left':
      return { x: -1, y: exit.index };
    case 'right':
      return { x: w, y: exit.index };
    case 'top':
      return { x: exit.index, y: -1 };
    case 'bottom':
      return { x: exit.index, y: h };
  }
}

/**
 * Каноническая строка одного преобразования. Фигура кодируется своей верхней/левой
 * клеткой ПОСЛЕ преобразования, поэтому для отражённых фигур берём минимум из клеток.
 */
function encode(level: LevelDef, t: (typeof TRANSFORMS)[number]): string {
  const { width: w, height: h } = level;
  const W = t.swapDims ? h : w;
  const H = t.swapDims ? w : h;
  const m = (c: Cell) => t.map(c, w, h);

  const pieces = level.pieces
    .map((p) => {
      const dir = transformDir(p.dir, t.swapAxes);
      // клетки фигуры до преобразования
      const cells: Cell[] = [];
      for (let i = 0; i < p.len; i++) {
        cells.push({ x: p.x + (p.dir === 'h' ? i : 0), y: p.y + (p.dir === 'v' ? i : 0) });
      }
      const mapped = cells.map(m);
      const ox = Math.min(...mapped.map((c) => c.x));
      const oy = Math.min(...mapped.map((c) => c.y));
      return `${p.kind}:${ox},${oy},${p.len},${dir}${p.kind === 'crate' ? `,${p.maxMoves ?? 0}` : ''}`;
    })
    .sort()
    .join(';');

  const cellList = (cells: Cell[] | undefined, tag: string) =>
    cells && cells.length > 0
      ? `|${tag}:${cells
          .map(m)
          .map((c) => `${c.x},${c.y}`)
          .sort()
          .join(';')}`
      : '';

  const e = m(exitCell(level.exit, w, h));
  return (
    `${W}x${H}|exit:${e.x},${e.y}|${pieces}` +
    cellList(level.walls, 'w') +
    cellList(level.star ? [level.star] : undefined, 's') +
    cellList(level.gateSwitch ? [level.gateSwitch] : undefined, 'g') +
    cellList(level.ice, 'i')
  );
}

/** Канонический ключ уровня: минимум по всем симметриям. Идентификаторы и имена не участвуют. */
export function canonicalKey(level: LevelDef): string {
  let best: string | null = null;
  for (const t of TRANSFORMS) {
    const s = encode(level, t);
    if (best === null || s < best) best = s;
  }
  return best!;
}

/**
 * Ключ ТОЧНОГО расположения: без симметрий, но по-прежнему без id и имён.
 *
 * Нужен там, где важна именно картинка на экране. `canonicalKey` инвариантен к
 * отражениям — по нему нельзя отличить уровень от его зеркала, а ремикс лиги
 * ровно этим и занимается: отражением симметричного двора можно получить
 * «ремикс», который выглядит один в один как источник.
 */
export function exactKey(level: LevelDef): string {
  return encode(level, TRANSFORMS[0]);
}

export interface SimilarPair {
  a: number;
  b: number;
  /** 1 — логический дубликат (с точностью до симметрий и имён); иначе доля общих фигур. */
  similarity: number;
  reason: string;
}

/** Мультимножество фигурных сигнатур в заданной кодировке. */
function pieceBag(key: string): string[] {
  const body = key.split('|')[2] ?? '';
  return body.split(';').filter(Boolean);
}

/**
 * Ищет дубликаты и почти-дубликаты. Точные — по каноническому ключу (все
 * симметрии); почти-дубликаты — в исходной ориентации (канон двух похожих
 * уровней может выбрать разные симметрии, и сравнение стало бы шумным).
 * Ничего не изменяет и не объединяет — только отчёт.
 */
export function findSimilarLevels(levels: LevelDef[], nearThreshold = 0.9): SimilarPair[] {
  const keys = levels.map((l) => canonicalKey(l));
  const plain = levels.map((l) => encode(l, TRANSFORMS[0]));
  const pairs: SimilarPair[] = [];
  for (let i = 0; i < levels.length; i++) {
    for (let j = i + 1; j < levels.length; j++) {
      if (keys[i] === keys[j]) {
        pairs.push({ a: levels[i].id, b: levels[j].id, similarity: 1, reason: 'идентичны с точностью до симметрии и имён' });
        continue;
      }
      // почти-дубликат: одинаковое поле и ≥threshold общих фигур
      const [dimI] = plain[i].split('|');
      const [dimJ] = plain[j].split('|');
      if (dimI !== dimJ) continue;
      const bagI = pieceBag(plain[i]);
      const bagJ = pieceBag(plain[j]);
      const setJ = new Set(bagJ);
      const common = bagI.filter((p) => setJ.has(p)).length;
      const total = Math.max(bagI.length, bagJ.length);
      const similarity = total > 0 ? common / total : 0;
      if (similarity >= nearThreshold) {
        pairs.push({
          a: levels[i].id,
          b: levels[j].id,
          similarity: Number(similarity.toFixed(2)),
          reason: `совпадает ${common} из ${total} фигур на одинаковом поле`
        });
      }
    }
  }
  return pairs;
}
