import { describe, expect, it } from 'vitest';
import { yardSVG } from '../src/ui/yard';

describe('визуальные этапы двора', () => {
  it('оставляет стартовый двор сдержанным', () => {
    const svg = yardSVG(new Set(), 0, undefined, 0);

    expect(svg).toContain('data-yard-stage="0"');
    expect(svg).toContain('data-yard-era="0"');
    expect(svg).not.toContain('data-yard-detail="woodpile"');
    expect(svg).not.toContain('data-yard-detail="champion-arch"');
  });

  it('добавляет промежуточные детали накопительно', () => {
    const stageThree = yardSVG(new Set(), 0, undefined, 3);

    expect(stageThree).toContain('data-yard-stage="3"');
    expect(stageThree).toContain('data-yard-detail="woodpile"');
    expect(stageThree).toContain('data-yard-detail="birdhouse"');
    expect(stageThree).not.toContain('data-yard-detail="work-corner"');
  });

  it('делает финальный этап отличимым без звёздного праздника', () => {
    const finale = yardSVG(new Set(), 0, undefined, 10);

    expect(finale).toContain('data-yard-era="5"');
    expect(finale).toContain('data-yard-detail="champion-arch"');
    expect(finale).toContain('yard-champion-arch');
    expect(finale).not.toContain('fill="#fff2a8" opacity=".9"');
  });
});
