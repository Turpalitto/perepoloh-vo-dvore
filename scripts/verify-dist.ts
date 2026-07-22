import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const root = resolve('dist');
const forbidden = ['sdk.games.s3.yandex.net', 'Тестовая реклама', 'mock-ad', '?mock=1'];
// Только реальные внешние домены, которые допустимы в статике. Односложные
// «хосты» без точки (a, b, x, xn--e1aybc) — артефакты извлечения URL из
// минифицированного кода, а не домены; они отсекаются требованием точки ниже,
// а не занесением в whitelist (иначе whitelist глушил бы саму проверку).
const allowedStaticDomains = new Set(['www.w3.org', 'github.com']);

interface PngExpectation {
  path: string;
  width: number;
  height: number;
}

interface TextFields {
  title: string;
  seo: string;
  about: string;
  short: string;
  how: string;
}

const publicationPngs: PngExpectation[] = [
  { path: 'promo/ai-icon-puzzle-v2-512.png', width: 512, height: 512 },
  { path: 'promo/ai-cover-puzzle-v2-800x470.png', width: 800, height: 470 },
  { path: 'screenshots/mobile-game.png', width: 720, height: 1280 },
  { path: 'screenshots/mobile-boss.png', width: 720, height: 1280 },
  { path: 'screenshots/desktop-game.png', width: 1280, height: 720 },
  { path: 'screenshots/desktop-boss.png', width: 1280, height: 720 }
];

const allowedPublicationFiles = new Map<string, Set<string>>([
  [
    'promo',
    new Set(['ai-cover-puzzle-v2-src.png', 'ai-cover-puzzle-v2-800x470.png', 'ai-icon-puzzle-v2-512.png'])
  ],
  ['screenshots', new Set(['mobile-game.png', 'mobile-boss.png', 'desktop-game.png', 'desktop-boss.png'])]
]);

function verifyPublicationDirectories(): void {
  for (const [directory, allowed] of allowedPublicationFiles) {
    for (const name of readdirSync(resolve(directory))) {
      if (!allowed.has(name)) throw new Error(`Лишний файл в ${directory}/: ${name}`);
    }
  }
}

function verifyPng(expected: PngExpectation): void {
  const file = resolve(expected.path);
  if (!existsSync(file)) throw new Error(`Не найден промоматериал: ${expected.path}`);
  const png = readFileSync(file);
  if (png.toString('ascii', 1, 4) !== 'PNG') throw new Error(`Файл не является PNG: ${expected.path}`);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const bitDepth = png[24];
  const colorType = png[25];
  if (width !== expected.width || height !== expected.height) {
    throw new Error(`${expected.path}: ${width}×${height}, ожидалось ${expected.width}×${expected.height}`);
  }
  // Требование черновика: 24-разрядный PNG — 8 бит на канал, RGB без alpha.
  if (bitDepth !== 8 || colorType !== 2) throw new Error(`${expected.path}: требуется 24-разрядный RGB PNG`);
}

function textSection(markdown: string, heading: string, nextHeading?: string): string {
  const start = markdown.indexOf(`## ${heading}`);
  if (start < 0) throw new Error(`Не найден раздел метаданных «${heading}»`);
  const end = nextHeading ? markdown.indexOf(`## ${nextHeading}`, start + 1) : markdown.length;
  return markdown.slice(start, end < 0 ? markdown.length : end);
}

function textField(section: string, label: string): string {
  const match = section.match(new RegExp('^' + label + ': `([^`]+)`$', 'm'));
  if (!match) throw new Error(`Не найдено поле «${label}»`);
  return match[1];
}

function verifyTexts(): void {
  const markdown = readFileSync(resolve('YANDEX_SUBMISSION.md'), 'utf8');
  const locales: Array<{ heading: string; next?: string; labels: string[] }> = [
    { heading: 'Русский', next: 'English', labels: ['Название', 'SEO', 'Об игре', 'Короткое описание', 'Как играть'] },
    { heading: 'English', next: 'Türkçe', labels: ['Title', 'SEO', 'About', 'Short description', 'How to play'] },
    {
      heading: 'Türkçe',
      next: 'Файлы промоматериалов',
      labels: ['Başlık', 'SEO', 'Oyun hakkında', 'Kısa açıklama', 'Nasıl oynanır']
    }
  ];
  for (const locale of locales) {
    const section = textSection(markdown, locale.heading, locale.next);
    const values = locale.labels.map((label) => textField(section, label));
    const fields: TextFields = { title: values[0], seo: values[1], about: values[2], short: values[3], how: values[4] };
    if (fields.title.length > 50) throw new Error(`${locale.heading}: название длиннее 50 символов`);
    if (fields.seo.length < 50 || fields.seo.length > 160) throw new Error(`${locale.heading}: SEO должно быть 50–160`);
    if (fields.about.length < 100 || fields.about.length > 1000) throw new Error(`${locale.heading}: «Об игре» должно быть 100–1000`);
    if (fields.short.length > 70) throw new Error(`${locale.heading}: короткое описание длиннее 70`);
    if (fields.how.length < 100 || fields.how.length > 1000) throw new Error(`${locale.heading}: инструкция должна быть 100–1000`);
  }
}

if (!existsSync(resolve(root, 'index.html'))) throw new Error('В корне dist нет index.html');

const files: string[] = [];
function walk(directory: string): void {
  for (const name of readdirSync(directory)) {
    const absolute = resolve(directory, name);
    if (statSync(absolute).isDirectory()) walk(absolute);
    else files.push(absolute);
  }
}
walk(root);

let bytes = 0;
const sizes: Array<{ name: string; bytes: number }> = [];
const absoluteUrls = new Set<string>();
for (const file of files) {
  const name = relative(root, file).replaceAll('\\', '/');
  if (/\s|[А-Яа-яЁё]/u.test(name)) throw new Error(`Недопустимое имя в архиве: ${name}`);
  const content = readFileSync(file);
  sizes.push({ name, bytes: content.byteLength });
  bytes += content.byteLength;
  for (const marker of forbidden) {
    if (content.includes(Buffer.from(marker))) throw new Error(`Production содержит запрещённый маркер «${marker}»: ${name}`);
  }
  if (['.html', '.js', '.css', '.json'].includes(extname(file))) {
    const text = content.toString('utf8');
    if (/file:\/\/|(?:^|[^A-Za-z])[A-Za-z]:\\/m.test(text)) {
      throw new Error(`Production содержит ссылку на локальный диск: ${name}`);
    }
    for (const match of text.matchAll(/https?:\/\/[^\s"'`\\)<]+/g)) {
      absoluteUrls.add(match[0].replace(/[.,;]+$/, ''));
    }
  }
}

if (bytes > 100 * 1024 * 1024) throw new Error(`Размер dist превышает 100 МБ: ${bytes}`);

const indexHtml = readFileSync(resolve(root, 'index.html'), 'utf8');
const localReferences = new Set<string>();
for (const match of indexHtml.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
  const raw = match[1];
  if (/^(?:data:|https?:|\/\/|#)/i.test(raw)) continue;
  const clean = decodeURIComponent(raw.split(/[?#]/, 1)[0]).replace(/^\//, '');
  if (!clean) continue;
  const target = resolve(root, clean);
  if (!target.startsWith(root) || !existsSync(target)) throw new Error(`В index.html отсутствует локальный ресурс: ${raw}`);
  localReferences.add(clean);
}

const domains = new Set<string>();
for (const url of absoluteUrls) {
  try {
    domains.add(new URL(url).hostname);
  } catch {
    throw new Error(`Некорректный абсолютный URL в production: ${url}`);
  }
}
const suspiciousDomains = [...domains].filter((domain) => {
  if (/^(?:localhost|127\.|0\.0\.0\.0$)/i.test(domain)) return true;
  if (allowedStaticDomains.has(domain)) return false;
  // Настоящий внешний домен всегда содержит точку (TLD). Односложные токены —
  // ложные срабатывания извлечения URL, не считаем их внешними доменами.
  return domain.includes('.');
});
if (suspiciousDomains.length) throw new Error(`Подозрительные внешние домены: ${suspiciousDomains.join(', ')}`);

verifyPublicationDirectories();
for (const expected of publicationPngs) verifyPng(expected);
verifyTexts();
console.log(
  `Крупнейшие файлы: ${sizes
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 5)
    .map(({ name, bytes: size }) => `${name} ${(size / 1024).toFixed(1)} КБ`)
    .join('; ')}`
);
console.log(`Имена файлов: ${files.length} проверено, запрещённых 0; локальные ссылки: ${localReferences.size}, отсутствующих 0.`);
console.log(
  `Абсолютные URL: ${absoluteUrls.size}; домены: ${[...domains].sort().join(', ') || 'нет'}; подозрительных доменов 0.`
);
console.log(
  `Релиз готов: ${files.length} файлов, ${(bytes / 1024).toFixed(1)} КБ; production, тексты и ${publicationPngs.length} PNG проверены.`
);
