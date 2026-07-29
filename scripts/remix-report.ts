/**
 * Перебор кандидатов в ремиксы Высшей лиги.
 *
 * Числа для ремикса нельзя вывести формулой: добавленная ледяная клетка или
 * бочка меняет оптимум непредсказуемо, а может и убить решение. Скрипт гоняет
 * решатель по всем вариантам и печатает только те, что проходят валидатор,
 * решаются, достижимы на три звезды и при этом ДЕЙСТВИТЕЛЬНО меняют задачу —
 * то есть оптимум сдвинулся относительно источника.
 *
 * Отчёт для человека: пары «источник + клетка» отсюда переносятся в
 * `elite-challenges.ts` руками, а тест сверяет объявленный par с решателем.
 *
 *   npx tsx scripts/remix-report.ts [--sources 8,12,15] [--max-par 14]
 */
import levelsJson from '../src/levels/levels.json';
import { solve } from '../src/core/solver';
import { validateLevel } from '../src/core/validator';
import { buildRemix, type FlipAxis, type RemixSpec } from '../src/levels/remix';
import type { LevelDef, WallKind } from '../src/core/types';

const LEVELS = levelsJson as LevelDef[];
const REMIX_ID = 900;
const FLIPS: FlipAxis[] = ['x', 'y'];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const maxPar = Number(arg('max-par') ?? 14);
const sources = (arg('sources') ?? '')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);

const candidates = (sources.length ? LEVELS.filter((l) => sources.includes(l.id)) : LEVELS).filter(
  (l) => l.par <= maxPar
);

/** Клетки, свободные от фигур, стен, звезды, кнопки и льда. */
function freeCells(level: LevelDef): Array<{ x: number; y: number }> {
  const taken = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;
  for (const p of level.pieces) {
    const w = p.dir === 'h' ? p.len : 1;
    const h = p.dir === 'v' ? p.len : 1;
    for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) taken.add(key(p.x + dx, p.y + dy));
  }
  for (const w of level.walls ?? []) taken.add(key(w.x, w.y));
  for (const c of level.ice ?? []) taken.add(key(c.x, c.y));
  if (level.star) taken.add(key(level.star.x, level.star.y));
  if (level.gateSwitch) taken.add(key(level.gateSwitch.x, level.gateSwitch.y));
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) if (!taken.has(key(x, y))) out.push({ x, y });
  }
  return out;
}

interface Report {
  source: number;
  kind: string;
  cell: string;
  par: number;
  delta: number;
  starPar: number;
}

const rows: Report[] = [];

for (const source of candidates) {
  for (const flip of FLIPS) {
    // Отражение — изоморфизм: оптимум обязан совпасть с исходным. Расхождение
    // означало бы ошибку в преобразовании, а не находку.
    const mirrored = buildRemix(
      source,
      { source: source.id, flip, name: 'зеркало', par: source.par, par2: source.par2 },
      REMIX_ID
    );
    const mirrorErrors = validateLevel(mirrored);
    const mirrorSolve = solve(mirrored);
    if (mirrorErrors.length || !mirrorSolve.solvable || mirrorSolve.optimal !== source.par) {
      console.log(
        `⚠ уровень ${source.id} (flip ${flip}): отражение сломано (ошибок ${mirrorErrors.length}, оптимум ${mirrorSolve.optimal} против ${source.par})`
      );
      continue;
    }

    for (const cell of freeCells(mirrored)) {
    const variants: Array<{ kind: string; spec: RemixSpec }> = [
      { kind: `ice/${flip}`, spec: { source: source.id, flip, ice: [cell], name: 'x', par: 0, par2: 0 } },
      {
        kind: `barrel/${flip}`,
        spec: { source: source.id, flip, walls: [{ ...cell, kind: 'barrel' as WallKind }], name: 'x', par: 0, par2: 0 }
      }
    ];
    for (const { kind, spec } of variants) {
      const level = buildRemix(source, spec, REMIX_ID);
      // par в пробном spec — заглушка, его ошибки здесь не важны.
      if (validateLevel(level).filter((e) => !e.includes('par')).length) continue;
      const res = solve(level);
      if (!res.solvable || res.exhausted) continue;
      // Ремикс обязан менять задачу: тот же оптимум — это переставленная мебель.
      if (res.optimal <= source.par) continue;
      // Три звезды должны оставаться достижимыми в пределах par+2.
      const withStar = level.star ? solve(level, { requireStar: true }) : res;
      if (!withStar.solvable || withStar.optimal > res.optimal + 2) continue;
      rows.push({
        source: source.id,
        kind,
        cell: `${cell.x},${cell.y}`,
        par: res.optimal,
        delta: res.optimal - source.par,
        starPar: withStar.optimal
      });
    }
    }
  }
  const best = rows.filter((r) => r.source === source.id);
  console.log(
    `уровень ${source.id} «${source.name}» (par ${source.par}): вариантов ${best.length}` +
      (best.length
        ? ` — ${best
            .slice()
            .sort((a, b) => a.delta - b.delta)
            .slice(0, 6)
            .map((r) => `${r.kind}@${r.cell} par ${r.par} (+${r.delta}, звезда ${r.starPar})`)
            .join('; ')}`
        : '')
  );
}

console.log(`\nвсего пригодных вариантов: ${rows.length}`);
