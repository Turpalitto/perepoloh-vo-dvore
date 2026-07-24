/**
 * Dev-only редактор уровней. Доступен только из активного QA-режима
 * (?qaTools=1&qa=1 в dev/e2e-сборках): прогресс изолирован, в production
 * модуль не попадает (динамический импорт за той же гардой, что и qa-mode).
 *
 * Редактирование — JSON с живым превью; проверки — те же модули, что и в CI:
 * validator, solver, difficulty, canonical. Undo/Redo текста — нативные (Ctrl+Z).
 */
import levelsJson from '../levels/levels.json';
import type { LevelDef } from '../core/types';
import { validateLevel } from '../core/validator';
import { solve } from '../core/solver';
import { analyzeDifficulty } from '../core/difficulty';
import { findSimilarLevels } from '../core/canonical';
import { levelThumbnail } from './thumbnail';

const DRAFT_KEY = 'parkovka.editor.draft.v1';
const CAMPAIGN = levelsJson as LevelDef[];

const STARTER: LevelDef = {
  id: 900,
  name: 'Черновик',
  width: 6,
  height: 6,
  exit: { side: 'right', index: 2 },
  pieces: [
    { id: 'T', kind: 'target', x: 0, y: 2, len: 2, dir: 'h' },
    { id: 'A', kind: 'car', x: 3, y: 1, len: 2, dir: 'v' }
  ],
  par: 1,
  par2: 2,
  difficulty: 'easy',
  mechanics: []
};

export interface EditorHooks {
  playCustomLevel: (level: LevelDef) => void;
}

function parseLevel(text: string): { level: LevelDef | null; error: string | null } {
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null) return { level: null, error: 'JSON должен быть объектом уровня' };
    return { level: raw as LevelDef, error: null };
  } catch (e) {
    return { level: null, error: `JSON не разбирается: ${(e as Error).message}` };
  }
}

export function openLevelEditor(hooks: EditorHooks): void {
  if (document.querySelector('[data-testid=editor-panel]')) return;
  const panel = document.createElement('div');
  panel.setAttribute('data-testid', 'editor-panel');
  Object.assign(panel.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '60',
    background: 'rgba(61, 44, 30, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px'
  });
  panel.innerHTML = `
    <div style="background:#fff7e6;border-radius:16px;max-width:760px;width:100%;max-height:94vh;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px">
      <b style="font-size:17px">🧱 Редактор уровня (QA)</b>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <textarea data-testid="editor-json" spellcheck="false"
          style="flex:1 1 320px;min-height:260px;font:12px/1.4 monospace;border:2px solid #b98d55;border-radius:10px;padding:8px"></textarea>
        <div data-testid="editor-preview" style="flex:0 0 220px;align-self:flex-start"></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" data-testid="editor-validate">Проверить</button>
        <button class="btn" data-testid="editor-solve">Решить</button>
        <button class="btn" data-testid="editor-difficulty">Сложность</button>
        <button class="btn" data-testid="editor-similar">Дубликаты</button>
        <button class="btn btn-primary" data-testid="editor-play">Играть</button>
        <button class="btn" data-testid="editor-close">Закрыть</button>
      </div>
      <pre data-testid="editor-output" style="margin:0;white-space:pre-wrap;font:12px/1.45 monospace;background:rgba(61,44,30,.08);border-radius:10px;padding:8px;min-height:56px"></pre>
    </div>`;
  document.body.appendChild(panel);

  const textarea = panel.querySelector<HTMLTextAreaElement>('[data-testid=editor-json]')!;
  const output = panel.querySelector<HTMLElement>('[data-testid=editor-output]')!;
  const preview = panel.querySelector<HTMLElement>('[data-testid=editor-preview]')!;
  const q = (sel: string) => panel.querySelector<HTMLButtonElement>(sel)!;

  let draft: string | null = null;
  try {
    draft = localStorage.getItem(DRAFT_KEY);
  } catch {
    // приватный режим: черновик не переживёт сессию, редактор всё равно работает
  }
  textarea.value = draft ?? JSON.stringify(STARTER, null, 2);

  const say = (lines: string[]) => {
    output.textContent = lines.join('\n');
  };
  const current = (): LevelDef | null => {
    const { level, error } = parseLevel(textarea.value);
    if (error) say([`✗ ${error}`]);
    return level;
  };
  const refreshPreview = () => {
    const { level } = parseLevel(textarea.value);
    if (!level) {
      preview.innerHTML = '';
      return;
    }
    try {
      preview.innerHTML = levelThumbnail(level);
    } catch {
      preview.innerHTML = ''; // превью недоступно, пока структура неполна
    }
  };
  textarea.addEventListener('input', () => {
    try {
      localStorage.setItem(DRAFT_KEY, textarea.value);
    } catch {
      // приватный режим — черновик только в памяти
    }
    refreshPreview();
  });
  refreshPreview();

  q('[data-testid=editor-validate]').addEventListener('click', () => {
    const level = current();
    if (!level) return;
    const errors = validateLevel(level);
    say(errors.length === 0 ? ['✓ Уровень валиден'] : errors.map((e) => `✗ ${e}`));
  });

  q('[data-testid=editor-solve]').addEventListener('click', () => {
    const level = current();
    if (!level) return;
    const t0 = performance.now();
    const res = solve(level, { stateLimit: 200_000 });
    const ms = Math.round(performance.now() - t0);
    if (res.exhausted) {
      say([`⏱ Лимит поиска (200k состояний, ${ms}мс) — решаемость не доказана и не опровергнута`]);
      return;
    }
    if (!res.solvable) {
      say([`✗ Уровень непроходим (${ms}мс)`]);
      return;
    }
    const lines = [`✓ Решается за ${res.optimal} ходов (${ms}мс)`];
    if (level.star) {
      const withStar = solve(level, { requireStar: true, stateLimit: 200_000 });
      lines.push(
        withStar.exhausted
          ? '⏱ Поиск со звездой упёрся в лимит'
          : withStar.solvable
            ? `✓ Со звездой: ${withStar.optimal} ходов`
            : '✗ Звезда недостижима'
      );
    }
    lines.push(`Путь: ${res.path.map((m) => `${level.pieces[m.piece].id}${m.dx > 0 ? '→' : m.dx < 0 ? '←' : m.dy > 0 ? '↓' : '↑'}${m.steps}`).join(' ')}`);
    say(lines);
  });

  q('[data-testid=editor-difficulty]').addEventListener('click', () => {
    const level = current();
    if (!level) return;
    const res = analyzeDifficulty(level, { stateLimit: 120_000 });
    say([
      `Балл ${res.score} · ${res.tier}${res.metrics.complete ? '' : ' (граф оборван лимитом)'}`,
      ...res.explanation.map((e) => `· ${e}`)
    ]);
  });

  q('[data-testid=editor-similar]').addEventListener('click', () => {
    const level = current();
    if (!level) return;
    const pairs = findSimilarLevels([...CAMPAIGN, { ...level, id: -1 }], 0.85).filter((p) => p.a === -1 || p.b === -1);
    say(
      pairs.length === 0
        ? ['✓ Похожих уровней в кампании нет']
        : pairs.map((p) => `≈ уровень ${p.a === -1 ? p.b : p.a}: ${(p.similarity * 100).toFixed(0)}% — ${p.reason}`)
    );
  });

  q('[data-testid=editor-play]').addEventListener('click', () => {
    const level = current();
    if (!level) return;
    const errors = validateLevel(level, { withSolver: true });
    if (errors.length > 0) {
      say(['Запуск отменён — сначала исправь ошибки:', ...errors.map((e) => `✗ ${e}`)]);
      return;
    }
    panel.remove();
    hooks.playCustomLevel(level);
  });

  q('[data-testid=editor-close]').addEventListener('click', () => panel.remove());
}
