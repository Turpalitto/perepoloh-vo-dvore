/**
 * Разово переставляет уровни 10..N по возрастанию сложности (par),
 * убирая провалы из-за склейки нескольких партий генератора.
 * Уровни 1..9 (обучение) не трогает — там порядок педагогический,
 * не строго по ходам (введение новой механики важнее длины решения).
 * Запуск: npx tsx scripts/reorder-levels.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { LevelDef } from '../src/core/types';

const all = JSON.parse(readFileSync('src/levels/levels.json', 'utf8')) as LevelDef[];
const fixed = all.filter((l) => l.id < 10);
const rest = all.filter((l) => l.id >= 10);

rest.sort((a, b) => a.par - b.par || a.par2 - b.par2 || a.pieces.length - b.pieces.length);
rest.forEach((l, i) => {
  l.id = 10 + i;
});

const out = [...fixed, ...rest];
writeFileSync('src/levels/levels.json', JSON.stringify(out, null, 2) + '\n');
console.log(
  out.map((l) => `${l.id} ${l.difficulty} par=${l.par}`).join('\n')
);
