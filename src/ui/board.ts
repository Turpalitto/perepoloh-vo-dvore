/**
 * SVG-поле: рендер, drag-управление (мышь и палец), анимации.
 * Логику ходов считает core; здесь только представление и ввод.
 */
import type { LevelDef } from '../core/types';
import {
  GameState,
  MoveResult,
  applyMove,
  buildGrid,
  exitSteps,
  exitVector,
  gateOpen,
  maxSteps,
  pieceCells,
  targetIndex
} from '../core/game';
import type { SolveMove } from '../core/solver';
import { t } from '../game/i18n';
import { CELL, chickenArt, fieldChickenArt, iceArt, kindBadge, pieceArt, plankArt, starArt, wallArt, wellArt } from './sprites';

const M = 90; // поля вокруг двора: забор, куры

export interface BoardEvents {
  onPick(piece: number): void;
  /**
   * Скорость перетаскивания 0..1 (сглаженная) — питает кроссфейд лупов тяги.
   * Опционален: старые подписчики и тесты не обязаны его знать.
   */
  onDragSpeed?(intensity: number): void;
  /** Палец/мышь отпущены (независимо от того, был ли ход). */
  onRelease(): void;
  /** Ход применён; state уже обновлён внутри BoardView. */
  onCommit(res: MoveResult, piece: number): void;
  onBump(): void;
  /**
   * Ход отклонён именно льдом: ехать было куда, но ни одна точка остановки в
   * эту сторону не легальна. Отдельно от `onBump`, потому что игроку нужно
   * объяснение — упор в стену и запрет остановки выглядят одинаково.
   */
  onIceBlocked(): void;
  onGateSwitch(): void;
  onGateOpen(): void;
  /**
   * Ворота захлопнулись. Возможно только в режиме `holdType: 'held'` — в режиме
   * `once` открытые ворота уже не закрываются никогда. Отдельное событие,
   * потому что закрытие поверх ещё не выехавшей машины это ключевой момент
   * механики, а раньше он проходил вообще без звука.
   */
  onGateClose(): void;
  /** Хрупкая доска сломалась этим ходом (клетка стала стеной навсегда). */
  onPlankBroken(): void;
  /** Курица перелетела на другую клетку своего цикла. */
  onChickenHop(): void;
  /** Игрок тапнул по объекту и получил пояснение правила. */
  onExplain(): void;
  /** Анимация выезда закончилась. */
  onExitDone(): void;
}

interface DragInfo {
  idx: number;
  startX: number;
  startY: number;
  axis: 'x' | 'y' | null;
  neg: { x: number; y: number };
  pos: { x: number; y: number };
  /** Видимый максимум вперёд (включая выезд за ворота). */
  visPos: { x: number; y: number };
  /** Максимум клеток внутри поля (для снапа). */
  inBoardPos: { x: number; y: number };
  exitAxis: 'x' | 'y' | null;
  exitSign: number;
  exitK: number;
  bumpedPos: boolean;
  bumpedNeg: boolean;
  moved: boolean;
  /** Сглаженная скорость drag'а 0..1 и метка времени последнего события. */
  speed?: number;
  lastOff?: number;
  lastMoveAt?: number;
}

interface InputPoint {
  clientX: number;
  clientY: number;
  target: EventTarget | null;
  pointerId?: number;
  preventDefault(): void;
}

interface TVMoveInfo {
  idx: number;
  axis: 'x' | 'y' | null;
  offset: number;
  neg: { x: number; y: number };
  pos: { x: number; y: number };
  inNeg: { x: number; y: number };
  inPos: { x: number; y: number };
  exitAxis: 'x' | 'y' | null;
  exitSign: number;
  exitK: number;
}

/**
 * Экранирование для текста, вставляемого в SVG-разметку через innerHTML.
 * Тексты правил приходят из словаря локализации, то есть свои, — но амперсанд
 * или угловая скобка в переводе сломали бы разметку молча.
 */
function escapeXML(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class BoardView {
  readonly svg: SVGSVGElement;
  state: GameState;
  interactive = true;

  private readonly level: LevelDef;
  private readonly events: BoardEvents;
  private pieceEls: SVGGElement[] = [];
  private starEl: SVGGElement | null = null;
  private gateSwitchEl: SVGGElement | null = null;
  private tracksLayer!: SVGGElement;
  private rangeLayer!: SVGGElement;
  private hintLayer!: SVGGElement;
  private ruleLayer!: SVGGElement;
  private ruleTimer: number | null = null;
  private chickenEls: SVGGElement[] = [];
  private plankEls: SVGGElement[] = [];
  private fieldChickenEls: { current: SVGGElement; next: SVGGElement }[] = [];
  private gateOpen = false;
  private drag: DragInfo | null = null;
  private animLock = false;
  private exitTimer: number | null = null;
  private readonly usingPointerEvents = typeof window.PointerEvent === 'function';
  private lastTouchAt = 0;
  private selectedPiece = 0;
  private tvMove: TVMoveInfo | null = null;

  constructor(host: HTMLElement, level: LevelDef, state: GameState, events: BoardEvents) {
    this.level = level;
    this.state = state;
    this.events = events;
    const vbW = level.width * CELL + 2 * M;
    const vbH = level.height * CELL + 2 * M;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `${-M} ${-M} ${vbW} ${vbH}`);
    svg.classList.add('board');
    svg.setAttribute('data-testid', 'board');
    svg.setAttribute('data-tv-default', 'true');
    svg.setAttribute('tabindex', '0');
    svg.setAttribute('role', 'application');
    svg.setAttribute('aria-label', t('tv.boardLabel'));
    host.appendChild(svg);
    this.svg = svg;
    this.selectedPiece = Math.max(0, targetIndex(level));
    this.build();
    this.updateTVSelection();
    this.updateGateSwitch(false);
    this.updateGate(false);
    // хук для e2e-тестов и отладки
    // лонгтап на поле не должен вызывать контекстное меню (требование платформы)
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    if (this.usingPointerEvents) {
      svg.addEventListener('pointerdown', this.onPointerDown);
      svg.addEventListener('pointermove', this.onPointerMove);
      svg.addEventListener('pointerup', this.onPointerUp);
      svg.addEventListener('pointercancel', this.onPointerUp);
    } else {
      // Safari/iOS до Pointer Events: полноценный touch + mouse fallback.
      svg.addEventListener('touchstart', this.onTouchStart, { passive: false });
      svg.addEventListener('touchmove', this.onTouchMove, { passive: false });
      svg.addEventListener('touchend', this.onTouchEnd, { passive: false });
      svg.addEventListener('touchcancel', this.onTouchEnd, { passive: false });
      svg.addEventListener('mousedown', this.onMouseDown);
      window.addEventListener('mousemove', this.onMouseMove);
      window.addEventListener('mouseup', this.onMouseUp);
    }
    svg.addEventListener('keydown', this.onTVKeyDown);
    svg.addEventListener('focus', this.onTVFocus);
    window.addEventListener('blur', this.onWindowBlur);
  }

  destroy(): void {
    window.removeEventListener('blur', this.onWindowBlur);
    if (this.usingPointerEvents) {
      this.svg.removeEventListener('pointerdown', this.onPointerDown);
      this.svg.removeEventListener('pointermove', this.onPointerMove);
      this.svg.removeEventListener('pointerup', this.onPointerUp);
      this.svg.removeEventListener('pointercancel', this.onPointerUp);
    } else {
      this.svg.removeEventListener('touchstart', this.onTouchStart);
      this.svg.removeEventListener('touchmove', this.onTouchMove);
      this.svg.removeEventListener('touchend', this.onTouchEnd);
      this.svg.removeEventListener('touchcancel', this.onTouchEnd);
      this.svg.removeEventListener('mousedown', this.onMouseDown);
      window.removeEventListener('mousemove', this.onMouseMove);
      window.removeEventListener('mouseup', this.onMouseUp);
    }
    if (this.exitTimer !== null) clearTimeout(this.exitTimer);
    if (this.ruleTimer !== null) clearTimeout(this.ruleTimer);
    this.svg.removeEventListener('keydown', this.onTVKeyDown);
    this.svg.removeEventListener('focus', this.onTVFocus);
    this.svg.remove();
  }

  /** Потеря фокуса окна во время перетаскивания: мягко отпускаем фигуру. */
  private onWindowBlur = (): void => {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const el = this.pieceEls[d.idx];
    el.classList.remove('dragging', 'held');
    this.rangeLayer.innerHTML = '';
    el.style.transform = this.pieceTransform(d.idx);
    this.events.onRelease();
  };

  // ---------- построение сцены ----------

  private build(): void {
    const { level } = this;
    const W = level.width * CELL;
    const H = level.height * CELL;
    const rng = mulberry32(level.id * 7919 + 13);
    const ns = 'http://www.w3.org/2000/svg';
    const make = (html: string): SVGGElement => {
      const g = document.createElementNS(ns, 'g');
      g.innerHTML = html;
      this.svg.appendChild(g);
      return g;
    };

    // Земля: трава вокруг, утоптанный двор внутри.
    //
    // Трава уходит далеко за viewBox намеренно. Элемент <svg> растянут на всю
    // доступную область, а viewBox квадратный, поэтому при любом соотношении
    // сторон окна остаётся запас по одной из осей — на широком экране слева и
    // справа, на узком сверху и снизу. Раньше в этом запасе был виден плоский
    // фон .game-screen, и двор выглядел вырезанным посреди пустоты. Внешний
    // <svg> обрезает содержимое по своему viewport, а не по viewBox, поэтому
    // достаточно нарисовать окружение шире — оно заполнит запас на любом экране.
    const OUT = M * 8;
    let ground = `
      <rect x="${-OUT}" y="${-OUT}" width="${W + 2 * OUT}" height="${H + 2 * OUT}" fill="#79b34c"/>
      <rect x="${-M}" y="${-M}" width="${W + 2 * M}" height="${H + 2 * M}" fill="#7cb84e"/>
      <rect x="-14" y="-14" width="${W + 28}" height="${H + 28}" rx="18" fill="#c9a45e"/>
      <rect x="0" y="0" width="${W}" height="${H}" rx="8" fill="#dbb271"/>`;
    // травяные кочки на газоне
    for (let i = 0; i < 26; i++) {
      const side = Math.floor(rng() * 4);
      const along = rng() * (side < 2 ? W + 2 * M : H + 2 * M) - M;
      const depth = 16 + rng() * (M - 46);
      const [cx, cy] =
        side === 0 ? [along, -depth - 14] : side === 1 ? [along, H + depth + 14] : side === 2 ? [-depth - 14, along] : [W + depth + 14, along];
      ground += `<path d="M${cx - 7} ${cy + 4} q3 -10 7 0 q3 -10 7 0" fill="none" stroke="#5f9c3c" stroke-width="3" stroke-linecap="round"/>`;
    }
    // Дальний луг за забором: кочки, кустики и редкие деревца. Плотность низкая
    // и убывает от двора — это фон, он не должен спорить с полем за внимание.
    // Всё детерминировано тем же rng (уровень выглядит одинаково при каждом
    // открытии) и рисуется несколькими десятками путей, а не тысячами точек.
    const inYardZone = (x: number, y: number) =>
      x > -M * 1.6 && x < W + M * 1.6 && y > -M * 1.6 && y < H + M * 1.6;
    for (let i = 0; i < 54; i++) {
      const x = -OUT + rng() * (W + 2 * OUT);
      const y = -OUT + rng() * (H + 2 * OUT);
      if (inYardZone(x, y)) continue; // ближнюю зону оставляем прежнему декору
      const roll = rng();
      if (roll < 0.52) {
        ground += `<path d="M${x - 7} ${y + 4} q3 -10 7 0 q3 -10 7 0" fill="none" stroke="#69a641" stroke-width="3" stroke-linecap="round" opacity="0.75"/>`;
      } else if (roll < 0.86) {
        const r = 16 + rng() * 12;
        ground += `<ellipse cx="${x}" cy="${y}" rx="${r.toFixed(0)}" ry="${(r * 0.72).toFixed(0)}" fill="#63a03d" opacity="0.6"/>`;
      } else {
        const h = 46 + rng() * 26;
        ground += `<ellipse cx="${x}" cy="${y + 6}" rx="26" ry="7" fill="rgba(43,29,10,0.14)"/>
          <rect x="${x - 5}" y="${y - h * 0.34}" width="10" height="${(h * 0.4).toFixed(0)}" rx="4" fill="#8a5a30"/>
          <circle cx="${x}" cy="${y - h * 0.52}" r="${(h * 0.36).toFixed(0)}" fill="#5f9c3c"/>
          <circle cx="${(x - h * 0.2).toFixed(0)}" cy="${y - h * 0.38}" r="${(h * 0.24).toFixed(0)}" fill="#69a641"/>
          <circle cx="${(x + h * 0.2).toFixed(0)}" cy="${y - h * 0.4}" r="${(h * 0.22).toFixed(0)}" fill="#69a641"/>`;
      }
    }
    // сетка двора
    for (let x = 1; x < level.width; x++) ground += `<line x1="${x * CELL}" y1="4" x2="${x * CELL}" y2="${H - 4}" stroke="rgba(93,64,25,0.16)" stroke-width="3" stroke-dasharray="10 12"/>`;
    for (let y = 1; y < level.height; y++) ground += `<line x1="4" y1="${y * CELL}" x2="${W - 4}" y2="${y * CELL}" stroke="rgba(93,64,25,0.16)" stroke-width="3" stroke-dasharray="10 12"/>`;
    // накатанная дорожка к воротам
    const lane = this.laneRect();
    ground += `<rect x="${lane.x}" y="${lane.y}" width="${lane.w}" height="${lane.h}" fill="rgba(255,244,214,0.28)" rx="10"/>`;
    // дорожка-выезд за забором
    const ex = level.exit;
    const roadA = ex.index * CELL + 6;
    if (ex.side === 'right') {
      ground += `<rect x="${W + 12}" y="${roadA}" width="${M - 12}" height="${CELL - 12}" fill="#c9a45e"/>
        <line x1="${W + 20}" y1="${roadA + (CELL - 12) / 2}" x2="${W + M}" y2="${roadA + (CELL - 12) / 2}" stroke="#dbb271" stroke-width="6" stroke-dasharray="14 16"/>`;
    } else if (ex.side === 'left') {
      ground += `<rect x="${-M}" y="${roadA}" width="${M - 12}" height="${CELL - 12}" fill="#c9a45e"/>`;
    } else if (ex.side === 'bottom') {
      ground += `<rect x="${roadA}" y="${H + 12}" width="${CELL - 12}" height="${M - 12}" fill="#c9a45e"/>`;
    } else {
      ground += `<rect x="${roadA}" y="${-M}" width="${CELL - 12}" height="${M - 12}" fill="#c9a45e"/>`;
    }
    // камешки
    for (let i = 0; i < 14; i++) {
      ground += `<circle cx="${20 + rng() * (W - 40)}" cy="${20 + rng() * (H - 40)}" r="${3 + rng() * 4}" fill="rgba(93,64,25,0.14)"/>`;
    }
    make(ground).classList.add('layer-ground');

    // забор с проёмом ворот
    make(this.fenceSvg()).classList.add('layer-fence');

    // ледяная колея: разметка клеток поля, под фигурами и полосой хода
    let iceHtml = '';
    for (const cell of level.ice ?? []) {
      iceHtml += `<g class="ice-cell" transform="translate(${cell.x * CELL},${cell.y * CELL})">${iceArt()}</g>`;
    }
    if (iceHtml) make(iceHtml).classList.add('layer-ice');

    // хрупкие доски: цела/сломана обновляется в updatePlanks().
    // testid индексирован: на уровне с несколькими досками общий testid ловил бы
    // произвольную из них, и локатор молча проверял бы не то, что имелось в виду.
    (level.planks ?? []).forEach((plank, i) => {
      const g = document.createElementNS(ns, 'g');
      g.classList.add('plank-cell');
      g.setAttribute('data-testid', `plank-${i}`);
      g.setAttribute('aria-hidden', 'true');
      g.innerHTML = plankArt(false);
      g.style.transform = `translate(${plank.x * CELL}px, ${plank.y * CELL}px)`;
      this.svg.appendChild(g);
      this.plankEls.push(g);
    });

    // следы колёс
    this.tracksLayer = make('');
    this.tracksLayer.classList.add('layer-tracks');

    // полоса допустимого хода (под фигурами)
    this.rangeLayer = make('');
    this.rangeLayer.classList.add('layer-range');

    // нажимная кнопка: любая проехавшая по ней машина навсегда разблокирует ворота
    if (level.gateSwitch) {
      const g = document.createElementNS(ns, 'g');
      g.classList.add('gate-switch');
      g.setAttribute('data-testid', 'gate-switch');
      g.setAttribute('aria-hidden', 'true');
      g.innerHTML = `
        <ellipse class="switch-shadow" cx="32" cy="38" rx="26" ry="16"/>
        <circle class="switch-rim" cx="32" cy="32" r="25"/>
        <circle class="switch-button" cx="32" cy="30" r="18"/>
        <path class="switch-icon" d="M32 15v25M20 29l12 12 12-12M18 47h28"/>
        <circle class="switch-light" cx="48" cy="16" r="5"/>`;
      g.style.transform = `translate(${level.gateSwitch.x * CELL}px, ${level.gateSwitch.y * CELL}px)`;
      this.svg.appendChild(g);
      this.gateSwitchEl = g;
    }

    // звезда
    if (level.star) {
      const g = document.createElementNS(ns, 'g');
      g.classList.add('star-sprite');
      g.setAttribute('data-testid', 'star');
      g.innerHTML = starArt();
      g.style.transform = `translate(${level.star.x * CELL}px, ${level.star.y * CELL}px)`;
      this.svg.appendChild(g);
      this.starEl = g;
    }

    // стены-препятствия
    let wallsHtml = '';
    for (const w of level.walls ?? []) {
      wallsHtml += `<g transform="translate(${w.x * CELL},${w.y * CELL})">${wallArt(w.kind)}</g>`;
    }
    make(wallsHtml).classList.add('layer-walls');

    // фигуры
    for (let i = 0; i < level.pieces.length; i++) {
      const def = level.pieces[i];
      const g = document.createElementNS(ns, 'g');
      g.classList.add('piece', `kind-${def.kind}`);
      g.dataset.idx = String(i);
      g.setAttribute('data-piece', def.id);
      const rotate =
        def.dir === 'v' && def.kind !== 'crate' ? ` transform="rotate(90) translate(0,-${CELL})"` : '';
      // Спрайт целевой машины нарисован «носом вперёд»: фары, стрелка и стоп-огни
      // рассчитаны на выезд вправо (или вниз для вертикальной). Все уровни
      // кампании такие, а вот отражённые ремиксы лиги выезжают влево — там
      // машина смотрела бы в противоположную от ворот сторону, и жёлтая стрелка
      // на кузове указывала бы не туда, куда ехать.
      const facesExit =
        def.kind === 'target' && (level.exit.side === 'left' || level.exit.side === 'top')
          ? ` transform="translate(${def.dir === 'v' ? 0 : def.len * CELL},${def.dir === 'v' ? def.len * CELL : 0}) scale(${
              def.dir === 'v' ? '1,-1' : '-1,1'
            })"`
          : '';
      g.innerHTML = `<g class="mid enter" style="animation-delay:${60 + i * 55}ms"><g class="facing"${facesExit}><g class="art"${rotate}>${pieceArt(def)}</g></g><text class="kind-badge" x="14" y="30">${kindBadge(def.kind)}</text></g>`;
      this.svg.appendChild(g);
      this.pieceEls.push(g);
    }

    // Куры-игровой объект: видны сразу в обеих позициях цикла — «где сейчас» /
    // «куда переместится» (актуальная непрозрачная, следующая полупрозрачная).
    //
    // Слой идёт ПОСЛЕ фигур намеренно. Клетка B в начале уровня может быть
    // занята машиной, и под ней метка «куда перелетит» просто не видна — а это
    // единственная подсказка о цикле. Перекрытия активной метки при этом не
    // возникает: занятую курицей клетку фигура занять не может по правилам.
    // Клики не перехватываются — `.field-chicken` имеет pointer-events: none.
    //
    // testid индексирован по номеру курицы: у нескольких кур на поле пары
    // клеток иначе неразличимы.
    (level.chickens ?? []).forEach((c, i) => {
      const mk = (cell: { x: number; y: number }, side: 'a' | 'b') => {
        const g = document.createElementNS(ns, 'g');
        g.classList.add('field-chicken');
        g.setAttribute('data-testid', `field-chicken-${i}-${side}`);
        g.setAttribute('aria-hidden', 'true');
        g.style.transform = `translate(${cell.x * CELL}px, ${cell.y * CELL}px)`;
        this.svg.appendChild(g);
        return g;
      };
      this.fieldChickenEls.push({ current: mk(c.a, 'a'), next: mk(c.b, 'b') });
    });

    // куры на газоне
    const spots: [number, number][] = [
      [W * 0.3, -M * 0.72],
      [W + M * 0.72, H * 0.78],
      [W * 0.75, H + M * 0.72]
    ];
    for (const [cx, cy] of spots) {
      const g = document.createElementNS(ns, 'g');
      g.classList.add('chicken');
      g.innerHTML = `<g class="chicken-inner"><g class="chicken-bob" style="animation-delay:${(rng() * 4).toFixed(1)}s">${chickenArt()}</g></g>`;
      g.style.transform = `translate(${cx}px, ${cy}px) scale(${0.9 + rng() * 0.4}) ${rng() > 0.5 ? 'scale(-1,1)' : ''}`;
      this.svg.appendChild(g);
      this.chickenEls.push(g);
    }

    // колодец — декоративный, чисто атмосферный (дальний левый нижний угол)
    const well = document.createElementNS(ns, 'g');
    well.innerHTML = wellArt();
    well.style.transform = `translate(${-M * 0.62}px, ${H + M * 0.6}px) scale(0.62)`;
    this.svg.appendChild(well);

    // слой подсказки
    this.hintLayer = make('');
    this.hintLayer.classList.add('layer-hint');

    // Слой пояснений по тапу — последний, то есть поверх всего: это прямой
    // ответ на действие игрока, он не должен уезжать под фигуру или подсказку.
    this.ruleLayer = make('');
    this.ruleLayer.classList.add('layer-rule');

    this.syncPieces(false);
    this.refreshCrateBadges();
    this.updatePlanks();
    this.updateFieldChickens();
  }

  /** Прямоугольник ряда/колонки ворот. */
  private laneRect(): { x: number; y: number; w: number; h: number } {
    const { exit, width, height } = this.level;
    if (exit.side === 'left' || exit.side === 'right') {
      return { x: 2, y: exit.index * CELL + 6, w: width * CELL - 4, h: CELL - 12 };
    }
    return { x: exit.index * CELL + 6, y: 2, w: CELL - 12, h: height * CELL - 4 };
  }

  private fenceSvg(): string {
    const { level } = this;
    const W = level.width * CELL;
    const H = level.height * CELL;
    const off = 44; // отступ забора от двора
    const rail = (x1: number, y1: number, x2: number, y2: number) =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8a5a30" stroke-width="10" stroke-linecap="round"/>
       <line x1="${x1}" y1="${y1 + (x1 === x2 ? 0 : 16)}" x2="${x2}" y2="${y2 + (x1 === x2 ? 0 : 16)}" stroke="#8a5a30" stroke-width="10" stroke-linecap="round" transform="${x1 === x2 ? `translate(16,0)` : ''}"/>`;
    const post = (x: number, y: number) =>
      `<rect x="${x - 9}" y="${y - 12}" width="18" height="34" rx="6" fill="#7d5227"/>`;

    const side = level.exit.side;
    const gapA = level.exit.index * CELL;
    const gapB = gapA + CELL;
    let html = '';

    // четыре стороны; на стороне ворот — разрыв
    const topY = -off;
    const botY = H + off;
    const leftX = -off;
    const rightX = W + off;

    const seg = (
      s: 'top' | 'bottom' | 'left' | 'right',
      from: number,
      to: number
    ): string => {
      if (to - from < 8) return '';
      if (s === 'top') return rail(from, topY - 8, to, topY - 8);
      if (s === 'bottom') return rail(from, botY - 8, to, botY - 8);
      if (s === 'left') return rail(leftX - 8, from, leftX - 8, to);
      return rail(rightX - 8, from, rightX - 8, to);
    };

    for (const s of ['top', 'bottom', 'left', 'right'] as const) {
      const horiz = s === 'top' || s === 'bottom';
      const len = horiz ? W : H;
      const isGateSide =
        (s === 'right' && side === 'right') ||
        (s === 'left' && side === 'left') ||
        (s === 'top' && side === 'top') ||
        (s === 'bottom' && side === 'bottom');
      if (isGateSide) {
        html += seg(s, -30, gapA - 6) + seg(s, gapB + 6, len + 30);
      } else {
        html += seg(s, -30, len + 30);
      }
      const step = CELL;
      for (let a = -30; a <= len + 30; a += step) {
        if (isGateSide && a > gapA - 20 && a < gapB + 20) continue;
        if (horiz) html += post(a, s === 'top' ? topY : botY);
        else html += post(s === 'left' ? leftX : rightX, a - 12 + 12);
      }
    }

    // ворота: два столба и две створки на петлях
    const g = this.gatePanels();
    html += g;
    return html;
  }

  private gatePanels(): string {
    const { exit, width, height } = this.level;
    const off = 44;
    let hx: number, hy1: number, hy2: number, vert: boolean;
    if (exit.side === 'right' || exit.side === 'left') {
      hx = exit.side === 'right' ? width * CELL + off - 8 : -off + 8;
      hy1 = exit.index * CELL;
      hy2 = hy1 + CELL;
      vert = true;
    } else {
      hx = exit.side === 'bottom' ? height * CELL + off - 8 : -off + 8; // здесь hx = y петель
      hy1 = exit.index * CELL;
      hy2 = hy1 + CELL;
      vert = false;
    }
    // створка: дощатая дверца поперёк проёма (в локальных координатах петли)
    const leaf = (x: number, y: number, w: number, h: number) => {
      const horizPlanks = w >= h; // доски поперёк длинной стороны
      let lines = '';
      if (horizPlanks) {
        lines = `<line x1="${x + w * 0.36}" y1="${y + 3}" x2="${x + w * 0.36}" y2="${y + h - 3}" stroke="rgba(0,0,0,0.2)" stroke-width="4"/>
                 <line x1="${x + w * 0.68}" y1="${y + 3}" x2="${x + w * 0.68}" y2="${y + h - 3}" stroke="rgba(0,0,0,0.2)" stroke-width="4"/>
                 <line x1="${x + 4}" y1="${y + 4}" x2="${x + w - 4}" y2="${y + h - 4}" stroke="rgba(0,0,0,0.22)" stroke-width="5"/>`;
      } else {
        lines = `<line x1="${x + 3}" y1="${y + h * 0.36}" x2="${x + w - 3}" y2="${y + h * 0.36}" stroke="rgba(0,0,0,0.2)" stroke-width="4"/>
                 <line x1="${x + 3}" y1="${y + h * 0.68}" x2="${x + w - 3}" y2="${y + h * 0.68}" stroke="rgba(0,0,0,0.2)" stroke-width="4"/>
                 <line x1="${x + 4}" y1="${y + 4}" x2="${x + w - 4}" y2="${y + h - 4}" stroke="rgba(0,0,0,0.22)" stroke-width="5"/>`;
      }
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" class="gate-wood"/>${lines}`;
    };
    let panels: string;
    if (vert) {
      panels = `
        <g class="gate-hinge" transform="translate(${hx},${hy1})">
          <g class="gate-panel gate-panel-a" data-open="${exit.side === 'right' ? -78 : 78}">${leaf(-15, 2, 30, 48)}</g>
        </g>
        <g class="gate-hinge" transform="translate(${hx},${hy2})">
          <g class="gate-panel gate-panel-b" data-open="${exit.side === 'right' ? 78 : -78}">${leaf(-15, -50, 30, 48)}</g>
        </g>
        <rect x="${hx - 15}" y="${hy1 - 26}" width="30" height="30" rx="8" fill="#6b4a1f"/>
        <rect x="${hx - 15}" y="${hy2 - 4}" width="30" height="30" rx="8" fill="#6b4a1f"/>`;
    } else {
      panels = `
        <g class="gate-hinge" transform="translate(${hy1},${hx})">
          <g class="gate-panel gate-panel-a" data-open="${exit.side === 'bottom' ? 78 : -78}">${leaf(2, -15, 48, 30)}</g>
        </g>
        <g class="gate-hinge" transform="translate(${hy2},${hx})">
          <g class="gate-panel gate-panel-b" data-open="${exit.side === 'bottom' ? -78 : 78}">${leaf(-50, -15, 48, 30)}</g>
        </g>
        <rect x="${hy1 - 26}" y="${hx - 15}" width="30" height="30" rx="8" fill="#6b4a1f"/>
        <rect x="${hy2 - 4}" y="${hx - 15}" width="30" height="30" rx="8" fill="#6b4a1f"/>`;
    }
    const lockX = vert ? hx : hy1 + CELL / 2;
    const lockY = vert ? hy1 + CELL / 2 : hx;
    const lock = this.level.gateSwitch
      ? `<g class="gate-lock" transform="translate(${lockX},${lockY})">
          <path d="M-10-3v-7a10 10 0 0 1 20 0v7" fill="none" stroke="#fff1c9" stroke-width="6"/>
          <rect x="-15" y="-4" width="30" height="25" rx="7" fill="#e2574c" stroke="#7f2924" stroke-width="4"/>
          <circle cx="0" cy="7" r="4" fill="#fff1c9"/>
        </g>`
      : '';
    return `<g class="gate" data-testid="gate">${panels}${lock}</g>`;
  }

  // ---------- позиционирование ----------

  private pieceTransform(i: number): string {
    const ps = this.state.pieces[i];
    return `translate(${ps.x * CELL}px, ${ps.y * CELL}px)`;
  }

  private syncPieces(animate: boolean): void {
    this.pieceEls.forEach((el, i) => {
      const ps = this.state.pieces[i];
      el.classList.toggle('no-anim', !animate);
      el.style.display = ps.gone ? 'none' : '';
      el.style.transform = this.pieceTransform(i);
      if (!animate) {
        // форсируем применение без переходов
        void el.getBoundingClientRect();
        el.classList.remove('no-anim');
      }
    });
  }

  setState(s: GameState, animate = true): void {
    // отменяем возможную незавершённую анимацию выезда (undo/restart в её момент)
    if (this.exitTimer !== null) {
      clearTimeout(this.exitTimer);
      this.exitTimer = null;
      this.animLock = false;
    }
    this.tvMove = null;
    this.rangeLayer.innerHTML = '';
    this.clearRuleTip();
    this.pieceEls.forEach((el) => el.classList.remove('tv-active'));
    this.pieceEls.forEach((el) => el.classList.remove('exiting'));
    this.state = s;
    this.clearHint();
    this.syncPieces(animate);
    this.refreshCrateBadges();
    this.updateStarVisibility();
    this.updateGateSwitch(animate);
    this.updateGate(true);
    this.updatePlanks();
    this.updateFieldChickens();
    if (this.state.pieces[this.selectedPiece]?.gone) this.selectedPiece = this.firstVisiblePiece();
    this.updateTVSelection();
  }

  refreshCrateBadges(): void {
    this.level.pieces.forEach((def, i) => {
      if (def.kind !== 'crate') return;
      const el = this.pieceEls[i];
      const left = (def.maxMoves ?? 0) - this.state.pieces[i].used;
      const txt = el.querySelector('.crate-badge-text');
      if (txt) txt.textContent = String(Math.max(left, 0));
      el.classList.toggle('spent', left <= 0);
    });
  }

  private updateStarVisibility(): void {
    if (!this.starEl) return;
    this.starEl.classList.toggle('collected', this.state.starCollected);
  }

  private updatePlanks(): void {
    const planks = this.level.planks ?? [];
    this.plankEls.forEach((el, i) => {
      const plank = planks[i];
      const broken = this.state.brokenPlanks.includes(`${plank.x},${plank.y}`);
      el.classList.toggle('broken', broken);
      el.innerHTML = plankArt(broken);
    });
  }

  private updateFieldChickens(): void {
    (this.level.chickens ?? []).forEach((_, i) => {
      const pair = this.fieldChickenEls[i];
      const activeIsA = this.state.chickenAt[i] === 'a';
      pair.current.innerHTML = fieldChickenArt(!activeIsA);
      pair.next.innerHTML = fieldChickenArt(activeIsA);
      pair.current.classList.toggle('chicken-active', activeIsA);
      pair.next.classList.toggle('chicken-active', !activeIsA);
    });
  }

  private updateGateSwitch(animate: boolean): void {
    if (!this.gateSwitchEl) return;
    const wasPressed = this.gateSwitchEl.classList.contains('pressed');
    const pressed = gateOpen(this.level, this.state, buildGrid(this.level, this.state));
    this.gateSwitchEl.classList.toggle('pressed', pressed);
    this.gateSwitchEl.setAttribute('data-pressed', String(pressed));
    if (animate && pressed && !wasPressed) {
      this.gateSwitchEl.classList.remove('just-pressed');
      void this.gateSwitchEl.getBoundingClientRect();
      this.gateSwitchEl.classList.add('just-pressed');
    } else if (!pressed) {
      this.gateSwitchEl.classList.remove('just-pressed');
    }
  }

  private updateGate(sound: boolean): void {
    const unlocked = !this.level.gateSwitch || gateOpen(this.level, this.state, buildGrid(this.level, this.state));
    this.svg.querySelector<SVGGElement>('.gate-lock')?.classList.toggle('unlocked', unlocked);
    const open = exitSteps(this.level, this.state) >= 0 || this.state.won;
    if (open === this.gateOpen) return;
    const wasOpen = this.gateOpen;
    this.gateOpen = open;
    this.svg.querySelectorAll<SVGGElement>('.gate-panel').forEach((p) => {
      const angle = open ? Number(p.dataset.open) : 0;
      p.style.transform = `rotate(${angle}deg)`;
    });
    if (sound) {
      if (open) this.events.onGateOpen();
      // Захлопывание озвучивается только если ворота действительно были
      // открыты: на старте `gateOpen` уже false, и без этой проверки каждый
      // первый вызов трактовался бы как закрытие.
      else if (wasOpen) this.events.onGateClose();
    }
  }

  flutterChickens(): void {
    for (const ch of this.chickenEls) {
      const inner = ch.querySelector<SVGGElement>('.chicken-inner');
      if (!inner) continue;
      inner.classList.remove('flutter');
      void inner.getBoundingClientRect();
      inner.classList.add('flutter');
    }
  }

  // ---------- подсказка ----------

  showHint(move: SolveMove): void {
    this.clearHint();
    const el = this.pieceEls[move.piece];
    el.classList.add('hinted');
    const def = this.level.pieces[move.piece];
    const ps = this.state.pieces[move.piece];
    let html = '';
    const leadX = ps.x + (def.dir === 'h' && move.dx > 0 ? def.len - 1 : 0);
    const leadY = ps.y + (def.dir === 'v' && move.dy > 0 ? def.len - 1 : 0);
    const n = Math.min(move.steps + 1, 3);
    for (let k = 1; k <= n; k++) {
      const cx = (leadX + move.dx * k) * CELL + CELL / 2;
      const cy = (leadY + move.dy * k) * CELL + CELL / 2;
      const rot = move.dx === 1 ? 0 : move.dx === -1 ? 180 : move.dy === 1 ? 90 : -90;
      html += `<g transform="translate(${cx},${cy}) rotate(${rot})" class="hint-chevron" style="animation-delay:${k * 0.12}s">
        <path d="M-12 -18 L10 0 L-12 18" fill="none" stroke="#fff7e6" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M-12 -18 L10 0 L-12 18" fill="none" stroke="#e2574c" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      </g>`;
    }
    this.hintLayer.innerHTML = html;
  }

  clearHint(): void {
    this.hintLayer.innerHTML = '';
    this.pieceEls.forEach((el) => el.classList.remove('hinted'));
  }

  // ---------- пояснение правила по тапу ----------

  /**
   * Что лежит в клетке и по какому правилу живёт. Порядок проверок — от
   * «верхнего» объекта к «нижнему»: на одной клетке могут совпасть фигура и
   * напольный объект (машина стоит на кнопке ворот), и игрок тапает по тому,
   * что видит сверху.
   */
  private ruleAt(cx: number, cy: number): string | null {
    const { level } = this;
    if (cx < 0 || cx >= level.width || cy < 0 || cy >= level.height) return null;

    const pieceIndex = level.pieces.findIndex((def, i) =>
      pieceCells(def, this.state.pieces[i]).some((c) => c.x === cx && c.y === cy)
    );
    if (pieceIndex >= 0) {
      const def = level.pieces[pieceIndex];
      if (def.kind === 'crate') {
        const left = (def.maxMoves ?? 0) - this.state.pieces[pieceIndex].used;
        return left > 0 ? t('rule.crate', { n: left }) : t('rule.crateSpent');
      }
      return t(`rule.${def.kind}`);
    }

    const wall = level.walls?.find((w) => w.x === cx && w.y === cy);
    if (wall) return t(`rule.${wall.kind}`);

    const plank = level.planks?.find((p) => p.x === cx && p.y === cy);
    if (plank) {
      return this.state.brokenPlanks.includes(`${cx},${cy}`) ? t('rule.plankBroken') : t('rule.plank');
    }

    const chickenIndex = (level.chickens ?? []).findIndex(
      (c) => (c.a.x === cx && c.a.y === cy) || (c.b.x === cx && c.b.y === cy)
    );
    if (chickenIndex >= 0) {
      const chicken = level.chickens![chickenIndex];
      const here = this.state.chickenAt[chickenIndex] === 'a' ? chicken.a : chicken.b;
      return here.x === cx && here.y === cy ? t('rule.chicken') : t('rule.chickenNext');
    }

    const gate = level.gateSwitch;
    if (gate && gate.x === cx && gate.y === cy) {
      return t(gate.holdType === 'held' ? 'rule.gateSwitchHeld' : 'rule.gateSwitchOnce');
    }

    if (level.star && level.star.x === cx && level.star.y === cy && !this.state.starCollected) {
      return t('rule.star');
    }
    return null;
  }

  /** Разбивает строку по словам на строки не длиннее `limit` символов. */
  private wrapRule(text: string, limit = 26): string[] {
    const lines: string[] = [];
    let current = '';
    for (const word of text.split(' ')) {
      if (current.length === 0) current = word;
      else if (current.length + 1 + word.length <= limit) current += ` ${word}`;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  /**
   * Баллон с правилом над клеткой. Если клетка у верхнего края, баллон
   * переезжает под неё — иначе он ушёл бы за поле и обрезался.
   */
  private showRuleTip(cx: number, cy: number, text: string): void {
    this.clearRuleTip();
    const lines = this.wrapRule(text);
    const lineH = 26;
    const padX = 18;
    const padY = 14;
    const charW = 10.4; // ширина символа при font-size 18 в этом начертании
    const width = Math.max(...lines.map((l) => l.length)) * charW + padX * 2;
    const height = lines.length * lineH + padY * 2 - 6;
    const cellCx = cx * CELL + CELL / 2;
    const below = cy === 0;
    const top = below ? (cy + 1) * CELL + 16 : cy * CELL - height - 16;
    // Держим баллон в пределах поля по горизонтали: у краевых клеток он иначе
    // наполовину висит над забором.
    const half = width / 2;
    const minX = -M / 2;
    const maxX = this.level.width * CELL + M / 2;
    const left = Math.max(minX, Math.min(maxX - width, cellCx - half));
    const tailX = Math.max(left + 20, Math.min(left + width - 20, cellCx));
    const tail = below
      ? `M${tailX - 11} ${top} L${tailX} ${top - 13} L${tailX + 11} ${top} Z`
      : `M${tailX - 11} ${top + height} L${tailX} ${top + height + 13} L${tailX + 11} ${top + height} Z`;
    const rows = lines
      .map(
        (line, i) =>
          `<text x="${left + width / 2}" y="${top + padY + 18 + i * lineH}" text-anchor="middle" class="rule-tip-text">${escapeXML(line)}</text>`
      )
      .join('');
    this.ruleLayer.innerHTML = `<g class="rule-tip">
      <path d="${tail}" class="rule-tip-body"/>
      <rect x="${left}" y="${top}" width="${width}" height="${height}" rx="16" class="rule-tip-body"/>
      ${rows}
    </g>`;
    this.ruleTimer = window.setTimeout(() => this.clearRuleTip(), 3600);
  }

  clearRuleTip(): void {
    if (this.ruleTimer !== null) {
      clearTimeout(this.ruleTimer);
      this.ruleTimer = null;
    }
    this.ruleLayer.innerHTML = '';
  }

  /**
   * Тап по объекту без перетаскивания: показываем правило этого объекта.
   * Возвращает true, если объяснение показано.
   */
  private explainAt(point: { x: number; y: number }): boolean {
    const cx = Math.floor(point.x / CELL);
    const cy = Math.floor(point.y / CELL);
    const rule = this.ruleAt(cx, cy);
    if (!rule) {
      this.clearRuleTip();
      return false;
    }
    this.showRuleTip(cx, cy, rule);
    this.events.onExplain();
    return true;
  }

  // ---------- ввод ----------

  private firstVisiblePiece(): number {
    const index = this.state.pieces.findIndex((piece) => !piece.gone);
    return Math.max(0, index);
  }

  private updateTVSelection(): void {
    this.pieceEls.forEach((element, index) => {
      const selected = index === this.selectedPiece && !this.state.pieces[index].gone;
      element.classList.toggle('tv-selected', selected);
      if (selected) element.setAttribute('aria-current', 'true');
      else element.removeAttribute('aria-current');
    });
  }

  private selectPiece(index: number): void {
    if (index < 0 || this.state.pieces[index]?.gone) return;
    this.selectedPiece = index;
    this.updateTVSelection();
  }

  private pieceCenter(index: number): { x: number; y: number } {
    const def = this.level.pieces[index];
    const state = this.state.pieces[index];
    return {
      x: state.x + (def.dir === 'h' ? def.len / 2 : 0.5),
      y: state.y + (def.dir === 'v' ? def.len / 2 : 0.5)
    };
  }

  private navigatePiece(dx: number, dy: number): void {
    const visible = this.state.pieces.map((piece, index) => (!piece.gone ? index : -1)).filter((index) => index >= 0);
    if (visible.length === 0) return;
    if (!visible.includes(this.selectedPiece)) {
      this.selectPiece(visible[0]);
      return;
    }
    const from = this.pieceCenter(this.selectedPiece);
    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const index of visible) {
      if (index === this.selectedPiece) continue;
      const to = this.pieceCenter(index);
      const primary = (to.x - from.x) * dx + (to.y - from.y) * dy;
      if (primary <= 0) continue;
      const lateral = Math.abs((to.x - from.x) * dy - (to.y - from.y) * dx);
      const score = primary + lateral * 3;
      if (score < bestScore) {
        best = index;
        bestScore = score;
      }
    }
    if (best < 0) {
      const current = visible.indexOf(this.selectedPiece);
      const delta = dx + dy > 0 ? 1 : -1;
      best = visible[(current + delta + visible.length) % visible.length];
    }
    this.selectPiece(best);
  }

  private beginTVMove(): void {
    if (!this.interactive || this.animLock || this.state.won) return;
    const idx = this.selectedPiece;
    const def = this.level.pieces[idx];
    const grid = buildGrid(this.level, this.state);
    const neg = {
      x: maxSteps(this.level, this.state, idx, -1, 0, grid),
      y: maxSteps(this.level, this.state, idx, 0, -1, grid)
    };
    const pos = {
      x: maxSteps(this.level, this.state, idx, 1, 0, grid),
      y: maxSteps(this.level, this.state, idx, 0, 1, grid)
    };
    if (neg.x + neg.y + pos.x + pos.y === 0) {
      this.bumpPiece(idx, def.dir === 'v' ? 'y' : 'x');
      this.events.onBump();
      return;
    }
    const vector = exitVector(this.level.exit);
    const exitK = exitSteps(this.level, this.state);
    const isTarget = targetIndex(this.level) === idx;
    const exitAxis = isTarget && exitK > 0 ? (vector.dx !== 0 ? 'x' : 'y') : null;
    const exitSign = vector.dx + vector.dy;
    const inNeg = { ...neg };
    const inPos = { ...pos };
    if (exitAxis && exitSign > 0) inPos[exitAxis] = Math.max(0, exitK - def.len);
    if (exitAxis && exitSign < 0) inNeg[exitAxis] = Math.max(0, exitK - def.len);
    this.tvMove = {
      idx,
      axis: def.dir === 'h' ? 'x' : def.dir === 'v' ? 'y' : null,
      offset: 0,
      neg,
      pos,
      inNeg,
      inPos,
      exitAxis,
      exitSign,
      exitK
    };
    const rangeNeg = exitAxis && exitSign < 0 ? { ...neg, [exitAxis]: exitK } : neg;
    const inBoardPos = exitAxis && exitSign < 0 ? { ...inPos, [exitAxis]: inNeg[exitAxis] } : inPos;
    this.showRange({
      idx,
      startX: 0,
      startY: 0,
      axis: this.tvMove.axis,
      neg: rangeNeg,
      pos,
      visPos: pos,
      inBoardPos,
      exitAxis,
      exitSign,
      exitK,
      bumpedPos: false,
      bumpedNeg: false,
      moved: false
    });
    this.pieceEls[idx].classList.add('tv-active');
  }

  private endTVMove(reset: boolean): void {
    const move = this.tvMove;
    if (!move) return;
    if (reset) this.pieceEls[move.idx].style.transform = this.pieceTransform(move.idx);
    this.pieceEls[move.idx].classList.remove('tv-active');
    this.rangeLayer.innerHTML = '';
    this.tvMove = null;
  }

  private previewTVMove(dx: number, dy: number): void {
    const move = this.tvMove;
    if (!move) return;
    const axis: 'x' | 'y' = dx !== 0 ? 'x' : 'y';
    const sign = dx + dy;
    if (move.axis && move.axis !== axis) {
      this.bumpPiece(move.idx, move.axis);
      this.events.onBump();
      return;
    }
    if (!move.axis) move.axis = axis;
    let next = move.offset;
    if (sign > 0) {
      if (next < 0) {
        if (move.exitAxis === axis && move.exitSign < 0 && next === -move.exitK) next = -move.inNeg[axis];
        else next++;
      } else if (next < move.inPos[axis]) next++;
      else if (move.exitAxis === axis && move.exitSign > 0 && next < move.exitK) next = move.exitK;
    } else if (next > 0) {
      if (move.exitAxis === axis && move.exitSign > 0 && next === move.exitK) next = move.inPos[axis];
      else next--;
    } else if (-next < move.inNeg[axis]) next--;
    else if (move.exitAxis === axis && move.exitSign < 0 && -next < move.exitK) next = -move.exitK;

    if (next === move.offset) {
      this.bumpPiece(move.idx, axis);
      this.events.onBump();
      return;
    }
    move.offset = next;
    const state = this.state.pieces[move.idx];
    const x = (state.x + (axis === 'x' ? next : 0)) * CELL;
    const y = (state.y + (axis === 'y' ? next : 0)) * CELL;
    this.pieceEls[move.idx].style.transform = `translate(${x}px, ${y}px)`;
  }

  private confirmTVMove(): void {
    const move = this.tvMove;
    if (!move || move.offset === 0 || !move.axis) {
      this.endTVMove(true);
      return;
    }
    const sign = Math.sign(move.offset);
    const dx = move.axis === 'x' ? sign : 0;
    const dy = move.axis === 'y' ? sign : 0;
    const exit = move.exitAxis === move.axis && move.exitSign === sign && Math.abs(move.offset) === move.exitK;
    let steps = Math.abs(move.offset);
    // как и при перетаскивании: лёд может запретить именно эту точку остановки —
    // доводим до ближайшей легальной клетки в ту же сторону вместо отмены хода.
    // Легальной точки может не оказаться ни одной (на льду нельзя встать даже
    // упершись в препятствие) — тогда ход невозможен и ниже сработает отдача.
    const hardLimit = exit ? steps : sign > 0 ? move.inPos[move.axis] : move.inNeg[move.axis];
    let result = applyMove(this.level, this.state, move.idx, dx, dy, steps);
    while (!result && !exit && steps < hardLimit) {
      steps++;
      result = applyMove(this.level, this.state, move.idx, dx, dy, steps);
    }
    if (!result) {
      this.refuseMove(move.idx, move.axis);
      this.endTVMove(true);
      return;
    }
    const index = move.idx;
    this.endTVMove(false);
    this.commit(result, index, exit, dx, dy, steps);
    if (result.state.pieces[index].gone) this.selectedPiece = this.firstVisiblePiece();
    this.updateTVSelection();
  }

  private onTVFocus = (): void => {
    if (this.state.pieces[this.selectedPiece]?.gone) this.selectedPiece = this.firstVisiblePiece();
    this.updateTVSelection();
  };

  private onTVKeyDown = (event: KeyboardEvent): void => {
    if (!this.interactive || this.animLock || this.state.won) return;
    if (event.key === 'Enter') {
      if (event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.tvMove) this.confirmTVMove();
      else this.beginTVMove();
      return;
    }
    const direction =
      event.key === 'ArrowLeft'
        ? { dx: -1, dy: 0 }
        : event.key === 'ArrowRight'
          ? { dx: 1, dy: 0 }
          : event.key === 'ArrowUp'
            ? { dx: 0, dy: -1 }
            : event.key === 'ArrowDown'
              ? { dx: 0, dy: 1 }
              : null;
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.tvMove) this.previewTVMove(direction.dx, direction.dy);
    else this.navigatePiece(direction.dx, direction.dy);
  };

  private touchPoint(e: TouchEvent): InputPoint | null {
    const touch = e.changedTouches[0] ?? e.touches[0];
    if (!touch) return null;
    return {
      clientX: touch.clientX,
      clientY: touch.clientY,
      target: e.target,
      preventDefault: () => e.preventDefault()
    };
  }

  private onPointerDown = (e: PointerEvent): void => this.onDown(e);
  private onPointerMove = (e: PointerEvent): void => this.onMove(e);
  private onPointerUp = (e: PointerEvent): void => this.onUp(e);
  private onTouchStart = (e: TouchEvent): void => {
    this.lastTouchAt = Date.now();
    const point = this.touchPoint(e);
    if (point) this.onDown(point);
  };
  private onTouchMove = (e: TouchEvent): void => {
    const point = this.touchPoint(e);
    if (point) this.onMove(point);
  };
  private onTouchEnd = (e: TouchEvent): void => {
    const point = this.touchPoint(e);
    if (point) this.onUp(point);
  };
  private onMouseDown = (e: MouseEvent): void => {
    if (Date.now() - this.lastTouchAt > 700) this.onDown(e);
  };
  private onMouseMove = (e: MouseEvent): void => this.onMove(e);
  private onMouseUp = (e: MouseEvent): void => this.onUp(e);

  private toSvg(e: InputPoint): { x: number; y: number } {
    const r = this.svg.getBoundingClientRect();
    const vbW = this.level.width * CELL + 2 * M;
    const vbH = this.level.height * CELL + 2 * M;
    const scale = Math.min(r.width / vbW, r.height / vbH);
    const ox = (r.width - vbW * scale) / 2;
    const oy = (r.height - vbH * scale) / 2;
    return { x: (e.clientX - r.left - ox) / scale - M, y: (e.clientY - r.top - oy) / scale - M };
  }

  private onDown(e: InputPoint): void {
    if (!this.interactive || this.animLock || this.state.won || this.drag) return;
    const target = e.target as Element;
    const g = target.closest<SVGGElement>('g[data-idx]');
    if (!g) {
      // Тап мимо фигуры: напольные объекты (стены, лёд, доски, куры, кнопка,
      // звезда) не ловят события сами — по клетке под пальцем объясняем правило.
      this.explainAt(this.toSvg(e));
      return;
    }
    const idx = Number(g.dataset.idx);
    this.endTVMove(true);
    this.selectPiece(idx);
    this.clearRuleTip();
    const def = this.level.pieces[idx];
    const grid = buildGrid(this.level, this.state);
    const neg = {
      x: maxSteps(this.level, this.state, idx, -1, 0, grid),
      y: maxSteps(this.level, this.state, idx, 0, -1, grid)
    };
    const pos = {
      x: maxSteps(this.level, this.state, idx, 1, 0, grid),
      y: maxSteps(this.level, this.state, idx, 0, 1, grid)
    };
    if (neg.x + neg.y + pos.x + pos.y === 0) {
      // Двигаться некуда: лёгкий бамп как отклик — и заодно правило фигуры.
      // Именно в этот момент вопрос «почему не едет» и возникает.
      this.bumpPiece(idx, def.dir === 'v' ? 'y' : 'x');
      this.events.onBump();
      this.explainAt(this.toSvg(e));
      return;
    }
    const v = exitVector(this.level.exit);
    const k = exitSteps(this.level, this.state);
    const isTarget = targetIndex(this.level) === idx;
    const exitAxis = isTarget && k > 0 ? (v.dx !== 0 ? 'x' : 'y') : null;
    const exitSign = v.dx + v.dy;
    const inBoardPos = { ...pos };
    const visPos = { ...pos };
    if (exitAxis) {
      // maxSteps уже включает выезд; внутри поля можно на len меньше
      const inb = k - def.len;
      if (exitSign > 0) {
        inBoardPos[exitAxis] = inb;
        visPos[exitAxis] = k;
      }
    }
    const inBoardNeg = { ...neg };
    if (exitAxis && exitSign < 0) {
      inBoardNeg[exitAxis] = k - def.len;
    }
    this.drag = {
      idx,
      startX: this.toSvg(e).x,
      startY: this.toSvg(e).y,
      axis: def.dir === 'h' ? 'x' : def.dir === 'v' ? 'y' : null,
      neg: exitAxis && exitSign < 0 ? { ...neg, [exitAxis]: k } : neg,
      pos,
      visPos,
      inBoardPos,
      exitAxis,
      exitSign,
      exitK: k,
      bumpedPos: false,
      bumpedNeg: false,
      moved: false
    };
    // при выезде влево/вверх обменяем осмысленно: neg хранит видимый максимум назад
    if (exitAxis && exitSign < 0) this.drag.inBoardPos = inBoardPos;
    this.showRange(this.drag);
    g.classList.add('dragging', 'held');
    try {
      if (e.pointerId !== undefined) this.svg.setPointerCapture(e.pointerId);
    } catch {
      // синтетические события (тесты) не имеют активного указателя
    }
    this.events.onPick(idx);
    this.drag.speed = 0;
    this.drag.lastMoveAt = undefined;
    e.preventDefault();
  }

  private currentOffset(e: InputPoint): { axis: 'x' | 'y'; off: number } | null {
    const d = this.drag;
    if (!d) return null;
    const p = this.toSvg(e);
    const dx = (p.x - d.startX) / CELL;
    const dy = (p.y - d.startY) / CELL;
    let axis = d.axis;
    if (!axis) {
      if (Math.abs(dx) < 0.35 && Math.abs(dy) < 0.35) return null;
      axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      d.axis = axis; // ящик: ось фиксируется до конца жеста
    }
    return { axis, off: axis === 'x' ? dx : dy };
  }

  private onMove(e: InputPoint): void {
    const d = this.drag;
    if (!d) return;
    const cur = this.currentOffset(e);
    if (!cur) return;
    // Сглаженная скорость указателя в клетках/кадр → интенсивность звука тяги.
    const now = performance.now();
    if (d.lastMoveAt !== undefined) {
      const dt = Math.max(8, now - d.lastMoveAt);
      const speed = Math.min(1, Math.abs(cur.off - (d.lastOff ?? cur.off)) / (dt / 16.7) / 2.2);
      d.speed = (d.speed ?? 0) * 0.72 + speed * 0.28;
      this.events.onDragSpeed?.(d.speed);
    }
    d.lastMoveAt = now;
    d.lastOff = cur.off;
    const { axis, off } = cur;
    const maxF = d.exitAxis === axis && d.exitSign > 0 ? d.visPos[axis] : d.pos[axis];
    const minF = -(d.exitAxis === axis && d.exitSign < 0 ? d.neg[axis] : d.neg[axis]);
    const clamped = Math.max(minF, Math.min(maxF, off));
    if (Math.abs(clamped) > 0.05) d.moved = true;
    // отдача при попытке ехать сквозь препятствие
    if (off > maxF + 0.35 && !d.bumpedPos) {
      d.bumpedPos = true;
      this.bumpPiece(d.idx, axis);
      this.events.onBump();
    } else if (off < maxF) {
      d.bumpedPos = false;
    }
    if (off < minF - 0.35 && !d.bumpedNeg) {
      d.bumpedNeg = true;
      this.bumpPiece(d.idx, axis);
      this.events.onBump();
    } else if (off > minF) {
      d.bumpedNeg = false;
    }
    const ps = this.state.pieces[d.idx];
    const tx = (ps.x + (axis === 'x' ? clamped : 0)) * CELL;
    const ty = (ps.y + (axis === 'y' ? clamped : 0)) * CELL;
    this.pieceEls[d.idx].style.transform = `translate(${tx}px, ${ty}px)`;
    e.preventDefault();
  }

  private onUp(e: InputPoint): void {
    const d = this.drag;
    if (!d) return;
    const el = this.pieceEls[d.idx];
    el.classList.remove('dragging', 'held');
    this.rangeLayer.innerHTML = '';
    const cur = this.currentOffset(e);
    this.drag = null;
    this.events.onRelease();
    let steps = 0;
    let axis: 'x' | 'y' = d.axis ?? 'x';
    let exit = false;
    let maxIn = 0;
    let minIn = 0;
    if (cur) {
      axis = cur.axis;
      maxIn = d.exitAxis === axis && d.exitSign > 0 ? d.inBoardPos[axis] : d.pos[axis];
      minIn = -(d.exitAxis === axis && d.exitSign < 0 ? d.inBoardPos[axis] : d.neg[axis]);
      if (d.exitAxis === axis && d.exitSign > 0 && cur.off > maxIn + 0.45) {
        exit = true;
        steps = d.exitK;
      } else if (d.exitAxis === axis && d.exitSign < 0 && cur.off < minIn - 0.45) {
        exit = true;
        steps = -d.exitK;
      } else {
        steps = Math.round(Math.max(minIn, Math.min(maxIn, cur.off)));
      }
    }
    if (steps !== 0) {
      const dx = axis === 'x' ? Math.sign(steps) : 0;
      const dy = axis === 'y' ? Math.sign(steps) : 0;
      let magnitude = Math.abs(steps);
      // Ледяная колея запрещает часть точек остановки (applyMove вернёт null).
      // Вместо снапа в начало «доводим» жест вперёд до ближайшей легальной точки
      // в ту же сторону — так отпускание на льду не выглядит как баг.
      //
      // Важно: упор в препятствие больше НЕ гарантирует легальную остановку —
      // по новой редакции правила на льду нельзя встать и вынужденно. Полоса
      // может не иметь ни одной легальной точки вперёд, тогда цикл упирается в
      // hardLimit без результата: ход невозможен, отвечаем отдачей.
      const hardLimit = exit ? magnitude : steps > 0 ? maxIn : -minIn;
      let res = applyMove(this.level, this.state, d.idx, dx, dy, magnitude);
      while (!res && !exit && magnitude < hardLimit) {
        magnitude++;
        res = applyMove(this.level, this.state, d.idx, dx, dy, magnitude);
      }
      if (res) {
        this.commit(res, d.idx, exit, dx, dy, magnitude);
        return;
      }
      // легальной остановки в эту сторону нет вовсе — отдача, как при упоре
      this.refuseMove(d.idx, axis);
    } else if (!d.moved) {
      // Фигуру тронули, но не повезли: это тап, а не жест. Отвечаем правилом
      // этой фигуры — «почему она так ездит» спрашивают именно так.
      this.explainAt(this.toSvg(e));
    }
    // снап назад
    el.style.transform = this.pieceTransform(d.idx);
  }

  private commit(res: MoveResult, idx: number, exit: boolean, dx: number, dy: number, steps: number): void {
    const before = this.state.pieces[idx];
    this.state = res.state;
    this.clearHint();
    this.clearRuleTip();
    this.addTracks(idx, before.x, before.y, dx, dy, steps, exit);
    const el = this.pieceEls[idx];
    this.animLock = true;
    if (exit) {
      el.classList.add('exiting');
      const v = exitVector(this.level.exit);
      const def = this.level.pieces[idx];
      const farX = (before.x + v.dx * (steps + 2)) * CELL;
      const farY = (before.y + v.dy * (steps + 2)) * CELL;
      el.style.transform = `translate(${farX}px, ${farY}px)`;
      this.exitTimer = window.setTimeout(() => {
        this.exitTimer = null;
        el.style.display = 'none';
        el.classList.remove('exiting');
        this.animLock = false;
        this.events.onExitDone();
      }, 700);
      void def;
    } else {
      const ps = this.state.pieces[idx];
      el.style.transform = `translate(${ps.x * CELL}px, ${ps.y * CELL}px)`;
      window.setTimeout(() => {
        this.animLock = false;
      }, 140);
    }
    this.refreshCrateBadges();
    this.updateStarVisibility();
    if (res.starCollected && this.starEl && this.level.star) {
      this.starEl.classList.add('collected');
      this.spawnSparkles(this.level.star.x * CELL + CELL / 2, this.level.star.y * CELL + CELL / 2);
    }
    if (exit) this.spawnExitPuff();
    this.updateGateSwitch(res.gateActivated);
    if (res.gateActivated) this.events.onGateSwitch();
    this.updateGate(true);
    this.updatePlanks();
    this.updateFieldChickens();
    if (res.planksBroken.length > 0) {
      this.events.onPlankBroken();
      // Пыль-щепки в месте пролома: без неё разрушение видно только по смене
      // спрайта, а оно происходит под уехавшей фигурой и легко пропускается.
      for (const key of res.planksBroken) {
        const [px, py] = key.split(',').map(Number);
        this.spawnDust(px * CELL + CELL / 2, py * CELL + CELL / 2);
      }
    }
    if (res.chickensHopped) this.events.onChickenHop();
    this.flutterChickens();
    this.events.onCommit(res, idx);
  }

  private addTracks(idx: number, ox: number, oy: number, dx: number, dy: number, steps: number, exit: boolean): void {
    const def = this.level.pieces[idx];
    if (def.kind === 'crate') return;
    const half = CELL / 2;
    const cx1 = ox * CELL + (def.dir === 'h' ? (def.len * CELL) / 2 : half);
    const cy1 = oy * CELL + (def.dir === 'v' ? (def.len * CELL) / 2 : half);
    const cx2 = cx1 + dx * steps * CELL + (exit ? dx * CELL : 0);
    const cy2 = cy1 + dy * steps * CELL + (exit ? dy * CELL : 0);
    const offX = dy !== 0 ? 20 : 0;
    const offY = dx !== 0 ? 20 : 0;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('track');
    g.innerHTML = `
      <line x1="${cx1 - offX}" y1="${cy1 - offY}" x2="${cx2 - offX}" y2="${cy2 - offY}" stroke="rgba(93,64,25,0.3)" stroke-width="7" stroke-linecap="round" stroke-dasharray="14 10"/>
      <line x1="${cx1 + offX}" y1="${cy1 + offY}" x2="${cx2 + offX}" y2="${cy2 + offY}" stroke="rgba(93,64,25,0.3)" stroke-width="7" stroke-linecap="round" stroke-dasharray="14 10"/>`;
    this.tracksLayer.appendChild(g);
    window.setTimeout(() => g.remove(), 2600);
    this.spawnDust(cx1, cy1);
  }

  /** Полупрозрачный коридор, куда фигура может доехать (у целевой — сквозь ворота). */
  private showRange(d: DragInfo): void {
    const def = this.level.pieces[d.idx];
    const ps = this.state.pieces[d.idx];
    const pad = 9;
    const lenX = def.dir === 'h' ? def.len : 1;
    const lenY = def.dir === 'v' ? def.len : 1;
    let html = '';
    if (def.dir === 'h' || def.dir === 'any') {
      const posX = d.exitAxis === 'x' && d.exitSign > 0 ? d.inBoardPos.x : d.pos.x;
      const negX = d.exitAxis === 'x' && d.exitSign < 0 ? d.inBoardPos.x : d.neg.x;
      const extR = d.exitAxis === 'x' && d.exitSign > 0 ? 64 : 0;
      const extL = d.exitAxis === 'x' && d.exitSign < 0 ? 64 : 0;
      if (negX + posX > 0 || extR || extL) {
        html += `<rect x="${(ps.x - negX) * CELL + pad - extL}" y="${ps.y * CELL + pad}"
          width="${(negX + lenX + posX) * CELL - 2 * pad + extR + extL}" height="${lenY * CELL - 2 * pad}"
          rx="16" class="range-strip"/>`;
      }
    }
    if (def.dir === 'v' || def.dir === 'any') {
      const posY = d.exitAxis === 'y' && d.exitSign > 0 ? d.inBoardPos.y : d.pos.y;
      const negY = d.exitAxis === 'y' && d.exitSign < 0 ? d.inBoardPos.y : d.neg.y;
      const extB = d.exitAxis === 'y' && d.exitSign > 0 ? 64 : 0;
      const extT = d.exitAxis === 'y' && d.exitSign < 0 ? 64 : 0;
      if (negY + posY > 0 || extB || extT) {
        html += `<rect x="${ps.x * CELL + pad}" y="${(ps.y - negY) * CELL + pad - extT}"
          width="${lenX * CELL - 2 * pad}" height="${(negY + lenY + posY) * CELL - 2 * pad + extB + extT}"
          rx="16" class="range-strip"/>`;
      }
    }
    this.rangeLayer.innerHTML = html;
  }

  /** Облачко пыли из-под колёс. */
  private spawnDust(cx: number, cy: number): void {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    let html = '';
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 18;
      html += `<circle cx="${cx + Math.cos(a) * r}" cy="${cy + Math.sin(a) * r}" r="${7 + Math.random() * 6}"
        class="dust" style="animation-delay:${i * 45}ms"/>`;
    }
    g.innerHTML = html;
    this.tracksLayer.appendChild(g);
    window.setTimeout(() => g.remove(), 900);
  }

  /** Бёрст искр при сборе звезды (единственные частицы-награда по дизайну). */
  private spawnSparkles(cx: number, cy: number): void {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    let html = '';
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8 + Math.random() * 0.4;
      const dist = 26 + Math.random() * 22;
      const dx = Math.cos(a) * dist;
      const dy = Math.sin(a) * dist;
      const r = 3 + Math.random() * 3;
      html += `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" class="sparkle"
        style="--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px;animation-delay:${i * 12}ms"/>`;
    }
    g.innerHTML = html;
    // поверх фигур: добавляем в конец SVG, чтобы искры не перекрывались машиной
    this.svg.appendChild(g);
    window.setTimeout(() => g.remove(), 800);
  }

  /** Облачко пыли в проёме ворот, когда целевая машина выезжает. */
  private spawnExitPuff(): void {
    const W = this.level.width * CELL;
    const H = this.level.height * CELL;
    const lane = this.level.exit.index * CELL + CELL / 2;
    const mouth =
      this.level.exit.side === 'right'
        ? { x: W, y: lane }
        : this.level.exit.side === 'left'
          ? { x: 0, y: lane }
          : this.level.exit.side === 'bottom'
            ? { x: lane, y: H }
            : { x: lane, y: 0 };
    this.spawnDust(mouth.x, mouth.y);
  }

  /**
   * Отказ по уже начатому жесту: ехать было куда, но легальной точки остановки
   * в эту сторону нет. На ледяных уровнях к отдаче добавляется отдельный сигнал
   * — иначе запрет остановки неотличим от обычного упора в забор.
   */
  private refuseMove(idx: number, axis: 'x' | 'y'): void {
    this.bumpPiece(idx, axis);
    this.events.onBump();
    if (this.level.ice?.length) this.events.onIceBlocked();
  }

  private bumpPiece(idx: number, axis: 'x' | 'y'): void {
    const mid = this.pieceEls[idx].querySelector<SVGGElement>('.mid');
    if (!mid) return;
    mid.classList.remove('bump-x', 'bump-y');
    void mid.getBoundingClientRect();
    mid.classList.add(axis === 'x' ? 'bump-x' : 'bump-y');
  }
}
