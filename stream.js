// Стрим «Город подписчиков LIVE»: город + реакции на эфир (подписка → дом вырастает, ник в чате → камера к дому, подарки → салют).
// События приходят с локального сервера (stream_server.py) по WebSocket. Без сервера — просто красивая экскурсия по городу.
import { City3D, riverZ, blockCenter, LANDMARK_BLOCKS } from './city3d.js';

const $ = id => document.getElementById(id);
const HIDE = /1488|14\.88|14_88|88\.14|nazi|hitler|adolf|fuck|fak|sperma|sex|porno|dildo|penis|pisun|pisduk|pizd|puzd|pidor|pidar|pedik|gay|gei_|dolboeb|dolbaeb|dolbaep|droch|ebani|ebanu|zaeba|naeb|hui|huy|xyi|xye|xyu|zalup|drochi|dro4|mazafuk|bitch|dick|fag|negr|sukibl|blyat|blyad|govno|govna|kokain|kanabis|narko|nekushay/;
const norm = s => String(s || '').trim().replace(/^@+/, '').toLowerCase();
const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, u) => a + (b - a) * u;
const ease = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const back = u => { const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
const L3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const fmt = n => n.toLocaleString('ru');
const getJSON = async f => { try { const r = await fetch(f + '?v=' + Date.now()); return r.ok ? await r.json() : null; } catch (e) { return null; } };

const city = new City3D($('c'), $('lbl')); window.city = city;
let list = [], byKey = new Map(), ms = [], hall = null;
const labelOf = (k, i) => HIDE.test(k) && !/^user\d+$/.test(k) ? 'Житель №' + (i + 1) : '@' + k;

async function loadCity() {
  const [subs, m, el, sp, rc] = await Promise.all(['subscribers.json', 'milestones.json', 'election.json', 'special.json', 'recipes.json'].map(getJSON));
  if (!Array.isArray(subs) || !subs.length) return false;
  const nl = [], nb = new Map();
  for (const n of subs) { const gone = String(n).startsWith('~'), k = norm(String(n).replace(/^~/, '')); if (k && !nb.has(k)) { const it = { nick: '@' + k, key: k, recipe: null, gone }; nb.set(k, it); nl.push(it); } }
  // гости, ставшие жителями прямо в эфире, остаются в конце списка
  for (const it of list) if (it.live && !nb.has(it.key)) { nb.set(it.key, it); nl.push(it); }
  nl.forEach((it, i) => it.label = labelOf(it.key, i));
  for (const rows of [sp, rc]) for (const r of rows || []) { const ex = nb.get(norm(r.nick)), nr = r.recipe && window.CityHouse?.normRecipe(r.recipe); if (ex && nr && !ex.gone) ex.recipe = { ...r.recipe, ...nr }; }
  list = nl; byKey = nb; ms = Array.isArray(m) ? m : ms; hall = el && el.winner ? { open: true, title: 'Ратуша · мэр @' + norm(el.winner) } : null;
  city.setCity(list, ms, hall); updCount(); return true;
}
const updCount = () => { $('cnt').innerHTML = `🏠 <b>${fmt(city.houses.filter(h => !h.gone).length)}</b> домов`; };

// ---------- частицы (2D поверх города) ----------
const fx = $('fx'), g2 = fx.getContext('2d'); let parts = [];
const fit = () => { fx.width = innerWidth; fx.height = innerHeight; }; fit(); addEventListener('resize', fit);
const COLS = ['#ffd23f', '#ff3d7f', '#5ef2ff', '#a6ff8f', '#ffffff', '#c084fc'];
function burst(x, y, n = 70, sp = 1, cols = COLS) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = (.25 + Math.random() * .75) * innerWidth * .55 * sp;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * .85 - innerWidth * .12, life: 1.4 + Math.random() * .8, t: 0, s: innerWidth * (.004 + Math.random() * .006), c: cols[i % cols.length] }); }
}
function firework(k = 1) { for (let i = 0; i < k; i++) setTimeout(() => { burst(innerWidth * (.2 + Math.random() * .6), innerHeight * (.2 + Math.random() * .3), 80, .8); sfx('boom', 2); }, i * 350); }
function drawFx(dt) {
  g2.clearRect(0, 0, fx.width, fx.height); g2.globalCompositeOperation = 'lighter';
  parts = parts.filter(p => (p.t += dt) < p.life);
  for (const p of parts) { p.vy += innerWidth * .5 * dt; p.vx *= .985; p.vy *= .985; p.x += p.vx * dt; p.y += p.vy * dt; const a = 1 - p.t / p.life;
    g2.globalAlpha = a; g2.fillStyle = p.c; g2.shadowColor = p.c; g2.shadowBlur = 12; g2.beginPath(); g2.arc(p.x, p.y, p.s * (.5 + a * .5), 0, 7); g2.fill(); }
  g2.globalAlpha = 1; g2.globalCompositeOperation = 'source-over';
}

// ---------- надписи ----------
let banT = -1, banDur = 0;
function banner(k, n, a, dur = 6) { $('ban').querySelector('.k').textContent = k; $('ban').querySelector('.n').textContent = n; const A = $('ban').querySelector('.a'); A.textContent = a || ''; A.style.display = a ? '' : 'none'; banT = 0; banDur = dur; }
function tickBanner(dt) { const b = $('ban'); if (banT < 0) { b.style.opacity = 0; return; } banT += dt;
  const a = cl(banT / .45), out = cl((banDur - banT) / .4); b.style.opacity = cl(a * 2) * out; b.style.transform = `scale(${(a < 1 ? back(a) : 1) * (1 + Math.sin(banT * 3) * .01)})`; if (banT > banDur) banT = -1; }
let toastTimer = 0;
function toast(html, sec = 5) { $('toast').querySelector('span').innerHTML = html; $('toast').style.opacity = 1; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').style.opacity = 0, sec * 1000); }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const chatQ = []; let chatBusy = false;
function chatNext() { if (chatBusy || !chatQ.length) return; chatBusy = true; sfx('pop'); const m = chatQ.shift(); $('chat').querySelector('span').innerHTML = `💬 <b>${esc(m.name)}:</b> ${esc(m.text)}`; $('chat').style.opacity = 1;
  setTimeout(() => { $('chat').style.opacity = 0; setTimeout(() => { chatBusy = false; chatNext(); }, 600); }, 7000); }

// ---------- лайки: «Зажги город» ----------
let likes = 0, goal = 5000;
function setLikes(total) { likes = Math.max(likes, total); while (likes >= goal) { firework(6); sfx('goal', 3); banner('❤️ ЦЕЛЬ ВЗЯТА!', 'ГОРОД ЗАЖЁГСЯ!', `${fmt(goal)} лайков — спасибо! Следующая цель ${fmt(goal * 2)}`, 6); goal *= 2; }
  $('likes').querySelector('span').textContent = `${fmt(likes)} / ${fmt(goal)}`; $('likes').querySelector('i').style.width = cl(likes / goal) * 100 + '%'; }

// ---------- камера: кадры с плавным переходом ----------
let shot = null, shotT = 0, fromPose = null, pose = { p: [40, 40, 60], t: [2, 0, 2] };
function startShot(s) { city.hi = null; fromPose = { p: [...pose.p], t: [...pose.t] }; shot = s; shotT = 0; }
const orbit = (c, r, y, a) => [c[0] + Math.sin(a) * r, y, c[1] + Math.cos(a) * r];
function applyCam(dt) {
  if (!shot) return; shotT += dt; const sp = shot.pose(shotT), b = ease(cl(shotT / (shot.blend ?? 1.6)));
  pose = { p: L3(fromPose.p, sp.p, b), t: L3(fromPose.t, sp.t, b) };
  city.camOverride = { p: pose.p, t: pose.t, fov: 46 };
  const d = Math.hypot(pose.p[0] - pose.t[0], pose.p[1] - pose.t[1], pose.p[2] - pose.t[2]);
  city.ctl.x = city.ctl.tx = pose.t[0]; city.ctl.z = city.ctl.tz = pose.t[2]; city.ctl.d = city.ctl.td = sp.d ?? d;
  city.noLmLabels = !!sp.noLm; shot.tick?.(shotT, dt);
}

// ---------- экскурсия, когда событий нет ----------
const rnd = a => a[(Math.random() * a.length) | 0];
const TOUR = [
  () => { const x0 = (Math.random() * 2 - 1) * 20, dir = Math.random() < .5 ? 1 : -1; return { dur: 12, pose: t => { const x = x0 + dir * t * 1.6; return { p: [x - dir * 5, 2.6, riverZ(x - dir * 5) + 4.5], t: [x + dir * 4, 0, riverZ(x + dir * 4)], d: 30, noLm: true }; } }; },
  () => ({ dur: 14, pose: t => ({ p: orbit([2, 2], 52, 40, t * .05 + 1), t: [2, 0, 2], d: 40 }) }),
  () => { const pl = rnd(city.places || []); if (!pl) return null; return { dur: 10, pose: t => ({ p: orbit([pl.x, pl.z], 3.2, 2.1, t * .25), t: [pl.x, .4, pl.z], d: 12 }), tick: t => { if (t > .8 && t < .9) toast(`📍 ${esc(pl.name)}`, 4); } }; },
  () => { const hs = city.houses.filter(h => !h.gone); const h = rnd(hs); if (!h) return null; return { dur: 9, pose: t => ({ p: orbit([h.x, h.z], 4, 2.6, t * .25), t: [h.x, 1.1, h.z], d: 6 }),
    tick: t => { if (t < .05) { city.focus(h, false); const ad = city.address(h); banner(`🏠 ЖИТЕЛЬ №${fmt(h.n)}`, h.label, `📍 ${ad.text} · ${ad.district}`, 7); } } }; },
  () => { const k = Math.round((Math.random() * 2 - 1) * 8) * 3 + .5, z0 = (Math.random() * 2 - 1) * 15; return { dur: 11, pose: t => ({ p: [k + .2, 1.2, z0 + t * 1.1 - 2.5], t: [k + .2, .5, z0 + t * 1.1 + 2], d: 8 }) }; },
  () => { const [cx, cz] = blockCenter(LANDMARK_BLOCKS[0]); return { dur: 10, pose: t => ({ p: orbit([cx, cz], 8, 5, 3.6 + t * .12), t: [cx, .6, cz], d: 13 }) }; },
];
let tourI = 0;
function nextTour() { let s = null; for (let k = 0; k < TOUR.length && !s; k++) s = TOUR[(tourI++) % TOUR.length](); s = s || TOUR[1](); s.tour = true; return s; }

// ---------- очередь событий ----------
const Q = [], lastVisit = new Map(); let nudgeT = 0;
function enqueue(job) { if (job.prio) Q.unshift(job); else if (Q.length < 10) Q.push(job); }
function visitShot(h, title, sub, dur = 8) {
  return { dur, pose: t => ({ p: orbit([h.x, h.z], lerp(5.5, 3.9, ease(cl(t / 3))), lerp(4, 2.7, ease(cl(t / 3))), .6 + t * .22), t: [h.x, 1.15, h.z], d: 6 }),
    tick: t => { if (t < .05) { sfx('visit'); city.focus(h, false); const ad = city.address(h); const nb = city.neighbors(h).filter(o => !o.h.gone).slice(0, 2).map(o => o.h.label).join(', ');
      banner(title, h.label, sub || `📍 ${ad.text} · ${ad.district}${nb ? `\nСоседи: ${nb}` : ''}`, dur - .6); } } };
}
async function runJob(j) {
  if (j.type === 'follow') {
    let h = city.byKey.get(j.nick);
    if (!h) { const it = { nick: '@' + j.nick, key: j.nick, recipe: null, gone: false, live: true }; it.label = labelOf(j.nick, list.length); list.push(it); byKey.set(j.nick, it); city.setCity(list, ms, hall); updCount(); h = city.byKey.get(j.nick); }
    else if (h.gone) { const it = byKey.get(j.nick); it.gone = false; city.setCity(list, ms, hall); updCount(); h = city.byKey.get(j.nick); }
    if (!h) return;
    const H = h, grow = 2.2;
    return { dur: 10, blend: 1.4, pose: t => { const e = ease(cl(t / 2.4)); return { p: L3([H.x + 10, 14, H.z + 14], orbit([H.x, H.z], 4, 2.7, .7 + t * .18), e), t: [H.x, lerp(.45, 1.15, e), H.z], d: lerp(20, 6, e) }; },
      tick: (t, dt) => { const g = cl((t - grow) / 1.1); if (t < grow + 1.3) city.setGrowth(H.n + g, 1); else if (!H._grown) { H._grown = 1; city.setGrowth(Infinity); }
        if (g > .05 && !H._boom) { H._boom = 1; sfx('build', 4); const p = city.project(H.x, .6, H.z); if (p) burst(p[0], p[1], 110, 1.1); city.focus(H, false); }
        if (t > grow && !H._ban) { H._ban = 1; const ad = city.address(H); banner('🎉 НОВЫЙ ЖИТЕЛЬ!', H.label, `Дом №${fmt(H.n)} · 📍 ${ad.text}`, 7); } } };
  }
  if (j.type === 'visit') { const h = city.byKey.get(j.nick); return h && !h.gone ? visitShot(h, j.title || '📍 ВОТ ТВОЙ ДОМ', null, 8) : null; }
  return null;
}

// ---------- звук: фоновая музыка + синтезированные эффекты событий ----------
const SND = { ac: null, music: null, on: false, duckT: 0 };
const MUSIC_VOL = .32;
function audioOn() {
  if (SND.on) return;
  try { SND.ac = SND.ac || new (window.AudioContext || window.webkitAudioContext)(); SND.ac.resume(); } catch (e) {}
  if (!SND.music) { SND.music = new Audio('media/stream_music.mp3'); SND.music.loop = true; SND.music.volume = MUSIC_VOL; }
  SND.music.play().then(() => { SND.on = true; $('off').textContent = ''; }).catch(() => { $('off').textContent = '· нажми M — включить звук ·'; });
}
function tone(f, t0, d, type = 'sine', v = .16, f2 = 0) {
  const ac = SND.ac; if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(), s = ac.currentTime + t0;
  o.type = type; o.frequency.setValueAtTime(f, s); if (f2) o.frequency.exponentialRampToValueAtTime(f2, s + d);
  g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(v, s + .015); g.gain.exponentialRampToValueAtTime(.0001, s + d);
  o.connect(g).connect(ac.destination); o.start(s); o.stop(s + d + .05);
}
function noise(t0, d, v = .25, f = 1200) {
  const ac = SND.ac; if (!ac) return; const n = Math.floor(ac.sampleRate * d), b = ac.createBuffer(1, n, ac.sampleRate), x = b.getChannelData(0);
  for (let i = 0; i < n; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
  const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain(), s = ac.currentTime + t0;
  bp.type = 'lowpass'; bp.frequency.value = f; g.gain.value = v; src.buffer = b; src.connect(bp).connect(g).connect(ac.destination); src.start(s);
}
const SFX = {
  build: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * .1, .6, 'triangle', .13)); tone(2093, .55, 1.4, 'sine', .07); noise(0, .9, .12, 600); },
  boom: () => { tone(160, 0, .7, 'sine', .3, 45); noise(0, 1.1, .35, 2500); for (let i = 0; i < 6; i++) noise(.25 + Math.random() * .5, .12, .08, 6000); },
  whoosh: () => { tone(300, 0, .9, 'sine', .05, 900); noise(0, .7, .1, 1500); },
  visit: () => { tone(880, 0, .3, 'sine', .11); tone(1320, .12, .6, 'sine', .09); },
  pop: () => tone(740, 0, .12, 'triangle', .06, 1100),
  goal: () => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * .14, .5, 'square', .05)); [523, 659, 784].forEach(f => tone(f, .75, 1.6, 'triangle', .1)); },
};
function sfx(k, duck = 0) {
  if (!SND.on || !SND.ac) return; try { SFX[k](); } catch (e) {}
  if (duck && SND.music) { SND.music.volume = MUSIC_VOL * .45; clearTimeout(SND.duckT); SND.duckT = setTimeout(() => { SND.music.volume = MUSIC_VOL; }, duck * 1000); }
}
addEventListener('keydown', e => { if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') { if (SND.on) { SND.music.pause(); SND.on = false; } else audioOn(); } else audioOn(); });

function onEvent(e) {
  if (e.type === 'follow' && e.nick) { enqueue({ type: 'follow', nick: norm(e.nick), prio: true }); sfx('whoosh'); toast(`➕ <b>@${esc(e.nick)}</b> подписался — строим дом!`, 4); }
  else if (e.type === 'comment' && e.nick) {
    const me = norm(e.nick), words = (e.text || '').toLowerCase().match(/@?[a-z0-9._]{3,24}/g) || [];
    const target = words.map(norm).find(w => city.byKey.has(w) && w !== me) || (city.byKey.has(me) ? me : null);
    if (target && (Date.now() - (lastVisit.get(target) || 0)) > 180000) { lastVisit.set(target, Date.now()); enqueue({ type: 'visit', nick: target, title: target === me ? '📍 ВОТ ТВОЙ ДОМ' : `📍 ДОМ @${target}` }); }
    else if (!city.byKey.has(me) && Date.now() - nudgeT > 25000) { nudgeT = Date.now(); toast(`👋 <b>@${esc(e.nick)}</b>, подпишись — и твой дом вырастет прямо в эфире!`, 6); }
  } else if (e.type === 'gift') { const n = Math.min(8, 1 + Math.floor(Math.log2(1 + (e.diamonds || 1) * (e.count || 1)))); firework(n); toast(`🎁 <b>@${esc(e.nick)}</b> — ${esc(e.gift)}${e.count > 1 ? ' ×' + e.count : ''}! Спасибо! 🎆`, 6);
    if (city.byKey.has(norm(e.nick))) enqueue({ type: 'visit', nick: norm(e.nick), title: '🎁 СПАСИБО ЗА ПОДАРОК!' }); }
  else if (e.type === 'like') setLikes(e.total || likes + (e.count || 0));
  else if (e.type === 'chat' && e.text) { chatQ.push(e); if (chatQ.length > 6) chatQ.shift(); chatNext(); }
  else if (e.type === 'hello') { if (e.likes) setLikes(e.likes); }
}

// ---------- связь с сервером ----------
function connect() {
  let ws; try { ws = new WebSocket(`ws://${location.host || '127.0.0.1:8766'}/ws`); } catch (e) { return setTimeout(connect, 5000); }
  ws.onopen = () => { $('off').textContent = ''; };
  ws.onmessage = m => { try { onEvent(JSON.parse(m.data)); } catch (e) { console.warn(e); } };
  ws.onclose = () => { $('off').textContent = '· нет связи с сервером стрима ·'; setTimeout(connect, 4000); };
}

// ---------- главный цикл ----------
let busy = false, last = performance.now(), idleReload = 0;
async function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  // события прерывают экскурсию сразу (подписка — даже чужой показ дома, если он идёт дольше 4 с)
  if (shot && Q.length && !busy && (shot.tour ? shotT > 1 : (Q[0].prio && shotT > 4))) shotT = shot.dur + 1;
  if ((!shot || shotT > shot.dur) && !busy) {
    busy = true; let s = null;
    while (!s && Q.length) s = await runJob(Q.shift());
    if (!s && performance.now() - idleReload > 600000) { idleReload = performance.now(); await loadCity(); }
    startShot(s || nextTour()); busy = false;
  }
  applyCam(dt); tickBanner(dt);
  city.frame(dt); drawFx(dt);
  requestAnimationFrame(loop);
}

// телефон: нажатие — полный экран (без адресной строки), чтобы транслировать экран в эфир TikTok
addEventListener('click', () => { audioOn(); const d = document.documentElement; (d.requestFullscreen || d.webkitRequestFullscreen)?.call(d); try { screen.orientation?.lock?.('portrait'); } catch (e) {} });
(async () => {
  for (let i = 0; i < 20 && !(await loadCity()); i++) await new Promise(r => setTimeout(r, 3000));
  idleReload = performance.now(); setLikes(0); connect(); audioOn(); requestAnimationFrame(loop);
})();
