/**
 * Все звуки синтезируются WebAudio — ассеты не нужны.
 * Контекст создаётся лениво по первому пользовательскому вводу.
 */
export type SoundName =
  | 'click'
  | 'pick'
  | 'move'
  | 'thud'
  | 'star'
  | 'switch'
  | 'gate'
  | 'win'
  | 'honk'
  | 'cluck'
  | 'bark'
  | 'meow'
  | 'undo'
  | 'exitRev'
  | 'grandpa';

/** Лёгкая рандомизация высоты, чтобы звуки не были «из калькулятора». */
const vary = (f: number) => f * (0.95 + Math.random() * 0.1);

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private ducked = false;
  private hidden = false;
  private ambientStarted = false;
  private engine: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicBar = 0;
  private mood: 'calm' | 'tense' = 'calm';

  constructor(
    public enabled: boolean,
    public musicEnabled: boolean
  ) {}

  /** Вызывать по первому pointerdown — разблокирует автоплей. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null; // без звука игра остаётся играбельной
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  setMusicEnabled(on: boolean): void {
    this.musicEnabled = on;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  /** Меняет настроение уже играющей темы: спокойный двор или напряжённый босс. */
  setMood(tense: boolean): void {
    this.mood = tense ? 'tense' : 'calm';
  }

  private applyMasterGain(): void {
    if (this.master) this.master.gain.value = this.ducked || this.hidden ? 0 : 0.5;
  }

  /** Временный мьют на время рекламы (не трогает пользовательскую настройку). */
  duck(on: boolean): void {
    this.ducked = on;
    this.applyMasterGain();
  }

  /** Требование платформы: при сворачивании страницы звук останавливается. */
  setHidden(on: boolean): void {
    this.hidden = on;
    this.applyMasterGain();
  }

  /** Летний двор: редкое щебетание птиц фоном. */
  startAmbient(): void {
    if (this.ambientStarted) return;
    this.ambientStarted = true;
    const loop = () => {
      window.setTimeout(loop, 3500 + Math.random() * 6500);
      if (!this.enabled || this.ducked || !this.ctx) return;
      const base = 2200 + Math.random() * 1100;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        this.tone(base * (0.95 + Math.random() * 0.12), 0.09, 'sine', 0.028, i * 0.11, base * 1.25);
      }
    };
    window.setTimeout(loop, 1500);
  }

  /**
   * Генеративная фоновая музыка: тихий мажорный пэд + редкие пентатонические
   * «щипки». Без ассетов, не зацикленная — не надоедает.
   */
  startMusic(): void {
    if (!this.musicEnabled || !this.ctx || !this.master || this.musicTimer !== null) return;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    // Спокойный двор: мягкий мажор. Напряжённый босс: минор пониже и чаще щипки.
    const calmChords: number[][] = [
      [130.8, 196.0, 329.6], // C
      [110.0, 164.8, 261.6], // Am
      [87.3, 174.6, 261.6], // F
      [98.0, 196.0, 293.7] // G
    ];
    const tenseChords: number[][] = [
      [110.0, 164.8, 261.6], // Am
      [98.0, 146.8, 233.1], // Gm
      [87.3, 130.8, 207.7], // Fm(ish)
      [103.8, 155.6, 246.9] // Ab-ish
    ];
    const calmScale = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3]; // C-пентатоника+
    const tenseScale = [220.0, 246.9, 261.6, 311.1, 349.2, 415.3, 440.0, 493.9]; // ниже и минорнее
    let noteIdx = 3;
    const playBar = () => {
      const tense = this.mood === 'tense';
      const BAR = tense ? 1.9 : 2.6;
      this.musicTimer = window.setTimeout(playBar, BAR * 1000);
      if (!this.ctx || !this.musicGain || this.ducked || !this.musicEnabled) return;
      const chords = tense ? tenseChords : calmChords;
      const scale = tense ? tenseScale : calmScale;
      const chord = chords[Math.floor(this.musicBar / 2) % chords.length];
      this.musicBar++;
      // пэд: два мягких голоса аккорда
      for (const f of chord.slice(0, 2)) {
        this.padTone(f, BAR * 1.05, tense ? 0.065 : 0.05);
      }
      // 1–3 щипка мелодии случайным блужданием по ладу (в напряжённом режиме — чаще и гуще)
      const plucks = (tense ? 2 : 1) + Math.floor(Math.random() * 3);
      for (let i = 0; i < plucks; i++) {
        noteIdx = Math.min(scale.length - 1, Math.max(0, noteIdx + (Math.floor(Math.random() * 5) - 2)));
        if (Math.random() < (tense ? 0.85 : 0.75)) {
          this.pluckTone(scale[noteIdx], 0.2 + Math.random() * (BAR * 0.55));
        }
      }
    };
    playBar();
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.4);
      const g = this.musicGain;
      window.setTimeout(() => g.disconnect(), 600);
      this.musicGain = null;
    }
  }

  private padTone(freq: number, dur: number, vol: number): void {
    if (!this.ctx || !this.musicGain) return;
    const t0 = this.ctx.currentTime;
    for (const detune of [-4, 4]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + dur * 0.35);
      g.gain.linearRampToValueAtTime(0, t0 + dur);
      osc.connect(g).connect(this.musicGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }
  }

  private pluckTone(freq: number, at: number): void {
    if (!this.ctx || !this.musicGain) return;
    const t0 = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq * (0.998 + Math.random() * 0.004);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.11, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
    osc.connect(g).connect(this.musicGain);
    osc.start(t0);
    osc.stop(t0 + 0.85);
  }

  /** Урчание мотора, пока игрок тянет машину. */
  engineStart(): void {
    if (!this.enabled || !this.ctx || !this.master || this.engine) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 52 + Math.random() * 8;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 9;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 5;
    lfo.connect(lfoGain).connect(osc.frequency);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 0.12);
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start();
    lfo.start();
    this.engine = { osc, lfo, gain };
  }

  engineStop(): void {
    if (!this.engine || !this.ctx) return;
    const { osc, lfo, gain } = this.engine;
    this.engine = null;
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.15);
    osc.stop(this.ctx.currentTime + 0.2);
    lfo.stop(this.ctx.currentTime + 0.2);
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    at = 0,
    slideTo?: number
  ): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, filterFreq: number, at = 0, sweepTo?: number): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(filterFreq, t0);
    if (sweepTo !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(sweepTo, 1), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random(), dur + 0.05);
  }

  /** Шорох шин по гравию: нарастает, тянется, затем оседает — не щелчок. */
  private gravelRoll(dur: number, vol: number): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1500, t0);
    f.frequency.exponentialRampToValueAtTime(480, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + dur * 0.28);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random(), dur + 0.05);
  }

  play(name: SoundName): void {
    if (!this.enabled || !this.ctx) return;
    switch (name) {
      case 'click':
        this.tone(660, 0.06, 'square', 0.12);
        break;
      case 'pick':
        this.tone(vary(300), 0.08, 'triangle', 0.2, 0, 440);
        break;
      case 'move':
        this.gravelRoll(vary(0.34), 0.17);
        break;
      case 'undo':
        this.tone(440, 0.08, 'triangle', 0.16, 0, 300);
        break;
      case 'thud':
        this.tone(vary(95), 0.1, 'sine', 0.35, 0, 60);
        this.noise(0.07, 0.12, 400);
        break;
      case 'bark':
        this.tone(150, 0.08, 'square', 0.22, 0, 95);
        this.tone(140, 0.09, 'square', 0.22, 0.13, 88);
        break;
      case 'meow':
        this.tone(620, 0.28, 'sine', 0.12, 0, 330);
        break;
      case 'star':
        this.tone(1319, 0.09, 'sine', 0.2);
        this.tone(1760, 0.16, 'sine', 0.2, 0.08);
        break;
      case 'switch':
        this.tone(420, 0.08, 'square', 0.12, 0, 620);
        this.tone(840, 0.14, 'sine', 0.16, 0.08, 1040);
        break;
      case 'gate':
        this.tone(200, 0.34, 'sawtooth', 0.055, 0, 300);
        this.noise(0.32, 0.07, 900, 0, 260);
        break;
      case 'honk':
        this.tone(392, 0.14, 'square', 0.16);
        this.tone(494, 0.2, 'square', 0.16, 0.12);
        break;
      case 'exitRev':
        // Прощальный рёв мотора на выезде за ворота: sawtooth-свип вверх по
        // тону (160→420Гц) — в отличие от тихого фонового гула engineStart()
        // (52-60Гц, рассчитан на долгий drag), этот громче и в среднем
        // диапазоне, чтобы не тонуть под honk и быть слышным на любых динамиках.
        this.tone(160, 0.5, 'sawtooth', 0.16, 0, 420);
        this.noise(0.4, 0.09, 1000, 0.03, 2200);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.2, i * 0.11));
        break;
      case 'grandpa': {
        // Короткое добродушное «бормотание» деда: пара низких слогов с лёгкой
        // вариацией высоты — узнаётся как «дед сказал», не мешает музыке.
        const base = 138 + Math.random() * 26;
        this.tone(base, 0.11, 'sawtooth', 0.05, 0, base * 0.82);
        this.tone(base * 1.18, 0.1, 'sawtooth', 0.045, 0.12, base * 0.95);
        break;
      }
      case 'cluck': {
        const base = 700 + Math.random() * 200;
        this.tone(base, 0.045, 'square', 0.05, 0, base * 0.8);
        this.tone(base * 0.92, 0.045, 'square', 0.05, 0.07, base * 0.75);
        this.tone(base * 1.35, 0.065, 'square', 0.06, 0.16, base * 1.1);
        break;
      }
    }
  }
}
