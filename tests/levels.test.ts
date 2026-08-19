import { describe, expect, it } from 'vitest';
import levelsJson from '../src/levels/levels.json';
import type { LevelDef } from '../src/core/types';
import { validateLevel } from '../src/core/validator';
import { BOSSES } from '../src/game/boss';
import { CHAPTERS, CHAPTERS_TOTAL, chapterCount } from '../src/game/campaign';
import { setLang, t } from '../src/game/i18n';
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

  it('число глав не превышает переводы chapter.N', () => {
    // Экран уровней рисует заголовок `chapter.<номер>` по таблице глав. Новая
    // глава без перевода показала бы игроку сырой ключ. Реальный случай:
    // 109-й уровень увёл бы финального босса в несуществующую главу 10.
    // setLang проставляет lang документу; в node-окружении хватает заглушки.
    if (typeof globalThis.document === 'undefined') {
      (globalThis as { document?: unknown }).document = { documentElement: { lang: 'ru' } };
    }
    const chapters = chapterCount();
    for (const lang of ['ru', 'en', 'tr'] as const) {
      setLang(lang);
      for (let chapter = 1; chapter <= chapters; chapter++) {
        const key = `chapter.${chapter}`;
        expect(t(key), `${lang}: нет перевода ${key}`).not.toBe(key);
      }
    }
    setLang('ru');
  });

  it('таблица глав покрывает кампанию ровно один раз', () => {
    // Главы заданы данными (CHAPTER_SIZES), а не правилом «каждые 12». Вставка
    // уровней без правки таблицы оставила бы хвост кампании вне всех глав —
    // карточки без заголовка и «глава завершена» не там, где надо.
    expect(CHAPTERS_TOTAL).toBe(LEVELS.length);
    let expectedFrom = 1;
    for (const chapter of CHAPTERS) {
      expect(chapter.from, `глава ${chapter.index} начинается не там`).toBe(expectedFrom);
      expect(chapter.to).toBe(chapter.from + chapter.size - 1);
      expectedFrom = chapter.to + 1;
    }
    expect(CHAPTERS.at(-1)!.to).toBe(LEVELS.length);
    for (let position = 1; position <= LEVELS.length; position++) {
      const owners = CHAPTERS.filter((c) => position >= c.from && position <= c.to);
      expect(owners, `позиция ${position}: глав ${owners.length}, нужна ровно 1`).toHaveLength(1);
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

  it('лёд вводится отдельной обучающей мини-главой, без других механик разом', () => {
    // Правило льда контринтуитивно (упор в препятствие не даёт остановиться),
    // поэтому знакомство с ним не должно конкурировать за внимание с грузовиком,
    // трактором, ящиком, звездой или кнопкой ворот.
    const intro = LEVELS.find((level) => level.mechanics.includes('ice'));
    expect(intro?.id).toBe(105);
    expect(intro?.mechanics).toEqual(['ice']);
    expect(intro?.star).toBeUndefined();
    expect(intro?.gateSwitch).toBeUndefined();

    // Вводная мини-глава идёт подряд и усложняется: механики только добавляются.
    // Проверяем только ведущий непрерывный блок от intro — лёд намеренно
    // возвращается позже (глава 10, позиции 117–128), уже вперемешку с курами
    // и held-кнопкой: там знакомство пройдено, и правило «ничего разом»
    // относится только к первому появлению механики.
    const introStart = LEVELS.indexOf(intro!);
    let introEnd = introStart;
    while (introEnd + 1 < LEVELS.length && LEVELS[introEnd + 1].mechanics.includes('ice')) introEnd++;
    for (let k = introStart; k < introEnd; k++) {
      for (const mechanic of LEVELS[k].mechanics) {
        expect(LEVELS[k + 1].mechanics, `уровень ${LEVELS[k + 1].id}: механика ${mechanic} пропала`).toContain(
          mechanic
        );
      }
    }
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
    expect(all).toContain('ice');
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
