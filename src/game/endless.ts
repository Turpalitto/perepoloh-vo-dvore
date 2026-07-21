/**
 * «Бесконечный двор»: доступен после прохождения всей кампании.
 * Каждый следующий уровень генерируется плотнее и с большим шансом кнопки
 * ворот; играть можно, пока не решишь остановиться. Рекорд серии — в SaveData.
 *
 * Все уровни проверены решателем внутри findLevel: непроходимые и расклады с
 * недостижимой звездой/кнопкой отбрасываются. Сложность растёт плотностью фигур
 * и механиками (ящики, нажимная кнопка ворот), а не гонкой за большим числом
 * ходов — это держит генерацию быстрой (доли секунды) и уместно казуалу.
 * Поле всегда 6×6: генерация проверенного 7×7 в реальном времени слишком
 * медленна, а плотный 6×6 даёт достаточную вариативность.
 */
import type { LevelDef } from '../core/types';
import { GEN_6X6, GenOptions, findLevel, mulberry32 } from '../core/levelgen';

/** Тир генерации по серии: плотность фигур и шанс кнопки ворот. */
export function endlessConfig(streak: number): GenOptions {
  if (streak < 3) return { ...GEN_6X6, pieceMin: 6, pieceMax: 8, gateChance: 0 };
  if (streak < 6) return { ...GEN_6X6, pieceMin: 7, pieceMax: 9, gateChance: 0.35 };
  if (streak < 10) return { ...GEN_6X6, pieceMin: 8, pieceMax: 10, gateChance: 0.5 };
  return { ...GEN_6X6, pieceMin: 8, pieceMax: 11, gateChance: 0.5 };
}

/** Нижняя граница оптимума: мягко растёт по серии, потолок 8. */
export function endlessFloor(streak: number): number {
  return Math.min(4 + streak, 8);
}

/** streak — сколько уровней подряд уже пройдено в этом заезде (0 — первый). */
export function generateEndless(streak: number, seed: number): LevelDef {
  const opts = endlessConfig(streak);
  const floor = endlessFloor(streak);
  const rng = mulberry32(seed >>> 0);
  // Широкая верхняя граница: берём первый проходимый расклад не легче floor —
  // попадание раннее, генерация быстрая.
  const found = findLevel(rng, opts, floor, floor + 40, 15_000, 200);
  if (!found) throw new Error('не удалось сгенерировать уровень бесконечного двора');
  const level: LevelDef = found.level;
  level.id = 0;
  level.name = `Бесконечный двор · ${streak + 1}`;
  level.par = found.optimal;
  level.par2 = Math.max(found.optimal + 2, found.withStar);
  const kinds = new Set(level.pieces.map((p) => p.kind));
  level.mechanics = (['truck', 'tractor', 'crate'] as const).filter((k) => kinds.has(k));
  if (level.star) level.mechanics.push('star');
  if (level.gateSwitch) level.mechanics.push('gate-switch');
  return level;
}
