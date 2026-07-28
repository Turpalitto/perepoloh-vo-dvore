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
  /** Порядковый id испытания (1..25). */
  id: number;
  sourceLevelId: number;
  modifier: EliteModifier;
  bronze: EliteGoal;
  silver: EliteGoal;
  gold: EliteGoal;
}

/**
 * Кураторский список: уровень-источник + модификатор-«вкус».
 *
 * Порядок — по возрастанию нагрузки, а не по id: сначала знакомство с лигой на
 * коротких уровнях без ограничений, дальше снимаются страховки, в конце —
 * самые длинные уровни кампании с обеими снятыми.
 *
 * Ледяные уровни (105–108) включены намеренно: лёд — самая новая механика
 * проекта, и до этого она в пост-кампании не встречалась вообще. Ледяных
 * источников ровно четыре (у 101–104 массив `ice` пустой — это обычные
 * вставки), поэтому берём все четыре.
 *
 * Модификаторов «none» осталось 5 из 25: испытание со знакомой геометрией и без
 * единого ограничения отличается от кампании только счётчиком ходов, и таких
 * должно быть меньшинство. Распределение: none 5, noUndo 9, noHints 5,
 * noUndoNoHints 6 (проверяется тестом).
 *
 * Пороги задаются не здесь, а выводятся из уровня (см. buildGoals).
 */
const CURATED: Array<{ source: number; modifier: EliteModifier }> = [
  // Знакомство: короткие уровни, ограничения ещё мягкие.
  { source: 8, modifier: 'none' },
  { source: 12, modifier: 'none' },
  { source: 15, modifier: 'noUndo' },
  { source: 18, modifier: 'none' },
  { source: 22, modifier: 'noUndo' },
  // Снимаются страховки, появляется лёд.
  { source: 25, modifier: 'noHints' },
  { source: 28, modifier: 'noUndo' },
  { source: 105, modifier: 'none' },
  { source: 106, modifier: 'noUndo' },
  { source: 31, modifier: 'noUndo' },
  // Середина: первые комбинированные.
  { source: 35, modifier: 'noHints' },
  { source: 38, modifier: 'noUndo' },
  { source: 107, modifier: 'noUndoNoHints' },
  { source: 42, modifier: 'noUndo' },
  { source: 45, modifier: 'noHints' },
  // Лёд со звездой и длинные уровни.
  { source: 50, modifier: 'noUndoNoHints' },
  { source: 108, modifier: 'noUndoNoHints' },
  { source: 55, modifier: 'noUndo' },
  { source: 64, modifier: 'noHints' },
  { source: 72, modifier: 'noUndoNoHints' },
  // Финальный блок: самые длинные оптимумы кампании.
  { source: 88, modifier: 'noUndoNoHints' },
  { source: 92, modifier: 'noHints' },
  { source: 95, modifier: 'noUndo' },
  { source: 98, modifier: 'noUndoNoHints' },
  { source: 100, modifier: 'none' }
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
  const level = LEVELS.find((l) => l.id === entry.source);
  if (!level) throw new Error(`Мастер-испытание ссылается на несуществующий уровень ${entry.source}`);
  return { id: index + 1, sourceLevelId: entry.source, modifier: entry.modifier, ...buildGoals(level, entry.modifier) };
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

export function sourceLevel(challenge: EliteChallenge): LevelDef {
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
    if (challenge.modifier !== 'none') continue;
    const level = sourceLevel(challenge);
    const medal = medalFromCampaign(challenge, level, stars[String(level.id)] ?? 0);
    if (medal > 0) out[String(challenge.id)] = medal;
  }
  return out;
}
