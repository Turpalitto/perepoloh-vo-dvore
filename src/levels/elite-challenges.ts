/**
 * Мастер-испытания «Высшей лиги» — data-driven конфигурация поверх лучших
 * уровней кампании. Мы НЕ копируем данные уровня: испытание ссылается на
 * sourceLevelId, а пороги медалей ДЕРИВИРУЮТСЯ из par/par2 этого уровня, поэтому
 * золото всегда достижимо (gold.maxMoves = оптимум решателя), а серебро — со
 * звездой в мягком лимите. Детерминировано и проверяется тестом.
 */
import levelsJson from './levels.json';
import type { LevelDef } from '../core/types';
import type { EliteGoal, Medal } from '../game/elite';
import { medalFromCampaign } from '../game/elite';
import { blocksUndo } from '../game/modifiers';
import { buildRemix, remixChangesRules, type RemixSpec } from './remix';

const LEVELS = levelsJson as LevelDef[];

/**
 * Модификатор, применяемый на время испытания.
 *
 * `noHints` сам по себе почти ничего не стоит: золото и без него требует
 * прохождения без подсказки (см. buildGoals), так что модификатор влияет только
 * на бронзу и серебро. Поэтому есть комбинированный `noUndoNoHints` — он и даёт
 * настоящие мастер-испытания, где обе страховки сняты на всём прохождении.
 */
export type EliteModifier = 'none' | 'noHints' | 'noUndo' | 'noUndoNoHints';

export interface EliteChallenge {
  /** Порядковый id испытания (1..28). */
  id: number;
  /** Уровень кампании, из которого испытание сделано. */
  sourceLevelId: number;
  /**
   * Расклад испытания. Для обычного испытания это сам уровень кампании; для
   * ремикса — преобразованная копия, и тогда `sourceLevelId` означает только
   * происхождение двора, а не то, во что играют.
   */
  level: LevelDef;
  /** Поле преобразовано: старое решение не работает. */
  remixed: boolean;
  /**
   * Ремикс меняет саму задачу (препятствие, лёд или сдвиг старта), а не только
   * систему координат.
   *
   * Отдельное поле, а не вывод «par отличается от исходного»: сдвиг стартовой
   * позиции не меняет ни состав двора, ни число препятствий, и любая попытка
   * угадать класс преобразования по данным уровня рано или поздно ошибётся.
   */
  remixChangedRules: boolean;
  modifier: EliteModifier;
  bronze: EliteGoal;
  silver: EliteGoal;
  gold: EliteGoal;
}

/**
 * Id ремиксов лежат заведомо вне кампании. По id считаются звёзды, главы и
 * реплики деда — ремикс не должен попадать ни в один из этих счётчиков.
 */
const REMIX_ID_BASE = 900;

/**
 * Кураторский список: уровень-источник + модификатор-«вкус».
 *
 * Порядок — не по id. Внутри дивизиона `par` не убывает (проверяется тестом),
 * и каждый следующий дивизион начинается не легче, чем начинался предыдущий.
 * Через границу блока `par` намеренно падает: дивизион открывается ледяным
 * уровнем, а лёд короткий по ходам и сложный по правилам — сортировать его по
 * `par` значило бы утопить единственную новую механику в первом дивизионе.
 *
 * Ледяные уровни (105–108) включены намеренно: лёд — самая новая механика
 * проекта, и до этого она в пост-кампании не встречалась вообще. Ледяных
 * источников ровно четыре (у 101–104 массив `ice` пустой — это обычные
 * вставки), поэтому берём все четыре.
 *
 * Четырнадцать испытаний — ремиксы (`remix`), а не сам уровень кампании. Без
 * них лига читается как «пройди то же ещё раз», сколько ограничений ни
 * навешивай: двор знаком, и заученный маршрут работает. Четыре ремикса — чистые
 * отражения (оптимум тот же, ломается только узнавание), десять сдвигают
 * оптимум бочкой, ледяной клеткой или сдвигом стартовой позиции.
 *
 * Сдвиг старта появился вторым проходом: перебор с добавленной клеткой дал
 * варианты лишь по семи дворам из двадцати трёх — на большинстве полей лишнее
 * препятствие либо ничего не меняет, либо убивает звезду. Сдвиг бьёт по другому
 * месту: состав двора тот же, а порядок разъезда другой.
 *
 * Все `par` здесь — не формула, а числа из решателя (`scripts/remix-report.ts`
 * и `scripts/remix-shift-report.ts`), и тест сверяет каждое.
 *
 * Модификаторов «none» осталось 5 из 28: испытание со знакомой геометрией и без
 * единого ограничения отличается от кампании только счётчиком ходов, и таких
 * должно быть меньшинство. Распределение: none 5, noUndo 10, noHints 6,
 * noUndoNoHints 7 (проверяется тестом).
 *
 * Дивизион 6 (id 26–28) добавлен отдельно от кураторского перебора 1–25: три
 * капстоун-испытания на новых механиках движка (доски, куры, held-кнопка),
 * каждое — ремикс уровня, который в первых 25 испытаниях ещё не использован
 * (проверяется тестом на уникальность источников). Порядок внутри блока и его
 * первый элемент подобраны решателем так же, как и для остальных дивизионов:
 * не легче конца дивизиона 5 (par 14) и не убывает внутри себя.
 *
 * Пороги задаются не здесь, а выводятся из уровня (см. buildGoals).
 */
const CURATED: Array<{ source: number; modifier: EliteModifier; remix?: Omit<RemixSpec, 'source'> }> = [
  // Дивизион 1 — знакомство: короткие уровни, ограничения ещё мягкие.
  { source: 8, modifier: 'none' },
  { source: 15, modifier: 'noUndo' },
  {
    source: 12,
    modifier: 'none',
    remix: { flip: 'x', walls: [{ x: 1, y: 3, kind: 'barrel' }], name: 'Сено и бочка', par: 8, par2: 10 }
  },
  { source: 18, modifier: 'none' },
  { source: 22, modifier: 'noUndo' },
  // Дивизион 2 — вход через лёд, дальше снимаются страховки.
  { source: 105, modifier: 'none' },
  // 106 остаётся исходным двором: сдвиг любой фигуры делал одну из его ледяных
  // клеток инертной, и verify:ice отклонял ремикс как декоративный лёд.
  { source: 106, modifier: 'noUndo' },
  { source: 28, modifier: 'noUndo' },
  {
    source: 31,
    modifier: 'noUndo',
    remix: { flip: 'x', shift: [{ piece: 'H', dx: 2, dy: -2 }], name: 'Ярмарка врассыпную', par: 10, par2: 12 }
  },
  {
    source: 25,
    modifier: 'noHints',
    remix: { flip: 'x', shift: [{ piece: 'F', dx: -2, dy: 1 }], name: 'Погреб переставлен', par: 11, par2: 13 }
  },
  // Дивизион 3 — плотнее всего ремиксов: двор знаком, решение уже нет.
  { source: 107, modifier: 'noUndoNoHints' },
  {
    source: 35,
    modifier: 'noHints',
    remix: { flip: 'x', walls: [{ x: 0, y: 1, kind: 'barrel' }], name: 'Курятник и бочка', par: 10, par2: 12 }
  },
  {
    source: 38,
    modifier: 'noUndo',
    remix: { flip: 'x', ice: [{ x: 2, y: 4 }], name: 'Улей во льду', par: 10, par2: 12 }
  },
  { source: 45, modifier: 'noHints', remix: { flip: 'x', name: 'Круговорот наоборот', par: 10, par2: 12 } },
  {
    source: 42,
    modifier: 'noUndo',
    remix: { flip: 'x', ice: [{ x: 2, y: 3 }], name: 'Зной во льду', par: 12, par2: 14 }
  },
  // Дивизион 4 — лёд со звездой и длинные уровни.
  { source: 108, modifier: 'noUndoNoHints' },
  { source: 50, modifier: 'noUndoNoHints', remix: { flip: 'x', name: 'Закуток наоборот', par: 10, par2: 12 } },
  {
    source: 55,
    modifier: 'noUndo',
    remix: { flip: 'x', shift: [{ piece: 'C', dx: -2, dy: 0 }], name: 'Уборка наизнанку', par: 12, par2: 14 }
  },
  { source: 72, modifier: 'noUndoNoHints', remix: { flip: 'y', name: 'Задний двор наоборот', par: 12, par2: 14 } },
  {
    source: 64,
    modifier: 'noHints',
    remix: { flip: 'x', shift: [{ piece: 'C', dx: -2, dy: -1 }], name: 'Переполох переставлен', par: 15, par2: 17 }
  },
  // Дивизион 5 — самые длинные оптимумы кампании.
  { source: 92, modifier: 'noHints', remix: { flip: 'y', name: 'Сеновал наоборот', par: 14, par2: 16 } },
  {
    source: 95,
    modifier: 'noUndo',
    remix: { flip: 'x', ice: [{ x: 0, y: 3 }], name: 'Капкан во льду', par: 17, par2: 19 }
  },
  {
    source: 88,
    modifier: 'noUndoNoHints',
    remix: { flip: 'x', ice: [{ x: 3, y: 4 }], name: 'Дым во льду', par: 18, par2: 20 }
  },
  { source: 98, modifier: 'noUndoNoHints' },
  { source: 100, modifier: 'none' },
  // Дивизион 6 — капстоун новых механик движка: доски, куры, held-кнопка.
  // Источник 56 уже несёт свою кнопку ворот («Босс: Осенний завал») — held
  // лишь меняет её режим, новой кнопки ремикс не добавляет.
  { source: 56, modifier: 'noUndo', remix: { holdType: 'held', name: 'Затор у забора', par: 16, par2: 18 } },
  {
    source: 82,
    modifier: 'noHints',
    remix: { planks: [{ x: 2, y: 0 }], name: 'Заросшая доска', par: 17, par2: 19 }
  },
  {
    source: 33,
    modifier: 'noUndoNoHints',
    remix: { chickens: [{ a: { x: 2, y: 1 }, b: { x: 0, y: 1 } }], name: 'Курятник в разгар уборки', par: 17, par2: 19 }
  }
];

/**
 * Пороги из уровня. Зазор `par2 − par` в кампании равен 2 почти везде, поэтому
 * лестница получается ровной: `par+4 / par+2 / par`.
 *
 * Прежние пороги были формальными. Бронза `par2 + 8` — это `par + 10`, то есть
 * пятнадцать ходов на пятиходовую задачу: медаль выдавалась просто за запуск.
 * Серебро `par2 + 2` со звездой было СЛАБЕЕ трёх звёзд кампании (`par2` со
 * звездой), которые игрок к этому моменту уже собрал. Испытанием было только
 * золото, а две ступени из трёх просили доказать доказанное.
 *
 * Теперь каждая ступень означает результат лучше предыдущей:
 * бронза — уложиться с запасом в два хода, серебро — ровно порог двух звёзд
 * (со звездой, если она на уровне есть), золото — оптимум решателя без
 * подсказки. То, что уже доказано в кампании, выдаётся автоматически
 * (`campaignImpliedMedals`), а не переигрывается.
 */
function buildGoals(level: LevelDef, modifier: EliteModifier): Pick<EliteChallenge, 'bronze' | 'silver' | 'gold'> {
  const opt = level.par;
  const cap = level.par2;
  const hasStar = level.star !== undefined;
  const bronze: EliteGoal = { maxMoves: cap + 2 };
  const silver: EliteGoal = { maxMoves: cap, requireStar: hasStar || undefined };
  const gold: EliteGoal = {
    maxMoves: opt,
    noHint: true,
    noUndo: blocksUndo(modifier) || undefined
  };
  return { bronze, silver, gold };
}

export const ELITE_CHALLENGES: EliteChallenge[] = CURATED.map((entry, index) => {
  const base = LEVELS.find((l) => l.id === entry.source);
  if (!base) throw new Error(`Мастер-испытание ссылается на несуществующий уровень ${entry.source}`);
  const level = entry.remix
    ? buildRemix(base, { ...entry.remix, source: entry.source }, REMIX_ID_BASE + index + 1)
    : base;
  return {
    id: index + 1,
    sourceLevelId: entry.source,
    level,
    remixed: Boolean(entry.remix),
    remixChangedRules: entry.remix ? remixChangesRules({ ...entry.remix, source: entry.source }) : false,
    modifier: entry.modifier,
    ...buildGoals(level, entry.modifier)
  };
});

/**
 * Дивизионы — пять блоков по пять испытаний.
 *
 * Раньше двадцать пять карточек лежали одной сеткой, и ранг был единственным
 * признаком продвижения — то есть продвижение измерялось только суммой очков.
 * Дивизион привязывает его к содержанию: блок открывается, когда предыдущий
 * действительно освоен, и по нему видно, докуда игрок дошёл.
 *
 * Границы совпадают с порядком `CURATED` — он выстроен по возрастанию нагрузки,
 * поэтому дивизион не приходится задавать отдельным списком id.
 */
export const DIVISION_SIZE = 5;

/** Сколько медалей в дивизионе открывает следующий (из пяти). */
export const DIVISION_UNLOCK_MEDALS = 3;

export const DIVISIONS: ReadonlyArray<{ index: number; from: number; to: number }> = Array.from(
  { length: Math.ceil(ELITE_CHALLENGES.length / DIVISION_SIZE) },
  (_, i) => ({
    index: i + 1,
    from: i * DIVISION_SIZE + 1,
    to: Math.min((i + 1) * DIVISION_SIZE, ELITE_CHALLENGES.length)
  })
);

/** Номер дивизиона (с единицы) по id испытания. */
export function divisionOf(challengeId: number): number {
  const found = DIVISIONS.find((d) => challengeId >= d.from && challengeId <= d.to);
  return found?.index ?? DIVISIONS.length;
}

/** Сколько испытаний дивизиона имеют хотя бы бронзу. */
export function divisionMedals(medals: Record<string, number>, division: number): number {
  const bounds = DIVISIONS[division - 1];
  if (!bounds) return 0;
  let count = 0;
  for (let id = bounds.from; id <= bounds.to; id++) if ((medals[String(id)] ?? 0) > 0) count++;
  return count;
}

/**
 * Дивизион открыт: первый — всегда, остальные — когда в предыдущем набрано
 * `DIVISION_UNLOCK_MEDALS` медалей. Порог намеренно не «все пять»: тупик в
 * пост-кампании хуже, чем слишком быстрый доступ, а бронза берётся с запасом в
 * два хода — она подтверждает, что блок пройден, а не что он выжат досуха.
 */
export function divisionUnlocked(medals: Record<string, number>, division: number): boolean {
  if (division <= 1) return true;
  return divisionMedals(medals, division - 1) >= DIVISION_UNLOCK_MEDALS;
}

/**
 * Испытание доступно: его дивизион открыт — либо медаль по нему уже есть.
 *
 * Второе условие не косметика: медали засчитываются по кампании и попадают в
 * ещё закрытые дивизионы. Без него игрок видел бы карточку с серебром и замком
 * одновременно и не мог переиграть то, за что уже получил очки.
 */
export function challengeUnlocked(medals: Record<string, number>, challengeId: number): boolean {
  if ((medals[String(challengeId)] ?? 0) > 0) return true;
  return divisionUnlocked(medals, divisionOf(challengeId));
}

export function eliteChallenge(id: number): EliteChallenge | undefined {
  return ELITE_CHALLENGES.find((c) => c.id === id);
}

/** Расклад, в который играют: сам уровень кампании либо его ремикс. */
export function sourceLevel(challenge: EliteChallenge): LevelDef {
  return challenge.level;
}

/** Исходный двор кампании — нужен там, где важно происхождение, а не расклад. */
export function originLevel(challenge: EliteChallenge): LevelDef {
  return LEVELS.find((l) => l.id === challenge.sourceLevelId)!;
}

/**
 * Медали, которые игрок уже заслужил в кампании: повторять их бессмысленно.
 *
 * Считается только из звёзд — единственного, что хранит сейв (`stars`, 0..3);
 * количество ходов в сейве не лежит, поэтому «перенести результат в 11 ходов»
 * технически неоткуда. Звёзд достаточно: три звезды на уровне со звездой — это
 * ровно условие серебра, а две звезды — гарантия лимита бронзы.
 *
 * Переносятся только испытания без модификатора: прохождение в кампании не
 * доказывает ни отказ от отмены, ни отказ от подсказки. Золото не переносится
 * никогда — оно требует «без подсказки», а этого сейв не знает.
 */
export function campaignImpliedMedals(stars: Record<string, number>): Record<string, Medal> {
  const out: Record<string, Medal> = {};
  for (const challenge of ELITE_CHALLENGES) {
    // Ремикс — другая задача: результат на исходном дворе о нём ничего не говорит.
    if (challenge.modifier !== 'none' || challenge.remixed) continue;
    const level = sourceLevel(challenge);
    const medal = medalFromCampaign(challenge, level, stars[String(challenge.sourceLevelId)] ?? 0);
    if (medal > 0) out[String(challenge.id)] = medal;
  }
  return out;
}
