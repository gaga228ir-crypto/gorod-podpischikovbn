/* Дома города: обычные (случайные по нику) и особые — по «рецепту» из базы.
   Рецепт (JSON):
   { "shape": "house|tower|castle|skyscraper|dome|clocktower",
     "floors": 1..6, "wall": "#rrggbb", "roof": "#rrggbb",
     "emblem": "none|sun|moon|star|heart|clock|crown|flame|leaf|lightning|diamond|snake",
     "lights": "warm|cool|pink|green" } */
(function () {
  const SHAPES = ['house', 'tower', 'castle', 'skyscraper', 'dome', 'clocktower'];
  const EMBLEMS = ['none', 'sun', 'moon', 'star', 'heart', 'clock', 'crown', 'flame', 'leaf', 'lightning', 'diamond', 'snake'];
  const LIGHTS = { warm: '#ffd27a', cool: '#9fe8ff', pink: '#ff9fd0', green: '#b4ff9f' };
  const WALLS = ['#f28b82', '#fbc95a', '#a7d36f', '#7cc8ff', '#c9a0e8', '#ffab91', '#86d4c8', '#fff08a', '#f7a8d0', '#9fb4ff'];
  const ROOFS = ['#c2414b', '#3d5a99', '#6b3fa0', '#2f7a6b', '#b8562f', '#374070'];
  const hexOk = s => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);

  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rnd(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function shade(hex, k) { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.round((n >> 16) * k * 0.8)},${Math.round((n >> 8 & 255) * k * 0.82)},${Math.round((n & 255) * k)})`; }

  function normRecipe(r) {
    if (!r || typeof r !== 'object') return null;
    return {
      shape: SHAPES.includes(r.shape) ? r.shape : 'house',
      floors: Math.max(1, Math.min(6, Math.round(+r.floors || 2))),
      wall: hexOk(r.wall) ? r.wall : '#f28b82', roof: hexOk(r.roof) ? r.roof : '#c2414b',
      emblem: EMBLEMS.includes(r.emblem) ? r.emblem : 'none',
      lights: LIGHTS[r.lights] ? r.lights : 'warm',
    };
  }

  function build(nick, recipe, cell, index) {
    const r = rnd(hash(nick)), rec = normRecipe(recipe);
    const tall = r() < 0.18;
    const lit = Array.from({ length: 12 }, () => r() < 0.75);
    if (rec) return { nick, x: cell[0], y: cell[1], born: index, rec, lit, special: true };
    return { nick, x: cell[0], y: cell[1], born: index, lit, special: false,
      rec: { shape: 'house', floors: tall ? 3 + Math.floor(r() * 2) : 1 + Math.floor(r() * 2), wall: WALLS[(r() * WALLS.length) | 0], roof: ROOFS[(r() * ROOFS.length) | 0], emblem: 'none', lights: 'warm' } };
  }

  // ---------- эмблемы (рисуются в экранных координатах) ----------
  function emblem(g, type, cx, cy, s, t) {
    g.save(); g.translate(cx, cy); g.lineJoin = 'round'; g.lineCap = 'round';
    const gold = '#ffd23f';
    switch (type) {
      case 'sun':
        g.strokeStyle = gold; g.lineWidth = s * 0.16;
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + t * 0.6; g.beginPath(); g.moveTo(Math.cos(a) * s * 0.7, Math.sin(a) * s * 0.7); g.lineTo(Math.cos(a) * s * 1.05, Math.sin(a) * s * 1.05); g.stroke(); }
        g.fillStyle = gold; g.beginPath(); g.arc(0, 0, s * 0.52, 0, 7); g.fill(); break;
      case 'moon':
        g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(0, 0, s * 0.75, Math.PI * 0.35, Math.PI * 1.65); g.arc(s * 0.32, 0, s * 0.58, Math.PI * 1.55, Math.PI * 0.45, true); g.fill(); break;
      case 'star':
        g.fillStyle = gold; g.beginPath();
        for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? s * 0.38 : s * 0.9; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        g.fill(); break;
      case 'heart':
        g.fillStyle = '#ff3d7f'; g.beginPath(); g.moveTo(0, s * 0.8);
        g.bezierCurveTo(-s * 1.1, 0, -s * 0.6, -s * 0.85, 0, -s * 0.3); g.bezierCurveTo(s * 0.6, -s * 0.85, s * 1.1, 0, 0, s * 0.8); g.fill(); break;
      case 'clock': {
        g.fillStyle = '#fff8e0'; g.strokeStyle = '#3a2a10'; g.lineWidth = s * 0.14;
        g.beginPath(); g.arc(0, 0, s * 0.85, 0, 7); g.fill(); g.stroke();
        const d = new Date(), hr = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * 2 * Math.PI, mn = d.getMinutes() / 60 * 2 * Math.PI;
        g.lineWidth = s * 0.13; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(hr) * s * 0.42, -Math.cos(hr) * s * 0.42); g.stroke();
        g.lineWidth = s * 0.09; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(mn) * s * 0.66, -Math.cos(mn) * s * 0.66); g.stroke(); break; }
      case 'crown':
        g.fillStyle = gold; g.beginPath(); g.moveTo(-s * 0.85, s * 0.5); g.lineTo(-s * 0.85, -s * 0.45); g.lineTo(-s * 0.4, 0); g.lineTo(0, -s * 0.7); g.lineTo(s * 0.4, 0); g.lineTo(s * 0.85, -s * 0.45); g.lineTo(s * 0.85, s * 0.5); g.closePath(); g.fill(); break;
      case 'flame': {
        const f = 1 + Math.sin(t * 9) * 0.06;
        g.fillStyle = '#ff7a1a'; g.beginPath(); g.moveTo(0, -s * 0.95 * f); g.bezierCurveTo(s * 0.9, -s * 0.1, s * 0.6, s * 0.8, 0, s * 0.8); g.bezierCurveTo(-s * 0.6, s * 0.8, -s * 0.9, -s * 0.1, 0, -s * 0.95 * f); g.fill();
        g.fillStyle = '#ffd23f'; g.beginPath(); g.ellipse(0, s * 0.35, s * 0.28, s * 0.4, 0, 0, 7); g.fill(); break; }
      case 'leaf':
        g.fillStyle = '#5fd36a'; g.beginPath(); g.ellipse(0, 0, s * 0.42, s * 0.85, 0.6, 0, 7); g.fill();
        g.strokeStyle = '#2f7a3a'; g.lineWidth = s * 0.08; g.beginPath(); g.moveTo(-s * 0.45, s * 0.6); g.lineTo(s * 0.45, -s * 0.6); g.stroke(); break;
      case 'lightning':
        g.fillStyle = '#ffe14a'; g.beginPath(); g.moveTo(s * 0.2, -s * 0.95); g.lineTo(-s * 0.55, s * 0.12); g.lineTo(-s * 0.02, s * 0.12); g.lineTo(-s * 0.25, s * 0.95); g.lineTo(s * 0.55, -s * 0.15); g.lineTo(s * 0.02, -s * 0.15); g.closePath(); g.fill(); break;
      case 'diamond':
        g.fillStyle = '#7cf0ff'; g.beginPath(); g.moveTo(0, -s * 0.9); g.lineTo(s * 0.7, 0); g.lineTo(0, s * 0.9); g.lineTo(-s * 0.7, 0); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.moveTo(0, -s * 0.9); g.lineTo(s * 0.25, 0); g.lineTo(0, s * 0.3); g.lineTo(-s * 0.25, 0); g.closePath(); g.fill(); break;
      case 'snake':
        g.strokeStyle = '#4fd36a'; g.lineWidth = s * 0.28; g.beginPath();
        for (let k = 0; k <= 16; k++) { const u = k / 16, x = -s * 0.85 + u * s * 1.7, y = Math.sin(u * 6.28 + t * 3) * s * 0.35; k ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke(); g.fillStyle = '#2f9a45'; g.beginPath(); g.arc(s * 0.9, Math.sin(6.28 + t * 3) * s * 0.35, s * 0.24, 0, 7); g.fill(); break;
    }
    g.restore();
  }

  // ---------- отрисовка ----------
  // P(wx, wy, wz) — проекция мира на экран; z — зум камеры
  function draw(g, P, hs, t, z) {
    const R = hs.rec, poly = (pts, fill) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fillStyle = fill; g.fill(); };
    const inset = { house: .14, tower: .3, castle: .1, skyscraper: .18, dome: .14, clocktower: .28 }[R.shape];
    const fh = { house: .55, tower: .6, castle: .5, skyscraper: .62, dome: .5, clocktower: .58 }[R.shape];
    const baseH = R.floors * fh + (R.shape === 'skyscraper' ? 0.6 : 0) + (R.shape === 'clocktower' || R.shape === 'tower' ? 0.5 : 0);
    const grow = Math.max(0, Math.min(1, (t - (hs.appear || 0)) / 0.6)), s = grow < 1 ? 1 - Math.pow(1 - grow, 3) * Math.cos(grow * 9) : 1;
    const { x, y } = hs, x0 = x + inset, y0 = y + inset, x1 = x + 1 - inset, y1 = y + 1 - inset, hh = baseH * s;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, win = LIGHTS[R.lights];
    const box = (a0, b0, a1, b1, z0, z1, wall) => {
      poly([P(a1, b0, z0), P(a1, b1, z0), P(a1, b1, z1), P(a1, b0, z1)], shade(wall, 0.62));
      poly([P(a0, b1, z0), P(a1, b1, z0), P(a1, b1, z1), P(a0, b1, z1)], shade(wall, 0.85));
    };
    const top = (a0, b0, a1, b1, zz, col) => poly([P(a0, b0, zz), P(a1, b0, zz), P(a1, b1, zz), P(a0, b1, zz)], col);
    const pyramid = (a0, b0, a1, b1, zz, apex, col, o = 0.08) => {
      const mx = (a0 + a1) / 2, my = (b0 + b1) / 2;
      poly([P(a0 - o, b0 - o, zz), P(a1 + o, b0 - o, zz), P(mx, my, apex)], shade(col, 1.0));
      poly([P(a0 - o, b0 - o, zz), P(a0 - o, b1 + o, zz), P(mx, my, apex)], shade(col, 0.95));
      poly([P(a1 + o, b0 - o, zz), P(a1 + o, b1 + o, zz), P(mx, my, apex)], shade(col, 0.7));
      poly([P(a0 - o, b1 + o, zz), P(a1 + o, b1 + o, zz), P(mx, my, apex)], shade(col, 0.85));
    };
    // тень
    poly([P(x0, y0), P(x1 + .35, y0 + .2), P(x1 + .35, y1 + .35), P(x0 + .2, y1 + .35)], 'rgba(0,0,15,.35)');
    box(x0, y0, x1, y1, 0, hh, R.wall);
    // окна
    if (z > 0.55 && s > 0.3) {
      const floors = R.shape === 'skyscraper' ? R.floors * 2 : R.floors, cols = (x1 - x0) > 0.55 ? 2 : 1;
      for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
        const v0 = (f + 0.3) * hh / floors, v1 = (f + 0.75) * hh / floors;
        const u0 = cols === 2 ? 0.18 + c * 0.38 : 0.35, u1 = u0 + (cols === 2 ? 0.22 : 0.3);
        const day = window.CITY_DAY || 0, col = day > 0.5 ? (hs.lit[(f * 2 + c) % 12] ? '#bfe3ff' : '#8fb6d9') : (hs.lit[(f * 2 + c) % 12] ? win : '#2a3156');
        poly([P(x1 + .001, y0 + (y1 - y0) * u0, v0), P(x1 + .001, y0 + (y1 - y0) * u1, v0), P(x1 + .001, y0 + (y1 - y0) * u1, v1), P(x1 + .001, y0 + (y1 - y0) * u0, v1)], col);
        poly([P(x0 + (x1 - x0) * u0, y1 + .001, v0), P(x0 + (x1 - x0) * u1, y1 + .001, v0), P(x0 + (x1 - x0) * u1, y1 + .001, v1), P(x0 + (x1 - x0) * u0, y1 + .001, v1)], col);
      }
    }
    let apexZ = hh;
    switch (R.shape) {
      case 'house': apexZ = hh + 0.6 * s; pyramid(x0, y0, x1, y1, hh, apexZ, R.roof); break;
      case 'tower': apexZ = hh + 1.0 * s; pyramid(x0, y0, x1, y1, hh, apexZ, R.roof, 0.06); break;
      case 'clocktower': {
        const bh = hh + 0.45 * s, i2 = 0.03;
        box(x0 + i2, y0 + i2, x1 - i2, y1 - i2, hh, bh, R.roof);
        apexZ = bh + 0.9 * s; pyramid(x0, y0, x1, y1, bh, apexZ, R.roof, 0.04);
        break; }
      case 'skyscraper': {
        top(x0, y0, x1, y1, hh, shade(R.roof, 0.95));
        const a = P(cx, cy, hh), b = P(cx, cy, hh + 0.7 * s);
        g.strokeStyle = '#9aa0c0'; g.lineWidth = Math.max(1, 2 * z); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        if (Math.sin(t * 4) > 0) { g.fillStyle = '#ff3b3b'; g.beginPath(); g.arc(b[0], b[1], 2.5 * z, 0, 7); g.fill(); }
        apexZ = hh + 0.7 * s; break; }
      case 'castle': {
        top(x0, y0, x1, y1, hh, shade(R.wall, 1.0));
        const m = 0.14, mh = 0.18 * s, n = 4;
        const merlon = (a, b) => { box(a, b, a + m, b + m, hh, hh + mh, R.wall); top(a, b, a + m, b + m, hh + mh, shade(R.wall, 1.05)); };
        for (let k = 0; k < n; k++) merlon(x0 + k * (x1 - x0 - m) / (n - 1), y0);
        for (let k = 1; k < n; k++) merlon(x0, y0 + k * (y1 - y0 - m) / (n - 1));
        for (let k = 1; k < n; k++) merlon(x1 - m, y0 + k * (y1 - y0 - m) / (n - 1));
        for (let k = 1; k < n - 1; k++) merlon(x0 + k * (x1 - x0 - m) / (n - 1), y1 - m);
        // угловая башенка с флагом
        const tx0 = x1 - .22, ty0 = y1 - .22; box(tx0, ty0, x1 + .02, y1 + .02, hh, hh + .45 * s, R.wall);
        pyramid(tx0, ty0, x1 + .02, y1 + .02, hh + .45 * s, hh + .8 * s, R.roof, 0.02);
        apexZ = hh + .8 * s; break; }
      case 'dome': {
        top(x0, y0, x1, y1, hh, shade(R.wall, 0.95));
        const c = P(cx, cy, hh), rx = (x1 - x0) * 0.62 * 32 * z * 1.41, ry = rx * 0.5, dh = 0.75 * s * 30 * z;
        g.fillStyle = shade(R.roof, 0.85); g.beginPath(); g.ellipse(c[0], c[1], rx, ry, 0, 0, Math.PI); g.lineTo(c[0] - rx, c[1]);
        g.ellipse(c[0], c[1], rx, dh + ry * 0.2, 0, Math.PI, 2 * Math.PI); g.fill();
        g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(c[0] - rx * 0.3, c[1] - dh * 0.55, rx * 0.25, dh * 0.3, -0.4, 0, 7); g.fill();
        apexZ = hh + 0.75 * s; break; }
    }
    // эмблема
    const em = R.shape === 'clocktower' && R.emblem === 'none' ? 'clock' : R.emblem;
    if (em !== 'none' && s > 0.6) {
      const size = 7.5 * z * (R.shape === 'tower' || R.shape === 'clocktower' ? 0.8 : 1);
      if (R.shape === 'clocktower') {
        const zc = hh + 0.22 * s;
        const pa = P(x1 - 0.03, cy, zc), pb = P(cx, y1 - 0.03, zc);
        emblem(g, em, pa[0], pa[1], size * 0.9, t); emblem(g, em, pb[0], pb[1], size * 0.9, t);
      } else {
        const zc = R.shape === 'dome' ? hh + 0.4 * s : R.shape === 'castle' ? hh * 0.62 : hh * 0.7;
        const p = R.shape === 'dome' ? P(cx, cy, zc) : P(cx, y1 + 0.01, zc);
        g.globalAlpha = 0.35; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(p[0], p[1], size * 1.25, 0, 7); g.fill(); g.globalAlpha = 1;
        emblem(g, em, p[0], p[1], size, t);
      }
    }
    hs.apex = P(cx, cy, apexZ);
  }

  window.CityHouse = { build, draw, normRecipe, SHAPES, EMBLEMS, LIGHTS: Object.keys(LIGHTS) };
})();
