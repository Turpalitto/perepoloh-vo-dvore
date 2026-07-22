import type { DailyLevel } from './daily';
import { generateDaily } from './daily';

interface DailyWorkerResponse {
  key: string;
  level?: DailyLevel;
  error?: string;
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  postMessage(message: DailyWorkerResponse): void;
};

workerScope.onmessage = (event) => {
  const key = event.data;
  try {
    workerScope.postMessage({ key, level: generateDaily(key) });
  } catch (error) {
    workerScope.postMessage({ key, error: error instanceof Error ? error.message : String(error) });
  }
};

