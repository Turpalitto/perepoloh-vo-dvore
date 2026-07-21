/**
 * Тонкая цветовая тонировка интерфейса по времени суток устройства.
 * Чисто атмосферный штрих — не влияет на читаемость (низкая прозрачность,
 * pointer-events отключены). Переопределяется ?daytime= для теста/QA.
 */
type Daytime = 'dawn' | 'day' | 'evening' | 'night';

const VALID: Daytime[] = ['dawn', 'day', 'evening', 'night'];

function currentDaytime(date: Date = new Date()): Daytime {
  const h = date.getHours();
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 18) return 'day';
  if (h >= 18 && h < 21) return 'evening';
  return 'night';
}

export function applyDaytime(): void {
  const override = queryParam('daytime') as Daytime | null;
  const period = override && VALID.includes(override) ? override : currentDaytime();
  document.documentElement.dataset.daytime = period;
}
import { queryParam } from '../query';
