/**
 * Мастер-испытания «Высшей лиги» — data-driven конфигурация поверх лучших
 * уровней кампании. Мы НЕ копируем данные уровня: испытание ссылается на
 * sourceLevelId, а пороги медалей ДЕРИВИРУЮТСЯ из par/par2 этого уровня, поэтому
 * золото всегда достижимо (gold.maxMoves = оптимум решателя), а серебро — со
 * звездой в мягком лимите. Детерминировано и проверяется тестом.
 */
import levelsJson from './levels.json';
import type { LevelDef } from '../core/types';
import type { EliteGoal } from '../game/elite';

const LEVELS = levelsJson as LevelDef[];

/** Модификатор, применяемый на время испытания (подмножество DailyModifier). */
export type EliteModifier = 'none' | 'noHints' | 'noUndo';

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
 * Кураторский список: уровень-источник + модификатор-«вкус». Распределён по всей
 * кампании (лёгкие → боссы), чередует чистое прохождение / без отмены / без
 * подсказки. Пороги задаются не здесь, а выводятся из уровня (см. buildGoals).
 */
const CURATED: Array<{ source: number; modifier: EliteModifier }> = [
  { source: 8, modifier: 'none' },
  { source: 12, modifier: 'noUndo' },
  { source: 15, modifier: 'none' },
  { source: 18, modifier: 'noHints' },
  { source: 22, modifier: 'none' },
  { source: 25, modifier: 'noUndo' },
  { source: 28, modifier: 'none' },
  { source: 31, modifier: 'noHints' },
  { source: 35, modifier: 'none' },
  { source: 38, modifier: 'noUndo' },
  { source: 42, modifier: 'none' },
  { source: 45, modifier: 'noHints' },
  { source: 50, modifier: 'none' },
  { source: 55, modifier: 'noUndo' },
  { source: 60, modifier: 'none' },
  { source: 64, modifier: 'noHints' },
  { source: 68, modifier: 'none' },
  { source: 72, modifier: 'noUndo' },
  { source: 77, modifier: 'none' },
  { source: 81, modifier: 'noHints' },
  { source: 88, modifier: 'none' },
  { source: 92, modifier: 'noUndo' },
  { source: 95, modifier: 'none' },
  { source: 98, modifier: 'noHints' },
  { source: 100, modifier: 'none' }
];

/**
 * Пороги из уровня: bronze — просто пройти (щедрый лимит), silver — со звездой в
 * пределах par2+2, gold — оптимум решателя (par) без подсказки. При модификаторе
 * условие дублируется в золоте, чтобы описание было честным.
 */
function buildGoals(level: LevelDef, modifier: EliteModifier): Pick<EliteChallenge, 'bronze' | 'silver' | 'gold'> {
  const opt = level.par;
  const cap = level.par2;
  const hasStar = level.star !== undefined;
  const bronze: EliteGoal = { maxMoves: cap + 8 };
  const silver: EliteGoal = { maxMoves: cap + 2, requireStar: hasStar || undefined };
  const gold: EliteGoal = {
    maxMoves: opt,
    noHint: true,
    noUndo: modifier === 'noUndo' || undefined
  };
  return { bronze, silver, gold };
}

export const ELITE_CHALLENGES: EliteChallenge[] = CURATED.map((entry, index) => {
  const level = LEVELS.find((l) => l.id === entry.source);
  if (!level) throw new Error(`Мастер-испытание ссылается на несуществующий уровень ${entry.source}`);
  return { id: index + 1, sourceLevelId: entry.source, modifier: entry.modifier, ...buildGoals(level, entry.modifier) };
});

export function eliteChallenge(id: number): EliteChallenge | undefined {
  return ELITE_CHALLENGES.find((c) => c.id === id);
}

export function sourceLevel(challenge: EliteChallenge): LevelDef {
  return LEVELS.find((l) => l.id === challenge.sourceLevelId)!;
}
