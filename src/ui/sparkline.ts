/**
 * Мини-график последних серий «Бесконечного двора» (чистая функция без DOM-зависимостей
 * кроме генерации SVG-строки). Показывается в меню рядом с лучшей серией: игрок видит
 * динамику последних заездов и цель «побей свой недавний уровень».
 *
 * Пустая история / одна серия — графика нет (неинформативно).
 */
export function endlessSparkline(history: number[] | undefined): string {
  const runs = (history ?? []).filter((n) => Number.isInteger(n) && n >= 0).slice(-10);
  if (runs.length < 2) return '';
  const max = Math.max(...runs, 1);
  const barW = 4;
  const gap = 2;
  const chartH = 14;
  const w = runs.length * (barW + gap) - gap;
  const bars = runs
    .map((n, i) => {
      const h = Math.max(n > 0 ? 2 : 1, Math.round((n / max) * chartH));
      const x = i * (barW + gap);
      const y = chartH - h;
      const last = i === runs.length - 1;
      const fill = last ? 'var(--accent-strong)' : n > 0 ? 'var(--grass-dark)' : 'rgba(61,44,30,0.25)';
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="1" fill="${fill}"/>`;
    })
    .join('');
  return `<svg class="endless-sparkline" data-testid="endless-sparkline" viewBox="0 0 ${w} ${chartH}" width="${w}" height="${chartH}" aria-hidden="true">${bars}</svg>`;
}
