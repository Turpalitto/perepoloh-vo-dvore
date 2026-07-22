/**
 * Реестр загрузки реальных аудиосэмплов с graceful fallback на синтез.
 * Файлов сейчас нет (см. AUDIO_ASSETS_REQUIRED.md) — это ожидаемо: каждая
 * загрузка честно провалится и молча откатится на WebAudio-синтез в GameAudio.
 * Инъекция fetch/decode делает модуль тестируемым без реального AudioContext.
 */

/** Ключи, для которых предусмотрены реальные файлы (таблица в AUDIO_ASSETS_REQUIRED.md). */
export type SoundFileKey =
  | 'engine_idle'
  | 'engine_low'
  | 'engine_high'
  | 'tractor_start'
  | 'tractor_idle'
  | 'tractor_move'
  | 'gate_creak'
  | 'button_click'
  | 'wood_hit'
  | 'metal_hit'
  | 'crate_slide'
  | 'chickens_scatter'
  | 'dog_bark'
  | 'grandpa_mumble_1'
  | 'grandpa_mumble_2'
  | 'grandpa_mumble_3'
  | 'star_collect'
  | 'boss_phase'
  | 'victory_drive';

/**
 * URL по конвенции: <base>audio/<key>.mp3, файлы ищутся в public/audio/.
 * base-aware (import.meta.env.BASE_URL), а не абсолютный /audio/... — игра
 * собирается с `base: './'` и может быть размещена в подкаталоге (каталожное
 * размещение на Яндекс Играх); абсолютный путь от корня домена сломался бы там.
 * BASE_URL у Vite всегда оканчивается на '/', поэтому склейка без доп. слэша.
 */
const AUDIO_BASE = `${import.meta.env.BASE_URL}audio/`;

export const SOUND_FILE_URLS: Record<SoundFileKey, string> = {
  engine_idle: `${AUDIO_BASE}engine_idle.mp3`,
  engine_low: `${AUDIO_BASE}engine_low.mp3`,
  engine_high: `${AUDIO_BASE}engine_high.mp3`,
  tractor_start: `${AUDIO_BASE}tractor_start.mp3`,
  tractor_idle: `${AUDIO_BASE}tractor_idle.mp3`,
  tractor_move: `${AUDIO_BASE}tractor_move.mp3`,
  gate_creak: `${AUDIO_BASE}gate_creak.mp3`,
  button_click: `${AUDIO_BASE}button_click.mp3`,
  wood_hit: `${AUDIO_BASE}wood_hit.mp3`,
  metal_hit: `${AUDIO_BASE}metal_hit.mp3`,
  crate_slide: `${AUDIO_BASE}crate_slide.mp3`,
  chickens_scatter: `${AUDIO_BASE}chickens_scatter.mp3`,
  dog_bark: `${AUDIO_BASE}dog_bark.mp3`,
  grandpa_mumble_1: `${AUDIO_BASE}grandpa_mumble_1.mp3`,
  grandpa_mumble_2: `${AUDIO_BASE}grandpa_mumble_2.mp3`,
  grandpa_mumble_3: `${AUDIO_BASE}grandpa_mumble_3.mp3`,
  star_collect: `${AUDIO_BASE}star_collect.mp3`,
  boss_phase: `${AUDIO_BASE}boss_phase.mp3`,
  victory_drive: `${AUDIO_BASE}victory_drive.mp3`
};

/** Инъекция сетевого слоя и декодера — тестируется без реального браузера. */
export interface SampleFetcher {
  fetchArrayBuffer(url: string): Promise<ArrayBuffer>;
  decode(data: ArrayBuffer): Promise<AudioBuffer>;
}

/**
 * Кэш загруженных сэмплов с защитой от повторных попыток и повторного спама
 * в консоль. Один и тот же отсутствующий файл логируется максимум один раз
 * за сессию, и только если `warnMissing` включён (dev-режим — см. GameAudio).
 */
export class SampleLoader {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly failed = new Set<string>();
  private readonly warned = new Set<string>();
  private readonly pending = new Map<string, Promise<AudioBuffer | null>>();

  constructor(
    private readonly fetcher: SampleFetcher,
    private readonly warnMissing: boolean
  ) {}

  /** Уже загруженный буфер, если есть (синхронно, для аудио-цикла без await). */
  get(key: string): AudioBuffer | undefined {
    return this.buffers.get(key);
  }

  hasFailed(key: string): boolean {
    return this.failed.has(key);
  }

  /** Запускает (или переиспользует) загрузку; при неудаче — null, без повторного спама в консоль. */
  async load(key: string, url: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(key);
    if (cached) return cached;
    if (this.failed.has(key)) return null;
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;
    const promise = this.doLoad(key, url);
    this.pending.set(key, promise);
    return promise;
  }

  private async doLoad(key: string, url: string): Promise<AudioBuffer | null> {
    try {
      const data = await this.fetcher.fetchArrayBuffer(url);
      const buffer = await this.fetcher.decode(data);
      this.buffers.set(key, buffer);
      return buffer;
    } catch (e) {
      this.failed.add(key);
      if (this.warnMissing && !this.warned.has(key)) {
        this.warned.add(key);
        console.warn(`[audio] "${key}" (${url}) недоступен — используется синтезированный fallback`, e);
      }
      return null;
    } finally {
      this.pending.delete(key);
    }
  }
}

/** Реальный fetcher поверх Web API — используется в GameAudio при наличии AudioContext. */
export function createBrowserFetcher(ctx: AudioContext): SampleFetcher {
  return {
    async fetchArrayBuffer(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    },
    decode(data) {
      return ctx.decodeAudioData(data);
    }
  };
}
