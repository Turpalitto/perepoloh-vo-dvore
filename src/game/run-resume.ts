/**
 * Восстановление незавершённой попытки уровня.
 *
 * Проблема, которую решает модуль. Прогресс кампании (звёзды, открытые
 * режимы, медали) сохранялся надёжно, а вот САМА попытка не сохранялась
 * никогда: состояние доски жило только в замыкании `runLevel` и в
 * `BoardView`. На уровнях последних глав оптимум доходит до 32 ходов, то
 * есть до 5–10 минут работы, и любое закрытие вкладки, сворачивание игры
 * системой на слабом устройстве или обрыв фрейма Яндекс.Игр отбрасывали
 * игрока на исходную позицию. Это единственный найденный дефект, который
 * вызывает у игрока не скуку, а обиду, — а обида уводит навсегда.
 *
 * Три ограничения заданы по итогам самокритики плана (см. Red Team в
 * LONG_TERM_GAME_AUDIT.md) и важнее, чем сама фича:
 *
 * 1. ОТПЕЧАТОК УРОВНЯ. Восстановление опасно тем, что данные уровня живут
 *    в репозитории и меняются между версиями игры. Позиция, законная для
 *    старой раскладки, в новой может оказаться внутри стены или на месте
 *    другой машины — и это уже не «странная доска», а падение или порча
 *    попытки. Поэтому вместе с состоянием пишется отпечаток раскладки, и
 *    при любом расхождении попытка молча выбрасывается. Молча — потому что
 *    игроку нечего сообщить: он не виноват и ничего не сделает.
 *
 * 2. ТОЛЬКО КАМПАНИЯ. В лиге, испытаниях деда (три попытки на всё) и в
 *    ежедневном уровне попытка — это и есть предмет соревнования. Дать там
 *    «продолжить с середины» значит разрешить бесконечный перебор с
 *    сохранениями и обесценить медали. Ежедневный уровень вдобавок
 *    привязан к дате, а бой с боссом — к многофазному `BossRun`, который
 *    живёт отдельно от состояния доски.
 *
 * 3. НИКАКОЙ ЗАПИСИ НА КАЖДЫЙ ХОД. Запись дебаунсится (см.
 *    `RUN_SAVE_DEBOUNCE_MS`) и дополнительно сбрасывается на скрытии
 *    страницы. Иначе быстрая серия ходов превращается в серию
 *    синхронных `localStorage.setItem` в том же кадре, что и анимация.
 *
 * Ключ хранения — сосед сейва, а не его поле: `SAVE_VERSION` остаётся
 * прежним, миграция не нужна, а потеря или порча попытки не может
 * задеть прогресс кампании. Слот один: незачем хранить историю
 * заброшенных попыток, игрок возвращается к последней.
 */
import { EMPTY, WALL, buildGrid, pieceCells } from '../core/game';
import type { GameState, PieceState } from '../core/game';
import type { LevelDef } from '../core/types';

/** Версия формата попытки. Несовпадение = попытка выбрасывается. */
export const RUN_VERSION = 1;

/**
 * Пауза перед записью попытки. 400 мс — заметно больше типичного
 * интервала между ходами в серии (игрок тянет фигуры быстрее) и заметно
 * меньше времени, за которое человек успевает закрыть вкладку осознанно.
 * Резкое закрытие покрывается не таймером, а сбросом по `pagehide`.
 */
export const RUN_SAVE_DEBOUNCE_MS = 400;

/** Сохранённая попытка на диске. Поля короткие: строка пишется часто. */
interface StoredRun {
  v: number;
  /** Уровень, к которому относится попытка. */
  id: number;
  /** Отпечаток раскладки: см. `levelFingerprint`. */
  fp: string;
  s: GameState;
}

/**
 * Отпечаток раскладки уровня.
 *
 * Включает ВСЁ, что влияет на законность позиции (размеры, ворота, набор
 * и геометрия фигур, стены, лёд, доски, куры, звезда, кнопка), и вдобавок
 * `par`/`par2`. Последние на законность не влияют, но влияют на
 * справедливость: если уровень перебалансирован, честнее начать заново,
 * чем дать доигрывать по старой цели. Направление ошибки выбрано
 * сознательно — лишний сброс попытки дешевле сломанной доски.
 */
export function levelFingerprint(level: LevelDef): string {
  const parts: string[] = [
    `${level.width}x${level.height}`,
    `e${level.exit.side}${level.exit.index}`,
    `p${level.par}/${level.par2}`
  ];
  for (const p of level.pieces) parts.push(`${p.kind}${p.len}${p.dir}${p.x},${p.y}${p.maxMoves ?? ''}`);
  for (const w of level.walls ?? []) parts.push(`w${w.x},${w.y}${w.kind}`);
  for (const i of level.ice ?? []) parts.push(`i${i.x},${i.y}`);
  for (const k of level.planks ?? []) parts.push(`k${k.x},${k.y}`);
  for (const c of level.chickens ?? []) parts.push(`c${c.a.x},${c.a.y}-${c.b.x},${c.b.y}`);
  if (level.star) parts.push(`s${level.star.x},${level.star.y}`);
  if (level.gateSwitch) parts.push(`g${level.gateSwitch.x},${level.gateSwitch.y}${level.gateSwitch.holdType ?? 'once'}`);
  return parts.join('|');
}

/**
 * Стоит ли вообще сохранять это состояние. Нулевой ход терять нечего, а
 * победа уже учтена в сейве — в обоих случаях запись только мусорит.
 */
export function isRunWorthSaving(state: GameState): boolean {
  return state.moves > 0 && !state.won;
}

export function encodeRun(level: LevelDef, state: GameState): string {
  const payload: StoredRun = { v: RUN_VERSION, id: level.id, fp: levelFingerprint(level), s: state };
  return JSON.stringify(payload);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/**
 * Структурная проверка состояния: форма, типы, диапазоны, соответствие
 * количеств уровню. Ничего не «починяет» — испорченная попытка должна
 * исчезнуть, а не превратиться в правдоподобную ложь.
 */
function structurallyValid(level: LevelDef, s: unknown): s is GameState {
  if (!s || typeof s !== 'object') return false;
  const st = s as Record<string, unknown>;
  if (!isInt(st.moves) || st.moves < 0) return false;
  if (typeof st.starCollected !== 'boolean') return false;
  if (typeof st.gateUnlocked !== 'boolean') return false;
  // Победу не восстанавливаем: она уже записана в сейв, и повторный показ
  // окна победы выдал бы награду второй раз.
  if (st.won !== false) return false;
  // Без кнопки ворота открыты всегда — иначе уровень непроходим.
  if (!level.gateSwitch && st.gateUnlocked !== true) return false;
  if (!Array.isArray(st.pieces) || st.pieces.length !== level.pieces.length) return false;
  for (let i = 0; i < st.pieces.length; i++) {
    const p = st.pieces[i] as Record<string, unknown> | null;
    if (!p || typeof p !== 'object') return false;
    if (!isInt(p.x) || !isInt(p.y) || !isInt(p.used) || typeof p.gone !== 'boolean') return false;
    if (p.used < 0) return false;
    // Уехавшая фигура бывает только у победы, а победу мы уже отвергли.
    if (p.gone) return false;
    const max = level.pieces[i].maxMoves;
    if (max !== undefined && (p.used as number) > max) return false;
  }
  const chickens = level.chickens ?? [];
  if (!Array.isArray(st.chickenAt) || st.chickenAt.length !== chickens.length) return false;
  if (st.chickenAt.some((c) => c !== 'a' && c !== 'b')) return false;
  if (!Array.isArray(st.brokenPlanks)) return false;
  const plankKeys = new Set((level.planks ?? []).map((p) => `${p.x},${p.y}`));
  // Сломанной может быть только та доска, которая на этом уровне есть.
  if (st.brokenPlanks.some((k) => typeof k !== 'string' || !plankKeys.has(k))) return false;
  return true;
}

/**
 * Геометрическая проверка: позиция физически возможна на этом поле.
 *
 * Отпечаток уже отсекает изменение данных уровня, но он не защищает от
 * подделки вручную через DevTools. Стоимость проверки — один `buildGrid`
 * на вход в уровень, то есть ничто; цена пропуска — доска, на которой
 * `applyMove` работает по невозможной сетке.
 */
function geometricallyValid(level: LevelDef, s: GameState): boolean {
  const wallKeys = new Set((level.walls ?? []).map((w) => `${w.x},${w.y}`));
  for (const key of s.brokenPlanks) wallKeys.add(key);
  const chickenKeys = new Set(
    (level.chickens ?? []).map((c, i) => (s.chickenAt[i] === 'a' ? `${c.a.x},${c.a.y}` : `${c.b.x},${c.b.y}`))
  );
  const seen = new Set<string>();
  for (let i = 0; i < level.pieces.length; i++) {
    const cells = pieceCells(level.pieces[i], s.pieces[i] as PieceState);
    if (cells.length === 0) return false;
    for (const c of cells) {
      if (c.x < 0 || c.y < 0 || c.x >= level.width || c.y >= level.height) return false;
      const key = `${c.x},${c.y}`;
      if (wallKeys.has(key) || chickenKeys.has(key)) return false;
      if (seen.has(key)) return false;
      seen.add(key);
    }
  }
  // Сетка обязана собраться без «дыр»: EMPTY/WALL/индекс — и ничего иного.
  const grid = buildGrid(level, s);
  for (const row of grid) {
    for (const cell of row) {
      if (cell !== EMPTY && cell !== WALL && (cell < 0 || cell >= level.pieces.length)) return false;
    }
  }
  return true;
}

/** Куда писать попытку. Абстракция ради тестируемости без localStorage. */
export interface RunStorageIO {
  write(raw: string): void;
  clear(): void;
}

/**
 * Дебаунсер записи попытки.
 *
 * Живёт здесь, а не в UI, по той же причине, по которой здесь лежит
 * валидация: это правило, а не отрисовка, и его нужно проверять тестом с
 * поддельными таймерами, а не глазами.
 *
 * `schedule` вызывается на каждом ходе, но запись происходит не чаще, чем
 * раз в `RUN_SAVE_DEBOUNCE_MS`. `flush` записывает немедленно (уход со
 * страницы), `clear` стирает попытку (победа, рестарт), `dispose`
 * докатывает отложенное и снимает таймер (уход с экрана уровня).
 */
export function createRunSaver(level: LevelDef, io: RunStorageIO): {
  schedule(state: GameState): void;
  flush(): void;
  clear(): void;
  dispose(): void;
} {
  let timer = 0;
  let pending: GameState | null = null;

  const writeNow = (): void => {
    if (!pending) return;
    const state = pending;
    pending = null;
    io.write(encodeRun(level, state));
  };

  const disarm = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
  };

  return {
    schedule(state: GameState): void {
      // Победа и нулевой ход — не «нечего писать», а «надо стереть»: иначе
      // после победы в хранилище осталась бы попытка предпоследнего хода, и
      // возврат на пройденный уровень открывал бы его с середины.
      if (!isRunWorthSaving(state)) {
        pending = null;
        disarm();
        io.clear();
        return;
      }
      // Снимок: `cur` в игре заменяется целиком, но подстраховка дешевле разбора
      // будущего бага о «сохранилось не то состояние».
      pending = {
        pieces: state.pieces.map((p) => ({ ...p })),
        moves: state.moves,
        starCollected: state.starCollected,
        gateUnlocked: state.gateUnlocked,
        won: state.won,
        brokenPlanks: [...state.brokenPlanks],
        chickenAt: [...state.chickenAt]
      };
      if (timer) return;
      timer = setTimeout(() => {
        timer = 0;
        writeNow();
      }, RUN_SAVE_DEBOUNCE_MS) as unknown as number;
    },
    flush(): void {
      disarm();
      writeNow();
    },
    clear(): void {
      pending = null;
      disarm();
      io.clear();
    },
    dispose(): void {
      disarm();
      writeNow();
    }
  };
}

/**
 * Разбор сохранённой попытки. Возвращает состояние только если оно
 * относится к ЭТОМУ уровню в ЭТОЙ его раскладке и физически законно;
 * в любом другом случае — `null`, без исключений и без сообщений.
 */
export function decodeRun(level: LevelDef, raw: string | null): GameState | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const run = parsed as Record<string, unknown>;
  if (run.v !== RUN_VERSION) return null;
  if (run.id !== level.id) return null;
  if (run.fp !== levelFingerprint(level)) return null;
  if (!structurallyValid(level, run.s)) return null;
  const state = run.s as GameState;
  if (!isRunWorthSaving(state)) return null;
  if (!geometricallyValid(level, state)) return null;
  // Копия: дальше состояние живёт в игре, и разобранный JSON не должен
  // остаться разделяемым с чем-либо ещё.
  return {
    pieces: state.pieces.map((p) => ({ ...p })),
    moves: state.moves,
    starCollected: state.starCollected,
    gateUnlocked: state.gateUnlocked,
    won: false,
    brokenPlanks: [...state.brokenPlanks],
    chickenAt: [...state.chickenAt]
  };
}
