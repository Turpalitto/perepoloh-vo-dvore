# AGENTS.md

## Проект

«Переполох во дворе» — браузерная TypeScript-головоломка для Яндекс Игр. Vite, SVG/DOM UI, без игрового движка.

## Перед Любой Работой

Прочитай:

- `README.md`
- `PRODUCT_SPEC.md`
- `GAME_DESIGN.md`
- `TECHNICAL_DESIGN.md`

Код и тесты являются источником истины, если документация устарела.

## Главные Правила

- Не менять core-правила без прямого разрешения.
- Не ломать доказуемую проходимость уровней.
- Не добавлять случайность в головоломочную логику.
- Не добавлять агрессивную монетизацию.
- Не менять формат сохранения без миграции.
- Не переписывать проект на другой framework.
- Не коммитить без успешных проверок.
- Не обращаться к `YaGames` вне `src/platform/yandex.ts`.
- Перед правкой Яндекс SDK сверять актуальную официальную документацию Яндекс Игр.

## Обязательные Проверки

Для обычного изменения:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Для UI:

```bash
npm run e2e
```

Для уровней:

```bash
npm run solve
npm test
```

Перед релизом:

```bash
npm run verify:dist
```

## Навыки

Используй:

- `$parkovka-game-design` — для геймдизайна.
- `$parkovka-level-design` — для уровней.
- `$parkovka-playtest-analysis` — для тестов игроков.
- `$parkovka-game-feel` — для управления и обратной связи.
- `$parkovka-code-review` — для ревью.
- `$parkovka-yandex-release` — перед публикацией.

## Структура

- `src/core/` — чистые правила, solver, validator; без DOM.
- `src/levels/` — данные уровней.
- `src/platform/` — mock, fallback и Яндекс SDK.
- `src/ui/` — экраны, SVG-поле, ввод.
- `src/game/` — save, audio, i18n, progression, daily/weekly/endless/achievements/boss/elite.
- `tests/`, `e2e/`, `scripts/` — проверки, браузерные тесты, сборочные/solver scripts.
