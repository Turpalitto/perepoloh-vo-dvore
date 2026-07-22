/**
 * Deterministic campaign rebalance.
 *
 * Keeps the hand-authored names and progression, removes proven filler pieces,
 * adds gate-switch routes where they create a real dependency, then asks the
 * solver to write the authoritative par/par2 values.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { solve } from '../src/core/solver';
import type { LevelDef, PieceDef } from '../src/core/types';
import { validateLevel } from '../src/core/validator';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const levelsPath = join(root, 'src/levels/levels.json');
const levels = JSON.parse(readFileSync(levelsPath, 'utf8')) as LevelDef[];

const level = (id: number): LevelDef => {
  const found = levels.find((entry) => entry.id === id);
  if (!found) throw new Error(`Уровень ${id} не найден`);
  return found;
};

levels[4] = {
  id: 5,
  name: 'Молочная канистра',
  width: 6,
  height: 6,
  exit: { side: 'right', index: 2 },
  pieces: [
    { id: 'T', kind: 'target', x: 0, y: 2, len: 2, dir: 'h' },
    { id: 'A', kind: 'car', x: 2, y: 1, len: 2, dir: 'v', skin: 2 },
    { id: 'B', kind: 'car', x: 1, y: 3, len: 2, dir: 'h', skin: 1 },
    { id: 'C', kind: 'car', x: 0, y: 3, len: 2, dir: 'v', skin: 0 }
  ],
  walls: [
    { x: 2, y: 0, kind: 'hay' },
    { x: 3, y: 3, kind: 'barrel' }
  ],
  star: { x: 2, y: 4 },
  par: 4,
  par2: 6,
  difficulty: 'easy',
  mechanics: ['star'],
  hint: 'Сначала освободи место для машины у канистры'
};

levels[5] = {
  id: 6,
  name: 'Тяжёлый ящик',
  width: 6,
  height: 6,
  exit: { side: 'right', index: 2 },
  pieces: [
    { id: 'T', kind: 'target', x: 0, y: 2, len: 2, dir: 'h' },
    { id: 'K', kind: 'crate', x: 3, y: 2, len: 1, dir: 'any', maxMoves: 1 },
    { id: 'B', kind: 'truck', x: 1, y: 3, len: 3, dir: 'h', skin: 1 },
    { id: 'C', kind: 'car', x: 0, y: 3, len: 2, dir: 'v', skin: 0 }
  ],
  walls: [
    { x: 3, y: 1, kind: 'hay' },
    { x: 4, y: 3, kind: 'barrel' }
  ],
  par: 4,
  par2: 6,
  difficulty: 'easy',
  mechanics: ['truck', 'crate'],
  hint: 'Подготовь место: ящик можно передвинуть только один раз'
};

// Level 14 used five individually irrelevant pieces. A mirrored, gate-aware
// variant of the strongest chapter layout makes all eight blockers participate.
{
  const original = level(14);
  const source = level(25);
  const height = source.height;
  const mirrorPiece = (piece: PieceDef): PieceDef => ({
    ...piece,
    y: piece.dir === 'v' ? height - piece.y - piece.len : height - 1 - piece.y
  });
  levels[13] = {
    ...structuredClone(source),
    id: 14,
    name: original.name,
    hint: original.hint,
    exit: { ...source.exit, index: height - 1 - source.exit.index },
    pieces: source.pieces.map(mirrorPiece),
    walls: source.walls?.map((wall) => ({ ...wall, y: height - 1 - wall.y })),
    star: source.star ? { x: source.star.x, y: height - 1 - source.star.y } : undefined,
    gateSwitch: { x: 2, y: 3 }
  };
}

const removals: Record<number, string[]> = {
  19: ['A', 'D', 'E'],
  21: ['C', 'E'],
  // N is optional for the fastest exit, but required by the three-star route.
  24: ['A', 'D', 'F', 'J', 'O'],
  36: ['C', 'E', 'F', 'K'],
  38: ['F', 'G', 'H'],
  43: ['F', 'I'],
  44: ['C', 'D', 'F', 'H'],
  48: ['H', 'M'],
  50: ['B', 'D', 'H'],
  53: ['E', 'G', 'H']
};

for (const [rawId, ids] of Object.entries(removals)) {
  const current = level(Number(rawId));
  current.pieces = current.pieces.filter((piece) => !ids.includes(piece.id));
}

const gates: Record<number, { x: number; y: number }> = {
  14: { x: 2, y: 3 },
  16: { x: 0, y: 5 },
  20: { x: 1, y: 0 },
  22: { x: 5, y: 5 },
  24: { x: 5, y: 1 },
  27: { x: 0, y: 1 },
  29: { x: 1, y: 0 },
  31: { x: 2, y: 5 },
  33: { x: 0, y: 1 },
  35: { x: 5, y: 4 },
  36: { x: 0, y: 1 },
  37: { x: 4, y: 3 },
  38: { x: 4, y: 2 },
  39: { x: 0, y: 0 },
  43: { x: 1, y: 3 },
  44: { x: 3, y: 0 },
  45: { x: 1, y: 3 },
  48: { x: 0, y: 0 },
  60: { x: 0, y: 0 }
};

for (const [rawId, gateSwitch] of Object.entries(gates)) level(Number(rawId)).gateSwitch = gateSwitch;

// This formerly decorative crate now creates the final dependency in boss 60.
{
  const boss = level(60);
  const crate = boss.pieces.find((piece) => piece.id === 'D');
  if (!crate) throw new Error('Ящик D уровня 60 не найден');
  crate.x = 3;
  crate.y = 3;
}

const changedIds = new Set([5, 6, 14, ...Object.keys(removals).map(Number), ...Object.keys(gates).map(Number), 60]);

function mechanicsFor(entry: LevelDef): string[] {
  const kinds = new Set(entry.pieces.map((piece) => piece.kind));
  const mechanics: string[] = [];
  if (kinds.has('truck')) mechanics.push('truck');
  if (kinds.has('tractor')) mechanics.push('tractor');
  if (kinds.has('crate')) mechanics.push('crate');
  if (entry.star) mechanics.push('star');
  if (entry.gateSwitch) mechanics.push('gate-switch');
  return mechanics;
}

function difficultyFor(par: number): LevelDef['difficulty'] {
  if (par <= 5) return 'easy';
  if (par <= 10) return 'medium';
  return 'hard';
}

for (const entry of levels) {
  entry.mechanics = mechanicsFor(entry);
  if (changedIds.has(entry.id)) {
    const plain = solve(entry);
    if (!plain.solvable || plain.exhausted) throw new Error(`Уровень ${entry.id} не решён`);
    const withStar = solve(entry, { requireStar: true });
    if (!withStar.solvable || withStar.exhausted) throw new Error(`Звезда уровня ${entry.id} недостижима`);
    entry.par = plain.optimal;
    entry.par2 = Math.max(plain.optimal + 2, withStar.optimal);
  }
  entry.difficulty = difficultyFor(entry.par);
  const errors = validateLevel(entry);
  if (errors.length > 0) throw new Error(`Уровень ${entry.id}: ${errors.join('; ')}`);
}

writeFileSync(levelsPath, `${JSON.stringify(levels, null, 2)}\n`, 'utf8');
console.log(`Перебалансировано уровней: ${changedIds.size}`);
