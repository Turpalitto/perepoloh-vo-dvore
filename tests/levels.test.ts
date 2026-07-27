import { describe, expect, it } from 'vitest';
import levelsJson from '../src/levels/levels.json';
import type { LevelDef } from '../src/core/types';
import { validateLevel } from '../src/core/validator';
import { BOSSES } from '../src/game/boss';
import { SOLVER_SHARDS } from './solver-shards';

const LEVELS = levelsJson as LevelDef[];

describe('уровни игры', () => {
  it('id уникальны, положительны и стабильны как ключ сейва', () => {
    // Порядок в массиве задаёт кампанию, id — ключ звёзд и ссылок (боссы,
    // мастер-испытания). Поэтому id НЕ обязаны идти подряд: уровни, вставленные
    // в середину кампании после релиза, получают свободные id, чтобы не сдвинуть
    // звёзды живых игроков.
    expect(LEVELS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
    for (const level of LEVELS) expect(Number.isInteger(level.id) && level.id >= 1).toBe(true);
    expect(LEVELS[0].id).toBe(1);
  });

  it('сложность кампании падает только на помеченных уровнях, и кривая возвращается', () => {
    // Инвариант заменяет прежнюю строгую монотонность par: она запрещала и
    // обучающие мини-главы, и передышки после пиков. Теперь просадка разрешена
    // только помеченному уровню и только под гарантию возврата к кривой.
    let i = 1;
    while (i < LEVELS.length) {
      const level = LEVELS[i];
      const before = LEVELS[i - 1].par;
      if (level.par >= before) {
        i++;
        continue;
      }
      expect(level.role, `уровень ${level.id} легче предыдущего без роли`).toBeDefined();

      if (level.role === 'breather') {
        // Отдых после пика: один уровень, не глубже двух ходов, не подряд.
        expect(before - level.par, `уровень ${level.id}: передышка глубже двух ходов`).toBeLessThanOrEqual(2);
        expect(LEVELS[i + 1]?.role, `уровень ${level.id}: две передышки подряд`).not.toBe('breather');
        i++;
        continue;
      }

      // Обучающая мини-глава: может начаться заметно легче, но обязана расти
      // внутри себя и вернуть кампанию на прежний уровень сложности сразу после.
      let end = i;
      while (end + 1 < LEVELS.length && LEVELS[end + 1].role === 'tutorial') end++;
      for (let k = i; k < end; k++) {
        expect(LEVELS[k + 1].par, `уровень ${LEVELS[k + 1].id}: мини-глава не растёт`).toBeGreaterThanOrEqual(
          LEVELS[k].par
        );
      }
      const after = LEVELS[end + 1];
      expect(after?.par ?? before, `после мини-главы (${level.id}…) кампания не вернулась к сложности`).toBeGreaterThanOrEqual(
        before
      );
      i = end + 1;
    }
  });

  it('каждый уровень покрыт ровно одним шардом решателя', () => {
    // Правило проекта: par обязан совпадать с оптимумом решателя. Доказывают это
    // шард-файлы, поэтому уровень вне всех диапазонов остался бы недоказанным.
    for (const level of LEVELS) {
      const hits = SOLVER_SHARDS.filter((shard) => shard.match(level.id));
      expect(hits.length, `уровень ${level.id}: шардов решателя ${hits.length}, нужен ровно 1`).toBe(1);
    }
  });

  it('роль не навешивается на уровень, который не облегчает кривую', () => {
    expect(LEVELS[0].role).toBeUndefined();
    for (let i = 1; i < LEVELS.length; i++) {
      const level = LEVELS[i];
      if (level.role === undefined) continue;
      // Либо уровень действительно легче предыдущего, либо он — продолжение
      // мини-главы той же роли (внутри неё сложность уже растёт).
      const startsRelief = level.par < LEVELS[i - 1].par;
      const continuesChain = LEVELS[i - 1].role === level.role;
      expect(startsRelief || continuesChain, `уровень ${level.id}: роль без причины`).toBe(true);
    }
  });

  it('сложность сообщает реальный оптимум, а не только место в кампании', () => {
    const expected = (par: number): LevelDef['difficulty'] => {
      if (par <= 5) return 'easy';
      if (par <= 10) return 'medium';
      return 'hard';
    };
    for (const level of LEVELS) expect(level.difficulty).toBe(expected(level.par));
    expect(new Set(LEVELS.map((level) => level.difficulty))).toEqual(new Set(['easy', 'medium', 'hard']));
  });

  it('учебные уровни 5–6 требуют цепочку, а не один блокиратор', () => {
    for (const level of LEVELS.slice(4, 6)) {
      expect(level.par).toBeGreaterThanOrEqual(4);
      expect(level.pieces.filter((piece) => piece.kind !== 'target').length).toBeGreaterThanOrEqual(3);
    }
  });

  it('боссы не становятся легче предыдущего босса', () => {
    const bossIds = new Set(BOSSES.map((boss) => boss.id));
    const bosses = LEVELS.filter((level) => bossIds.has(level.id)).map((level) => level.par);
    expect(bosses).toHaveLength(BOSSES.length);
    for (let i = 1; i < bosses.length; i++) expect(bosses[i]).toBeGreaterThanOrEqual(bosses[i - 1]);
    expect(bosses.at(-1)).toBeGreaterThan(bosses.at(-2)!);
  });

  it('кнопка ворот вводится без одновременного повторного ввода грузовика и ящика', () => {
    const intro = LEVELS.find((level) => level.mechanics.includes('gate-switch'));
    expect(intro?.id).toBe(17);
    expect(intro?.mechanics).toEqual(['tractor', 'star', 'gate-switch']);
    expect(intro?.pieces.length).toBeLessThanOrEqual(8);
  });

  it('не содержит повторяющихся раскладок', () => {
    const signatures = LEVELS.map((level) =>
      JSON.stringify({
        width: level.width,
        height: level.height,
        exit: level.exit,
        pieces: level.pieces.map(({ kind, x, y, len, dir, maxMoves }) => ({ kind, x, y, len, dir, maxMoves })),
        walls: level.walls,
        star: level.star,
        gateSwitch: level.gateSwitch
      })
    );
    expect(new Set(signatures).size).toBe(LEVELS.length);
  });

  it('финальный босс не легче двух предыдущих уровней', () => {
    const final = LEVELS.at(-1)!;
    expect(final.par).toBeGreaterThanOrEqual(Math.max(LEVELS.at(-2)!.par, LEVELS.at(-3)!.par));
  });

  it('в срезе есть все заявленные механики', () => {
    const all = new Set(LEVELS.flatMap((l) => l.mechanics));
    expect(all).toContain('truck');
    expect(all).toContain('tractor');
    expect(all).toContain('crate');
    expect(all).toContain('star');
    expect(all).toContain('gate-switch');
  });

  for (const level of LEVELS) {
    describe(`уровень ${level.id} «${level.name}»`, () => {
      it('проходит валидатор', () => {
        expect(validateLevel(level)).toEqual([]);
      });

      it('механики соответствуют содержимому', () => {
        const kinds = new Set(level.pieces.map((p) => p.kind));
        for (const m of ['truck', 'tractor', 'crate'] as const) {
          expect(level.mechanics.includes(m)).toBe(kinds.has(m));
        }
        expect(level.mechanics.includes('star')).toBe(level.star !== undefined);
        expect(level.mechanics.includes('gate-switch')).toBe(level.gateSwitch !== undefined);
        expect(level.mechanics.includes('ice')).toBe((level.ice?.length ?? 0) > 0);
      });
    });
  }
});
