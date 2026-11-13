// 3D-движок «Города подписчиков» (Three.js). Ночной неон.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------- планировка ----------
export const isRoad = (x, y) => (((x % 3) + 3) % 3 === 0) || (((y % 3) + 3) % 3 === 0);
const blockOf = (x, y) => [Math.floor((x - 1) / 3), Math.floor((y - 1) / 3)];
// Центральные кварталы под здания-рубежи: [bx, by]
export const LANDMARK_BLOCKS = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]];
const RES = new Set(LANDMARK_BLOCKS.map(b => b.join(',')));
export const blockCenter = ([bx, by]) => [3 * bx + 2, 3 * by + 2];
// ---------- река ----------
// извилистая неоновая река через весь город (южнее центральной площади); riverZ(x) — середина русла
export const riverZ = x => -13 + 5 * Math.sin(x / 17) + 2 * Math.sin(x / 7.3 + 1);
export const RIVER_W = 1.7; // полуширина воды
export const inWater = (x, z, pad = 0) => Math.abs(z - riverZ(x)) < RIVER_W + pad;
const riverSlope = x => 5 / 17 * Math.cos(x / 17) + 2 / 7.3 * Math.cos(x / 7.3 + 1);
const md = (v, m) => ((v % m) + m) % m;

// ---------- районы и улицы ----------
const DIST_N = ['Пиксельный квартал', 'Лазерная слобода', 'Фиолетовые холмы', 'Хромовый район', 'Синтвейв', 'Кибер-сити', 'Мятный квартал', 'Розовый бульвар',
  'Голографский', 'Электрогорск', 'Неоновые сады', 'Аркадный район', 'Вольтовка', 'Светлячково', 'Диско-сторона', 'Радужный'];
const DIST_S = ['Заречье', 'Лунная гавань', 'Набережный', 'Мостовой', 'Тихая заводь', 'Звёздный берег', 'Маячный', 'Причальный'];
const STREETS = ['Неоновая', 'Пиксельная', 'Лазерная', 'Хромовая', 'Световая', 'Вольтовая', 'Голографическая', 'Аркадная', 'Ночная', 'Звёздная',
  'Лунная', 'Радужная', 'Электрическая', 'Мятная', 'Розовая', 'Фиолетовая', 'Диско', 'Синтовая', 'Яркая', 'Кибер'];
export function districtOf(x, z) {
  if (Math.hypot(x - 2, z - 2) < 11) return 'Неоновый центр';
  const sx = Math.floor((x + 10) / 21), sz = Math.floor((z + 10) / 21);
  return z < riverZ(x) ? DIST_S[md(sx * 3 + sz, DIST_S.length)] : DIST_N[md(sx * 5 + sz * 3, DIST_N.length)];
}
// дом смотрит дверью на ближайшую «горизонтальную» улицу своего квартала
const streetSide = cy => md(cy, 3) === 1 ? -1 : 1; // -1: улица со стороны меньших z
export function addressOf(cx, cy) {
  const s = streetSide(cy), roadY = cy + s, name = STREETS[md(roadY / 3, STREETS.length)];
  return { street: name + ' улица', num: 2 * (cx + 92) + (s < 0 ? 1 : 2) };
}

// ---------- места: парки, площади, памятники ----------
// примерно каждый 16-й квартал (сдвиг через ряд — места разбросаны равномерно); в воде и в центре мест нет
const PLACE_KINDS = ['park', 'square', 'fountain', 'park', 'playground', 'art', 'park', 'monument'];
const PLACE_NAMES = {
  park: ['Парк «Неон»', 'Сад Светлячков', 'Парк Подписчиков', 'Лазерный сквер', 'Парк Мечты', 'Сквер Лайков', 'Ночной сад', 'Парк Огней'],
  square: ['Площадь Подписчиков', 'Площадь Первого дома', 'Площадь Рекомендаций', 'Звёздная площадь'],
  fountain: ['Поющий фонтан', 'Фонтан желаний', 'Неоновый фонтан'],
  playground: ['Детская площадка', 'Площадка «Радуга»', 'Двор игр'],
  art: ['Арт-объект «Сердце»', 'Неоновое кольцо', 'Арт-объект «Лайк»'],
  monument: ['Памятник Первому жителю', 'Памятник Подписке', 'Памятник Автору'],
};
export function placeAt(bx, by) {
  if (md(by, 4) !== 2 || md(bx + (md(Math.floor(by / 4), 2) ? 2 : 0), 4) !== 1) return null;
  const [cx, cz] = blockCenter([bx, by]); if (Math.hypot(cx - 2, cz - 2) < 6 || inWater(cx, cz, 1.2)) return null;
  const i = md(bx * 7 + by * 13, 97), kind = PLACE_KINDS[i % PLACE_KINDS.length], names = PLACE_NAMES[kind];
  return { kind, name: names[(i >> 3) % names.length], bx, by, x: cx, z: cz };
}

export const CELLS = [];
for (let x = -90; x <= 90; x++) for (let y = -90; y <= 90; y++) { const b = blockOf(x, y); if (!isRoad(x, y) && !RES.has(b.join(',')) && !inWater(x + .5, y + .5, .75) && !placeAt(b[0], b[1])) CELLS.push([x, y]); }
CELLS.sort((a, b) => (Math.hypot(a[0] + .5 - 2, a[1] + .5 - 2) - Math.hypot(b[0] + .5 - 2, b[1] + .5 - 2)) || (a[0] - b[0]) || (a[1] - b[1]));

function rnd(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---------- палитры ----------
export const WALLS = ['#f28b82', '#fbc95a', '#a7d36f', '#7cc8ff', '#c9a0e8', '#ffab91', '#86d4c8', '#fff08a', '#f7a8d0', '#9fb4ff'];
export const ROOFS = ['#c2414b', '#3d5a99', '#6b3fa0', '#2f7a6b', '#b8562f', '#374070'];
export const LIGHT_C = { warm: '#ffc95e', cool: '#8fe3ff', pink: '#ff8fd0', green: '#a6ff8f' };
export const BIZ = {
  burger: ['БУРГЕРНАЯ', '#ff9f1a'], coffee: ['КОФЕЙНЯ', '#c08457'], pizza: ['ПИЦЦА', '#ff4d4d'], shop: ['МАГАЗИН', '#4dabf7'],
  gym: ['КАЧАЛКА', '#ff3d7f'], studio: ['СТУДИЯ', '#b197fc'], gaming: ['КИБЕРКЛУБ', '#20e3b2'], cinema: ['КИНО', '#ffd23f'],
};
// вывески на обычных домах-бизнесах (каждый ~5-й невысокий дом)
const STREET_BIZ = [['КОФЕЙНЯ', '#ffb36b'], ['ДОНЕРНАЯ', '#ff9f1a'], ['БАРБЕРШОП', '#5ef2ff'], ['ЦВЕТЫ', '#ff7ad9'], ['ПЕКАРНЯ', '#ffd23f'], ['СУШИ', '#ff4d6d'],
  ['ПИЦЦА', '#ff4d4d'], ['КИБЕРКЛУБ', '#20e3b2'], ['МАГАЗИН', '#4dabf7'], ['КАЧАЛКА', '#ff3d7f'], ['АПТЕКА', '#63e6be'], ['КНИГИ', '#c084fc']];
export const DECOR = ['garland', 'tree', 'car', 'pet'];
const EMOJI = { sun: '☀️', moon: '🌙', star: '⭐', heart: '❤️', clock: '🕐', crown: '👑', flame: '🔥', leaf: '🍃', lightning: '⚡', diamond: '💎', snake: '🐍' };

const FOOT = 0.72, FH = 0.3;
// пробный режим «улицы-фасады»: дома стоят вплотную вдоль улицы, внутри квартала двор (?facade=1)
const FACADE = typeof location !== 'undefined' && /[?&]facade=1/.test(location.search);

// ---------- текстуры ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const noiseTex = (base, spread, n, rep, extra) => { const t = canvasTex(256, 256, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h);
  const r0 = rnd(n); for (let i = 0; i < n * 40; i++) { const v = Math.floor((r0() - .5) * spread); g.fillStyle = `rgba(${v > 0 ? '255,255,255' : '0,0,0'},${Math.abs(v) / 255})`; g.fillRect(r0() * w, r0() * h, 1 + r0() * 3, 1 + r0() * 3); }
  if (extra) extra(g, w, h, r0); }); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep, rep); return t; };
const ASPHALT_T = noiseTex('#8a8a92', 60, 300, 90, (g, w, h, r) => { g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; for (let i = 0; i < 6; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - .5) * 40; y += (r() - .5) * 40; g.lineTo(x, y); } g.stroke(); } });
const PAVE_T = noiseTex('#b9b9c4', 40, 120, 0, (g, w, h) => { g.strokeStyle = 'rgba(40,40,60,.45)'; g.lineWidth = 2; for (let i = 0; i <= w; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } });
const GRASS_T = noiseTex('#7fae6a', 90, 500, 0, (g, w, h, r) => { for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${r() < .5 ? '40,90,40' : '170,210,120'},.35)`; g.beginPath(); g.arc(r() * w, r() * h, 3 + r() * 9, 0, 7); g.fill(); } });
// 2 окна × 2 этажа; один тёмный — чтобы окна не горели «стеной»
const winRects = (g, s, fill, dark) => { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i === 1 && j === 0) ? dark : fill; g.fillRect(i * s / 2 + s * .12, j * s / 2 + s * .12, s * .26, s * .27); } };
const WALL_T = canvasTex(128, 128, (g, s) => { g.fillStyle = '#fff'; g.fillRect(0, 0, s, s); winRects(g, s, '#2a2f55', '#2a2f55'); });
const EMIS_T = canvasTex(128, 128, (g, s) => { g.fillStyle = '#000'; g.fillRect(0, 0, s, s); winRects(g, s, '#fff', '#0b0b14'); });
[WALL_T, EMIS_T].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
const GLOW_T = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
const BOARD_T = canvasTex(128, 64, (g) => { g.clearRect(0, 0, 128, 64); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(5, 5, 118, 54); g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(16, 16, 58, 10); g.fillRect(16, 34, 40, 8); g.beginPath(); g.arc(98, 32, 13, 0, 7); g.fill(); });
const ZEBRA_T = canvasTex(64, 16, (g) => { g.clearRect(0, 0, 64, 16); g.fillStyle = 'rgba(235,235,255,.8)'; for (let i = 0; i < 6; i++) g.fillRect(3 + i * 10.4, 0, 6, 16); });
// течение реки: светлые блики-полоски, текстура едет вдоль русла
const FLOW_T = canvasTex(512, 128, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 512, 128); const r = rnd(5);
  for (let i = 0; i < 70; i++) { const y = r() * 128, w = 20 + r() * 90, a = .15 + r() * .5; g.fillStyle = `rgba(${r() < .3 ? '255,120,220' : '120,220,255'},${a})`; g.fillRect(r() * 512, y, w, 1.5 + r() * 2); } });
FLOW_T.wrapS = FLOW_T.wrapT = THREE.RepeatWrapping;
// полоса вдоль реки: от смещения o1 до o2 от середины русла (по нормали), на высоте y
function riverRibbon(o1, o2, y, x0, x1, step = .5) {
  const pos = [], uv = [], idx = []; let s = 0, px = null, pz = null;
  for (let x = x0, i = 0; x <= x1 + 1e-6; x += step, i++) {
    const z = riverZ(x), d = riverSlope(x), L = Math.hypot(1, d), nx = -d / L, nz = 1 / L;
    if (px !== null) s += Math.hypot(x - px, z - pz); px = x; pz = z;
    pos.push(x + nx * o1, y, z + nz * o1, x + nx * o2, y, z + nz * o2); uv.push(s / 8, 0, s / 8, 1);
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); if (g.attributes.normal.array[1] < 0) { idx.reverse(); g.setIndex(idx); g.computeVertexNormals(); } return g;
}
const SHADOW_T = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 8, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,.6)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });

function bodyGeo(floors, w = FOOT, d = FOOT) {
  const h = floors * FH, g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    if (f === 2 || f === 3) uv.setXY(i, .02, .02); // крыша/дно — без окон
    else uv.setXY(i, uv.getX(i) * Math.max(1, Math.round((f < 2 ? d : w) / FOOT * 1)), uv.getY(i) * floors / 2);
  }
  return g;
}
const bodyMat = (lights = 'warm', wall) => new THREE.MeshStandardMaterial({ color: wall || '#ffffff', map: WALL_T, emissiveMap: EMIS_T, emissive: LIGHT_C[lights] || LIGHT_C.warm, emissiveIntensity: 1.05, roughness: .85 });
const flat = (c, em, ei = 1) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: .7, emissive: em || '#000', emissiveIntensity: ei });
function roofGeo(r = FOOT * .78, h = .34) { const g = new THREE.ConeGeometry(r, h, 4, 1); g.rotateY(Math.PI / 4); g.translate(0, h / 2, 0); return g; }
function textSprite(text, { size = 64, color = '#fff', bg = 'rgba(12,8,36,.85)', pad = 18, font = '800', scale = .006 } = {}) {
  const c = document.createElement('canvas'), g = c.getContext('2d'); g.font = `${font} ${size}px Unbounded, Inter, sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + pad * 2, h = size + pad * 2; c.width = w; c.height = h;
  g.font = `${font} ${size}px Unbounded, Inter, sans-serif`; g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, w, h, h / 2); g.fill();
  g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true })); s.scale.set(w * scale, h * scale, 1); return s;
}
function emojiSprite(e, s = .26) {
  const t = canvasTex(128, 128, (g) => { g.font = '96px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 64, 72); });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); sp.scale.set(s, s, 1); return sp;
}
function neonSign(text, color, w = .62) {
  const t = canvasTex(512, 128, (g) => { g.fillStyle = '#0d0820'; g.fillRect(0, 0, 512, 128); g.strokeStyle = color; g.lineWidth = 10; g.strokeRect(8, 8, 496, 112);
    g.font = '800 64px Unbounded, Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 24; g.fillText(text, 256, 68); });
  const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 1.3 });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), m);
}

// ---------- особый дом (по рецепту) — отдельная группа ----------
// ---------- дом «по описанию»: собран ИИ из деталей ----------
// part: { t: box|cyl|cone|sphere|dome|pyramid|torus, p:[x,y,z] (низ детали по y), s:[ширина,высота,глубина], c:'#hex', g:0..1 свечение, r: поворот°, w: окна }
const PART_T = ['box', 'cyl', 'cone', 'sphere', 'dome', 'pyramid', 'torus'];
const clampN = (v, a, b, d) => { v = +v; return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
export function cleanParts(parts) {
  if (!Array.isArray(parts)) return [];
  return parts.slice(0, 48).filter(q => q && PART_T.includes(q.t)).map(q => ({
    t: q.t, p: [clampN(q.p?.[0], -.5, .5, 0), clampN(q.p?.[1], 0, 2.2, 0), clampN(q.p?.[2], -.5, .5, 0)],
    s: [clampN(q.s?.[0], .02, 1, .3), clampN(q.s?.[1], .02, 1.6, .3), clampN(q.s?.[2], .02, 1, .3)],
    c: /^#[0-9a-f]{6}$/i.test(q.c) ? q.c : '#cccccc', g: clampN(q.g, 0, 1, 0), r: clampN(q.r, -360, 360, 0), w: !!q.w }));
}
function makeParts(parts, lights) {
  const G = new THREE.Group(); let top = .3;
  for (const q of cleanParts(parts)) {
    const [w, h, d] = q.s; let geo;
    switch (q.t) {
      case 'cyl': geo = new THREE.CylinderGeometry(.5, .5, 1, 20); break;
      case 'cone': geo = new THREE.ConeGeometry(.5, 1, 20); break;
      case 'pyramid': geo = new THREE.ConeGeometry(.5 * Math.SQRT2, 1, 4); geo.rotateY(Math.PI / 4); break;
      case 'sphere': geo = new THREE.SphereGeometry(.5, 20, 14); break;
      case 'dome': geo = new THREE.SphereGeometry(.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); geo.translate(0, -.5, 0); geo.scale(1, 2, 1); break;
      case 'torus': geo = new THREE.TorusGeometry(.38, .12, 10, 24); geo.rotateX(Math.PI / 2); break;
      default: geo = new THREE.BoxGeometry(1, 1, 1);
    }
    geo.translate(0, .5, 0);
    const mat = q.w && (q.t === 'box' || q.t === 'cyl') ? bodyMat(lights, q.c) : flat(q.c, q.g ? q.c : null, q.g * 1.6);
    if (q.w && mat.map) { mat.map = mat.map.clone(); mat.emissiveMap = mat.emissiveMap.clone(); for (const t of [mat.map, mat.emissiveMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(w / .3)), Math.max(1, Math.round(h / FH))); } }
    const m = new THREE.Mesh(geo, mat); m.scale.set(w, h, d); m.position.set(q.p[0], q.p[1], q.p[2]); m.rotation.y = q.r * Math.PI / 180; G.add(m);
    top = Math.max(top, q.p[1] + h);
  }
  G.userData.top = top; return G;
}

export function makeHouse(rec, nick = '') {
  if (rec && Array.isArray(rec.parts) && rec.parts.length) { const G = makeParts(rec.parts, rec.lights || 'warm'); return G; }
  const G = new THREE.Group(), R = rec, floors = Math.max(1, Math.min(6, R.floors | 0 || 2));
  const wall = R.wall || '#f28b82', roof = R.roof || '#c2414b', L = R.lights || 'warm';
  const add = (geo, mat, y = 0) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; G.add(m); return m; };
  let top = 0;
  switch (R.shape) {
    case 'tower': { add(bodyGeo(floors + 1, .44, .44), bodyMat(L, wall)); top = (floors + 1) * FH; add(roofGeo(.36, .7), flat(roof), top); top += .7; break; }
    case 'skyscraper': { const f = floors * 2 + 1; add(bodyGeo(f, .62, .62), bodyMat(L, wall)); top = f * FH; add(new THREE.BoxGeometry(.66, .06, .66), flat(roof), top + .03);
      add(new THREE.CylinderGeometry(.012, .012, .5), flat('#9aa0c0'), top + .3); const b = add(new THREE.SphereGeometry(.03), flat('#ff3b3b', '#ff2020', 3), top + .55); b.userData.blink = true; top += .6; break; }
    case 'castle': { add(bodyGeo(floors, .78, .78), bodyMat(L, wall)); top = floors * FH; const m = flat(wall);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (i === 0 || j === 0 || i === 3 || j === 3) { const b = add(new THREE.BoxGeometry(.12, .12, .12), m, top + .06); b.position.x = -.33 + i * .22; b.position.z = -.33 + j * .22; }
      const t = add(bodyGeo(floors + 2, .24, .24), bodyMat(L, wall)); t.position.set(.3, 0, .3); const tr = add(roofGeo(.2, .4), flat(roof), (floors + 2) * FH); tr.position.x = .3; tr.position.z = .3; top = (floors + 2) * FH + .4; break; }
    case 'dome': { add(bodyGeo(floors, .74, .74), bodyMat(L, wall)); top = floors * FH; const d = add(new THREE.SphereGeometry(.34, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: roof, roughness: .3, metalness: .4, emissive: roof, emissiveIntensity: .25 }), top); top += .34; break; }
    case 'clocktower': { const f = floors + 1; add(bodyGeo(f, .46, .46), bodyMat(L, wall)); top = f * FH; add(new THREE.BoxGeometry(.52, .42, .52), flat(roof), top + .21);
      const face = canvasTex(128, 128, (g) => { g.fillStyle = '#fff8e0'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill(); g.strokeStyle = '#3a2a10'; g.lineWidth = 8; g.stroke(); g.lineWidth = 9; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 24); g.moveTo(64, 64); g.lineTo(92, 70); g.stroke(); });
      const fm = new THREE.MeshStandardMaterial({ map: face, emissiveMap: face, emissive: '#fff2c0', emissiveIntensity: .9 });
      for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.CircleGeometry(.16, 24), fm); const a = i * Math.PI / 2; p.position.set(Math.sin(a) * .265, top + .21, Math.cos(a) * .265); p.rotation.y = a; G.add(p); }
      top += .42; add(roofGeo(.4, .5), flat(roof), top); top += .5; break; }
    default: { add(bodyGeo(floors), bodyMat(L, wall)); top = floors * FH; add(roofGeo(), flat(roof), top); top += .34; }
  }
  if (R.emblem && R.emblem !== 'none' && R.shape !== 'clocktower' && EMOJI[R.emblem]) { const e = emojiSprite(EMOJI[R.emblem]); e.position.set(0, Math.min(top, floors * FH * .7 + .1), .42); G.add(e); }
  if (R.biz && BIZ[R.biz]) {
    const [name, col] = BIZ[R.biz], s = neonSign(name, col, .6); s.position.set(0, .16, FOOT / 2 + .012); G.add(s);
    const aw = new THREE.Mesh(new THREE.BoxGeometry(.66, .02, .14), flat(col, col, .4)); aw.position.set(0, .3, FOOT / 2 + .07); aw.rotation.x = .25; G.add(aw);
  }
  const dec = new Set(R.decor || []);
  if (dec.has('garland')) {
    const pts = [], cols = [], P = ['#ff3d7f', '#ffd23f', '#5ef2ff', '#a6ff8f'], y = (R.shape === 'skyscraper' ? 2 : 1) * FH * .99 + (R.shape === 'house' || !R.shape ? floors * FH - FH : 0);
    const hh = floors * FH + .01;
    for (let i = 0; i < 28; i++) { const t = i / 28 * 4, side = Math.floor(t), u = t - side, h = FOOT / 2 + .02;
      const [x, z] = [[-h + u * 2 * h, h], [h, h - u * 2 * h], [h - u * 2 * h, -h], [-h, -h + u * 2 * h]][side];
      pts.push(x, hh, z); const c = new THREE.Color(P[i % 4]); cols.push(c.r, c.g, c.b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ size: .09, map: GLOW_T, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); p.userData.twinkle = true; G.add(p);
  }
  if (dec.has('tree')) { const t = new THREE.Group(); const tk = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .08), flat('#5a3a22')); tk.position.y = .04; t.add(tk);
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(.12 - i * .025, .14, 7), flat('#1f8a4c')); c.position.y = .12 + i * .08; t.add(c); }
    const st = emojiSprite('⭐', .1); st.position.y = .38; t.add(st); t.position.set(-.48, 0, .38); G.add(t); }
  if (dec.has('car')) { const c = makeCarMesh('#ff3d7f'); c.position.set(.52, 0, .05); c.rotation.y = Math.PI / 2; G.add(c); }
  if (dec.has('pet')) { const p = new THREE.Group(), m = flat('#e8b77a'); const b = new THREE.Mesh(new THREE.SphereGeometry(.045, 10, 8), m); b.scale.set(1.4, 1, 1); b.position.y = .05; p.add(b);
    const h = new THREE.Mesh(new THREE.SphereGeometry(.035, 10, 8), m); h.position.set(.06, .09, 0); p.add(h); p.position.set(.2, 0, .5); p.userData.pet = true; G.add(p); }
  G.userData.top = top;
  return G;
}
function makeCarMesh(col) {
  const c = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(.4, .1, .2), flat(col)); b.position.y = .08; c.add(b);
  const t = new THREE.Mesh(new THREE.BoxGeometry(.22, .08, .18), flat('#3b4a7a', '#223', .3)); t.position.set(-.02, .17, 0); c.add(t); return c;
}

// ---------- клад дня ----------
function makeChest() {
  const G = new THREE.Group(), wood = flat('#8a4f24', '#3a1606', .35), gold = new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: .7, roughness: .3, emissive: '#ffb000', emissiveIntensity: .7 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(.22, .12, .15), wood); b.position.y = .06; G.add(b);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .22, 12, 1, false, 0, Math.PI), wood); lid.rotation.z = Math.PI / 2; lid.position.y = .12; G.add(lid);
  for (const x of [-.075, .075]) { const band = new THREE.Mesh(new THREE.BoxGeometry(.025, .2, .158), gold); band.position.set(x, .1, 0); G.add(band); }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(.04, .05, .02), gold); lock.position.set(0, .11, .08); G.add(lock);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_T, color: '#ffc93c', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.set(.9, .9, 1); glow.position.y = .14; G.add(glow); G.userData.glow = glow;
  const sp = []; for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; sp.push(Math.cos(a) * .18, .1 + (i % 4) * .07, Math.sin(a) * .18); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const spark = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#fff3b0', size: .12, map: GLOW_T, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); G.add(spark); G.userData.spark = spark;
  G.scale.setScalar(1.15); return G;
}

// ---------- здания-рубежи ----------
export function makeLandmark(type, locked, title) {
  const G = new THREE.Group();
  if (locked) {
    const fm = flat('#ff9f1a', '#ff7a00', .5);
    for (const [x, z, w, d] of [[0, .95, 1.9, .03], [0, -.95, 1.9, .03], [.95, 0, .03, 1.9], [-.95, 0, .03, 1.9]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(w, .14, d), fm); f.position.set(x, .07, z); G.add(f); }
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, .3, 1.6), flat('#3a3f66')); base.position.y = .15; G.add(base);
    const crane = new THREE.Group(), cm = flat('#ffd23f', '#ffb000', .35);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(.08, 2.2, .08), cm); mast.position.y = 1.1; crane.add(mast);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(1.6, .06, .06), cm); jib.position.set(.5, 2.2, 0); crane.add(jib);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.04), flat('#ff3b3b', '#ff2020', 3)); lamp.position.set(1.28, 2.24, 0); lamp.userData.blink = true; crane.add(lamp);
    crane.position.set(-.6, 0, -.6); crane.userData.spin = true; G.add(crane);
  } else if (type === 'park') {
    const grass = new THREE.Mesh(new THREE.BoxGeometry(1.9, .04, 1.9), flat('#1e6b45')); grass.position.y = .02; G.add(grass);
    const fount = new THREE.Mesh(new THREE.CylinderGeometry(.35, .4, .12, 20), flat('#9aa3b5')); fount.position.y = .08; G.add(fount);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .02, 20), flat('#5ef2ff', '#00d5ff', 1.2)); water.position.y = .15; G.add(water);
    const r = rnd(4); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, t = new THREE.Mesh(new THREE.SphereGeometry(.13 + r() * .05, 8, 6), flat('#2fbf71', '#0a4', .15)); t.position.set(Math.cos(a) * .72, .26, Math.sin(a) * .72); G.add(t); }
  } else if (type === 'school') {
    const b = new THREE.Mesh(bodyGeo(3, 1.7, .8), bodyMat('warm', '#ffab91')); G.add(b);
    const r = new THREE.Mesh(new THREE.BoxGeometry(1.76, .08, .86), flat('#c2414b')); r.position.y = .94; G.add(r);
    const c = emojiSprite('🕐', .32); c.position.set(0, 1.12, .3); G.add(c);
  } else if (type === 'stadium') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.72, .16, 8, 32), flat('#4c6ef5', '#304ac0', .4)); ring.rotation.x = Math.PI / 2; ring.scale.set(1.15, .85, 1); ring.position.y = .16; G.add(ring);
    const field = new THREE.Mesh(new THREE.CircleGeometry(.62, 32), flat('#2fbf71', '#0a6', .25)); field.rotation.x = -Math.PI / 2; field.scale.set(1.15, .85, 1); field.position.y = .02; G.add(field);
    for (const [x, z] of [[.9, .7], [-.9, .7], [.9, -.7], [-.9, -.7]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.04, .9, .04), flat('#9aa0c0')); p.position.set(x, .45, z); G.add(p); const l = new THREE.Mesh(new THREE.BoxGeometry(.16, .08, .04), flat('#fff', '#ffffff', 3)); l.position.set(x, .92, z); G.add(l); }
  } else if (type === 'tvtower') {
    const m = flat('#c9a0e8', '#7b2cbf', .5); const s = new THREE.Mesh(new THREE.CylinderGeometry(.06, .16, 3.2, 10), m); s.position.y = 1.6; G.add(s);
    for (const y of [1.2, 2.2]) { const b = new THREE.Mesh(new THREE.SphereGeometry(.24, 16, 12), flat('#ff3d7f', '#ff3d7f', 1.2)); b.position.y = y; G.add(b); }
    const tip = new THREE.Mesh(new THREE.SphereGeometry(.05), flat('#ff3b3b', '#ff2020', 3)); tip.position.y = 3.25; tip.userData.blink = true; G.add(tip);
  } else if (type === 'mall') {
    const b = new THREE.Mesh(bodyGeo(2, 1.7, 1.5), bodyMat('cool', '#7cc8ff')); G.add(b);
    const s = neonSign('ТЦ «НЕОН»', '#5ef2ff', 1.2); s.position.set(0, .45, .76); G.add(s);
  } else if (type === 'hall') {
    const b = new THREE.Mesh(bodyGeo(3, 1.5, .9), bodyMat('warm', '#f1f3f5')); G.add(b);
    for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .8), flat('#ffffff')); c.position.set(-.62 + i * .25, .4, .5); G.add(c); }
    const d = new THREE.Mesh(new THREE.SphereGeometry(.42, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: .6, roughness: .3, emissive: '#ffb000', emissiveIntensity: .3 })); d.position.y = .9; G.add(d);
  }
  if (title) { const s = textSprite(title, { color: locked ? '#ffd23f' : '#fff', scale: .0032 }); s.position.y = locked ? 2.6 : 2; s.userData.label = true; G.add(s); }
  return G;
}

// ---------- город ----------
export class City3D {
  constructor(canvas, labels) {
    this.canvas = canvas; this.lbl = labels; this.lg = labels.getContext('2d');
    const R = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    R.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6)); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
    const S = this.scene = new THREE.Scene(); S.fog = new THREE.FogExp2('#1a1240', .0075);
    this.cam = new THREE.PerspectiveCamera(42, 1, .1, 600);
    const hemi = this.hemi = new THREE.HemisphereLight('#b3a6ff', '#2a1d55', 1.7); S.add(hemi);
    const moon = this.moon = new THREE.DirectionalLight('#b8c6ff', 1.5); moon.position.set(-30, 50, 20); S.add(moon); S.add(moon.target);
    this.sunDir = new THREE.Vector3(-30, 50, 20).normalize();
    this.shadows = !/[?&]lq=1/.test(location.search) && (navigator.hardwareConcurrency || 4) > 4;
    R.shadowMap.enabled = this.shadows; R.shadowMap.type = THREE.PCFSoftShadowMap;
    moon.castShadow = this.shadows; moon.shadow.mapSize.set(2048, 2048); moon.shadow.bias = -.0006; moon.shadow.normalBias = .02;
    Object.assign(moon.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 160 });
    this.dayT = 0; this.weather = 'clear'; this.snowCover = 0; this.wx = null;
    this.ctl = { tx: 2, tz: 2, x: 2, z: 2, d: 26, td: 26, az: Math.PI / 4, taz: Math.PI / 4, pol: .95 };
    this.houses = []; this.byKey = new Map(); this.dyn = []; this.T = 0; this.hi = null; this.bloom = !/[?&]lq=1/.test(location.search);
    this.composer = new EffectComposer(R); this.composer.addPass(new RenderPass(S, this.cam));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), .55, .5, .82); this.composer.addPass(this.bloomPass); this.composer.addPass(new OutputPass());
    this.ray = new THREE.Raycaster(); this.v = new THREE.Vector3();
    this.buildStatic(); this.resize(); addEventListener('resize', () => this.resize());
    this.fpsT = 0; this.fpsN = 0;
  }
  resize() {
    const w = innerWidth, h = innerHeight; this.renderer.setSize(w, h, false); this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w / 2, h / 2); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    const dpr = Math.min(devicePixelRatio || 1, 2); this.lbl.width = w * dpr; this.lbl.height = h * dpr; this.lg.setTransform(dpr, 0, 0, dpr, 0, 0); this.W = w; this.H = h;
  }
  buildStatic() {
    const S = this.scene;
    const ground = this.ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#141832', map: ASPHALT_T, roughness: .92 })); ground.receiveShadow = true; ground.rotation.x = -Math.PI / 2; S.add(ground);
    // небо для дня: купол с градиентом, ночью прозрачный (видно ночной фон страницы)
    { const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256; const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#3f8cff'); gr.addColorStop(.42, '#8fc3ff'); gr.addColorStop(.5, '#e3f1ff'); gr.addColorStop(1, '#e3f1ff'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      this.sky = new THREE.Mesh(new THREE.SphereGeometry(320, 24, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, transparent: true, opacity: 0, fog: false, depthWrite: false }));
      this.sky.renderOrder = -1; this.sky.visible = false; S.add(this.sky); }
    { const g = new THREE.BufferGeometry(), pts = [], r0 = rnd(42); for (let i = 0; i < 1400; i++) { const a = r0() * Math.PI * 2, e = .12 + r0() * 1.3, R0 = 280; pts.push(Math.cos(a) * Math.cos(e) * R0, Math.sin(e) * R0, Math.sin(a) * Math.cos(e) * R0); }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.starsP = new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, color: '#e8e4ff', transparent: true, fog: false, depthWrite: false })); S.add(this.starsP);
      const disc = canvasTex(128, 128, (c, w, h) => { const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.32, 'rgba(240,240,255,1)'); gr.addColorStop(.36, 'rgba(200,200,255,.35)'); gr.addColorStop(1, 'rgba(160,150,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
      this.moonS = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, transparent: true, fog: false, depthWrite: false })); this.moonS.position.set(-150, 120, -170); this.moonS.scale.setScalar(46); S.add(this.moonS);
      const sun = canvasTex(128, 128, (c, w, h) => { const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(.22, 'rgba(255,240,190,1)'); gr.addColorStop(.3, 'rgba(255,210,120,.5)'); gr.addColorStop(1, 'rgba(255,190,90,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
      this.sunS = new THREE.Sprite(new THREE.SpriteMaterial({ map: sun, transparent: true, opacity: 0, fog: false, depthWrite: false, toneMapped: false })); this.sunS.position.set(170, 110, -150); this.sunS.scale.setScalar(70); this.sunS.visible = false; S.add(this.sunS);
      this.clouds = []; const r1 = rnd(9), cg = new THREE.SphereGeometry(1, 12, 8);
      for (let i = 0; i < 16; i++) { const C0 = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: '#4a4478', transparent: true, opacity: .2, fog: false, depthWrite: false });
        for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(cg, m); b.scale.set(6 + r1() * 6, 2 + r1() * 1.5, 4 + r1() * 3); b.position.set(k * 6 - 9 + r1() * 3, r1() * 1.5, r1() * 4); C0.add(b); }
        C0.position.set(-160 + r1() * 320, 38 + r1() * 18, -160 + r1() * 320); C0.userData.v = .6 + r1() * .8; this.clouds.push(C0); S.add(C0); } }
    // река: вода с бегущими бликами, каменные набережные, неоновые бортики
    const X0 = -200, X1 = 200, W = RIVER_W;
    this.flow = FLOW_T.clone(); this.flow.repeat.set(1, 1); this.flow.needsUpdate = true;
    S.add(new THREE.Mesh(riverRibbon(-W - .05, W + .05, .075, X0, X1), new THREE.MeshStandardMaterial({ color: '#0a1640', roughness: .15, metalness: .5, emissive: '#3aa0ff', emissiveMap: this.flow, emissiveIntensity: 1.1 })));
    const stone = new THREE.MeshStandardMaterial({ color: '#33385f', roughness: .9 });
    for (const sd of [-1, 1]) {
      S.add(new THREE.Mesh(riverRibbon(sd * W, sd * (W + .38), .095, X0, X1), stone));
      S.add(new THREE.Mesh(riverRibbon(sd * (W - .02), sd * (W + .05), .1, X0, X1), new THREE.MeshBasicMaterial({ color: sd < 0 ? '#ff4fa3' : '#4fe3ff' })));
    }
    // звёзды
    const sp = [], r = rnd(9); for (let i = 0; i < 900; i++) { const a = r() * Math.PI * 2, e = .15 + r() * 1.2, R = 300; sp.push(Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R * .6 + 20, Math.sin(a) * Math.cos(e) * R); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    S.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.4, sizeAttenuation: false, fog: false })));
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_T, color: '#fff3c8', fog: false, depthWrite: false, blending: THREE.AdditiveBlending })); moon.scale.set(70, 70, 1); moon.position.set(-150, 140, -200); S.add(moon);
    const disk = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: '#fff6dc', fog: false })); disk.position.copy(moon.position); disk.lookAt(0, 0, 0); S.add(disk);
  }
  // list: [{nick, key, label, recipe, n}] в порядке заселения
  setCity(list, milestones = [], hallInfo = null) {
    this._dayDirty = true; this._extrasDirty = true;
    for (const o of this.dyn) { this.scene.remove(o); o.traverse?.(m => { m.geometry?.dispose?.(); }); } this.dyn = [];
    const add = o => { this.scene.add(o); this.dyn.push(o); return o; };
    const N = Math.min(list.length, CELLS.length - 20), r = rnd(7);
    this.houses = list.slice(0, N).map((it, i) => ({ ...it, n: i + 1, x: CELLS[i][0] + .5, z: CELLS[i][1] + .5 }));
    this.byKey = new Map(this.houses.map(h => [h.key, h]));
    const span = Math.ceil(Math.sqrt((N + 60) * 2.25 / Math.PI) / 3) + 4; this.span = span;
    // кварталы-газоны и тротуары
    const blocks = new Set(); for (const h of this.houses) blocks.add(blockOf(Math.floor(h.x), Math.floor(h.z)).join(','));
    for (const b of LANDMARK_BLOCKS) blocks.add(b.join(','));
    // кварталы вдоль реки тоже мостим, чтобы набережная шла без дыр
    const rMax = this.houses.reduce((m, h) => Math.max(m, Math.hypot(h.x - 2, h.z - 2)), 6);
    for (let bx = -span; bx <= span; bx++) for (let by = -span; by <= span; by++) { const [cx, cz] = blockCenter([bx, by]); if (Math.hypot(cx - 2, cz - 2) < rMax + 1 && inWater(cx, cz, 2.2)) blocks.add(bx + ',' + by); }
    this.rMax = rMax;
    this.places = [];
    for (let bx = -span; bx <= span; bx++) for (let by = -span; by <= span; by++) { const pl = placeAt(bx, by); if (pl && Math.hypot(pl.x - 2, pl.z - 2) < rMax - 1) { this.places.push(pl); blocks.add(bx + ',' + by); } }
    const bl = [...blocks].map(s => s.split(',').map(Number));
    const side = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, .04, 2.3), new THREE.MeshStandardMaterial({ color: '#3a3f68', map: PAVE_T, roughness: .85 }), bl.length);
    const grass = new THREE.InstancedMesh(new THREE.BoxGeometry(2, .06, 2), new THREE.MeshStandardMaterial({ color: '#2d5a48', map: GRASS_T, roughness: 1 }), bl.length);
    side.receiveShadow = grass.receiveShadow = true; side.userData.flat = grass.userData.flat = true;
    const M = new THREE.Matrix4(), V3 = new THREE.Vector3();
    bl.forEach(([bx, by], i) => { const [cx, cz] = blockCenter([bx, by]); M.makeTranslation(cx, .02, cz); side.setMatrixAt(i, M); M.makeTranslation(cx, .03, cz); grass.setMatrixAt(i, M); });
    add(side); add(grass);
    // разметка
    const dashes = []; for (let k = -span; k <= span; k++) for (let t = -span * 3; t <= span * 3; t += 1) { if (Math.abs(t % 3) === 0) continue; if (!inWater(k * 3 + .5, t + .5, .1)) dashes.push([k * 3 + .5, t + .5, 0]); if (!inWater(t + .5, k * 3 + .5, .1)) dashes.push([t + .5, k * 3 + .5, 1]); }
    const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(.04, .01, .3), new THREE.MeshStandardMaterial({ color: '#d9cf86', emissive: '#7a6f20', emissiveIntensity: .6 }), dashes.length);
    dashes.forEach(([a, b, rot], i) => { if (!rot) { M.makeRotationY(0); M.setPosition(a, .012, b); } else { M.makeRotationY(Math.PI / 2); M.setPosition(a, .012, b); } dm.setMatrixAt(i, M); });
    add(dm);
    // обычные дома: инстансы по этажности
    const regular = this.houses.filter(h => !h.recipe || h.gone), special = this.houses.filter(h => h.recipe && !h.gone);
    this.grow = []; const reg = (mesh, list) => { const base = list.map((_, i) => { const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m); return m; }); this.grow.push({ mesh, list, base }); };
    this.pickables = [];
    const groups = new Map();
    // центр — высотки с плоскими крышами, дальше — дома пониже, на окраинах — частный сектор
    for (const h of regular) { const rr = rnd(hash(h.key)), u = rr(), u2 = rr(), dc = Math.hypot(h.x - 2, h.z - 2);
      h.floors = dc < 13 ? 3 + Math.floor(u * 4) : dc < 24 ? 2 + Math.floor(u * 2.6) : (u < .1 ? 3 : 1 + Math.floor(u2 * 2));
      h.wall = WALLS[(rr() * WALLS.length) | 0]; h.roof = ROOFS[(rr() * ROOFS.length) | 0]; rr();
      h.rot = streetSide(Math.floor(h.z)) < 0 ? Math.PI : 0; h.tall = h.floors >= 4; h.k = h.tall ? 1.2 : 1;
      if (FACADE) { h.kx = 1.36; h.kz = .86; h.oz = .19; } else { h.kx = h.kz = h.k; h.oz = 0; }
      h.ox = Math.sin(h.rot) * h.oz; h.ozz = Math.cos(h.rot) * h.oz;
      h.top = h.floors * FH + (h.tall ? .14 : .34); if (h.gone) { h.wall = '#5b5a66'; h.roof = '#2b2a33'; } const gk = h.floors + (h.gone ? 'g' : ''); if (!groups.has(gk)) groups.set(gk, []); groups.get(gk).push(h); }
    const C = new THREE.Color(), roofM = new THREE.InstancedMesh(roofGeo(), flat('#ffffff'), regular.length);
    let ri = 0;
    const deadMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: WALL_T, roughness: .95 });
    for (const [gk, arr] of groups) {
      const f = parseInt(gk), im = new THREE.InstancedMesh(bodyGeo(f), String(gk).endsWith('g') ? deadMat : bodyMat('warm'), arr.length);
      arr.forEach((h, i) => { M.makeRotationY(h.rot); M.scale(V3.set(h.kx, 1, h.kz)); M.setPosition(h.x + h.ox, .06, h.z + h.ozz); im.setMatrixAt(i, M); im.setColorAt(i, C.set(h.wall));
        if (h.tall) M.makeScale(0, 0, 0); else { M.makeScale(h.kx / h.k, 1, h.kz / h.k); M.setPosition(h.x + h.ox, .06 + f * FH, h.z + h.ozz); } roofM.setMatrixAt(ri, M); roofM.setColorAt(ri, C.set(h.roof)); ri++; });
      im.userData.list = arr; this.pickables.push(im); add(im); reg(im, arr);
    }
    add(roofM); reg(roofM, [...groups.values()].flat());
    // плоские крыши высоток: бортик + техбудка/бак
    const tall = regular.filter(h => h.tall), ft = FOOT * 1.2 + .04;
    if (tall.length) {
      const capM = new THREE.InstancedMesh(new THREE.BoxGeometry(ft, .06, ft), flat('#ffffff'), tall.length), boxM = new THREE.InstancedMesh(new THREE.BoxGeometry(.22, .14, .18), flat('#5b6190'), tall.length);
      const tankG = new THREE.CylinderGeometry(.08, .08, .16, 10); tankG.translate(0, .08, 0); const tankM = new THREE.InstancedMesh(tankG, flat('#8a90b8', '#5ef2ff', .25), tall.length);
      tall.forEach((h, i) => { const y = .06 + h.floors * FH, rr = rnd(hash(h.key) ^ 0x51); M.makeScale((h.kx * FOOT + .04) / ft, 1, (h.kz * FOOT + .04) / ft); M.setPosition(h.x + h.ox, y + .03, h.z + h.ozz); capM.setMatrixAt(i, M); capM.setColorAt(i, C.set(h.roof));
        M.makeTranslation(h.x + h.ox + (rr() - .5) * .3, y + .13, h.z + h.ozz + (rr() - .5) * .2); boxM.setMatrixAt(i, M); M.makeTranslation(h.x + h.ox + (rr() < .5 ? .2 : -.2), y + .06, h.z + h.ozz + (rr() < .5 ? .15 : -.15)); tankM.setMatrixAt(i, M); });
      for (const m of [capM, boxM, tankM]) { add(m); reg(m, tall); }
    }
    // детали фасадов: балконы с перилами, кондиционеры, антенны
    { const bal = [], ac = [], ant = [];
      regular.forEach(h => { if (h.gone) return; const rr = rnd(hash(h.key) ^ 0x7a1); const c = Math.cos(h.rot), fz = h.z + c * (h.oz + .365 * h.kz), hw = FOOT * h.kx / 2;
        if (h.floors >= 2 && rr() < .6) { const fl = 1 + Math.floor(rr() * (h.floors - 1)); bal.push([h.x + h.ox + (rr() < .5 ? -.14 : .14), .06 + fl * FH, fz + c * .05, c]); }
        if (h.floors >= 2 && rr() < .55) { const fl = Math.floor(rr() * h.floors), sd = rr() < .5 ? -1 : 1; ac.push([h.x + h.ox + sd * (hw + .035), .06 + (fl + .35) * FH, h.z + h.ozz + (rr() - .5) * .25]); }
        if (!h.tall && rr() < .28) ant.push([h.x + h.ox + (rr() - .5) * .2, .06 + h.top - .12, h.z + h.ozz + (rr() - .5) * .15]); });
      if (bal.length) { const slab = new THREE.InstancedMesh(new THREE.BoxGeometry(.3, .025, .1), flat('#d8dbe8'), bal.length), rail = new THREE.InstancedMesh(new THREE.BoxGeometry(.3, .07, .012), flat('#8a90b8', '#5ef2ff', .15), bal.length);
        bal.forEach(([x, y, z, c], i) => { M.makeTranslation(x, y, z); slab.setMatrixAt(i, M); M.makeTranslation(x, y + .045, z + c * .045); rail.setMatrixAt(i, M); }); add(slab); add(rail); }
      if (ac.length) { const am = new THREE.InstancedMesh(new THREE.BoxGeometry(.06, .07, .11), flat('#c9ccd8'), ac.length); ac.forEach(([x, y, z], i) => { M.makeTranslation(x, y, z); am.setMatrixAt(i, M); }); add(am); }
      if (ant.length) { const g = new THREE.CylinderGeometry(.008, .008, .3, 5); g.translate(0, .15, 0); const g2 = new THREE.BoxGeometry(.14, .008, .008); g2.translate(0, .24, 0);
        const am = new THREE.InstancedMesh(g, flat('#9aa0c0'), ant.length), cm = new THREE.InstancedMesh(g2, flat('#9aa0c0'), ant.length);
        ant.forEach(([x, y, z], i) => { M.makeTranslation(x, y, z); am.setMatrixAt(i, M); cm.setMatrixAt(i, M); }); add(am); add(cm); } }
    // двери, трубы, неоновые билборды на крышах высоток
    const doorM = new THREE.InstancedMesh(new THREE.BoxGeometry(.13, .19, .02), flat('#3a2418', '#ffb347', .55), regular.length);
    const chim = [], boards = [];
    regular.forEach((h, i) => { const s = Math.sin(h.rot), c = Math.cos(h.rot), o = h.oz + .365 * h.kz; M.makeRotationY(h.rot); M.setPosition(h.x + s * o, .155, h.z + c * o); doorM.setMatrixAt(i, M);
      const rr = rnd(hash(h.key) ^ 0x9e37); if (rr() < .4 && !h.tall) chim.push([h.x + h.ox + (rr() < .5 ? .17 : -.17), h.floors * FH + .26, h.z + h.ozz + (rr() < .5 ? .14 : -.14), h]);
      if (h.floors >= 3 && rr() < .45) boards.push([h, rr()]); });
    add(doorM); reg(doorM, regular);
    // бизнесы: неоновая вывеска над дверью у каждого ~5-го невысокого дома
    const bizBy = new Map();
    for (const h of regular) { if (h.gone || h.tall) continue; const v = hash(h.key + '#biz'); if (v % 5) continue; const b = (v >>> 4) % STREET_BIZ.length; h.biz = STREET_BIZ[b][0]; if (!bizBy.has(b)) bizBy.set(b, []); bizBy.get(b).push(h); }
    for (const [b, arr] of bizBy) { const [name, col] = STREET_BIZ[b], sg = neonSign(name, col, .56), im = new THREE.InstancedMesh(sg.geometry, sg.material, arr.length);
      arr.forEach((h, i) => { const o = h.oz + .36 * h.kz + .012; M.makeRotationY(h.rot); M.setPosition(h.x + Math.sin(h.rot) * o, .32, h.z + Math.cos(h.rot) * o); im.setMatrixAt(i, M); });
      add(im); reg(im, arr); }
    const gone = regular.filter(h => h.gone);
    if (gone.length) {
      const signT = canvasTex(128, 64, (g) => { g.fillStyle = '#f2e6c9'; g.fillRect(0, 0, 128, 64); g.strokeStyle = '#7a4b2a'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 58); g.fillStyle = '#b3261e'; g.font = '800 19px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ПРОДАЁТСЯ', 64, 33); });
      const sM = new THREE.InstancedMesh(new THREE.PlaneGeometry(.34, .17), new THREE.MeshBasicMaterial({ map: signT, side: THREE.DoubleSide }), gone.length), pM = new THREE.InstancedMesh(new THREE.BoxGeometry(.02, .3, .02), flat('#6b4a2e'), gone.length);
      const bM2 = new THREE.InstancedMesh(new THREE.BoxGeometry(.5, .05, .02), flat('#8a6a48'), gone.length * 2);
      gone.forEach((h, i) => { const s = Math.sin(h.rot), c = Math.cos(h.rot), fr = h.oz + .36 * h.kz + .1, x = h.x + s * fr, z = h.z + c * fr;
        M.makeRotationY(h.rot); M.setPosition(x, .3, z); sM.setMatrixAt(i, M); M.makeTranslation(x, .15, z); pM.setMatrixAt(i, M);
        for (const [k, y] of [[0, .14], [1, .2]]) { M.makeRotationY(h.rot); M.multiply(new THREE.Matrix4().makeRotationZ(k ? -.5 : .5)); M.setPosition(h.x + s * (fr - .085), .06 + y, h.z + c * (fr - .085)); bM2.setMatrixAt(i * 2 + k, M); } });
      add(sM); add(pM); add(bM2); reg(sM, gone); reg(pM, gone); reg(bM2, gone.flatMap(h => [h, h]));
    }
    const chimM = new THREE.InstancedMesh(new THREE.BoxGeometry(.08, .2, .08), flat('#6b5a6e'), Math.max(1, chim.length)); chimM.count = chim.length;
    chim.forEach(([x, y, z], i) => { M.makeTranslation(x, y, z); chimM.setMatrixAt(i, M); }); add(chimM); reg(chimM, chim.map(c => c[3]));
    const NEON = ['#ff3d7f', '#5ef2ff', '#ffd23f', '#a6ff8f', '#c084fc', '#ff9f43'];
    const bM = new THREE.InstancedMesh(new THREE.PlaneGeometry(.56, .28), new THREE.MeshBasicMaterial({ map: BOARD_T, transparent: true, side: THREE.DoubleSide, depthWrite: false }), Math.max(1, boards.length)); bM.count = boards.length;
    const legM = new THREE.InstancedMesh(new THREE.BoxGeometry(.02, .22, .02), flat('#4a4f78'), Math.max(1, boards.length * 2)); legM.count = boards.length * 2;
    boards.forEach(([h, v], i) => { const rot = h.rot + Math.PI / 4 * (v < .5 ? 1 : -1), y = .06 + h.floors * FH + .5; M.makeRotationY(rot); M.setPosition(h.x + h.ox, y, h.z + h.ozz); bM.setMatrixAt(i, M); bM.setColorAt(i, C.set(NEON[(v * 97 | 0) % NEON.length]).multiplyScalar(1.6));
      const ox = Math.cos(rot) * .2, oz = -Math.sin(rot) * .2; M.makeTranslation(h.x + h.ox + ox, y - .2, h.z + h.ozz + oz); legM.setMatrixAt(i * 2, M); M.makeTranslation(h.x + h.ox - ox, y - .2, h.z + h.ozz - oz); legM.setMatrixAt(i * 2 + 1, M); });
    add(bM); add(legM); reg(bM, boards.map(b => b[0])); reg(legM, boards.flatMap(b => [b[0], b[0]]));
    // тени под домами
    const sh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.15, 1.15), new THREE.MeshBasicMaterial({ map: SHADOW_T, transparent: true, depthWrite: false }), this.houses.length);
    this.houses.forEach((h, i) => { M.makeRotationX(-Math.PI / 2); M.setPosition(h.x + .08, .07, h.z + .08); sh.setMatrixAt(i, M); }); add(sh); reg(sh, this.houses);
    // особые дома
    this.specialG = [];
    for (const h of special) { const g = makeHouse(h.recipe, h.key); g.position.set(h.x, .06, h.z); g.userData.house = h; h.top = g.userData.top + .06; add(g); this.specialG.push(g); }
    // улицы: фонари по углам кварталов, деревья и скамейки, зебры
    const lamps = [], strees = [], benches = [], zebra = new Set();
    bl.forEach(([bx, by]) => { const [cx, cz] = blockCenter([bx, by]), rb = rnd(hash(bx + ':' + by));
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { lamps.push([cx + sx * 1.08, cz + sz * 1.08]);
        const ix = cx + sx * 1.5, iz = cz + sz * 1.5; zebra.add(ix + ',' + iz); }
      if (FACADE) for (const dx of [-.5, .5]) strees.push([cx + dx, cz, 1.1]); // деревья во дворе
      const E = FACADE ? 1.14 : 1.02;
      for (const [ex, ez, rot] of [[0, E, 0], [0, -E, 0], [E, 0, 1], [-E, 0, 1]]) { const v = rb(); if (v < .5) strees.push([cx + ex, cz + ez, .8 + rb() * .4]); else if (v < .75) benches.push([cx + ex * 1.06, cz + ez * 1.06, rot]); } });
    // в воде ничего не ставим
    const dry = a => a.filter(([x, z]) => !inWater(x, z, .45));
    lamps.splice(0, lamps.length, ...dry(lamps)); strees.splice(0, strees.length, ...dry(strees)); benches.splice(0, benches.length, ...dry(benches));
    for (const t of [...zebra]) { const [x, z] = t.split(',').map(Number); if (inWater(x, z, 1)) zebra.delete(t); }
    // набережные: деревья и фонари вдоль воды (кроме мест, где мост)
    const R2 = rMax + 2;
    for (const sd of [-1, 1]) for (let x = -R2, i = 0; x <= R2; x += .85, i++) {
      if (md(Math.floor(x), 3) === 0 || md(Math.floor(x + .3), 3) === 0 || md(Math.floor(x - .3), 3) === 0) continue;
      const d = riverSlope(x), L = Math.hypot(1, d), o = sd * (RIVER_W + .2), px = x - d / L * o, pz = riverZ(x) + o / L;
      if (Math.hypot(px - 2, pz - 2) > R2) continue;
      if (i % 3 === 1) lamps.push([px, pz]); else strees.push([px, pz, .7 + ((i * 37) % 10) / 25]);
    }
    // места: парки, площади, памятники, фонтаны, площадки, арт-объекты
    this.placeG = [];
    const paveL = [], pathL = [], pondL = [];
    const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
    for (const pl of this.places) {
      const { x, z, kind } = pl, rp = rnd(hash(pl.name + pl.bx + ':' + pl.by));
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) lamps.push([x + sx * .78, z + sz * .78]);
      if (kind === 'park') {
        pathL.push([x, z, 0], [x, z, 1]); pondL.push([x + .5, z - .5]);
        for (const [tx, tz] of [[-.6, -.6], [-.75, -.25], [-.3, -.75], [.6, .6], [.25, .75], [.75, .3], [-.6, .6], [-.3, .75], [.8, -.85]]) strees.push([x + tx + (rp() - .5) * .1, z + tz + (rp() - .5) * .1, .9 + rp() * .5]);
        benches.push([x - .25, z + .2, 0], [x + .2, z - .25, 1]);
        continue;
      }
      paveL.push([x, z]);
      const G = new THREE.Group(); G.position.set(x, .09, z); add(G); this.placeG.push(G);
      if (kind === 'monument' || kind === 'square') { // постамент + фигура жителя с телефоном (на площади — золотой обелиск со звездой)
        G.add(at(new THREE.Mesh(new THREE.BoxGeometry(.5, .22, .5), flat('#4a4f78')), 0, .11, 0));
        G.add(at(new THREE.Mesh(new THREE.BoxGeometry(.4, .06, .4), flat('#ffd23f', '#ffb000', .5)), 0, .25, 0));
        const gold = new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: .7, roughness: .3, emissive: '#ffb000', emissiveIntensity: .45 });
        if (kind === 'monument') {
          G.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(.07, .22, 4, 10), gold), 0, .45, 0));
          G.add(at(new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 10), gold), 0, .67, 0));
          const arm = at(new THREE.Mesh(new THREE.CapsuleGeometry(.025, .2, 3, 6), gold), .1, .6, 0); arm.rotation.z = -.7; G.add(arm);
          G.add(at(new THREE.Mesh(new THREE.BoxGeometry(.05, .08, .01), flat('#5ef2ff', '#5ef2ff', 2)), .18, .72, 0));
        } else {
          G.add(at(new THREE.Mesh(new THREE.ConeGeometry(.12, .9, 4), gold), 0, .73, 0));
          const st = emojiSprite('⭐', .3); st.position.y = 1.3; G.add(st);
        }
        benches.push([x, z + .75, 0], [x, z - .75, 0], [x + .75, z, 1], [x - .75, z, 1]);
      } else if (kind === 'fountain') {
        const stoneM = flat('#8a90b8'), water = flat('#5ef2ff', '#00c8ff', 1.3);
        for (const [r, h, y] of [[.6, .1, 0], [.3, .12, .1], [.14, .1, .22]]) {
          G.add(at(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, h, 24), stoneM), 0, y + h / 2, 0));
          G.add(at(new THREE.Mesh(new THREE.CylinderGeometry(r * .88, r * .88, .02, 24), water), 0, y + h + .005, 0));
        }
        const sp = [], rr = rnd(3); for (let i = 0; i < 60; i++) { const a = rr() * Math.PI * 2, d = rr() * .45; sp.push(Math.cos(a) * d, .35 + rr() * .5 * (1 - d), Math.sin(a) * d); }
        const sg2 = new THREE.BufferGeometry(); sg2.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
        const spray = new THREE.Points(sg2, new THREE.PointsMaterial({ color: '#bff6ff', size: .07, map: GLOW_T, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); spray.userData.spin = true; G.add(spray);
        benches.push([x, z + .8, 0], [x, z - .8, 0]);
      } else if (kind === 'playground') {
        const C1 = flat('#ff4d6d'), C2 = flat('#ffd23f'), C3 = flat('#4dabf7'), C4 = flat('#63e6be');
        G.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.6, .02, 1.6), flat('#c9a46a')), 0, .01, 0));
        G.add(at(new THREE.Mesh(new THREE.BoxGeometry(.3, .35, .3), C3), -.4, .18, -.3));
        const roofP = at(new THREE.Mesh(new THREE.ConeGeometry(.26, .2, 4), C1), -.4, .45, -.3); roofP.rotation.y = Math.PI / 4; G.add(roofP);
        const slide = at(new THREE.Mesh(new THREE.BoxGeometry(.16, .02, .55), C2), -.4, .17, .1); slide.rotation.x = .6; G.add(slide);
        for (const sx of [.2, .7]) G.add(at(new THREE.Mesh(new THREE.BoxGeometry(.03, .4, .03), C4), sx, .2, -.4));
        G.add(at(new THREE.Mesh(new THREE.BoxGeometry(.53, .03, .03), C4), .45, .4, -.4));
        for (const sx of [.33, .57]) G.add(at(new THREE.Mesh(new THREE.BoxGeometry(.1, .02, .06), C1), sx, .12, -.4));
        const car = at(new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, .05, 16), new THREE.MeshStandardMaterial({ color: '#c084fc', emissive: '#7b2cbf', emissiveIntensity: .4 })), .35, .06, .35); car.userData.spin = true; G.add(car);
      } else if (kind === 'art') { // большое неоновое кольцо с сияющим ядром
        const ring = at(new THREE.Mesh(new THREE.TorusGeometry(.38, .045, 10, 40), flat('#ff3d7f', '#ff3d7f', 1.6)), 0, .55, 0); ring.userData.spin = true; G.add(ring);
        G.add(at(new THREE.Mesh(new THREE.SphereGeometry(.12, 16, 12), flat('#5ef2ff', '#5ef2ff', 1.6)), 0, .55, 0));
        G.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.18, .22, .1, 16), flat('#4a4f78')), 0, .05, 0));
        benches.push([x, z + .8, 0], [x + .8, z, 1]);
      }
    }
    if (paveL.length) { const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.04, .03, 2.04), new THREE.MeshStandardMaterial({ color: '#3d3868', roughness: .8 }), paveL.length);
      paveL.forEach(([x, z], i) => { M.makeTranslation(x, .075, z); pm.setMatrixAt(i, M); }); add(pm); }
    if (pathL.length) { const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.02, .02, .22), flat('#8a7f9e'), pathL.length);
      pathL.forEach(([x, z, r90], i) => { M.makeRotationY(r90 ? Math.PI / 2 : 0); M.setPosition(x, .07, z); pm.setMatrixAt(i, M); }); add(pm); }
    if (pondL.length) { const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(.3, .3, .02, 24), flat('#2a6bff', '#3aa0ff', .9), pondL.length);
      pondL.forEach(([x, z], i) => { M.makeTranslation(x, .08, z); pm.setMatrixAt(i, M); }); add(pm); }
    // мосты: на каждой «вертикальной» улице через реку; через один — с неоновой аркой
    this.bridges = [];
    const deckM = flat('#3a3f66'), railM = flat('#ff4fa3', '#ff4fa3', .9), railM2 = flat('#4fe3ff', '#4fe3ff', .9), bridgeLights = [];
    for (let k = -span; k <= span; k++) {
      const x = k * 3 + .5, zc = riverZ(x); if (Math.hypot(x - 2, zc - 2) > rMax + 1.5) continue;
      const len = 2 * RIVER_W + Math.abs(riverSlope(x)) + 1.1, B = new THREE.Group(), rm = k % 2 ? railM : railM2;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.02, .1, len), deckM); deck.position.y = .17; B.add(deck);
      for (const sx of [-.48, .48]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(.04, .06, len), rm); rail.position.set(sx, .27, 0); B.add(rail);
        if (!(k % 2)) { const a = new THREE.Mesh(new THREE.TorusGeometry(len / 2 - .1, .016, 6, 28, Math.PI), rm); a.rotation.y = Math.PI / 2; a.scale.set(1, .32, 1); a.position.set(sx, .22, 0); B.add(a); }
        for (const t of [-.5, 0, .5]) bridgeLights.push(x + sx, .36, zc + t * (len - .3)); }
      for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.06, .26, .12), deckM); p.position.set(0, .11, sz * (RIVER_W - .15)); B.add(p); }
      B.position.set(x, 0, zc); add(B); this.bridges.push({ x, zc, half: len / 2 });
    }
    if (bridgeLights.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(bridgeLights, 3));
      add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#fff0c0', size: .4, map: GLOW_T, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))); }
    // лодки на реке
    this.boats = []; const boatN = Math.max(4, Math.min(14, (rMax / 4) | 0));
    const hullG = new THREE.BoxGeometry(.5, .07, .18); hullG.translate(0, .1, 0); const cabG = new THREE.BoxGeometry(.2, .08, .13); cabG.translate(-.05, .17, 0);
    this.boatHull = add(new THREE.InstancedMesh(hullG, flat('#ffffff'), boatN)); this.boatCab = add(new THREE.InstancedMesh(cabG, flat('#fff6d8', '#ffd27a', .9), boatN));
    const BC = ['#ff4fa3', '#4fe3ff', '#ffd23f', '#a6ff8f', '#c084fc'];
    for (let i = 0; i < boatN; i++) { this.boats.push({ pos: (r() * 2 - 1) * rMax, dir: r() < .5 ? 1 : -1, off: (r() < .5 ? .7 : -.7) * (r() * .5 + .5), sp: .25 + r() * .3, L: rMax + 6 }); this.boatHull.setColorAt(i, C.set(BC[i % BC.length])); }
    this.boats.forEach(b => b.off = b.dir > 0 ? -Math.abs(b.off) : Math.abs(b.off));
    const poleM =new THREE.InstancedMesh(new THREE.CylinderGeometry(.015, .02, .7, 6), flat('#4a4f78'), lamps.length);
    const gp = []; lamps.forEach(([x, z], i) => { M.makeTranslation(x, .35, z); poleM.setMatrixAt(i, M); gp.push(x, .72, z); }); add(poleM);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    add(new THREE.Points(lg, new THREE.PointsMaterial({ color: '#ffcf7a', size: .55, map: GLOW_T, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    const crown = new THREE.SphereGeometry(.13, 8, 6); crown.translate(0, .3, 0); const trunk = new THREE.CylinderGeometry(.018, .025, .22, 5); trunk.translate(0, .11, 0);
    const TC = ['#2fbf71', '#27a862', '#3fd38a', '#e86fae', '#f2a54a'];
    const stCrown = new THREE.InstancedMesh(crown, flat('#ffffff', '#062', .12), Math.max(1, strees.length)), stTrunk = new THREE.InstancedMesh(trunk, flat('#5a3d2b'), Math.max(1, strees.length)); stCrown.count = stTrunk.count = strees.length;
    strees.forEach(([x, z, k], i) => { M.makeScale(k, k, k); M.setPosition(x, .04, z); stCrown.setMatrixAt(i, M); stTrunk.setMatrixAt(i, M); stCrown.setColorAt(i, C.set(TC[(i * 7) % 10 < 7 ? i % 3 : 3 + (i % 2)])); });
    add(stCrown); add(stTrunk);
    const bg = new THREE.BoxGeometry(.24, .03, .08); bg.translate(0, .07, 0); const bb = new THREE.BoxGeometry(.24, .07, .015); bb.translate(0, .11, -.035); const bLeg = new THREE.BoxGeometry(.2, .055, .06); bLeg.translate(0, .03, 0);
    for (const g of [bg, bb, bLeg]) { const im = new THREE.InstancedMesh(g, flat(g === bLeg ? '#2b2f4f' : '#b0703c'), Math.max(1, benches.length)); im.count = benches.length;
      benches.forEach(([x, z, rot], i) => { const out = rot ? Math.sign(x - Math.round((x - 2) / 3) * 3 - 2) : Math.sign(z - Math.round((z - 2) / 3) * 3 - 2); M.makeRotationY(rot ? (out > 0 ? -Math.PI / 2 : Math.PI / 2) : (out > 0 ? Math.PI : 0)); M.setPosition(x, .03, z); im.setMatrixAt(i, M); }); add(im); }
    const zl = [...zebra].map(t => t.split(',').map(Number)), zM = new THREE.InstancedMesh(new THREE.PlaneGeometry(.62, .16), new THREE.MeshBasicMaterial({ map: ZEBRA_T, transparent: true, depthWrite: false }), zl.length * 4);
    zl.forEach(([x, z], i) => { [[0, -.6, 0], [0, .6, 0], [-.6, 0, 1], [.6, 0, 1]].forEach(([ox, oz, r90], j) => { M.makeRotationFromEuler(new THREE.Euler(-Math.PI / 2, 0, r90 ? Math.PI / 2 : 0)); M.setPosition(x + ox, .014, z + oz); zM.setMatrixAt(i * 4 + j, M); }); }); add(zM);
    // лес за городом
    const trees = []; for (let i = N; i < Math.min(CELLS.length, N + 2600); i++) if (r() < .55) trees.push([CELLS[i][0] + .2 + r() * .6, CELLS[i][1] + .2 + r() * .6, .8 + r() * .6]);
    const tg = new THREE.ConeGeometry(.22, .6, 7); tg.translate(0, .45, 0);
    const tm = new THREE.InstancedMesh(tg, flat('#1f7a4a', '#0a3', .08), trees.length);
    trees.forEach(([x, z, s], i) => { M.makeScale(s, s, s); M.setPosition(x, 0, z); tm.setMatrixAt(i, M); }); add(tm);
    // рубежи
    this.landmarks = [];
    const order = [{ type: 'hall', title: hallInfo?.title || '🗳 Ратуша — после выборов', locked: !hallInfo?.open }, ...milestones.map(m => ({ type: m.type, at: m.at, title: (N >= m.at ? m.name : `🔒 ${m.name} · ${m.at.toLocaleString('ru')}`), locked: N < m.at }))];
    order.slice(0, LANDMARK_BLOCKS.length).forEach((m, i) => { const g = makeLandmark(m.type, m.locked, m.title); const [cx, cz] = blockCenter(LANDMARK_BLOCKS[i]); g.position.set(cx, .06, cz); add(g); this.landmarks.push(g); });
    // машины и люди
    this.cars = []; const CC = ['#ff4d6d', '#4dabf7', '#ffd43b', '#f8f9fa', '#63e6be', '#9775fa', '#ff922b'];
    const carN = Math.min(90, 14 + N / 30 | 0);
    const carBody = new THREE.InstancedMesh(new THREE.BoxGeometry(.4, .1, .2), flat('#ffffff'), carN), carTop = new THREE.InstancedMesh(new THREE.BoxGeometry(.22, .08, .18), flat('#3b4a7a', '#223', .3), carN);
    // улицы вдоль x, которые где-то упираются в реку, для транспорта не берём
    const ZLO = -13 - 7 - RIVER_W - .8, ZHI = -13 + 7 + RIVER_W + .8;
    const lineFor = alongX => { let l; for (let t = 0; t < 30; t++) { l = Math.round((r() * 2 - 1) * span) * 3 + .5; if (!alongX || l < ZLO || l > ZHI) break; } return l; };
    for (let i = 0; i < carN; i++) { const alongX = r() < .5, dir = r() < .5 ? 1 : -1; this.cars.push({ alongX, dir, line: lineFor(alongX) + (dir > 0 ? .17 : -.17), pos: (r() * 2 - 1) * span * 3, sp: 1.3 + r() * 1.4 }); carBody.setColorAt(i, C.set(CC[(r() * CC.length) | 0])); }
    this.carBody = add(carBody); this.carTop = add(carTop);
    this.headG = new THREE.BufferGeometry(); this.headG.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(carN * 6), 3));
    const hc = new Float32Array(carN * 6); for (let i = 0; i < carN; i++) hc.set([1, .92, .6, 1, .2, .25], i * 6);
    this.headG.setAttribute('color', new THREE.Float32BufferAttribute(hc, 3));
    add(new THREE.Points(this.headG, new THREE.PointsMaterial({ size: .35, map: GLOW_T, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    const pplN = Math.min(220, 20 + N / 12 | 0); this.ppl = [];
    const pb = new THREE.CapsuleGeometry(.035, .1, 3, 6); pb.translate(0, .1, 0); const ph = new THREE.SphereGeometry(.04, 8, 6); ph.translate(0, .22, 0);
    const SH = ['#ff6b8a', '#ffd166', '#6ee7b7', '#7cc8ff', '#c084fc', '#ff9f68', '#f1f3f5', '#20c997'], SK = ['#f6d2b5', '#eac0a0', '#d9a47c', '#b07a52', '#8a5a3b'];
    const pBody = new THREE.InstancedMesh(pb, flat('#ffffff'), pplN), pHead = new THREE.InstancedMesh(ph, flat('#ffffff'), pplN);
    for (let i = 0; i < pplN; i++) { const alongX = r() < .5; this.ppl.push({ alongX, dir: r() < .5 ? 1 : -1, line: lineFor(alongX) + (r() < .5 ? .43 : -.43), pos: (r() * 2 - 1) * span * 3, sp: .25 + r() * .25, ph: r() * 6, nick: this.houses.length ? this.houses[(r() * this.houses.length) | 0].label : '' }); pBody.setColorAt(i, C.set(SH[(r() * SH.length) | 0])); pHead.setColorAt(i, C.set(SK[(r() * SK.length) | 0])); }
    this.pBody = add(pBody); this.pHead = add(pHead);
    // клетки домов → поиск соседей; районы → подписи на общем плане
    this.cellMap = new Map(this.houses.map(h => [Math.floor(h.x) + ',' + Math.floor(h.z), h]));
    const dist = new Map(); for (const h of this.houses) { const nm = districtOf(h.x, h.z); h.district = nm; const d = dist.get(nm) || { name: nm, x: 0, z: 0, n: 0 }; d.x += h.x; d.z += h.z; d.n++; dist.set(nm, d); }
    this.districts = [...dist.values()].filter(d => d.n >= 25 && d.name !== 'Неоновый центр').map(d => ({ name: d.name, x: d.x / d.n, z: d.z / d.n, n: d.n }));
    this.N = N;
    if (this.treSeed != null) this.setTreasure(this.treSeed);
  }
  // клад: прячем у обычного дома между домами квартала; seed — от даты
  setTreasure(seed) {
    this.treSeed = seed; if (!this.houses.length) return;
    if (!this.chest) { this.chest = makeChest(); this.scene.add(this.chest); }
    let i = seed % this.houses.length; for (let k = 0; k < this.houses.length && this.houses[i].recipe; k++) i = (i + 1) % this.houses.length;
    const h = this.houses[i], sx = (seed >>> 8) & 1 ? 1 : -1, sz = (seed >>> 9) & 1 ? 1 : -1;
    this.treasure = { x: h.x + sx * .45, z: h.z + sz * .45, near: h };
    this.chest.position.set(this.treasure.x, .07, this.treasure.z); this.chest.rotation.y = (seed % 628) / 100;
  }
  treasureDist() { return this.treasure ? Math.hypot(this.ctl.x - this.treasure.x, this.ctl.z - this.treasure.z) : Infinity; }
  // для роликов: показать только дома с номером ≤ n; свежие «вырастают» (pop — сколько домов растут одновременно)
  setGrowth(n = Infinity, pop = 40) {
    this.growN = n; const M = new THREE.Matrix4(), S = new THREE.Matrix4(), T1 = new THREE.Matrix4(), T2 = new THREE.Matrix4();
    const sc = h => { if (h.n > n) return 0; const u = Math.min(1, (n - h.n) / pop); return u >= 1 ? 1 : Math.max(0.001, 1 - Math.pow(1 - u, 3) * Math.cos(u * 6)); };
    for (const g of this.grow || []) { g.list.forEach((h, i) => { const s = sc(h); if (s === 1) { g.mesh.setMatrixAt(i, g.base[i]); return; }
      T1.makeTranslation(h.x, 0, h.z); S.makeScale(s || 1e-4, s || 1e-4, s || 1e-4); T2.makeTranslation(-h.x, 0, -h.z); M.multiplyMatrices(T1, S).multiply(T2).multiply(g.base[i]); g.mesh.setMatrixAt(i, M); }); g.mesh.instanceMatrix.needsUpdate = true; }
    for (const g of this.specialG || []) { const s = sc(g.userData.house); g.visible = s > 0; g.scale.setScalar(Math.max(s, 1e-4)); }
  }
  // «Неоновая улица, 45 · Пиксельный квартал»
  address(h) { const cx = Math.floor(h.x), cy = Math.floor(h.z), a = addressOf(cx, cy); return { ...a, district: h.district || districtOf(h.x, h.z), text: `${a.street}, ${a.num}` }; }
  // соседи по улице слева/справа и дом напротив (через дорогу)
  neighbors(h) {
    const cx = Math.floor(h.x), cy = Math.floor(h.z), get = (x, y) => this.cellMap?.get(x + ',' + y), out = [];
    for (const dir of [-1, 1]) for (let s = 1; s <= 3; s++) { const n = get(cx + dir * s, cy); if (n) { out.push({ h: n, rel: dir < 0 ? 'слева' : 'справа' }); break; } }
    const opp = get(cx, cy + streetSide(cy) * 2); if (opp) out.push({ h: opp, rel: 'напротив' });
    return out;
  }
  focus(h, fly = true) { this.hi = h; this.hiT = this.T; if (h && fly) { this.ctl.tx = h.x; this.ctl.tz = h.z; this.ctl.td = 7; } }
  flyTo(x, z, d = 9) { this.ctl.tx = x; this.ctl.tz = z; this.ctl.td = d; }
  // ---- управление ----
  pan(dx, dy) { const c = this.ctl, k = c.d * .0022, s = Math.sin(c.az), co = Math.cos(c.az); c.tx -= (dx * co - dy * s * 1.3) * k; c.tz -= (-dx * s - dy * co * 1.3) * k; c.x = c.tx; c.z = c.tz; this.clamp(); }
  zoom(f) { this.ctl.td = Math.max(3, Math.min(140, this.ctl.td * f)); }
  rotate(da) { this.ctl.taz += da; }
  clamp() { const c = this.ctl, L = (this.span || 20) * 3 + 6; c.tx = Math.max(-L, Math.min(L, c.tx)); c.tz = Math.max(-L, Math.min(L, c.tz)); }
  pick(x, y) {
    this.ray.setFromCamera(new THREE.Vector2(x / this.W * 2 - 1, -(y / this.H) * 2 + 1), this.cam);
    if (this.chest && this.ray.intersectObject(this.chest, true).length) return { chest: true };
    if (this.honorG && this.ray.intersectObject(this.honorG, true).length) return { honor: true };
    if (this.chest && this.treasure && this.ctl.d < 14) { const p = this.project(this.treasure.x, .15, this.treasure.z); if (p && Math.hypot(p[0] - x, p[1] - y) < 26) return { chest: true }; }
    const hits = this.ray.intersectObjects([...this.pickables, ...this.specialG], true);
    for (const hit of hits) {
      if (hit.object.isInstancedMesh && hit.object.userData.list) return hit.object.userData.list[hit.instanceId];
      let o = hit.object; while (o && !o.userData.house) o = o.parent; if (o) return o.userData.house;
    }
    return null;
  }
  // ---- доска почёта у ратуши и фигурки кандидатов у их домов ----
  setHonor(data) { this.honorData = data; this._extrasDirty = true; }
  setCandidates(list) { this.candList = list || []; this._extrasDirty = true; }
  setFx(map) { this.fxMap = map || {}; this._extrasDirty = true; }
  houseTop(h) {
    const r = h.recipe; if (r && Array.isArray(r.parts) && r.parts.length) return Math.max(...r.parts.map(q => (q.p?.[1] || 0) + (q.s?.[1] || 0)));
    return (r && r.shape === 'skyscraper' ? 2 : 1) * (h.top || (h.floors || 2) * FH + .35);
  }
  buildExtras() {
    this._extrasDirty = false; if (!this.houses.length) return;
    for (const o of this.extras || []) { this.scene.remove(o); o.traverse(m => { m.geometry?.dispose?.(); if (m.material?.map) m.material.map.dispose(); }); } this.extras = [];
    const add = o => { this.scene.add(o); this.extras.push(o); return o; };
    if (this.honorData) {
      const d = this.honorData, G = new THREE.Group(), [cx, cz] = blockCenter([0, 0]);
      const tex = canvasTex(640, 480, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a1a6e'); gr.addColorStop(1, '#120a3a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#ffd23f'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
        g.fillStyle = '#ffd23f'; g.font = '800 46px Unbounded, Inter, sans-serif'; g.textAlign = 'center'; g.fillText('🏆 ДОСКА ПОЧЁТА', w / 2, 70);
        let y = 120; g.textAlign = 'left';
        for (const sec of d.sections || []) { if (y > h - 40) break; g.fillStyle = '#5ef2ff'; g.font = '800 26px Unbounded, Inter, sans-serif'; g.fillText(sec.title, 30, y); y += 36;
          g.font = '700 26px Inter, sans-serif'; for (const line of sec.lines.slice(0, sec.max || 3)) { g.fillStyle = '#ffffff'; g.fillText(line.length > 34 ? line.slice(0, 33) + '…' : line, 44, y); y += 32; } y += 10; }
      });
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .9), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); board.position.y = .78; G.add(board);
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.28, .98, .04), flat('#5a3a22')); back.position.set(0, .78, -.03); G.add(back);
      for (const x of [-.58, .58]) { const post = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.25, .06), flat('#5a3a22')); post.position.set(x, .62, -.03); G.add(post); }
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.1, .03, .08), flat('#ffd23f', '#ffd23f', 2)); lamp.position.set(0, 1.28, .06); G.add(lamp);
      G.position.set(cx + .5, .06, cz + .85); G.scale.setScalar(.85); G.userData.honor = true; G.traverse(m => m.userData.honor = true); add(G); this.honorG = G;
    }
    // таблички, подсветка, украшения жителей (fx.json от бота)
    for (const [nick, fx] of Object.entries(this.fxMap || {})) {
      const h = this.byKey.get(nick); if (!h || h.gone) continue;
      const G = new THREE.Group(), fz = h.rot === Math.PI ? -1 : 1, top = this.houseTop(h);
      if (fx.c) { const ring = new THREE.Mesh(new THREE.RingGeometry(.5, .6, 40), new THREE.MeshBasicMaterial({ color: fx.c, transparent: true, opacity: .9, toneMapped: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = .035; G.add(ring); }
      if (fx.s) { const sg = textSprite('💬 ' + fx.s, { color: '#fff', bg: 'rgba(255,61,127,.9)', scale: .0016, size: 48 }); sg.position.y = top + .55; G.add(sg); }
      const d = new Set(fx.d || []);
      if (d.has('rainbow')) ['#ff3d7f', '#ffd23f', '#a6ff8f', '#5ef2ff', '#c084fc'].forEach((c, i) => { const r = new THREE.Mesh(new THREE.RingGeometry(.62 + i * .05, .66 + i * .05, 40), new THREE.MeshBasicMaterial({ color: c, toneMapped: false, side: THREE.DoubleSide }));
        r.rotation.x = -Math.PI / 2; r.position.y = .03 + i * .002; G.add(r); });
      if (d.has('snowman')) { const S0 = new THREE.Group(), w = flat('#ffffff', '#cfe6ff', .25);
        [[.09, .09], [.065, .23], [.045, .33]].forEach(([r, y]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), w); b.position.y = y; S0.add(b); });
        const nose = new THREE.Mesh(new THREE.ConeGeometry(.012, .06, 8), flat('#ff7a1a')); nose.rotation.x = Math.PI / 2; nose.position.set(0, .33, .05); S0.add(nose);
        const hat = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .05, 10), flat('#14141c')); hat.position.y = .39; S0.add(hat);
        S0.position.set(-.42, 0, fz * .48); G.add(S0); }
      if (d.has('xmas')) { const T0 = new THREE.Group(); [[.16, .2, .05], [.13, .17, .17], [.09, .14, .28]].forEach(([r, hh, y]) => { const c = new THREE.Mesh(new THREE.ConeGeometry(r, hh, 10), flat('#1f7a4a', '#0a3', .2)); c.position.y = y + hh / 2; T0.add(c); });
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(.035), flat('#ffd23f', '#ffd23f', 2)); star.position.y = .45; T0.add(star);
        const g = new THREE.BufferGeometry(), pts = [], cols = [], P = ['#ff3d7f', '#ffd23f', '#5ef2ff', '#a6ff8f'];
        for (let i = 0; i < 18; i++) { const a = i * 2.4, y = .08 + (i / 18) * .32, r = .15 * (1 - i / 22); pts.push(Math.cos(a) * r, y, Math.sin(a) * r); const c = new THREE.Color(P[i % 4]); cols.push(c.r, c.g, c.b); }
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        const lights = new THREE.Points(g, new THREE.PointsMaterial({ size: .06, map: GLOW_T, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); lights.userData.twinkle = true; T0.add(lights);
        T0.position.set(.42, 0, fz * .48); G.add(T0); }
      if (d.has('ufo')) { const U = new THREE.Group(); const disc = new THREE.Mesh(new THREE.SphereGeometry(.22, 20, 8), flat('#9aa3b5', '#5ef2ff', .3)); disc.scale.y = .25; U.add(disc);
        const cab = new THREE.Mesh(new THREE.SphereGeometry(.09, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), flat('#8fd4ff', '#5ef2ff', .8)); cab.position.y = .03; U.add(cab);
        const beam = new THREE.Mesh(new THREE.ConeGeometry(.22, .7, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#a6ff8f', transparent: true, opacity: .18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        beam.position.y = -.37; U.add(beam); U.position.y = top + .9; U.userData.ufo = top + .9; G.add(U); }
      if (d.has('fireworks')) { const F0 = new THREE.Group(); F0.position.y = top + 1.2; F0.userData.fw = Math.random() * 3; const g = new THREE.BufferGeometry(), pts = [], cols = [];
        for (let i = 0; i < 60; i++) { const v = new THREE.Vector3().randomDirection(); pts.push(v.x, v.y, v.z); const c = new THREE.Color(['#ff3d7f', '#ffd23f', '#5ef2ff', '#a6ff8f'][i % 4]); cols.push(c.r, c.g, c.b); }
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        F0.add(new THREE.Points(g, new THREE.PointsMaterial({ size: .12, map: GLOW_T, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))); G.add(F0); }
      if (fx.top) { const B = new THREE.Mesh(new THREE.CylinderGeometry(.12, .7, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: .06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        B.position.y = 7; B.userData.beam = true; G.add(B); }
      if (!G.children.length) continue;
      G.position.set(h.x, 0, h.z); add(G);
    }
    const SUIT = ['#1f4fd8', '#d81f2a', '#2f9a55', '#7b2cbf', '#ff7a1a', '#14141c', '#0fb5b5'];
    (this.candList || []).forEach((c, i) => {
      const h = this.byKey.get(c.nick); if (!h || h.gone) return;
      const G = new THREE.Group(), suit = flat(SUIT[i % SUIT.length]), skin = flat('#ffd2a8');
      const legs = new THREE.Mesh(new THREE.BoxGeometry(.1, .14, .06), flat('#22223a')); legs.position.y = .07; G.add(legs);
      const body = new THREE.Mesh(new THREE.BoxGeometry(.14, .16, .08), suit); body.position.y = .22; G.add(body);
      const sash = new THREE.Mesh(new THREE.BoxGeometry(.03, .18, .085), flat('#ffd23f', '#ffb000', .8)); sash.position.y = .22; sash.rotation.z = .6; G.add(sash);
      const head = new THREE.Mesh(new THREE.SphereGeometry(.06, 12, 10), skin); head.position.y = .36; G.add(head);
      const armL = new THREE.Mesh(new THREE.BoxGeometry(.035, .14, .04), suit); armL.geometry.translate(0, -.06, 0); armL.position.set(-.09, .29, 0); G.add(armL);
      const armR = armL.clone(); armR.position.x = .09; armR.userData.wave = true; G.add(armR);
      const sign = textSprite('🗳 КАНДИДАТ' + (c.votes != null ? ` · ${c.votes}` : ''), { color: '#ffd23f', scale: .0013, size: 48 }); sign.position.y = .55; G.add(sign);
      const fz = h.rot === Math.PI ? -1 : 1; G.position.set(h.x + .28, .02, h.z + fz * .5); G.rotation.y = fz > 0 ? 0 : Math.PI; G.scale.setScalar(1.15);
      G.userData.cand = c.nick; add(G);
    });
  }
  setupShadows() {
    if (!this.shadows) return;
    for (const o of this.dyn.concat(this.extras || [])) o.traverse(m => { if (!m.isMesh || m.isSprite || m.material?.transparent) return;
      const flatish = m.userData.flat || (m.geometry && (m.geometry.boundingBox || (m.geometry.computeBoundingBox(), m.geometry.boundingBox)).max.y - m.geometry.boundingBox.min.y < .07);
      m.castShadow = !flatish; m.receiveShadow = true; });
  }
  // ---- день/ночь: t = 0 (ночь) … 1 (день) ----
  setDaylight(t) { t = Math.max(0, Math.min(1, t)); if (Math.abs(t - this.dayT) < .004 && !this._dayDirty) return; this.dayT = t; this.applyDay(); }
  applyDay() {
    this._dayDirty = false; const t = this.dayT, C = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), t), dusk = Math.max(0, 1 - Math.abs(t - .5) * 2.4);
    this.hemi.color.copy(C('#b3a6ff', '#f2f6ff')).lerp(new THREE.Color('#ffb48a'), dusk * .5); this.hemi.groundColor.copy(C('#2a1d55', '#6f7c66')); this.hemi.intensity = 1.7 + t * .7;
    this.moon.color.copy(C('#b8c6ff', '#fff1d6')).lerp(new THREE.Color('#ff9a5c'), dusk * .6); this.moon.intensity = 1.5 + t * 1.3;
    this.sunDir.set(-30 + t * 50, 50 - t * 5, 20 - t * 30).normalize();
    if (this.starsP) { this.starsP.material.opacity = Math.max(0, 1 - t * 2.2); this.starsP.visible = t < .45; this.moonS.material.opacity = Math.max(0, 1 - t * 2); this.moonS.visible = t < .5;
      this.sunS.material.opacity = t; this.sunS.visible = t > .05; for (const cl of this.clouds) cl.children.forEach(m => { m.material.opacity = (this.weather === 'clear' ? .75 : .95) * (.25 + t * .75); m.material.color.set(t > .4 ? (this.weather === 'clear' ? '#ffffff' : '#c7ccd6') : '#4a4478'); }); }
    const fogDay = this.weather === 'fog' ? '#c9d2dc' : this.weather === 'rain' ? '#9aa8b8' : this.weather === 'snow' ? '#d5e1ee' : '#b9d4f2';
    this.scene.fog.color.copy(C('#1a1240', fogDay)).lerp(new THREE.Color('#ff9f7a'), dusk * .35);
    this.scene.fog.density = (.0075 - t * .003) * (this.weather === 'fog' ? 3.2 : this.weather === 'rain' ? 1.7 : this.weather === 'snow' ? 1.5 : 1);
    this.sky.visible = t > .01; this.sky.material.opacity = t; this.sky.material.color.copy(new THREE.Color('#ffffff').lerp(new THREE.Color(this.weather === 'clear' ? '#ffffff' : '#b8c2cc'), .8)).lerp(new THREE.Color('#ffc09a'), dusk * .7);
    this.ground.material.color.copy(C('#141832', '#3a4660')).lerp(new THREE.Color('#e8eef6'), this.snowCover * (.25 + t * .55));
    this.renderer.toneMappingExposure = 1.05 - t * .1; this.bloomPass.strength = .5 - t * .32;
    const k = 1 - t * .72; // окна и неон днём тусклее
    this.scene.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) { if (m.emissiveIntensity == null || m === this.sky.material) continue;
      if (m.userData.ei0 == null) m.userData.ei0 = m.emissiveIntensity; m.emissiveIntensity = m.userData.ei0 * k; } });
  }
  // ---- погода: 'clear' | 'snow' | 'rain' | 'fog' ----
  setWeather(w) {
    if (!['clear', 'snow', 'rain', 'fog'].includes(w)) w = 'clear'; if (w === this.weather && this.wx !== null) return; this.weather = w;
    if (this.wx) { this.scene.remove(this.wx); this.wx.geometry.dispose(); this.wx = null; }
    if (w === 'snow' || w === 'rain') {
      const N = w === 'snow' ? 2600 : 3200, g = new THREE.BufferGeometry(), pos = new Float32Array(N * (w === 'rain' ? 6 : 3)), seed = new Float32Array(N);
      for (let i = 0; i < N; i++) { const x = (Math.random() - .5) * 50, y = Math.random() * 22, z = (Math.random() - .5) * 50; seed[i] = Math.random();
        if (w === 'rain') pos.set([x, y, z, x + .03, y + .45, z], i * 6); else pos.set([x, y, z], i * 3); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); this.wxSeed = seed; this.wxN = N;
      this.wx = w === 'rain' ? new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#a9c8ff', transparent: true, opacity: .45, fog: false }))
        : new THREE.Points(g, new THREE.PointsMaterial({ size: .22, map: GLOW_T, color: '#ffffff', transparent: true, opacity: .95, depthWrite: false, fog: false }));
      this.wx.frustumCulled = false; this.scene.add(this.wx);
    } else this.wx = false;
    this._dayDirty = true; this.applyDay();
  }
  tickWeather(dt) {
    const target = this.weather === 'snow' ? 1 : 0, prev = this.snowCover; this.snowCover += (target - this.snowCover) * Math.min(1, dt / 40);
    if (Math.abs(this.snowCover - prev) > .002 || (this._snowT = (this._snowT || 0) + dt) > 2) { this._snowT = 0; if (Math.abs(this.snowCover - (this._snowApplied || 0)) > .01) { this._snowApplied = this.snowCover; this.applyDay(); } }
    if (!this.wx) return; const a = this.wx.geometry.attributes.position.array, cx = this.ctl.x, cz = this.ctl.z, T = this.T, rain = this.weather === 'rain';
    this.wx.position.set(0, 0, 0);
    for (let i = 0; i < this.wxN; i++) { const s = this.wxSeed[i], j = rain ? i * 6 : i * 3; let x = a[j], y = a[j + 1], z = a[j + 2];
      y -= dt * (rain ? 16 + s * 6 : .9 + s * .7); if (!rain) { x += Math.sin(T * .8 + s * 40) * dt * .35; z += Math.cos(T * .6 + s * 30) * dt * .25; }
      if (y < 0) { y = 20 + s * 2; x = cx + (Math.random() - .5) * 50; z = cz + (Math.random() - .5) * 50; }
      if (x < cx - 25) x += 50; else if (x > cx + 25) x -= 50; if (z < cz - 25) z += 50; else if (z > cz + 25) z -= 50;
      a[j] = x; a[j + 1] = y; a[j + 2] = z; if (rain) { a[j + 3] = x + .03; a[j + 4] = y + .45; a[j + 5] = z; } }
    this.wx.geometry.attributes.position.needsUpdate = true;
  }
  // ---- кадр ----
  frame(dt) {
    if (this._extrasDirty) { this.buildExtras(); this.setupShadows(); } if (this._dayDirty) this.applyDay(); this.tickWeather(dt);
    if (this.shadows) { this.moon.target.position.set(this.ctl.x, 0, this.ctl.z); this.moon.position.copy(this.moon.target.position).addScaledVector(this.sunDir, 70);
      const sz = Math.min(40, Math.max(10, this.ctl.d * .8)); const sc = this.moon.shadow.camera; if (Math.abs(sc.right - sz) > .5) { Object.assign(sc, { left: -sz, right: sz, top: sz, bottom: -sz }); sc.updateProjectionMatrix(); } }
    if (this.clouds) for (const cl of this.clouds) { cl.position.x += dt * cl.userData.v; if (cl.position.x > 160) cl.position.x = -160; }
    this.T += dt; const T = this.T, c = this.ctl, k = 1 - Math.pow(.002, dt);
    c.x += (c.tx - c.x) * k; c.z += (c.tz - c.z) * k; c.d += (c.td - c.d) * k; c.az += (c.taz - c.az) * k;
    const pol = 1.12 - Math.min(1, c.d / 90) * .42; // угол от вертикали: ближе — ниже камера
    if (this.camOverride) { const o = this.camOverride; this.cam.position.set(...o.p); this.cam.lookAt(...o.t); if (o.fov && this.cam.fov !== o.fov) { this.cam.fov = o.fov; this.cam.updateProjectionMatrix(); } }
    else { this.cam.position.set(c.x + Math.sin(c.az) * Math.sin(pol) * c.d, Math.cos(pol) * c.d + .3, c.z + Math.cos(c.az) * Math.sin(pol) * c.d); this.cam.lookAt(c.x, .4, c.z); }
    for (const lm of this.landmarks || []) lm.children.forEach(ch => { if (ch.userData.label) ch.visible = c.d > 6 && !this.noLmLabels; });
    if (!this.headG) { this.renderer.render(this.scene, this.cam); return; }
    // машины
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3(), hp = this.headG.attributes.position.array, L = this.span * 3;
    this.cars.forEach((o, i) => { let p = o.pos + o.dir * o.sp * T; p = ((p + L) % (2 * L) + 2 * L) % (2 * L) - L; const x = o.alongX ? p : o.line, z = o.alongX ? o.line : p;
      Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.alongX ? (o.dir > 0 ? 0 : Math.PI) : (o.dir > 0 ? -Math.PI / 2 : Math.PI / 2));
      const ly = !o.alongX && inWater(x, z, .6) ? .17 : 0; // на мосту — по настилу
      M.compose(P.set(x, .1 + ly, z), Q, S1); this.carBody.setMatrixAt(i, M); M.compose(P.set(x - (o.alongX ? .02 * o.dir : 0), .19 + ly, z - (o.alongX ? 0 : .02 * o.dir)), Q, S1); this.carTop.setMatrixAt(i, M);
      const fx = o.alongX ? o.dir * .22 : 0, fz = o.alongX ? 0 : o.dir * .22; hp.set([x + fx, .12 + ly, z + fz, x - fx, .12 + ly, z - fz], i * 6); });
    // река течёт, лодки плывут
    if (this.flow) this.flow.offset.x = -T * .04;
    if (this.boats) { this.boats.forEach((b, i) => { let x = b.pos + b.dir * b.sp * T; x = ((x + b.L) % (2 * b.L) + 2 * b.L) % (2 * b.L) - b.L;
        const d = riverSlope(x), L = Math.hypot(1, d), z = riverZ(x) + b.off / L, bob = Math.sin(T * 2 + i) * .012;
        Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(d * b.dir, b.dir)); M.compose(P.set(x - d / L * b.off, bob, z), Q, S1); this.boatHull.setMatrixAt(i, M); this.boatCab.setMatrixAt(i, M); });
      this.boatHull.instanceMatrix.needsUpdate = this.boatCab.instanceMatrix.needsUpdate = true; }
    this.carBody.instanceMatrix.needsUpdate = this.carTop.instanceMatrix.needsUpdate = true; this.headG.attributes.position.needsUpdate = true;
    // люди
    this.ppl.forEach((o, i) => { let p = o.pos + o.dir * o.sp * T; p = ((p + L) % (2 * L) + 2 * L) % (2 * L) - L; const x = o.alongX ? p : o.line, z = o.alongX ? o.line : p, b = Math.abs(Math.sin(T * 8 * o.sp + o.ph)) * .02 + (!o.alongX && inWater(x, z, .6) ? .17 : 0);
      M.makeTranslation(x, b, z); this.pBody.setMatrixAt(i, M); this.pHead.setMatrixAt(i, M); o.x = x; o.z = z; o.y = b; });
    this.pBody.instanceMatrix.needsUpdate = this.pHead.instanceMatrix.needsUpdate = true;
    // анимации
    this.scene.traverse(o => { if (o.userData.blink) o.visible = Math.sin(T * 4) > 0; if (o.userData.spin) o.rotation.y = T * .2; if (o.userData.twinkle) o.material.size = .08 + Math.sin(T * 5) * .02; if (o.userData.pet) o.position.y = Math.abs(Math.sin(T * 6)) * .03; if (o.userData.wave) o.rotation.z = Math.PI - .4 + Math.sin(T * 5) * .45;
      if (o.userData.ufo) { o.position.y = o.userData.ufo + Math.sin(T * 1.6) * .08; o.rotation.y = T * 1.2; }
      if (o.userData.fw != null) { const ph = ((T + o.userData.fw) % 2.6) / 2.6; o.scale.setScalar(.05 + ph * .7); o.children[0].material.opacity = ph < .75 ? 1 : (1 - ph) * 4; }
      if (o.userData.beam) o.material.opacity = .05 + Math.sin(T * 2) * .025; });
    if (this.chest) { const ch = this.chest, near = Math.max(0, 1 - this.treasureDist() / 7) * (c.d < 18 ? 1 : 0);
      ch.position.y = .07 + Math.abs(Math.sin(T * 2.2)) * .04; ch.userData.glow.material.opacity = near * (.55 + Math.sin(T * 3) * .25); ch.userData.spark.visible = near > .05; ch.userData.spark.rotation.y = T * 1.5; }
    if (this.bloom) this.composer.render(); else this.renderer.render(this.scene, this.cam);
    this.drawLabels();
    // авто-качество
    this.fpsT += dt; this.fpsN++; if (this.fpsT > 3) { if (this.fpsN / this.fpsT < 28 && this.shadows) { this.shadows = false; this.moon.castShadow = false; this.renderer.shadowMap.enabled = false; this.scene.traverse(m => { if (m.material) [].concat(m.material).forEach(x => x.needsUpdate = true); }); }
      else if (this.fpsN / this.fpsT < 28 && this.bloom) { this.bloom = false; } this.fpsT = 0; this.fpsN = 0; }
  }
  project(x, y, z) { this.v.set(x, y, z).project(this.cam); return this.v.z > 1 ? null : [(this.v.x + 1) / 2 * this.W, (1 - this.v.y) / 2 * this.H]; }
  drawLabels() {
    const g = this.lg, c = this.ctl; g.clearRect(0, 0, this.W, this.H);
    const pill = (x, y, text, big, gold) => {
      g.font = `${big ? 800 : 600} ${big ? 15 : 12}px ${big ? 'Unbounded' : 'Inter'}, sans-serif`;
      const w = g.measureText(text).width + (big ? 22 : 14), h = big ? 28 : 22;
      g.fillStyle = gold ? '#ffd23f' : 'rgba(255,255,255,.92)'; g.beginPath(); g.roundRect(x - w / 2, y - h - 6, w, h, h / 2); g.fill();
      g.beginPath(); g.moveTo(x - 5, y - 7); g.lineTo(x + 5, y - 7); g.lineTo(x, y); g.fill();
      g.fillStyle = '#1a1238'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y - 6 - h / 2 + 1);
    };
    // названия районов — когда смотрим на город сверху
    if (c.d > 24 && this.districts && !this.noLmLabels) {
      const a = Math.min(1, (c.d - 24) / 10); g.textAlign = 'center'; g.textBaseline = 'middle';
      const used = [];
      for (const d of [...this.districts].sort((u, v) => v.n - u.n)) { const p = this.project(d.x, 1.2, d.z); if (!p || p[0] < -80 || p[0] > this.W + 80 || p[1] < 0 || p[1] > this.H) continue;
        if (used.some(q => Math.abs(q[0] - p[0]) < 190 && Math.abs(q[1] - p[1]) < 30)) continue; used.push(p);
        const big = d.name === 'Неоновый центр'; g.font = `800 ${big ? 17 : 14}px Unbounded, sans-serif`; g.lineWidth = 4; g.strokeStyle = `rgba(12,8,36,${.85 * a})`;
        const t = d.name.toUpperCase(); g.strokeText(t, p[0], p[1]); g.fillStyle = big ? `rgba(255,210,63,${a})` : `rgba(255,140,220,${.95 * a})`; g.fillText(t, p[0], p[1]); }
    }
    // названия мест (парки, площади, памятники) — на среднем плане
    if (c.d > 7 && c.d < 24 && this.places && !this.noLmLabels) {
      const R = c.d * 1.1, used = []; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 12px Inter, sans-serif';
      const ICON = { park: '🌳', square: '⭐', fountain: '⛲', playground: '🎠', art: '💗', monument: '🗿' };
      for (const pl of this.places) { if (Math.hypot(pl.x - c.x, pl.z - c.z) > R) continue; const p = this.project(pl.x, 1.1, pl.z); if (!p) continue;
        if (used.some(q => Math.abs(q[0] - p[0]) < 150 && Math.abs(q[1] - p[1]) < 26)) continue; used.push(p);
        const t = `${ICON[pl.kind] || '📍'} ${pl.name}`, w = g.measureText(t).width + 16;
        g.fillStyle = 'rgba(20,60,45,.88)'; g.beginPath(); g.roundRect(p[0] - w / 2, p[1] - 11, w, 22, 11); g.fill(); g.fillStyle = '#b8ffd9'; g.fillText(t, p[0], p[1] + 1); }
    }
    if (c.d < 22) {
      const R = c.d * .7, cand = [];
      for (const h of this.houses) { if (h === this.hi || h.n > (this.growN ?? Infinity)) continue; const dd = Math.hypot(h.x - c.x, h.z - c.z); if (dd < R) cand.push([dd, h]); }
      cand.sort((a, b) => a[0] - b[0]);
      const placed = [];
      for (const [, h] of cand.slice(0, 40)) { const p = this.project(h.x, h.top + .05, h.z); if (!p) continue; if (placed.some(q => Math.abs(q[0] - p[0]) < 70 && Math.abs(q[1] - p[1]) < 24)) continue; placed.push(p); pill(p[0], p[1], h.label, false, false); }
      if (c.d < 9) for (const o of this.ppl) { if (Math.hypot(o.x - c.x, o.z - c.z) > 3 || !o.nick) continue; const p = this.project(o.x, .32, o.z); if (p) pill(p[0], p[1], o.nick, false, false); }
    }
    if (this.hi) { const h = this.hi, p = this.project(h.x, h.top + .05, h.z); if (p) { pill(p[0], p[1] - 4 - Math.abs(Math.sin(this.T * 4)) * 6, h.label, true, true);
      const q = this.project(h.x, .07, h.z); if (q) { const t = (this.T - this.hiT) % 1.2; g.strokeStyle = `rgba(255,210,63,${.7 - t / 2})`; g.lineWidth = 3; g.beginPath(); g.ellipse(q[0], q[1], 20 + t * 40, (20 + t * 40) * .5, 0, 0, 7); g.stroke(); } } }
  }
}

// ---------- превью одного дома (конструктор) ----------
export class HousePreview {
  constructor(canvas) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); this.r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); this.r.setSize(canvas.clientWidth || 200, canvas.clientHeight || 200, false);
    this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.s = new THREE.Scene(); this.s.add(new THREE.HemisphereLight('#8f7bff', '#1a1035', 1.1)); const d = new THREE.DirectionalLight('#9fb4ff', 1); d.position.set(-3, 5, 2); this.s.add(d);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(1.5, .06, 1.5), new THREE.MeshStandardMaterial({ color: '#1d3b3a' })); pad.position.y = -.03; this.s.add(pad);
    this.c = new THREE.PerspectiveCamera(35, 1, .1, 50); this.g = null; this.alive = true;
    const loop = (t) => { if (!this.alive || !canvas.isConnected) { this.r.dispose(); return; } if (this.g) this.g.rotation.y = t / 2400; this.r.render(this.s, this.c); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  }
  set(rec) { if (this.g) this.s.remove(this.g); this.g = makeHouse(rec); this.s.add(this.g); const h = Math.max(1.2, this.g.userData.top + .3); this.c.position.set(2.2, h * .8 + .6, 2.2 + h * .25); this.c.lookAt(0, h * .38, 0); }
}
