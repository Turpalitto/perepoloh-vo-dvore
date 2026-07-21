import { Page, expect, test } from '@playwright/test';

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

test.describe('Переполох во дворе', () => {
  test('меню загружается без ошибок консоли', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await expect(page.getByTestId('menu-play')).toBeVisible();
    await expect(page.getByTestId('screen-menu')).toContainText('Переполох');
    await expect(page.getByTestId('stars-total')).toContainText('★ 0 / 300');
    expect(errors).toEqual([]);
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
    await expect(page.getByTestId('stars-total')).toContainText('★ 3 / 300');
    await page.reload();
    await expect(page.getByTestId('menu-play')).toHaveText('Продолжить');
    await expect(page.getByTestId('stars-total')).toContainText('★ 3 / 300');
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
    await page.getByTestId('lang-toggle').click();
    await expect(page.getByTestId('menu-play')).toHaveText('Oyna');
    await page.reload();
    await expect(page.getByTestId('menu-play')).toHaveText('Oyna');
    await page.getByTestId('lang-toggle').click();
    await expect(page.getByTestId('menu-play')).toHaveText('Играть');
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

  test('скины: заблокированные недоступны, выбор сохраняется', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/?mock=1&lang=ru');
    await expect(page.getByTestId('skin-0')).toBeEnabled();
    await expect(page.getByTestId('skin-1')).toBeDisabled(); // нужно ★15
    await expect(page.getByTestId('skin-0')).toHaveClass(/selected/);
    expect(errors).toEqual([]);
  });

  test('выбранный дальний скин виден в мобильной палитре', async ({ page }) => {
    await page.addInitScript(() => {
      const stars = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [String(index + 1), 3]));
      localStorage.setItem(
        'parkovka.save.v1',
        JSON.stringify({ v: 1, stars, sound: true, music: true, lang: 'ru', lastLevel: 1, targetSkin: 8 })
      );
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?mock=1&lang=ru&daytime=day');
    const row = page.getByTestId('skin-row');
    const selected = page.getByTestId('skin-8');
    await expect(selected).toHaveClass(/selected/);
    await expect(selected).toHaveAttribute('aria-label', 'Золотой автомобиль');
    const [rowBox, selectedBox] = await Promise.all([row.boundingBox(), selected.boundingBox()]);
    expect(rowBox).not.toBeNull();
    expect(selectedBox).not.toBeNull();
    expect(selectedBox!.x).toBeGreaterThanOrEqual(rowBox!.x - 1);
    expect(selectedBox!.x + selectedBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 1);
    expect(await row.evaluate((element) => getComputedStyle(element).scrollbarWidth)).toBe('none');
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

    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('btn-hint')).toContainText('Подсказки: 2');
    await page.getByTestId('btn-hint').click();
    await expect(page.getByTestId('btn-hint')).toContainText('Подсказки: 1');
    await expect(page.getByTestId('mock-ad')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('первая подсказка бесплатна, следующие — после rewarded-рекламы', async ({ page }) => {
    const errors = trackErrors(page);
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
    await expect(page.getByTestId('menu-rules')).toBeVisible();
    const swatch = await page.getByTestId('skin-0').boundingBox();
    expect(swatch).not.toBeNull();
    expect(swatch!.width).toBeGreaterThanOrEqual(44);
    expect(swatch!.height).toBeGreaterThanOrEqual(44);
    let title = await page.locator('.game-title').boundingBox();
    expect(title).not.toBeNull();
    expect(title!.y).toBeGreaterThanOrEqual(0);

    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByTestId('menu-play')).toBeVisible();
    await expect(page.getByTestId('menu-rules')).toBeVisible();
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
      await expect(page.getByTestId('menu-rules')).toBeInViewport();
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
