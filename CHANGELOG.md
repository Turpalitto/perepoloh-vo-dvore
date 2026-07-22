# Changelog

## 2026-07-22 — Живой двор, дед и сюжетные боссы

### Added
- **Живой двор**: система событий (`src/game/yard-events.ts`) — `YardEvent`, `RateLimiter`, маппинг в события деда.
- **Дед-персонаж** (`src/game/grandpa.ts`, `src/ui/yard-reactions.ts`): data-driven реплики (30+), чистый `pickLine` (кулдаун/анти-повтор/приоритет/once), SVG-портрет с 7 настроениями, авто-скрывающийся пузырь (`aria-live`, служит субтитром). Голос деда `grandpa` в audio.
- **Настройка «Живой двор»** в меню; персист однократных реплик (`SaveData.grandpaSeen`).
- **5 сюжетных боссов** (`src/game/boss.ts`, слоты 10/25/50/75/100) — все играбельны: интро деда, фазы (обычные solver-проверяемые под-уровни), переходы без перезагрузки, уникальная победа. Generic-оркестрация в `app.ts` (без ветвлений `id===N`).
- **Boss HUD** «Фаза N из M», помещается на 320×568 и landscape 667×375.
- **Финал кампании через босса 100**: открывает Высшую лигу той же логикой, что обычный уровень 100 (`completeCampaignFinale`).
- `SaveData.bossDone` (union merge); `SaveData.liveYard`.
- Документы: `BOSS_SYSTEM.md`, `PROJECT_HANDOFF.md`, `AUDIO_ASSETS_REQUIRED.md`, `LIVING_YARD_DESIGN.md`, этот `CHANGELOG.md`.
- Тесты: unit `grandpa.test.ts` (11), `boss.test.ts` (8); e2e — живой двор (4) и боссы (боссы 10 + 25/50/75/100 + финал 100 + повтор без наград), desktop+mobile+TV.

### Fixed
- **Босс 100 не открывал Высшую лигу**: финальная фаза шла через `onBossPhaseDone` в обход кампанийной логики `finishLevel`. Выделен общий `completeCampaignFinale()`, вызывается из обоих путей; финальная сцена показывается один раз, повтор наград не дублирует. Регрессионный e2e добавлен.
- Узкий landscape: 7-я иконка меню (тумблер «Живой двор») уводилась за низ на 667×375 — колонка иконок переносится во вторую колонку (`flex-wrap: wrap-reverse`), кнопки не уменьшаются ниже 44px.

### Notes
- Звук — синтез WebAudio (fallback), не финальные сэмплы (см. `AUDIO_ASSETS_REQUIRED.md`).
- Размер production-сборки: ~855 КБ (рост от живого двора/деда/боссов/лиги; без тяжёлых зависимостей).
- Все проверки зелёные: typecheck, lint, 447 unit, build, verify:dist, 81 e2e.
