/**
 * «Высшая лига двора» — пост-кампания. Чистая логика без DOM: расчёт медали за
 * попытку испытания, очков лиги, рангов и наград. Всё детерминировано и покрыто
 * тестами.
 *
 * Ключевое решение: очки лиги ДЕРИВИРУЮТСЯ из медалей (сумма по испытаниям), а не
 * копятся отдельным счётчиком. Медали в сейве хранятся как максимум по каждому
 * испытанию, поэтому повторное прохождение/перезагрузка/облачный merge физически
 * не могут выдать награду дважды — идемпотентность встроена в модель данных.
 */
import type { SaveData } from './save';
import type { LevelDef } from '../core/types';
import type { EliteChallenge } from '../levels/elite-challenges';

/** 0 — не пройдено, 1 — бронза, 2 — серебро, 3 — золото. */
export type Medal = 0 | 1 | 2 | 3;

/** Результат одной попытки испытания, из которого выводится медаль. */
export interface AttemptResult {
  /** Ходов потрачено. */
  moves: number;
  /** Звезда собрана в этой попытке. */
  starCollected: boolean;
  /** Пользовался подсказкой в этой попытке. */
  usedHint: boolean;
  /** Пользовался отменой хода. */
  usedUndo: boolean;
  /** Перезапускал уровень. */
  usedRestart: boolean;
}

/** Очки лиги за каждую ступень медали (недостижимые ступени не считаются). */
export const MEDAL_POINTS: Record<Exclude<Medal, 0>, number> = { 1: 10, 2: 25, 3: 50 };

/**
 * Медаль за попытку. Условия испытания уже «зашиты» в его порогах:
 * gold — самый строгий лимит ходов (+ обязательная звезда/без подсказок, если
 * заданы), silver — мягче, bronze — просто пройти в пределах bronze.moves.
 * Возвращает лучшую достигнутую ступень.
 */
export function medalForAttempt(challenge: EliteChallenge, result: AttemptResult): Medal {
  const tiers: Array<{ medal: Exclude<Medal, 0>; goal: EliteGoal }> = [
    { medal: 3, goal: challenge.gold },
    { medal: 2, goal: challenge.silver },
    { medal: 1, goal: challenge.bronze }
  ];
  for (const { medal, goal } of tiers) {
    if (goalMet(goal, result)) return medal;
  }
  return 0;
}

/** Порог одной ступени медали. */
export interface EliteGoal {
  /** Пройти не более чем за столько ходов. */
  maxMoves: number;
  /** Требуется собрать звезду. */
  requireStar?: boolean;
  /** Требуется пройти без подсказки. */
  noHint?: boolean;
  /** Требуется пройти без отмены хода. */
  noUndo?: boolean;
}

function goalMet(goal: EliteGoal, r: AttemptResult): boolean {
  if (r.moves > goal.maxMoves) return false;
  if (goal.requireStar && !r.starCollected) return false;
  if (goal.noHint && r.usedHint) return false;
  if (goal.noUndo && r.usedUndo) return false;
  return true;
}

/**
 * Медаль, которую прохождение кампании УЖЕ доказало — чтобы не просить игрока
 * доказывать доказанное.
 *
 * Сейв хранит по уровню только число звёзд (0..3), ходов в нём нет. Но звёзды
 * жёстко связаны с лимитами (`starsFor`), поэтому из них выводится гарантия:
 * 2 звезды ⇒ `moves ≤ par2`; 3 звезды на уровне со звездой ⇒ `moves ≤ par2` и
 * звезда собрана; 3 звезды на уровне без звезды ⇒ `moves ≤ par`.
 *
 * Про подсказки, отмену и рестарт кампания не знает ничего, поэтому они
 * считаются использованными. Это автоматически закрывает золото (оно требует
 * «без подсказки») — золото всегда зарабатывается в самой лиге.
 */
export function medalFromCampaign(challenge: EliteChallenge, level: LevelDef, campaignStars: number): Medal {
  if (campaignStars < 2) return 0;
  const hasStar = level.star !== undefined;
  // Худший исход, совместимый с числом звёзд: лимит, который звёзды гарантируют.
  const guaranteedMoves = campaignStars === 3 && !hasStar ? level.par : level.par2;
  return medalForAttempt(challenge, {
    moves: guaranteedMoves,
    starCollected: campaignStars === 3 && hasStar,
    usedHint: true,
    usedUndo: true,
    usedRestart: true
  });
}

/** Медаль по конкретному испытанию из сейва (0, если не пройдено). */
export function medalOf(save: SaveData, challengeId: number): Medal {
  const m = save.eliteMedals?.[String(challengeId)] ?? 0;
  return (m >= 0 && m <= 3 ? m : 0) as Medal;
}

/** Суммарные очки лиги — деривация из медалей (идемпотентно). */
export function elitePoints(save: SaveData): number {
  let sum = 0;
  for (const v of Object.values(save.eliteMedals ?? {})) {
    if (v >= 1 && v <= 3) sum += MEDAL_POINTS[v as Exclude<Medal, 0>];
  }
  return sum;
}

/** Количество золотых медалей — для наград и достижений. */
export function goldCount(save: SaveData): number {
  return Object.values(save.eliteMedals ?? {}).filter((m) => m === 3).length;
}

/** Сколько испытаний имеют хотя бы бронзу. */
export function medaledCount(save: SaveData): number {
  return Object.values(save.eliteMedals ?? {}).filter((m) => m >= 1).length;
}

export interface RankDef {
  key: string;
  /** Минимум очков лиги для этого ранга. */
  points: number;
}

/**
 * Ранги. Максимум прежний: 25 испытаний × 50 за золото = 1250.
 *
 * Пороги пересчитаны вместе с порогами медалей. Раньше бронза и серебро были
 * почти недостижимо мягкими, и старая шкала (80/220/450/750/1050) считала их
 * настоящим прогрессом. Теперь серебро берётся на любом испытании, которое
 * игрок в кампании прошёл на три звезды, поэтому «все 25 серебром» = 625 очков
 * должно означать не золотой ранг, а серебряный: медали собраны, ни одного
 * оптимума не выбито.
 *
 * Отсюда шкала: 625 (всё серебро) остаётся ниже `gold`, а дальше ранг растёт
 * ровно по числу золотых медалей — каждая даёт +25 сверх серебра.
 * gold ⇒ ≥5 золотых, champion ⇒ ≥13, legend ⇒ ≥21 из 25.
 */
export const RANKS: RankDef[] = [
  { key: 'novice', points: 0 },
  { key: 'bronze', points: 150 },
  { key: 'silver', points: 400 },
  { key: 'gold', points: 750 },
  { key: 'champion', points: 950 },
  { key: 'legend', points: 1150 }
];

export function rankFor(points: number): RankDef {
  let current = RANKS[0];
  for (const r of RANKS) if (points >= r.points) current = r;
  return current;
}

/** Следующий ранг и сколько очков до него; null — уже максимум. */
export function nextRank(points: number): { rank: RankDef; remaining: number } | null {
  const next = RANKS.find((r) => r.points > points);
  return next ? { rank: next, remaining: next.points - points } : null;
}

/**
 * Записывает результат испытания в сейв-объект (мутирует переданный `medals`-map
 * через возврат нового) — вызывающий код сам решает, персистить ли. Возвращает
 * новую медаль и признак улучшения (для показа «новый рекорд»).
 */
export function bestMedal(previous: Medal, earned: Medal): Medal {
  return (Math.max(previous, earned) as Medal);
}
