// Сборщик подписчиков TikTok для «Города подписчиков» (v2).
// 1. Открой https://www.tiktok.com/@eben51041 → нажми на число «Подписчики».
// 2. F12 → Console → (если просит) напечатай: allow pasting → вставь ВЕСЬ код → Enter.
// Скрипт только листает список и читает ники. Ничего не нажимает и никуда не отправляет.
(async () => {
  const ME = 'eben51041';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const nickOf = a => { try { const m = new URL(a.href, location.href).pathname.match(/^\/@([A-Za-z0-9_.]{2,24})\/?$/); return m ? m[1].toLowerCase() : null; } catch (e) { return null; } };
  const scrollables = el => { const out = []; for (let p = el && el.parentElement; p; p = p.parentElement) { const oy = getComputedStyle(p).overflowY; if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 10) out.push(p); } out.push(document.scrollingElement); return out; };
  const root = () => document.querySelector('[role="dialog"]') || document;
  const badge = Object.assign(document.createElement('div'), { style: 'position:fixed;z-index:999999;left:16px;bottom:16px;padding:12px 16px;border-radius:12px;background:#ff3d7f;color:#fff;font:700 15px sans-serif;box-shadow:0 4px 20px #0006' });
  document.body.appendChild(badge);
  const say = t => { badge.textContent = '🏙 ' + t; };
  const seen = new Set(), order = [];
  let idle = 0;
  for (let round = 0; round < 6000 && idle < 20; round++) {
    const links = [...root().querySelectorAll('a[href*="/@"]')].filter(a => nickOf(a));
    let added = 0;
    for (const a of links) { const n = nickOf(a); if (n !== ME && !seen.has(n)) { seen.add(n); order.push(n); added++; } }
    if (!order.length && round > 3) { say('Не вижу ников — открой список «Подписчики» и запусти снова'); return; }
    const last = links[links.length - 1];
    if (last) {
      last.scrollIntoView({ block: 'end' });
      for (const s of scrollables(last)) s.scrollTop = s.scrollHeight;
      last.dispatchEvent(new WheelEvent('wheel', { deltaY: 900, bubbles: true }));
    }
    idle = added ? 0 : idle + 1;
    say(`Собрано: ${order.length}${idle > 2 ? ' · жду подгрузку… ' + idle + '/20' : ''}`);
    await sleep(idle > 2 ? 1500 : 900 + Math.random() * 600);
  }
  const data = { source: 'collector', order: 'newest_first', collected_at: new Date().toISOString(), count: order.length, nicks: order };
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })), download: `followers_${new Date().toISOString().slice(0, 10)}.json` });
  document.body.appendChild(a); a.click(); a.remove();
  say(`Готово: ${order.length} ников. Файл скачан.`);
})();
