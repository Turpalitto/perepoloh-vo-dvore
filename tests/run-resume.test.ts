import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMove, createState } from '../src/core/game';
import type { GameState } from '../src/core/game';
import type { LevelDef } from '../src/core/types';
import levelsJson from '../src/levels/levels.json';
import {
  RUN_SAVE_DEBOUNCE_MS,
  createRunSaver,
  decodeRun,
  encodeRun,
  isRunWorthSaving,
  levelFingerprint
} from '../src/game/run-resume';

const LEVELS = levelsJson as LevelDef[];

/** Уровень кампании со звездой и ящиками — самый богатый набор полей. */
const level = LEVELS.find((l) => l.star && l.pieces.some((p) => p.kind === 'crate')) ?? LEVELS[0];

/** Делает несколько реальных ходов решателем-независимо: любой валидный ход. */
function advance(lvl: LevelDef, times: number): GameState {
  let state = createState(lvl);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ] as const;
  for (let n = 0; n < times; n++) {
    let moved = false;
    for (let i = 0; i < lvl.pieces.length && !moved; i++) {
      for (const [dx, dy] of dirs) {
        const res = applyMove(lvl, state, i, dx, dy, 1);
        if (res && !res.state.won) {
          state = res.state;
          moved = true;
          break;
        }
      }
    }
    if (!moved) break;
  }
  return state;
}

describe('run-resume: отпечаток уровня', () => {
  it('одинаков для одного и того же уровня и различен для разных', () => {
    expect(levelFingerprint(level)).toBe(levelFingerprint(level));
    const other = LEVELS.find((l) => l.id !== level.id)!;
    expect(levelFingerprint(other)).not.toBe(levelFingerprint(level));
  });

  it('меняется при сдвиге фигуры, добавлении стены и правке par', () => {
    const base = levelFingerprint(level);
    const movedPiece: LevelDef = {
      ...level,
      pieces: level.pieces.map((p, i) => (i === 0 ? { ...p, x: p.x + 1 } : p))
    };
    expect(levelFingerprint(movedPiece)).not.toBe(base);

    const extraWall: LevelDef = { ...level, walls: [...(level.walls ?? []), { x: 0, y: 0, kind: 'hay' }] };
    expect(levelFingerprint(extraWall)).not.toBe(base);

    // par на законность позиции не влияет, но влияет на справедливость цели:
    // после ребаланса честнее начать заново.
    expect(levelFingerprint({ ...level, par: level.par + 1 })).not.toBe(base);
  });
});

describe('run-resume: круговой рейс', () => {
  it('состояние с ходами восстанавливается без потерь', () => {
    const state = advance(level, 3);
    expect(state.moves).toBeGreaterThan(0);
    const restored = decodeRun(level, encodeRun(level, state));
    expect(restored).toEqual(state);
  });

  it('восстановленное состояние — копия, а не общая ссылка', () => {
    const state = advance(level, 2);
    const restored = decodeRun(level, encodeRun(level, state))!;
    restored.pieces[0].x = 42;
    restored.brokenPlanks.push('9,9');
    expect(state.pieces[0].x).not.toBe(42);
    expect(state.brokenPlanks).not.toContain('9,9');
  });

  it('сохранённые ящики и звезда переносятся', () => {
    const state = advance(level, 4);
    const restored = decodeRun(level, encodeRun(level, state))!;
    expect(restored.pieces.map((p) => p.used)).toEqual(state.pieces.map((p) => p.used));
    expect(restored.starCollected).toBe(state.starCollected);
  });
});

describe('run-resume: попытка выбрасывается, а не ломает игру', () => {
  it('изменение данных уровня отбрасывает попытку', () => {
    const state = advance(level, 3);
    const raw = encodeRun(level, state);
    // Тот же id, другая раскладка — ровно случай обновления игры.
    const changed: LevelDef = {
      ...level,
      pieces: level.pieces.map((p, i) => (i === 0 ? { ...p, x: p.x + 1 } : p))
    };
    expect(decodeRun(changed, raw)).toBeNull();
  });

  it('попытка от другого уровня не подхватывается', () => {
    const state = advance(level, 3);
    const other = LEVELS.find((l) => l.id !== level.id)!;
    expect(decodeRun(other, encodeRun(level, state))).toBeNull();
  });

  it('битый JSON, пустая строка и null дают null', () => {
    expect(decodeRun(level, null)).toBeNull();
    expect(decodeRun(level, '')).toBeNull();
    expect(decodeRun(level, '{не json')).toBeNull();
    expect(decodeRun(level, 'null')).toBeNull();
    expect(decodeRun(level, '[]')).toBeNull();
  });

  it('чужая версия формата отбрасывается', () => {
    const state = advance(level, 3);
    const obj = JSON.parse(encodeRun(level, state));
    obj.v = 99;
    expect(decodeRun(level, JSON.stringify(obj))).toBeNull();
  });

  it('нулевой ход и победа не восстанавливаются', () => {
    const fresh = createState(level);
    expect(isRunWorthSaving(fresh)).toBe(false);
    expect(decodeRun(level, encodeRun(level, fresh))).toBeNull();

    const won: GameState = { ...advance(level, 2), won: true };
    expect(isRunWorthSaving(won)).toBe(false);
    expect(decodeRun(level, encodeRun(level, won))).toBeNull();
  });

  it('подделанные значения отвергаются: типы, диапазоны, количества', () => {
    const state = advance(level, 3);
    const mutate = (fn: (o: Record<string, unknown>) => void): string => {
      const obj = JSON.parse(encodeRun(level, state));
      fn(obj.s);
      return JSON.stringify(obj);
    };
    expect(decodeRun(level, mutate((s) => (s.moves = -1)))).toBeNull();
    expect(decodeRun(level, mutate((s) => (s.moves = 1.5)))).toBeNull();
    expect(decodeRun(level, mutate((s) => (s.moves = '3')))).toBeNull();
    expect(decodeRun(level, mutate((s) => (s.starCollected = 1)))).toBeNull();
    expect(decodeRun(level, mutate((s) => (s.pieces as unknown[]).pop()))).toBeNull();
    expect(decodeRun(level, mutate((s) => (s.pieces = 'нет')))).toBeNull();
    expect(decodeRun(level, mutate((s) => (s.chickenAt = ['a'])))).toBeNull();
    expect(decodeRun(level, mutate((s) => (s.brokenPlanks = ['0,0'])))).toBeNull();
    expect(decodeRun(level, mutate((s) => ((s.pieces as Record<string, unknown>[])[0].gone = true)))).toBeNull();
    expect(decodeRun(level, mutate((s) => ((s.pieces as Record<string, unknown>[])[0].used = -1)))).toBeNull();
  });

  it('геометрически невозможная позиция отвергается: выход за поле и наложение', () => {
    const state = advance(level, 3);
    const outside = JSON.parse(encodeRun(level, state));
    outside.s.pieces[0].x = level.width + 5;
    expect(decodeRun(level, JSON.stringify(outside))).toBeNull();

    const overlap = JSON.parse(encodeRun(level, state));
    // Две фигуры в одной клетке — невозможное состояние доски.
    overlap.s.pieces[1].x = overlap.s.pieces[0].x;
    overlap.s.pieces[1].y = overlap.s.pieces[0].y;
    expect(decodeRun(level, JSON.stringify(overlap))).toBeNull();
  });

  it('фигура, поставленная в стену, отвергается', () => {
    const walled = LEVELS.find((l) => (l.walls?.length ?? 0) > 0);
    if (!walled) return;
    const state = advance(walled, 2);
    if (state.moves === 0) return;
    const obj = JSON.parse(encodeRun(walled, state));
    const wall = walled.walls![0];
    obj.s.pieces[0].x = wall.x;
    obj.s.pieces[0].y = wall.y;
    expect(decodeRun(walled, JSON.stringify(obj))).toBeNull();
  });

  it('уровень с кнопкой: закрытые ворота допустимы, у обычного — нет', () => {
    const plain = LEVELS.find((l) => !l.gateSwitch)!;
    const state = advance(plain, 2);
    const obj = JSON.parse(encodeRun(plain, state));
    obj.s.gateUnlocked = false;
    expect(decodeRun(plain, JSON.stringify(obj))).toBeNull();

    const gated = LEVELS.find((l) => l.gateSwitch);
    if (!gated) return;
    const gs = advance(gated, 2);
    if (gs.moves === 0) return;
    // Здесь `gateUnlocked: false` — законное начальное состояние.
    expect(decodeRun(gated, encodeRun(gated, gs))).toEqual(gs);
  });
});

describe('run-resume: дебаунс записи', () => {
  /** Поддельное хранилище: считает записи и стирания. */
  function fakeIO() {
    const writes: string[] = [];
    let clears = 0;
    return {
      writes,
      get clears() {
        return clears;
      },
      io: {
        write: (raw: string) => void writes.push(raw),
        clear: () => void clears++
      }
    };
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('серия ходов даёт одну запись, а не запись на каждый ход', () => {
    const store = fakeIO();
    const saver = createRunSaver(level, store.io);
    // Три хода подряд быстрее дебаунса — ровно тот случай, из-за которого
    // наивная реализация писала в localStorage в каждом кадре анимации.
    saver.schedule(advance(level, 1));
    saver.schedule(advance(level, 2));
    const last = advance(level, 3);
    saver.schedule(last);
    expect(store.writes).toHaveLength(0);
    vi.advanceTimersByTime(RUN_SAVE_DEBOUNCE_MS);
    expect(store.writes).toHaveLength(1);
    // Записано ПОСЛЕДНЕЕ состояние, а не первое запланированное.
    expect(decodeRun(level, store.writes[0])).toEqual(last);
  });

  it('flush пишет немедленно, без ожидания таймера', () => {
    const store = fakeIO();
    const saver = createRunSaver(level, store.io);
    const state = advance(level, 2);
    saver.schedule(state);
    saver.flush();
    expect(store.writes).toHaveLength(1);
    expect(decodeRun(level, store.writes[0])).toEqual(state);
    // Отложенного таймера больше нет — повторной записи не будет.
    vi.advanceTimersByTime(RUN_SAVE_DEBOUNCE_MS * 3);
    expect(store.writes).toHaveLength(1);
  });

  it('flush без запланированного состояния ничего не пишет', () => {
    const store = fakeIO();
    createRunSaver(level, store.io).flush();
    expect(store.writes).toHaveLength(0);
    expect(store.clears).toBe(0);
  });

  it('победа и откат к нулю стирают попытку и снимают отложенную запись', () => {
    const store = fakeIO();
    const saver = createRunSaver(level, store.io);
    saver.schedule(advance(level, 3));
    saver.schedule({ ...advance(level, 3), won: true });
    expect(store.clears).toBe(1);
    // Критично: отложенный таймер от предыдущего хода не должен «оживить»
    // стёртую попытку — иначе пройденный уровень открывался бы с середины.
    vi.advanceTimersByTime(RUN_SAVE_DEBOUNCE_MS * 3);
    expect(store.writes).toHaveLength(0);

    saver.schedule(createState(level));
    expect(store.clears).toBe(2);
  });

  it('clear стирает и отменяет отложенную запись', () => {
    const store = fakeIO();
    const saver = createRunSaver(level, store.io);
    saver.schedule(advance(level, 3));
    saver.clear();
    expect(store.clears).toBe(1);
    vi.advanceTimersByTime(RUN_SAVE_DEBOUNCE_MS * 3);
    expect(store.writes).toHaveLength(0);
  });

  it('dispose докатывает отложенную запись (уход с экрана уровня)', () => {
    const store = fakeIO();
    const saver = createRunSaver(level, store.io);
    const state = advance(level, 3);
    saver.schedule(state);
    saver.dispose();
    expect(decodeRun(level, store.writes.at(-1)!)).toEqual(state);
    vi.advanceTimersByTime(RUN_SAVE_DEBOUNCE_MS * 3);
    expect(store.writes).toHaveLength(1);
  });

  it('запись хранит снимок: последующая мутация состояния на неё не влияет', () => {
    const store = fakeIO();
    const saver = createRunSaver(level, store.io);
    const state = advance(level, 3);
    const movesAtSchedule = state.moves;
    saver.schedule(state);
    state.pieces[0].x = 99;
    state.moves = 777;
    saver.flush();
    const written = decodeRun(level, store.writes[0]);
    expect(written).not.toBeNull();
    expect(written!.moves).toBe(movesAtSchedule);
  });
});

describe('run-resume: все уровни кампании', () => {
  it('отпечатки уникальны — попытка не может «переехать» на другой уровень', () => {
    const seen = new Map<string, number>();
    for (const l of LEVELS) {
      const fp = levelFingerprint(l);
      const prev = seen.get(fp);
      expect(prev, `уровни ${prev} и ${l.id} имеют одинаковый отпечаток`).toBeUndefined();
      seen.set(fp, l.id);
    }
  });

  it('каждый уровень выдерживает круговой рейс с непустой попыткой', () => {
    for (const l of LEVELS) {
      const state = advance(l, 2);
      if (!isRunWorthSaving(state)) continue;
      expect(decodeRun(l, encodeRun(l, state)), `уровень ${l.id}`).toEqual(state);
    }
  });
});
