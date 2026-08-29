/**
 * «Испытание деда» (Stage D) — data-model без UI. Пять личных испытаний деда,
 * каждое основано на мастер-испытании Высшей лиги, но играется с ограничением:
 * только три попытки. За первую заработанную медаль дед выдаёт бонусные
 * подсказки — однократно, что гарантируется флагом `rewarded` в сейве
 * (идемпотентность встроена в модель, как у медалей лиги).
 *
 * Модуль чистый: без DOM и без обращений к платформе. UI-проводка — отдельная
 * задача; сейв-поле `grandpaTrials` уже санитизируется и мерджится в save.ts.
 */
import type { Medal, AttemptResult } from './elite';
import { medalForAttempt } from './elite';
import { eliteChallenge } from '../levels/elite-challenges';

/** Попыток на каждое испытание деда. */
export const GRANDPA_TRIAL_ATTEMPTS = 3;

/** Одно испытание деда. */
export interface GrandpaTrialDef {
  /** Стабильный id для сейва и локализации (`grandpaTrial.{id}.*`). */
  id: string;
  /** Мастер-испытание лиги, на котором основано испытание (медали те же). */
  challengeId: number;
  /** Бонус подсказками за первую медаль. */
  rewardHints: number;
}

/**
 * Пять испытаний деда. База — каждое пятое мастер-испытание лиги
 * (5/10/15/20/25): детерминированный разброс по всей лиге, без привязки к
 * порядку добавления капстоун-испытаний 26–30.
 */
export const GRANDPA_TRIALS: readonly GrandpaTrialDef[] = [
  { id: 'grandpa-1', challengeId: 5, rewardHints: 1 },
  { id: 'grandpa-2', challengeId: 10, rewardHints: 1 },
  { id: 'grandpa-3', challengeId: 15, rewardHints: 2 },
  { id: 'grandpa-4', challengeId: 20, rewardHints: 2 },
  { id: 'grandpa-5', challengeId: 25, rewardHints: 3 }
];

/** Прогресс по одному испытанию деда (в сейве: id -> прогресс). */
export interface GrandpaTrialProgress {
  /** Израсходовано попыток (0..GRANDPA_TRIAL_ATTEMPTS). */
  attempts: number;
  /** Лучшая медаль: 0 — нет, 1..3 — бронза/серебро/золото. */
  best: number;
  /** Бонус подсказками уже выдан (однократно). */
  rewarded?: boolean;
}

/** Испытание по id (для UI). */
export function grandpaTrial(id: string): GrandpaTrialDef | undefined {
  return GRANDPA_TRIALS.find((trial) => trial.id === id);
}

/** Сколько попыток осталось (учитывает и отсутствие прогресса). */
export function grandpaAttemptsLeft(progress: GrandpaTrialProgress | undefined): number {
  return Math.max(0, GRANDPA_TRIAL_ATTEMPTS - (progress?.attempts ?? 0));
}

/** Можно ли тратить ещё одну попытку. */
export function canPlayGrandpaTrial(progress: GrandpaTrialProgress | undefined): boolean {
  return grandpaAttemptsLeft(progress) > 0;
}

/**
 * Медаль за попытку испытания деда — те же пороги, что у базового
 * мастер-испытания лиги. Неизвестный challengeId даёт 0 (модель не падает).
 */
export function grandpaTrialMedal(def: GrandpaTrialDef, result: AttemptResult): Medal {
  const challenge = eliteChallenge(def.challengeId);
  return challenge ? medalForAttempt(challenge, result) : 0;
}

/**
 * Бонус подсказок, который дед должен выдать сейчас: rewardHints — за первую
 * медаль (best был 0, стала ≥1) и только если ещё не выдавался.
 */
export function grandpaTrialReward(
  def: GrandpaTrialDef,
  progress: GrandpaTrialProgress | undefined,
  earnedMedal: Medal
): number {
  if (earnedMedal < 1) return 0;
  const hadMedal = (progress?.best ?? 0) >= 1;
  if (hadMedal || progress?.rewarded) return 0;
  return def.rewardHints;
}

/**
 * Новое состояние прогресса после попытки: попытка потрачена, медаль — максимум
 * из прежней и заработанной. Чистая функция — запись в сейв делает SaveStore.
 */
export function applyGrandpaTrialAttempt(
  progress: GrandpaTrialProgress | undefined,
  earnedMedal: Medal
): GrandpaTrialProgress {
  return {
    attempts: Math.min(GRANDPA_TRIAL_ATTEMPTS, (progress?.attempts ?? 0) + 1),
    best: Math.max(progress?.best ?? 0, earnedMedal),
    rewarded: progress?.rewarded
  };
}
