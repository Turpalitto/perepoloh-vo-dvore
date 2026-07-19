/**
 * Локализация интерфейса: ru (базовый), en, tr.
 * Язык берётся у платформы (Яндекс SDK — ysdk.environment.i18n.lang),
 * переопределяется параметром ?lang=.
 */
export type Lang = 'ru' | 'en' | 'tr';

type Dict = Record<string, string>;

const RU: Dict = {
  'menu.play': 'Играть',
  'menu.continue': 'Продолжить',
  'menu.levels': 'Уровни',
  'menu.nextUpgrade': 'следующее улучшение двора: ★ {n}',
  'menu.fullYard': 'двор полностью обустроен!',
  'levels.title': 'Уровни',
  'levels.back': '← Меню',
  'hud.moves': 'ходы',
  'hud.goal': 'цель ≤ {n}',
  'btn.undo': '↩ Отмена',
  'btn.restart': '⟲ Заново',
  'btn.hint': 'Подсказка',
  'pause.title': 'Пауза',
  'pause.resume': 'Продолжить',
  'pause.restart': 'Заново',
  'pause.menu': 'В меню',
  'win.title': 'Двор свободен!',
  'win.stats': 'ходов: {moves} · оптимум: {par}',
  'win.perfect': ' · идеально!',
  'win.starOk': 'Звезда собрана!',
  'win.starMissed': 'Звезда осталась во дворе…',
  'win.next': 'Дальше',
  'win.again': 'Ещё раз',
  'win.menu': 'Меню',
  'win.allDone': 'Все уровни пройдены — двор спасён!',
  'win.master': '🏆 Все звёзды собраны! Двор теперь безупречен.',
  'upgrade.fence': 'Забор починен!',
  'upgrade.flowers': 'Расцвела клумба!',
  'upgrade.gate': 'Ворота покрашены!',
  'upgrade.doghouse': 'Новая будка — привет, Шарик!',
  'upgrade.laundry': 'Свежее бельё и фонарики!',
  'upgrade.appletree': 'Яблоня и качели!',
  'menu.rules': 'Правила',
  'rules.title': 'Правила игры',
  'rules.close': 'Понятно',
  'rules.1': 'Дедова машина застряла во дворе среди соседской техники — помоги ей выехать через ворота!',
  'rules.2': 'Каждая машина едет только в одну сторону — вперёд-назад или вверх-вниз, свернуть не может.',
  'rules.3': 'Грузовик и трактор длиннее обычной машины, им тесно — сперва найди для них место.',
  'rules.4': 'Ящик можно толкать в любую сторону, но лишь несколько раз — смотри на цифру сверху.',
  'rules.5': 'Увидел на поле канистру? Проедь по ней любой машиной и забери звезду.',
  'rules.6': 'За прохождение уровня — ★. Уложился в подсказанное число ходов — ★★. Решил идеально (и забрал звезду, если она есть) — ★★★.',
  'rules.7': 'Ошибся — жми «Отмена». Совсем запутался — «Заново». Оба хода бесплатны и без ограничений.'
};

const EN: Dict = {
  'menu.play': 'Play',
  'menu.continue': 'Continue',
  'menu.levels': 'Levels',
  'menu.nextUpgrade': 'next yard upgrade: ★ {n}',
  'menu.fullYard': 'the yard is fully restored!',
  'levels.title': 'Levels',
  'levels.back': '← Menu',
  'hud.moves': 'moves',
  'hud.goal': 'goal ≤ {n}',
  'btn.undo': '↩ Undo',
  'btn.restart': '⟲ Restart',
  'btn.hint': 'Hint',
  'pause.title': 'Paused',
  'pause.resume': 'Resume',
  'pause.restart': 'Restart',
  'pause.menu': 'Menu',
  'win.title': 'The yard is clear!',
  'win.stats': 'moves: {moves} · optimal: {par}',
  'win.perfect': ' · perfect!',
  'win.starOk': 'Star collected!',
  'win.starMissed': 'The star was left behind…',
  'win.next': 'Next',
  'win.again': 'Retry',
  'win.menu': 'Menu',
  'win.allDone': 'All levels cleared — the yard is saved!',
  'win.master': '🏆 Every star collected! The yard is absolutely perfect now.',
  'upgrade.fence': 'Fence repaired!',
  'upgrade.flowers': 'Flower bed blooms!',
  'upgrade.gate': 'Gate painted!',
  'upgrade.doghouse': 'New doghouse — meet Sharik!',
  'upgrade.laundry': 'Fresh laundry and lanterns!',
  'upgrade.appletree': 'Apple tree and a swing!',
  'menu.rules': 'Rules',
  'rules.title': 'How to Play',
  'rules.close': 'Got it',
  'rules.1': "Grandpa's car is stuck in a yard full of other vehicles — help it roll out through the gate!",
  'rules.2': 'Each vehicle moves only one way — forward-back or up-down — it can never turn.',
  'rules.3': 'The truck and tractor are longer than a car, so they need extra room — clear a path first.',
  'rules.4': 'You can push a crate any direction, but only a few times — check the number printed on it.',
  'rules.5': 'Spot a milk can on the field? Drive any vehicle over it to grab a star.',
  'rules.6': 'Clear the level for ★. Do it within the suggested move count for ★★. Solve it perfectly (and grab the star, if there is one) for ★★★.',
  'rules.7': 'Made a mistake? Tap Undo. Totally stuck? Tap Restart. Both are free and unlimited.'
};

const TR: Dict = {
  'menu.play': 'Oyna',
  'menu.continue': 'Devam et',
  'menu.levels': 'Bölümler',
  'menu.nextUpgrade': 'sıradaki bahçe yeniliği: ★ {n}',
  'menu.fullYard': 'bahçe tamamen yenilendi!',
  'levels.title': 'Bölümler',
  'levels.back': '← Menü',
  'hud.moves': 'hamle',
  'hud.goal': 'hedef ≤ {n}',
  'btn.undo': '↩ Geri al',
  'btn.restart': '⟲ Yeniden',
  'btn.hint': 'İpucu',
  'pause.title': 'Duraklatıldı',
  'pause.resume': 'Devam et',
  'pause.restart': 'Yeniden',
  'pause.menu': 'Menü',
  'win.title': 'Bahçe açıldı!',
  'win.stats': 'hamle: {moves} · en iyi: {par}',
  'win.perfect': ' · mükemmel!',
  'win.starOk': 'Yıldız toplandı!',
  'win.starMissed': 'Yıldız bahçede kaldı…',
  'win.next': 'İleri',
  'win.again': 'Tekrar',
  'win.menu': 'Menü',
  'win.allDone': 'Tüm bölümler bitti — bahçe kurtarıldı!',
  'win.master': '🏆 Bütün yıldızlar toplandı! Bahçe artık kusursuz.',
  'upgrade.fence': 'Çit onarıldı!',
  'upgrade.flowers': 'Çiçek tarhı açtı!',
  'upgrade.gate': 'Kapı boyandı!',
  'upgrade.doghouse': 'Yeni kulübe — işte Şarik!',
  'upgrade.laundry': 'Temiz çamaşır ve fenerler!',
  'upgrade.appletree': 'Elma ağacı ve salıncak!',
  'menu.rules': 'Kurallar',
  'rules.title': 'Nasıl Oynanır',
  'rules.close': 'Anladım',
  'rules.1': 'Dedenin arabası komşu araçların arasında sıkışmış — kapıdan çıkmasına yardım et!',
  'rules.2': 'Her araç yalnızca tek yönde gider — ileri-geri ya da yukarı-aşağı — asla dönemez.',
  'rules.3': 'Kamyon ve traktör bir arabadan uzundur, onlara yer gerekir — önce yol aç.',
  'rules.4': 'Sandığı istediğin yöne itebilirsin ama sadece birkaç kez — üzerindeki sayıya bak.',
  'rules.5': 'Sahada bir süt güğümü mü gördün? Herhangi bir araçla üzerinden geç, yıldızı kap.',
  'rules.6': 'Bölümü bitirince ★. Önerilen hamle sayısında kalınca ★★. Kusursuz çözünce (ve varsa yıldızı alınca) ★★★.',
  'rules.7': 'Yanlış mı yaptın? Geri Al\'a bas. Çok mu karıştı? Yeniden Başlat\'a bas. İkisi de bedava, sınırsız.'
};

/**
 * Переводы названий/подсказок уровней — ключ: русский текст из levels.json
 * (не id!), потому что id уровня может сдвинуться при пересортировке
 * уровней по сложности, а название с содержимым не меняется.
 */
const EN_NAMES: Dict = {
  'Первый выезд': 'First Ride',
  'Соседи приехали': 'Neighbours Arrive',
  'Длинный грузовик': 'The Long Truck',
  'Трактор деда': "Grandpa's Tractor",
  'Молочная канистра': 'The Milk Can',
  'Тяжёлый ящик': 'Heavy Crate',
  'Пробка у колодца': 'Jam at the Well',
  Сенокос: 'Haymaking',
  'Тесно у сарая': 'Tight by the Barn',
  'Хитрая парковка': 'Tricky Parking',
  'Утренняя суета': 'Morning Rush',
  'Ярмарочный день': 'Market Day',
  'Упрямое стадо': 'Stubborn Herd',
  'Переулок ящиков': 'Crate Alley',
  'Большая уборка': 'Big Cleanup',
  'Урожайный хаос': 'Harvest Chaos',
  'Старый двор': 'The Old Yard',
  'Двойная беда': 'Double Trouble',
  'Дворовый узел': 'Barnyard Knot',
  'Час петуха': 'Rooster Hour',
  'Большой манёвр': 'Grand Maneuver',
  'Мастерский план': 'Master Plan',
  'Великий побег': 'The Great Escape',
  'Куры и бочки': 'Chickens and Barrels',
  'Утро во дворе': 'Morning in the Yard',
  'Полный переполох': 'Total Frenzy',
  'Сенной сарай': 'Hay Barn',
  'Тупик у колодца': 'Dead End by the Well',
  'Тесный выезд': 'Tight Exit',
  'Закуток деда': "Grandpa's Nook",
  'Грузовый тупик': 'Freight Deadlock',
  'Большой завал': 'Big Jam',
  'Ящики и трактор': 'Crates and Tractor',
  'Капкан для жигулёнка': 'Trap for the Little Car',
  'Последний рубеж': 'The Last Stand',
  'Осада двора': 'Yard Siege'
};

const EN_HINTS: Dict = {
  'Потяни синюю машину вправо — к воротам!': 'Drag the blue car right — to the gate!',
  'Машины ездят только вдоль своей оси': 'Vehicles slide only along their axis',
  'Грузовик длинный — освободи ему место': 'The truck is long — clear some room',
  'Иногда сперва нужно подвинуть соседа': 'Sometimes move a neighbour first',
  'Проедь по канистре — получишь звезду!': 'Drive over the can to grab a star!',
  'Ящик тяжёлый: его можно сдвинуть только 1 раз': 'The crate is heavy: it moves only once'
};

const TR_NAMES: Dict = {
  'Первый выезд': 'İlk Sürüş',
  'Соседи приехали': 'Komşular Geldi',
  'Длинный грузовик': 'Uzun Kamyon',
  'Трактор деда': 'Dedenin Traktörü',
  'Молочная канистра': 'Süt Güğümü',
  'Тяжёлый ящик': 'Ağır Sandık',
  'Пробка у колодца': 'Kuyu Önünde Sıkışıklık',
  Сенокос: 'Ot Biçimi',
  'Тесно у сарая': 'Ahır Yanı Dar',
  'Хитрая парковка': 'Zor Park',
  'Утренняя суета': 'Sabah Telaşı',
  'Ярмарочный день': 'Pazar Günü',
  'Упрямое стадо': 'İnatçı Sürü',
  'Переулок ящиков': 'Sandık Geçidi',
  'Большая уборка': 'Büyük Temizlik',
  'Урожайный хаос': 'Hasat Kargaşası',
  'Старый двор': 'Eski Bahçe',
  'Двойная беда': 'Çifte Dert',
  'Дворовый узел': 'Bahçe Düğümü',
  'Час петуха': 'Horoz Saati',
  'Большой манёвр': 'Büyük Manevra',
  'Мастерский план': 'Usta Planı',
  'Великий побег': 'Büyük Kaçış',
  'Куры и бочки': 'Tavuklar ve Variller',
  'Утро во дворе': 'Bahçede Sabah',
  'Полный переполох': 'Tam Karmaşa',
  'Сенной сарай': 'Saman Ahır',
  'Тупик у колодца': 'Kuyu Yanı Çıkmaz',
  'Тесный выезд': 'Dar Çıkış',
  'Закуток деда': 'Dedenin Köşesi',
  'Грузовый тупик': 'Yük Tıkanıklığı',
  'Большой завал': 'Büyük Sıkışma',
  'Ящики и трактор': 'Sandıklar ve Traktör',
  'Капкан для жигулёнка': 'Jiguli Tuzağı',
  'Последний рубеж': 'Son Savunma',
  'Осада двора': 'Bahçe Kuşatması'
};

const TR_HINTS: Dict = {
  'Потяни синюю машину вправо — к воротам!': 'Mavi arabayı sağa, kapıya sürükle!',
  'Машины ездят только вдоль своей оси': 'Araçlar yalnız kendi ekseninde kayar',
  'Грузовик длинный — освободи ему место': 'Kamyon uzun — yer aç',
  'Иногда сперва нужно подвинуть соседа': 'Bazen önce komşuyu kaydır',
  'Проедь по канистре — получишь звезду!': 'Güğümün üstünden geç, yıldızı al!',
  'Ящик тяжёлый: его можно сдвинуть только 1 раз': 'Sandık ağır: sadece bir kez taşınır'
};

const DICTS: Record<Lang, Dict> = { ru: RU, en: EN, tr: TR };
const NAME_TABLES: Record<Exclude<Lang, 'ru'>, Dict> = { en: EN_NAMES, tr: TR_NAMES };
const HINT_TABLES: Record<Exclude<Lang, 'ru'>, Dict> = { en: EN_HINTS, tr: TR_HINTS };

let current: Lang = 'ru';

export function initI18n(langRaw: string): Lang {
  const override = new URLSearchParams(location.search).get('lang');
  const lang = (override ?? langRaw).slice(0, 2).toLowerCase();
  current = lang === 'en' ? 'en' : lang === 'tr' ? 'tr' : 'ru';
  document.documentElement.lang = current;
  return current;
}

export function getLang(): Lang {
  return current;
}

/** Смена языка из настроек (переключатель в меню). */
export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
}

export function t(key: string, vars: Record<string, string | number> = {}): string {
  let s = DICTS[current][key] ?? DICTS.ru[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** Название/подсказка уровня: перевод по русскому тексту либо он же. */
export function levelText(field: 'name' | 'hint', fallback: string | undefined): string | undefined {
  if (current === 'ru' || !fallback) return fallback;
  const table = field === 'name' ? NAME_TABLES[current] : HINT_TABLES[current];
  return table[fallback] ?? fallback;
}
