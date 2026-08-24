import { Page, expect, test } from '@playwright/test';
import { CAMPAIGN_LEVEL_IDS, LAST_CAMPAIGN_LEVEL_ID } from './campaign-levels';

type SaveData = {
  campaignDone?: boolean;
  endingSeen?: boolean;
  endlessBest?: number;
  eliteMedals?: Record<string, number>;
  targetSkin?: number;
  [key: string]: unknown;
};

// Испытания, где кнопка скрыта. Комбинированный модификатор noUndoNoHints
// попадает в оба набора — именно он раньше молча ломал проверки на равенство
// строке 'noUndo' / 'noHints'.
//
// Списки заданы руками намеренно: вывести их из `ELITE_CHALLENGES` значило бы
// сверять конфиг сам с собой. Цена — их надо править при перестановке блока:
// после замены двух испытаний на досках (дивизион 6) порядок стал
// 26 noUndo, 27 noUndoNoHints, 28 noHints, 29 noUndoNoHints, 30 noHints.
const NO_UNDO = new Set([2, 5, 7, 8, 9, 11, 13, 15, 16, 17, 18, 19, 22, 23, 24, 26, 27, 29]);
const NO_HINTS = new Set([10, 11, 12, 14, 16, 17, 19, 20, 21, 23, 24, 27, 28, 29, 30]);

async function seedSave(page: Page, overrides: SaveData = {}): Promise<void> {
  await page.addInitScript((data) => {
    if (sessionStorage.getItem('post-campaign-seeded') === '1') return;
    localStorage.setItem('parkovka.save.v1', JSON.stringify(data));
    sessionStorage.setItem('post-campaign-seeded', '1');
  }, {
    v: 1,
    stars: { [String(LAST_CAMPAIGN_LEVEL_ID)]: 3 },
    sound: true,
    music: true,
    lang: 'ru',
    lastLevel: LAST_CAMPAIGN_LEVEL_ID,
    targetSkin: 0,
    campaignDone: true,
    endingSeen: true,
    ...overrides
  });
}

async function seedBeforeFinalBoss(page: Page): Promise<void> {
  // «Пройдено всё, кроме финала» — по позиции в кампании: уровни, вставленные
  // после релиза, имеют id вне 1..99, и диапазон оставил бы их непройденными,
  // отправив «Продолжить» не на финального босса.
  const beforeFinal = CAMPAIGN_LEVEL_IDS.slice(0, -1);
  const stars = Object.fromEntries(beforeFinal.map((id) => [String(id), 3]));
  await seedSave(page, {
    stars,
    lastLevel: beforeFinal[beforeFinal.length - 1],
    campaignDone: undefined,
    endingSeen: undefined
  });
}

async function readSave(page: Page): Promise<SaveData> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('parkovka.save.v1') ?? '{}'));
}

async function overlapArea(page: Page, first: string, second: string): Promise<number> {
  return page.evaluate(
    ({ first, second }) => {
      const a = document.querySelector<HTMLElement>(first)?.getBoundingClientRect();
      const b = document.querySelector<HTMLElement>(second)?.getBoundingClientRect();
      if (!a || !b) return 0;
      return (
        Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
        Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
      );
    },
    { first, second }
  );
}

async function completeFinalBoss(page: Page): Promise<void> {
  await page.getByTestId('menu-play').click();
  await expect(page.getByTestId('boss-name')).toHaveText('Великий переполох');
  await page.getByTestId('boss-start').click();

  for (let phase = 1; phase <= 3; phase++) {
    await expect(page.getByTestId('boss-phase')).toHaveText(`Фаза ${phase} из 3`);
    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts: { starCollected: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    if (phase < 3) await page.getByTestId('boss-continue').click();
  }

  await expect(page.getByTestId('campaign-ending')).toBeVisible();
}

async function openElite(page: Page): Promise<void> {
  await page.getByTestId('menu-elite').click();
  await expect(page.getByTestId('screen-elite')).toBeVisible();
  const intro = page.getByTestId('elite-intro-close');
  if (await intro.isVisible().catch(() => false)) await intro.click();
  // Экран въезжает анимацией screen-in и до её конца смещён на 12px вниз.
  // Раньше эти миллисекунды съедало закрытие интро; теперь интро показывается
  // один раз за игрока, и измерения геометрии стали читать промежуточный кадр.
  await page
    .getByTestId('screen-elite')
    .evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((a) => a.finished.catch(() => undefined)));
    });
}

test.describe('Post-campaign', () => {
  test('first finale enters Elite League and unlocks persistent rewards', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedBeforeFinalBoss(page);
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await completeFinalBoss(page);

    await expect(page.getByTestId('ending-reward')).toHaveText(
      'Награда: легендарный скин и доступ к мастер-испытаниям',
      { timeout: 7000 }
    );
    await expect(page.getByTestId('ending-enter')).toBeVisible();
    await expect(page.getByTestId('ending-return')).toBeVisible();
    await page.getByTestId('ending-enter').click();
    await expect(page.getByTestId('screen-elite')).toBeVisible();
    await expect(page.getByTestId('elite-intro')).toBeVisible();
    await page.getByTestId('elite-intro-close').click();
    await page.getByTestId('btn-back').click();

    await expect(page.getByTestId('menu-elite')).toBeVisible();
    await expect(page.getByTestId('menu-endless')).toBeVisible();
    await page.getByTestId('menu-garage').click();
    await expect(page.getByTestId('skin-9')).toBeEnabled();
    await page.getByTestId('skin-9').click();
    await expect(page.getByTestId('skin-9')).toHaveClass(/selected/);
    await page.reload();
    await page.getByTestId('menu-garage').click();
    await expect(page.getByTestId('skin-9')).toHaveClass(/selected/);

    const save = await readSave(page);
    expect(save.campaignDone).toBe(true);
    expect(save.endingSeen).toBe(true);
    expect(save.targetSkin).toBe(9);
  });

  test('finale can return to the yard without losing post-campaign unlocks', async ({ page }) => {
    await seedBeforeFinalBoss(page);
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await completeFinalBoss(page);

    await expect(page.getByTestId('ending-return')).toBeVisible({ timeout: 7000 });
    await page.getByTestId('ending-return').click();
    await expect(page.getByTestId('screen-menu')).toBeVisible();
    await expect(page.getByTestId('menu-elite')).toBeVisible();
    await expect(page.getByTestId('menu-endless')).toBeVisible();
  });

  test('all 30 Elite challenges open and enforce their configured modifiers', async ({ page }) => {
    test.setTimeout(120_000);
    // По три медали в каждом из первых пяти дивизионов — иначе следующий
    // блок закрыт и его карточки нельзя открыть кликом (дивизион 6 — новые
    // механики движка — открывается только по трём медалям дивизиона 5).
    const unlockAll = Object.fromEntries(
      [1, 2, 3, 6, 7, 8, 11, 12, 13, 16, 17, 18, 21, 22, 23].map((id) => [String(id), 1])
    );
    await seedSave(page, { eliteMedals: unlockAll });
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await openElite(page);
    await expect(page.locator('.elite-card')).toHaveCount(30);
    await expect(page.locator('.elite-card.locked')).toHaveCount(0);

    for (let id = 1; id <= 30; id++) {
      await page.getByTestId(`elite-card-${id}`).click();
      await expect(page.getByTestId('screen-game')).toContainText(`Испытание ${id}`);
      await expect(page.getByTestId('board')).toBeVisible();

      if (NO_UNDO.has(id)) await expect(page.getByTestId('btn-undo')).toBeHidden();
      else await expect(page.getByTestId('btn-undo')).toBeVisible();
      if (NO_HINTS.has(id)) await expect(page.getByTestId('btn-hint')).toBeHidden();
      else await expect(page.getByTestId('btn-hint')).toBeVisible();

      await page.getByTestId('btn-pause').click();
      await page.getByTestId('btn-exit-menu').click();
      await openElite(page);
    }
  });

  test('divisions gate the league and open on the third medal of the previous block', async ({ page }) => {
    // stars пустые: перенесённые из кампании медали открыли бы блок сами.
    await seedSave(page, { stars: {}, eliteMedals: { '1': 1, '2': 1 } });
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await openElite(page);
    await expect(page.getByTestId('elite-division-1')).toContainText('Дворовый претендент');
    await expect(page.getByTestId('elite-division-2')).toContainText('Бронзовый дивизион');
    // Две медали в первом блоке — второй ещё закрыт.
    await expect(page.getByTestId('elite-card-6')).toBeDisabled();
    await expect(page.getByTestId('elite-division-2')).toContainText('🔒');

    // Третья медаль открывает второй дивизион.
    await page.getByTestId('elite-card-3').click();
    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts: { starCollected: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    await page.getByTestId('elite-back').click();
    await expect(page.getByTestId('elite-card-6')).toBeEnabled();
    await expect(page.getByTestId('elite-division-2')).not.toContainText('🔒');
    // Третий блок остаётся закрытым: его правило считает медали второго.
    await expect(page.getByTestId('elite-card-11')).toBeDisabled();
  });

  test('a remix challenge really plays a rebuilt yard, not the campaign level', async ({ page }) => {
    // Испытание 3 — ремикс уровня 12: отражение плюс добавленная бочка.
    // Проверяем именно то, ради чего ремиксы делались: на экране другой двор.
    // Звёзды по всей кампании нужны, чтобы уровень 12 открывался для сравнения.
    await seedSave(page, {
      stars: Object.fromEntries(CAMPAIGN_LEVEL_IDS.map((id) => [String(id), 3]))
    });
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await openElite(page);
    const card = page.getByTestId('elite-card-3');
    await expect(card).toContainText('Сено и бочка');
    await expect(card).toContainText('Ремикс');
    await expect(card).toHaveAttribute('title', /перестроенный двор «Свежее сено»/);

    await card.click();
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.getByTestId('screen-game')).toContainText('Испытание 3');
    const remixWalls = await page.locator('.layer-walls > g').count();

    // Тот же двор в кампании: у него на одну бочку меньше и другая раскладка.
    await page.getByTestId('btn-pause').click();
    await page.getByTestId('btn-exit-menu').click();
    await page.getByTestId('menu-levels').click();
    await page.getByTestId('level-card-12').click();
    await expect(page.getByTestId('board')).toBeVisible();
    const originWalls = await page.locator('.layer-walls > g').count();
    expect(remixWalls).toBe(originWalls + 1);
  });

  test('three restarts in a challenge do not offer the campaign skip button', async ({ page }) => {
    // «Пропустить за рекламу» умеет только кампанию: пишет звезду по level.id и
    // уходит на следующий уровень списка. В лиге это выбрасывало из режима, а
    // порог в три рестарта здесь берётся легко — режим построен на переигровке.
    await seedSave(page);
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await openElite(page);
    await page.getByTestId('elite-card-1').click();
    await expect(page.getByTestId('board')).toBeVisible();

    for (let i = 0; i < 4; i++) await page.getByTestId('btn-restart').click();
    await expect(page.getByTestId('btn-skip')).toBeHidden();
    await expect(page.getByTestId('screen-game')).toContainText('Испытание 1');
  });

  test('Elite medals improve once, rank up, retry, next and persist', async ({ page }) => {
    // 16 золотых = 800 очков, плюс 25 за серебро, засчитанное по трём звёздам
    // финального уровня кампании (испытание 25 — без модификатора) = 825.
    // Это ещё серебряный ранг; золото за испытание 17 переводит через порог 875.
    const firstSixteenGold = Object.fromEntries(
      Array.from({ length: 16 }, (_, index) => [String(index + 1), 3])
    );
    await seedSave(page, { eliteMedals: firstSixteenGold });
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await openElite(page);
    await expect(page.getByTestId('elite-rank')).toHaveText('Серебряный мастер');
    await expect(page.getByTestId('elite-points')).toContainText('825');

    await page.getByTestId('elite-card-17').click();
    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts: { starCollected: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    await expect(page.getByTestId('elite-result-medal')).toHaveAttribute('data-medal', '3');
    await expect(page.getByTestId('elite-rankup')).toContainText('Золотой мастер');

    await page.getByTestId('elite-retry').click();
    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts: { starCollected: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    await expect(page.getByTestId('elite-result')).toContainText('Лучшее: золото');
    await expect(page.getByTestId('elite-rankup')).toHaveCount(0);

    await page.getByTestId('elite-next').click();
    await expect(page.getByTestId('screen-game')).toContainText('Испытание 18');
    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts: { starCollected: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    await page.getByTestId('elite-back').click();
    await expect(page.getByTestId('elite-rank')).toHaveText('Золотой мастер');
    await expect(page.getByTestId('elite-points')).toContainText('925');

    await page.reload();
    await openElite(page);
    await expect(page.getByTestId('elite-rank')).toHaveText('Золотой мастер');
    const save = await readSave(page);
    expect(save.eliteMedals?.['17']).toBe(3);
    expect(save.eliteMedals?.['18']).toBe(3);
    // Серебро за испытание 25 записано в сейв, а не нарисовано на экране.
    expect(save.eliteMedals?.['25']).toBe(2);
  });

  test('Endless Yard continues, stores best streak and resets a new run', async ({ page }) => {
    test.setTimeout(120_000);
    await seedSave(page);
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await page.getByTestId('menu-endless').click();
    await expect(page.getByTestId('screen-game')).toContainText('Бесконечный двор', { timeout: 30_000 });

    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts: { starCollected: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    await expect(page.getByTestId('endless-streak')).toContainText('серия: 1');
    await expect(page.getByTestId('endless-new-best')).toBeVisible();
    await page.getByTestId('btn-next').click();
    await expect(page.getByTestId('screen-game')).toContainText('Бесконечный двор', { timeout: 30_000 });

    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts: { starCollected: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    await expect(page.getByTestId('endless-streak')).toContainText('серия: 2');
    await page.getByTestId('btn-win-menu').click();
    await expect(page.getByTestId('menu-endless')).toContainText('рекорд: 2');

    await page.reload();
    await expect(page.getByTestId('menu-endless')).toContainText('рекорд: 2');
    await page.getByTestId('menu-endless').click();
    await expect(page.getByTestId('screen-game')).toContainText('Бесконечный двор', { timeout: 30_000 });
    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts: { starCollected: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    await expect(page.getByTestId('endless-streak')).toContainText('серия: 1');
    await expect(page.getByTestId('endless-new-best')).toHaveCount(0);
    expect((await readSave(page)).endlessBest).toBe(2);
  });

  test('finale and the last Elite challenge stay clear of the banner at 320x568', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await seedSave(page, { eliteIntroSeen: true });
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await openElite(page);
    await page.getByTestId('screen-elite').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(page.getByTestId('elite-card-25')).toBeInViewport();
    expect(
      await overlapArea(page, '[data-testid="elite-card-25"]', '[data-testid="mock-banner"]')
    ).toBe(0);

    await page.getByTestId('btn-back').click();
    const beforeFinal = CAMPAIGN_LEVEL_IDS.slice(0, -1);
    const stars = Object.fromEntries(beforeFinal.map((id) => [String(id), 3]));
    await page.evaluate(
      ({ stars, lastLevel }) => {
        localStorage.setItem(
          'parkovka.save.v1',
          JSON.stringify({
            v: 1,
            stars,
            sound: false,
            music: false,
            lang: 'ru',
            lastLevel,
            targetSkin: 0
          })
        );
      },
      { stars, lastLevel: beforeFinal[beforeFinal.length - 1] }
    );
    await page.reload();
    await completeFinalBoss(page);
    await expect(page.getByTestId('ending-reward')).toBeVisible({ timeout: 7000 });
    await expect(page.getByTestId('ending-enter')).toBeInViewport();
    await expect(page.getByTestId('ending-return')).toBeInViewport();
    expect(
      await overlapArea(page, '[data-testid="ending-return"]', '[data-testid="mock-banner"]')
    ).toBe(0);
  });
});

test.describe('Endless: rewarded-восстановление серии', () => {
  // Stage C: заезд, прерванный выходом из режима, предлагается продолжить за
  // rewarded-ролик. «Закончить забег» снимает точку восстановления — после
  // осознанного финала диалог показываться не должен.
  async function seedWithResume(page: Page, streak: number): Promise<void> {
    await page.addInitScript((data) => {
      if (sessionStorage.getItem('post-campaign-seeded') === '1') return;
      localStorage.setItem('parkovka.save.v1', JSON.stringify(data));
      sessionStorage.setItem('post-campaign-seeded', '1');
    }, {
      v: 1,
      stars: { [String(LAST_CAMPAIGN_LEVEL_ID)]: 3 },
      sound: true,
      music: true,
      lang: 'ru',
      lastLevel: LAST_CAMPAIGN_LEVEL_ID,
      targetSkin: 0,
      campaignDone: true,
      endingSeen: true,
      endlessBest: 2,
      endlessResume: streak
    });
  }

  test('прерванная серия продолжается за rewarded-ролик', async ({ page }) => {
    test.setTimeout(60_000);
    await seedWithResume(page, 5);
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await page.getByTestId('menu-endless').click();
    await expect(page.getByTestId('endless-resume')).toBeVisible();
    await expect(page.getByTestId('endless-resume')).toContainText('серия: 5');

    await page.getByTestId('endless-resume-yes').click();
    const close = page.getByTestId('mock-ad-close');
    await expect(close).toBeEnabled({ timeout: 5000 });
    await close.click();

    await expect(page.getByTestId('screen-game')).toContainText('Бесконечный двор', { timeout: 30_000 });
    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts: { starCollected: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    // Серия началась не с нуля: победа на восстановленной серии даёт 6.
    await expect(page.getByTestId('endless-streak')).toContainText('серия: 6');
  });

  test('«Начать заново» сбрасывает серию и снимает точку восстановления', async ({ page }) => {
    test.setTimeout(60_000);
    await seedWithResume(page, 5);
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await page.getByTestId('menu-endless').click();
    await expect(page.getByTestId('endless-resume')).toBeVisible();

    await page.getByTestId('endless-resume-no').click();
    await expect(page.getByTestId('screen-game')).toContainText('Бесконечный двор', { timeout: 30_000 });
    await page.evaluate(() =>
      (window as unknown as { __e2eWinLevel: (opts: { starCollected: boolean }) => void }).__e2eWinLevel({
        starCollected: true
      })
    );
    await expect(page.getByTestId('endless-streak')).toContainText('серия: 1');
    const save = JSON.parse(await page.evaluate(() => localStorage.getItem('parkovka.save.v1') ?? '{}'));
    expect(save.endlessResume).toBe(1);
  });

  test('короткая серия (ниже порога) не предлагает восстановление', async ({ page }) => {
    test.setTimeout(60_000);
    await seedWithResume(page, 2);
    await page.goto('/?mock=1&lang=ru&daytime=day');
    await page.getByTestId('menu-endless').click();
    await expect(page.getByTestId('screen-game')).toContainText('Бесконечный двор', { timeout: 30_000 });
    await expect(page.getByTestId('endless-resume')).toHaveCount(0);
  });
});
