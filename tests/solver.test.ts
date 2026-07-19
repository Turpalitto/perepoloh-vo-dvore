import { describe, expect, it } from 'vitest';
import { applyMove, createState } from '../src/core/game';
import { hint, solve } from '../src/core/solver';
import { lvl, piece } from './helpers';

describe('решатель', () => {
  it('свободный путь = 1 ход', () => {
    const level = lvl({ pieces: [piece('T', 'target', 0, 2, 'h')] });
    const r = solve(level);
    expect(r.solvable).toBe(true);
    expect(r.optimal).toBe(1);
    expect(r.path).toHaveLength(1);
    expect(r.path[0]).toMatchObject({ piece: 0, dx: 1, dy: 0 });
  });

  it('один блокер = 2 хода', () => {
    const level = lvl({ pieces: [piece('T', 'target', 0, 2, 'h'), piece('A', 'car', 4, 1, 'v')] });
    const r = solve(level);
    expect(r.optimal).toBe(2);
  });

  it('распознаёт непроходимый уровень', () => {
    const level = lvl({
      pieces: [piece('T', 'target', 0, 2, 'h')],
      walls: [{ x: 5, y: 2, kind: 'hay' }]
    });
    expect(solve(level).solvable).toBe(false);
  });

  it('лимит ящика делает уровень непроходимым', () => {
    // Ящик на линии ворот, лимит 1: единственный уход — вправо на (5,2), где он всё ещё мешает
    const level = lvl({
      pieces: [piece('T', 'target', 0, 2, 'h'), piece('K', 'crate', 4, 2, 'any', { maxMoves: 1 })],
      walls: [
        { x: 4, y: 1, kind: 'hay' },
        { x: 4, y: 3, kind: 'hay' }
      ]
    });
    expect(solve(level).solvable).toBe(false);
  });

  it('решение со звездой может быть длиннее оптимального', () => {
    const level = lvl({
      pieces: [piece('T', 'target', 0, 2, 'h'), piece('A', 'car', 0, 4, 'v')], // A: (0,4),(0,5)
      star: { x: 0, y: 0 }
    });
    const plain = solve(level);
    const withStar = solve(level, { requireStar: true });
    expect(plain.optimal).toBe(1);
    expect(withStar.solvable).toBe(true);
    expect(withStar.optimal).toBeGreaterThan(plain.optimal); // A должна съездить вверх
  });

  it('подсказка ведёт по кратчайшему пути из текущего состояния', () => {
    const level = lvl({ pieces: [piece('T', 'target', 0, 2, 'h'), piece('A', 'car', 4, 1, 'v')] });
    let s = createState(level);
    const h1 = hint(level, s)!;
    expect(h1).not.toBeNull();
    s = applyMove(level, s, h1.piece, h1.dx, h1.dy, h1.steps)!.state;
    const h2 = hint(level, s)!;
    s = applyMove(level, s, h2.piece, h2.dx, h2.dy, h2.steps)!.state;
    expect(s.won).toBe(true);
    expect(s.moves).toBe(2);
  });
});
