/**
 * Двор-меню: сцена хорошеет по мере набора звёзд.
 * Каждому этапу из progression.ts соответствует визуальный слой.
 */
import { catArt, chickenArt, getTargetSkin } from './sprites';

/** Редкие снежинки поверх сцены — единственный след сезонного события в самом дворе. */
function snowOverlay(): string {
  const flakes = [
    [60, -10, 0], [140, -30, 0.6], [230, -6, 1.4], [320, -24, 0.3], [410, -14, 1.0],
    [500, -32, 0.7], [590, -8, 1.6], [680, -20, 0.2], [760, -12, 1.1], [840, -28, 0.5]
  ];
  return `<g class="yard-snow">${flakes
    .map(([x, y, delay]) => `<circle cx="${x}" cy="${y}" r="4" style="animation-delay:${delay}s"/>`)
    .join('')}</g>`;
}

export function yardSVG(u: Set<string>, trophies = 0, season?: string): string {
  const fenceFixed = u.has('fence');
  const flowers = u.has('flowers');
  const gatePainted = u.has('gate');
  const doghouse = u.has('doghouse');
  const laundry = u.has('laundry');
  const appletree = u.has('appletree');
  const workshop = u.has('workshop');
  const well = u.has('well');
  const garden = u.has('garden');
  const pond = u.has('pond');
  const fair = u.has('fair');
  const celebration = u.has('celebration');

  const railColor = fenceFixed ? '#a9743f' : '#8f7048';
  const gateColor = gatePainted ? '#45968f' : '#8a5a30';

  const post = (x: number) =>
    `<rect x="${x - 7}" y="292" width="14" height="74" rx="5" fill="${fenceFixed ? '#7d5227' : '#6e5a3d'}"/>`;

  let fence = '';
  for (let x = 40; x <= 860; x += 82) {
    if (x > 470 && x < 640) continue; // проём ворот
    fence += post(x);
  }
  fence += `<rect x="26" y="304" width="452" height="12" rx="6" fill="${railColor}"/>
    <rect x="26" y="336" width="452" height="12" rx="6" fill="${railColor}"/>
    <rect x="632" y="304" width="242" height="12" rx="6" fill="${railColor}"/>
    <rect x="632" y="336" width="242" height="12" rx="6" fill="${railColor}"/>`;
  if (!fenceFixed) {
    // поломанные доски
    fence += `
      <rect x="180" y="300" width="12" height="66" rx="5" fill="#6e5a3d" transform="rotate(24 186 333)"/>
      <rect x="720" y="296" width="12" height="70" rx="5" fill="#6e5a3d" transform="rotate(-18 726 331)"/>
      <rect x="332" y="330" width="90" height="11" rx="5" fill="#8f7048" transform="rotate(-13 377 335)"/>`;
  }

  const gate = `
    <rect x="472" y="288" width="18" height="84" rx="6" fill="#6b4a1f"/>
    <rect x="620" y="288" width="18" height="84" rx="6" fill="#6b4a1f"/>
    <g>
      <rect x="494" y="298" width="58" height="66" rx="6" fill="${gateColor}" stroke="#5d4020" stroke-width="4"/>
      <rect x="558" y="298" width="58" height="66" rx="6" fill="${gateColor}" stroke="#5d4020" stroke-width="4"/>
      <line x1="500" y1="356" x2="546" y2="306" stroke="#5d4020" stroke-width="5"/>
      <line x1="564" y1="306" x2="610" y2="356" stroke="#5d4020" stroke-width="5"/>
    </g>`;

  const house = `
    <rect x="52" y="150" width="230" height="160" rx="8" fill="#a9743f" stroke="#7d5227" stroke-width="5"/>
    <line x1="52" y1="192" x2="282" y2="192" stroke="#7d5227" stroke-width="4"/>
    <line x1="52" y1="232" x2="282" y2="232" stroke="#7d5227" stroke-width="4"/>
    <line x1="52" y1="272" x2="282" y2="272" stroke="#7d5227" stroke-width="4"/>
    <path d="M30 156 L167 66 L304 156 Z" fill="#8a5a30" stroke="#63401f" stroke-width="5" stroke-linejoin="round"/>
    <rect x="238" y="84" width="26" height="52" fill="#7d5227"/>
    <rect class="house-window" x="118" y="208" width="66" height="58" rx="6" fill="#cfe9f2" stroke="#7d5227" stroke-width="5"/>
    <line x1="151" y1="208" x2="151" y2="266" stroke="#7d5227" stroke-width="4"/>
    <line x1="118" y1="237" x2="184" y2="237" stroke="#7d5227" stroke-width="4"/>
    <rect x="98" y="204" width="14" height="66" rx="4" fill="#45968f"/>
    <rect x="190" y="204" width="14" height="66" rx="4" fill="#45968f"/>`;

  const trash = flowers
    ? `<g transform="translate(364,436)">
        <ellipse cx="0" cy="26" rx="86" ry="20" fill="#b98d4f"/>
        ${[-58, -30, -2, 26, 54].map((x, i) => `
          <line x1="${x}" y1="24" x2="${x}" y2="-4" stroke="#4c8a35" stroke-width="5"/>
          <circle cx="${x}" cy="-12" r="11" fill="${['#e2574c', '#f6c445', '#e88fb6', '#e2574c', '#f6c445'][i]}"/>
          <circle cx="${x}" cy="-12" r="4" fill="#fff7e6"/>`).join('')}
      </g>`
    : `<g transform="translate(340,448)">
        <rect x="-60" y="-6" width="74" height="14" rx="5" fill="#8f7048" transform="rotate(-9 -23 1)"/>
        <rect x="-8" y="4" width="58" height="12" rx="5" fill="#6e5a3d" transform="rotate(7 21 10)"/>
        <circle cx="66" cy="6" r="14" fill="#8a5a30"/>
        <path d="M-70 16 q4 -14 9 0 M-56 18 q4 -14 9 0 M52 22 q4 -14 9 0" fill="none" stroke="#4c8a35" stroke-width="4"/>
      </g>`;

  const kennel = doghouse
    ? `<g transform="translate(742,420)">
        <rect x="-52" y="-38" width="104" height="76" rx="8" fill="#c4453c" stroke="#93302a" stroke-width="5"/>
        <path d="M-62 -34 L0 -74 L62 -34 Z" fill="#8a5a30" stroke="#63401f" stroke-width="5" stroke-linejoin="round"/>
        <path d="M-20 38 L-20 -8 A20 20 0 0 1 20 -8 L20 38 Z" fill="#3d2c1e"/>
        <g transform="translate(64,16)" data-tap="bark"><g class="tap-inner">
          <ellipse cx="0" cy="14" rx="26" ry="7" fill="rgba(43,29,10,0.2)"/>
          <path d="M-18 12 Q-24 -16 0 -16 Q24 -16 18 12 Z" fill="#a9743f" stroke="#7d5227" stroke-width="4"/>
          <circle cx="0" cy="-18" r="13" fill="#a9743f" stroke="#7d5227" stroke-width="4"/>
          <path d="M-11 -26 L-15 -38 L-4 -30 Z" fill="#7d5227"/>
          <path d="M11 -26 L15 -38 L4 -30 Z" fill="#7d5227"/>
          <circle cx="-4" cy="-20" r="2" fill="#3d2c1e"/>
          <circle cx="4" cy="-20" r="2" fill="#3d2c1e"/>
          <ellipse cx="0" cy="-13" rx="4" ry="3" fill="#3d2c1e"/>
          <path d="M0 -10 q2 6 6 6" stroke="#e2574c" stroke-width="3" fill="none" stroke-linecap="round"/>
        </g></g>
      </g>`
    : `<g transform="translate(742,432)">
        <rect x="-46" y="-30" width="92" height="62" rx="6" fill="#8f7048" stroke="#6e5a3d" stroke-width="5" transform="rotate(-4)"/>
        <path d="M-54 -28 L0 -58 L54 -28 Z" fill="#6e5a3d" transform="rotate(-4)"/>
        <path d="M-16 30 L-16 -4 A16 16 0 0 1 16 -4 L16 30 Z" fill="#4a3a28" transform="rotate(-4)"/>
      </g>`;

  const laundryLayer = laundry
    ? `<g transform="translate(96,346)">
        <line x1="0" y1="0" x2="0" y2="86" stroke="#7d5227" stroke-width="8"/>
        <line x1="188" y1="0" x2="188" y2="86" stroke="#7d5227" stroke-width="8"/>
        <path d="M0 4 Q94 26 188 4" fill="none" stroke="#e8dcc8" stroke-width="4"/>
        <rect x="28" y="10" width="34" height="42" rx="4" fill="#cfe9f2"/>
        <rect x="78" y="14" width="30" height="36" rx="4" fill="#e88fb6"/>
        <rect x="124" y="10" width="36" height="44" rx="4" fill="#fff7e6"/>
      </g>
      <g transform="translate(452,398)">
        <line x1="0" y1="0" x2="0" y2="60" stroke="#5a5350" stroke-width="7"/>
        <circle class="yard-lamp-light" cx="0" cy="-10" r="13" fill="#ffe9a8" stroke="#d9a520" stroke-width="4"/>
      </g>
      <g transform="translate(648,412)">
        <line x1="0" y1="0" x2="0" y2="52" stroke="#5a5350" stroke-width="7"/>
        <circle class="yard-lamp-light" cx="0" cy="-10" r="13" fill="#ffe9a8" stroke="#d9a520" stroke-width="4"/>
      </g>`
    : '';

  const tree = appletree
    ? `<g transform="translate(836,318)">
        <rect x="-10" y="-30" width="20" height="90" rx="8" fill="#7d5227"/>
        <circle cx="-30" cy="-56" r="34" fill="#5f9c3c"/>
        <circle cx="24" cy="-64" r="38" fill="#6cae46"/>
        <circle cx="-2" cy="-92" r="32" fill="#5f9c3c"/>
        <circle cx="-24" cy="-44" r="7" fill="#e2574c"/>
        <circle cx="18" cy="-78" r="7" fill="#e2574c"/>
        <circle cx="32" cy="-48" r="7" fill="#e2574c"/>
        <line x1="14" y1="-30" x2="14" y2="30" stroke="#8a5a30" stroke-width="4"/>
        <line x1="46" y1="-34" x2="46" y2="30" stroke="#8a5a30" stroke-width="4"/>
        <rect x="6" y="28" width="48" height="9" rx="4" fill="#c9a45e"/>
      </g>`
    : '';

  const yard = `
    <ellipse cx="470" cy="470" rx="330" ry="110" fill="#dbb271"/>
    <ellipse cx="470" cy="470" rx="330" ry="110" fill="none" stroke="rgba(93,64,25,0.2)" stroke-width="4" stroke-dasharray="16 14"/>`;

  const workshopLayer = workshop
    ? `<g transform="translate(290,188)">
        <rect width="120" height="112" rx="7" fill="#bd8247" stroke="#7d5227" stroke-width="5"/>
        <path d="M-10 4 L60 -38 L130 4 Z" fill="#8a5a30" stroke="#63401f" stroke-width="5"/>
        <rect x="20" y="38" width="80" height="74" rx="5" fill="#6f918f" stroke="#5d4020" stroke-width="5"/>
        <path d="M28 60 H92 M28 82 H92" stroke="#d7ecea" stroke-width="5"/>
        <g transform="translate(60,-14)"><circle r="14" fill="#f6c445"/><path d="M-12 0H12M0-12V12" stroke="#8a5a30" stroke-width="5"/></g>
      </g>`
    : '';
  const wellLayer = well
    ? `<g transform="translate(684,292)">
        <ellipse cx="0" cy="28" rx="48" ry="19" fill="#8c9691" stroke="#626b68" stroke-width="5"/>
        <rect x="-48" y="0" width="96" height="30" fill="#9ca7a1" stroke="#626b68" stroke-width="5"/>
        <ellipse cx="0" cy="0" rx="48" ry="18" fill="#3f7184" stroke="#626b68" stroke-width="5"/>
        <path d="M-34 -2V-62M34-2V-62M-44-58Q0-92 44-58" fill="none" stroke="#7d5227" stroke-width="8"/>
        <circle cx="0" cy="-42" r="10" fill="#a9743f" stroke="#63401f" stroke-width="4"/>
      </g>`
    : '';
  const gardenLayer = garden
    ? `<g transform="translate(30,476)">
        ${[0, 26, 52].map((y) => `<path d="M0 ${y} Q70 ${y - 14} 140 ${y}" fill="none" stroke="#81552e" stroke-width="14" stroke-linecap="round"/>`).join('')}
        ${[18, 52, 86, 120].map((x, i) => `<g transform="translate(${x},${(i % 3) * 26 - 5})"><path d="M0 12V-4" stroke="#377334" stroke-width="5"/><circle cx="-6" cy="-5" r="8" fill="#5fa74e"/><circle cx="7" cy="-8" r="8" fill="#6db75b"/></g>`).join('')}
      </g>`
    : '';
  const pondLayer = pond
    ? `<g transform="translate(684,530)">
        <ellipse rx="92" ry="38" fill="#64b9d1" stroke="#4a8da5" stroke-width="5"/>
        <path d="M-80 4Q-55-12-30 2T20 0T72 2" fill="none" stroke="#a9e4ee" stroke-width="4"/>
        <g transform="translate(20,-8)"><ellipse rx="20" ry="11" fill="#f4e1a8"/><circle cx="16" cy="-10" r="9" fill="#f4e1a8"/><path d="M23-10l12 4-12 4z" fill="#e39b2d"/><circle cx="18" cy="-12" r="2"/></g>
      </g>`
    : '';
  const fairLayer = fair
    ? `<g><path d="M70 118 Q450 172 830 108" fill="none" stroke="#fff1d0" stroke-width="4"/>
        ${Array.from({ length: 12 }, (_, i) => { const x = 92 + i * 66; const y = 120 + Math.sin(i / 2) * 17; const color = ['#e2574c', '#f6c445', '#45968f'][i % 3]; return `<path d="M${x} ${y}l18 5-12 24z" fill="${color}"/>`; }).join('')}</g>`
    : '';
  const celebrationLayer = celebration
    ? `<g fill="#fff2a8" opacity=".9">${[[360,80],[430,105],[520,70],[610,128],[735,160]].map(([x,y], i) => `<g transform="translate(${x},${y})"><circle r="5"/><path d="M0-18V18M-18 0H18M-13-13L13 13M13-13L-13 13" stroke="${['#f6c445','#e2574c','#45968f'][i%3]}" stroke-width="4"/></g>`).join('')}</g>`
    : '';
  const trophyLayer = trophies > 0
    ? `<g transform="translate(214,174)"><rect x="-8" y="-12" width="${Math.min(trophies, 6) * 22 + 12}" height="32" rx="8" fill="rgba(61,44,30,.58)"/>${Array.from({ length: Math.min(trophies, 6) }, (_, i) => `<text x="${i * 22}" y="12" font-size="20">🏆</text>`).join('')}</g>`
    : '';

  // машинка-«жигулёнок» едет по двору (цвет — выбранный скин игрока)
  const skin = getTargetSkin();
  const car = `<g transform="translate(508,470)" data-tap="honk"><g class="tap-inner">
      <ellipse cx="0" cy="26" rx="58" ry="10" fill="rgba(43,29,10,0.2)"/>
      <rect x="-56" y="-24" width="112" height="46" rx="14" fill="${skin.body}" stroke="${skin.dark}" stroke-width="4"/>
      <rect x="-26" y="-18" width="46" height="34" rx="8" fill="${skin.light}"/>
      <rect x="-20" y="-18" width="34" height="14" rx="5" fill="#c7e6f2" stroke="#8fbfd4" stroke-width="2"/>
      <circle cx="-34" cy="26" r="12" fill="#332a20"/><circle cx="-34" cy="26" r="5" fill="#8f8578"/>
      <circle cx="34" cy="26" r="12" fill="#332a20"/><circle cx="34" cy="26" r="5" fill="#8f8578"/>
      <circle cx="52" cy="-10" r="5" fill="#ffe9a8" stroke="${skin.dark}" stroke-width="2"/>
    </g></g>`;

  return `<svg viewBox="0 0 900 620" preserveAspectRatio="xMidYMid slice" class="yard-svg">
    <rect class="yard-sky" x="0" y="0" width="900" height="320" fill="#bfe3f2"/>
    <g class="yard-stars" fill="#fff4c7">
      <circle cx="340" cy="42" r="3"/><circle cx="392" cy="92" r="2.5"/>
      <circle cx="466" cy="38" r="3.5"/><circle cx="535" cy="116" r="2.5"/>
      <circle cx="604" cy="48" r="3"/><circle cx="676" cy="104" r="2.5"/>
      <circle cx="730" cy="34" r="3"/><circle cx="850" cy="138" r="3"/>
      <path d="M322 122l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>
      <path d="M578 82l4 9 9 4-9 4-4 9-4-9-9-4 9-4z"/>
      <path d="M698 160l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>
      <path d="M842 54l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>
    </g>
    <g class="yard-sun">
      <circle cx="788" cy="86" r="46" fill="#f6c445"/>
      <circle cx="788" cy="86" r="60" fill="#f6c445" opacity="0.25"/>
    </g>
    <g class="yard-moon">
      <circle cx="788" cy="86" r="48" fill="#fff3c4" opacity="0.18"/>
      <circle cx="788" cy="86" r="38" fill="#fff3c4"/>
      <circle cx="773" cy="75" r="7" fill="#e5d9ab" opacity="0.72"/>
      <circle cx="802" cy="96" r="9" fill="#e5d9ab" opacity="0.58"/>
      <circle cx="805" cy="69" r="4" fill="#e5d9ab" opacity="0.64"/>
    </g>
    <g class="clouds-drift">
      <ellipse cx="200" cy="86" rx="66" ry="24" fill="#ffffff" opacity="0.85"/>
      <ellipse cx="256" cy="100" rx="48" ry="18" fill="#ffffff" opacity="0.7"/>
      <ellipse cx="580" cy="60" rx="54" ry="19" fill="#ffffff" opacity="0.8"/>
    </g>
    <rect x="0" y="252" width="900" height="368" fill="#79b34c"/>
    <path d="M0 252 Q450 236 900 252 L900 268 Q450 252 0 268 Z" fill="#6cae46"/>
    ${fairLayer}
    ${celebrationLayer}
    ${house}
    ${workshopLayer}
    ${trophyLayer}
    ${yard}
    ${wellLayer}
    ${gardenLayer}
    ${pondLayer}
    ${trash}
    ${fence}
    ${gate}
    ${laundryLayer}
    ${kennel}
    ${tree}
    ${car}
    <g transform="translate(408,300)" data-tap="meow"><g class="tap-inner">${catArt()}</g></g>
    <g transform="translate(210,500) scale(1.4)" data-tap="cluck"><g class="tap-inner"><g class="chicken-bob">${chickenArt()}</g></g></g>
    <g transform="translate(268,530) scale(1.2) scale(-1,1)" data-tap="cluck"><g class="tap-inner"><g class="chicken-bob" style="animation-delay:2.3s">${chickenArt()}</g></g></g>
    ${season === 'newyear' ? snowOverlay() : ''}
  </svg>`;
}
