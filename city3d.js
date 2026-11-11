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
export const CELLS = [];
for (let x = -90; x <= 90; x++) for (let y = -90; y <= 90; y++) if (!isRoad(x, y) && !RES.has(blockOf(x, y).join(','))) CELLS.push([x, y]);
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
export const DECOR = ['garland', 'tree', 'car', 'pet'];
const EMOJI = { sun: '☀️', moon: '🌙', star: '⭐', heart: '❤️', clock: '🕐', crown: '👑', flame: '🔥', leaf: '🍃', lightning: '⚡', diamond: '💎', snake: '🐍' };

const FOOT = 0.72, FH = 0.3;

// ---------- текстуры ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// 2 окна × 2 этажа; один тёмный — чтобы окна не горели «стеной»
const winRects = (g, s, fill, dark) => { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i === 1 && j === 0) ? dark : fill; g.fillRect(i * s / 2 + s * .12, j * s / 2 + s * .12, s * .26, s * .27); } };
const WALL_T = canvasTex(128, 128, (g, s) => { g.fillStyle = '#fff'; g.fillRect(0, 0, s, s); winRects(g, s, '#2a2f55', '#2a2f55'); });
const EMIS_T = canvasTex(128, 128, (g, s) => { g.fillStyle = '#000'; g.fillRect(0, 0, s, s); winRects(g, s, '#fff', '#0b0b14'); });
[WALL_T, EMIS_T].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
const GLOW_T = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
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
export function makeHouse(rec, nick = '') {
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

// ---------- здания-рубежи ----------
function makeLandmark(type, locked, title) {
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
    S.add(new THREE.HemisphereLight('#b3a6ff', '#2a1d55', 1.7));
    const moon = new THREE.DirectionalLight('#b8c6ff', 1.5); moon.position.set(-30, 50, 20); S.add(moon);
    this.ctl = { tx: 2, tz: 2, x: 2, z: 2, d: 26, td: 26, az: Math.PI / 4, taz: Math.PI / 4, pol: .95 };
    this.houses = []; this.byKey = new Map(); this.dyn = []; this.T = 0; this.hi = null; this.bloom = !/[?&]lq=1/.test(location.search);
    this.composer = new EffectComposer(R); this.composer.addPass(new RenderPass(S, this.cam));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), .5, .5, .86); this.composer.addPass(this.bloomPass); this.composer.addPass(new OutputPass());
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
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#141832', roughness: 1 })); ground.rotation.x = -Math.PI / 2; S.add(ground);
    // звёзды
    const sp = [], r = rnd(9); for (let i = 0; i < 900; i++) { const a = r() * Math.PI * 2, e = .15 + r() * 1.2, R = 300; sp.push(Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R * .6 + 20, Math.sin(a) * Math.cos(e) * R); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    S.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.4, sizeAttenuation: false, fog: false })));
  }
  // list: [{nick, key, label, recipe, n}] в порядке заселения
  setCity(list, milestones = [], hallInfo = null) {
    for (const o of this.dyn) { this.scene.remove(o); o.traverse?.(m => { m.geometry?.dispose?.(); }); } this.dyn = [];
    const add = o => { this.scene.add(o); this.dyn.push(o); return o; };
    const N = Math.min(list.length, CELLS.length - 20), r = rnd(7);
    this.houses = list.slice(0, N).map((it, i) => ({ ...it, n: i + 1, x: CELLS[i][0] + .5, z: CELLS[i][1] + .5 }));
    this.byKey = new Map(this.houses.map(h => [h.key, h]));
    const span = Math.ceil(Math.sqrt((N + 60) * 2.25 / Math.PI) / 3) + 4; this.span = span;
    // кварталы-газоны и тротуары
    const blocks = new Set(); for (const h of this.houses) blocks.add(blockOf(Math.floor(h.x), Math.floor(h.z)).join(','));
    for (const b of LANDMARK_BLOCKS) blocks.add(b.join(','));
    const bl = [...blocks].map(s => s.split(',').map(Number));
    const side = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, .04, 2.3), new THREE.MeshStandardMaterial({ color: '#2c3155', roughness: .9 }), bl.length);
    const grass = new THREE.InstancedMesh(new THREE.BoxGeometry(2, .06, 2), new THREE.MeshStandardMaterial({ color: '#1d3b3a', roughness: 1 }), bl.length);
    const M = new THREE.Matrix4();
    bl.forEach(([bx, by], i) => { const [cx, cz] = blockCenter([bx, by]); M.makeTranslation(cx, .02, cz); side.setMatrixAt(i, M); M.makeTranslation(cx, .03, cz); grass.setMatrixAt(i, M); });
    add(side); add(grass);
    // разметка
    const dashes = []; for (let k = -span; k <= span; k++) for (let t = -span * 3; t <= span * 3; t += 1) { if (Math.abs(t % 3) === 0) continue; dashes.push([k * 3, t + .5, 0], [t + .5, k * 3, 1]); }
    const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(.04, .01, .3), new THREE.MeshStandardMaterial({ color: '#d9cf86', emissive: '#7a6f20', emissiveIntensity: .6 }), dashes.length);
    dashes.forEach(([a, b, rot], i) => { if (!rot) { M.makeRotationY(0); M.setPosition(a, .012, b); } else { M.makeRotationY(Math.PI / 2); M.setPosition(a, .012, b); } dm.setMatrixAt(i, M); });
    add(dm);
    // обычные дома: инстансы по этажности
    const regular = this.houses.filter(h => !h.recipe), special = this.houses.filter(h => h.recipe);
    this.pickables = [];
    const groups = new Map();
    for (const h of regular) { const rr = rnd(hash(h.key)); h.floors = rr() < .18 ? 3 + Math.floor(rr() * 2) : 1 + Math.floor(rr() * 2); h.wall = WALLS[(rr() * WALLS.length) | 0]; h.roof = ROOFS[(rr() * ROOFS.length) | 0]; h.rot = (rr() * 4 | 0) * Math.PI / 2; h.top = h.floors * FH + .34; if (!groups.has(h.floors)) groups.set(h.floors, []); groups.get(h.floors).push(h); }
    const C = new THREE.Color(), roofM = new THREE.InstancedMesh(roofGeo(), flat('#ffffff'), regular.length);
    let ri = 0;
    for (const [f, arr] of groups) {
      const im = new THREE.InstancedMesh(bodyGeo(f), bodyMat('warm'), arr.length);
      arr.forEach((h, i) => { M.makeRotationY(h.rot); M.setPosition(h.x, .06, h.z); im.setMatrixAt(i, M); im.setColorAt(i, C.set(h.wall));
        M.makeRotationY(0); M.setPosition(h.x, .06 + f * FH, h.z); roofM.setMatrixAt(ri, M); roofM.setColorAt(ri, C.set(h.roof)); ri++; });
      im.userData.list = arr; this.pickables.push(im); add(im);
    }
    add(roofM);
    // тени под домами
    const sh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.15, 1.15), new THREE.MeshBasicMaterial({ map: SHADOW_T, transparent: true, depthWrite: false }), this.houses.length);
    this.houses.forEach((h, i) => { M.makeRotationX(-Math.PI / 2); M.setPosition(h.x + .08, .07, h.z + .08); sh.setMatrixAt(i, M); }); add(sh);
    // особые дома
    this.specialG = [];
    for (const h of special) { const g = makeHouse(h.recipe, h.key); g.position.set(h.x, .06, h.z); g.userData.house = h; h.top = g.userData.top + .06; add(g); this.specialG.push(g); }
    // фонари на перекрёстках
    const lamps = []; for (let x = -span; x <= span; x++) for (let z = -span; z <= span; z++) lamps.push([x * 3 + .28, z * 3 + .28]);
    const poleM = new THREE.InstancedMesh(new THREE.CylinderGeometry(.015, .02, .7, 6), flat('#4a4f78'), lamps.length);
    const gp = []; lamps.forEach(([x, z], i) => { M.makeTranslation(x, .35, z); poleM.setMatrixAt(i, M); gp.push(x, .72, z); }); add(poleM);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    add(new THREE.Points(lg, new THREE.PointsMaterial({ color: '#ffcf7a', size: .9, map: GLOW_T, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
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
    for (let i = 0; i < carN; i++) { const alongX = r() < .5, dir = r() < .5 ? 1 : -1; this.cars.push({ alongX, dir, line: Math.round((r() * 2 - 1) * span) * 3 + (dir > 0 ? .2 : -.2), pos: (r() * 2 - 1) * span * 3, sp: 1.3 + r() * 1.4 }); carBody.setColorAt(i, C.set(CC[(r() * CC.length) | 0])); }
    this.carBody = add(carBody); this.carTop = add(carTop);
    this.headG = new THREE.BufferGeometry(); this.headG.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(carN * 6), 3));
    const hc = new Float32Array(carN * 6); for (let i = 0; i < carN; i++) hc.set([1, .92, .6, 1, .2, .25], i * 6);
    this.headG.setAttribute('color', new THREE.Float32BufferAttribute(hc, 3));
    add(new THREE.Points(this.headG, new THREE.PointsMaterial({ size: .35, map: GLOW_T, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    const pplN = Math.min(220, 20 + N / 12 | 0); this.ppl = [];
    const pb = new THREE.CapsuleGeometry(.035, .1, 3, 6); pb.translate(0, .1, 0); const ph = new THREE.SphereGeometry(.04, 8, 6); ph.translate(0, .22, 0);
    const SH = ['#ff6b8a', '#ffd166', '#6ee7b7', '#7cc8ff', '#c084fc', '#ff9f68', '#f1f3f5', '#20c997'], SK = ['#f6d2b5', '#eac0a0', '#d9a47c', '#b07a52', '#8a5a3b'];
    const pBody = new THREE.InstancedMesh(pb, flat('#ffffff'), pplN), pHead = new THREE.InstancedMesh(ph, flat('#ffffff'), pplN);
    for (let i = 0; i < pplN; i++) { const alongX = r() < .5; this.ppl.push({ alongX, dir: r() < .5 ? 1 : -1, line: Math.round((r() * 2 - 1) * span) * 3 + (r() < .5 ? .42 : -.42), pos: (r() * 2 - 1) * span * 3, sp: .25 + r() * .25, ph: r() * 6, nick: this.houses.length ? this.houses[(r() * this.houses.length) | 0].label : '' }); pBody.setColorAt(i, C.set(SH[(r() * SH.length) | 0])); pHead.setColorAt(i, C.set(SK[(r() * SK.length) | 0])); }
    this.pBody = add(pBody); this.pHead = add(pHead);
    this.N = N;
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
    const hits = this.ray.intersectObjects([...this.pickables, ...this.specialG], true);
    for (const hit of hits) {
      if (hit.object.isInstancedMesh && hit.object.userData.list) return hit.object.userData.list[hit.instanceId];
      let o = hit.object; while (o && !o.userData.house) o = o.parent; if (o) return o.userData.house;
    }
    return null;
  }
  // ---- кадр ----
  frame(dt) {
    this.T += dt; const T = this.T, c = this.ctl, k = 1 - Math.pow(.002, dt);
    c.x += (c.tx - c.x) * k; c.z += (c.tz - c.z) * k; c.d += (c.td - c.d) * k; c.az += (c.taz - c.az) * k;
    const pol = 1.12 - Math.min(1, c.d / 90) * .42; // угол от вертикали: ближе — ниже камера
    this.cam.position.set(c.x + Math.sin(c.az) * Math.sin(pol) * c.d, Math.cos(pol) * c.d + .3, c.z + Math.cos(c.az) * Math.sin(pol) * c.d);
    this.cam.lookAt(c.x, .4, c.z);
    for (const lm of this.landmarks || []) lm.children.forEach(ch => { if (ch.userData.label) ch.visible = c.d > 6; });
    if (!this.headG) { this.renderer.render(this.scene, this.cam); return; }
    // машины
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3(), hp = this.headG.attributes.position.array, L = this.span * 3;
    this.cars.forEach((o, i) => { let p = o.pos + o.dir * o.sp * T; p = ((p + L) % (2 * L) + 2 * L) % (2 * L) - L; const x = o.alongX ? p : o.line, z = o.alongX ? o.line : p;
      Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.alongX ? (o.dir > 0 ? 0 : Math.PI) : (o.dir > 0 ? -Math.PI / 2 : Math.PI / 2));
      M.compose(P.set(x, .1, z), Q, S1); this.carBody.setMatrixAt(i, M); M.compose(P.set(x - (o.alongX ? .02 * o.dir : 0), .19, z - (o.alongX ? 0 : .02 * o.dir)), Q, S1); this.carTop.setMatrixAt(i, M);
      const fx = o.alongX ? o.dir * .22 : 0, fz = o.alongX ? 0 : o.dir * .22; hp.set([x + fx, .12, z + fz, x - fx, .12, z - fz], i * 6); });
    this.carBody.instanceMatrix.needsUpdate = this.carTop.instanceMatrix.needsUpdate = true; this.headG.attributes.position.needsUpdate = true;
    // люди
    this.ppl.forEach((o, i) => { let p = o.pos + o.dir * o.sp * T; p = ((p + L) % (2 * L) + 2 * L) % (2 * L) - L; const x = o.alongX ? p : o.line, z = o.alongX ? o.line : p, b = Math.abs(Math.sin(T * 8 * o.sp + o.ph)) * .02;
      M.makeTranslation(x, b, z); this.pBody.setMatrixAt(i, M); this.pHead.setMatrixAt(i, M); o.x = x; o.z = z; o.y = b; });
    this.pBody.instanceMatrix.needsUpdate = this.pHead.instanceMatrix.needsUpdate = true;
    // анимации
    this.scene.traverse(o => { if (o.userData.blink) o.visible = Math.sin(T * 4) > 0; if (o.userData.spin) o.rotation.y = T * .2; if (o.userData.twinkle) o.material.size = .08 + Math.sin(T * 5) * .02; if (o.userData.pet) o.position.y = Math.abs(Math.sin(T * 6)) * .03; });
    if (this.bloom) this.composer.render(); else this.renderer.render(this.scene, this.cam);
    this.drawLabels();
    // авто-качество
    this.fpsT += dt; this.fpsN++; if (this.fpsT > 3) { if (this.fpsN / this.fpsT < 28 && this.bloom) { this.bloom = false; } this.fpsT = 0; this.fpsN = 0; }
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
    if (c.d < 22) {
      const R = c.d * .7, cand = [];
      for (const h of this.houses) { if (h === this.hi) continue; const dd = Math.hypot(h.x - c.x, h.z - c.z); if (dd < R) cand.push([dd, h]); }
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
