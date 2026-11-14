// Прототип новой карты «Города подписчиков»: рельеф, горы, вода, свободные улицы, участки. Светлый дневной стиль.
import * as THREE from 'three';

// ---------- шум ----------
function rnd(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const h2 = (x, y, s) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sm = t => t * t * (3 - 2 * t);
function vnoise(x, y, s = 0) { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return (a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf) * 2 - 1; }
function fbm(x, y, s = 0, o = 4) { let v = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { v += a * vnoise(x * f, y * f, s + i * 17); f *= 2.03; a *= .5; } return v; }
function ridged(x, y, s = 0, o = 5) { let v = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { const n = 1 - Math.abs(vnoise(x * f, y * f, s + i * 31)); v += a * n * n; f *= 2.1; a *= .5; } return v; }
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- варианты ландшафта ----------
// valley — город в долине, река с гор, горы кольцом; lake — холмы и озеро, горы с одной стороны; coast — берег моря, горы за спиной
export const VARIANTS = {
  valley: { name: 'Долина', Rc: 72, seed: 11, water: 'river' },
  lake: { name: 'Озёрный', Rc: 74, seed: 23, water: 'lake' },
  coast: { name: 'Побережье', Rc: 74, seed: 37, water: 'sea' },
};
export const WATER_Y = -0.22;

export class Terrain {
  constructor(v) { this.v = v; this.Rc = v.Rc; this.s = v.seed; }
  riverD(x, z) { // расстояние до русла (река течёт с гор на северо-западе на юго-восток, петляет)
    const zc = 0.32 * x + 17 + 7 * Math.sin(x / 19 + this.s) + 3 * Math.sin(x / 7.7 + 1); return Math.abs(z - zc) / Math.hypot(1, .32); }
  H(x, z) {
    const v = this.v, Rc = this.Rc, r = Math.hypot(x, z), ang = Math.atan2(z, x), s = this.s;
    let h = .75 + 0.5 * fbm(x / 34, z / 34, s) + 0.18 * fbm(x / 11, z / 11, s + 5); // мягкие холмы внутри города
    h = lerp(.75, h, smoothstep(5, 24, r)); // центр почти ровный
    // горы
    let mask;
    if (v.water === 'sea') { const dir = x * .8 - z * .6; mask = smoothstep(Rc * .55, Rc * 1.15, dir + 10 * fbm(ang * 2, 3, s)) + smoothstep(Rc + 8, Rc + 40, r) * .35; }
    else if (v.water === 'lake') { const dir = -x * .5 - z * .85; mask = smoothstep(Rc * .5, Rc * 1.1, dir + 12 * fbm(ang * 2, 1, s)) + smoothstep(Rc + 12, Rc + 45, r) * .6; }
    else mask = smoothstep(Rc - 2, Rc + 34, r + 14 * fbm(Math.cos(ang) * 2, Math.sin(ang) * 2, s));
    mask = Math.min(1, mask);
    if (mask > 0) h += mask * (5 + 30 * ridged(x / 38, z / 38, s + 9) + 6 * fbm(x / 9, z / 9, s + 3));
    // вода
    if (v.water === 'river') { const d = this.riverD(x, z) - 1.8 * (1 + .3 * fbm(x / 12, 0, s)); const bank = smoothstep(0, 3.2, d); h = lerp(-1.1, Math.max(h, .3), bank); if (d < 0) h = -1.1; }
    else if (v.water === 'lake') { const lx = x - 30, lz = z - 26, d = Math.hypot(lx * .8, lz) - 17 - 5 * fbm(Math.atan2(lz, lx) * 2, 0, s); const bank = smoothstep(-1, 3, d); h = lerp(-1.4, h, bank); }
    else { const dir = -x * .8 + z * .6, coast = Rc * .62 + 7 * fbm(ang * 3, 2, s) + 3 * fbm(x / 6, z / 6, s); const d = coast - dir; const bank = smoothstep(-1, 3.5, d); h = lerp(-1.6, h, bank); }
    return h;
  }
  slope(x, z) { const e = .6; return Math.max(Math.abs(this.H(x + e, z) - this.H(x - e, z)), Math.abs(this.H(x, z + e) - this.H(x, z - e))) / (2 * e); }
  wet(x, z) { return this.H(x, z) < .2; }
}

// ---------- дороги ----------
// Сеть растёт как настоящий город: проспекты от площади, от них — улицы, от улиц — переулки.
// Новая улица, встретив другую, заканчивается перекрёстком; рядом с узлом — примыкает к нему. Наложений нет.
const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L));
  return [Math.hypot(px - ax - dx * t, pz - az - dz * t), ax + dx * t, az + dz * t]; };
function segX(ax, az, bx, bz, cx, cz, dx, dz) { // пересечение отрезков AB и CD → t по AB или -1
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx; if (Math.abs(den) < 1e-9) return -1;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den; return t > 1e-4 && t <= 1 && u >= 0 && u <= 1 ? t : -1; }
export const PLAZA_R = 6;

export function buildRoads(T, seed) {
  const r = rnd(seed * 7 + 1), Rc = T.Rc, roads = [], segs = [], SG = new Map(), C = 3, nodes = [];
  const cells = (ax, az, bx, bz) => { const out = []; for (let i = Math.floor(Math.min(ax, bx) / C); i <= Math.floor(Math.max(ax, bx) / C); i++) for (let j = Math.floor(Math.min(az, bz) / C); j <= Math.floor(Math.max(az, bz) / C); j++) out.push(i + ',' + j); return out; };
  const addSeg = (ax, az, bx, bz, chain) => { const s = { ax, az, bx, bz, chain, i: segs.length }; segs.push(s); for (const k of cells(ax, az, bx, bz)) (SG.get(k) || SG.set(k, []).get(k)).push(s); return s; };
  const around = (x, z, R) => { const out = new Set(); for (let i = Math.floor((x - R) / C); i <= Math.floor((x + R) / C); i++) for (let j = Math.floor((z - R) / C); j <= Math.floor((z + R) / C); j++) for (const s of SG.get(i + ',' + j) || []) out.add(s); return out; };
  const land = (x, z) => Math.hypot(x, z) < Rc && T.slope(x, z) < .5 && T.H(x, z) < 5.5 && !T.wet(x, z);
  const KIND = { ave: { w: .82, L: 2, every: 3 }, street: { w: .62, L: 1.7, every: 4 }, lane: { w: .5, L: 1.5, every: 4 } };
  // кольцо вокруг площади
  const ring = { pts: [], w: .82, kind: 'ave' }, RN = 40;
  for (let k = 0; k <= RN; k++) { const a = k / RN * 6.2832; ring.pts.push([Math.cos(a) * PLAZA_R, Math.sin(a) * PLAZA_R]); }
  for (let k = 0; k < RN; k++) addSeg(...ring.pts[k], ...ring.pts[k + 1], ring); roads.push(ring);
  // очередь роста: сначала проспекты, улицы ждут
  const Q = []; const pushQ = it => { Q.push(it); };
  const NA = 6, a0 = r() * 6.28;
  for (let i = 0; i < NA; i++) { const a = a0 + i * 6.2832 / NA + (r() - .5) * .25, ch = { pts: [[Math.cos(a) * PLAZA_R, Math.sin(a) * PLAZA_R]], w: KIND.ave.w, kind: 'ave' }; roads.push(ch);
    pushQ({ ch, dir: a, t: 0, n: 0, kind: 'ave', s: i }); }
  let guard = 0;
  while (Q.length && guard++ < 60000) {
    let bi = 0; for (let i = 1; i < Q.length; i++) if (Q[i].t < Q[bi].t) bi = i; const it = Q.splice(bi, 1)[0];
    const K = KIND[it.kind], [ax, az] = it.ch.pts[it.ch.pts.length - 1];
    let dir = it.dir + fbm(ax / 16, az / 16, seed + it.s * 13) * (it.kind === 'ave' ? .16 : .12);
    if (it.kind === 'ave') dir += (Math.atan2(az, ax) - dir + 9.42478) % 6.2832 > 3.1416 ? -.07 : .07; // проспект держится радиального направления
    let bx = ax + Math.cos(dir) * K.L, bz = az + Math.sin(dir) * K.L;
    if (!land(bx, bz)) { // склон — пробуем чуть повернуть; вода — мост только у проспекта и только короткий
      let fixed = false;
      for (const d of [.35, -.35, .7, -.7]) { const x = ax + Math.cos(dir + d) * K.L, z = az + Math.sin(dir + d) * K.L; if (land(x, z)) { dir += d; bx = x; bz = z; fixed = true; break; } }
      if (!fixed && it.kind === 'ave' && T.wet(bx, bz)) for (let k = 2; k <= 6; k++) { const x = ax + Math.cos(dir) * K.L * k, z = az + Math.sin(dir) * K.L * k; if (land(x, z)) { bx = x; bz = z; fixed = true; break; } if (Math.hypot(x, z) > Rc) break; }
      if (!fixed) continue; }
    // пересечение с существующей улицей → перекрёсток, конец
    let hit = null, ht = 2;
    for (const s of around((ax + bx) / 2, (az + bz) / 2, Math.hypot(bx - ax, bz - az) / 2 + 1)) { if (s.chain === it.ch && it.ch.pts.length - 2 <= s.i) continue;
      const t = segX(ax, az, bx, bz, s.ax, s.az, s.bx, s.bz); if (t > 0 && t < ht && !(s.chain === it.ch)) { ht = t; hit = s; } }
    let end = false;
    if (hit) { bx = ax + (bx - ax) * ht; bz = az + (bz - az) * ht; end = true; }
    else { // близко к узлу или к улице — примыкаем
      let best = null, bd = 1.15;
      for (const s of around(bx, bz, 1.6)) { if (s.chain === it.ch) continue; for (const [nx, nz] of [[s.ax, s.az], [s.bx, s.bz]]) { const d = Math.hypot(nx - bx, nz - bz); if (d < bd) { bd = d; best = [nx, nz]; } } }
      if (!best) { let sd = 1.0; for (const s of around(bx, bz, 1.6)) { if (s.chain === it.ch) continue; const [d, px, pz] = segDist(bx, bz, s.ax, s.az, s.bx, s.bz); if (d < sd) { sd = d; best = [px, pz]; } } }
      if (best) { bx = best[0]; bz = best[1]; end = true; } }
    // слишком близко и параллельно другой улице — не строим (иначе «двойные» дороги)
    if (!end) { const mx = (ax + bx) / 2, mz = (az + bz) / 2; let para = false;
      const ux = (bx - ax) / (Math.hypot(bx - ax, bz - az) || 1), uz = (bz - az) / (Math.hypot(bx - ax, bz - az) || 1);
      for (const s of around(mx, mz, 2.2)) { if (s.chain === it.ch) continue; const sl = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1, cos = Math.abs(ux * (s.bx - s.ax) / sl + uz * (s.bz - s.az) / sl);
        if (cos < .8) continue; const [d] = segDist(mx, mz, s.ax, s.az, s.bx, s.bz); if (d < 1.9) { para = true; break; } }
      if (para) continue; }
    if (Math.hypot(bx - ax, bz - az) < .3) continue;
    addSeg(ax, az, bx, bz, it.ch); it.ch.pts.push([bx, bz]); nodes.push([bx, bz]);
    if (end || Math.hypot(bx, bz) > Rc - 1) continue;
    const n = it.n + 1, maxLen = it.kind === 'lane' ? 6 : it.kind === 'street' ? 40 : 99;
    if (n < maxLen) pushQ({ ...it, dir, n, t: it.t + 1 });
    // ответвления — почти под прямым углом, по очереди в обе стороны
    if (n % K.every === 0) for (const sd of [1, -1]) { if (r() < (it.kind === 'ave' ? .05 : .15)) continue;
      const kind = it.kind === 'ave' || (it.kind === 'street' && r() < .55) ? 'street' : 'lane', ch = { pts: [[bx, bz]], w: KIND[kind].w, kind }; roads.push(ch);
      pushQ({ ch, dir: dir + sd * (1.5708 + (r() - .5) * .3), t: it.t + (it.kind === 'ave' ? 2 : 3), n: 0, kind, s: (r() * 1e4) | 0 }); }
  }
  return roads.filter(c => c.pts.length > 1);
}

// пространственный индекс точек
class Grid { constructor(c) { this.c = c; this.m = new Map(); }
  key(x, z) { return Math.floor(x / this.c) + ',' + Math.floor(z / this.c); }
  add(x, z, v) { const k = this.key(x, z); (this.m.get(k) || this.m.set(k, []).get(k)).push(v); }
  near(x, z, R, f) { const c = this.c, x0 = Math.floor((x - R) / c), x1 = Math.floor((x + R) / c), z0 = Math.floor((z - R) / c), z1 = Math.floor((z + R) / c);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const a = this.m.get(i + ',' + j); if (a) for (const v of a) if (f(v) === false) return false; } return true; } }

// участки вдоль улиц, отсортированы от центра — дом №1 у площади, новые жители заселяют окраины
export function buildLots(T, roads, seed) {
  const lg = new Grid(2), lots = [], rp = new Grid(2);
  for (const rd of roads) for (let i = 0; i < rd.pts.length - 1; i++) { const [a, b] = [rd.pts[i], rd.pts[i + 1]];
    for (let t = 0; t < 1; t += .25) { const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; rp.add(x, z, [x, z, rd.w]); } }
  const clearOfRoads = (x, z, pad) => rp.near(x, z, 2.2, ([px, pz, w]) => Math.hypot(px - x, pz - z) > w / 2 + pad);
  for (const rd of roads) { const P = rd.pts;
    for (let i = 0; i < P.length - 1; i++) { const [x0, z0] = P[i], [x1, z1] = P[i + 1], L = Math.hypot(x1 - x0, z1 - z0) || 1, tx = (x1 - x0) / L, tz = (z1 - z0) / L;
      for (let t = 0; t < L; t += 1.08) { const px = x0 + tx * t, pz = z0 + tz * t;
        for (const sd of [-1, 1]) { const off = rd.w / 2 + .62, nx = -tz * sd, nz = tx * sd, x = px + nx * off, z = pz + nz * off;
          if (Math.hypot(x, z) < PLAZA_R + .9 || T.wet(x, z) || T.slope(x, z) > .45 || T.H(x, z) > 6) continue;
          if (!clearOfRoads(x, z, .42)) continue;
          if (!lg.near(x, z, 1.4, l => Math.hypot(l.x - x, l.z - z) > 1.02)) continue;
          const lot = { x, z, rot: Math.atan2(-nx, -nz), d: Math.hypot(x, z), road: rd.kind }; // фасад (+z дома) смотрит на улицу
          lots.push(lot); lg.add(x, z, lot); } } } }
  const jit = l => l.d + 4 * h2(Math.round(l.x * 10), Math.round(l.z * 10), seed);
  lots.sort((a, b) => jit(a) - jit(b));
  return lots;
}

// ---------- сцена ----------
// Единая спокойная палитра: светлые стены, черепица/сланец, приглушённая зелень.
const WALLS = ['#f4eee3', '#efe2cc', '#ead6bf', '#f3dccb', '#e2e8ea', '#ebe4ef', '#f5e8bd', '#dce8d2', '#f1d3c6', '#d3e0ea', '#fbf6ee', '#e6dccd'];
const ROOFS = ['#b0503a', '#9a4934', '#a35d3f', '#6a4e44', '#58626f', '#4b5866', '#86453a', '#5d6b5b', '#7b5e4a'];
const tex = (w, h, draw, rep) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t; };

// фасад: на один этаж — два окна с рамой и подоконником (белая стена, цвет даёт инстанс)
const WIN_T = tex(128, 128, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  for (const x of [22, 74]) { g.fillStyle = '#e8e2d8'; g.fillRect(x - 4, 30, 40, 62); g.fillStyle = '#3f5568'; g.fillRect(x, 34, 32, 52);
    g.fillStyle = 'rgba(190,225,255,.55)'; g.fillRect(x + 2, 36, 12, 22); g.fillStyle = '#e8e2d8'; g.fillRect(x + 14, 34, 4, 52); g.fillRect(x, 58, 32, 4); g.fillStyle = '#cfc6b8'; g.fillRect(x - 6, 90, 44, 6); }
  g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(0, 122, w, 6); }, true);
const ROOF_T = tex(64, 64, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; for (let y = 0; y < h; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 8) % 2 * 8; x < w; x += 16) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke(); } } }, true);
const ROAD_T = tex(64, 256, (g, w, h) => { g.fillStyle = '#5c6068'; g.fillRect(0, 0, w, h); for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},.05)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.fillStyle = 'rgba(245,240,225,.9)'; g.fillRect(w / 2 - 1.5, 0, 3, h * .5); }, true);
const LANE_T = tex(64, 64, (g, w, h) => { g.fillStyle = '#62666e'; g.fillRect(0, 0, w, h); for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},.05)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, true);
const AO_T = tex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 6, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(.6, 'rgba(0,0,0,.25)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });

function bodyGeo(floors) { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, .5, 0); const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) { if (Math.abs(n.getY(i)) > .5) { uv.setXY(i, .02, .02); continue; } uv.setY(i, uv.getY(i) * floors); } return g; }
function gableGeo() { // скаты крыши с выносом; конёк вдоль X
  const o = .1, W = .5 + o, D = .5 + o, H = 1, p = [], u = [];
  const quad = (a, b, c, d) => { p.push(...a, ...b, ...c, ...a, ...c, ...d); u.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1); };
  quad([-W, 0, D], [W, 0, D], [W, H, 0], [-W, H, 0]); quad([W, 0, -D], [-W, 0, -D], [-W, H, 0], [W, H, 0]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u.map((v, i) => v * (i % 2 ? 3 : 4)), 2)); g.computeVertexNormals(); return g; }
function gableEndGeo() { const p = [-.5, 0, .5, .5, 0, .5, 0, 1, .5, .5, 0, -.5, -.5, 0, -.5, 0, 1, -.5].map((v, i) => i % 3 === 1 ? v : v); // треугольники фронтонов
  const q = [-.5, 0, -.5, -.5, 0, .5, -.5, 1, 0, .5, 0, .5, .5, 0, -.5, .5, 1, 0]; void p;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(q, 3)); g.computeVertexNormals(); return g; }

export function makeEnv(renderer) { // небо + мягкие отражения
  const sky = new THREE.Scene(), sg = new THREE.SphereGeometry(500, 32, 16), col = [], c = new THREE.Color(), top = new THREE.Color('#7fb8ea'), hor = new THREE.Color('#e4f1fb'), bot = new THREE.Color('#b9c9b0');
  for (let i = 0; i < sg.attributes.position.count; i++) { const y = sg.attributes.position.getY(i) / 500; c.copy(y > 0 ? hor : bot).lerp(y > 0 ? top : bot, Math.pow(Math.abs(y), .6)); col.push(c.r, c.g, c.b); }
  sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const dome = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })); sky.add(dome);
  const sunS = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 8), new THREE.MeshBasicMaterial({ color: '#fff8e0' })); sunS.position.set(-200, 300, 150); sky.add(sunS);
  const pm = new THREE.PMREMGenerator(renderer), env = pm.fromScene(sky, .02).texture; pm.dispose();
  return { env, dome: dome.clone() };
}

export function buildScene(scene, T, roads, lots, count, seed) {
  const Rw = T.Rc + 75, SEG = 340, geo = new THREE.PlaneGeometry(Rw * 2, Rw * 2, SEG, SEG); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const G1 = new THREE.Color('#a8d483'), G2 = new THREE.Color('#8cc46e'), G3 = new THREE.Color('#c4d98e'), FOR = new THREE.Color('#6a9e5a'), ROCK = new THREE.Color('#a19b92'), ROCK2 = new THREE.Color('#7e7a76'), SNOW = new THREE.Color('#f8fafc'), SAND = new THREE.Color('#ead9ad'), DEEP = new THREE.Color('#3f8fb0');
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), h = T.H(x, z), sl = T.slope(x, z); pos.setY(i, h);
    const n = .5 + .5 * fbm(x / 7, z / 7, 3), n2 = .5 + .5 * fbm(x / 23, z / 23, 8);
    c.copy(G1).lerp(G2, n * .7).lerp(G3, Math.max(0, n2 - .55) * 1.2).lerp(FOR, smoothstep(1.5, 6, h) * .7);
    if (h < .42) c.lerp(SAND, smoothstep(.42, .12, h));
    if (h < WATER_Y) c.copy(SAND).lerp(DEEP, smoothstep(WATER_Y, WATER_Y - 1.2, h));
    c.lerp(ROCK.clone().lerp(ROCK2, n), Math.min(1, smoothstep(.6, 1.15, sl) * .95 + smoothstep(9, 15, h) * .7));
    c.lerp(SNOW, smoothstep(16 + 3 * n, 20 + 3 * n, h) * (1 - smoothstep(1.4, 2.2, sl) * .45));
    col.set([c.r, c.g, c.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: .35 })); ground.receiveShadow = true; scene.add(ground);
  // вода: прозрачная, с бликом неба
  const water = new THREE.Mesh(new THREE.PlaneGeometry(Rw * 3, Rw * 3), new THREE.MeshStandardMaterial({ color: '#4fb0d6', roughness: .08, metalness: .2, transparent: true, opacity: .78, envMapIntensity: 1.1 }));
  water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y; water.receiveShadow = true; scene.add(water);
  // дороги: тротуар (шире, светлый) + асфальт с разметкой у больших улиц
  const ribbon = (wid, lift, useLen) => { const v = [], uv = [], ix = [];
    for (const rd of roads) { const P = rd.pts, w = (rd.w + wid) / 2; let len = 0, base0 = v.length / 3;
      for (let i = 0; i < P.length; i++) { const [x, z] = P[i], [ax, az] = P[Math.max(0, i - 1)], [bx, bz] = P[Math.min(P.length - 1, i + 1)], tx = bx - ax, tz = bz - az, L = Math.hypot(tx, tz) || 1, nx = -tz / L, nz = tx / L;
        if (i) len += Math.hypot(x - P[i - 1][0], z - P[i - 1][1]);
        const h = Math.max(T.H(x + nx * w, z + nz * w), T.H(x, z), T.H(x - nx * w, z - nz * w)), y = Math.max(h, WATER_Y + .3) + lift, base = v.length / 3;
        v.push(x + nx * w, y, z + nz * w, x - nx * w, y, z - nz * w); uv.push(0, useLen ? len / 2.4 : 0, 1, useLen ? len / 2.4 : 0);
        if (i) ix.push(base - 2, base, base - 1, base - 1, base, base + 1); }
      void base0; if (useLen) rd._len = len; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals(); return g; };
  const walk = new THREE.Mesh(ribbon(.34, .045, false), new THREE.MeshStandardMaterial({ color: '#d6d1c6', roughness: .95, polygonOffset: true, polygonOffsetFactor: -1 })); walk.receiveShadow = true; scene.add(walk);
  const big = roads.filter(r => r.kind === 'ave' || r.kind === 'street'), small = roads.filter(r => !(r.kind === 'ave' || r.kind === 'street'));
  const asph = (list, map) => { const keep = roads.splice(0, roads.length, ...list); const g = ribbon(0, .06, true); roads.splice(0, roads.length, ...keep); return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map, roughness: .85, polygonOffset: true, polygonOffsetFactor: -3 })); };
  for (const m of [asph(big, ROAD_T), asph(small, LANE_T)]) { m.receiveShadow = true; scene.add(m); }
  // дома
  const N = Math.min(count, lots.length), r = rnd(seed + 5), houses = [];
  for (let i = 0; i < N; i++) { const l = lots[i], u = r(), d = l.d;
    const floors = d < 13 ? 3 + Math.floor(u * 3) : d < 26 ? 2 + Math.floor(u * 2) : 1 + Math.floor(u * 1.7);
    const w = .74 + r() * .12, dp = .6 + r() * .12, mn = Math.min(T.H(l.x - .4, l.z - .4), T.H(l.x + .4, l.z + .4), T.H(l.x - .4, l.z + .4), T.H(l.x + .4, l.z - .4)), y = Math.max(T.H(l.x, l.z), mn + .05);
    houses.push({ ...l, n: i + 1, floors, w, dp, y, mn, wall: WALLS[(r() * WALLS.length) | 0], roof: ROOFS[(r() * ROOFS.length) | 0], rh: .28 + r() * .14, chim: r() < .55, flat: floors >= 4 }); }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pv = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), off = new THREE.Vector3();
  const wallMat = new THREE.MeshStandardMaterial({ map: WIN_T, roughness: .85, envMapIntensity: .5 });
  for (let f = 1; f <= 6; f++) { const list = houses.filter(h => h.floors === f); if (!list.length) continue;
    const im = new THREE.InstancedMesh(bodyGeo(f), wallMat, list.length); im.castShadow = im.receiveShadow = true;
    list.forEach((h, i) => { Q.setFromAxisAngle(Y, h.rot); Pv.set(h.x, h.y, h.z); S.set(h.w, f * .3, h.dp); M.compose(Pv, Q, S); im.setMatrixAt(i, M); im.setColorAt(i, c.set(h.wall)); }); scene.add(im); }
  const gab = houses.filter(h => !h.flat), flat = houses.filter(h => h.flat);
  const roofM = new THREE.InstancedMesh(gableGeo(), new THREE.MeshStandardMaterial({ map: ROOF_T, roughness: .75, side: THREE.DoubleSide, envMapIntensity: .6 }), gab.length), endM = new THREE.InstancedMesh(gableEndGeo(), new THREE.MeshStandardMaterial({ roughness: .9, side: THREE.DoubleSide }), gab.length);
  roofM.castShadow = endM.castShadow = true; roofM.receiveShadow = true;
  gab.forEach((h, i) => { Q.setFromAxisAngle(Y, h.rot); Pv.set(h.x, h.y + h.floors * .3, h.z); S.set(h.w, h.rh, h.dp); M.compose(Pv, Q, S); roofM.setMatrixAt(i, M); roofM.setColorAt(i, c.set(h.roof)); endM.setMatrixAt(i, M); endM.setColorAt(i, c.set(h.wall)); });
  scene.add(roofM, endM);
  const capM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0), new THREE.MeshStandardMaterial({ color: '#8d8a86', roughness: .9 }), flat.length * 2);
  flat.forEach((h, i) => { Q.setFromAxisAngle(Y, h.rot); Pv.set(h.x, h.y + h.floors * .3, h.z); S.set(h.w + .04, .06, h.dp + .04); M.compose(Pv, Q, S); capM.setMatrixAt(i * 2, M);
    off.set((r() - .5) * .3, 0, (r() - .5) * .2).applyQuaternion(Q); Pv.add(off); S.set(.18, .14, .14); M.compose(Pv, Q, S); capM.setMatrixAt(i * 2 + 1, M); }); capM.castShadow = true; scene.add(capM);
  // двери, трубы, фундамент, мягкая тень у основания
  const doorM = new THREE.InstancedMesh(new THREE.BoxGeometry(.16, .22, .03).translate(0, .11, 0), new THREE.MeshStandardMaterial({ color: '#6b4a34', roughness: .7 }), N);
  const chimL = gab.filter(h => h.chim), chM = new THREE.InstancedMesh(new THREE.BoxGeometry(.1, .3, .1).translate(0, .15, 0), new THREE.MeshStandardMaterial({ color: '#8a5a48', roughness: .9 }), chimL.length);
  const plM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, -.5, 0), new THREE.MeshStandardMaterial({ color: '#bdb5a6', roughness: 1 }), N);
  const aoM = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: AO_T, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), N);
  houses.forEach((h, i) => { Q.setFromAxisAngle(Y, h.rot);
    off.set((r() - .5) * .2 * h.w, 0, h.dp / 2 + .005).applyQuaternion(Q); Pv.set(h.x + off.x, h.y, h.z + off.z); S.set(1, 1, 1); M.compose(Pv, Q, S); doorM.setMatrixAt(i, M);
    Pv.set(h.x, h.y, h.z); S.set(h.w + .03, h.y - h.mn + .1, h.dp + .03); M.compose(Pv, Q, S); plM.setMatrixAt(i, M);
    Pv.set(h.x, T.H(h.x, h.z) + .035, h.z); S.set(h.w * 1.9, 1, h.dp * 1.9); M.compose(Pv, Q, S); aoM.setMatrixAt(i, M); });
  chimL.forEach((h, i) => { Q.setFromAxisAngle(Y, h.rot); off.set(h.w * .28, 0, -h.dp * .18).applyQuaternion(Q); Pv.set(h.x + off.x, h.y + h.floors * .3 + h.rh * .35, h.z + off.z); S.set(1, 1, 1); M.compose(Pv, Q, S); chM.setMatrixAt(i, M); });
  chM.castShadow = true; scene.add(doorM, chM, plM, aoM);
  // фонари вдоль больших улиц
  const lamps = []; for (const rd of big) { let acc = 0; for (let i = 1; i < rd.pts.length; i++) { const [ax, az] = rd.pts[i - 1], [bx, bz] = rd.pts[i], L = Math.hypot(bx - ax, bz - az); acc += L; if (acc < 3.2) continue; acc = 0;
    const nx = -(bz - az) / L, nz = (bx - ax) / L, sd = lamps.length % 2 ? 1 : -1, x = bx + nx * sd * (rd.w / 2 + .12), z = bz + nz * sd * (rd.w / 2 + .12); if (!T.wet(x, z)) lamps.push([x, T.H(x, z), z]); } }
  const lpM = new THREE.InstancedMesh(new THREE.CylinderGeometry(.018, .025, .7, 5).translate(0, .35, 0), new THREE.MeshStandardMaterial({ color: '#3a3e47' }), lamps.length),
    lbM = new THREE.InstancedMesh(new THREE.SphereGeometry(.05, 8, 6).translate(0, .72, 0), new THREE.MeshStandardMaterial({ color: '#fff6dd', emissive: '#ffe6a0', emissiveIntensity: .4 }), lamps.length);
  lamps.forEach(([x, y, z], i) => { M.makeTranslation(x, y, z); lpM.setMatrixAt(i, M); lbM.setMatrixAt(i, M); }); scene.add(lpM, lbM);
  // деревья: ели на склонах, лиственные в городе и на равнине
  const hg = new Grid(2); for (const h of houses) hg.add(h.x, h.z, h);
  const rp = new Grid(2); for (const rd of roads) for (const [x, z] of rd.pts) rp.add(x, z, [x, z, rd.w]);
  const firs = [], leafs = [], tr = rnd(seed + 9);
  for (let k = 0; k < 60000 && firs.length + leafs.length < 11000; k++) { const x = (tr() * 2 - 1) * (T.Rc + 60), z = (tr() * 2 - 1) * (T.Rc + 60), h = T.H(x, z);
    if (h < .2 || h > 14 || T.slope(x, z) > 1.15 || Math.hypot(x, z) < PLAZA_R + .5) continue;
    const city = Math.hypot(x, z) < T.Rc - 4, forest = fbm(x / 18, z / 18, seed + 44) + (city ? -.3 : .35) + smoothstep(1, 5, h) * .4; if (forest < .05 && tr() > (city ? .1 : .2)) continue;
    if (!rp.near(x, z, 1.6, ([px, pz, w]) => Math.hypot(px - x, pz - z) > w / 2 + .45)) continue;
    if (!hg.near(x, z, 1.5, o => Math.hypot(o.x - x, o.z - z) > .8)) continue;
    const s = .6 + tr() * .7; (h > 2.5 || (!city && tr() < .55) ? firs : leafs).push([x, h, z, s, tr()]); }
  const firG = new THREE.ConeGeometry(.34, .75, 7).translate(0, .85, 0), firG2 = new THREE.ConeGeometry(.26, .6, 7).translate(0, 1.2, 0), trunk = new THREE.CylinderGeometry(.05, .07, .5, 5).translate(0, .25, 0);
  const leafG = new THREE.IcosahedronGeometry(.36, 1).translate(0, .78, 0);
  const FC = ['#3f7a4a', '#4b8650', '#356d44', '#4f8a55'], LC = ['#6aa356', '#7fb25e', '#5d9a4f', '#8fbd63', '#a8c06a', '#c9b45a'];
  const inst = (g, mat, list, colors) => { const m = new THREE.InstancedMesh(g, mat, list.length); m.castShadow = true; m.receiveShadow = true;
    list.forEach(([x, y, z, s, k], i) => { Q.setFromAxisAngle(Y, k * 6.28); Pv.set(x, y, z); S.set(s, s * (.9 + k * .3), s); M.compose(Pv, Q, S); m.setMatrixAt(i, M); if (colors) m.setColorAt(i, c.set(colors[(k * colors.length) | 0])); }); scene.add(m); };
  const leafMat = new THREE.MeshStandardMaterial({ roughness: .9, flatShading: true }), barkMat = new THREE.MeshStandardMaterial({ color: '#7a5a3c', roughness: 1 });
  inst(firG, leafMat, firs, FC); inst(firG2, leafMat.clone(), firs, FC); inst(leafG, leafMat.clone(), leafs, LC); inst(trunk, barkMat, [...firs, ...leafs]);
  // площадь
  scene.add(buildPlaza(T.H(0, 0), roads));
  return { houses, trees: firs.length + leafs.length };
}

function buildPlaza(y0, roads) {
  const g = new THREE.Group(), PR = PLAZA_R - .42;
  const tile = document.createElement('canvas'); tile.width = tile.height = 512; const cx = tile.getContext('2d');
  cx.fillStyle = '#e9e0cf'; cx.fillRect(0, 0, 512, 512); cx.strokeStyle = 'rgba(150,130,100,.35)'; cx.lineWidth = 2;
  for (let rr = 20; rr < 256; rr += 22) { cx.beginPath(); cx.arc(256, 256, rr, 0, 7); cx.stroke(); const n = Math.round(rr / 6); for (let k = 0; k < n; k++) { const a = k / n * 6.283; cx.beginPath(); cx.moveTo(256 + Math.cos(a) * rr, 256 + Math.sin(a) * rr); cx.lineTo(256 + Math.cos(a) * (rr + 22), 256 + Math.sin(a) * (rr + 22)); cx.stroke(); } }
  const tex = new THREE.CanvasTexture(tile); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const disk = new THREE.Mesh(new THREE.CircleGeometry(PR, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: .9 })); disk.rotation.x = -Math.PI / 2; disk.position.y = y0 + .1; disk.receiveShadow = true; g.add(disk);
  const curb = new THREE.Mesh(new THREE.TorusGeometry(PR, .06, 6, 64), new THREE.MeshStandardMaterial({ color: '#c9bfae' })); curb.rotation.x = -Math.PI / 2; curb.position.y = y0 + .1; g.add(curb);
  // направления проспектов → дорожки; между ними газоны с клумбами
  const aves = roads.filter(r => r.kind === 'ave' && r.pts.length > 2 && Math.hypot(...r.pts[0]) < PLAZA_R + .1).map(r => Math.atan2(r.pts[0][1], r.pts[0][0])).sort((a, b) => a - b);
  const lawn = new THREE.MeshStandardMaterial({ color: '#7cc35c', roughness: 1, side: THREE.DoubleSide }), FL = ['#ff6b8b', '#ffd23f', '#ff9f43', '#c56cf0', '#ffffff'];
  aves.forEach((a, i) => { const b = i + 1 < aves.length ? aves[i + 1] : aves[0] + 6.2832, gap = .28, a0 = a + gap, a1 = b - gap; if (a1 <= a0) return;
    const sh = new THREE.RingGeometry(1.9, PR - .55, 24, 1, a0, a1 - a0), m = new THREE.Mesh(sh, lawn); m.rotation.x = Math.PI / 2; m.position.y = y0 + .13; m.receiveShadow = true; g.add(m);
    const am = (a0 + a1) / 2;
    for (let k = 0; k < 9; k++) { const ak = a0 + (a1 - a0) * (.2 + .6 * k / 8), rr = 3.1 + .35 * Math.sin(k * 1.7), f = new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 6), new THREE.MeshStandardMaterial({ color: FL[(i + k) % FL.length], roughness: .8 }));
      f.position.set(Math.cos(ak) * rr, y0 + .2, Math.sin(ak) * rr); f.scale.y = .6; g.add(f); }
    // дерево и скамейка в каждом газоне
    const t = new THREE.Mesh(new THREE.SphereGeometry(.42, 10, 8), new THREE.MeshStandardMaterial({ color: '#4f9a50', flatShading: true })); t.position.set(Math.cos(am) * 4.3, y0 + .95, Math.sin(am) * 4.3); t.castShadow = true; g.add(t);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(.06, .08, .6, 6), new THREE.MeshStandardMaterial({ color: '#7a5a3c' })); tr.position.set(t.position.x, y0 + .4, t.position.z); g.add(tr);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(.5, .08, .16), new THREE.MeshStandardMaterial({ color: '#a8743f' })); bench.position.set(Math.cos(am) * 1.65, y0 + .22, Math.sin(am) * 1.65); bench.rotation.y = -am + Math.PI / 2; g.add(bench); });
  // фонари по кругу
  const pole = new THREE.CylinderGeometry(.03, .04, .9, 6), lampM = new THREE.MeshStandardMaterial({ color: '#3b3f4a' }), bulbM = new THREE.MeshStandardMaterial({ color: '#fff6d8', emissive: '#ffe9a8', emissiveIntensity: .6 });
  for (let k = 0; k < 12; k++) { const a = k / 12 * 6.2832 + .13, p = new THREE.Mesh(pole, lampM); p.position.set(Math.cos(a) * (PR - .3), y0 + .55, Math.sin(a) * (PR - .3)); g.add(p);
    const bl = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), bulbM); bl.position.set(p.position.x, y0 + 1.05, p.position.z); g.add(bl); }
  // фонтан: чаша, вода, колонна, струи
  const stone = new THREE.MeshStandardMaterial({ color: '#d7dde3', roughness: .6 }), water = new THREE.MeshStandardMaterial({ color: '#5fbfee', roughness: .05, metalness: .1, emissive: '#1b6a99', emissiveIntensity: .15 });
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.45, .32, 32), stone); bowl.position.y = y0 + .26; bowl.castShadow = true; g.add(bowl);
  const wat = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, .04, 32), water); wat.position.y = y0 + .41; g.add(wat);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(.14, .2, .7, 12), stone); col.position.y = y0 + .75; g.add(col);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(.5, .32, .14, 20), stone); top.position.y = y0 + 1.1; g.add(top);
  const jet = new THREE.Mesh(new THREE.ConeGeometry(.42, .6, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#bfe8ff', transparent: true, opacity: .55, side: THREE.DoubleSide })); jet.position.y = y0 + 1.35; jet.rotation.x = Math.PI; g.add(jet);
  return g;
}
