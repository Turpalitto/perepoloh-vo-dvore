import { Page, expect, test } from '@playwright/test';

/**
 * Воронка аналитики: события должны уходить ровно по одному разу на действие.
 * Читаем их через debug-трекер (`?analyticsDebug=1`, доступен только в dev/e2e),
 * который печатает каждое событие в console.debug — то же, что увидит владелец
 * игры при локальной отладке.
 */
type TrackedEvent = { type: string; [key: string]: unknown };

async function eventDetails(page: Page): Promise<TrackedEvent[]> {
  return page.evaluate(
    () => (window as unknown as { __analyticsLog?: { type: string }[] }).__analyticsLog ?? []
  ) as Promise<TrackedEvent[]>;
}

/** Перехватываем console.debug в самой странице — так видны и поля событий. */
async function installLogHook(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: unknown[] = [];
    (window as unknown as { __analyticsLog: unknown[] }).__analyticsLog = log;
    const original = console.debug.bind(console);
    console.debug = (...args: unknown[]) => {
      if (args[0] === '[analytics]' && typeof args[2] === 'object') log.push(args[2]);
      original(...args);
    };
  });
}

const typesOf = (events: TrackedEvent[], type: string) => events.filter((e) => e.type === type);

test.describe('Аналитика: interstitial показан или нет', () => {
  // Событие показа раньше отправлялось ДО вызова платформы, поэтому воронка
  // считала показом любую попытку. Платформа теперь возвращает wasShown, и пара
  // «вызвали → показали/не показали» обязана сходиться в обоих исходах.
  // `?adNow=1` снимает пороги частоты, иначе рекламный путь недостижим.

  test('показанная реклама даёт requested и shown', async ({ page }) => {
    await installLogHook(page);
    await page.goto('/?mock=1&lang=ru&analyticsDebug=1&adNow=1');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('board')).toBeVisible();
    await page.evaluate(() => (window as unknown as { __e2eWinLevel: () => void }).__e2eWinLevel());
    await expect(page.getByTestId('win-overlay')).toBeVisible();
    await page.getByTestId('btn-next').click();

    const close = page.getByTestId('mock-ad-close');
    await expect(close).toBeEnabled({ timeout: 5000 });
    await close.click();

    const events = await eventDetails(page);
    expect(typesOf(events, 'interstitial_requested')).toHaveLength(1);
    expect(typesOf(events, 'interstitial_shown')).toHaveLength(1);
    expect(typesOf(events, 'interstitial_not_shown')).toHaveLength(0);
  });

  test('отказ платформы даёт requested и not_shown, без события показа', async ({ page }) => {
    await installLogHook(page);
    await page.goto('/?mock=1&lang=ru&analyticsDebug=1&adNow=1&adSkip=1');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('board')).toBeVisible();
    await page.evaluate(() => (window as unknown as { __e2eWinLevel: () => void }).__e2eWinLevel());
    await expect(page.getByTestId('win-overlay')).toBeVisible();
    await page.getByTestId('btn-next').click();
    await expect(page.getByTestId('board')).toBeVisible();

    const events = await eventDetails(page);
    await expect(page.getByTestId('mock-ad')).toHaveCount(0);
    expect(typesOf(events, 'interstitial_requested')).toHaveLength(1);
    expect(typesOf(events, 'interstitial_shown')).toHaveLength(0);
    expect(typesOf(events, 'interstitial_not_shown')).toHaveLength(1);
  });
});

test.describe('Аналитика: воронка без дублей', () => {
  test('старт уровня и победа дают ровно по одному событию', async ({ page }) => {
    await installLogHook(page);
    await page.goto('/?mock=1&lang=ru&analyticsDebug=1');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('board')).toBeVisible();

    await page.evaluate(() => (window as unknown as { __e2eWinLevel: () => void }).__e2eWinLevel());
    await expect(page.getByTestId('win-overlay')).toBeVisible();

    const events = await eventDetails(page);
    expect(typesOf(events, 'game_start')).toHaveLength(1);
    expect(typesOf(events, 'level_start')).toHaveLength(1);
    expect(typesOf(events, 'level_complete')).toHaveLength(1);

    const start = typesOf(events, 'level_start')[0];
    expect(start.levelId).toBe(1);
    expect(start.sessionLevelNumber).toBe(1);
    expect(start.attemptNumber).toBe(1);

    const complete = typesOf(events, 'level_complete')[0];
    expect(complete.levelId).toBe(1);
    expect(complete.attemptNumber).toBe(1);
    expect(complete.hintUsed).toBe(false);
    expect(typeof complete.durationSeconds).toBe('number');
  });

  test('отмена и возврат хода не порождают событий уровня', async ({ page }) => {
    await installLogHook(page);
    await page.goto('/?mock=1&lang=ru&analyticsDebug=1');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('board')).toBeVisible();

    // один реальный ход, затем undo/redo несколько раз подряд
    const piece = page.locator('[data-piece="T"]');
    const box = (await piece.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();

    for (let i = 0; i < 3; i++) {
      await page.getByTestId('btn-undo').click();
      await page.getByTestId('btn-redo').click();
    }

    const events = await eventDetails(page);
    expect(typesOf(events, 'level_start')).toHaveLength(1);
    expect(typesOf(events, 'first_move')).toHaveLength(1);
    expect(typesOf(events, 'level_complete')).toHaveLength(0);
    expect(typesOf(events, 'level_restart')).toHaveLength(0);
  });

  test('рестарт считается новой попыткой, а не новым уровнем сессии', async ({ page }) => {
    await installLogHook(page);
    await page.goto('/?mock=1&lang=ru&analyticsDebug=1');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('board')).toBeVisible();

    await page.getByTestId('btn-restart').click();
    await page.getByTestId('btn-restart').click();
    await page.evaluate(() => (window as unknown as { __e2eWinLevel: () => void }).__e2eWinLevel());
    await expect(page.getByTestId('win-overlay')).toBeVisible();

    const events = await eventDetails(page);
    expect(typesOf(events, 'level_start')).toHaveLength(1);
    expect(typesOf(events, 'level_restart')).toHaveLength(2);
    const complete = typesOf(events, 'level_complete')[0];
    expect(complete.attemptNumber).toBe(3); // первая попытка + два рестарта
  });

  test('переход на следующий уровень даёт второй level_start с номером 2', async ({ page }) => {
    await installLogHook(page);
    await page.goto('/?mock=1&lang=ru&analyticsDebug=1');
    await page.getByTestId('menu-play').click();
    await page.evaluate(() => (window as unknown as { __e2eWinLevel: () => void }).__e2eWinLevel());
    await page.getByTestId('btn-next').click();
    await expect(page.getByTestId('board')).toBeVisible();

    const events = await eventDetails(page);
    const starts = typesOf(events, 'level_start');
    expect(starts).toHaveLength(2);
    expect(starts[1].levelId).toBe(2);
    expect(starts[1].sessionLevelNumber).toBe(2);
    expect(starts[1].attemptNumber).toBe(1);
  });

  test('rewarded за подсказку: предложение и ровно одно завершающее событие', async ({ page }) => {
    await installLogHook(page);
    // на уровне 11 подсказка платная: бесплатные израсходованы флагом freeHints=0 нельзя,
    // поэтому просто тратим бесплатную и берём вторую — она уже за рекламу
    await page.addInitScript(() => {
      const stars = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), 3]));
      localStorage.setItem(
        'parkovka.save.v1',
        JSON.stringify({ v: 1, stars, sound: false, music: false, lang: 'ru', lastLevel: 11, targetSkin: 0, hintTokens: 0 })
      );
    });
    await page.goto('/?mock=1&lang=ru&analyticsDebug=1');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('board')).toBeVisible();

    await page.getByTestId('btn-hint').click(); // бесплатная подсказка сессии
    await page.getByTestId('btn-hint').click(); // вторая — уже rewarded (mock показывает оверлей)
    await expect(page.getByTestId('mock-ad')).toBeVisible();
    // mock-реклама даёт награду только после явного клика по кнопке — как настоящая
    const claim = page.getByTestId('mock-ad-close');
    await expect(claim).toHaveText('Забрать награду', { timeout: 15_000 });
    await claim.click();
    await expect(page.getByTestId('mock-ad')).toBeHidden();

    const events = await eventDetails(page);
    const offers = typesOf(events, 'rewarded_offer_shown');
    expect(offers).toHaveLength(1);
    expect(offers[0].context).toBe('hint');
    const finished = [...typesOf(events, 'rewarded_completed'), ...typesOf(events, 'rewarded_closed')];
    expect(finished).toHaveLength(1);
    expect(finished[0].context).toBe('hint');
  });

  test('ежедневный уровень даёт daily_started и daily_completed по одному разу', async ({ page }) => {
    await installLogHook(page);
    await page.goto('/?mock=1&lang=ru&analyticsDebug=1');
    await page.getByTestId('menu-daily').click();
    await expect(page.getByTestId('board')).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => (window as unknown as { __e2eWinLevel: () => void }).__e2eWinLevel());
    await expect(page.getByTestId('win-overlay')).toBeVisible();

    const events = await eventDetails(page);
    expect(typesOf(events, 'daily_started')).toHaveLength(1);
    const done = typesOf(events, 'daily_completed');
    expect(done).toHaveLength(1);
    expect(done[0].streak).toBe(1);
  });
});

test('QA-режим не отправляет события в воронку', async ({ page }) => {
  await installLogHook(page);
  await page.goto('/?mock=1&qaTools=1&qa=1&lang=ru&analyticsDebug=0');
  await expect(page.getByTestId('screen-menu')).toBeVisible();
  const events = await eventDetails(page);
  expect(events).toEqual([]);
});
