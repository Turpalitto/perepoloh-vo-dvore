# PROJECT HANDOFF — «Переполох во дворе»

Самодостаточный документ для передачи проекта другому разработчику/IDE. История чата не нужна.

## Актуальный статус (game-feel-and-results)
- Завершён P1 game-feel без изменения core-правил: постоянный selected-state, быстрый drag/commit feedback, мягкий bump при запрещённом ходе, анимация открытия ворот и выезда.
- Победа собрана в последовательность «выезд → реакция двора → подсчёт → награды → CTA»; повторное начисление наград защищено существующей логикой.
- Экран результата показывает номер и название уровня, рекорд ходов и доступный прогресс до следующего улучшения двора.
- Перед победой очищаются временные hint/GO/onboarding-элементы; reduced motion, focus, 44 px targets и aria progressbar сохранены.
- Затронуты `src/game/progression.ts`, `src/game/i18n.ts`, `src/ui/board.ts`, `src/ui/app.ts`, `src/styles.css`.

## Актуальный статус (visual-ui-refresh)
- Ветка на момент передачи: `genspark_ai_developer`.
- Последняя выполненная работа: визуальное обновление главного меню, HUD, навигации и экранов уровней по Product Design/Figma-проходу.
- Figma-файл с направлением: https://www.figma.com/design/6y7TXyLak8rYdNHpbngAI6
- QA-отчёт: `design-qa.md`.
- Финальный мобильный скриншот: `design-qa-mobile.jpg`.
- Изменённые файлы:
  - `src/styles.css` — новая визуальная система: Nunito, светлые HUD-чипы, улучшенный контраст, нижняя мета-навигация, читаемые уровни.
  - `src/ui/app.ts` — замена части emoji на иконки, новая компоновка подсказок/событий/мета-кнопок.
  - `src/ui/icons.ts` — единая точка для Phosphor SVG-иконок.
  - `src/game/i18n.ts` — подписи `menu.stars`/`menu.hints` для ru/en/tr.
  - `package.json`, `package-lock.json` — добавлены `@fontsource/nunito` и `@phosphor-icons/core`.
- Проверки этого UI-прохода: `typecheck`, `lint`, `npm test` (569 passed), `e2e` (280 passed, 1 skipped), `build`, `verify:dist` — зелёные.
- Локальный preview после сборки запускался на `http://127.0.0.1:4173/`.

## Что делать дальше другой IDE
- P1: пройтись по экранам, которые ещё выглядят старее главного меню: победа, пауза, настройки, достижения, гараж, weekly/daily, boss intro/victory, elite league. Привести их к той же системе иконок, контраста, отступов и типографики.
- P1: после дальнейших UI-правок повторять проверку размеров 320×568, 390×844, 430×932 и desktop 1280×720/1920×1080: текст не должен вылезать из кнопок/карточек, UI не должен перекрывать игровое поле.
- P1: сохранить accessibility: `prefers-reduced-motion`, aria-label у icon-only кнопок, контраст текста не ниже WCAG AA.
- P2: заменить оставшиеся emoji на Phosphor или авторские SVG/ассеты там, где это повышает цельность интерфейса.
- P2: добавить более явное текстовое сообщение о недоступном действии; сейчас причина показывается через существующее правило/tooltip.
- P2: добавить пустые/ошибочные состояния там, где игрок может растеряться.
- P3: при необходимости добавить декоративную живость двора (снег/облака) и дополнительные аудиоварианты новых победных состояний.
- P3: не декомпозировать `src/ui/app.ts` ради красоты; делать это только если новая фича реально требует выделения ScreenRouter/BossController/ResultScreen.

## Жёсткие ограничения для следующей IDE
- Не менять `src/core/*`, формат уровней, `par`, solver и правила движения без прямого разрешения владельца.
- Не добавлять случайность в головоломочную логику.
- Не менять формат сохранения без миграции и тестов старых сейвов.
- Не обращаться к `YaGames` вне `src/platform/yandex.ts`.
- Не переписывать проект на другой framework и не добавлять тяжёлый runtime-движок.
- Перед коммитом обязательно: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; для UI ещё `npm run e2e`; перед релизом `npm run verify:dist`.

## Актуальный статус (release-audit-findings)
- Работа начата от актуального `master` (коммит `dde5c4d`).
- `master` содержит: PR #2 (Elite League/живой двор/боссы, merged) и PR #3 (полировка первой сессии, merged, чистая замена закрытого PR #1).
- Ветка `fix/release-audit-findings` (эта работа) исправляет 8 находок независимого релизного аудита:
  1. **Boss objective**: `requireStar` теперь реально проверяется (`bossObjectiveSatisfied()`), выезд без звезды не засчитывается — см. `BOSS_SYSTEM.md`.
  2. **Leaderboard API**: 4 запроса на открытие экрана → 2 (`getLeaderboardSnapshot`) + TTL-кэш — см. `TECHNICAL_DESIGN.md`.
  3. **Unhandled errors**: `dangerouslyIgnoreUnhandledErrors` убран, тяжёлые solver-тесты изолированы в `npm run test:solver`, добавлен probe-тест.
  4. **SDK fallback**: `src/platform/local-fallback.ts` — игра не останавливается при сбое SDK.
  5. **Audio hidden/pause**: scheduler'ы ambient/music больше не плодят AudioNode, пока вкладка скрыта/на паузе.
  6. **Audio base-aware paths**: `${BASE_URL}audio/...` вместо абсолютного `/audio/...`.
  7. **SDK getPlayer typing**: `{ scopes: false }` → `getPlayer()` (сверено с yandex.com/dev/games/doc/en/sdk/sdk-player, `scopes` не документирован).
  8. **verify:dist усилен**: проверка на `__e2eWinLevel`, sourcemap, абсолютные `/audio/...`.
- **Тесты (локально):** typecheck ✅ · lint ✅ (2 предсуществующих warning) · unit **488 passed** (356 обычных + 132 solver) · e2e **103 passed, 1 skipped** · solve ✅ 100/100 · build ✅ · verify:dist ✅ **~874 КБ**.
- **PR/CI:** см. финальный отчёт в чате для точного статуса на конец сессии (создание PR — последний шаг).

## Состояние проекта
- **Версия:** 0.2.0 · **Ветка на момент работы:** см. `git branch --show-current`.
- **Полностью готово и проверено:**
  - Головоломка: 100 уровней, BFS-решатель, валидатор (core чистый, без DOM).
  - Платформа: интерфейс `Platform`, mock (dev/e2e) и Яндекс SDK; mock не попадает в production.
  - Прогрессия двора, скины, daily (Worker), weekly, endless, достижения, лидерборды.
  - **Высшая лига** (пост-кампания): 25 мастер-испытаний, медали/очки/ранги, легендарный скин, финальная сцена. Очки деривируются из медалей → награды идемпотентны.
  - **Живой двор + дед**: data-driven реплики, SVG-портрет (7 настроений), пузырь-субтитр, кулдаун/анти-повтор, reduced-motion, настройка «Живой двор».
  - **Постановка боссов**: каждая фаза применяет свой `worldChange`-эффект; меню группирует события и прячет семь вторичных переключателей в компактную панель настроек.
  - **5 боссов (10/25/50/75/100) — все играбельны**: интро, фазы, HUD, уникальная победа; босс 100 открывает лигу (`BOSS_SYSTEM.md`).
  - Локализация ru/en/tr (паритет ключей), Android TV, адаптив 320×568…1920×1080.
- **Частично / fallback:** звук — синтез WebAudio (не финальные сэмплы, см. `AUDIO_ASSETS_REQUIRED.md`).
- **Не сделано:** реальные аудио-сэмплы; недельный лидерборд Высшей лиги `eliteweekly`.

## Архитектурная карта
- **Entry:** `index.html` → `src/main.ts` (создаёт Platform, SaveStore, GameAudio, App).
- **core** (`src/core/`): `types.ts`, `game.ts` (правила движения, чистые функции), `solver.ts` (BFS), `validator.ts`, `levelgen.ts`. Без DOM, всё сериализуемо.
- **levels** (`src/levels/`): `levels.json` (100 уровней), `elite-challenges.ts` (25 испытаний, деривируют пороги из par/par2).
- **platform** (`src/platform/`): `types.ts` (`Platform`), `mock.ts`, `yandex.ts`, `index.ts` (выбор реализации).
- **game** (`src/game/`): `save.ts`, `audio.ts`, `i18n.ts`, `progression.ts`, `daily*.ts`, `weekly.ts`, `endless.ts`, `achievements.ts`, `season.ts`, `elite.ts`, **`grandpa.ts`**, **`boss.ts`**.
- **ui** (`src/ui/`): `app.ts` (god object-контроллер экранов), `board.ts` (`BoardView`: SVG-поле, ввод), `sprites.ts`, `thumbnail.ts`, `yard.ts`, `campaign-ending.ts`, **`yard-reactions.ts`** (`YardDirector`).
- **tests/**, **e2e/**, **scripts/** (`solve.ts`, `verify-dist.ts`, генераторы).

## Поток обычного уровня
1. `App.startLevel(id)` → `store.setLastLevel` → `bossFor(id)` (нет) → `runLevel(level)`.
2. `runLevel` рисует HUD+`BoardView`, создаёт `YardDirector`, ставит `setGameplay(true)`.
3. Игрок тянет фигуры → `BoardView` считает ход через `applyMove` (core) → колбэки `onCommit/onBump/onGateSwitch`.
4. `App` эмитит события деда (`react('collision'|'star'|'gate'|'tractor'|…)`).
5. Выезд целевой машины → `onExitDone` → `completeLevel()` → `finishLevel()` (звёзды, достижения, weekly, реклама-каденс, победный overlay).
6. Уровень 100 → `completeCampaignFinale()` (лига).

## Поток босса
См. `BOSS_SYSTEM.md` §2. Кратко: `startLevel(id)`→`bossFor`→`startBoss`(интро)→`playBossPhase`(фаза=`runLevel(subLevel, boss)`)→`onBossPhaseDone`→переход или `showBossVictory`; прогресс/награды только после последней фазы; undo не через границу фаз; restart = текущая фаза.

## SaveData (новые поля этого этапа)
Все поля опциональны → старые сейвы грузятся без миграции. `sanitizeSave` валидирует, `mergeSave` объединяет без потерь, повторный merge идемпотентен.
- `campaignDone?`, `campaignDoneAt?`, `endingSeen?` — финал кампании / Высшая лига (одноразовая сцена).
- `eliteMedals?: Record<id,1|2|3>` — медали (max при merge; очки деривируются).
- `bossDone?: number[]` — пройденные боссы (union при merge).
- `grandpaSeen?: string[]` — показанные однократные/сюжетные реплики деда (union).
- `liveYard?: boolean` (false = выключен).
- **Одноразовые награды:** легендарный скin/лига/финальная сцена гейтятся `campaignDone`+`endingSeen`; `markCampaignDone` возвращает false при повторе → без повторной выдачи. Медали/боссы — max/union, повтор не повышает и не дублирует.

## Команды
- `npm run dev` — дев-сервер (mock). `npm run typecheck` · `npm run lint` · `npm test` · `npm run check` (три вместе).
- `npm run solve` — отчёт решателя. `npm run build` — production в `dist/`. `npm run verify:dist` — проверка архива.
- `npm run e2e` — собирает e2e-билд (mock) и гоняет Playwright (desktop+mobile).

## Важные файлы
| Файл | Назначение | Что нельзя сломать |
|--|--|--|
| `src/core/*` | правила, solver, валидатор | чистота (без DOM), детерминизм, `par==оптимум` |
| `src/levels/levels.json` | 100 уровней | не менять расклады/`par` без пересборки solver-тестов |
| `src/game/boss.ts` | данные+контроллер боссов | сериализуемость `BossRun`, проходимость фаз |
| `src/ui/app.ts` | оркестрация экранов и боссов | generic boss-поток (без `id===N`), одноразовые награды |
| `src/game/save.ts` | сейв | загрузка старых сейвов, идемпотентный merge |
| `src/game/i18n.ts` | локализация | паритет ключей ru/en/tr |
| `src/platform/yandex.ts` | SDK | сверять API по докам Яндекса; таймаут рекламы |

## Известные риски
- `app.ts` — god object (~1900 строк). Осознанно не рефакторим перед релизом; боссы/лига добавлены отдельными методами, логика — в чистых модулях.
- Звук — синтез, не финал.
- Промежуточное boss-состояние не персистится (перезагрузка → босс заново).
- Реклама Яндекса: поведение колбэков подтверждается только на живой платформе (есть защитный таймаут 30 с).

## Следующие задачи
- **P1:** реальные аудио-сэмплы (`AUDIO_ASSETS_REQUIRED.md`); человеческая UX-приёмка деда/боссов (раздражает ли, читаемость).
- **P2:** недельный чемпионат Высшей лиги + лидерборд `eliteweekly`.
- **P3:** декомпозиция `app.ts` (AdController/ScreenRouter/BossController) — только под конкретную фичу, с прогоном `check`+`e2e`.

## Правила дальнейшей разработки
- Не ломать solver; не менять базовые правила 100 уровней.
- Не зашивать боссов в `App` через `id===N` — только data-driven (`boss.ts`).
- Держать паритет локализации ru/en/tr.
- Проверять TV (Arrow/Enter/Back), старые сейвы, reduced-motion.
- Не добавлять тяжёлые runtime-зависимости.
- Перед коммитом: `npm run check` + `npm run e2e` зелёные, `git diff --check` чист.

## Как проверить вручную (чек-лист)
1. `npm run dev`, `?mock=1`.
2. Уровень 1 → дед-портрет + реплика, куры реагируют, победа → реплика деда.
3. Меню → тумблер «Живой двор» выкл → дед скрыт.
4. Боссы: сейв `stars` 1..(slot-1), `menu-play` → интро (название/завязка) → «Взяться за дело» → HUD «Фаза N из M» → пройти фазы → уникальная победа. Слоты 10/25/50/75/100.
5. Босс 100 (сейв 1..99): финал → финальная сцена → Высшая лига открыта, легендарный скин. Повтор → обычная боссовая победа без повторных наград.
6. `?lang=en|tr` — реплики и боссы переведены.
7. DevTools reduced-motion → пузырь без анимации.
8. Пауза/сворачивание вкладки → дед молчит, звук глохнет.
9. TV: `?tv=1` — интро и фаза босса проходятся Arrow/Enter.
10. Старый сейв без boss/elite-полей — грузится, ничего не сломано.
11. Уровень 1: hint-toast виден сразу, приветствие деда появляется только ПОСЛЕ его исчезновения (~5с) — не одновременно.
12. Уровни 1-3: кнопка подсказки всегда «Бесплатная подсказка», клик не тратит `hintTokens` (проверить в localStorage). С уровня 4 — обычная схема (токен/rewarded).
13. `?grandpaDebug=1` — в консоли видны записи `[grandpa] …` с причиной выбора/отсева реплики; без параметра — их нет.
14. `?analyticsDebug=1` — в консоли `[analytics] …` при событиях (старт уровня, ход, победа); без параметра — тихо.

## Обновление (полировка первой сессии)
Дата: см. `CHANGELOG.md`. Новые модули: `src/game/analytics.ts` (типизированные события воронки, no-op по умолчанию), `src/game/sound-registry.ts` (`SampleLoader`, реестр 19 звуковых ключей, graceful fallback на синтез). Найдены и исправлены 3 UX-бага первой сессии (наслоение приветствия деда на обучающий текст, платный токен на обучающей подсказке, потеря направления onboarding-стрелки при reduced-motion) — детали в `FIRST_SESSION_DESIGN.md`. `?grandpaDebug=1`/`?analyticsDebug=1` — dev/e2e-only debug-режимы, гейт по `import.meta.env`. Ручная человеческая UX-приёмка — `UX_ACCEPTANCE_CHECKLIST.md`, не выполнена (требует владельца игры на реальном устройстве).
