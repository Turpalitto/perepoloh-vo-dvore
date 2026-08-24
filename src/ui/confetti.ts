/**
 * Конфетти победных оверлеев: CSS-частицы с рандомными цветом/позицией/
 * задержкой/вращением (переменные --x/--d/--r читает styles.css). Раньше
 * генерация была скопирована в трёх местах app.ts с одинаковым набором
 * цветов и различием только в числе частиц.
 */
const CONFETTI_COLORS = ['#e2574c', '#f6c445', '#45968f', '#3f7fd1', '#e88fb6'];

export function confettiHtml(count: number): string {
  const pieces = Array.from({ length: count }, () => {
    const c = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    return `<span style="--x:${Math.round(Math.random() * 100)}%;--d:${(Math.random() * 0.6).toFixed(2)}s;--r:${Math.round(180 + Math.random() * 420)}deg;background:${c}"></span>`;
  }).join('');
  return `<div class="confetti">${pieces}</div>`;
}
