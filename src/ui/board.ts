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
  maxSteps,
  targetIndex
} from '../core/game';
import type { SolveMove } from '../core/solver';
import { CELL, chickenArt, pieceArt, starArt, wallArt, wellArt } from './sprites';

const M = 90; // поля вокруг двора: забор, куры

export interface BoardEvents {
  onPick(): void;
  /** Палец/мышь отпущены (независимо от того, был ли ход). */
  onRelease(): void;
  /** Ход применён; state уже обновлён внутри BoardView. */
  onCommit(res: MoveResult, piece: number): void;
  onBump(): void;
  onGateOpen(): void;
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
  private tracksLayer!: SVGGElement;
  private rangeLayer!: SVGGElement;
  private hintLayer!: SVGGElement;
  private chickenEls: SVGGElement[] = [];
  private gateOpen = false;
  private drag: DragInfo | null = null;
  private animLock = false;
  private exitTimer: number | null = null;

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
    host.appendChild(svg);
    this.svg = svg;
    this.build();
    this.updateGate(false);
    // хук для e2e-тестов и отладки
    (window as unknown as { __board?: BoardView }).__board = this;
    // лонгтап на поле не должен вызывать контекстное меню (требование платформы)
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    svg.addEventListener('pointerdown', this.onDown);
    svg.addEventListener('pointermove', this.onMove);
    svg.addEventListener('pointerup', this.onUp);
    svg.addEventListener('pointercancel', this.onUp);
    window.addEventListener('blur', this.onWindowBlur);
  }

  destroy(): void {
    window.removeEventListener('blur', this.onWindowBlur);
    if (this.exitTimer !== null) clearTimeout(this.exitTimer);
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

    // земля: трава вокруг, утоптанный двор внутри
    let ground = `
      <rect x="${-M}" y="${-M}" width="${W + 2 * M}" height="${H + 2 * M}" fill="#79b34c"/>
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

    // следы колёс
    this.tracksLayer = make('');
    this.tracksLayer.classList.add('layer-tracks');

    // полоса допустимого хода (под фигурами)
    this.rangeLayer = make('');
    this.rangeLayer.classList.add('layer-range');

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
      g.innerHTML = `<g class="mid enter" style="animation-delay:${60 + i * 55}ms"><g class="art"${rotate}>${pieceArt(def)}</g></g>`;
      this.svg.appendChild(g);
      this.pieceEls.push(g);
    }

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

    this.syncPieces(false);
    this.refreshCrateBadges();
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
    return `<g class="gate" data-testid="gate">${panels}</g>`;
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
    this.pieceEls.forEach((el) => el.classList.remove('exiting'));
    this.state = s;
    this.clearHint();
    this.syncPieces(animate);
    this.refreshCrateBadges();
    this.updateStarVisibility();
    this.updateGate(true);
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

  private updateGate(sound: boolean): void {
    const open = exitSteps(this.level, this.state) >= 0 || this.state.won;
    if (open === this.gateOpen) return;
    this.gateOpen = open;
    this.svg.querySelectorAll<SVGGElement>('.gate-panel').forEach((p) => {
      const angle = open ? Number(p.dataset.open) : 0;
      p.style.transform = `rotate(${angle}deg)`;
    });
    if (open && sound) this.events.onGateOpen();
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

  // ---------- ввод ----------

  private toSvg(e: PointerEvent): { x: number; y: number } {
    const r = this.svg.getBoundingClientRect();
    const vbW = this.level.width * CELL + 2 * M;
    const vbH = this.level.height * CELL + 2 * M;
    const scale = Math.min(r.width / vbW, r.height / vbH);
    const ox = (r.width - vbW * scale) / 2;
    const oy = (r.height - vbH * scale) / 2;
    return { x: (e.clientX - r.left - ox) / scale - M, y: (e.clientY - r.top - oy) / scale - M };
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.interactive || this.animLock || this.state.won || this.drag) return;
    const target = e.target as Element;
    const g = target.closest<SVGGElement>('g[data-idx]');
    if (!g) return;
    const idx = Number(g.dataset.idx);
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
      // двигаться некуда: лёгкий бамп как отклик
      this.bumpPiece(idx, def.dir === 'v' ? 'y' : 'x');
      this.events.onBump();
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
      this.svg.setPointerCapture(e.pointerId);
    } catch {
      // синтетические события (тесты) не имеют активного указателя
    }
    this.events.onPick();
    e.preventDefault();
  };

  private currentOffset(e: PointerEvent): { axis: 'x' | 'y'; off: number } | null {
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

  private onMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d) return;
    const cur = this.currentOffset(e);
    if (!cur) return;
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
  };

  private onUp = (e: PointerEvent): void => {
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
    if (cur) {
      axis = cur.axis;
      const maxIn = d.exitAxis === axis && d.exitSign > 0 ? d.inBoardPos[axis] : d.pos[axis];
      const minIn = -(d.exitAxis === axis && d.exitSign < 0 ? d.inBoardPos[axis] : d.neg[axis]);
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
      const res = applyMove(this.level, this.state, d.idx, dx, dy, Math.abs(steps));
      if (res) {
        this.commit(res, d.idx, exit, dx, dy, Math.abs(steps));
        return;
      }
    }
    // снап назад
    el.style.transform = this.pieceTransform(d.idx);
  };

  private commit(res: MoveResult, idx: number, exit: boolean, dx: number, dy: number, steps: number): void {
    const before = this.state.pieces[idx];
    this.state = res.state;
    this.clearHint();
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
    if (res.starCollected && this.starEl) this.starEl.classList.add('collected');
    this.updateGate(true);
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

  private bumpPiece(idx: number, axis: 'x' | 'y'): void {
    const mid = this.pieceEls[idx].querySelector<SVGGElement>('.mid');
    if (!mid) return;
    mid.classList.remove('bump-x', 'bump-y');
    void mid.getBoundingClientRect();
    mid.classList.add(axis === 'x' ? 'bump-x' : 'bump-y');
  }
}
