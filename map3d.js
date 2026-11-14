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
  valley: { name: 'Долина', Rc: 100, seed: 11, water: 'river' },
  lake: { name: 'Озёрный', Rc: 118, seed: 23, water: 'lake' },
  coast: { name: 'Побережье', Rc: 100, seed: 37, water: 'sea' },
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
    else { const dir = -x * .8 + z * .6, coast = 46 + 7 * fbm(ang * 3, 2, s) + 3 * fbm(x / 6, z / 6, s); const d = coast - dir; const bank = smoothstep(-1, 3.5, d); h = lerp(-1.6, h, bank); }
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

export function buildRoads(T, seed, keepOut = []) {
  const r = rnd(seed * 7 + 1), Rc = T.Rc, roads = [], segs = [], SG = new Map(), C = 3, nodes = [];
  const cells = (ax, az, bx, bz) => { const out = []; for (let i = Math.floor(Math.min(ax, bx) / C); i <= Math.floor(Math.max(ax, bx) / C); i++) for (let j = Math.floor(Math.min(az, bz) / C); j <= Math.floor(Math.max(az, bz) / C); j++) out.push(i + ',' + j); return out; };
  const addSeg = (ax, az, bx, bz, chain) => { const s = { ax, az, bx, bz, chain, i: segs.length }; segs.push(s); for (const k of cells(ax, az, bx, bz)) (SG.get(k) || SG.set(k, []).get(k)).push(s); return s; };
  const around = (x, z, R) => { const out = new Set(); for (let i = Math.floor((x - R) / C); i <= Math.floor((x + R) / C); i++) for (let j = Math.floor((z - R) / C); j <= Math.floor((z + R) / C); j++) for (const s of SG.get(i + ',' + j) || []) out.add(s); return out; };
  const land = (x, z) => Math.hypot(x, z) < Rc && T.slope(x, z) < .5 && T.H(x, z) < 5.5 && !T.wet(x, z) && keepOut.every(o => Math.hypot(o.x - x, o.z - z) > o.r);
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
    const n = it.n + 1, maxLen = it.kind === 'lane' ? 14 : it.kind === 'street' ? 40 : 99;
    if (n < maxLen) pushQ({ ...it, dir, n, t: it.t + 1 });
    // ответвления — почти под прямым углом, по очереди в обе стороны
    if (n % K.every === 0) for (const sd of [1, -1]) { if (r() < (it.kind === 'ave' ? .05 : .15)) continue;
      const kind = it.kind === 'ave' || (it.kind === 'street' && r() < .55) ? 'street' : 'lane', ch = { pts: [[bx, bz]], w: KIND[kind].w, kind }; roads.push(ch);
      pushQ({ ch, dir: dir + sd * (1.5708 + (r() - .5) * .3), t: it.t + (it.kind === 'ave' ? 2 : 3), n: 0, kind, s: (r() * 1e4) | 0 }); }
  }
  return roads.filter(c => c.pts.length > 1);
}

// пространственный индекс точек
export class Grid { constructor(c) { this.c = c; this.m = new Map(); }
  key(x, z) { return Math.floor(x / this.c) + ',' + Math.floor(z / this.c); }
  add(x, z, v) { const k = this.key(x, z); (this.m.get(k) || this.m.set(k, []).get(k)).push(v); }
  near(x, z, R, f) { const c = this.c, x0 = Math.floor((x - R) / c), x1 = Math.floor((x + R) / c), z0 = Math.floor((z - R) / c), z1 = Math.floor((z + R) / c);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const a = this.m.get(i + ',' + j); if (a) for (const v of a) if (f(v) === false) return false; } return true; } }

// участки вдоль улиц, отсортированы от центра — дом №1 у площади, новые жители заселяют окраины.
// Участок — прямоугольник «дом + дворы»; ставим, только если он не задевает дорогу, соседний участок, воду и крутой склон.
// Типы по удалённости: центр — многоэтажки, середина — таунхаусы, окраины — коттеджи с двором.
export const LOT = { // w, dp — дом; step — шаг вдоль улицы; front/back/side — дворы
  block: { w: 1.05, dp: .82, step: 1.3, front: .12, back: .25, side: .1 },
  town: { w: .86, dp: .7, step: 1.18, front: .22, back: .45, side: .08 },
  cottage: { w: .78, dp: .62, step: 1.34, front: .3, back: .66, side: .16 },
};
export const zoneOf = d => d < 13.5 ? 'block' : d < 30 ? 'town' : 'cottage';
const axes = rot => [[Math.cos(rot), -Math.sin(rot)], [Math.sin(rot), Math.cos(rot)]]; // локальные X и Z (фасад смотрит в +Z)
function rectHit(a, b) { const A = axes(a.rot), B = axes(b.rot), dx = b.cx - a.cx, dz = b.cz - a.cz;
  for (const [ux, uz] of [...A, ...B]) {
    const pa = a.hx * Math.abs(ux * A[0][0] + uz * A[0][1]) + a.hz * Math.abs(ux * A[1][0] + uz * A[1][1]);
    const pb = b.hx * Math.abs(ux * B[0][0] + uz * B[0][1]) + b.hz * Math.abs(ux * B[1][0] + uz * B[1][1]);
    if (Math.abs(dx * ux + dz * uz) > pa + pb) return false; }
  return true; }
const REJ = { wet: 0, slope: 0, road: 0, bump: 0, lot: 0 };
export function buildLots(T, roads, seed, reserved = []) {
  const lg = new Grid(3), lots = [], rp = new Grid(2), r = rnd(seed * 3 + 7);
  for (const rd of roads) for (let i = 0; i < rd.pts.length - 1; i++) { const [a, b] = [rd.pts[i], rd.pts[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0; t <= 1; t += Math.min(1, .25 / (L || 1))) { const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; rp.add(x, z, [x, z, rd.w]); } }
  const clearOfRoads = (x, z, pad) => rp.near(x, z, 2.6, ([px, pz, w]) => Math.hypot(px - x, pz - z) > w / 2 + pad);
  roads.forEach((rd, ri) => { const P = rd.pts; let carry = 0, arc0 = 0;
    for (let i = 0; i < P.length - 1; i++) { const [x0, z0] = P[i], [x1, z1] = P[i + 1], L = Math.hypot(x1 - x0, z1 - z0) || 1, tx = (x1 - x0) / L, tz = (z1 - z0) / L;
      let t = carry;
      for (; t < L; ) { const px = x0 + tx * t, pz = z0 + tz * t, type = zoneOf(Math.hypot(px, pz)), S = LOT[type];
        const u = r(), w = S.w * (.92 + u * .16), dp = S.dp * (.92 + r() * .16), wing = type === 'cottage' && r() < .35;
        for (const sd of [-1, 1]) { const nx = -tz * sd, nz = tx * sd, off = rd.w / 2 + .3 + S.front + dp / 2, x = px + nx * off, z = pz + nz * off;
          const rot = Math.atan2(-nx, -nz), back = S.back + (wing ? .2 : 0);
          // прямоугольник участка: дом + передний двор до тротуара + задний двор + боковые
          const fp = { cx: x + nx * (back - S.front) / 2, cz: z + nz * (back - S.front) / 2, hx: w / 2 + S.side, hz: dp / 2 + (S.front + back) / 2, rot };
          if (Math.hypot(x, z) < PLAZA_R + 1.2 || T.H(x, z) > 6) continue;
          if (reserved.some(o => Math.hypot(o.x - fp.cx, o.z - fp.cz) < o.r + fp.hz)) continue;
          const [ax, az] = axes(rot)[0], [bx, bz] = axes(rot)[1]; let ok = true; const hs = [];
          for (const [i, j] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const qx = fp.cx + ax * fp.hx * i + bx * fp.hz * j, qz = fp.cz + az * fp.hx * i + bz * fp.hz * j;
            if (T.wet(qx, qz)) { REJ.wet++; ok = false; break; } if (T.slope(qx, qz) > .5) { REJ.slope++; ok = false; break; } if (!clearOfRoads(qx, qz, .16)) { REJ.road++; ok = false; break; } hs.push(T.H(qx, qz)); }
          if (!ok) continue; if (Math.max(...hs) - Math.min(...hs) > .55) { REJ.bump++; continue; } // участок слишком кривой — дом повиснет
          if (!lg.near(fp.cx, fp.cz, 2.4, o => !rectHit(o.fp, fp))) { REJ.lot++; continue; }
          const lot = { x, z, rot, d: Math.hypot(x, z), road: rd.kind, type, w, dp, wing, fp, nx, nz, ri, t: arc0 + t, sd };
          lots.push(lot); lg.add(fp.cx, fp.cz, lot); }
        t += S.step * (.95 + u * .1); }
      carry = t - L; arc0 += L; } });
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
  for (const x of [26, 78]) { g.fillStyle = '#f7f4ee'; g.fillRect(x - 4, 34, 32, 56); const gr = g.createLinearGradient(0, 38, 0, 86); gr.addColorStop(0, '#9cc3dc'); gr.addColorStop(1, '#4f6f88'); g.fillStyle = gr; g.fillRect(x, 38, 24, 48);
    g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(x + 2, 40, 6, 18); g.fillStyle = '#f7f4ee'; g.fillRect(x + 10, 38, 3, 48); g.fillRect(x, 58, 24, 3); g.fillStyle = '#d8d0c2'; g.fillRect(x - 6, 88, 36, 5); }
  g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(0, 122, w, 6); }, true);
const WIN_E = tex(128, 128, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); // ночью горят окна (одно из двух — тёмное через раз)
  [[26, '#ffffff'], [78, '#3a3a3a']].forEach(([x, c]) => { g.fillStyle = c; g.fillRect(x, 38, 24, 48); }); }, true);
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

// ---------- части сцены (их собирает и прототип, и движок города) ----------
// город растёт: улицы только до края заселённой части (+ запас), дальше — луга и лес
export function clipRoads(roads, Rm) {
  return roads.map(rd => { const pts = []; for (const p of rd.pts) { pts.push(p); if (Math.hypot(p[0], p[1]) > Rm) break; } return { ...rd, pts }; }).filter(rd => rd.pts.length > 1);
}
export function buildGround(T) {
  const Rw = T.Rc + 75, SEG = 260, geo = new THREE.PlaneGeometry(Rw * 2, Rw * 2, SEG, SEG); geo.rotateX(-Math.PI / 2);
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
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: .35 })); ground.receiveShadow = true;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(Rw * 3, Rw * 3), new THREE.MeshStandardMaterial({ color: '#4fb0d6', roughness: .08, metalness: .2, transparent: true, opacity: .78, envMapIntensity: 1.1 }));
  water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y; water.receiveShadow = true;
  return { ground, water };
}
// высота полотна дороги в каждой точке (её же берут машины и люди)
export function roadY(T, rd) { if (rd.ys) return rd.ys; const P = rd.pts, w = rd.w / 2 + .17;
  return rd.ys = P.map(([x, z], i) => { const [ax, az] = P[Math.max(0, i - 1)], [bx, bz] = P[Math.min(P.length - 1, i + 1)], L = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / L, nz = (bx - ax) / L;
    return Math.max(Math.max(T.H(x + nx * w, z + nz * w), T.H(x, z), T.H(x - nx * w, z - nz * w)), WATER_Y + .3); }); }
export function buildRoadMeshes(T, roads) {
  const ribbon = (list, wid, lift, useLen) => { const v = [], uv = [], ix = [];
    for (const rd of list) { const P = rd.pts, w = (rd.w + wid) / 2, ys = roadY(T, rd); let len = 0;
      for (let i = 0; i < P.length; i++) { const [x, z] = P[i], [ax, az] = P[Math.max(0, i - 1)], [bx, bz] = P[Math.min(P.length - 1, i + 1)], tx = bx - ax, tz = bz - az, L = Math.hypot(tx, tz) || 1, nx = -tz / L, nz = tx / L;
        if (i) len += Math.hypot(x - P[i - 1][0], z - P[i - 1][1]);
        const y = ys[i] + lift, base = v.length / 3;
        v.push(x + nx * w, y, z + nz * w, x - nx * w, y, z - nz * w); uv.push(0, useLen ? len / 2.4 : 0, 1, useLen ? len / 2.4 : 0);
        if (i) ix.push(base - 2, base, base - 1, base - 1, base, base + 1); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals(); return g; };
  const big = roads.filter(r => r.kind === 'ave' || r.kind === 'street'), small = roads.filter(r => !(r.kind === 'ave' || r.kind === 'street'));
  const walk = new THREE.Mesh(ribbon(roads, .34, .045, false), new THREE.MeshStandardMaterial({ color: '#d6d1c6', roughness: .95, polygonOffset: true, polygonOffsetFactor: -1 }));
  const out = [walk, new THREE.Mesh(ribbon(big, 0, .06, true), new THREE.MeshStandardMaterial({ map: ROAD_T, roughness: .85, polygonOffset: true, polygonOffsetFactor: -3 })),
    new THREE.Mesh(ribbon(small, 0, .06, true), new THREE.MeshStandardMaterial({ map: LANE_T, roughness: .85, polygonOffset: true, polygonOffsetFactor: -3 }))];
  for (const m of out) { m.receiveShadow = true; m.userData.flat = true; }
  return out;
}
// фонари вдоль больших улиц; tops — точки плафонов (ночью светятся)
export function buildLamps(T, roads) {
  const lamps = []; for (const rd of roads) { if (!(rd.kind === 'ave' || rd.kind === 'street')) continue; let acc = 0;
    for (let i = 1; i < rd.pts.length; i++) { const [ax, az] = rd.pts[i - 1], [bx, bz] = rd.pts[i], L = Math.hypot(bx - ax, bz - az); acc += L; if (acc < 3.2) continue; acc = 0;
      const nx = -(bz - az) / L, nz = (bx - ax) / L, sd = lamps.length % 2 ? 1 : -1, x = bx + nx * sd * (rd.w / 2 + .12), z = bz + nz * sd * (rd.w / 2 + .12); if (!T.wet(x, z)) lamps.push([x, T.H(x, z), z]); } }
  const M = new THREE.Matrix4();
  const lpM = new THREE.InstancedMesh(new THREE.CylinderGeometry(.018, .025, .7, 5).translate(0, .35, 0), new THREE.MeshStandardMaterial({ color: '#3a3e47' }), lamps.length),
    lbM = new THREE.InstancedMesh(new THREE.SphereGeometry(.05, 8, 6).translate(0, .72, 0), new THREE.MeshStandardMaterial({ color: '#fff6dd', emissive: '#ffe6a0', emissiveIntensity: .4 }), lamps.length);
  lamps.forEach(([x, y, z], i) => { M.makeTranslation(x, y, z); lpM.setMatrixAt(i, M); lbM.setMatrixAt(i, M); });
  return { meshes: [lpM, lbM], tops: lamps.map(([x, y, z]) => [x, y + .72, z]) };
}
export const inFp = (x, z, f, pad) => { const [[ax, az], [bx, bz]] = axes(f.rot), dx = x - f.cx, dz = z - f.cz; return Math.abs(dx * ax + dz * az) < f.hx + pad && Math.abs(dx * bx + dz * bz) < f.hz + pad; };
// деревья: ели на склонах, лиственные в городе и на равнине; не на участках, дорогах и занятых местах
export function buildTrees(T, roads, fps, extra, Rm, seed, keepOut = []) {
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pv = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  const hg = new Grid(3); for (const f of fps) hg.add(f.cx, f.cz, f);
  const rp = new Grid(2); for (const rd of roads) for (const [x, z] of rd.pts) rp.add(x, z, [x, z, rd.w]);
  const firs = [], leafs = [...extra], tr = rnd(seed + 9);
  for (let k = 0; k < 60000 && firs.length + leafs.length < 7000; k++) { const x = (tr() * 2 - 1) * (T.Rc + 60), z = (tr() * 2 - 1) * (T.Rc + 60), h = T.H(x, z);
    if (h < .2 || h > 14 || T.slope(x, z) > 1.15 || Math.hypot(x, z) < PLAZA_R + .5) continue;
    if (keepOut.some(o => Math.hypot(o.x - x, o.z - z) < o.r)) continue;
    const city = Math.hypot(x, z) < Rm, forest = fbm(x / 18, z / 18, seed + 44) + (city ? -.3 : .35) + smoothstep(1, 5, h) * .4; if (forest < .05 && tr() > (city ? .1 : .2)) continue;
    if (!rp.near(x, z, 1.6, ([px, pz, w]) => Math.hypot(px - x, pz - z) > w / 2 + .45)) continue;
    if (!hg.near(x, z, 2.4, f => !inFp(x, z, f, .25))) continue;
    const s = .6 + tr() * .7; (h > 2.5 || (!city && tr() < .55) ? firs : leafs).push([x, h, z, s, tr()]); }
  const firG = new THREE.ConeGeometry(.34, .75, 7).translate(0, .85, 0), firG2 = new THREE.ConeGeometry(.26, .6, 7).translate(0, 1.2, 0), trunk = new THREE.CylinderGeometry(.05, .07, .5, 5).translate(0, .25, 0);
  const leafG = new THREE.IcosahedronGeometry(.36, 1).translate(0, .78, 0);
  const FC = ['#3f7a4a', '#4b8650', '#356d44', '#4f8a55'], LC = ['#6aa356', '#7fb25e', '#5d9a4f', '#8fbd63', '#a8c06a', '#c9b45a'];
  const out = [];
  const inst = (g, mat, list, colors) => { const m = new THREE.InstancedMesh(g, mat, Math.max(1, list.length)); m.count = list.length; m.castShadow = true; m.receiveShadow = true;
    list.forEach(([x, y, z, s, k], i) => { Q.setFromAxisAngle(Y, k * 6.28); Pv.set(x, y, z); S.set(s, s * (.9 + k * .3), s); M.compose(Pv, Q, S); m.setMatrixAt(i, M); if (colors) m.setColorAt(i, c.set(colors[(k * colors.length) | 0])); }); out.push(m); };
  const leafMat = new THREE.MeshStandardMaterial({ roughness: .9, flatShading: true }), barkMat = new THREE.MeshStandardMaterial({ color: '#7a5a3c', roughness: 1 });
  inst(firG, leafMat, firs, FC); inst(firG2, leafMat.clone(), firs, FC); inst(leafG, leafMat.clone(), leafs, LC); inst(trunk, barkMat, [...firs, ...leafs]);
  out.count = firs.length + leafs.length;
  return out;
}
// прототип: вся сцена разом
export function buildScene(scene, T, roads, lots, count, seed) {
  const N0 = Math.min(count, lots.length); let Rm = PLAZA_R + 6; for (let i = 0; i < N0; i++) Rm = Math.max(Rm, lots[i].d); Rm += 3;
  roads = clipRoads(roads, Rm);
  const { ground, water } = buildGround(T); scene.add(ground, water);
  for (const m of buildRoadMeshes(T, roads)) scene.add(m);
  const { meshes, houses, garden } = buildHouses(T, lots.slice(0, N0), seed); for (const m of meshes) scene.add(m);
  for (const m of buildLamps(T, roads).meshes) scene.add(m);
  const trees = buildTrees(T, roads, houses.map(h => h.fp), garden, Rm, seed); for (const m of trees) scene.add(m);
  scene.add(buildPlaza(T.H(0, 0), roads));
  return { houses, trees: trees.count };
}


function hipGeo() { // вальмовая крыша: короткий конёк вдоль X, четыре ската
  const W = .56, D = .56, rx = .2, p = [], u = [];
  const tri = (a, b, c) => { p.push(...a, ...b, ...c); u.push(0, 0, 3, 0, 1.5, 2); };
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  quad([-W, 0, D], [W, 0, D], [rx, 1, 0], [-rx, 1, 0]); quad([W, 0, -D], [-W, 0, -D], [-rx, 1, 0], [rx, 1, 0]);
  tri([-W, 0, -D], [-W, 0, D], [-rx, 1, 0]); tri([W, 0, D], [W, 0, -D], [rx, 1, 0]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.computeVertexNormals(); return g; }

const WALLS_BLOCK = ['#f3e2c4', '#ead0bd', '#d5e3ee', '#f0d9d6', '#dce9d3', '#f6ecc9', '#e3dcf0', '#fbf7ef'];
const WALLS_TOWN = ['#efe2cc', '#ead6bf', '#f3dccb', '#f5e8bd', '#dce8d2', '#f1d3c6', '#d3e0ea', '#fbf6ee'];
const AWN = ['#d9534f', '#2f8f83', '#e8a33d', '#3f6fb5', '#8c5bb5', '#5aa05a'];
const FENCE = ['#f4f1ea', '#c79a6b', '#9c7350', '#e8e2d4'];
const FLOWERS = ['#ff6b8b', '#ffd23f', '#ff9f43', '#c56cf0', '#ffffff', '#ff5e5e'];

// Дома трёх типов. Всё — инстансы: один вызов отрисовки на вид детали, сколько бы ни было домов.
export function buildHouses(T, items, seed) {
  let r = rnd(seed + 5); const houses = [], garden = [], parts = new Map(), c = new THREE.Color(), meshes = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pv = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0);
  const kinds = {
    cap: [box, new THREE.MeshStandardMaterial({ color: '#9a9690', roughness: .9 })],
    trim: [box, new THREE.MeshStandardMaterial({ roughness: .8 })], // цветные мелочи (цвет на инстанс)
    glass: [box, new THREE.MeshStandardMaterial({ color: '#40607a', roughness: .15, metalness: .3, emissive: '#2a4a63', emissiveIntensity: .25 })],
    door: [box, new THREE.MeshStandardMaterial({ color: '#6b4a34', roughness: .7 })],
    stone: [box, new THREE.MeshStandardMaterial({ color: '#d9d3c7', roughness: 1 })],
    plinth: [new THREE.BoxGeometry(1, 1, 1).translate(0, -.5, 0), new THREE.MeshStandardMaterial({ color: '#bdb5a6', roughness: 1 })],
        gable: [gableGeo(), new THREE.MeshStandardMaterial({ map: ROOF_T, roughness: .75, side: THREE.DoubleSide, envMapIntensity: .6 })],
    gend: [gableEndGeo(), new THREE.MeshStandardMaterial({ roughness: .9, side: THREE.DoubleSide })],
    hip: [hipGeo(), new THREE.MeshStandardMaterial({ map: ROOF_T, roughness: .75, side: THREE.DoubleSide, envMapIntensity: .6 })],
    ao: [new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: AO_T, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })],
  };
  const wallMat = new THREE.MeshStandardMaterial({ map: WIN_T, emissiveMap: WIN_E, emissive: '#ffd08a', emissiveIntensity: 0, roughness: .85, envMapIntensity: .5 }); wallMat.userData.night = 1.4; // окна горят ночью
  const push = (k, row) => (parts.get(k) || parts.set(k, []).get(k)).push(row);
  // put(вид, дом, локальные x,y,z, размеры, цвет, доп. поворот) — координаты в системе дома (фасад в +Z)
  const put = (k, h, lx, ly, lz, sx, sy, sz, col, rot = 0) => {
    const ca = Math.cos(h.rot), sa = Math.sin(h.rot);
    push(k, [h.x + lx * ca + lz * sa, h.y + ly, h.z - lx * sa + lz * ca, h.rot + rot, sx, sy, sz, col, h]); };
  const ground = (h, lx, lz) => { const ca = Math.cos(h.rot), sa = Math.sin(h.rot); return T.H(h.x + lx * ca + lz * sa, h.z - lx * sa + lz * ca) - h.y; };
  const pick = a => a[(r() * a.length) | 0];
  for (let i = 0; i < items.length; i++) { const l = items[i], { w, dp, type } = l, S0 = LOT[type]; r = rnd(l.key ? hash(l.key) : seed * 7919 + i); const u = r();
    const ca = Math.cos(l.rot), sa = Math.sin(l.rot);
    const mn = Math.min(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => { const lx = a * w / 2, lz = b * dp / 2; return T.H(l.x + lx * ca + lz * sa, l.z - lx * sa + lz * ca); }));
    const y = Math.max(T.H(l.x, l.z), mn + .04);
    const floors = type === 'block' ? (l.d < 9 ? 5 + (u * 2 | 0) : 4 + (u * 2 | 0)) : type === 'town' ? 2 + (u < .45 ? 1 : 0) : (u < .6 ? 1 : 2);
    const h = Object.assign(l, { n: l.n || i + 1, floors, y, mn, wall: pick(type === 'block' ? WALLS_BLOCK : type === 'town' ? WALLS_TOWN : WALLS), roof: pick(ROOFS),
      roofType: type === 'block' ? 'flat' : type === 'town' ? (r() < .6 ? 'hip' : 'gable') : 'gable', rh: type === 'cottage' ? .36 + r() * .14 : .26 + r() * .1 });
    if (l.gone) { h.wall = '#a3a1a8'; h.roof = '#55535c'; }
    h.top = floors * .3 + (h.roofType === 'flat' ? .2 : h.rh);
    houses.push(h);
    const H = floors * .3, fz = dp / 2;
    put('ao', h, 0, ground(h, 0, 0) + .03, 0, w * 1.8, 1, dp * 1.8);
    if (l.special) continue; // особый дом жителя ставит движок (makeHouse)
    push('body' + floors, [h.x, y, h.z, h.rot, w, H, dp, h.wall, h]);
    put('plinth', h, 0, 0, 0, w + .04, y - mn + .08, dp + .04);
    // крыша
    if (h.roofType === 'flat') { put('cap', h, 0, H, 0, w + .05, .07, dp + .05); put('cap', h, (r() - .5) * w * .4, H + .07, -(r() * .2), .22, .16, .2);
      if (r() < .5) put('cap', h, (r() - .5) * w * .5, H + .07, .15, .12, .1, .12); }
    else if (h.roofType === 'hip') put('hip', h, 0, H, 0, w, h.rh, dp, h.roof);
    else { put('gable', h, 0, H, 0, w, h.rh, dp, h.roof); put('gend', h, 0, H, 0, w, h.rh, dp, h.wall); if (r() < .55) put('trim', h, w * .28, H + h.rh * .35, -dp * .18, .1, .3, .1, '#8a5a48'); }
    // фасад и двор по типу
    if (l.gone) continue;
    if (type === 'block') {
      if (r() < .6) { put('glass', h, 0, .04, fz + .004, w * .82, .17, .01); put('trim', h, 0, .23, fz + .07, w * .88, .035, .15, pick(AWN)); } // магазин на первом этаже
      else { put('door', h, 0, 0, fz + .005, .18, .24, .02); put('cap', h, 0, .26, fz + .06, .32, .03, .13); }
      for (let f = 1; f < floors; f++) for (const sx of [-1, 1]) if (r() < .8) { put('stone', h, sx * w * .25, f * .3 + .01, fz + .06, .27, .025, .12); put('trim', h, sx * w * .25, f * .3 + .035, fz + .115, .27, .06, .012, '#f2f2ef'); }
      continue; }
    const dx = (r() - .5) * .3 * w; put('door', h, dx, 0, fz + .005, .15, .23, .02);
    put('stone', h, dx, ground(h, dx, fz + .15) + .005, fz + (S0.front + .35) / 2, .14, .02, S0.front + .35); // дорожка к тротуару
    if (type === 'town') continue;
    // коттедж: крыльцо, пристройка, забор, сад
    put('cap', h, dx, .28, fz + .1, .34, .025, .2); for (const s of [-1, 1]) put('trim', h, dx + s * .15, 0, fz + .19, .025, .28, .025, '#f4f1ea');
    if (l.wing) { const sg = r() < .5 ? -1 : 1, wx = sg * (w / 2 - .22), wz = -(fz + .19);
      put('wbody', h, wx, 0, wz, .44, .3, .4, h.wall); put('gable', h, wx, .3, wz, .4, .28, .44, h.roof, Math.PI / 2); put('gend', h, wx, .3, wz, .4, .28, .44, h.wall, Math.PI / 2); }
    const f = l.fp, col = pick(FENCE), oz = (f.cx - l.x) * sa + (f.cz - l.z) * ca, hx = f.hx - .03, hz = f.hz - .03, gate = .32;
    const gy = (lx, lz) => ground(h, lx, lz);
    put('trim', h, 0, Math.min(gy(-hx, oz - hz), gy(hx, oz - hz)), oz - hz, hx * 2, .12, .025, col);
    for (const s of [-1, 1]) { put('trim', h, s * hx, Math.min(gy(s * hx, oz - hz), gy(s * hx, oz + hz)), oz, .025, .12, hz * 2, col);
      const seg = hx - gate / 2 - dx * s; if (seg > .05) put('trim', h, dx + s * (gate / 2 + seg / 2), gy(dx + s * (gate / 2 + seg / 2), oz + hz), oz + hz, seg, .12, .025, col); }
    const gx = (r() - .5) * w * .7, gz = oz - hz + .32, tx = l.x + gx * ca + gz * sa, tz = l.z - gx * sa + gz * ca;
    garden.push([tx, T.H(tx, tz), tz, .42 + r() * .22, r()]);
    if (r() < .6) { const bx = (r() < .5 ? -1 : 1) * (hx - .22); for (let k = 0; k < 3; k++) put('trim', h, bx + (k - 1) * .09, gy(bx, oz + hz - .1) + .01, oz + hz - .1, .07, .06, .07, pick(FLOWERS)); }
  }
  // сборка инстансов
  const add = (geo, mat, list) => { const im = new THREE.InstancedMesh(geo, mat, list.length); im.castShadow = im.receiveShadow = true;
    list.forEach(([x, y, z, rot, sx, sy, sz, col], i) => { Q.setFromAxisAngle(Y, rot); Pv.set(x, y, z); S.set(sx, sy, sz); M.compose(Pv, Q, S); im.setMatrixAt(i, M); if (col) im.setColorAt(i, c.set(col)); });
    im.userData.list = list.map(q => q[8]); meshes.push(im); return im; };
  for (const [k, list] of parts) {
    if (k.startsWith('body')) add(bodyGeo(+k.slice(4)), wallMat, list);
    else if (k === 'wbody') add(bodyGeo(1), wallMat, list);
    else { const im = add(...kinds[k], list); if (k === 'ao') { im.castShadow = im.receiveShadow = false; im.userData.list = null; } } }
  return { meshes, houses, garden };
}

export function buildPlaza(y0, roads) {
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
