import { Page, expect, test } from '@playwright/test';
import { CAMPAIGN_LEVEL_IDS, CAMPAIGN_MAX_STARS } from './campaign-levels';

/** Собираем ошибки страницы; в конце каждого теста их не должно быть. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** Размер клетки в экранных пикселях из viewBox доски. */
async function cellSize(page: Page): Promise<number> {
  const svg = page.getByTestId('board');
  const vb = (await svg.getAttribute('viewBox'))!.split(' ').map(Number);
  const box = (await svg.boundingBox())!;
  const scale = Math.min(box.width / vb[2], box.height / vb[3]);
  return 100 * scale;
}

/** Тянем фигуру мышью на dx/dy клеток. */
async function dragPiece(page: Page, pieceId: string, dxCells: number, dyCells: number): Promise<void> {
  const piece = page.locator(`[data-piece="${pieceId}"]`);
  const box = (await piece.boundingBox())!;
  const cell = await cellSize(page);
  const sx = box.x + Math.min(box.width, cell) / 2;
  const sy = box.y + Math.min(box.height, cell) / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(sx + (dxCells * cell * i) / steps, sy + (dyCells * cell * i) / steps);
  }
  await page.mouse.up();
  await page.waitForTimeout(220);
}

async function touchDragPiece(page: Page, pieceId: string, dxCells: number, dyCells: number): Promise<void> {
  const piece = page.locator(`[data-piece="${pieceId}"]`);
  const box = (await piece.boundingBox())!;
  const cell = await cellSize(page);
  const start = { x: box.x + Math.min(box.width, cell) / 2, y: box.y + Math.min(box.height, cell) / 2 };
  const end = { x: start.x + dxCells * cell, y: start.y + dyCells * cell };
  await page.evaluate(
    ({ pieceId, start, end }) => {
      const pieceElement = document.querySelector(`[data-piece="${pieceId}"]`)!;
      const board = document.querySelector('[data-testid="board"]')!;
      const makeTouch = (target: EventTarget, point: { x: number; y: number }) =>
        new Touch({ identifier: 1, target, clientX: point.x, clientY: point.y });
      const first = makeTouch(pieceElement, start);
      pieceElement.dispatchEvent(
        new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [first], changedTouches: [first] })
      );
      const last = makeTouch(board, end);
      board.dispatchEvent(
        new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [last], changedTouches: [last] })
      );
      board.dispatchEvent(
        new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [last] })
      );
    },
    { pieceId, start, end }
  );
  await page.waitForTimeout(220);
}

/**
 * «Пройдена кампания до N-го уровня» — именно позиция, а не id: уровни,
 * добавленные в середину после релиза, имеют id вне 1..N, и сид по диапазону id
 * оставлял бы их непройденными. Тогда «Продолжить» уводит не туда, а пороги,
 * считающие пройденные уровни (двор, достижения), срабатывают не на том уровне.
 */
async function seedCampaignBefore(page: Page, position: number, starsPerLevel = 1): Promise<void> {
  const clearedIds = CAMPAIGN_LEVEL_IDS.slice(0, position - 1);
  const currentId = CAMPAIGN_LEVEL_IDS[position - 1];
  await page.addInitScript(
    ({ clearedIds, currentId, starsPerLevel }) => {
      const stars = Object.fromEntries(clearedIds.map((id) => [String(id), starsPerLevel]));
      localStorage.setItem(
        'parkovka.save.v1',
        JSON.stringify({ v: 1, stars, sound: true, music: true, lang: 'ru', lastLevel: currentId, targetSkin: 0 })
      );
    },
    { clearedIds, currentId, starsPerLevel }
  );
}

test.describe('Переполох во дворе', () => {
  test('меню загружается без ошибок консоли', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await expect(page.getByTestId('menu-play')).toBeVisible();
    await expect(page.getByTestId('screen-menu')).toContainText('Переполох');
    await expect(page.getByTestId('stars-total')).toContainText(`★ 0 / ${CAMPAIGN_MAX_STARS}`);
    expect(errors).toEqual([]);
  });

  test('настройки меню собраны в компактную раскрывающуюся панель', async ({ page }) => {
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await expect(page.getByTestId('menu-settings')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('menu-settings-panel')).toBeHidden();
    await page.getByTestId('menu-settings').click();
    await expect(page.getByTestId('menu-settings')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('menu-settings-panel')).toBeVisible();
    await expect(page.getByTestId('lang-toggle')).toBeVisible();
    const panelBounds = await page.getByTestId('menu-settings-panel').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: window.innerWidth, height: window.innerHeight };
    });
    expect(panelBounds.left).toBeGreaterThanOrEqual(0);
    expect(panelBounds.top).toBeGreaterThanOrEqual(0);
    expect(panelBounds.right).toBeLessThanOrEqual(panelBounds.width);
    expect(panelBounds.bottom).toBeLessThanOrEqual(panelBounds.height);
  });

  test('уровень 1 проходится перетаскиванием и даёт 3 звезды', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.getByTestId('hint-toast')).toContainText('Потяни');
    await dragPiece(page, 'T', 5.7, 0);
    await expect(page.getByTestId('win-overlay')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('win-stars')).toHaveAttribute('data-stars', '3');
    await expect(page.getByTestId('hud-moves')).toHaveText('1');
    await expect(page.getByTestId('win-achievement')).toContainText('Первый выезд');
    expect(errors).toEqual([]);
  });

  // Границы глав — каждые 12 позиций кампании; 48-я позиция закрывает главу 4.
  for (const { position, chapterComplete } of [
    { position: 42, chapterComplete: false },
    { position: 48, chapterComplete: true }
  ]) {
    test(`завершение главы ${chapterComplete ? 'показывается' : 'не показывается'} после уровня ${position}`, async ({ page }) => {
      await seedCampaignBefore(page, position);
      await page.goto('/?mock=1&lang=ru');
      await page.getByTestId('menu-play').click();
      await expect(page.getByTestId('board')).toBeVisible();
      await page.evaluate(() =>
        (window as unknown as { __e2eWinLevel: () => void }).__e2eWinLevel()
      );
      await expect(page.getByTestId('win-overlay')).toBeVisible();
      if (chapterComplete) await expect(page.getByTestId('win-chapter')).toBeVisible();
      else await expect(page.getByTestId('win-chapter')).toHaveCount(0);
    });
  }

  test('каждый десятый пройденный уровень показывает новое состояние двора', async ({ page }) => {
    await seedCampaignBefore(page, 20);
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('board')).toBeVisible();
    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: () => void }).__e2eWinLevel()
    );

    await expect(page.getByTestId('win-yard-stage')).toContainText('уровня 20');
  });

  test('счётчик ходов, отмена и перезапуск работают', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('board')).toBeVisible();
    // ход на 1 клетку вправо (не выезд)
    await dragPiece(page, 'T', 1, 0);
    await expect(page.getByTestId('hud-moves')).toHaveText('1');
    // запрещённое направление: вертикальный свайп ничего не меняет
    await dragPiece(page, 'T', 0, 2);
    await expect(page.getByTestId('hud-moves')).toHaveText('1');
    // отмена
    await page.getByTestId('btn-undo').click();
    await expect(page.getByTestId('hud-moves')).toHaveText('0');
    await expect(page.getByTestId('btn-undo')).toBeDisabled();
    // ход + перезапуск
    await dragPiece(page, 'T', 2, 0);
    await expect(page.getByTestId('hud-moves')).toHaveText('1');
    await page.getByTestId('btn-restart').click();
    await expect(page.getByTestId('hud-moves')).toHaveText('0');
    expect(errors).toEqual([]);
  });

  test('вернуть ход: redo восстанавливает отменённое, новый ход стирает redo-ветку', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.getByTestId('btn-redo')).toBeDisabled();
    // ход → отмена → вернуть
    await dragPiece(page, 'T', 1, 0);
    await expect(page.getByTestId('hud-moves')).toHaveText('1');
    await page.getByTestId('btn-undo').click();
    await expect(page.getByTestId('hud-moves')).toHaveText('0');
    await expect(page.getByTestId('btn-redo')).toBeEnabled();
    await page.getByTestId('btn-redo').click();
    await expect(page.getByTestId('hud-moves')).toHaveText('1');
    await expect(page.getByTestId('btn-redo')).toBeDisabled();
    // после redo снова можно отменить (redo кладёт ход обратно в undo-стек)
    await expect(page.getByTestId('btn-undo')).toBeEnabled();
    // отмена + новый ход стирают redo-ветку
    await page.getByTestId('btn-undo').click();
    await dragPiece(page, 'T', 2, 0);
    await expect(page.getByTestId('btn-redo')).toBeDisabled();
    // перезапуск чистит обе истории
    await page.getByTestId('btn-undo').click();
    await expect(page.getByTestId('btn-redo')).toBeEnabled();
    await page.getByTestId('btn-restart').click();
    await expect(page.getByTestId('btn-redo')).toBeDisabled();
    await expect(page.getByTestId('btn-undo')).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('живая механика: машина нажимает кнопку, замок ворот открывается, отмена возвращает состояние', async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript(() => {
      const stars = Object.fromEntries(Array.from({ length: 16 }, (_, index) => [String(index + 1), 1]));
      localStorage.setItem(
        'parkovka.save.v1',
        JSON.stringify({ v: 1, stars, sound: true, music: true, lang: 'ru', lastLevel: 17, targetSkin: 0 })
      );
    });
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await page.getByTestId('menu-levels').click();
    await page.getByTestId('level-card-17').click();

    const gateSwitch = page.getByTestId('gate-switch');
    await expect(gateSwitch).toBeVisible();
    await expect(gateSwitch).toHaveAttribute('data-pressed', 'false');
    await expect(page.locator('.gate-lock')).not.toHaveClass(/unlocked/);
    await expect(page.getByTestId('hint-toast')).toContainText('красной кнопке');

    await dragPiece(page, 'F', 0, -2);
    await dragPiece(page, 'T', 1, 0);
    await dragPiece(page, 'B', 0, -2);
    await expect(gateSwitch).toHaveAttribute('data-pressed', 'true');
    await expect(gateSwitch).toHaveClass(/pressed/);
    await expect(page.locator('.gate-lock')).toHaveClass(/unlocked/);

    await page.getByTestId('btn-undo').click();
    await expect(gateSwitch).toHaveAttribute('data-pressed', 'false');
    await expect(page.locator('.gate-lock')).not.toHaveClass(/unlocked/);
    expect(errors).toEqual([]);
  });

  test('прогресс сохраняется после перезагрузки страницы', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await dragPiece(page, 'T', 5.7, 0);
    await expect(page.getByTestId('win-overlay')).toBeVisible();
    await page.getByTestId('btn-win-menu').click();
    await expect(page.getByTestId('stars-total')).toContainText(`★ 3 / ${CAMPAIGN_MAX_STARS}`);
    await page.reload();
    await expect(page.getByTestId('menu-play')).toHaveText('Продолжить');
    await expect(page.getByTestId('stars-total')).toContainText(`★ 3 / ${CAMPAIGN_MAX_STARS}`);
    await page.getByTestId('menu-levels').click();
    await expect(page.getByTestId('level-card-1')).toContainText('★★★');
    await expect(page.getByTestId('level-card-2')).toBeEnabled();
    await expect(page.getByTestId('level-card-3')).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('пауза открывается и закрывается', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await page.getByTestId('btn-pause').click();
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    await page.getByTestId('btn-resume').click();
    await expect(page.getByTestId('pause-overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('пользовательская пауза глушит весь WebAudio и возобновляет его', async ({ page }) => {
    await page.addInitScript(() => {
      class FakeParam {
        value = 0;
        setValueAtTime(value: number) {
          this.value = value;
        }
        linearRampToValueAtTime(value: number) {
          this.value = value;
        }
        exponentialRampToValueAtTime(value: number) {
          this.value = value;
        }
      }
      class FakeNode {
        connect() {
          return this;
        }
        disconnect() {}
      }
      class FakeGain extends FakeNode {
        gain = new FakeParam();
      }
      class FakeAudioContext {
        state = 'running';
        currentTime = 0;
        sampleRate = 8;
        destination = new FakeNode();
        createGain() {
          const gain = new FakeGain();
          const target = window as Window & { __auditMaster?: FakeGain };
          target.__auditMaster ??= gain;
          return gain;
        }
        createBuffer() {
          return { getChannelData: () => new Float32Array(this.sampleRate) };
        }
        createOscillator() {
          return Object.assign(new FakeNode(), {
            type: 'sine',
            frequency: new FakeParam(),
            detune: new FakeParam(),
            start() {},
            stop() {}
          });
        }
        createBiquadFilter() {
          return Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam() });
        }
        createBufferSource() {
          return Object.assign(new FakeNode(), { buffer: null, start() {} });
        }
        async resume() {}
      }
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext });
    });
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    expect(await page.evaluate(() => (window as Window & { __auditMaster?: { gain: { value: number } } }).__auditMaster?.gain.value)).toBe(0.5);
    await page.getByTestId('btn-pause').click();
    expect(await page.evaluate(() => (window as Window & { __auditMaster?: { gain: { value: number } } }).__auditMaster?.gain.value)).toBe(0);
    await page.getByTestId('btn-resume').click();
    expect(await page.evaluate(() => (window as Window & { __auditMaster?: { gain: { value: number } } }).__auditMaster?.gain.value)).toBe(0.5);
  });

  test('язык платформы по умолчанию, ручной переключатель сохраняется', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1');
    await expect(page.getByTestId('menu-play')).toHaveText('Play');
    await page.getByTestId('menu-settings').click();
    await page.getByTestId('lang-toggle').click();
    await expect(page.getByTestId('menu-play')).toHaveText('Oyna');
    await page.reload();
    await expect(page.getByTestId('menu-play')).toHaveText('Oyna');
    await page.getByTestId('menu-settings').click();
    await page.getByTestId('lang-toggle').click();
    await expect(page.getByTestId('menu-play')).toHaveText('Играть');
    await page.getByTestId('menu-settings').click();
    await page.getByTestId('lang-toggle').click();
    await expect(page.getByTestId('menu-play')).toHaveText('Play');
    expect(errors).toEqual([]);
  });

  test('неподдерживаемый язык платформы получает английский fallback', async ({ page }) => {
    await page.goto('/?mock=1&lang=de');
    await expect(page.getByTestId('menu-play')).toHaveText('Play');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('уровень дня открывается и показывает серию в меню', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru');
    await expect(page.getByTestId('menu-daily')).toContainText('Уровень дня');
    await page.getByTestId('menu-daily').click();
    await expect(page.getByTestId('board')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.hud-level')).toContainText('Уровень дня');
    expect(errors).toEqual([]);
  });

  test('гараж: заблокированные скины недоступны, выбор сохраняется', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-garage').click();
    await expect(page.getByTestId('garage-overlay')).toBeVisible();
    await expect(page.getByTestId('skin-0')).toBeEnabled();
    await expect(page.getByTestId('skin-1')).toBeDisabled(); // нужно ★15
    await expect(page.getByTestId('skin-0')).toHaveClass(/selected/);
    await page.getByTestId('garage-close').click();
    await expect(page.getByTestId('garage-overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('гараж: дальний скин виден и выбирается на мобильном экране', async ({ page }) => {
    await page.addInitScript((levelIds: number[]) => {
      // Только первый заход: перезагрузка ниже проверяет сохранение выбора.
      if (sessionStorage.getItem('garage-seeded') === '1') return;
      sessionStorage.setItem('garage-seeded', '1');
      const stars = Object.fromEntries(levelIds.map((id) => [String(id), 3]));
      localStorage.setItem(
        'parkovka.save.v1',
        JSON.stringify({ v: 1, stars, sound: true, music: true, lang: 'ru', lastLevel: 1, targetSkin: 8 })
      );
    }, CAMPAIGN_LEVEL_IDS);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await page.getByTestId('menu-garage').click();
    const selected = page.getByTestId('skin-8');
    await expect(selected).toHaveClass(/selected/);
    await expect(selected).toHaveAttribute('aria-label', 'Золотой автомобиль');
    await expect(selected).toBeInViewport();
    // выбор другого скина остаётся в гараже и сохраняется после перезагрузки
    await page.getByTestId('skin-2').click();
    await expect(page.getByTestId('skin-2')).toHaveClass(/selected/);
    await page.reload();
    await page.getByTestId('menu-garage').click();
    await expect(page.getByTestId('skin-2')).toHaveClass(/selected/);
  });

  test('ежедневный подарок выдаёт две подсказки, достижения открываются отдельно', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-achievements').click();
    await expect(page.getByTestId('screen-achievements')).toBeVisible();
    await expect(page.getByTestId('achievement-firstRide')).not.toHaveClass(/done/);
    await page.getByTestId('btn-back').click();

    await page.getByTestId('menu-gift').click();
    await expect(page.getByTestId('gift-overlay')).toContainText('Получено подсказок: 2');
    await page.getByTestId('gift-close').click();
    await expect(page.getByTestId('menu-gift')).toBeDisabled();
    await expect(page.getByTestId('menu-gift')).toContainText('2');

    // Уровень 1 обучающий — подсказка на нём бесплатна и не тратит выданный
    // токен (осознанно, полировка первой сессии): токен остаётся в копилке.
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('btn-hint')).toContainText('Бесплатная подсказка');
    await page.getByTestId('btn-hint').click();
    await expect(page.locator('.hint-chevron').first()).toBeVisible();
    await expect(page.getByTestId('btn-hint')).toContainText('Бесплатная подсказка');
    await expect(page.getByTestId('mock-ad')).toHaveCount(0);
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('parkovka.save.v1') ?? '{}'));
    expect(save.hintTokens).toBe(2); // токен из подарка не потрачен на обучающем уровне
    expect(errors).toEqual([]);
  });

  test('первая подсказка бесплатна, следующие — после rewarded-рекламы', async ({ page }) => {
    const errors = trackErrors(page);
    // Как и выше: уровни 1-3 обучающие с безлимитной бесплатной подсказкой,
    // экономику free/rewarded проверяем с уровня 4.
    const stars: Record<string, number> = { '1': 3, '2': 3, '3': 3 };
    await page.addInitScript((stars) => {
      localStorage.setItem(
        'parkovka.save.v1',
        JSON.stringify({ v: 1, stars, sound: true, music: true, lang: 'ru', lastLevel: 3, targetSkin: 0 })
      );
    }, stars);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await page.getByTestId('btn-hint').click();
    await expect(page.locator('.hint-chevron').first()).toBeVisible();
    await expect(page.getByTestId('btn-hint')).toContainText('Смотреть рекламу');
    await expect(page.getByTestId('btn-hint')).toContainText('получить подсказку');
    await page.getByTestId('btn-hint').click();
    await expect(page.getByTestId('mock-ad')).toBeVisible();
    await expect(page.getByTestId('btn-hint')).toBeDisabled();
    await page.getByTestId('btn-hint').click({ force: true });
    await expect(page.getByTestId('mock-ad')).toHaveCount(1);
    const close = page.getByTestId('mock-ad-close');
    await expect(close).toBeEnabled({ timeout: 5000 });
    await close.click();
    await expect(page.locator('.hint-chevron').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('управление мышью работает без Pointer Events (fallback старого Safari)', async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'PointerEvent', { configurable: true, value: undefined });
    });
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await dragPiece(page, 'T', 5.7, 0);
    await expect(page.getByTestId('win-overlay')).toBeVisible({ timeout: 5000 });
    expect(errors).toEqual([]);
  });

  test('touch-жест работает без Pointer Events', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Проверяется в мобильном контексте');
    const errors = trackErrors(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'PointerEvent', { configurable: true, value: undefined });
    });
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await touchDragPiece(page, 'T', 5.7, 0);
    await expect(page.getByTestId('win-overlay')).toBeVisible({ timeout: 5000 });
    expect(errors).toEqual([]);
  });

  test('LoadingAPI вызывается до gameplay, системная пауза блокирует игру', async ({ page }) => {
    const errors = trackErrors(page);
    await page.route('**/sdk.js', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `
          window.__sdkCalls = [];
          window.__sdkHandlers = {};
          window.YaGames = { init: async () => ({
            environment: { i18n: { lang: 'ru' } },
            on: (name, handler) => { window.__sdkHandlers[name] = handler; },
            features: {
              LoadingAPI: { ready: () => window.__sdkCalls.push('ready') },
              GameplayAPI: {
                start: () => window.__sdkCalls.push('start'),
                stop: () => window.__sdkCalls.push('stop')
              }
            }
          }) };
        `
      })
    );
    await page.goto('/?lang=ru');
    await expect(page.getByTestId('board')).toBeVisible();
    const calls = await page.evaluate(() => (window as unknown as { __sdkCalls: string[] }).__sdkCalls);
    expect(calls.indexOf('ready')).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf('ready')).toBeLessThan(calls.indexOf('start'));

    await page.evaluate(() =>
      (window as unknown as { __sdkHandlers: Record<string, () => void> }).__sdkHandlers.game_api_pause()
    );
    await expect(page.locator('#app')).toHaveClass(/platform-paused/);
    await page.evaluate(() =>
      (window as unknown as { __sdkHandlers: Record<string, () => void> }).__sdkHandlers.game_api_resume()
    );
    await expect(page.locator('#app')).not.toHaveClass(/platform-paused/);
    expect(errors).toEqual([]);
  });

  test('меню помещается на маленьком портрете и в ландшафте', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await expect(page.getByTestId('menu-play')).toBeVisible();
    await expect(page.getByTestId('menu-daily')).toBeVisible();
    const daily = await page.getByTestId('menu-daily').boundingBox();
    expect(daily).not.toBeNull();
    expect(daily!.width).toBeGreaterThanOrEqual(44);
    expect(daily!.height).toBeGreaterThanOrEqual(44);
    let title = await page.locator('.game-title').boundingBox();
    expect(title).not.toBeNull();
    expect(title!.y).toBeGreaterThanOrEqual(0);

    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByTestId('menu-play')).toBeVisible();
    await expect(page.getByTestId('menu-daily')).toBeVisible();
    title = await page.locator('.game-title').boundingBox();
    expect(title).not.toBeNull();
    expect(title!.x).toBeGreaterThanOrEqual(0);
    expect(title!.y).toBeGreaterThanOrEqual(0);

    await page.setViewportSize({ width: 1920, height: 600 });
    await page.waitForTimeout(400);
    const stage = await page.locator('.screen').boundingBox();
    expect(stage).not.toBeNull();
    expect(Math.max(stage!.width, stage!.height) / Math.min(stage!.width, stage!.height)).toBeLessThanOrEqual(2);
    expect(stage!.height).toBe(600);
  });

  test('критический UI не обрезается на граничных разрешениях', async ({ page }) => {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 360, height: 640 },
      { width: 375, height: 667 },
      { width: 390, height: 844 },
      { width: 412, height: 915 },
      { width: 430, height: 932 },
      { width: 568, height: 320 },
      { width: 667, height: 375 },
      { width: 844, height: 390 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1024, height: 576 },
      { width: 1920, height: 1080 }
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/?mock=1&lang=ru&daytime=day');
      await expect(page.getByTestId('menu-play')).toBeInViewport();
      await expect(page.getByTestId('menu-daily')).toBeInViewport();
      const overflow = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - window.innerWidth,
        y: document.documentElement.scrollHeight - window.innerHeight
      }));
      expect(overflow.x).toBeLessThanOrEqual(1);
      expect(overflow.y).toBeLessThanOrEqual(1);

      const controls = await page.locator('button:visible').evaluateAll((buttons) =>
        buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        })
      );
      for (const control of controls) {
        // Chromium может вернуть 43.99998 для CSS-размера 44px из-за субпиксельного layout.
        expect(control.width).toBeGreaterThanOrEqual(43.99);
        expect(control.height).toBeGreaterThanOrEqual(43.99);
        expect(control.x).toBeGreaterThanOrEqual(-1);
        expect(control.y).toBeGreaterThanOrEqual(-1);
        expect(control.x + control.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(control.y + control.height).toBeLessThanOrEqual(viewport.height + 1);
      }

      await page.getByTestId('menu-play').click();
      await expect(page.getByTestId('board')).toBeInViewport();
      await expect(page.getByTestId('btn-pause')).toBeInViewport();
      await expect(page.getByTestId('btn-restart')).toBeInViewport();
      await expect(page.getByTestId('btn-hint')).toBeInViewport();
    }
  });

  test('активный уровень перестраивается при повороте телефона без перезагрузки', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('board')).toBeInViewport();

    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByTestId('board')).toBeInViewport();
    for (const testId of ['btn-pause', 'btn-restart', 'btn-hint']) {
      const control = page.getByTestId(testId);
      await expect(control).toBeInViewport();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - window.innerWidth,
      y: document.documentElement.scrollHeight - window.innerHeight
    }));
    expect(overflow.x).toBeLessThanOrEqual(1);
    expect(overflow.y).toBeLessThanOrEqual(1);
  });

  test('старые игровые поля снимают глобальные обработчики при навигации', async ({ page }) => {
    await page.addInitScript(() => {
      const target = window as Window & { __blurListeners?: { added: number; removed: number } };
      target.__blurListeners = { added: 0, removed: 0 };
      const originalAdd = window.addEventListener.bind(window);
      const originalRemove = window.removeEventListener.bind(window);
      window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
        if (type === 'blur') target.__blurListeners!.added++;
        originalAdd(type, listener, options);
      }) as typeof window.addEventListener;
      window.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
        if (type === 'blur') target.__blurListeners!.removed++;
        originalRemove(type, listener, options);
      }) as typeof window.removeEventListener;
    });
    await page.goto('/?mock=1&lang=ru');
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('menu-play').click();
      await page.getByTestId('btn-pause').click();
      await page.getByTestId('btn-exit-menu').click();
    }
    await expect.poll(() =>
      page.evaluate(() => (window as Window & { __blurListeners?: { added: number; removed: number } }).__blurListeners)
    ).toEqual({ added: 3, removed: 3 });
  });

  test('Android TV: стрелки, OK, HISTORY_BACK и EXIT управляют меню', async ({ page }) => {
    await page.goto('/?mock=1&tv=1&lang=ru&daytime=day');
    await expect(page.locator('#app')).toHaveClass(/tv-mode/);
    await expect(page.getByTestId('menu-play')).toBeFocused();

    await page.getByTestId('menu-settings').click();
    await expect(page.getByTestId('menu-settings-panel')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('mock-history-back')));
    await expect(page.getByTestId('menu-settings-panel')).toBeHidden();
    await expect(page.getByTestId('menu-play')).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('menu-levels')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('screen-levels')).toBeVisible();

    await page.evaluate(() => window.dispatchEvent(new Event('mock-history-back')));
    await expect(page.getByTestId('screen-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tv-exit-overlay')).toBeVisible();
    await expect(page.getByTestId('tv-exit-stay')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('tv-exit-confirm')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-mock-exit', 'true');
  });

  test('Android TV: первый уровень полностью проходится только пультом', async ({ page }) => {
    await page.goto('/?mock=1&tv=1&lang=ru&daytime=day');
    await expect(page.getByTestId('menu-play')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('board')).toBeFocused();
    await expect(page.getByTestId('tv-controls')).toBeVisible();

    await page.evaluate(() => window.dispatchEvent(new Event('mock-history-back')));
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    await expect(page.getByTestId('btn-resume')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('board')).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.locator('.piece.tv-active')).toHaveCount(1);
    for (let step = 0; step < 4; step++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('win-overlay')).toBeVisible();
    await expect(page.getByTestId('hud-moves')).toHaveText('1');
    await expect(page.getByTestId('win-stars')).toHaveAttribute('data-stars', '3');
  });
});

test.describe('Высшая лига', () => {
  /** Заполняет сейв так, будто кампания пройдена (или нет). */
  async function seedSave(page: Page, over: Record<string, unknown>): Promise<void> {
    await page.addInitScript((data) => {
      localStorage.setItem('parkovka.save.v1', JSON.stringify(data));
    }, { v: 1, stars: { '100': 3 }, sound: true, music: true, lang: 'ru', lastLevel: 100, targetSkin: 0, ...over });
  }

  test('до прохождения кампании лига закрыта (кнопки нет)', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page, { stars: { '99': 3 }, lastLevel: 99, campaignDone: undefined });
    await page.goto('/?mock=1&lang=ru');
    await expect(page.getByTestId('menu-play')).toBeVisible();
    await expect(page.getByTestId('menu-elite')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('после кампании: кнопка лиги, экран, ранг и персист после перезагрузки', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page, { campaignDone: true, campaignDoneAt: '2026-07-22', endingSeen: true });
    await page.goto('/?mock=1&lang=ru');
    await expect(page.getByTestId('menu-elite')).toBeVisible();
    // легендарный скин виден в гараже (10-й свотч)
    await page.getByTestId('menu-garage').click();
    await expect(page.getByTestId('skin-9')).toBeVisible();
    await page.getByTestId('garage-close').click();
    await page.getByTestId('menu-elite').click();
    await expect(page.getByTestId('screen-elite')).toBeVisible();
    await expect(page.getByTestId('elite-rank')).toHaveText('Новичок двора');
    // В сейве три звезды за уровень 100 — источник испытания 25 без модификатора.
    // Серебро по нему засчитывается сразу: переигрывать доказанное не нужно.
    await expect(page.getByTestId('elite-points')).toContainText('25');
    await expect(page.getByTestId('elite-medals')).toContainText('1/25 · 🥇 0');
    // закрываем интро и проверяем 25 карточек
    await page.getByTestId('elite-intro-close').click();
    await expect(page.getByTestId('elite-card-1')).toBeVisible();
    await expect(page.getByTestId('elite-card-25')).toBeVisible();
    await expect(page.getByTestId('elite-card-25')).toContainText('🥈');
    // перезагрузка — лига остаётся открытой
    await page.reload();
    await expect(page.getByTestId('menu-elite')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('испытание запускается на доске с заголовком лиги', async ({ page }) => {
    const errors = trackErrors(page);
    await seedSave(page, { campaignDone: true, endingSeen: true });
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-elite').click();
    await page.getByTestId('elite-intro-close').click();
    await page.getByTestId('elite-card-1').click();
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.getByTestId('screen-game')).toContainText('Испытание 1');
    expect(errors).toEqual([]);
  });

  test('Android TV: лига доступна стрелками и Enter', async ({ page }) => {
    await seedSave(page, { campaignDone: true, endingSeen: true });
    await page.goto('/?mock=1&tv=1&lang=ru&daytime=day');
    await expect(page.locator('#app')).toHaveClass(/tv-mode/);
    // таб «Лига» стоит слева от CTA — доходим стрелкой влево и открываем
    const elite = page.getByTestId('menu-elite');
    for (let i = 0; i < 6 && !(await elite.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('ArrowLeft');
    }
    await expect(elite).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('screen-elite')).toBeVisible();
  });
});

test.describe('Живой двор и дед', () => {
  test('уровень 1: дед-портрет присутствует и произносит реплику, не блокируя управление', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('grandpa-portrait')).toBeVisible();
    // Уровень 1 обучающий — приветствие деда осознанно отложено до ~5с, чтобы
    // не наслаиваться на обучающий hint-toast (не привязано к анимации — это
    // фиксированная задержка `setTimeout`, ждём с запасом).
    await expect(page.getByTestId('grandpa-bubble')).not.toBeEmpty({ timeout: 7000 });
    // управление доступно: уровень проходится, несмотря на пузырь
    await dragPiece(page, 'T', 5.7, 0);
    await expect(page.getByTestId('win-overlay')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('уровень 2: дед здоровается в первые секунды, а не только на первом уровне', async ({ page }) => {
    // Продуктовый аудит требовал убедиться, что «живой двор» реально работает
    // на старте кампании, а не срабатывает один раз на уровне 1: приветствие
    // отложено до конца обучающего toast'а, и легко было отложить его навсегда.
    const errors = trackErrors(page);
    await page.addInitScript(() => {
      localStorage.setItem(
        'parkovka.save.v1',
        JSON.stringify({ v: 1, stars: { '1': 3 }, sound: true, music: true, lang: 'ru', lastLevel: 1, targetSkin: 0 })
      );
    });
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('grandpa-portrait')).toBeVisible();
    await expect(page.getByTestId('grandpa-bubble')).not.toBeEmpty({ timeout: 10_000 });
    expect(errors).toEqual([]);
  });

  test('частые движения не спамят репликами (глобальный кулдаун)', async ({ page }) => {
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('grandpa-portrait')).toBeVisible();
    const textAfter = async () => (await page.getByTestId('grandpa-bubble').textContent()) ?? '';
    // Первый ход на уровне 1 всегда вызывает разовую реакцию «first-move»
    // (не подчиняется отложенному приветствию) — фиксируем её текст как базу.
    await dragPiece(page, 'T', 1, 0);
    await expect.poll(textAfter).not.toBe('');
    const t1 = await textAfter();
    // Дёргаем фигуру ещё дважды — пузырь не должен молотить новую реплику
    // на каждый ход (глобальный кулдаун деда).
    await dragPiece(page, 'T', -1, 0);
    await dragPiece(page, 'T', 1, 0);
    const t2 = await textAfter();
    expect(t2).toBe(t1);
  });

  test('выключение «Живого двора» скрывает деда', async ({ page }) => {
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-settings').click();
    await page.getByTestId('liveyard-toggle').click();
    // Панель настроек с подписями шире прежней и может накрывать CTA — закрываем.
    await page.getByTestId('menu-settings').click();
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('grandpa')).toHaveClass(/grandpa-off/);
  });

  test('prefers-reduced-motion убирает анимацию пузыря', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    // Первый ход даёт мгновенную (не отложенную) реакцию 'first-move' на уровне 1.
    await dragPiece(page, 'T', 1, 0);
    await expect(page.getByTestId('grandpa-bubble')).not.toBeEmpty();
    await expect(page.getByTestId('grandpa-bubble')).toHaveClass(/reduced/);
  });
});

test.describe('Босс уровня 10', () => {
  /** Прогресс до уровня 10 (уровни 1..9 пройдены). */
  async function seedToLevel10(page: Page): Promise<void> {
    const stars: Record<string, number> = {};
    for (let i = 1; i <= 9; i++) stars[String(i)] = 3;
    await page.addInitScript((stars) => {
      localStorage.setItem(
        'parkovka.save.v1',
        JSON.stringify({ v: 1, stars, sound: true, music: true, lang: 'ru', lastLevel: 9, targetSkin: 0 })
      );
    }, stars);
  }
  const readSave = (page: Page) =>
    page.evaluate(() => JSON.parse(localStorage.getItem('parkovka.save.v1') ?? '{}'));

  test('полный многофазный проход: интро → фазы → уникальная победа, прогресс только после победы', async ({ page }) => {
    const errors = trackErrors(page);
    await seedToLevel10(page);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    // вступление деда
    await expect(page.getByTestId('boss-intro')).toBeVisible();
    await expect(page.getByTestId('boss-name')).toHaveText('Тракторный переполох');
    await page.getByTestId('boss-start').click();
    // фаза 1 из 2 + HUD
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.getByTestId('boss-phase')).toHaveText('Фаза 1 из 2');
    await expect(page.getByTestId('screen-game')).toHaveClass(/boss-dust/);
    // босс ещё НЕ пройден до полной победы
    expect((await readSave(page)).bossDone ?? []).not.toContain(10);
    // завершаем фазу 1 (e2e-хук)
    await page.evaluate(() => (window as unknown as { __e2eWinLevel: () => void }).__e2eWinLevel());
    await expect(page.getByTestId('boss-transition')).toBeVisible();
    await expect(page.getByTestId('boss-phase-cleared')).toContainText('Фаза 1 из 2 пройдена');
    // переход во вторую фазу без перезагрузки
    await page.getByTestId('boss-continue').click();
    await expect(page.getByTestId('boss-phase')).toHaveText('Фаза 2 из 2');
    await expect(page.getByTestId('screen-game')).toHaveClass(/boss-smoke/);
    // на свежей фазе отмена недоступна (undo не тянется через границу фаз)
    await expect(page.getByTestId('btn-undo')).toBeDisabled();
    // всё ещё не пройден
    expect((await readSave(page)).bossDone ?? []).not.toContain(10);
    // завершаем финальную фазу → уникальная победа
    await page.evaluate(() => (window as unknown as { __e2eWinLevel: () => void }).__e2eWinLevel());
    await expect(page.getByTestId('boss-victory')).toBeVisible();
    await expect(page.getByTestId('boss-victory-text')).not.toBeEmpty();
    // прогресс сохранён ТОЛЬКО теперь: босс пройден и уровень 10 засчитан
    const save = await readSave(page);
    expect(save.bossDone).toContain(10);
    expect(save.stars['10']).toBeGreaterThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('restart на фазе возвращает ту же фазу, не сбрасывая босса на страницу', async ({ page }) => {
    await seedToLevel10(page);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await page.getByTestId('boss-start').click();
    await expect(page.getByTestId('boss-phase')).toHaveText('Фаза 1 из 2');
    await page.getByTestId('btn-restart').click();
    // остаёмся на той же фазе, доска на месте
    await expect(page.getByTestId('boss-phase')).toHaveText('Фаза 1 из 2');
    await expect(page.getByTestId('board')).toBeVisible();
  });

  test('Android TV: интро и первая фаза босса проходятся пультом', async ({ page }) => {
    await seedToLevel10(page);
    await page.goto('/?mock=1&tv=1&lang=ru&daytime=day');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('boss-start')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.getByTestId('boss-phase')).toHaveText('Фаза 1 из 2');
  });
});

test.describe('Боссы 25/50/75/100', () => {
  const readSave = (page: Page) =>
    page.evaluate(() => JSON.parse(localStorage.getItem('parkovka.save.v1') ?? '{}'));

  /** Прогресс до слота босса (уровни 1..slot-1 пройдены на 3 звезды). */
  async function seedToBoss(page: Page, slot: number, extra: Record<string, unknown> = {}): Promise<void> {
    // «Пройдено до босса» — это позиция в кампании, а не диапазон id: уровни,
    // вставленные между слотами боссов, имеют id вне 1..slot, и без них
    // «Продолжить» уводило бы не на босса, а на первый непройденный новый уровень.
    const slotIndex = CAMPAIGN_LEVEL_IDS.indexOf(slot);
    const stars: Record<string, number> = {};
    for (const id of CAMPAIGN_LEVEL_IDS.slice(0, slotIndex)) stars[String(id)] = 3;
    const previousId = CAMPAIGN_LEVEL_IDS[slotIndex - 1] ?? slot;
    await page.addInitScript(
      ({ stars, previousId, extra }) => {
        localStorage.setItem(
          'parkovka.save.v1',
          JSON.stringify({ v: 1, stars, sound: true, music: true, lang: 'ru', lastLevel: previousId, targetSkin: 0, ...extra })
        );
      },
      { stars, previousId, extra }
    );
  }

  /** Проходит все фазы босса через e2e-хук; возвращается, когда виден финал. */
  async function clearAllPhases(page: Page): Promise<void> {
    for (let guard = 0; guard < 6; guard++) {
      await expect(page.getByTestId('boss-phase')).toBeVisible();
      await page.evaluate(() =>
        (window as unknown as { __e2eWinLevel: (opts?: { starCollected?: boolean }) => void }).__e2eWinLevel({
          starCollected: true
        })
      );
      if (await page.getByTestId('boss-continue').isVisible().catch(() => false)) {
        await page.getByTestId('boss-continue').click();
        continue;
      }
      return; // финальная фаза пройдена — дальше победа/финальная сцена
    }
  }

  for (const boss of [
    { slot: 25, name: 'Куры у ворот' },
    { slot: 50, name: 'Соседский грузовик' },
    { slot: 75, name: 'Буря во дворе' }
  ]) {
    test(`босс ${boss.slot} «${boss.name}»: интро → фазы → победа, прогресс только после победы`, async ({ page }) => {
      const errors = trackErrors(page);
      await seedToBoss(page, boss.slot);
      await page.goto('/?mock=1&lang=ru');
      await page.getByTestId('menu-play').click();
      await expect(page.getByTestId('boss-name')).toHaveText(boss.name);
      await page.getByTestId('boss-start').click();
      expect((await readSave(page)).bossDone ?? []).not.toContain(boss.slot);
      await clearAllPhases(page);
      await expect(page.getByTestId('boss-victory')).toBeVisible();
      const save = await readSave(page);
      expect(save.bossDone).toContain(boss.slot);
      expect(save.stars[String(boss.slot)]).toBeGreaterThanOrEqual(1);
      expect(save.weekly).toMatchObject({ win: 1, perfect: 1 });
      expect(errors).toEqual([]);
    });
  }

  test('пруд и «Полдвора позади» выдаются по счёту звёзд и уровней, а не по слоту босса', async ({ page }) => {
    // Пруд открывается на 150 звёздах, достижение — на 50 пройденных уровнях.
    // Раньше проверка висела на боссе 50, потому что он и был 50-м по счёту;
    // после вставки уровней в середину кампании совпадение исчезло.
    // 49 пройденных × 3 звезды = 147, победа со звездой добавляет ровно 3.
    const errors = trackErrors(page);
    await seedCampaignBefore(page, 50, 3);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('board')).toBeVisible();
    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts?: { starCollected?: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    await expect(page.getByTestId('win-overlay')).toBeVisible();
    await expect(page.getByTestId('win-upgrade')).toContainText('пруд');
    await expect(page.getByTestId('win-achievement')).toContainText('Полдвора позади');
    expect(errors).toEqual([]);
  });

  test('босс 25: выезд без звезды на фазе requireStar не переводит на победу и не пишет прогресс', async ({ page }) => {
    const errors = trackErrors(page);
    await seedToBoss(page, 25);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await page.getByTestId('boss-start').click();
    // фаза 1 (lure) — без требования звезды
    await expect(page.getByTestId('boss-phase')).toHaveText('Фаза 1 из 2');
    await page.evaluate(() => (window as unknown as { __e2eWinLevel: () => void }).__e2eWinLevel());
    await page.getByTestId('boss-continue').click();
    // фаза 2 (gate) — требует звезду; выезд без звезды не засчитывается
    await expect(page.getByTestId('boss-phase')).toHaveText('Фаза 2 из 2');
    await page.evaluate(() => (window as unknown as { __e2eWinLevel: () => void }).__e2eWinLevel());
    await expect(page.getByTestId('boss-objective-unmet')).toBeVisible();
    await expect(page.getByTestId('boss-objective-unmet-text')).not.toBeEmpty();
    await expect(page.getByTestId('boss-victory')).toHaveCount(0);
    expect((await readSave(page)).bossDone ?? []).not.toContain(25);
    // перезапуск фазы возвращает на ту же (2 из 2), доска снова видна
    await page.getByTestId('boss-objective-retry').click();
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.getByTestId('boss-phase')).toHaveText('Фаза 2 из 2');
    // со звездой — фаза засчитывается, награда пишется один раз
    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts?: { starCollected?: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    await expect(page.getByTestId('boss-victory')).toBeVisible();
    const save = await readSave(page);
    expect(save.bossDone).toContain(25);
    expect(save.stars['25']).toBeGreaterThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('босс 100: финальная фаза без звезды не открывает Высшую лигу', async ({ page }) => {
    const errors = trackErrors(page);
    await seedToBoss(page, 100);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await page.getByTestId('boss-start').click();
    // фазы 1 и 2 (tractor/truck) — без требования звезды
    for (let i = 0; i < 2; i++) {
      await expect(page.getByTestId('boss-phase')).toBeVisible();
      await page.evaluate(() => (window as unknown as { __e2eWinLevel: () => void }).__e2eWinLevel());
      await page.getByTestId('boss-continue').click();
    }
    // финальная фаза требует звезду
    await expect(page.getByTestId('boss-phase')).toHaveText('Фаза 3 из 3');
    await page.evaluate(() => (window as unknown as { __e2eWinLevel: () => void }).__e2eWinLevel());
    await expect(page.getByTestId('boss-objective-unmet')).toBeVisible();
    await expect(page.getByTestId('campaign-ending')).toHaveCount(0);
    await expect(page.getByTestId('boss-victory')).toHaveCount(0);
    const save = await readSave(page);
    expect(save.campaignDone).not.toBe(true);
    expect(save.bossDone ?? []).not.toContain(100);
    expect(errors).toEqual([]);
  });

  test('финальный босс 100 открывает Высшую лигу через финальную сцену (один раз)', async ({ page }) => {
    const errors = trackErrors(page);
    await seedToBoss(page, 100);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('boss-name')).toHaveText('Великий переполох');
    await page.getByTestId('boss-start').click();
    await clearAllPhases(page);
    // первый раз: финальная сцена кампании, а не обычная боссовая победа
    await expect(page.getByTestId('campaign-ending')).toBeVisible();
    const save = await readSave(page);
    expect(save.campaignDone).toBe(true);
    expect(save.endingSeen).toBe(true);
    expect(save.bossDone).toContain(100);
    expect(errors).toEqual([]);
  });

  test('повторное прохождение босса 100 не выдаёт награды заново (обычная победа)', async ({ page }) => {
    const errors = trackErrors(page);
    // кампания уже пройдена ранее
    await seedToBoss(page, 100, { campaignDone: true, campaignDoneAt: '2026-07-20', endingSeen: true, bossDone: [100] });
    await page.goto('/?mock=1&lang=ru');
    // После кампании CTA ведёт в Высшую лигу, поэтому повтор босса — через список уровней.
    await page.getByTestId('menu-levels').click();
    await page.getByTestId('level-card-100').click();
    await page.getByTestId('boss-start').click();
    await clearAllPhases(page);
    // повтор: обычная боссовая победа, финальной сцены НЕТ
    await expect(page.getByTestId('boss-victory')).toBeVisible();
    await expect(page.getByTestId('campaign-ending')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('Первая сессия: онбординг, hint без токена, рекламный каденс', () => {
  test('онбординг-рука на уровне 1 исчезает после первого хода', async ({ page }) => {
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('onboarding-hand')).toBeVisible();
    await dragPiece(page, 'T', 1, 0);
    await expect(page.getByTestId('onboarding-hand')).toHaveCount(0);
  });

  test('дед не перекрывает обучающий hint-toast: не появляется, пока тот виден', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('hint-toast')).toBeVisible();
    // пока обучающий toast виден (0-4.8с), дед ещё не должен был появиться
    await page.waitForTimeout(1200);
    await expect(page.getByTestId('hint-toast')).toBeVisible();
    const bubbleDuringToast = await page.getByTestId('grandpa-bubble').textContent();
    expect(bubbleDuringToast).toBe('');
    // после того как toast сошёл — дед может говорить
    await page.waitForTimeout(4200);
    await expect(page.getByTestId('grandpa-bubble')).not.toBeEmpty();
    expect(errors).toEqual([]);
  });

  test('подсказка на уровнях 1-3 не тратит платный токен', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'parkovka.save.v1',
        JSON.stringify({ v: 1, stars: {}, sound: true, music: true, lang: 'ru', lastLevel: 1, targetSkin: 0, hintTokens: 5 })
      );
    });
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('btn-hint')).toContainText('Бесплатная подсказка');
    await page.getByTestId('btn-hint').click();
    await page.waitForTimeout(300);
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('parkovka.save.v1') ?? '{}'));
    expect(save.hintTokens).toBe(5); // токен не потрачен на обучающем уровне
  });

  test('обычный (не обучающий) уровень 11 тратит токен как раньше', async ({ page }) => {
    const stars: Record<string, number> = {};
    for (let i = 1; i <= 10; i++) stars[String(i)] = 3;
    await page.addInitScript((stars) => {
      localStorage.setItem(
        'parkovka.save.v1',
        JSON.stringify({ v: 1, stars, sound: true, music: true, lang: 'ru', lastLevel: 10, targetSkin: 0, hintTokens: 5 })
      );
    }, stars);
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-levels').click();
    await page.getByTestId('level-card-11').click();
    await expect(page.getByTestId('btn-hint')).toContainText('Подсказки: 5');
    await page.getByTestId('btn-hint').click();
    await page.waitForTimeout(300);
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('parkovka.save.v1') ?? '{}'));
    expect(save.hintTokens).toBe(4);
  });

  test('нет рекламы (mock-ad) на уровнях 1-5 при быстром прохождении', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru');
    for (let i = 0; i < 5; i++) {
      await page.getByTestId(i === 0 ? 'menu-play' : 'btn-next').click();
      await expect(page.getByTestId('board')).toBeVisible();
      await expect(page.getByTestId('mock-ad')).toHaveCount(0);
      const piece = page.locator('[data-piece="T"]');
      const box = (await piece.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 700, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(250);
      // на некоторых уровнях требуется решатель — упрощаем: просто проверяем отсутствие рекламы,
      // используя e2e-хук завершения там, где ручной drag не решает уровень.
      if (!(await page.getByTestId('win-overlay').isVisible().catch(() => false))) {
        await page.evaluate(() => (window as unknown as { __e2eWinLevel?: () => void }).__e2eWinLevel?.());
      }
      await expect(page.getByTestId('win-overlay')).toBeVisible();
      await expect(page.getByTestId('mock-ad')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });

  test('grandpaDebug=1 логирует выбор реплики только с query-параметром', async ({ page }) => {
    const debugLogs: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'debug' && m.text().includes('[grandpa]')) debugLogs.push(m.text());
    });
    await page.goto('/?mock=1&lang=ru&grandpaDebug=1');
    await page.getByTestId('menu-play').click();
    await page.waitForTimeout(5300); // дождаться отложенной реплики-встречи
    expect(debugLogs.length).toBeGreaterThan(0);
  });

  test('без query-параметра grandpaDebug лог деда не появляется', async ({ page }) => {
    const debugLogs: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'debug' && m.text().includes('[grandpa]')) debugLogs.push(m.text());
    });
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    await page.waitForTimeout(5300);
    expect(debugLogs.length).toBe(0);
  });

  test('reduced-motion: онбординг-стрелка статична (без цикла свайпа)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?mock=1&lang=ru');
    await page.getByTestId('menu-play').click();
    const hand = page.getByTestId('onboarding-hand');
    await expect(hand).toBeVisible();
    await expect(hand).toHaveClass(/onboarding-hand-static/);
  });
});

test.describe('скриншоты', () => {
  test('основные экраны', async ({ page }, testInfo) => {
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await expect(page.getByTestId('menu-play')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath('screenshots/menu.png') });
    await page.getByTestId('menu-achievements').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: testInfo.outputPath('screenshots/achievements.png') });
    await page.getByTestId('btn-back').click();
    await page.getByTestId('menu-levels').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: testInfo.outputPath('screenshots/levels.png') });
    await page.getByTestId('level-card-1').click();
    await expect(page.getByTestId('board')).toBeVisible();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: testInfo.outputPath('screenshots/game.png') });
    await dragPiece(page, 'T', 5.7, 0);
    await expect(page.getByTestId('win-overlay')).toBeVisible();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: testInfo.outputPath('screenshots/win.png') });
  });
});

test.describe('SDK fallback', () => {
  test('sdkFail=1: игра загружается и играется локально, показывает уведомление, без mock-ad', async ({ page }) => {
    const errors = trackErrors(page);
    // Без ?mock=1 — реальная ветка createPlatform() (SDK недоступен в тестовом
    // окружении в любом случае; sdkFail=1 делает отказ явным и детерминированным).
    await page.goto('/?sdkFail=1&lang=ru&daytime=day');
    await expect(page.getByTestId('menu-play')).toBeVisible();
    await expect(page.getByTestId('platform-fallback-notice')).toBeVisible();
    await expect(page.getByTestId('platform-fallback-notice')).not.toBeEmpty();
    // геймплей не заблокирован
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('board')).toBeVisible();
    await dragPiece(page, 'T', 5.7, 0);
    await expect(page.getByTestId('win-overlay')).toBeVisible();
    // без рекламы/лидербордов платформы
    await expect(page.getByTestId('mock-ad')).toHaveCount(0);
    // единственная ожидаемая запись — наш собственный лог отказа SDK (один раз, не молча)
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('[platform] SDK Яндекс Игр недоступен');
  });
});
