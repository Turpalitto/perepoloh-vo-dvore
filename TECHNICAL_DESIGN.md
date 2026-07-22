# TECHNICAL_DESIGN — «Переполох во дворе»

## Выбор стека
Сравнивались:
| Вариант | Плюсы | Минусы | Вердикт |
|---|---|---|---|
| Phaser 3 | готовые сцены, спрайты, инпут | +300–400 КБ к сборке, canvas-текст хуже на hidpi, оверкилл для сетки без физики | нет |
| PixiJS | быстрый рендер | те же издержки, рендер не узкое место | нет |
| Canvas 2D вручную | маленькая сборка | ручной hit-testing, ручные анимации, размытость на hidpi без танцев | нет |
| **SVG + DOM (выбрано)** | ~0 КБ зависимостей, чёткость на любом DPI, бесплатный hit-testing (pointer events на группах), CSS-переходы для снапа, легко тестировать в Playwright по data-атрибутам | рендер тысяч объектов — не наш случай (≤20 узлов) | **да** |

Инструменты: **TypeScript (strict) + Vite + Vitest + Playwright**. React не нужен — 5 экранов рендерятся простыми функциями.

## Архитектура
```
src/core/      чистая логика: types, game (движение/столкновения/победа), solver (BFS), validator
src/levels/    levels.json — только данные
src/game/      progression.ts (звёзды/пороги двора), save.ts, audio.ts (WebAudio-синтез)
src/platform/  types.ts (интерфейс Platform), mock.ts, yandex.ts, index.ts (детект)
src/ui/        app.ts (машина экранов), board.ts (SVG-поле + drag), yard.ts (двор-меню), sprites.ts
scripts/solve.ts   отчёт решателя по всем уровням
tests/         unit: game, solver, validator, save, SDK, daily, levels (все 100: валидны, проходимы, par == оптимум)
e2e/           Playwright: загрузка, прохождение, undo, сохранение, мобильный вьюпорт
```
`core` не импортирует DOM; состояние уровня — плоский сериализуемый объект (им же питается undo-стек и сохранение середины уровня не требуется — уровни короткие).

## Формат уровня (levels.json)
```jsonc
{
  "id": 7, "name": "Тесный двор", "width": 6, "height": 6,
  "exit": { "side": "right", "index": 2 },          // ворота: сторона + ряд/колонка
  "gateSwitch": { "x": 0, "y": 1 },                 // optional: кнопка, без неё ворота заперты
  "pieces": [
    { "id": "T", "kind": "target", "x": 0, "y": 2, "len": 2, "dir": "h" },
    { "id": "A", "kind": "truck",  "x": 3, "y": 1, "len": 3, "dir": "v" },
    { "id": "K", "kind": "crate",  "x": 4, "y": 3, "len": 1, "dir": "any", "maxMoves": 2 }
  ],
  "walls": [ { "x": 5, "y": 5, "kind": "hay" } ],
  "star": { "x": 2, "y": 4 },
  "par": 6,          // оптимум BFS — проверяется тестом
  "par2": 8,         // порог 2 звёзд; тест: par2 >= optimalWithStar (если есть звезда)
  "difficulty": "medium",
  "mechanics": ["truck", "crate", "star"],
  "hint": "Ящик можно сдвинуть только дважды"
}
```
Ход = скольжение одной фигуры на любую дистанцию вдоль оси. Ящик (`dir:"any"`) скользит по обеим осям, каждый ход тратит `maxMoves`. Звезда собирается, если любая фигура «прометает» её клетку. Если задан `gateSwitch`, такое же прометание кнопки устанавливает сериализуемый флаг `gateUnlocked`; до этого полный выезд запрещён. Победа — целевая машина полностью покидает поле через ворота; выезд = 1 ход.

## Решатель и валидатор
- **Решатель** — BFS по состояниям. Ключ состояния: позиции всех фигур + остатки ходов ящиков + флаги звезды и разблокировки ворот. Находит: `optimal` (минимум ходов), `optimalWithStar` (минимум с собранной звездой), первый ход кратчайшего пути (используется в игре как подсказка за rewarded).
- **Валидатор**: выход за границы, пересечения, ровно один целевой, соосность целевого с воротами, ворота в границах, неизвестные типы, звезда/кнопка/стены на занятых клетках, лимиты ящиков; затем решатель подтверждает проходимость. Всё это гоняется в `levels.test.ts` для каждого уровня — «ручной уверенности» нет.

## Управление (критерии качества)
- pointer events + `setPointerCapture`; `touch-action: none` на поле — страница не скроллится.
- Захват фигуры → предрасчёт свободного диапазона; движение клампится диапазоном; ось ящика фиксируется после сдвига >0.35 клетки (защита от случайных тапов).
- Отпускание где угодно (в т.ч. вне поля/объекта) → снап к ближайшей допустимой клетке.
- Выезд: у целевой машины диапазон в сторону ворот продлён за край (если путь чист); пересёк порог — победа.
- Повторные касания во время анимации снапа игнорируются до её конца (<120 мс). Resize/поворот — пересчёт viewBox, состояние не теряется.

## Сохранения
`SaveData` хранит звёзды, аудио, язык, скин, последний уровень, daily streak/недельные кубки и факт показа review. Mock — localStorage (`parkovka.save.v1`). Яндекс — `player.setData` с fallback на localStorage. Слияние берёт максимум звёзд/кубков и объединяет дни одной недели.

## Слой Яндекс Игр (по актуальной документации, июль 2026)
- Подключение `/sdk.js` (fallback `https://sdk.games.s3.yandex.net/sdk.js`), `YaGames.init()`.
- `ysdk.features.LoadingAPI?.ready()` после готовности меню; `GameplayAPI?.start()/stop()` на входе/выходе из геймплея, паузе и рекламе.
- `ysdk.adv.showFullscreenAdv({callbacks})` — только между уровнями; каденс и защита первой сессии приходят из `ysdk.getFlags`.
- `ysdk.adv.showRewardedVideo({callbacks})` — подсказка; награда только в `onRewarded`.
- `ysdk.on('game_api_pause'/'game_api_resume')` обрабатывает системные паузы, включая стартовую рекламу; serverTime задаёт честную дату daily.
- Новый leaderboard API `leaderboards.setScore/getEntries`; старые методы оставлены только fallback. Таблицы: `yardstars`, `dailystreak`.
- Детект: скрипт SDK доступен → yandex, иначе (или `?mock=1`) → mock с теми же контрактами (fake-оверлей рекламы, задержки). Игра знает только интерфейс `Platform`.

## Сборка и публикация
- `npm run build` → `dist/` (цель ES2018, base './'). Архив для Яндекс Игр: содержимое `dist/` в zip (index.html в корне). Инструкция — в README.

## Высшая лига двора (Stage A)

**Данные (`SaveData`):** `campaignDone`, `campaignDoneAt`, `endingSeen`, `eliteMedals: Record<challengeId, 1|2|3>`. Всё опционально — старые сейвы грузятся без миграции. `sanitizeSave` валидирует медали (целые 1..3), `mergeSave` берёт максимум по каждому испытанию; очки лиги **деривируются** из медалей (`elitePoints = Σ MEDAL_POINTS[medal]`), поэтому награда не может быть выдана повторно — идемпотентность встроена в модель, а не в флаги «выдано».

**Чистая логика (`src/game/elite.ts`):** `medalForAttempt(challenge, result)` (пороги проверяют moves/star/noHint/noUndo), `elitePoints`, `rankFor`/`nextRank` (пороги 0/80/220/450/750/1050). Всё без DOM, покрыто `tests/elite.test.ts`.

**Испытания (`src/levels/elite-challenges.ts`):** не копируют уровень — ссылаются на `sourceLevelId`; пороги строятся из `par`/`par2` (`buildGoals`), поэтому золото = оптимум решателя (тест проверяет `solve(level).optimal ≤ gold.maxMoves` для всех 25).

**UI:** `campaign-ending.ts` — самодостаточный модуль финальной сцены (только `textContent`, без innerHTML для строк). Экраны лиги/результата — методы `App` (тот же паттерн, что остальные экраны; вынос в контроллер — отложенный P3, чтобы не рефакторить god object перед релизом). Прохождение испытания переиспользует `runLevel` с существующим плечом модификаторов + отслеживанием usedHint/usedUndo/usedRestart.

**Не реализовано:** Stage B (недельный `eliteweekly` + лидерборд), Stage C (endless-множитель + rewarded-восстановление + трофей во дворе), Stage D («Испытание деда»), аналитика `elite_*`.

## Живой двор, дед, боссы

**Поток событий:** core (`applyMove`→`MoveResult`, факты) → BoardView-колбэки (`onCommit/onBump/onGateSwitch`) → App классифицирует в `YardEvent`/`GrandpaEvent` → `YardDirector.react()` (UI). Core о DOM не знает.

**Дед:** чистая логика в `src/game/grandpa.ts` (данные реплик + `pickLine`/`commitLine`, детерминируемо через инъекцию rng), состояние диалога — в UI, персист однократных реплик — `SaveData.grandpaSeen` (union при merge). `YardDirector` (`src/ui/yard-reactions.ts`) держит портрет+пузырь, уважает паузу (`setPaused` из `syncAudioPause` + visibilitychange), reduced-motion и работает субтитром (aria-live).

**Боссы:** `src/game/boss.ts` — `BossLevelDef { phases: BossPhase[] }`, фаза ссылается на `sourceLevelId` (обычный уровень). Проходимость доказывается штатным `solve()` (тест). Состояние прохождения — `BossRun { bossId, phaseIndex, done }` (сериализуемо, `reviveBossRun` валидирует). Никаких изменений core/solver — это осознанно снимает риск для 100 уровней. **Все 5 боссов подключены и играбельны** через generic-оркестрацию в `app.ts` (`startBoss`/`playBossPhase`/`onBossPhaseDone`/`showBossVictory`, без ветвлений `id===N`): `startLevel(id)`→`bossFor(id)`→интро→фаза как `runLevel(subLevel, boss-контекст)`→`onExitDone→completeLevel→onBossPhaseDone`→переход или победа. HUD «Фаза N из M» в шапке. Прогресс кампании (`recordResult`, `markBossDone`) и финал (`completeCampaignFinale` для слота 100) — только после последней фазы. Undo не тянется через границу фаз (каждая фаза — свежий `runLevel`+undoStack); restart перезапускает текущую фазу. e2e-завершение фазы — хук `__e2eWinLevel`, гейтится `import.meta.env.MODE==='e2e'` (в production вырезается). Полное описание — `BOSS_SYSTEM.md`.

## Полировка первой сессии

**Найденный и исправленный баг:** приветствие деда (`level-start`) на уровнях с обучающим `hint`-текстом (1-6, 10) стартовало через 650мс — прямо в окне показа toast'а (виден 0-4800мс), хотя комментарий в коде уже тогда обещал «не наложится». Исправлено: задержка теперь 5000мс, если у уровня есть `hint`-текст, иначе — прежние 650мс (`runLevel` в `app.ts`).

**Onboarding-стрелка и reduced-motion:** `.onboarding-hand` использовала `animation: … infinite`; глобальное `prefers-reduced-motion`-правило схлопывает `animation-iteration-count` до 1, из-за чего бесконечный свайп-цикл рисовался один раз и застывал без смещения — направление не считывалось. Исправлено: при reduced-motion рендерится статичная эмодзи-стрелка (`⬅️➡️⬆️⬇️`) без анимации вместо покачивающейся руки.

**Подсказка на уровнях 1-3:** обучающая, не тратит `hintTokens` и не идёт в rewarded-экономику (`isTutorialLevel` в `runLevel`) — отдельная ветка перед проверкой `spendHintToken()`.

**Дед debug (`?grandpaDebug=1`, dev/e2e):** `pickLineVerbose()` в `grandpa.ts` — та же логика, что `pickLine`, но с прозрачным объяснением (какая реплика выбрана / почему остальные отсеяны / оставшееся время глобального кулдауна). `pickLine` теперь тонкая обёртка над `pickLineVerbose`.

**Звук (`src/game/sound-registry.ts` + `GameAudio.playSample`):** `SampleLoader` — кэш буферов с дедупликацией параллельных загрузок и `hasFailed()`-защитой от повторных сетевых запросов; предупреждение в консоль максимум один раз за ключ, только `import.meta.env.DEV`. `playSample(key, vol, fallback)` пробует сэмпл, при отсутствии — молча зовёт синтезированный fallback; подключено к `star`/`gate`/`switch`/`grandpa`.

**Аналитика (`src/game/analytics.ts`):** типизированный `GameAnalyticsEvent`, no-op трекер по умолчанию, `?analyticsDebug=1` (dev/e2e) переключает на консольный. Wiring: `level_start`/`first_move`/`level_restart`/`hint_used`/`level_complete` в `runLevel`; `boss_start`/`boss_phase_complete`/`boss_complete` в boss-потоке (время босса считается от `startBoss()`, не от текущей фазы — иначе `boss_complete.timeMs` считал бы только последнюю фазу); `session_exit` централизованно в `showMenu()` по `data-testid` текущего экрана.
