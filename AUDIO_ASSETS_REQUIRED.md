# Требуемые аудиофайлы

> **Обновлено (release-audit-findings):** URL сэмплов теперь base-aware — `${import.meta.env.BASE_URL}audio/<key>.mp3`, а не абсолютный `/audio/<key>.mp3` (ломался при каталожном размещении с `base` не `/`). Пути ниже в таблице — иллюстративные имена файлов в `public/audio/`, не буквальный URL в рантайме.

**Статус на 2026-08:** 16 из 19 файлов лежат в `public/audio/`. Подключены через `playSample()` (файл есть → звучит он, файла нет → синтез): `star_collect`, `gate_creak`, `button_click`, `crate_slide`, `wood_hit`, `tractor_start`, `boss_phase`, `victory_drive`, а также `metal_hit` («thud»), `dog_bark` («bark`) и `chickens_scatter` (перескок курицы-объекта, кейс `chickenScatter`). Кейс `gateSwing` (створка легла на упор после открытия ворот) использует новый ключ `gate_swing` — файла ещё нет, играет синтез. Отсутствуют и ждут записи `grandpa_mumble_1.mp3`…`grandpa_mumble_3.mp3` (реплики деда — P0) и `gate_swing.mp3` (P3). Лупы `engine_low/high` **подключены**: `engineStart` прогревает оба буфера и при готовности создаёт пару с двумя gain-узлами, а `engineSetIntensity(t)` (вызывается из drag'а по сглаженной скорости, `onDragSpeed`) кроссфейдит их; пока файлов нет — играет синтезированный гул. Ключи `tractor_idle/move` остаются в реестре, но не вызываются: нужен выбор лупа по типу перетаскиваемой фигуры (сейчас BoardView не сообщает тип в onDragSpeed). Централизованный реестр (`src/game/sound-registry.ts`) умеет загружать сэмплы по base-aware URL и кэшировать их; `GameAudio.playSample(key, vol, fallback)` (`src/game/audio.ts`) пробует сэмпл, и если файла нет (или загрузка ещё не завершилась/провалилась) — **молча** играет синтезированный fallback тем же вызовом. Каждый отсутствующий файл логируется в консоль **максимум один раз за сессию** и **только в development** (`import.meta.env.DEV`); в production — без единого лишнего `console.warn`. Игра полностью играбельна без единого настоящего аудиофайла — это подтверждённое, не декларативное свойство (см. `tests/sound-registry.test.ts`).

## Таблица звуков

| Ключ | Файл | Loop | Длительность | Где используется | Приоритет |
|--|--|--|--|--|--|
| `star_collect` | `/audio/star_collect.mp3` | нет | ~0.3с | сбор звезды (`play('star')`) — **подключено** | P1 |
| `gate_creak` | `/audio/gate_creak.mp3` | нет | ~0.4с | открытие ворот (`play('gate')`) — **подключено** | P1 |
| `gate_swing` | `/audio/gate_swing.mp3` | нет | ~0.3с | створка легла на упор (`play('gateSwing')`, после `gate`) — **подключено** | P3 |
| `button_click` | `/audio/button_click.mp3` | нет | ~0.2с | нажимная кнопка (`play('switch')`) — **подключено** | P2 |
| `grandpa_mumble_1/2/3` | `/audio/grandpa_mumble_{1,2,3}.mp3` | нет | ~0.4-0.6с | реплика деда (`play('grandpa')`, случайный из трёх) — **подключено** | P0 (характер игры) |
| `engine_idle` | `/audio/engine_idle.mp3` | да | ~1с (шовный луп) | холостой ход при drag — **подключено** как фолбэк-одиночный луп, пока `engine_low/high` не готовы (`engineSetIntensity` меняет громкость) | P1 |
| `engine_low` / `engine_high` | `/audio/engine_{low,high}.mp3` | да | ~1с каждый | crossfade по скорости перетаскивания (`engineSetIntensity`) — **подключено** | P2 |
| `tractor_start` | `/audio/tractor_start.mp3` | нет | ~0.8с | трактор заводится (боссы/трактор-фигура) | P1 |
| `tractor_idle` / `tractor_move` | `/audio/tractor_{idle,move}.mp3` | да | ~1с | трактор в движении | P2 |
| `wood_hit` / `metal_hit` | `/audio/{wood,metal}_hit.mp3` | нет | ~0.15с | упор в препятствие по типу | P2 |
| `crate_slide` | `/audio/crate_slide.mp3` | нет | ~0.25с | скольжение ящика | P3 |
| `chickens_scatter` | `/audio/chickens_scatter.mp3` | нет | ~0.5с | резкий ход (куры разбегаются) | P2 |
| `dog_bark` | `/audio/dog_bark.mp3` | нет | ~0.3с | резкий ход/удар | P3 |
| `boss_phase` | `/audio/boss_phase.mp3` | нет | ~0.6с | переход между фазами босса | P2 |
| `victory_drive` | `/audio/victory_drive.mp3` | нет | ~1.5с | победная сцена / выезд | P1 |

**«Подключено»** = реально вызывается из `play()` через `playSample()` и будет использован автоматически, как только файл появится в `public/audio/` — код менять не нужно. Остальные ключи реестра (`tractor_idle`, `tractor_move`) пока не вызываются — нужен выбор лупа по типу перетаскиваемой фигуры; для них играет синтезированный аналог (`engineStart` покрывает тракторы тем же гулом).

Формат: моно `.mp3` (или что легко декодируется `AudioContext.decodeAudioData`), нормализованная громкость, без щелчков на границах (важно для луп-звуков). Только собственная запись или лицензия CC0/эквивалент — никаких файлов неизвестного происхождения.

## Архитектура воспроизведения (уже реализована)
- `SampleLoader` (`sound-registry.ts`) — кэш буферов, дедупликация параллельных загрузок одного ключа, `hasFailed()` не даёт долбить сеть повторно.
- `GameAudio.playSample()` — `AudioBufferSourceNode` + `GainNode`, fade-in/fade-out (без щелчков), вариация `playbackRate` ±4%, лимит `MAX_CONCURRENT_SAMPLES=6` (не копит очередь при частых событиях).
- Пауза/реклама/скрытая вкладка — бесплатно наследуются от общего `master`-gain (сэмплы идут через тот же узел, что и синтез), отдельной остановки не требуется.
- Мотор **не перезапускается** на каждый `pointermove` (`engineStart` идемпотентен, гасится на release) — не менялось.

## Что осталось честно fallback (не подключено к реестру)
`click`, `pick`, `move`, `undo`, `thud`, `honk`, `exitRev`, `win`, `cluck`, `bark`, `meow` — чистый синтез без соответствующего ключа в реестре. Расширение — по той же схеме, что уже сделано для `star`/`gate`/`switch`/`grandpa`.
