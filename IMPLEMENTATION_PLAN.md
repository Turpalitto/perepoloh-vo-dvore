# IMPLEMENTATION_PLAN

## Этап 1 — проектирование ✅
Окружение изучено (Node 24, npm 11). Документация Яндекс SDK проверена (init / LoadingAPI.ready / GameplayAPI / adv c callbacks). Решения зафиксированы в PRODUCT_SPEC / GAME_DESIGN / TECHNICAL_DESIGN.

## Этап 2 — чистая логика ✅
- [x] `core/types.ts`, `core/game.ts`: сетка, диапазоны движения, применение хода, звезда, выезд, победа
- [x] `core/solver.ts`: BFS, optimal / optimalWithStar / подсказка, лимит состояний
- [x] `core/validator.ts`
- [x] unit-тесты game/solver/validator — 37 зелёных

## Этап 3 — первый играбельный уровень ✅
- [x] SVG-поле, спрайты техники, ворота с анимацией, забор, куры
- [x] drag-управление (мышь+touch), снап, клампы по препятствиям, бамп-отдача
- [x] победа с анимацией выезда, счётчик ходов, undo, рестарт
- [x] адаптив 360×800, 1280×720, альбомная ориентация

## Этап 4 — вертикальный срез ✅
- [x] кампания в JSON (сейчас 116 уровней, число растёт), восемь глав-боссов и финальный босс, par из решателя
- [x] экраны: загрузка, меню-двор, выбор уровня, пауза, победа со звёздами
- [x] прогрессия двора (12 этапов), 9 скинов, 12 достижений, daily/weekly, подарки-подсказки, Share API, сохранение, WebAudio-звук + музыка
- [x] platform: mock + yandex, lifecycle, Remote Config, два лидерборда, review, interstitial / rewarded

## Этап 5 — проверка ✅
- [x] typecheck — чисто
- [x] unit: достижения, SDK, daily/save и оптимум всех уровней кампании (актуальные числа — `GENERATED_PROJECT_STATS.md`)
- [x] production build: отдельный Worker для daily, основной JS около 42 КБ gzip
- [x] Playwright e2e: desktop/mobile, включая 360×640 и 844×390
- [x] консоль без ошибок (mock-режим; вне хостинга Яндекса проба `/sdk.js` даёт ожидаемую 404 с фолбэком)
- [x] скриншоты экранов (`screenshots/`), визуально оценены
- [x] README: запуск, сборка, архив для Яндекс Игр

## Перед публикацией
- Ворота отрисованы для выхода справа (логика поддерживает все стороны; уровни среза используют правый выход).
- Каденс рекламы и пороги удержания требуют A/B-проверки по метрикам реальных игроков.
- Консоль Яндекс Игр должна содержать оба лидерборда и Remote Config; см. `RELEASE_CHECKLIST.md`.

## Высшая лига двора (Stage A — реализовано)
- [x] Поля сейва `campaignDone`/`campaignDoneAt`/`endingSeen`/`eliteMedals` + sanitize + merge (max медали, идемпотентно) + миграция старых сейвов
- [x] `src/game/elite.ts` — медаль за попытку, очки=Σмедалей, ранги (6), награды-раз
- [x] `src/levels/elite-challenges.ts` — 25 испытаний (sourceLevelId + модификатор, пороги из par/par2)
- [x] `src/ui/campaign-ending.ts` — финальная сцена, показ один раз
- [x] Экран лиги, интро, запуск испытания, экран результата с медалью/рангом (app.ts)
- [x] Легендарный скин за прохождение кампании
- [x] Локализация ru/en/tr (218 ключей, паритет)
- [x] Unit-тесты (elite.test.ts, 15) + e2e (8: анлок/экран/персист/испытание/TV)
- [x] typecheck + lint + test + build + verify:dist + e2e — зелёные

## Высшая лига — не реализовано (Stage B/C/D)
- [ ] Stage B: недельный чемпионат `eliteweekly` (10 испытаний/неделя, лидерборд, награда-раз)
- [ ] Stage C: улучшенная endless-серия с множителем + одно rewarded-восстановление + трофей во дворе
- [ ] Stage D: «Испытание деда» (5 испытаний, 3 попытки, бонусы) — только data-model
- [ ] Аналитические события `elite_*` (нет аналитического слоя в проекте)

## Живой двор и дед (реализовано)
- [x] `src/game/yard-events.ts` — YardEvent + RateLimiter + маппинг в события деда
- [x] `src/game/grandpa.ts` — 30 реплик, чистый pickLine (кулдаун/анти-повтор/приоритет/once)
- [x] `src/ui/yard-reactions.ts` — YardDirector: SVG-портрет (7 настроений) + пузырь (aria-live, субтитр)
- [x] Проводка в runLevel: старт/упор/трактор/звезда/ворота/подсказка/рестарт/победа
- [x] SaveData: grandpaSeen (union merge) + liveYard toggle + методы
- [x] Настройка «Живой двор» в меню, голос деда `grandpa` в audio.ts
- [x] Локализация ru/en/tr (275 ключей, паритет); a11y: reduced-motion, субтитры, aria
- [x] Unit (grandpa.test 11) + e2e (4: портрет/анти-спам/выключение/reduced-motion)

## Боссы — ВСЕ 5 ПОДКЛЮЧЕНЫ И ИГРАБЕЛЬНЫ
- [x] `src/game/boss.ts` — 5 боссов (10/25/50/75/100) как последовательность проходимых под-уровней
- [x] Чистый фаза-контроллер (advance/restart/serialize/revive) + локализация (`BOSS_SYSTEM.md`)
- [x] Unit (boss.test 8): структура, проходимость каждой фазы решателем, контроллер
- [x] Generic UI-оркестрация (`startBoss`/`playBossPhase`/`onBossPhaseDone`/`showBossVictory`) без ветвлений `id===N`
- [x] Интро деда, HUD «Фаза N из M», переходы без перезагрузки, уникальная победа, прогресс/награды только после последней фазы, restart фазы, undo не тянется через границу фаз
- [x] Финальный босс 100 открывает Высшую лигу (`completeCampaignFinale`) один раз; повтор — без повторных наград (общая логика с обычным уровнем 100)
- [x] SaveData.bossDone (union merge)
- [x] e2e: босс 10 (полный проход/restart/TV) + боссы 25/50/75/100 (интро→фазы→победа, прогресс только после победы) + босс 100 (открытие лиги / повтор без наград), desktop+mobile; хук завершения фазы гейтится MODE==='e2e'
- [ ] Реальные аудио-сэмплы (см. AUDIO_ASSETS_REQUIRED.md)

## Полировка первой сессии (реализовано)
- [x] Аудит первых 10 уровней чтением кода — найдены и исправлены 3 P0/P1: наслоение приветствия деда на обучающий toast, платный токен на обучающей подсказке, reduced-motion не убирал анимацию onboarding-стрелки (терялось направление)
- [x] `src/game/sound-registry.ts` — SampleLoader (тестируемый, инъекция fetch/decode), реестр 19 ключей, подключено 4 (star/gate/switch/grandpa)
- [x] `src/game/analytics.ts` — типизированные события воронки, no-op default, debug-режим `?analyticsDebug=1`
- [x] `?grandpaDebug=1` — pickLineVerbose с причинами отсева реплик
- [x] Unit: sound-registry (5), analytics (4), grandpa pickLineVerbose (4) — 460 всего
- [x] e2e: 8 новых сценариев первой сессии + правка 5 существующих тестов, сломанных намеренными изменениями таймингов/экономики подсказок — 97 всего
- [x] Документы: FIRST_SESSION_DESIGN.md, UX_ACCEPTANCE_CHECKLIST.md (новые); README/GAME_DESIGN/TECHNICAL_DESIGN/PROJECT_HANDOFF/AUDIT_REPORT/CHANGELOG/AUDIO_ASSETS_REQUIRED обновлены
- [x] typecheck+lint+test(460)+solve+build(865КБ)+verify:dist+e2e(97) — все зелёные

## Release audit findings (реализовано)
- [x] Boss objective: `bossObjectiveSatisfied()` (`src/game/boss.ts`), проверка в `completeLevel()` перед `onBossPhaseDone`; локализованный экран перезапуска фазы
- [x] Leaderboard: `getLeaderboardSnapshot()` (1 запрос/таблицу вместо 2) + TTL-кэш (`src/game/leaderboard-cache.ts`)
- [x] `dangerouslyIgnoreUnhandledErrors` убран; тяжёлые solver-тесты → `npm run test:solver` (`vitest.solver.config.ts`); probe-тест подтверждает реальный unhandled rejection валит прогон
- [x] `getPlayer({ scopes: false })` → `getPlayer()`, сверено с актуальной документацией SDK
- [x] `src/platform/local-fallback.ts` — production-safe fallback при сбое SDK, `?sdkFail=1` для теста
- [x] Audio: `suspended()`-гейт перед созданием AudioNode при hidden/pause/duck
- [x] Audio: base-aware `${BASE_URL}audio/...` вместо абсолютного `/audio/...`
- [x] `verify:dist`: запрет `__e2eWinLevel`, sourcemap, абсолютных `/audio/...`
- [x] Unit: +28 (boss objective, leaderboard-cache, yandex snapshot, local-fallback, audio hidden/pause, audio base-path, unhandled-error-probe) → 488 (356 + 132 solver)
- [x] e2e: +4 (боссы 25/100 без звезды, SDK fallback) → 103
- [x] typecheck+lint+test(356)+test:solver(132)+solve+build(~874КБ)+verify:dist+e2e(103) — все зелёные
