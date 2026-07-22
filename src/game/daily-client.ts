import type { DailyLevel } from './daily';
import { generateDaily } from './daily';

interface DailyWorkerResponse {
  key: string;
  level?: DailyLevel;
  error?: string;
}

/** Совместимое с ранними Safari копирование сериализуемого LevelDef. */
function cloneLevel(level: DailyLevel): DailyLevel {
  return {
    ...level,
    exit: { ...level.exit },
    pieces: level.pieces.map((piece) => ({ ...piece })),
    walls: level.walls?.map((wall) => ({ ...wall })),
    star: level.star ? { ...level.star } : undefined,
    mechanics: [...level.mechanics]
  };
}

/** Генерирует ежедневный уровень вне UI-потока, с синхронным fallback для старых браузеров. */
export class DailyLevelService {
  private worker: Worker | null = null;
  private readonly cache = new Map<string, DailyLevel>();
  private readonly pending = new Map<
    string,
    { resolve: (level: DailyLevel) => void; reject: (error: Error) => void }
  >();

  constructor() {
    // Legacy-бандл работает в Safari/iOS 9, где module Worker не поддержан:
    // не провоцируем синтаксическую ошибку в консоли, используем fallback.
    if (import.meta.env.LEGACY || typeof Worker === 'undefined') return;
    try {
      this.worker = new Worker(new URL('./daily.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<DailyWorkerResponse>) => {
        const { key, level, error } = event.data;
        const request = this.pending.get(key);
        if (!request) return;
        this.pending.delete(key);
        if (level) {
          this.cache.set(key, level);
          request.resolve(cloneLevel(level));
        } else {
          request.reject(new Error(error ?? 'Не удалось создать уровень дня'));
        }
      };
      this.worker.onerror = () => {
        this.worker?.terminate();
        this.worker = null;
        for (const [key, request] of this.pending) {
          try {
            const level = generateDaily(key);
            this.cache.set(key, level);
            request.resolve(cloneLevel(level));
          } catch (error) {
            request.reject(error instanceof Error ? error : new Error(String(error)));
          }
        }
        this.pending.clear();
      };
    } catch {
      this.worker = null;
    }
  }

  get(key: string): Promise<DailyLevel> {
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cloneLevel(cached));
    const existing = this.pending.get(key);
    if (existing) {
      return new Promise((resolve, reject) => {
        const poll = () => {
          const ready = this.cache.get(key);
          if (ready) resolve(cloneLevel(ready));
          else if (!this.pending.has(key)) reject(new Error('Не удалось создать уровень дня'));
          else window.setTimeout(poll, 20);
        };
        poll();
      });
    }
    if (!this.worker) {
      return new Promise((resolve, reject) => {
        // Даём браузеру сначала отрисовать состояние «Готовим уровень…».
        window.setTimeout(() => {
          try {
            const level = generateDaily(key);
            this.cache.set(key, level);
            resolve(cloneLevel(level));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      });
    }
    return new Promise((resolve, reject) => {
      this.pending.set(key, { resolve, reject });
      this.worker!.postMessage(key);
    });
  }

  prewarm(key: string): void {
    if (!this.worker) return;
    void this.get(key).catch((error) => console.warn('прогрев уровня дня не удался:', error));
  }
}
