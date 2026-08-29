/**
 * Двор-меню: звёзды открывают отдельные объекты, а прохождение кампании
 * перестраивает саму сцену каждые десять уровней.
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

/** Лепестки цветущих яблонь (весна): маленькие розовые «лепестки»-эллипсы. */
function petalOverlay(): string {
  const petals = [
    [70, -12, 0], [160, -26, 1.1], [250, -8, 0.5], [340, -30, 1.7], [430, -16, 0.9],
    [520, -34, 0.2], [610, -10, 1.3], [700, -22, 0.6], [790, -14, 1.8], [850, -30, 0.4]
  ];
  return `<g class="yard-petals">${petals
    .map(
      ([x, y, delay]) =>
        `<ellipse cx="${x}" cy="${y}" rx="5" ry="3" style="animation-delay:${delay}s"/>`
    )
    .join('')}</g>`;
}

/** Золотые листья урожая (сентябрь): маленькие «листья»-ромбы. */
function leafOverlay(): string {
  const leaves = [
    [80, -14, 0], [150, -28, 0.8], [260, -10, 1.5], [350, -26, 0.3], [440, -18, 1.2],
    [530, -32, 0.6], [620, -8, 1.9], [710, -24, 0.1], [800, -12, 1.4], [860, -26, 0.7]
  ];
  return `<g class="yard-leaves">${leaves
    .map(
      ([x, y, delay]) =>
        `<path d="M${x} ${y} l5 4 l-5 4 l-5 -4 z" style="animation-delay:${delay}s"/>`
    )
    .join('')}</g>`;
}

/** Сезонный слой поверх двора: снег (Новый год), лепестки (весна), листья (урожай). */
function seasonOverlay(season: string | undefined): string {
  if (season === 'newyear') return snowOverlay();
  if (season === 'spring') return petalOverlay();
  if (season === 'harvest') return leafOverlay();
  return '';
}

/**
 * Рекорд «Бесконечного двора», с которого во дворе появляется отдельный кубок
 * за серию (Stage C). Порог совпадает с «чемпионской» отметкой — 10 уровней
 * подряд; кубок статичный: это памятный знак, а не счётчик.
 */
const ENDLESS_TROPHY_STREAK = 10;

export function yardSVG(u: Set<string>, trophies = 0, season?: string, stage = 0, endlessBest = 0): string {
  const milestone = Math.min(10, Math.max(0, Math.floor(stage)));
  const era = Math.floor(milestone / 2);
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

  const houseWalls = ['#a9743f', '#c18b51', '#d3a663', '#e0b96f', '#e9c878', '#f0d287'];
  const houseRoofs = ['#8a5a30', '#9c5c36', '#ad563b', '#bc5040', '#c84842', '#bd3f42'];
  const skyColors = ['#c4d8d3', '#b9ddd6', '#abded6', '#9ddbd1', '#8ed5cb', '#80ccc4'];
  const grassColors = ['#79a958', '#79ad55', '#75ae50', '#70ad4d', '#69aa49', '#62a545'];
  const dirtColors = ['#c89f63', '#d0aa6c', '#d7b477', '#d9b878', '#dcbf80', '#e0c789'];
  const houseWall = houseWalls[era];
  const houseRoof = houseRoofs[era];
  const skyColor = skyColors[era];
  const grassColor = grassColors[era];
  const dirtColor = dirtColors[era];
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
    <g class="yard-house yard-era-${era}">
    <rect x="52" y="150" width="230" height="160" rx="8" fill="${houseWall}" stroke="#7d5227" stroke-width="5"/>
    ${
      era === 0
        ? `<line x1="52" y1="192" x2="282" y2="192" stroke="#7d5227" stroke-width="4"/>
           <line x1="52" y1="232" x2="282" y2="232" stroke="#7d5227" stroke-width="4"/>
           <line x1="52" y1="272" x2="282" y2="272" stroke="#7d5227" stroke-width="4"/>`
        : `<path d="M64 166H270M64 286H270" stroke="#f4dfaa" stroke-width="4" opacity=".65"/>`
    }
    <path d="M30 156 L167 66 L304 156 Z" fill="${houseRoof}" stroke="#63401f" stroke-width="5" stroke-linejoin="round"/>
    <rect x="238" y="84" width="26" height="52" fill="${era >= 2 ? '#8f4c39' : '#7d5227'}"/>
    ${era >= 3 ? `<path d="M245 80q-18-28 5-42q18 16 5 40" fill="#e9eef0" opacity=".7"/>` : ''}
    <rect class="house-window" x="118" y="208" width="66" height="58" rx="6" fill="#cfe9f2" stroke="#7d5227" stroke-width="5"/>
    <line x1="151" y1="208" x2="151" y2="266" stroke="#7d5227" stroke-width="4"/>
    <line x1="118" y1="237" x2="184" y2="237" stroke="#7d5227" stroke-width="4"/>
    <rect x="98" y="204" width="14" height="66" rx="4" fill="#45968f"/>
    <rect x="190" y="204" width="14" height="66" rx="4" fill="#45968f"/>
    <rect x="222" y="194" width="42" height="116" rx="5" fill="${era >= 2 ? '#6f4930' : '#825735'}" stroke="#63401f" stroke-width="4"/>
    <circle cx="252" cy="252" r="4" fill="#f6c445"/>
    ${
      era >= 2
        ? `<rect x="208" y="292" width="72" height="14" rx="4" fill="#a9743f" stroke="#704723" stroke-width="4"/>
           <path d="M216 306h58l-8 16h-42z" fill="#b98d55" stroke="#704723" stroke-width="3"/>
           <g transform="translate(77,194)"><rect width="30" height="16" rx="4" fill="#8a5a30"/>
             <circle cx="7" cy="5" r="5" fill="#e2574c"/><circle cx="17" cy="4" r="5" fill="#f6c445"/><circle cx="25" cy="7" r="5" fill="#e88fb6"/></g>`
        : ''
    }
    ${era >= 4 ? `<path d="M42 160H292" stroke="#fff1d0" stroke-width="7" stroke-linecap="round"/>` : ''}
    ${era >= 5 ? `<g transform="translate(164,176)"><path d="M0-18l7 10 12-2-5 11 7 10-12 1-9 9-9-9-12-1 7-10-5-11 12 2z" fill="#f6c445" stroke="#8a5a30" stroke-width="3"/><circle r="7" fill="#fff1d0"/></g>` : ''}
    </g>`;

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
    ? `<g transform="translate(742,420)" data-yard-obj="kennel">
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
    : `<g transform="translate(742,432)" data-yard-obj="kennel">
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
    ? `<g transform="translate(836,318)" data-yard-obj="tree">
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
    <ellipse cx="470" cy="470" rx="330" ry="110" fill="${dirtColor}"/>
    <ellipse cx="470" cy="470" rx="330" ry="110" fill="none" stroke="rgba(93,64,25,0.2)" stroke-width="4" stroke-dasharray="${milestone >= 4 ? '4 12' : '16 14'}"/>
    ${
      milestone >= 2
        ? `<path d="M240 300Q282 354 344 392Q390 420 450 452" fill="none" stroke="#d8c7a4" stroke-width="34" stroke-linecap="round"/>
           <path d="M240 300Q282 354 344 392Q390 420 450 452" fill="none" stroke="#eee2c7" stroke-width="4" stroke-dasharray="10 16" stroke-linecap="round"/>`
        : ''
    }
    ${
      milestone >= 4
        ? `<g fill="#b9ad91" stroke="#8f826b" stroke-width="2">
            <ellipse cx="298" cy="340" rx="18" ry="9"/><ellipse cx="330" cy="372" rx="20" ry="10"/>
            <ellipse cx="368" cy="402" rx="22" ry="11"/><ellipse cx="410" cy="430" rx="21" ry="10"/>
          </g>`
        : ''
    }`;

  const landscapeLayer = `
    <g class="yard-landscape yard-era-${era}">
      <path d="M0 252Q120 188 248 242T520 226T900 238V286H0Z" fill="${era >= 3 ? '#568f4d' : '#639a56'}"/>
      <path d="M0 254Q150 226 302 258T610 246T900 252V292H0Z" fill="${era >= 4 ? '#6aa34f' : '#70a856'}"/>
      ${
        milestone >= 1
          ? `<g opacity=".7" stroke="#e7d595" stroke-width="5" fill="none">
               <path d="M348 236q58-34 116 0M380 248q52-30 104 0M706 236q52-30 104 0"/>
             </g>`
          : ''
      }
      ${
        milestone >= 6
          ? `<g transform="translate(610,178)" fill="#d9b56f" stroke="#775335" stroke-width="4">
               <rect x="0" y="34" width="94" height="54" rx="5"/>
               <path d="M-8 38L47 2l55 36z" fill="#a94f3c"/>
               <rect x="38" y="54" width="20" height="34" fill="#6f4930"/>
             </g>`
          : ''
      }
    </g>`;

  const progressLayer = `
    <g class="yard-campaign-progress" data-yard-stage="${milestone}">
      ${
        milestone >= 1
          ? `<g transform="translate(350,520)" data-yard-detail="woodpile">
               <rect x="-54" y="28" width="108" height="9" rx="4" fill="#715035"/>
               ${[-40, -14, 12, 38].map((x) => `<circle cx="${x}" cy="17" r="15" fill="#a9743f" stroke="#684426" stroke-width="4"/><circle cx="${x}" cy="17" r="6" fill="none" stroke="#d5a567" stroke-width="2"/>`).join('')}
             </g>`
          : ''
      }
      ${
        milestone >= 3
          ? `<g transform="translate(418,262)" data-yard-detail="birdhouse">
               <rect x="-5" y="-48" width="10" height="80" rx="4" fill="#704a2b"/>
               <rect x="-26" y="-72" width="52" height="42" rx="6" fill="#d75b48" stroke="#7d3d31" stroke-width="4"/>
               <path d="M-34-68L0-94l34 26z" fill="#8a5a30" stroke="#63401f" stroke-width="4"/>
               <circle cx="0" cy="-51" r="9" fill="#3d2c1e"/>
             </g>`
          : ''
      }
      ${
        milestone >= 5
          ? `<g transform="translate(340,316)" data-yard-detail="work-corner">
               <rect x="-36" y="-32" width="72" height="64" rx="6" fill="#9a6a42" stroke="#684426" stroke-width="4"/>
               <path d="M-24-13H24M-24 5H24M-24 23H8" stroke="#dfc28b" stroke-width="5" stroke-linecap="round"/>
               <path d="M43-22v54M35-6h22M39 18h16" stroke="#6f918f" stroke-width="6" stroke-linecap="round"/>
             </g>`
          : ''
      }
      ${
        milestone >= 6
          ? `<g transform="translate(456,520)" data-yard-detail="planter">
               <ellipse rx="64" ry="25" fill="#c9b28a" stroke="#89775c" stroke-width="4"/>
               <ellipse rx="39" ry="13" fill="#e9dcc1"/>
               <g transform="translate(-78,-7)"><rect x="-18" y="-16" width="36" height="34" rx="8" fill="#a95e42"/><circle cx="-8" cy="-18" r="13" fill="#e2574c"/><circle cx="9" cy="-20" r="14" fill="#f6c445"/></g>
             </g>`
          : ''
      }
      ${
        milestone >= 7
          ? `<g transform="translate(744,236)" data-yard-detail="bench">
               <rect x="-58" y="0" width="116" height="16" rx="6" fill="#a9743f" stroke="#704723" stroke-width="4"/>
               <rect x="-52" y="-35" width="104" height="13" rx="5" fill="#b98248" stroke="#704723" stroke-width="4"/>
               <path d="M-43 14v35M43 14v35" stroke="#704723" stroke-width="8" stroke-linecap="round"/>
             </g>`
          : ''
      }
      ${
        milestone >= 8
          ? `<g transform="translate(554,286)" data-yard-detail="pergola">
               <path d="M-78 6V-74M78 6V-74M-88-70H88" fill="none" stroke="#85572f" stroke-width="10" stroke-linecap="round"/>
               <path d="M-76-65Q-40-96 0-66T76-65" fill="none" stroke="#4f8f43" stroke-width="10" stroke-linecap="round"/>
               <circle cx="-52" cy="-75" r="8" fill="#e88fb6"/><circle cx="-12" cy="-78" r="8" fill="#f6c445"/>
               <circle cx="30" cy="-72" r="8" fill="#e2574c"/><circle cx="63" cy="-76" r="8" fill="#f6c445"/>
             </g>`
          : ''
      }
      ${
        milestone >= 9
          ? `<g transform="translate(368,166)" data-yard-detail="award-sign">
               <path d="M-48-30H48L39 28H-39Z" fill="#286f65" stroke="#f0d287" stroke-width="5"/>
               <path d="M0-18l7 11 13 1-9 9 3 13-14-6-14 6 3-13-9-9 13-1z" fill="#f6c445"/>
             </g>`
          : ''
      }
      ${
        milestone >= 10
          ? `<g class="yard-champion-arch" data-yard-detail="champion-arch">
               <path d="M480 292Q554 205 628 292" fill="none" stroke="#f0d287" stroke-width="16" stroke-linecap="round"/>
               <path d="M480 292Q554 218 628 292" fill="none" stroke="#287d72" stroke-width="8" stroke-linecap="round"/>
               <circle cx="554" cy="233" r="24" fill="#f6c445" stroke="#8a5a30" stroke-width="5"/>
               <path d="M554 219l5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2z" fill="#fff1d0"/>
             </g>`
          : ''
      }
    </g>`;

  const workshopLayer = workshop
    ? `<g transform="translate(290,188)" data-yard-obj="workshop">
        <rect width="120" height="112" rx="7" fill="#bd8247" stroke="#7d5227" stroke-width="5"/>
        <path d="M-10 4 L60 -38 L130 4 Z" fill="#8a5a30" stroke="#63401f" stroke-width="5"/>
        <rect x="20" y="38" width="80" height="74" rx="5" fill="#6f918f" stroke="#5d4020" stroke-width="5"/>
        <path d="M28 60 H92 M28 82 H92" stroke="#d7ecea" stroke-width="5"/>
        <g transform="translate(60,-14)"><circle r="14" fill="#f6c445"/><path d="M-12 0H12M0-12V12" stroke="#8a5a30" stroke-width="5"/></g>
      </g>`
    : '';
  const wellLayer = well
    ? `<g transform="translate(684,292)" data-yard-obj="well">
        <ellipse cx="0" cy="28" rx="48" ry="19" fill="#8c9691" stroke="#626b68" stroke-width="5"/>
        <rect x="-48" y="0" width="96" height="30" fill="#9ca7a1" stroke="#626b68" stroke-width="5"/>
        <ellipse cx="0" cy="0" rx="48" ry="18" fill="#3f7184" stroke="#626b68" stroke-width="5"/>
        <path d="M-34 -2V-62M34-2V-62M-44-58Q0-92 44-58" fill="none" stroke="#7d5227" stroke-width="8"/>
        <circle cx="0" cy="-42" r="10" fill="#a9743f" stroke="#63401f" stroke-width="4"/>
      </g>`
    : '';
  const gardenLayer = garden
    ? `<g transform="translate(30,476)" data-yard-obj="garden">
        ${[0, 26, 52].map((y) => `<path d="M0 ${y} Q70 ${y - 14} 140 ${y}" fill="none" stroke="#81552e" stroke-width="14" stroke-linecap="round"/>`).join('')}
        ${[18, 52, 86, 120].map((x, i) => `<g transform="translate(${x},${(i % 3) * 26 - 5})"><path d="M0 12V-4" stroke="#377334" stroke-width="5"/><circle cx="-6" cy="-5" r="8" fill="#5fa74e"/><circle cx="7" cy="-8" r="8" fill="#6db75b"/></g>`).join('')}
      </g>`
    : '';
  const pondLayer = pond
    ? `<g transform="translate(684,530)" data-yard-obj="pond">
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
    ? `<g transform="translate(214,174)" data-yard-obj="trophies"><rect x="-8" y="-12" width="${Math.min(trophies, 6) * 22 + 12}" height="32" rx="8" fill="rgba(61,44,30,.58)"/>${Array.from({ length: Math.min(trophies, 6) }, (_, i) => `<text x="${i * 22}" y="12" font-size="20">🏆</text>`).join('')}</g>`
    : '';
  // Кубок за серию «Бесконечного двора» — правее полки недельных кубков,
  // на тумбе: отличие от коллекционных кубков сразу видно.
  const endlessTrophyLayer =
    endlessBest >= ENDLESS_TROPHY_STREAK
      ? `<g transform="translate(392,174)" data-yard-obj="endless-trophy"><ellipse cx="0" cy="16" rx="26" ry="6" fill="rgba(43,29,10,0.2)"/><rect x="-14" y="2" width="28" height="12" rx="4" fill="#8a6a43" stroke="#5f472b" stroke-width="3"/><text x="0" y="0" font-size="24" text-anchor="middle">🏆</text><text x="14" y="-14" font-size="12" text-anchor="middle">🌀</text></g>`
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

  return `<svg viewBox="0 0 900 620" preserveAspectRatio="xMidYMid slice" class="yard-svg yard-stage-${milestone}" data-yard-stage="${milestone}" data-yard-era="${era}">
    <rect class="yard-sky" x="0" y="0" width="900" height="320" fill="${skyColor}"/>
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
    ${landscapeLayer}
    <rect x="0" y="252" width="900" height="368" fill="${grassColor}"/>
    <path d="M0 252 Q450 236 900 252 L900 268 Q450 252 0 268 Z" fill="${era >= 3 ? '#5e9b48' : '#6cae46'}"/>
    ${fairLayer}
    ${celebrationLayer}
    ${house}
    ${workshopLayer}
    ${trophyLayer}
    ${endlessTrophyLayer}
    ${yard}
    ${progressLayer}
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
    ${seasonOverlay(season)}
  </svg>`;
}
