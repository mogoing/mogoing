// What makes the ground a page of a book: faint printed text far from the road — running heads, page
// numbers and a passage of the chapter's story on each page. One CanvasTexture per track (disposed with the
// track) and one merged mesh of flat quads. Page text uses a system serif; nothing is downloaded.
import * as THREE from 'three';

const SERIF = 'Georgia, "Times New Roman", "Noto Serif", "Noto Serif CJK SC", "Songti SC", "STSong", SimSun, serif';

const STORY = {
  meadow: [
    '从前，有一条纸做的路，长不过雏菊。每次翻开书页，山丘立起，篱笆升起，风把纸边吹得沙沙响。',
    '路在弯道变窄，桥下溪水潺潺。当心：驶出边线，就会跌下书页！',
  ],
  bosphorus: [
    '入夜，海峡两岸染上墨蓝。桥灯落入水中，渡轮穿行在纸浪之间。',
    '路沿海岸蜿蜒；一边是海，一边是穹顶。在急弯不减速的，会一头扎进冷水。',
  ],
  glacier: [
    '雪白的隘口在清晨醒来于粉色的光中。结冰的湖面亮如镜面，松树张开纸做的翅膀。',
    '车轮在冰上打滑。悬崖的尽头是书页剪开的边缘：下面只有书桌。',
  ],
  desk: [
    '最后的章节，路跃出书页，落到读者的书桌上。尺子成桥，铅笔成篱，回形针是弯道。',
    '从桌沿望下去，书像一座山。趁墨水未干，冲过终点线！',
  ],
};
const STORY_DEFAULT = [
  '这一页，一条新路开始。纸做的山丘立起，线条活了过来，比赛一直延续到下一页。',
  '在读者翻页之前，八位车手最后一次踩下油门。',
];

// CJK has no word spaces: every ideograph is its own breakable token so wrapped text never overflows.
const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFFEF]/;
function tokensOf(text) {
  const out = [];
  let buf = '';
  const flush = () => { if (buf) { out.push(buf); buf = ''; } };
  for (const ch of text) {
    if (ch === ' ') { flush(); continue; }
    if (CJK_RE.test(ch)) { flush(); out.push(ch); }
    else buf += ch;
  }
  flush();
  return out;
}

function luminance(c) {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function wrapLines(g, text, width) {
  const tokens = tokensOf(text);
  const lines = [];
  let line = '';
  for (const t of tokens) {
    const next = line ? line + ' ' + t : t;
    if (g.measureText(next).width > width && line) { lines.push(line); line = t; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// Justified paragraph with a drop cap, like a picture book's text block.
function paragraph(g, text, x, y, w, size) {
  g.font = `${size}px ${SERIF}`;
  const cap = text[0];
  const capSize = size * 2.6;
  g.font = `bold ${capSize}px ${SERIF}`;
  const capW = g.measureText(cap).width + size * 0.3;
  g.fillText(cap, x, y + capSize * 0.78);
  g.font = `${size}px ${SERIF}`;
  const lead = size * 1.32;
  const rest = text.slice(1);
  const allLines = wrapLines(g, rest, w);
  const firstLines = allLines.slice(0, 2);
  const used = firstLines.join('').length;
  const lines = firstLines.map((l) => ({ t: l, x: x + capW, w: w - capW }))
    .concat(wrapLines(g, rest.slice(used).trim(), w).map((l) => ({ t: l, x, w })));
  lines.forEach((l, k) => {
    const words = tokensOf(l.t);
    const last = k === lines.length - 1;
    const gapW = last || words.length < 2 ? g.measureText(' ').width
      : (l.w - words.reduce((a, s) => a + g.measureText(s).width, 0)) / (words.length - 1);
    let cx = l.x;
    for (const s of words) { g.fillText(s, cx, y + size + k * lead); cx += g.measureText(s).width + gapW; }
  });
}

function fleuron(g, x, y, s) {
  g.beginPath();
  for (const d of [-1, 1]) {
    g.moveTo(x, y);
    g.bezierCurveTo(x + d * s * 0.5, y - s * 0.5, x + d * s, y - s * 0.1, x + d * s * 1.6, y);
    g.bezierCurveTo(x + d * s, y + s * 0.1, x + d * s * 0.5, y + s * 0.5, x, y);
  }
  g.fill();
  g.beginPath(); g.arc(x, y, s * 0.16, 0, Math.PI * 2); g.fill();
}

// Canvas layout (2048 × 1024): two passages (0..1024 × 0..512 / 512..1024), left head, right head,
// two page numbers, and a chapter ornament line.
const REGIONS = {
  passageA: [0, 0, 1024, 512], passageB: [0, 512, 1024, 512],
  headL: [1024, 0, 1024, 256], headR: [1024, 256, 1024, 256],
  numL: [1024, 512, 512, 256], numR: [1536, 512, 512, 256],
  orn: [1024, 768, 1024, 256],
};

function drawCanvas(def, inkCss) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = inkCss;
  g.textBaseline = 'alphabetic';
  const story = STORY[def.id] || STORY_DEFAULT;
  paragraph(g, story[0], 40, 30, 944, 44);
  paragraph(g, story[1], 40, 542, 944, 44);
  const head = (text, [x, y, w, h]) => {
    g.font = `600 ${Math.round(h * 0.34)}px ${SERIF}`;
    g.textAlign = 'center';
    const spaced = text.split('').join(String.fromCharCode(8202));
    g.fillText(spaced, x + w / 2, y + h * 0.62);
    g.fillRect(x + w * 0.18, y + h * 0.8, w * 0.64, 3);
    g.textAlign = 'left';
  };
  head('纸卡丁车', REGIONS.headL);
  head(def.name || '', REGIONS.headR);
  const chapter = def.chapter || 1;
  const left = 2 * (5 + 6 * chapter);
  const num = (n, [x, y, w, h]) => {
    g.font = `italic ${Math.round(h * 0.62)}px ${SERIF}`;
    g.textAlign = 'center';
    g.fillText(String(n), x + w / 2, y + h * 0.72);
    g.textAlign = 'left';
  };
  num(left, REGIONS.numL);
  num(left + 1, REGIONS.numR);
  const [ox, oy, ow, oh] = REGIONS.orn;
  g.font = `italic ${Math.round(oh * 0.3)}px ${SERIF}`;
  g.textAlign = 'center';
  g.fillText(def.subtitle || '', ox + ow / 2, oy + oh * 0.46);
  g.textAlign = 'left';
  fleuron(g, ox + ow / 2, oy + oh * 0.72, 34);
  return c;
}

// page: { minX, maxX, minZ, maxZ, y, spineX }; clearance(x, z) → metres from the nearest drivable edge.
export function buildPagePrint(mats, def, page, clearance) {
  const theme = def.theme;
  const paper = new THREE.Color(theme.paper), ink = new THREE.Color(theme.ink);
  // light print on a dark page (night chapters), ink print otherwise
  const inkCol = luminance(paper) < 0.18 ? paper.clone().lerp(new THREE.Color(theme.roadLine || '#f4e6c4'), 0.55) : ink;
  const canvas = drawCanvas(def, '#' + inkCol.getHexString(THREE.SRGBColorSpace));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.name = 'pagePrint';

  const quads = [];
  const put = (region, cx, cz, w) => {
    const [rx, ry, rw, rh] = REGIONS[region];
    const h = w * rh / rw;
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) {
      uv.setXY(k, (rx + uv.getX(k) * rw) / 2048, 1 - (ry + (1 - uv.getY(k)) * rh) / 1024);
    }
    geo.rotateX(-Math.PI / 2);
    geo.translate(cx, page.y + 0.02, cz);
    quads.push(geo);
  };

  const { minX, maxX, minZ, maxZ, spineX } = page;
  const pages = [[minX, spineX], [spineX, maxX]];
  const headW = Math.min(150, (spineX - minX) * 0.45);
  put('headL', (minX + spineX) / 2, minZ + 26, headW);
  put('headR', (spineX + maxX) / 2, minZ + 26, headW);
  put('numL', minX + 42, maxZ - 26, 40);
  put('numR', maxX - 42, maxZ - 26, 40);

  // Each passage goes where its page is emptiest: the candidate farthest from the road.
  const blockW = 118, blockH = 59;
  pages.forEach(([x0, x1], k) => {
    let best = null;
    for (let x = x0 + blockW / 2 + 30; x <= x1 - blockW / 2 - 30; x += 16) {
      for (let z = minZ + 70; z <= maxZ - 60 - blockH; z += 16) {
        let c = Infinity;
        for (const [dx, dz] of [[-0.5, 0], [0.5, 0], [-0.5, 1], [0.5, 1], [0, 0.5]]) c = Math.min(c, clearance(x + dx * blockW, z + dz * blockH));
        if (!best || c > best.c) best = { x, z, c };
      }
    }
    if (best && best.c > 30) {
      put(k ? 'passageB' : 'passageA', best.x, best.z + blockH / 2, blockW);
      if (k === 1) put('orn', best.x, best.z + blockH + 16, 60);
    }
  });

  const geo = mergeQuads(quads);
  const mat = mats.paper('#ffffff', { map: tex, transparent: true, depthWrite: false, halftone: false, unique: true, opacity: 0.62 });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -4;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'pagePrint';
  mesh.receiveShadow = true;
  return { mesh, dispose() { tex.dispose(); } };
}

function mergeQuads(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const idx = [];
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    for (const i of g.index.array) idx.push(i + o);
    o += g.attributes.position.count;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}
