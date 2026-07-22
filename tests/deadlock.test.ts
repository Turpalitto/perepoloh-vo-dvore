import { describe, expect, it } from 'vitest';
import levelsJson from '../src/levels/levels.json';
import type { LevelDef } from '../src/core/types';
import { GameState, allowedDirs, applyMove, createState, maxSteps } from '../src/core/game';
import { solve } from '../src/core/solver';

const LEVELS = levelsJson as LevelDef[];

describe('основа детектора тупиков', () => {
  it('уровень 6: ящик, загнанный на линию ворот, даёт непроходимое состояние', () => {
    const level = LEVELS.find((l) => l.id === 6)!;
    const s = createState(level);
    // Ящик K (индекс 1) вправо — единственное перемещение потрачено, выезд заперт.
    const res = applyMove(level, s, 1, 1, 0, 1)!;
    expect(res).not.toBeNull();
    const check = solve(level, { from: res.state, stateLimit: 12_000 });
    expect(check.exhausted).toBe(false);
    expect(check.solvable).toBe(false); // именно это состояние показывает предупреждение
  });

  it('уровень 6: разумный ход ящика оставляет уровень проходимым', () => {
    const level = LEVELS.find((l) => l.id === 6)!;
    let s = createState(level);
    s = applyMove(level, s, 3, 0, 1, 1)!.state; // освободить клетку слева от грузовика
    s = applyMove(level, s, 2, -1, 0, 1)!.state; // освободить клетку под ящиком
    s = applyMove(level, s, 1, 0, 1, 1)!.state; // единственный разумный ход ящика
    const check = solve(level, { from: s, stateLimit: 12_000 });
    expect(check.solvable).toBe(true);
  });

  it('инвариант: без ящиков любое достижимое состояние проходимо', () => {
    // уровень 4: только техника, ящиков нет — случайное блуждание не может испортить уровень
    const level = LEVELS.find((l) => l.id === 4)!;
    expect(level.pieces.some((p) => p.kind === 'crate')).toBe(false);
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    let s: GameState = createState(level);
    for (let step = 0; step < 25; step++) {
      const moves: { i: number; dx: number; dy: number; steps: number }[] = [];
      level.pieces.forEach((def, i) => {
        if (def.kind === 'target') return; // целевую не выводим — гуляем блокерами
        for (const d of allowedDirs(def)) {
          const m = maxSteps(level, s, i, d.dx, d.dy);
          for (let k = 1; k <= m; k++) moves.push({ i, dx: d.dx, dy: d.dy, steps: k });
        }
      });
      if (moves.length === 0) break;
      const mv = moves[Math.floor(rnd() * moves.length)];
      s = applyMove(level, s, mv.i, mv.dx, mv.dy, mv.steps)!.state;
      expect(solve(level, { from: s }).solvable).toBe(true);
    }
  });
});
