/**
 * Вклад каждой курицы в головоломку — постфактум, по готовому уровню.
 *
 * У кур правило значимости строже, чем у льда и досок, потому что курица может
 * оказаться пустой ДВУМЯ разными способами:
 *
 * 1. Курица вообще ничего не перегораживает — тогда без неё оптимум не падает.
 *    Это тот же дефект, что декоративный лёд, и ловится той же абляцией.
 * 2. Курица перегораживает, но её ЦИКЛ не нужен: задача решается ровно так же,
 *    как если бы на месте курицы стояла обычная стена. Такая «курица» —
 *    переодетая бочка, и единственное, что она добавляет, — необходимость
 *    держать в голове лишнюю сущность. Проверяется отдельно: курица
 *    «приколачивается» стеной сначала в клетке A, потом в клетке B, и оптимум с
 *    живым циклом обязан отличаться от ОБОИХ статичных вариантов. Отличие хотя
 *    бы от одного недостаточно: если совпал один, значит именно такой стеной
 *    курицу и можно заменить.
 *
 * Неопределённый результат (исчерпанный лимит состояний) доказательством не
 * считается — ровно как в `ice-impact.ts`, откуда переиспользуется само правило
 * «клетка несёт вес».
 */
import type { ChickenDef, LevelDef, WallDef } from './types';
import { type AblationOutcome, cellCarriesWeight } from './ice-impact';
import { solve } from './solver';

/** Роль курицы: чем именно она платит за место на поле. */
export type ChickenRole = 'живой цикл' | 'подменяется стеной' | 'нет роли';

export interface ChickenImpactEntry {
  chicken: ChickenDef;
  /** Оптимум без этой курицы (-1, если ответа нет). */
  optimalWithout: number;
  solvableWithout: boolean;
  exhaustedWithout: boolean;
  /** Оптимум, если курицу заменить неподвижной стеной в клетке A / B. */
  optimalPinnedA: number;
  optimalPinnedB: number;
  /** Хоть один из статичных вариантов упёрся в лимит — сравнение недостоверно. */
  exhaustedPinned: boolean;
  role: ChickenRole;
  /** Курица несёт вес: без неё задача мельчает И стеной её не заменить. */
  required: boolean;
}

export interface ChickenImpact {
  fullOptimal: number;
  solvable: boolean;
  exhausted: boolean;
  chickens: ChickenImpactEntry[];
}

/** Уровень без курицы `index`. */
function without(level: LevelDef, index: number): LevelDef {
  const rest = (level.chickens ?? []).filter((_, k) => k !== index);
  const next: LevelDef = { ...level, chickens: rest };
  if (!rest.length) delete next.chickens;
  return next;
}

/**
 * Уровень, где курица `index` заменена неподвижной стеной в одной из своих
 * клеток. Тип стены — 'barrel': видимой роли не играет, уровень в игру не идёт,
 * это только вход для решателя.
 */
function pinned(level: LevelDef, index: number, side: 'a' | 'b'): LevelDef {
  const chicken = level.chickens![index];
  const cell = side === 'a' ? chicken.a : chicken.b;
  const wall: WallDef = { x: cell.x, y: cell.y, kind: 'barrel' };
  const base = without(level, index);
  return { ...base, walls: [...(base.walls ?? []), wall] };
}

/**
 * Правило значимости курицы, вынесенное отдельно от разбора поля — как и
 * `cellCarriesWeight` для льда, его нельзя надёжно проверить на настоящем
 * уровне (нужен расклад с исчерпанным поиском при завершённом полном), а
 * ошибиться в нём легко.
 */
export function chickenCarriesWeight(
  outcome: AblationOutcome,
  fullOptimal: number,
  pinnedOptimals: { a: number; b: number; exhausted: boolean }
): boolean {
  if (!cellCarriesWeight(outcome, fullOptimal)) return false;
  // Статичные варианты обязаны дать определённый ответ: иначе неизвестно,
  // отличается ли живой цикл от стены, и «значимость» была бы фикцией.
  if (pinnedOptimals.exhausted) return false;
  // Совпадение с любым из статичных вариантов означает, что именно такой
  // стеной курицу и можно заменить без потери задачи.
  return pinnedOptimals.a !== fullOptimal && pinnedOptimals.b !== fullOptimal;
}

export function analyzeChickenImpact(level: LevelDef, opts: { stateLimit?: number } = {}): ChickenImpact {
  const chickens = level.chickens ?? [];
  const full = solve(level, opts);
  if (!full.solvable) {
    return {
      fullOptimal: full.optimal,
      solvable: false,
      exhausted: full.exhausted,
      chickens: chickens.map((chicken) => ({
        chicken,
        optimalWithout: -1,
        solvableWithout: false,
        exhaustedWithout: false,
        optimalPinnedA: -1,
        optimalPinnedB: -1,
        exhaustedPinned: false,
        role: 'нет роли',
        required: false
      }))
    };
  }

  const entries = chickens.map((chicken, index) => {
    const bare = solve(without(level, index), opts);
    const pinA = solve(pinned(level, index, 'a'), opts);
    const pinB = solve(pinned(level, index, 'b'), opts);
    const exhaustedPinned = pinA.exhausted || pinB.exhausted;
    const outcome: AblationOutcome = {
      solvableWithout: bare.solvable,
      exhaustedWithout: bare.exhausted,
      optimalWithout: bare.optimal,
      // Роль в терминах льда здесь не применима: курицу не «проезжают» и на ней
      // не «парусь». Вес несёт сам факт перегораживания, поэтому роль ставится
      // по результату абляции, а не по маршруту решения.
      role: bare.solvable && bare.optimal < full.optimal ? 'проезд' : 'нет роли'
    };
    const required = chickenCarriesWeight(outcome, full.optimal, {
      a: pinA.optimal,
      b: pinB.optimal,
      exhausted: exhaustedPinned
    });
    const role: ChickenRole = required
      ? 'живой цикл'
      : bare.solvable && bare.optimal < full.optimal && !exhaustedPinned
        ? 'подменяется стеной'
        : 'нет роли';
    return {
      chicken,
      optimalWithout: bare.optimal,
      solvableWithout: bare.solvable,
      exhaustedWithout: bare.exhausted,
      optimalPinnedA: pinA.optimal,
      optimalPinnedB: pinB.optimal,
      exhaustedPinned,
      role,
      required
    };
  });

  return { fullOptimal: full.optimal, solvable: true, exhausted: full.exhausted, chickens: entries };
}
