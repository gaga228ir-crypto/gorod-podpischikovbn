// 3D-движок «Города подписчиков» (Three.js). Новая карта: рельеф, озеро, горы; день и ночь.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VARIANTS, Terrain, buildRoads, buildLots, Grid, PLAZA_R, WATER_Y, roadY, clipRoads, buildGround, buildRoadMeshes, buildLamps, buildHouses, buildTrees, buildPlaza, makeEnv } from './map3d.js';

// ---------- планировка ----------
export const isRoad = (x, y) => (((x % 3) + 3) % 3 === 0) || (((y % 3) + 3) % 3 === 0);
const blockOf = (x, y) => [Math.floor((x - 1) / 3), Math.floor((y - 1) / 3)];
// Центральные кварталы под здания-рубежи: [bx, by]
export const LANDMARK_BLOCKS = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]];
const RES = new Set(LANDMARK_BLOCKS.map(b => b.join(',')));
export const blockCenter = ([bx, by]) => [3 * bx + 2, 3 * by + 2];
let _estOrder = null;
// участок №N → квартал. №1 уже занят и остаётся в углу; новые выдаются от центра посёлка
export function estateBlock(i) {
  if (!_estOrder) { const cs = ESTATE_BLOCKS.map(blockCenter), mx = cs.reduce((a, c) => a + c[0], 0) / cs.length, mz = cs.reduce((a, c) => a + c[1], 0) / cs.length;
    _estOrder = [ESTATE_BLOCKS[0], ...ESTATE_BLOCKS.slice(1).sort((a, b) => { const [ax, az] = blockCenter(a), [bx, bz] = blockCenter(b); return Math.hypot(ax - mx, az - mz) - Math.hypot(bx - mx, bz - mz); })]; }
  return _estOrder[i]; }
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

// Посёлок усадеб: участок = целый квартал (как 4 дома), вынесен за город — нумерация обычных домов не сдвигается
export const ESTATE_BLOCKS = []; for (let bx = 32; bx <= 37; bx++) for (let by = -3; by <= 2; by++) { const c = [3 * bx + 2, 3 * by + 2]; if (!inWater(c[0], c[1], 2.4)) ESTATE_BLOCKS.push([bx, by]); }
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
export const FLAG_PAL = ['', '#ffffff', '#1a1238', '#ff3d7f', '#ffd23f', '#5ef2ff', '#a6ff8f', '#c084fc', '#ff7a1a', '#000000', '#4a4f5c', '#9aa1ad', '#d9dde3', '#e02a2a', '#8b1a2e', '#ff9ec4', '#ffb27a', '#fff3a6', '#b8862e', '#7a4a22', '#f1c6a0', '#c88a5f', '#2e9d4f', '#135c34', '#2bb5d8', '#2b6fb5', '#17307a', '#7a4fd0', '#45207a', '#2fc0a0', '#ff6b6b', '#ffd9e8']; // флаг: 0 — пусто, символы 0-9a-v
function textSprite(text, { size = 64, color = '#fff', bg = 'rgba(12,8,36,.85)', pad = 18, font = '800', scale = .006 } = {}) {
  const c = document.createElement('canvas'), g = c.getContext('2d'); g.font = `${font} ${size}px Unbounded, Inter, sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + pad * 2, h = size + pad * 2; c.width = w; c.height = h;
  g.font = `${font} ${size}px Unbounded, Inter, sans-serif`; g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, w, h, h / 2); g.fill();
  g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true })); s.scale.set(w * scale, h * scale, 1); s.layers.set(1); return s; // слой 1 — надписи (можно скрыть)
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
  return parts.slice(0, 200).filter(q => q && PART_T.includes(q.t)).map(q => ({
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
    for (const [row, dy] of [[0, 0], [1, -FH * .55]]) for (let i = 0; i < 48; i++) { const t = (i + row * .5) / 48 * 4, side = Math.floor(t) % 4, u = t - Math.floor(t), h = FOOT / 2 + .03;
      const [x, z] = [[-h + u * 2 * h, h], [h, h - u * 2 * h], [h - u * 2 * h, -h], [-h, -h + u * 2 * h]][side];
      pts.push(x, hh + dy - Math.sin(Math.PI * ((t * 3) % 1)) * .05, z); const c = new THREE.Color(P[(i + row) % 4]); cols.push(c.r, c.g, c.b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ size: .16, map: GLOW_T, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); p.userData.twinkle = true; p.userData.bs = .16; G.add(p);
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
  } else if (type === 'park' && !locked) {
    const grass = new THREE.Mesh(new THREE.BoxGeometry(1.9, .04, 1.9), flat('#1e6b45')); grass.position.y = .02; G.add(grass);
    const tag = (o, k) => { o.traverse(m => m.userData.park = k); return o; };
    // колесо удачи (обозрения)
    const W = new THREE.Group(); W.position.set(-.45, .78, -.35);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.62, .025, 8, 48), flat('#ff3d7f', '#ff3d7f', 1.4)); W.add(rim);
    const rim2 = new THREE.Mesh(new THREE.TorusGeometry(.5, .012, 6, 40), flat('#ffd23f', '#ffd23f', 1.2)); W.add(rim2);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, sp = new THREE.Mesh(new THREE.BoxGeometry(.012, .62, .012), flat('#c9c3ff')); sp.position.set(Math.cos(a) * .31, Math.sin(a) * .31, 0); sp.rotation.z = a + Math.PI / 2; W.add(sp);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(.09, .08, .09), flat(['#5ef2ff', '#ffd23f', '#a6ff8f', '#c084fc'][i % 4], ['#5ef2ff', '#ffd23f', '#a6ff8f', '#c084fc'][i % 4], .8)); cab.position.set(Math.cos(a) * .62, Math.sin(a) * .62 - .06, 0); cab.userData.cab = true; W.add(cab); }
    W.userData.wheelSpin = true; G.add(tag(W, 'wheel'));
    for (const z of [-.1, .1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(.04, .85, .04), flat('#8a90b8')); leg.position.set(-.45, .4, -.35 + z); G.add(tag(leg, 'wheel')); }
    // фонтан желаний
    const F = new THREE.Group(); F.position.set(.42, 0, .42);
    F.add(new THREE.Mesh(new THREE.CylinderGeometry(.33, .37, .12, 24), flat('#9aa3b5'))); F.children[0].position.y = .08;
    const wa = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, .02, 24), flat('#5ef2ff', '#00d5ff', 1.3)); wa.position.y = .15; F.add(wa);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(.04, .06, .3, 10), flat('#c9c3ff')); col.position.y = .3; F.add(col);
    const jet = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 10), flat('#a8f0ff', '#5ef2ff', 1.6)); jet.position.y = .48; jet.userData.pulse = true; F.add(jet);
    G.add(tag(F, 'fountain'));
    // американские горки — маленькая петля с тележкой
    const pts = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; pts.push(new THREE.Vector3(.5 + Math.cos(a) * .38, .25 + Math.sin(a * 2) * .14 + Math.sin(a) * .1, -.25 + Math.sin(a) * .55)); }
    const curve = new THREE.CatmullRomCurve3(pts, true), track = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, .018, 6, true), flat('#ffd23f', '#ff9a00', 1));
    G.add(tag(track, 'coaster'));
    for (let i = 0; i < 8; i++) { const q = curve.getPointAt(i / 8), pl = new THREE.Mesh(new THREE.BoxGeometry(.015, q.y, .015), flat('#8a90b8')); pl.position.set(q.x, q.y / 2, q.z); G.add(tag(pl, 'coaster')); }
    const cart = new THREE.Mesh(new THREE.BoxGeometry(.1, .06, .07), flat('#ff3d7f', '#ff3d7f', 1.2)); cart.userData.cart = curve; G.add(tag(cart, 'coaster'));
    const r = rnd(4); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + .3, t = new THREE.Mesh(new THREE.SphereGeometry(.12 + r() * .05, 8, 6), flat('#2fbf71', '#0a4', .15)); t.position.set(Math.cos(a) * .82, .2, Math.sin(a) * .82); G.add(t); }
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
// ---------- новая карта: рельеф, озеро, улицы растут от площади ----------
const DIST_IN = ['Пиксельный квартал', 'Лазерная слобода', 'Мятный квартал', 'Розовый бульвар', 'Синтвейв', 'Хромовый район', 'Светлячково', 'Радужный'];
const DIST_OUT = ['Сосновка', 'Фиолетовые холмы', 'Неоновые сады', 'Электрогорск', 'Звёздный берег', 'Вольтовка', 'Лунная гавань', 'Аркадный район'];
const ST_F = ['Неоновая', 'Пиксельная', 'Лазерная', 'Хромовая', 'Световая', 'Вольтовая', 'Голографическая', 'Аркадная', 'Ночная', 'Звёздная', 'Лунная', 'Радужная', 'Электрическая', 'Мятная', 'Розовая', 'Фиолетовая', 'Синтовая', 'Яркая', 'Озёрная', 'Сосновая'];
const ST_M = ['Неоновый', 'Пиксельный', 'Лазерный', 'Звёздный', 'Лунный', 'Радужный', 'Солнечный', 'Озёрный', 'Сосновый', 'Светлый', 'Тихий', 'Весёлый'];
const LAKE = { x: 30, z: 26 };
export function districtOf(x, z) {
  const d = Math.hypot(x, z); if (d < 12) return 'Центр';
  const s = Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI * 2) * 8) % 8; return (d < 34 ? DIST_IN : DIST_OUT)[s];
}
const ESTATE_N = 36, ESTATE_K = { 1: 1.8, 2: 2.3, 3: 2.8 };
// места на карте выбираются один раз: посёлок усадеб (до улиц — туда улицы не идут), рубежи у площади, парки/фонтаны по городу
function planCity() {
  const V = VARIANTS.lake, T = new Terrain(V), r = rnd(77);
  const flat = (x, z) => !T.wet(x, z) && T.slope(x, z) < .45 && T.H(x, z) < 5;
  // посёлок усадеб — на дальнем берегу озера, где ровнее всего
  // посёлок: 3 улочки, вдоль них участки 3.1×3.1 фасадами к улочке (6 рядов × 7), сбоку — дорога в город
  const PW = 3.1, PD = 3.1, LW = .6, PITCH = 2 * PD + LW + .5;
  let best = null; const dir = Math.atan2(LAKE.z, LAKE.x);
  for (let a = -1.3; a <= 1.3; a += .1) for (let dd = 26; dd <= 42; dd += 2) { const cx = LAKE.x + Math.cos(dir + a) * dd, cz = LAKE.z + Math.sin(dir + a) * dd; let ok = 0;
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) if (flat(cx + i * 2.8, cz + j * 2.8)) ok++;
    if (!best || ok > best.ok) best = { x: cx, z: cz, ok }; }
  const ra = Math.atan2(LAKE.z - best.z, LAKE.x - best.x), Vx = Math.cos(ra), Vz = Math.sin(ra), Ux = -Vz, Uz = Vx;
  const at = (u, v) => [best.x + Ux * u + Vx * v, best.z + Uz * u + Vz * v];
  const est = { x: best.x, z: best.z, r: 16, plots: [], roads: [] };
  for (const lv of [-PITCH, 0, PITCH]) for (const side of [-1, 1]) for (let k = -3; k <= 3; k++) { const u = k * PW, v = lv + side * (LW / 2 + PD / 2), [x, z] = at(u, v); let ok = true;
    for (const [du, dv] of [[0, 0], [-1.3, -1.3], [1.3, 1.3], [-1.3, 1.3], [1.3, -1.3]]) { const [qx, qz] = at(u + du, v + dv); if (!flat(qx, qz)) ok = false; }
    if (ok) est.plots.push({ x, z, rot: Math.atan2(-side * Vx, -side * Vz), lane: lv }); }
  est.plots.sort((a, b) => Math.hypot(a.x - est.x, a.z - est.z) - Math.hypot(b.x - est.x, b.z - est.z)); est.plots.length = Math.min(est.plots.length, ESTATE_N);
  const U0 = -3.5 * PW - LW / 2, U1 = 3.5 * PW;
  for (const lv of [-PITCH, 0, PITCH]) est.roads.push({ pts: [at(U0, lv), at(U1, lv)], w: .5, kind: 'lane', est: true });
  const spine = { pts: [], w: .55, kind: 'street', est: true }; for (let v = -PITCH; v <= PITCH + .01; v += PITCH / 3) spine.pts.push(at(U0, v)); est.roads.push(spine);
  const roads = buildRoads(T, V.seed, [{ x: est.x, z: est.z, r: est.r + 1.5 }]);
  { // дорога в город: от ближайшего конца «хребта» к ближайшей точке городских улиц, по суше
    let bd = 1e9, A = null, B = null;
    for (const e of [spine.pts[0], spine.pts[spine.pts.length - 1], at(U0, 0)]) for (const rd of roads) for (const q of rd.pts) { const d = Math.hypot(q[0] - e[0], q[1] - e[1]); if (d < bd && Math.hypot(q[0] - est.x, q[1] - est.z) > est.r) { bd = d; A = e; B = q; } }
    if (A && bd < 40) { const n = Math.max(2, Math.ceil(bd / 1.5)), pts = []; let ok = true;
      for (let k = 0; k <= n; k++) { const x = A[0] + (B[0] - A[0]) * k / n, z = A[1] + (B[1] - A[1]) * k / n; if (T.wet(x, z)) ok = false; pts.push([x, z]); }
      if (ok) est.roads.push({ pts, w: .55, kind: 'street', est: true }); } }
  const rp = new Grid(2); for (const rd of roads) for (let i = 0; i < rd.pts.length - 1; i++) { const [a, b] = [rd.pts[i], rd.pts[i + 1]];
    for (let t = 0; t <= 1; t += .25) rp.add(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, rd.w]); }
  const taken = [{ x: est.x, z: est.z, r: est.r }];
  const clear = (x, z, R) => flat(x, z) && rp.near(x, z, R + 1, ([px, pz, w]) => Math.hypot(px - x, pz - z) > R + w / 2) && taken.every(o => Math.hypot(o.x - x, o.z - z) > o.r + R + .5);
  // рубежи (ратуша, парк, …) — в секторах между проспектами вокруг площади
  const aves = roads.filter(rd => rd.kind === 'ave' && Math.hypot(...rd.pts[0]) < PLAZA_R + .1).map(rd => Math.atan2(rd.pts[0][1], rd.pts[0][0])).sort((a, b) => a - b);
  const mids = aves.map((a, i) => { const b = i + 1 < aves.length ? aves[i + 1] : aves[0] + Math.PI * 2; return (a + b) / 2; });
  const lms = [];
  for (const [k, rr0, rr1] of [[0, 9, 18], [1, 9, 18], [2, 9, 18], [3, 9, 18], [4, 9, 18], [5, 9, 18], [0, 19, 30]]) { const a = mids[k % mids.length];
    for (let rr = rr0; rr <= rr1; rr += .5) { let hit = null; for (const da of [0, .08, -.08, .16, -.16]) { const x = Math.cos(a + da) * rr, z = Math.sin(a + da) * rr; if (clear(x, z, 1.5)) { hit = { x, z, r: 1.6 }; break; } }
      if (hit) { lms.push(hit); taken.push(hit); break; } } }
  // места города: примерно одно на 120 домов
  const places = []; let pi = 0;
  for (let rr = 21; rr < V.Rc; rr += 11) { const n = Math.floor(rr * 2 * Math.PI / 26), a0 = r() * 6;
    for (let k = 0; k < n; k++) { const a = a0 + k / n * Math.PI * 2 + (r() - .5) * .2, x = Math.cos(a) * (rr + (r() - .5) * 3), z = Math.sin(a) * (rr + (r() - .5) * 3);
      if (!clear(x, z, 1.25)) continue; const kind = PLACE_KINDS[pi % PLACE_KINDS.length], names = PLACE_NAMES[kind]; places.push({ kind, name: names[Math.floor(pi / PLACE_KINDS.length) % names.length], x, z, r: 1.35 }); taken.push(places[places.length - 1]); pi++; } }
  const lots = buildLots(T, roads, V.seed, taken);
  // номера домов и соседи: по улице, отдельно по каждой стороне
  const by = new Map(); lots.forEach((l, i) => { l.idx = i; const k = l.ri + ':' + l.sd; (by.get(k) || by.set(k, []).get(k)).push(l); });
  for (const [k, arr] of by) { arr.sort((a, b) => a.t - b.t); const sd = +k.split(':')[1]; arr.forEach((l, j) => { l.num = 2 * j + (sd < 0 ? 1 : 2); l.prev = j ? arr[j - 1].idx : -1; l.next = j + 1 < arr.length ? arr[j + 1].idx : -1; }); }
  for (const l of lots) { const opp = by.get(l.ri + ':' + -l.sd); l.opp = -1; if (opp) { let bd = 1.6; for (const o of opp) if (Math.abs(o.t - l.t) < bd) { bd = Math.abs(o.t - l.t); l.opp = o.idx; } } }
  roads.push(...est.roads); // улочки посёлка — после участков города, чтобы вдоль них не строились дома
  return { T, roads, lots, est, lms, places };
}
// улицы только там, где есть дома: обрезаем хвосты за последним заселённым участком (жители: «дороги из ниоткуда в никуда»).
// Улица остаётся целиком, если она соединяет перекрёстки; ветка, от которой отходит нужная улица, тянется до неё.
function trimRoads(roads, lots, houses) {
  const cum = roads.map(rd => { const c = [0]; for (let i = 1; i < rd.pts.length; i++) c.push(c[i - 1] + Math.hypot(rd.pts[i][0] - rd.pts[i - 1][0], rd.pts[i][1] - rd.pts[i - 1][1])); return c; });
  const G = new Grid(1); roads.forEach((rd, ri) => { const P = rd.pts, C = cum[ri]; for (let i = 0; i < P.length - 1; i++) { const L = C[i + 1] - C[i] || 1;
    for (let t = 0; t <= L; t += .25) { const k = t / L; G.add(P[i][0] + (P[i + 1][0] - P[i][0]) * k, P[i][1] + (P[i + 1][1] - P[i][1]) * k, [ri, C[i] + t]); } } });
  const onOther = (ri, x, z) => { let best = null, bd = .45;
    G.near(x, z, .5, v => { if (v[0] === ri) return; const rd = roads[v[0]], C = cum[v[0]]; let i = 0; while (i < C.length - 2 && C[i + 1] < v[1]) i++; const L = C[i + 1] - C[i] || 1, k = (v[1] - C[i]) / L;
      const px = rd.pts[i][0] + (rd.pts[i + 1][0] - rd.pts[i][0]) * k, pz = rd.pts[i][1] + (rd.pts[i + 1][1] - rd.pts[i][1]) * k, d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; best = v; } }); return best; };
  const need = roads.map(rd => rd.est || Math.hypot(rd.pts[0][0] - rd.pts[rd.pts.length - 1][0], rd.pts[0][1] - rd.pts[rd.pts.length - 1][1]) < .01 ? Infinity : -1); // кольцо и посёлок — как есть
  for (const h of houses) { const l = lots[h.lot]; if (l && l.ri != null && need[l.ri] !== Infinity) need[l.ri] = Math.max(need[l.ri], l.t + .9); }
  const ends = roads.map((rd, ri) => [onOther(ri, ...rd.pts[0]), onOther(ri, ...rd.pts[rd.pts.length - 1])]);
  for (let pass = 0; pass < 6; pass++) { let ch = false;
    roads.forEach((rd, ri) => { if (need[ri] < 0) return; const full = need[ri] >= cum[ri][cum[ri].length - 1] - .01;
      // нужная улица держит ту, от которой отходит; если доходит до конца — и ту, в которую упирается
      for (const [e, use] of [[ends[ri][0], true], [ends[ri][1], full]]) if (e && use && need[e[0]] !== Infinity && need[e[0]] < e[1]) { need[e[0]] = e[1]; ch = true; } });
    // хвост короче 2.5 до перекрёстка — дотягиваем, чтобы улица не обрывалась у самого перекрёстка
    roads.forEach((rd, ri) => { const L = cum[ri][cum[ri].length - 1]; if (need[ri] >= 0 && need[ri] < L && ends[ri][1] && L - need[ri] < 2.5) { need[ri] = L; ch = true; } });
    if (!ch) break; }
  return roads.map((rd, ri) => { const C = cum[ri], n = need[ri]; if (n === Infinity) return rd; if (n < 0) return null; if (n >= C[C.length - 1]) return rd;
    const pts = [rd.pts[0]]; for (let i = 1; i < rd.pts.length; i++) { if (C[i] < n) { pts.push(rd.pts[i]); continue; } const k = (n - C[i - 1]) / (C[i] - C[i - 1] || 1);
      pts.push([rd.pts[i - 1][0] + (rd.pts[i][0] - rd.pts[i - 1][0]) * k, rd.pts[i - 1][1] + (rd.pts[i][1] - rd.pts[i - 1][1]) * k]); break; }
    return { ...rd, pts, ys: null, cum: null }; }).filter(rd => rd && rd.pts.length > 1);
}
// точка на ломаной улицы: s — расстояние от начала, off — сдвиг вбок
function alongRoad(T, rd, s, off, out) {
  if (!rd.cum) { rd.cum = [0]; for (let i = 1; i < rd.pts.length; i++) rd.cum.push(rd.cum[i - 1] + Math.hypot(rd.pts[i][0] - rd.pts[i - 1][0], rd.pts[i][1] - rd.pts[i - 1][1])); roadY(T, rd); }
  const C = rd.cum; s = Math.max(0, Math.min(C[C.length - 1] - 1e-4, s)); let lo = 0, hi = C.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (C[m] <= s) lo = m; else hi = m; }
  const [ax, az] = rd.pts[lo], [bx, bz] = rd.pts[hi], L = C[hi] - C[lo] || 1, t = (s - C[lo]) / L, tx = (bx - ax) / L, tz = (bz - az) / L;
  out.x = ax + (bx - ax) * t - tz * off; out.z = az + (bz - az) * t + tx * off; out.y = rd.ys[lo] + (rd.ys[hi] - rd.ys[lo]) * t; out.a = Math.atan2(tx, tz); return out;
}

export class City3D {
  constructor(canvas, labels) {
    this.canvas = canvas; this.lbl = labels; this.lg = labels.getContext('2d');
    const R = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    R.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6)); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.NeutralToneMapping; R.toneMappingExposure = 1.12;
    const S = this.scene = new THREE.Scene(); S.fog = new THREE.Fog('#dcebf5', 90, 230);
    this.cam = new THREE.PerspectiveCamera(42, 1, .1, 900); this.cam.layers.enable(1); this.labelMode = 'all';
    const hemi = this.hemi = new THREE.HemisphereLight('#e4f2ff', '#8d9f78', 1.05); S.add(hemi);
    const moon = this.moon = new THREE.DirectionalLight('#fff0d4', 2.7); moon.position.set(-35, 75, 30); S.add(moon); S.add(moon.target);
    this.sunDir = new THREE.Vector3(-35, 75, 30).normalize();
    this.shadows = !/[?&]lq=1/.test(location.search) && (navigator.hardwareConcurrency || 4) > 4;
    R.shadowMap.enabled = this.shadows; R.shadowMap.type = THREE.PCFSoftShadowMap;
    moon.castShadow = this.shadows; moon.shadow.mapSize.set(2048, 2048); moon.shadow.bias = -.0006; moon.shadow.normalBias = .03;
    Object.assign(moon.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 220 });
    this.dayT = 0; this.weather = 'clear'; this.snowCover = 0; this.wx = null;
    this.ctl = { tx: 0, tz: 0, x: 0, z: 0, y: 0, d: 34, td: 34, az: Math.PI / 4, taz: Math.PI / 4, pol: .95 };
    this.houses = []; this.byKey = new Map(); this.dyn = []; this.T = 0; this.hi = null; this.bloom = !/[?&]lq=1/.test(location.search);
    this.composer = new EffectComposer(R); this.composer.addPass(new RenderPass(S, this.cam));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), .55, .5, .82); this.composer.addPass(this.bloomPass); this.composer.addPass(new OutputPass());
    this.ray = new THREE.Raycaster(); this.v = new THREE.Vector3();
    { const t0 = performance.now(); this.map = planCity(); this.ter = this.map.T; this.planMs = Math.round(performance.now() - t0); }
    this.buildStatic(); this.resize(); addEventListener('resize', () => this.resize());
    this.fpsT = 0; this.fpsN = 0;
  }
  gy(x, z) { return Math.max(WATER_Y, this.ter.H(x, z)); }
  resize() {
    const w = innerWidth, h = innerHeight; this.renderer.setSize(w, h, false); this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w / 2, h / 2); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    const dpr = Math.min(devicePixelRatio || 1, 2); this.lbl.width = w * dpr; this.lbl.height = h * dpr; this.lg.setTransform(dpr, 0, 0, dpr, 0, 0); this.W = w; this.H = h;
  }
  buildStatic() {
    const S = this.scene, { ground, water } = buildGround(this.ter); this.ground = ground; this.water = water; S.add(ground, water);
    const E = makeEnv(this.renderer); S.environment = E.env;
    // небо для дня: купол с градиентом, ночью прозрачный (видно ночной фон страницы)
    { const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256; const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#5f9fe6'); gr.addColorStop(.42, '#a9d2f5'); gr.addColorStop(.5, '#e4f1fb'); gr.addColorStop(1, '#e4f1fb'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, transparent: true, opacity: 0, fog: false, depthWrite: false }));
      this.sky.renderOrder = -1; this.sky.visible = false; S.add(this.sky); }
    { const g = new THREE.BufferGeometry(), pts = [], r0 = rnd(42); for (let i = 0; i < 1400; i++) { const a = r0() * Math.PI * 2, e = .12 + r0() * 1.3, R0 = 560; pts.push(Math.cos(a) * Math.cos(e) * R0, Math.sin(e) * R0, Math.sin(a) * Math.cos(e) * R0); }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.starsP = new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, color: '#e8e4ff', transparent: true, fog: false, depthWrite: false })); S.add(this.starsP);
      const disc = canvasTex(128, 128, (c, w, h) => { const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.32, 'rgba(240,240,255,1)'); gr.addColorStop(.36, 'rgba(200,200,255,.35)'); gr.addColorStop(1, 'rgba(160,150,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
      this.moonS = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, transparent: true, fog: false, depthWrite: false })); this.moonS.position.set(-280, 230, -320); this.moonS.scale.setScalar(80); S.add(this.moonS);
      const sun = canvasTex(128, 128, (c, w, h) => { const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(.22, 'rgba(255,240,190,1)'); gr.addColorStop(.3, 'rgba(255,210,120,.5)'); gr.addColorStop(1, 'rgba(255,190,90,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
      this.sunS = new THREE.Sprite(new THREE.SpriteMaterial({ map: sun, transparent: true, opacity: 0, fog: false, depthWrite: false, toneMapped: false })); this.sunS.position.set(-300, 420, 250); this.sunS.scale.setScalar(110); this.sunS.visible = false; S.add(this.sunS);
      this.clouds = []; const r1 = rnd(9), cg = new THREE.SphereGeometry(1, 12, 8);
      for (let i = 0; i < 22; i++) { const C0 = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .7, fog: false, depthWrite: false });
        for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(cg, m); b.scale.set(7 + r1() * 7, 2.4 + r1() * 1.6, 5 + r1() * 3); b.position.set(k * 7 - 10 + r1() * 3, r1() * 1.5, r1() * 4); C0.add(b); }
        C0.position.set(-260 + r1() * 520, 55 + r1() * 25, -260 + r1() * 520); C0.userData.v = .6 + r1() * .8; this.clouds.push(C0); S.add(C0); } }
  }
  // list: [{nick, key, label, recipe, n, gone, estate}] в порядке заселения
  setCity(list, milestones = [], hallInfo = null) {
    this._dayDirty = true; this._extrasDirty = true;
    for (const o of this.dyn) { this.scene.remove(o); o.traverse?.(m => { m.geometry?.dispose?.(); }); } this.dyn = [];
    const add = o => { this.scene.add(o); this.dyn.push(o); return o; };
    const T = this.ter, { lots, est, lms } = this.map, N = Math.min(list.length, lots.length), r = rnd(7), C = new THREE.Color(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
    this.houses = list.slice(0, N).map((it, i) => Object.assign({ ...lots[i] }, it, { n: i + 1, lot: i }));
    for (const h of this.houses) { h.district = districtOf(h.x, h.z); h.special = !!(h.recipe && !h.gone);
      const pl = h.estate != null && !h.gone ? est.plots[h.estate] : null;
      if (pl) { h.oldX = h.x; h.oldZ = h.z; h.oldY = T.H(h.x, h.z); Object.assign(h, { x: pl.x, z: pl.z, y: T.H(pl.x, pl.z), rot: pl.rot, isEstate: true, special: true, fp: null });
        if (!h.recipe) h.recipe = { shape: 'house', floors: 2, wall: WALLS[hash(h.key) % WALLS.length], roof: ROOFS[hash(h.key + 'r') % ROOFS.length], decor: ['garland', 'tree'] }; } }
    this.byKey = new Map(this.houses.map(h => [h.key, h]));
    for (const h of this.houses) { const H = h.home && !h.gone && !h.isEstate ? this.byKey.get(h.home) : null; if (!H || H === h || H.home || H.gone) continue;
      h.oldX = h.x; h.oldZ = h.z; h.oldY = T.H(h.x, h.z); Object.assign(h, { x: H.x, z: H.z, guest: true, host: H, special: false }); (H.residents ||= []).push(h.key); }
    const town = this.houses.filter(h => !h.isEstate && !h.guest);
    let Rm = PLAZA_R + 8; for (const h of town) Rm = Math.max(Rm, h.d); Rm += 3; this.Rm = Rm; this.span = Rm / 3; this.rMax = Rm;
    // улицы, тротуары, фонари
    const roads = this.roads = clipRoads(trimRoads(this.map.roads, lots, this.houses), Rm);
    for (const m of buildRoadMeshes(T, roads)) add(m);
    const lampsB = buildLamps(T, roads); for (const m of lampsB.meshes) add(m);
    // обычные дома и дворы (особые — ниже, своими моделями)
    const built = buildHouses(T, town, 7); this.pickables = [];
    for (const m of built.meshes) { add(m); if (m.userData.list) this.pickables.push(m); }
    for (const h of this.houses) { if (!h.special) continue; h.y = h.isEstate ? h.y : Math.max(T.H(h.x, h.z), h.mn != null ? h.mn + .04 : T.H(h.x, h.z)); }
    // места: парки, площади, фонтаны…; показываем только внутри города
    this.places = this.map.places.filter(p => Math.hypot(p.x, p.z) < Rm - 1).map(p => ({ ...p, y: T.H(p.x, p.z) }));
    const extraTrees = [...built.garden], benches = [], paveL = [], pondL = [], at = (m, x, y, z) => { m.position.set(x, y, z); return m; }; this.placeG = [];
    for (const pl of this.places) { const { x, z, y, kind } = pl, rp = rnd(hash(pl.name + x.toFixed(1)));
      if (kind === 'park') { pondL.push([x + .4, y, z - .3]);
        for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28 + rp(), d = .6 + rp() * .55; extraTrees.push([x + Math.cos(a) * d, T.H(x + Math.cos(a) * d, z + Math.sin(a) * d), z + Math.sin(a) * d, .5 + rp() * .35, rp()]); }
        benches.push([x - .3, y, z + .25, 0]); continue; }
      paveL.push([x, y, z]);
      const G = new THREE.Group(); G.position.set(x, y + .05, z); add(G); this.placeG.push(G);
      if (kind === 'monument' || kind === 'square') {
        G.add(at(new THREE.Mesh(new THREE.BoxGeometry(.5, .22, .5), flat('#d8d2c4')), 0, .11, 0));
        G.add(at(new THREE.Mesh(new THREE.BoxGeometry(.4, .06, .4), flat('#c9b37a')), 0, .25, 0));
        const gold = new THREE.MeshStandardMaterial({ color: '#d9b44a', metalness: .7, roughness: .3 });
        if (kind === 'monument') { G.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(.07, .22, 4, 10), gold), 0, .45, 0)); G.add(at(new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 10), gold), 0, .67, 0));
          const arm = at(new THREE.Mesh(new THREE.CapsuleGeometry(.025, .2, 3, 6), gold), .1, .6, 0); arm.rotation.z = -.7; G.add(arm); }
        else { G.add(at(new THREE.Mesh(new THREE.ConeGeometry(.12, .9, 4), gold), 0, .73, 0)); const st = emojiSprite('⭐', .3); st.position.y = 1.3; G.add(st); }
        benches.push([x, y, z + .8, 0], [x, y, z - .8, Math.PI]);
      } else if (kind === 'fountain') { const stoneM = flat('#d7dde3'), wM = new THREE.MeshStandardMaterial({ color: '#5fbfee', roughness: .05, metalness: .1 });
        for (const [rr, hh, yy] of [[.6, .1, 0], [.3, .12, .1], [.14, .1, .22]]) { G.add(at(new THREE.Mesh(new THREE.CylinderGeometry(rr, rr * 1.05, hh, 24), stoneM), 0, yy + hh / 2, 0)); G.add(at(new THREE.Mesh(new THREE.CylinderGeometry(rr * .88, rr * .88, .02, 24), wM), 0, yy + hh + .005, 0)); }
        benches.push([x, y, z + .85, 0], [x, y, z - .85, Math.PI]);
      } else if (kind === 'playground') { const C1 = flat('#ff4d6d'), C2 = flat('#ffd23f'), C3 = flat('#4dabf7'), C4 = flat('#63e6be');
        G.add(at(new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, .02, 24), flat('#d9b98a')), 0, .01, 0));
        G.add(at(new THREE.Mesh(new THREE.BoxGeometry(.3, .35, .3), C3), -.4, .18, -.3)); const roofP = at(new THREE.Mesh(new THREE.ConeGeometry(.26, .2, 4), C1), -.4, .45, -.3); roofP.rotation.y = Math.PI / 4; G.add(roofP);
        const slide = at(new THREE.Mesh(new THREE.BoxGeometry(.16, .02, .55), C2), -.4, .17, .1); slide.rotation.x = .6; G.add(slide);
        for (const sx of [.2, .7]) G.add(at(new THREE.Mesh(new THREE.BoxGeometry(.03, .4, .03), C4), sx, .2, -.4)); G.add(at(new THREE.Mesh(new THREE.BoxGeometry(.53, .03, .03), C4), .45, .4, -.4));
        const car = at(new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, .05, 16), flat('#c084fc')), .35, .06, .35); car.userData.spin = true; G.add(car);
      } else if (kind === 'art') { const ring = at(new THREE.Mesh(new THREE.TorusGeometry(.38, .045, 10, 40), flat('#ff3d7f', '#ff3d7f', .8)), 0, .55, 0); ring.userData.spin = true; G.add(ring);
        G.add(at(new THREE.Mesh(new THREE.SphereGeometry(.12, 16, 12), flat('#5ef2ff', '#5ef2ff', .8)), 0, .55, 0)); G.add(at(new THREE.Mesh(new THREE.CylinderGeometry(.18, .22, .1, 16), flat('#9a9690')), 0, .05, 0));
        benches.push([x, y, z + .85, 0]); } }
    if (paveL.length) { const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.15, 1.2, .08, 28), new THREE.MeshStandardMaterial({ color: '#e3dccd', roughness: .9 }), paveL.length);
      paveL.forEach(([x, y, z], i) => { M.makeTranslation(x, y + .02, z); pm.setMatrixAt(i, M); }); pm.userData.flat = true; add(pm); }
    if (pondL.length) { const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(.32, .32, .03, 24), new THREE.MeshStandardMaterial({ color: '#5fbfee', roughness: .05, metalness: .1 }), pondL.length);
      pondL.forEach(([x, y, z], i) => { M.makeTranslation(x, y + .03, z); pm.setMatrixAt(i, M); }); pm.userData.flat = true; add(pm); }
    // особые дома жителей и усадьбы
    this.specialG = [];
    for (const h of this.houses) { if (!h.special) continue; const g = makeHouse(h.recipe, h.key); g.position.set(h.x, h.y, h.z); g.rotation.y = h.rot; g.userData.house = h; h.top = g.userData.top;
      if (h.isEstate) { g.scale.setScalar(1.8); g.userData.k = 1.8; h.top = (g.userData.top || .6) * 1.8;
        const fence = flat('#e8dcc4'), Yd = new THREE.Group(); Yd.position.set(h.x, h.y, h.z); Yd.rotation.y = h.rot;
        for (const [w, d, x, z] of [[2, .04, 0, 1], [2, .04, 0, -1], [.04, 2, 1, 0], [.04, 2, -1, 0]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(w, .12, d), fence); f.position.set(x, .06, z); Yd.add(f); }
        for (const [x, z] of [[-.75, .75], [.75, -.75], [.75, .75]]) { const t = new THREE.Mesh(new THREE.ConeGeometry(.16, .5, 8), flat('#3f7a4a')); t.position.set(x, .3, z); Yd.add(t); }
        const path = new THREE.Mesh(new THREE.BoxGeometry(.3, .01, .9), flat('#c9a46a')); path.position.set(0, .01, .55); Yd.add(path);
        ['#ff3d7f', '#ffd23f', '#c084fc', '#5ef2ff'].forEach((c, i) => { for (let k = 0; k < 5; k++) { const fl = new THREE.Mesh(new THREE.SphereGeometry(.035, 6, 5), flat(c)); fl.position.set(-.85 + k * .07, .05, -.3 + i * .09); Yd.add(fl); const fr = fl.clone(); fr.position.x = .57 + k * .07; Yd.add(fr); } });
        const pond = new THREE.Mesh(new THREE.CircleGeometry(.2, 20), new THREE.MeshStandardMaterial({ color: '#5fbfee', roughness: .05 })); pond.rotation.x = -Math.PI / 2; pond.position.set(-.7, .015, -.72); Yd.add(pond);
        Yd.scale.setScalar(1.3); add(Yd); }
      add(g); this.specialG.push(g); }
    for (const h of this.houses) if (h.guest) { h.y = h.host.y; h.top = h.host.top; }
    this.places.push({ kind: 'estate', name: 'Посёлок Усадеб', x: est.x, z: est.z, y: T.H(est.x, est.z) }); this.estateCenter = this.places[this.places.length - 1];
    { const taken = new Set(this.houses.filter(h => h.isEstate).map(h => h.estate));
      // свободные участки: низкий забор-контур, газон и табличка на столбике
      const fenceM = flat('#e8dcc4'), lawnM = flat('#8fd17a'), postM = flat('#9b6b3d'), boardM = flat('#fff6dc');
      const fx = [], lawn = [], posts = [], boards = [], q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), M4 = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
      const at = (p, lx, ly, lz) => { const c = Math.cos(p.rot), sn = Math.sin(p.rot); return new THREE.Vector3(p.x + lx * c + lz * sn, T.H(p.x, p.z) + ly, p.z - lx * sn + lz * c); };
      for (let i = 0; i < est.plots.length; i++) { if (taken.has(i)) continue; const p = est.plots[i]; q.setFromAxisAngle(Y, p.rot);
        for (const [lx, lz, sx, sz] of [[0, 1.3, 2.6, .05], [0, -1.3, 2.6, .05], [1.3, 0, .05, 2.6], [-1.3, 0, .05, 2.6]]) fx.push([at(p, lx, .05, lz), q.clone(), new THREE.Vector3(sx, .1, sz)]);
        { const hs = [[0, 0], [1.25, 1.25], [-1.25, 1.25], [1.25, -1.25], [-1.25, -1.25], [0, 1.25], [0, -1.25], [1.25, 0], [-1.25, 0]].map(([lx, lz]) => { const v = at(p, lx, 0, lz); return T.H(v.x, v.z); }), lo = Math.min(...hs) - .15, hi = Math.max(...hs) + .03;
          const c = at(p, 0, 0, 0); c.y = (lo + hi) / 2; lawn.push([c, q.clone(), new THREE.Vector3(2.5, hi - lo, 2.5)]); } // газон толщиной по уклону — не мерцает с землёй
        posts.push([at(p, .9, .25, 1.15), q.clone(), new THREE.Vector3(.05, .5, .05)]); boards.push([at(p, .9, .45, 1.17), q.clone(), new THREE.Vector3(.42, .2, .03)]);
        const sg = textSprite('Свободно · 100⭐', { color: '#1a1238', bg: 'rgba(255,255,255,.92)', scale: .0011, size: 44 }); sg.position.copy(at(p, .9, .8, 1.15)); add(sg); }
      for (const [list, m] of [[fx, fenceM], [lawn, lawnM], [posts, postM], [boards, boardM]]) if (list.length) { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), m, list.length);
        list.forEach(([pos, qq, sc], i) => im.setMatrixAt(i, M4.compose(pos, qq, sc))); im.castShadow = m !== lawnM; add(im); } }
    // на старом месте дома, переехавшего в усадьбу, — указатель
    for (const h of this.houses) if (h.guest) { const sg = textSprite('🏘 ' + h.label + ' → живёт у ' + h.host.label, { color: '#1a1238', bg: 'rgba(255,214,107,.95)', scale: .0016, size: 46 }); sg.position.set(h.oldX, h.oldY + .6, h.oldZ); add(sg); }
    for (const h of this.houses) if (h.isEstate && h.oldX != null) { const sg = textSprite('🏡 ' + h.label + ' → Посёлок Усадеб', { color: '#1a1238', bg: 'rgba(166,255,143,.92)', scale: .0016, size: 46 }); sg.position.set(h.oldX, h.oldY + 1.15, h.oldZ); add(sg); }
    // брошенные дома: табличка «ПРОДАЁТСЯ»
    const gone = town.filter(h => h.gone);
    if (gone.length) {
      const signT = canvasTex(128, 64, (g) => { g.fillStyle = '#f2e6c9'; g.fillRect(0, 0, 128, 64); g.strokeStyle = '#7a4b2a'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 58); g.fillStyle = '#b3261e'; g.font = '800 19px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ПРОДАЁТСЯ', 64, 33); });
      const sM = new THREE.InstancedMesh(new THREE.PlaneGeometry(.34, .17), new THREE.MeshBasicMaterial({ map: signT, side: THREE.DoubleSide }), gone.length), pM = new THREE.InstancedMesh(new THREE.BoxGeometry(.02, .3, .02).translate(0, .15, 0), flat('#6b4a2e'), gone.length);
      gone.forEach((h, i) => { const o = h.dp / 2 + .22, x = h.x + Math.sin(h.rot) * o, z = h.z + Math.cos(h.rot) * o, y = T.H(x, z); Q.setFromAxisAngle(Y, h.rot);
        M.compose(P.set(x, y + .32, z), Q, S1); sM.setMatrixAt(i, M); M.makeTranslation(x, y, z); pM.setMatrixAt(i, M); });
      add(sM); add(pM); }
    // деревья (не на участках, дорогах и местах), площадь
    const keep = [...this.map.places, ...lms, { x: est.x, z: est.z, r: est.r }].map(o => ({ x: o.x, z: o.z, r: (o.r || 1.3) + .2 }));
    const trees = buildTrees(T, roads, town.map(h => h.fp), extraTrees, Rm, 23, keep); for (const m of trees) add(m);
    add(buildPlaza(T.H(0, 0), roads));
    // скамейки
    { const bg = new THREE.BoxGeometry(.24, .03, .08).translate(0, .07, 0), bb = new THREE.BoxGeometry(.24, .07, .015).translate(0, .11, -.035), bl = new THREE.BoxGeometry(.2, .055, .06).translate(0, .03, 0);
      for (const g of [bg, bb, bl]) { const im = new THREE.InstancedMesh(g, flat(g === bl ? '#55555f' : '#a8743f'), Math.max(1, benches.length)); im.count = benches.length;
        benches.forEach(([x, y, z, a], i) => { Q.setFromAxisAngle(Y, a); M.compose(P.set(x, y, z), Q, S1); im.setMatrixAt(i, M); }); add(im); } }
    // фонари: ночью светятся
    { const gp = lampsB.tops.flat(), lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
      this.lampGlow = add(new THREE.Points(lg, new THREE.PointsMaterial({ color: '#ffcf7a', size: .55, map: GLOW_T, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))); }
    // рубежи: ратуша и здания-награды — вокруг площади
    this.landmarks = [];
    const order = [{ type: 'hall', title: hallInfo?.title || '🗳 Ратуша — после выборов', locked: !hallInfo?.open }, ...milestones.map(m => ({ type: m.type, at: m.at, title: (N >= m.at ? m.name : `🔒 ${m.name} · ${m.at.toLocaleString('ru')}`), locked: N < m.at }))];
    order.slice(0, lms.length).forEach((m, i) => { const g = makeLandmark(m.type, m.locked, m.title), s = lms[i]; g.position.set(s.x, T.H(s.x, s.z) + .02, s.z); g.rotation.y = Math.atan2(-s.x, -s.z); add(g); this.landmarks.push(g); });
    // машины по большим улицам, люди по тротуарам, лодки на озере
    const carRoads = roads.filter(rd => (rd.kind === 'ave' || rd.kind === 'street') && rd.pts.length > 3), walkRoads = roads.filter(rd => rd.pts.length > 3);
    for (const rd of roads) alongRoad(T, rd, 0, 0, {});
    this.cars = []; const CC = ['#e05a5a', '#4a8fd6', '#f2c94c', '#f4f4f4', '#3fae8f', '#8a6fd1', '#f08a3c', '#2f3440'];
    const carN = carRoads.length ? Math.min(120, 16 + N / 25 | 0) : 0;
    const carBody = new THREE.InstancedMesh(new THREE.BoxGeometry(.2, .1, .4), flat('#ffffff'), Math.max(1, carN)), carTop = new THREE.InstancedMesh(new THREE.BoxGeometry(.18, .08, .22), flat('#3b4a6a'), Math.max(1, carN)); carBody.count = carTop.count = carN;
    for (let i = 0; i < carN; i++) { const rd = carRoads[(r() * carRoads.length) | 0]; this.cars.push({ rd, L: rd.cum[rd.cum.length - 1], s0: r() * 1000, dir: r() < .5 ? 1 : -1, sp: .9 + r() * 1.1 }); carBody.setColorAt(i, C.set(CC[(r() * CC.length) | 0])); }
    this.carBody = add(carBody); this.carTop = add(carTop);
    this.headG = new THREE.BufferGeometry(); this.headG.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(Math.max(1, carN) * 6), 3));
    const hc = new Float32Array(Math.max(1, carN) * 6); for (let i = 0; i < carN; i++) hc.set([1, .92, .6, 1, .2, .25], i * 6); this.headG.setAttribute('color', new THREE.Float32BufferAttribute(hc, 3));
    this.headPts = add(new THREE.Points(this.headG, new THREE.PointsMaterial({ size: .35, map: GLOW_T, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    const pplN = walkRoads.length ? Math.min(260, 24 + N / 10 | 0) : 0; this.ppl = [];
    const pb = new THREE.CapsuleGeometry(.035, .1, 3, 6).translate(0, .1, 0), ph = new THREE.SphereGeometry(.04, 8, 6).translate(0, .22, 0);
    const SH = ['#ff6b8a', '#ffd166', '#6ee7b7', '#7cc8ff', '#c084fc', '#ff9f68', '#f1f3f5', '#20c997'], SK = ['#f6d2b5', '#eac0a0', '#d9a47c', '#b07a52', '#8a5a3b'];
    const pBody = new THREE.InstancedMesh(pb, flat('#ffffff'), Math.max(1, pplN)), pHead = new THREE.InstancedMesh(ph, flat('#ffffff'), Math.max(1, pplN)); pBody.count = pHead.count = pplN;
    for (let i = 0; i < pplN; i++) { const rd = walkRoads[(r() * walkRoads.length) | 0]; this.ppl.push({ rd, L: rd.cum[rd.cum.length - 1], s0: r() * 1000, side: r() < .5 ? 1 : -1, sp: .22 + r() * .25, ph: r() * 6, nick: this.houses.length ? this.houses[(r() * this.houses.length) | 0].label : '' });
      pBody.setColorAt(i, C.set(SH[(r() * SH.length) | 0])); pHead.setColorAt(i, C.set(SK[(r() * SK.length) | 0])); }
    this.pBody = add(pBody); this.pHead = add(pHead);
    this.boats = []; const boatN = 6, hullG = new THREE.BoxGeometry(.18, .07, .5).translate(0, .05, 0), cabG = new THREE.BoxGeometry(.13, .08, .2).translate(0, .12, -.05);
    this.boatHull = add(new THREE.InstancedMesh(hullG, flat('#ffffff'), boatN)); this.boatCab = add(new THREE.InstancedMesh(cabG, flat('#f4efe4'), boatN));
    const BC = ['#e05a5a', '#4a8fd6', '#f2c94c', '#3fae8f', '#8a6fd1', '#f4f4f4'];
    for (let i = 0; i < boatN; i++) { this.boats.push({ rad: 5 + r() * 6, a0: r() * 6.28, sp: (.04 + r() * .05) * (r() < .5 ? 1 : -1) }); this.boatHull.setColorAt(i, C.set(BC[i % BC.length])); }
    // районы → подписи на общем плане
    const dist = new Map(); for (const h of town) { const nm = h.district, d = dist.get(nm) || { name: nm, x: 0, z: 0, n: 0 }; d.x += h.x; d.z += h.z; d.n++; dist.set(nm, d); }
    this.districts = [...dist.values()].filter(d => d.n >= 25 && d.name !== 'Центр').map(d => ({ name: d.name, x: d.x / d.n, z: d.z / d.n, n: d.n }));
    this.N = N;
    if (this.treSeed != null) this.setTreasure(this.treSeed);
  }
  // клад: прячем у обычного дома между домами квартала; seed — от даты
  setTreasure(seed) {
    this.treSeed = seed; if (!this.houses.length) return;
    if (!this.chest) { this.chest = makeChest(); this.scene.add(this.chest); }
    let i = seed % this.houses.length; for (let k = 0; k < this.houses.length && (this.houses[i].recipe || this.houses[i].gone); k++) i = (i + 1) % this.houses.length;
    const h = this.houses[i], sx = (seed >>> 8) & 1 ? 1 : -1, lx = sx * ((h.w || .8) / 2 + .12), lz = -((h.dp || .7) / 2 + .28), ca = Math.cos(h.rot || 0), sa = Math.sin(h.rot || 0);
    const x = h.x + lx * ca + lz * sa, z = h.z - lx * sa + lz * ca;
    this.treasure = { x, z, y: this.gy(x, z) + .02, near: h };
    this.chest.position.set(x, this.treasure.y, z); this.chest.rotation.y = (seed % 628) / 100;
  }
  treasureDist() { return this.treasure ? Math.hypot(this.ctl.x - this.treasure.x, this.ctl.z - this.treasure.z) : Infinity; }
  // для роликов: показать только дома с номером ≤ n; свежие «вырастают» (pop — сколько домов растут одновременно)
  setGrowth(n = Infinity, pop = 40) {
    this.growN = n; const M = new THREE.Matrix4(), S = new THREE.Matrix4(), T1 = new THREE.Matrix4(), T2 = new THREE.Matrix4();
    const sc = h => { if (h.n > n) return 0; const u = Math.min(1, (n - h.n) / pop); return u >= 1 ? 1 : Math.max(0.001, 1 - Math.pow(1 - u, 3) * Math.cos(u * 6)); };
    for (const g of this.grow || []) { g.list.forEach((h, i) => { const s = sc(h); if (s === 1) { g.mesh.setMatrixAt(i, g.base[i]); return; }
      T1.makeTranslation(h.x, 0, h.z); S.makeScale(s || 1e-4, s || 1e-4, s || 1e-4); T2.makeTranslation(-h.x, 0, -h.z); M.multiplyMatrices(T1, S).multiply(T2).multiply(g.base[i]); g.mesh.setMatrixAt(i, M); }); g.mesh.instanceMatrix.needsUpdate = true; }
    for (const g of this.specialG || []) { const s = sc(g.userData.house); g.visible = s > 0; g.scale.setScalar(Math.max(s, 1e-4) * (g.userData.k || 1)); }
  }
  // «Неоновая улица, 45 · Пиксельный квартал»
  address(h) { if (h.guest) { const a = this.address(h.host); return { ...a, text: 'общий дом у ' + h.host.label + ' · ' + a.text }; } if (h.isEstate) return { street: 'Посёлок Усадеб', num: h.estate + 1, district: 'у озера', text: `Посёлок Усадеб, участок №${h.estate + 1}` };
    const rd = this.map.roads[h.ri] || { kind: 'street' }, name = rd.kind === 'street' ? ST_F[h.ri % ST_F.length] + ' улица' : rd.kind === 'ave' ? ST_M[h.ri % ST_M.length] + ' проспект' : ST_M[(h.ri * 7) % ST_M.length] + ' переулок';
    return { street: name, num: h.num, district: h.district || districtOf(h.x, h.z), text: `${name}, ${h.num}` }; }
  // соседи по улице слева/справа и дом напротив (через дорогу)
  neighbors(h) { if (h.guest) return this.neighbors(h.host); if (h.isEstate || h.lot == null) return []; const L = this.map.lots[h.lot], get = i => { const o = i >= 0 ? this.houses[i] : null; return o && !o.isEstate ? o : null; }, out = [];
    const a = get(L.prev), b = get(L.next), o = get(L.opp);
    if (a) out.push({ h: a, rel: 'слева' }); if (b) out.push({ h: b, rel: 'справа' }); if (o) out.push({ h: o, rel: 'напротив' }); return out; }
  focus(h, fly = true) { this.hi = h; this.hiT = this.T; if (h && fly) { this.ctl.tx = h.x; this.ctl.tz = h.z; this.ctl.td = 7; } }
  flyTo(x, z, d = 9) { this.ctl.tx = x; this.ctl.tz = z; this.ctl.td = d; }
  // ---- управление ----
  pan(dx, dy) { const c = this.ctl, k = c.d * .0022, s = Math.sin(c.az), co = Math.cos(c.az); c.tx -= (dx * co - dy * s * 1.3) * k; c.tz -= (-dx * s - dy * co * 1.3) * k; c.x = c.tx; c.z = c.tz; this.clamp(); }
  zoom(f) { this.ctl.td = Math.max(3, Math.min(190, this.ctl.td * f)); }
  rotate(da) { this.ctl.taz += da; }
  clamp() { const c = this.ctl, e = this.map.est, R = Math.max((this.Rm || 30) + 12, Math.hypot(e.x, e.z) + e.r + 6), d = Math.hypot(c.tx, c.tz); if (d > R) { c.tx *= R / d; c.tz *= R / d; } }
  pick(x, y) {
    this.ray.setFromCamera(new THREE.Vector2(x / this.W * 2 - 1, -(y / this.H) * 2 + 1), this.cam);
    if (this.chest && this.ray.intersectObject(this.chest, true).length) return { chest: true };
    if (this.honorG && this.ray.intersectObject(this.honorG, true).length) return { honor: true };
    { const pk = (this.landmarks || [])[1]; if (pk && this.ray.intersectObject(pk, true).length) { const hit = this.ray.intersectObject(pk, true).find(x => x.object.userData.park); return { park: hit ? hit.object.userData.park : 'park' }; } }
    { const mh = this.ray.intersectObjects((this.extras || []).filter(o => o.userData.miniPos), true); if (mh.length) return { mini: mh[0].object.userData.mini }; }
    if (this.chest && this.treasure && this.ctl.d < 14) { const p = this.project(this.treasure.x, this.treasure.y + .1, this.treasure.z); if (p && Math.hypot(p[0] - x, p[1] - y) < 26) return { chest: true }; }
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
  setWishes(list, open) { this.wishes = list || []; this.parkOpen = !!open; this._extrasDirty = true; }
  // аттракцион: полёт камеры над городом, в конце — к дому
  rideStart(target, onEnd) {
    const g = (x, a, z) => [x, this.gy(x, z) + a, z], pk = (this.landmarks || [])[1], s = pk ? pk.position : new THREE.Vector3(8, 0, 8), e = this.estateCenter;
    const P = [[s.x + .5, s.y + .6, s.z - .25], g(s.x + 3, 6, s.z - 6), g(-14, 6, 10), g(LAKE.x - 8, 4, LAKE.z - 14), g(LAKE.x + 6, 3, LAKE.z), g(-20, 14, 20), g(12, 10, -26)];
    if (e) P.push(g(e.x - 12, 8, e.z - 6), g(e.x - 2, 4, e.z + 4));
    if (target) P.push(g(target.x + 6, 6, target.z + 6), [target.x + 2.2, (target.y || 0) + 1.6, target.z + 2.6]);
    this.ride = { curve: new THREE.CatmullRomCurve3(P.map(q => new THREE.Vector3(...q))), t: 0, dur: 6 + P.length * 2.2, target, onEnd };
  }
  rideStop() { if (!this.ride) return; const r = this.ride; this.ride = null; this.camOverride = null; this.cam.fov = 42; this.cam.updateProjectionMatrix(); if (r.target) { this.ctl.tx = this.ctl.x = r.target.x; this.ctl.tz = this.ctl.z = r.target.z; this.ctl.td = this.ctl.d = 7; } r.onEnd && r.onEnd(); }
  setMini(seed, n, taken) { this.mini = { seed, n, taken: new Set(taken || []) }; this._extrasDirty = true; }
  setTitles(map) { this.titles = map || {}; this._extrasDirty = true; }
  houseTop(h) {
    if (h.isEstate && h.top) return h.top; // усадьба увеличена (fx.es) — титул/табличка/флаг над крышей, а не внутри
    const r = h.recipe; if (r && Array.isArray(r.parts) && r.parts.length) return Math.max(...r.parts.map(q => (q.p?.[1] || 0) + (q.s?.[1] || 0)));
    return (r && r.shape === 'skyscraper' ? 2 : 1) * (h.top || (h.floors || 2) * FH + .35);
  }
  buildExtras() {
    // размер дома в усадьбе (fx.es: 1 обычный, 2 большой, 3 огромный) — выбирает хозяин
    for (const g of this.specialG || []) { const h = g.userData.house; if (!h || !h.isEstate) continue; const k = ESTATE_K[(this.fxMap?.[h.key] || {}).es] || ESTATE_K[1];
      if (g.userData.k !== k) { g.scale.setScalar(k); g.userData.k = k; h.top = (g.userData.top || .6) * k; } }
    this._extrasDirty = false; if (!this.houses.length) return;
    for (const o of this.extras || []) { this.scene.remove(o); o.traverse(m => { m.geometry?.dispose?.(); if (m.material?.map) m.material.map.dispose(); }); } this.extras = [];
    const add = o => { this.scene.add(o); this.extras.push(o); return o; };
    if (this.honorData) {
      const d = this.honorData, G = new THREE.Group(), hl = (this.landmarks || [])[0], cx = hl ? hl.position.x : 8, cz = hl ? hl.position.z : 8;
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
      { const k = 1.9 / (Math.hypot(cx, cz) || 1), x = cx - cx * k, z = cz - cz * k; G.position.set(x, this.gy(x, z) + .02, z); G.rotation.y = Math.atan2(-cx, -cz); } G.scale.setScalar(.85); G.userData.honor = true; G.traverse(m => m.userData.honor = true); add(G); this.honorG = G;
    }
    // таблички, подсветка, украшения жителей (fx.json от бота)
    for (const [nick, fx] of Object.entries(this.fxMap || {})) {
      const h = this.byKey.get(nick); if (!h || h.gone) continue;
      const G = new THREE.Group(), fz = 1, top = this.houseTop(h), PL = k => { const v = (fx.p && fx.p[k]) || []; return [+v[0] || 0, +v[1] || 0, +v[2] || 1, +v[3] || 0]; }, OFF = new Set(fx.off || []);
      const place = (o, k) => { const [px, py, ps, pz] = PL(k); o.position.x += px; o.position.y += py; o.position.z += pz; o.scale.multiplyScalar(ps); return o; };
      if (fx.c) { const ring = new THREE.Mesh(new THREE.RingGeometry(.5, .6, 40), new THREE.MeshBasicMaterial({ color: fx.c, transparent: true, opacity: .9, toneMapped: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = .035; G.add(ring); }
      if (fx.s && !OFF.has('sign')) { const sg = textSprite('💬 ' + fx.s, { color: '#fff', bg: 'rgba(255,61,127,.9)', scale: .0016, size: 48 }); sg.position.y = top + .55; G.add(place(sg, 'sign')); }
      const d = new Set(fx.d || []), nowS = Date.now() / 1000; for (const o of fx.off || []) d.delete(o);
      if (fx.lent && fx.lent.u > nowS) d.delete(fx.lent.i);
      if (fx.bor && fx.bor.u > nowS) d.add(fx.bor.i);
      const RFS = fx.rf64 && fx.rf64.length === 4096 ? fx.rf64 : fx.rf;
      if (RFS && !OFF.has('roof') && (RFS.length === 64 || RFS.length === 225 || RFS.length === 4096)) { const PAL = FLAG_PAL, N = Math.round(Math.sqrt(RFS.length)), C = N > 15 ? 4 : 8, S = N * C;
        const tex = canvasTex(S, S, g => { for (let i = 0; i < N * N; i++) { const c = PAL[parseInt(RFS[i], 32)]; if (!c) continue; g.fillStyle = c; g.fillRect((i % N) * C, Math.floor(i / N) * C, C, C); } });
        tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
        const RF = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(.01, .01, .8, 6), flat('#d0d0e0')); pole.position.y = .4; RF.add(pole);
        const pan = new THREE.Mesh(new THREE.PlaneGeometry(.42, .42), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false }));
        pan.geometry.translate(.22, 0, 0); pan.position.y = .57; pan.userData.flagWave = true; RF.add(pan);
        RF.position.set(-.18, top - .05, fz * .12); G.add(place(RF, 'roof')); }
      if (d.has('rainbow')) { const RB = new THREE.Group(); ['#ff3d7f', '#ffd23f', '#a6ff8f', '#5ef2ff', '#c084fc'].forEach((c, i) => { const r = new THREE.Mesh(new THREE.RingGeometry(.62 + i * .05, .66 + i * .05, 40), new THREE.MeshBasicMaterial({ color: c, toneMapped: false, side: THREE.DoubleSide }));
        r.rotation.x = -Math.PI / 2; r.position.y = .03 + i * .002; RB.add(r); }); G.add(place(RB, 'rainbow')); }
      if (d.has('snowman')) { const S0 = new THREE.Group(), w = flat('#ffffff', '#cfe6ff', .25);
        [[.09, .09], [.065, .23], [.045, .33]].forEach(([r, y]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), w); b.position.y = y; S0.add(b); });
        const nose = new THREE.Mesh(new THREE.ConeGeometry(.012, .06, 8), flat('#ff7a1a')); nose.rotation.x = Math.PI / 2; nose.position.set(0, .33, .05); S0.add(nose);
        const hat = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .05, 10), flat('#14141c')); hat.position.y = .39; S0.add(hat);
        S0.position.set(-.42, 0, fz * .48); G.add(place(S0, 'snowman')); }
      if (d.has('xmas')) { const T0 = new THREE.Group(); [[.16, .2, .05], [.13, .17, .17], [.09, .14, .28]].forEach(([r, hh, y]) => { const c = new THREE.Mesh(new THREE.ConeGeometry(r, hh, 10), flat('#1f7a4a', '#0a3', .2)); c.position.y = y + hh / 2; T0.add(c); });
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(.035), flat('#ffd23f', '#ffd23f', 2)); star.position.y = .45; T0.add(star);
        const g = new THREE.BufferGeometry(), pts = [], cols = [], P = ['#ff3d7f', '#ffd23f', '#5ef2ff', '#a6ff8f'];
        for (let i = 0; i < 18; i++) { const a = i * 2.4, y = .08 + (i / 18) * .32, r = .15 * (1 - i / 22); pts.push(Math.cos(a) * r, y, Math.sin(a) * r); const c = new THREE.Color(P[i % 4]); cols.push(c.r, c.g, c.b); }
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        const lights = new THREE.Points(g, new THREE.PointsMaterial({ size: .06, map: GLOW_T, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); lights.userData.twinkle = true; lights.userData.bs = .06; T0.add(lights);
        T0.position.set(.42, 0, fz * .48); G.add(place(T0, 'xmas')); }
      if (d.has('ufo')) { const U = new THREE.Group(); const disc = new THREE.Mesh(new THREE.SphereGeometry(.22, 20, 8), flat('#9aa3b5', '#5ef2ff', .3)); disc.scale.y = .25; U.add(disc);
        const cab = new THREE.Mesh(new THREE.SphereGeometry(.09, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), flat('#8fd4ff', '#5ef2ff', .8)); cab.position.y = .03; U.add(cab);
        const beam = new THREE.Mesh(new THREE.ConeGeometry(.22, .7, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#a6ff8f', transparent: true, opacity: .18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        beam.position.y = -.37; U.add(beam); U.position.y = top + .9; place(U, 'ufo'); U.userData.ufo = U.position.y; G.add(U); }
      if (d.has('fireworks')) { const F0 = new THREE.Group(); F0.position.y = top + 1.2; F0.userData.fw = Math.random() * 3; { const [px, py, ps, pz] = PL('fireworks'); F0.position.x += px; F0.position.y += py; F0.position.z += pz; F0.userData.fwS = ps; } const g = new THREE.BufferGeometry(), pts = [], cols = [];
        for (let i = 0; i < 60; i++) { const v = new THREE.Vector3().randomDirection(); pts.push(v.x, v.y, v.z); const c = new THREE.Color(['#ff3d7f', '#ffd23f', '#5ef2ff', '#a6ff8f'][i % 4]); cols.push(c.r, c.g, c.b); }
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        F0.add(new THREE.Points(g, new THREE.PointsMaterial({ size: .12, map: GLOW_T, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))); G.add(F0); }
      if (d.has('balloons')) { const B0 = new THREE.Group(); [['#ff3d7f', -.08, .5], ['#ffd23f', .06, .58], ['#5ef2ff', .0, .66]].forEach(([c, x, y]) => {
          const b = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 10), flat(c, c, .5)); b.scale.y = 1.2; b.position.set(x, y, 0); B0.add(b);
          const st = new THREE.Mesh(new THREE.CylinderGeometry(.003, .003, y, 4), flat('#ffffff')); st.position.set(x / 2, y / 2, 0); B0.add(st); });
        B0.position.set(.3, top - .05, fz * .2); B0.userData.ufo = null; G.add(place(B0, 'balloons')); }
      if (d.has('cat')) { const C0 = new THREE.Group(), fur = flat('#f2a65a'); const bd = new THREE.Mesh(new THREE.SphereGeometry(.07, 10, 8), fur); bd.scale.set(1.3, .9, .9); bd.position.y = .06; C0.add(bd);
        const hd = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), fur); hd.position.set(.08, .12, 0); C0.add(hd);
        for (const z of [-.025, .025]) { const e = new THREE.Mesh(new THREE.ConeGeometry(.018, .04, 4), fur); e.position.set(.08, .17, z); C0.add(e); }
        const tl = new THREE.Mesh(new THREE.CylinderGeometry(.01, .01, .12, 5), fur); tl.position.set(-.1, .1, 0); tl.rotation.z = .6; C0.add(tl);
        C0.position.set(-.12, top - .04, fz * .05); C0.rotation.y = fz > 0 ? -Math.PI / 2 : Math.PI / 2; G.add(place(C0, 'cat')); }
      if (d.has('flag')) { const F0 = new THREE.Group(); const pl = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .5, 6), flat('#d0d0e0')); pl.position.y = .25; F0.add(pl);
        const cl = new THREE.Mesh(new THREE.PlaneGeometry(.22, .13), new THREE.MeshStandardMaterial({ color: '#ff3d7f', emissive: '#ff3d7f', emissiveIntensity: .4, side: THREE.DoubleSide })); cl.geometry.translate(.11, 0, 0); cl.position.y = .43; cl.userData.flagWave = true; F0.add(cl);
        F0.position.set(.18, top - .05, -fz * .12); G.add(place(F0, 'flag')); }
      if (d.has('lanterns')) { const L0 = new THREE.Group(); for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(.035, 10, 8), flat(i % 2 ? '#ff3b3b' : '#ffb347', i % 2 ? '#ff2020' : '#ff9a00', 1.6)); l.scale.y = 1.3; l.position.set(-.3 + i * .12, -Math.sin(i / 5 * Math.PI) * .05, 0); L0.add(l); }
        L0.position.set(0, Math.max(.3, top * .55), fz * .42); G.add(place(L0, 'lanterns')); }
      if (d.has('pool')) { const P0 = new THREE.Group(); const rimP = new THREE.Mesh(new THREE.BoxGeometry(.34, .04, .24), flat('#e8eef6')); rimP.position.y = .02; P0.add(rimP);
        const wP = new THREE.Mesh(new THREE.BoxGeometry(.3, .02, .2), flat('#3aa0ff', '#00b4ff', 1)); wP.position.y = .045; P0.add(wP); P0.position.set(.36, .03, fz * .42); G.add(place(P0, 'pool')); }
      if (d.has('crystal')) { const K0 = new THREE.Mesh(new THREE.OctahedronGeometry(.11), new THREE.MeshStandardMaterial({ color: '#c084fc', emissive: '#a855f7', emissiveIntensity: 1.3, metalness: .4, roughness: .2 }));
        K0.scale.y = 1.6; K0.position.set(0, top + .45, 0); K0.userData.spin = true; G.add(place(K0, 'crystal')); }
      if (d.has('rocket')) { const R0 = new THREE.Group(); const bd = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, .36, 12), flat('#e8eef6')); bd.position.y = .22; R0.add(bd);
        const ns = new THREE.Mesh(new THREE.ConeGeometry(.06, .14, 12), flat('#ff3d7f', '#ff3d7f', .5)); ns.position.y = .47; R0.add(ns);
        for (let i = 0; i < 3; i++) { const fn = new THREE.Mesh(new THREE.BoxGeometry(.01, .1, .07), flat('#ff3d7f')); const a = i / 3 * Math.PI * 2; fn.position.set(Math.cos(a) * .06, .08, Math.sin(a) * .06); fn.rotation.y = -a; R0.add(fn); }
        const fl = new THREE.Mesh(new THREE.ConeGeometry(.04, .1, 8), flat('#ffb347', '#ff7a00', 2)); fl.rotation.x = Math.PI; fl.position.y = .0; fl.userData.pulse = true; R0.add(fl);
        R0.position.set(-.46, .04, fz * .3); G.add(place(R0, 'rocket')); }
      if (d.has('halo')) { const H0 = new THREE.Group(); const ring = new THREE.Mesh(new THREE.TorusGeometry(.32, .015, 6, 40), flat('#ffd23f', '#ffd23f', 1.8)); ring.rotation.x = Math.PI / 2; H0.add(ring);
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, st = new THREE.Mesh(new THREE.OctahedronGeometry(.03), flat('#ffffff', '#fff3b0', 2)); st.position.set(Math.cos(a) * .32, 0, Math.sin(a) * .32); H0.add(st); }
        H0.position.y = top + .3; H0.userData.orbit = true; G.add(place(H0, 'halo')); }
      if (d.has('ghost')) { const Gh = new THREE.Group(), wm = new THREE.MeshStandardMaterial({ color: '#f4f4ff', emissive: '#b8c6ff', emissiveIntensity: .6, transparent: true, opacity: .85 });
        const hd = new THREE.Mesh(new THREE.SphereGeometry(.08, 12, 10), wm); hd.position.y = .1; Gh.add(hd); const bd = new THREE.Mesh(new THREE.ConeGeometry(.08, .16, 12, 1, true), wm); bd.rotation.x = Math.PI; bd.position.y = .02; Gh.add(bd);
        for (const x of [-.025, .025]) { const e = new THREE.Mesh(new THREE.SphereGeometry(.012, 6, 6), flat('#1a1238')); e.position.set(x, .12, .07); Gh.add(e); }
        Gh.position.set(.42, .5, fz * .2); place(Gh, 'ghost'); Gh.userData.ghost = Gh.position.y; G.add(Gh); }
      if (d.has('flowers')) { const Fl = new THREE.Group(); const bed = new THREE.Mesh(new THREE.BoxGeometry(.5, .04, .1), flat('#5a3a22')); bed.position.y = .02; Fl.add(bed);
        for (let i = 0; i < 9; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(.025, 8, 6), flat(['#ff3d7f', '#ffd23f', '#c084fc', '#ffffff'][i % 4], ['#ff3d7f', '#ffd23f', '#c084fc', '#ffffff'][i % 4], .4)); f.position.set(-.22 + i * .055, .07, (i % 2 ? .02 : -.02)); Fl.add(f); }
        Fl.position.set(0, .03, fz * .58); G.add(place(Fl, 'flowers')); }
      if (fx.top) { const B = new THREE.Mesh(new THREE.CylinderGeometry(.12, .7, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: .06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        B.position.y = 7; B.userData.beam = true; G.add(B); }
      if (!G.children.length) continue;
      G.position.set(h.x, h.y || 0, h.z); G.rotation.y = h.rot || 0; add(G);
    }
    const allT = { ...this.titles }; for (const [nk, f] of Object.entries(this.fxMap || {})) if (f.tt && !allT[nk]) allT[nk] = { t: f.tt };
    for (const [nk, f] of Object.entries(this.fxMap || {})) if (f.mc) allT[nk] = { ...(allT[nk] || {}), mc: 1 };
    const pk = (this.landmarks || [])[1];
    if (pk && this.wishes && this.wishes.length && this.parkOpen) this.wishes.slice(0, 4).forEach((w, i) => { const sg = textSprite('⭐ ' + w.text, { color: '#fff', bg: 'rgba(94,242,255,.35)', scale: .0011, size: 44 });
      sg.position.set(pk.position.x + .42 + Math.sin(i * 2.1) * .5, pk.position.y + 1.0 + i * .28, pk.position.z + .42 + Math.cos(i * 2.1) * .3); add(sg); });
    for (const [nick, T] of Object.entries(allT)) { const h = this.byKey.get(nick); if (!h || h.gone || !T || !(T.t || T.mc)) continue;
      const sg = T.t ? textSprite((T.mc ? '💎 ' : '🏅 ') + T.t, { color: '#1a1238', bg: T.mc ? 'rgba(126,232,255,.95)' : 'rgba(255,210,63,.95)', scale: .0015, size: 48 })
        : textSprite('💎 Меценат', { color: '#1a1238', bg: 'rgba(126,232,255,.95)', scale: .0015, size: 48 }); sg.position.set(h.x, (h.y || 0) + this.houseTop(h) + (this.fxMap?.[nick]?.s ? 1.0 : .62), h.z); add(sg); }
    if (this.mini) { const { seed, n, taken } = this.mini, base = this.houses.filter(h => !h.recipe && !h.gone && !h.isEstate);
      for (let i = 0; i < n && base.length; i++) { if (taken.has(i)) continue; const r0 = rnd(seed ^ Math.imul(i + 1, 2654435761)), h = base[Math.floor(r0() * base.length)];
        const C = makeChest(); C.scale.setScalar(.75); { const lx = (r0() < .5 ? -1 : 1) * (h.w / 2 + .12), lz = r0() < .5 ? -(h.dp / 2 + .3) : 0, ca = Math.cos(h.rot), sa = Math.sin(h.rot), x = h.x + lx * ca + lz * sa, z = h.z - lx * sa + lz * ca; C.position.set(x, this.gy(x, z) + .02, z); } C.rotation.y = r0() * 6;
        C.traverse(m => { m.userData.mini = i; if (m.material && m.material.color && m.material.metalness > .5) { m.material = m.material.clone(); m.material.color.set('#9fd8ff'); m.material.emissive.set('#3aa0ff'); } });
        C.userData.miniPos = [C.position.x, C.position.z]; add(C); } }
    { const seen = new Set();
      for (const [nick, fx] of Object.entries(this.fxMap || {})) for (const fr of fx.f || []) {
        const key = [nick, fr].sort().join('|'); if (seen.has(key)) continue; seen.add(key);
        const a = this.byKey.get(nick), b = this.byKey.get(fr); if (!a || !b || a.gone || b.gone) continue;
        const dist = Math.hypot(a.x - b.x, a.z - b.z); if (dist > 60) continue;
        const ta = (a.y || 0) + this.houseTop(a) + .1, tb = (b.y || 0) + this.houseTop(b) + .1, mid = new THREE.Vector3((a.x + b.x) / 2, Math.max(ta, tb) + Math.min(6, dist * .35), (a.z + b.z) / 2);
        const cv = new THREE.QuadraticBezierCurve3(new THREE.Vector3(a.x, ta, a.z), mid, new THREE.Vector3(b.x, tb, b.z));
        const tube = new THREE.Mesh(new THREE.TubeGeometry(cv, 40, .02, 5, false), new THREE.MeshBasicMaterial({ color: '#ff8fd0', transparent: true, opacity: .85, toneMapped: false }));
        add(tube);
        const hrt = textSprite('💗', { bg: 'rgba(0,0,0,0)', scale: .004, size: 64 }); hrt.position.copy(cv.getPoint(.5)); add(hrt); } }
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
      { const lx = .28, lz = h.isEstate ? 1.15 : (h.dp || .7) / 2 + .2, ca = Math.cos(h.rot || 0), sa = Math.sin(h.rot || 0), x = h.x + lx * ca + lz * sa, z = h.z - lx * sa + lz * ca; G.position.set(x, this.gy(x, z) + .02, z); G.rotation.y = h.rot || 0; } G.scale.setScalar(1.15);
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
    this.hemi.color.copy(C('#7f8fd0', '#e4f2ff')).lerp(new THREE.Color('#ffb48a'), dusk * .5); this.hemi.groundColor.copy(C('#1c2140', '#8d9f78')); this.hemi.intensity = .6 + t * .45;
    this.moon.color.copy(C('#9fb2ff', '#fff0d4')).lerp(new THREE.Color('#ff9a5c'), dusk * .6); this.moon.intensity = .55 + t * 2.15;
    this.sunDir.set(-35 + (1 - t) * 10, 75, 30 - (1 - t) * 40).normalize();
    this.scene.environmentIntensity = .15 + t * .85;
    if (this.starsP) { this.starsP.material.opacity = Math.max(0, 1 - t * 2.2); this.starsP.visible = t < .45; this.moonS.material.opacity = Math.max(0, 1 - t * 2); this.moonS.visible = t < .5;
      this.sunS.material.opacity = t; this.sunS.visible = t > .05; for (const cl of this.clouds) cl.children.forEach(m => { m.material.opacity = (this.weather === 'clear' ? .7 : .92) * (.25 + t * .75); m.material.color.set(t > .4 ? (this.weather === 'clear' ? '#ffffff' : '#c7ccd6') : '#4a4478'); }); }
    const fogDay = this.weather === 'fog' ? '#c9d2dc' : this.weather === 'rain' ? '#9aa8b8' : this.weather === 'snow' ? '#d5e1ee' : '#dcebf5';
    this.scene.fog.color.copy(C('#161c38', fogDay)).lerp(new THREE.Color('#ff9f7a'), dusk * .35);
    this.fogK = this.weather === 'fog' ? .35 : this.weather === 'rain' ? .6 : this.weather === 'snow' ? .7 : 1;
    this.sky.visible = t > .01; this.sky.material.opacity = t; this.sky.material.color.copy(new THREE.Color('#ffffff').lerp(new THREE.Color(this.weather === 'clear' ? '#ffffff' : '#b8c2cc'), .8)).lerp(new THREE.Color('#ffc09a'), dusk * .7);
    this.ground.material.color.copy(C('#56618a', '#ffffff')); this.ground.material.emissive.set('#ffffff'); this.ground.material.emissiveIntensity = this.snowCover * (.15 + t * .35);
    this.water.material.color.copy(C('#24406e', '#4fb0d6'));
    this.renderer.toneMappingExposure = 1.0 + t * .12; this.bloomPass.strength = .5 * (1 - t); this.bloomOn = t < .6;
    if (this.lampGlow) this.lampGlow.material.opacity = Math.max(0, 1 - t * 1.4); if (this.headPts) this.headPts.material.opacity = 1 - t * .8;
    const k = 1 - t * .72; // неон и вывески днём тусклее; окна домов — только ночью
    this.scene.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) { if (m.emissiveIntensity == null || m === this.sky.material || m === this.ground.material) continue;
      if (m.userData.night) { m.emissiveIntensity = m.userData.night * Math.pow(1 - t, 1.5); continue; }
      if (m.userData.ei0 == null) m.userData.ei0 = m.emissiveIntensity; m.emissiveIntensity = m.userData.ei0 * k; } });
  }
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
    this.wx.position.set(0, this.ctl.y || 0, 0);
    for (let i = 0; i < this.wxN; i++) { const s = this.wxSeed[i], j = rain ? i * 6 : i * 3; let x = a[j], y = a[j + 1], z = a[j + 2];
      y -= dt * (rain ? 16 + s * 6 : .9 + s * .7); if (!rain) { x += Math.sin(T * .8 + s * 40) * dt * .35; z += Math.cos(T * .6 + s * 30) * dt * .25; }
      if (y < 0) { y = 20 + s * 2; x = cx + (Math.random() - .5) * 50; z = cz + (Math.random() - .5) * 50; }
      if (x < cx - 25) x += 50; else if (x > cx + 25) x -= 50; if (z < cz - 25) z += 50; else if (z > cz + 25) z -= 50;
      a[j] = x; a[j + 1] = y; a[j + 2] = z; if (rain) { a[j + 3] = x + .03; a[j + 4] = y + .45; a[j + 5] = z; } }
    this.wx.geometry.attributes.position.needsUpdate = true;
  }
  // ---- кадр ----
  frame(dt) {
    if (this._extrasDirty) { this.buildExtras(); this.setupShadows(); }
    if (this.ride) { const r = this.ride; r.t += dt / r.dur; if (r.t >= 1) this.rideStop(); else { const u = r.t * r.t * (3 - 2 * r.t), a = r.curve.getPointAt(u), b = r.curve.getPointAt(Math.min(1, u + .02)); this.camOverride = { p: [a.x, a.y, a.z], t: [b.x, b.y - .3, b.z], fov: 55 }; } } if (this._dayDirty) this.applyDay(); this.tickWeather(dt);
    if (this.shadows) { this.moon.target.position.set(this.ctl.x, this.ctl.y, this.ctl.z); this.moon.position.copy(this.moon.target.position).addScaledVector(this.sunDir, 90);
      const sz = Math.min(40, Math.max(10, this.ctl.d * .8)); const sc = this.moon.shadow.camera; if (Math.abs(sc.right - sz) > .5) { Object.assign(sc, { left: -sz, right: sz, top: sz, bottom: -sz }); sc.updateProjectionMatrix(); } }
    if (this.clouds) for (const cl of this.clouds) { cl.position.x += dt * cl.userData.v; if (cl.position.x > 260) cl.position.x = -260; }
    this.T += dt; const T = this.T, c = this.ctl, k = 1 - Math.pow(.002, dt);
    c.x += (c.tx - c.x) * k; c.z += (c.tz - c.z) * k; c.d += (c.td - c.d) * k; c.az += (c.taz - c.az) * k; c.y += (this.gy(c.x, c.z) - c.y) * Math.min(1, k * 1.5);
    const pol = 1.12 - Math.min(1, c.d / 110) * .45; // угол от вертикали: ближе — ниже камера
    if (this.camOverride) { const o = this.camOverride; this.cam.position.set(...o.p); this.cam.lookAt(...o.t); if (o.fov && this.cam.fov !== o.fov) { this.cam.fov = o.fov; this.cam.updateProjectionMatrix(); } }
    else { this.cam.position.set(c.x + Math.sin(c.az) * Math.sin(pol) * c.d, c.y + Math.cos(pol) * c.d + .3, c.z + Math.cos(c.az) * Math.sin(pol) * c.d);
      const cg = this.gy(this.cam.position.x, this.cam.position.z) + .6; if (this.cam.position.y < cg) this.cam.position.y = cg; this.cam.lookAt(c.x, c.y + .4, c.z); }
    { const fk = this.fogK || 1; this.scene.fog.near = (c.d * 1.6 + 40) * fk; this.scene.fog.far = (c.d * 4.5 + 150) * fk; }
    for (const lm of this.landmarks || []) lm.children.forEach(ch => { if (ch.userData.label) ch.visible = c.d > 6 && !this.noLmLabels; });
    if (!this.headG) { this.renderer.render(this.scene, this.cam); return; }
    // машины ездят по улице туда-обратно, люди гуляют по тротуарам, лодки кружат по озеру
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3(), Yx = new THREE.Vector3(0, 1, 0), hp = this.headG.attributes.position.array, A = this._a || (this._a = {}), Tr = this.ter;
    this.cars.forEach((o, i) => { const Lr = o.L, u = ((o.s0 + o.sp * T) % (2 * Lr)), fw = u < Lr, s = fw ? u : 2 * Lr - u;
      alongRoad(Tr, o.rd, s, fw ? -.17 : .17, A); const hd = A.a + (fw ? 0 : Math.PI), fx = Math.sin(hd) * .22, fz = Math.cos(hd) * .22; Q.setFromAxisAngle(Yx, hd);
      M.compose(P.set(A.x, A.y + .11, A.z), Q, S1); this.carBody.setMatrixAt(i, M); M.compose(P.set(A.x - fx * .1, A.y + .2, A.z - fz * .1), Q, S1); this.carTop.setMatrixAt(i, M);
      hp.set([A.x + fx, A.y + .13, A.z + fz, A.x - fx, A.y + .13, A.z - fz], i * 6); });
    if (this.cars.length) { this.carBody.instanceMatrix.needsUpdate = this.carTop.instanceMatrix.needsUpdate = true; this.headG.attributes.position.needsUpdate = true; }
    this.boats.forEach((b, i) => { const a = b.a0 + b.sp * T, sg = Math.sign(b.sp), x = LAKE.x + Math.cos(a) * b.rad * 1.15, z = LAKE.z + Math.sin(a) * b.rad;
      Q.setFromAxisAngle(Yx, Math.atan2(-Math.sin(a) * 1.15 * sg, Math.cos(a) * sg)); M.compose(P.set(x, WATER_Y + Math.sin(T * 2 + i) * .012, z), Q, S1); this.boatHull.setMatrixAt(i, M); this.boatCab.setMatrixAt(i, M); });
    this.boatHull.instanceMatrix.needsUpdate = this.boatCab.instanceMatrix.needsUpdate = true;
    this.ppl.forEach((o, i) => { const Lr = o.L, u = (o.s0 + o.sp * T) % (2 * Lr), s = u < Lr ? u : 2 * Lr - u; alongRoad(Tr, o.rd, s, o.side * (o.rd.w / 2 + .14), A);
      const b = Math.abs(Math.sin(T * 8 * o.sp + o.ph)) * .02; M.makeTranslation(A.x, A.y + .05 + b, A.z); this.pBody.setMatrixAt(i, M); this.pHead.setMatrixAt(i, M); o.x = A.x; o.z = A.z; o.y = A.y + .05 + b; });
    if (this.ppl.length) this.pBody.instanceMatrix.needsUpdate = this.pHead.instanceMatrix.needsUpdate = true;
    // анимации
    this.scene.traverse(o => { if (o.userData.blink) o.visible = Math.sin(T * 4) > 0; if (o.userData.spin) o.rotation.y = T * .2; if (o.userData.twinkle) o.material.size = (o.userData.bs || .09) * (1 + Math.sin(T * 5 + (o.userData.ph || 0)) * .22); if (o.userData.pet) o.position.y = Math.abs(Math.sin(T * 6)) * .03; if (o.userData.wave) o.rotation.z = Math.PI - .4 + Math.sin(T * 5) * .45;
      if (o.userData.ufo) { o.position.y = o.userData.ufo + Math.sin(T * 1.6) * .08; o.rotation.y = T * 1.2; }
      if (o.userData.fw != null) { const ph = ((T + o.userData.fw) % 2.6) / 2.6; o.scale.setScalar((.05 + ph * .7) * (o.userData.fwS || 1)); o.children[0].material.opacity = ph < .75 ? 1 : (1 - ph) * 4; }
      if (o.userData.beam) o.material.opacity = .05 + Math.sin(T * 2) * .025;
      if (o.userData.wheelSpin) { o.rotation.z = T * .25; o.children.forEach(c => { if (c.userData.cab) c.rotation.z = -T * .25; }); }
      if (o.userData.cart) { const q = o.userData.cart.getPointAt((T * .12) % 1), q2 = o.userData.cart.getPointAt((T * .12 + .01) % 1); o.position.copy(q); o.lookAt(q2.x + o.parent.position.x, q2.y + o.parent.position.y, q2.z + o.parent.position.z); }
      if (o.userData.pulse) o.scale.setScalar(1 + Math.sin(T * 4) * .25);
      if (o.userData.ghost != null) { o.position.y = o.userData.ghost + Math.sin(T * 2.2) * .07; o.rotation.y = Math.sin(T) * .6; }
      if (o.userData.flagWave) o.rotation.y = Math.sin(T * 3) * .35;
      if (o.userData.orbit) o.rotation.y = T * 1.4; });
    if (this.chest) { const ch = this.chest, near = Math.max(0, 1 - this.treasureDist() / 7) * (c.d < 18 ? 1 : 0);
      ch.position.y = (this.treasure ? this.treasure.y : 0) + Math.abs(Math.sin(T * 2.2)) * .04; ch.userData.glow.material.opacity = near * (.55 + Math.sin(T * 3) * .25); ch.userData.spark.visible = near > .05; ch.userData.spark.rotation.y = T * 1.5; }
    if (this.bloom && this.bloomOn) this.composer.render(); else this.renderer.render(this.scene, this.cam);
    this.drawLabels();
    // авто-качество
    this.fpsT += dt; this.fpsN++; if (this.fpsT > 3) { if (this.fpsN / this.fpsT < 28 && this.shadows) { this.shadows = false; this.moon.castShadow = false; this.renderer.shadowMap.enabled = false; this.scene.traverse(m => { if (m.material) [].concat(m.material).forEach(x => x.needsUpdate = true); }); }
      else if (this.fpsN / this.fpsT < 28 && this.bloom) { this.bloom = false; } this.fpsT = 0; this.fpsN = 0; }
  }
  project(x, y, z) { this.v.set(x, y, z).project(this.cam); return this.v.z > 1 ? null : [(this.v.x + 1) / 2 * this.W, (1 - this.v.y) / 2 * this.H]; }
  // надписи: 'all' — все, 'nicks' — только ники, 'none' — без надписей (идея из думы)
  setLabels(m) { this.labelMode = m; if (m === 'all') this.cam.layers.enable(1); else this.cam.layers.disable(1); }
  drawLabels() {
    const g = this.lg, c = this.ctl; g.clearRect(0, 0, this.W, this.H);
    const pill = (x, y, text, big, gold) => {
      g.font = `${big ? 800 : 600} ${big ? 15 : 12}px ${big ? 'Unbounded' : 'Inter'}, sans-serif`;
      const w = g.measureText(text).width + (big ? 22 : 14), h = big ? 28 : 22;
      g.fillStyle = gold ? '#ffc83d' : 'rgba(255,255,255,.94)'; g.shadowColor = 'rgba(29,43,68,.25)'; g.shadowBlur = 6; g.beginPath(); g.roundRect(x - w / 2, y - h - 6, w, h, h / 2); g.fill();
      g.beginPath(); g.moveTo(x - 5, y - 7); g.lineTo(x + 5, y - 7); g.lineTo(x, y); g.fill(); g.shadowBlur = 0;
      g.fillStyle = '#1d2b44'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y - 6 - h / 2 + 1);
    };
    // названия районов — когда смотрим на город сверху
    const lm = this.labelMode;
    if (c.d > 24 && this.districts && !this.noLmLabels && lm === 'all') {
      const a = Math.min(1, (c.d - 24) / 10); g.textAlign = 'center'; g.textBaseline = 'middle';
      const used = [];
      for (const d of [...this.districts].sort((u, v) => v.n - u.n)) { const p = this.project(d.x, this.gy(d.x, d.z) + 1.2, d.z); if (!p || p[0] < -80 || p[0] > this.W + 80 || p[1] < 0 || p[1] > this.H) continue;
        if (used.some(q => Math.abs(q[0] - p[0]) < 190 && Math.abs(q[1] - p[1]) < 30)) continue; used.push(p);
        const big = d.name === 'Центр'; g.font = `800 ${big ? 17 : 14}px Unbounded, sans-serif`; g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = this.dayT > .4 ? `rgba(255,255,255,${.9 * a})` : `rgba(12,16,40,${.85 * a})`;
        const t = d.name.toUpperCase(); g.strokeText(t, p[0], p[1]); g.fillStyle = this.dayT > .4 ? (big ? `rgba(194,124,0,${a})` : `rgba(29,43,68,${.9 * a})`) : (big ? `rgba(255,210,63,${a})` : `rgba(230,236,255,${.95 * a})`); g.fillText(t, p[0], p[1]); }
    }
    // названия мест (парки, площади, памятники) — на среднем плане
    if (c.d > 5 && c.d < 40 && this.places && !this.noLmLabels && lm === 'all') {
      const R = c.d * 1.1, used = []; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 12px Inter, sans-serif';
      const ICON = { park: '🌳', square: '⭐', fountain: '⛲', playground: '🎠', art: '💗', monument: '🗿', estate: '🏡' };
      for (const pl of this.places) { if (Math.hypot(pl.x - c.x, pl.z - c.z) > R) continue; const p = this.project(pl.x, (pl.y || 0) + 1.1, pl.z); if (!p) continue;
        if (used.some(q => Math.abs(q[0] - p[0]) < 150 && Math.abs(q[1] - p[1]) < 26)) continue; used.push(p);
        const t = `${ICON[pl.kind] || '📍'} ${pl.name}`, w = g.measureText(t).width + 16;
        g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.roundRect(p[0] - w / 2, p[1] - 11, w, 22, 11); g.fill(); g.fillStyle = '#2e7d4a'; g.fillText(t, p[0], p[1] + 1); }
    }
    if (c.d < 22 && !this.hideNicks && lm !== 'none') {
      const R = c.d * .7, cand = [];
      for (const h of this.houses) { if (h === this.hi || h.guest || h.n > (this.growN ?? Infinity)) continue; const dd = Math.hypot(h.x - c.x, h.z - c.z); if (dd < R) cand.push([dd, h]); }
      cand.sort((a, b) => a[0] - b[0]);
      const placed = [];
      for (const [, h] of cand.slice(0, 40)) { const p = this.project(h.x, (h.y || 0) + h.top + .05, h.z); if (!p) continue; if (placed.some(q => Math.abs(q[0] - p[0]) < 70 && Math.abs(q[1] - p[1]) < 24)) continue; placed.push(p); pill(p[0], p[1], h.residents ? `${h.label} 🏘+${h.residents.length}` : h.label, false, false); }
      if (c.d < 9) for (const o of this.ppl) { if (Math.hypot(o.x - c.x, o.z - c.z) > 3 || !o.nick) continue; const p = this.project(o.x, o.y + .3, o.z); if (p) pill(p[0], p[1], o.nick, false, false); }
    }
    if (this.hi) { const h = this.hi, p = this.project(h.x, (h.y || 0) + h.top + .05, h.z); if (p) { pill(p[0], p[1] - 4 - Math.abs(Math.sin(this.T * 4)) * 6, h.label, true, true);
      const q = this.project(h.x, (h.y || 0) + .07, h.z); if (q) { const t = (this.T - this.hiT) % 1.2; g.strokeStyle = `rgba(255,210,63,${.7 - t / 2})`; g.lineWidth = 3; g.beginPath(); g.ellipse(q[0], q[1], 20 + t * 40, (20 + t * 40) * .5, 0, 0, 7); g.stroke(); } } }
  }
}

// ---------- превью одного дома (конструктор) ----------
export class HousePreview {
  constructor(canvas) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); this.r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); this.r.setSize(canvas.clientWidth || 200, canvas.clientHeight || 200, false);
    this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.s = new THREE.Scene(); this.s.add(new THREE.HemisphereLight('#8f7bff', '#1a1035', 1.1)); const d = new THREE.DirectionalLight('#9fb4ff', 1); d.position.set(-3, 5, 2); this.s.add(d);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(1.5, .06, 1.5), new THREE.MeshStandardMaterial({ color: '#1d3b3a' })); pad.position.y = -.03; this.s.add(pad);
    this.c = new THREE.PerspectiveCamera(35, 1, .1, 50); this.c.layers.enable(1); this.g = null; this.alive = true;
    const loop = (t) => { if (!this.alive || !canvas.isConnected) { this.r.dispose(); return; } if (this.g) this.g.rotation.y = t / 2400; this.r.render(this.s, this.c); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  }
  set(rec) { if (this.g) this.s.remove(this.g); this.g = makeHouse(rec); this.s.add(this.g); const h = Math.max(1.2, this.g.userData.top + .3); this.c.position.set(2.2, h * .8 + .6, 2.2 + h * .25); this.c.lookAt(0, h * .38, 0); }
}
