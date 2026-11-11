// Сборщик подписчиков TikTok для «Города подписчиков».
// Как запустить (на компе, в Chrome):
//   1. Открой https://www.tiktok.com/@eben51041 и нажми на число «Подписчики» — откроется список.
//   2. F12 → вкладка Console. Если Chrome просит — напечатай: allow pasting
//   3. Вставь ВЕСЬ этот файл и нажми Enter. Не закрывай вкладку, пока не скачается файл.
// Скрипт только листает список и читает ники. Ничего не нажимает и никуда не отправляет.
(async () => {
  const ME = 'eben51041';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const nickOf = a => { try { const m = new URL(a.href, location.href).pathname.match(/^\/@([A-Za-z0-9_.]{2,24})\/?$/); return m ? m[1].toLowerCase() : null; } catch (e) { return null; } };
  const findList = () => {
    let best = null, bestN = 2;
    for (const el of document.querySelectorAll('div,ul,section')) {
      if (el.scrollHeight <= el.clientHeight + 40) continue;
      const oy = getComputedStyle(el).overflowY; if (oy !== 'auto' && oy !== 'scroll') continue;
      const n = el.querySelectorAll('a[href*="/@"]').length; if (n > bestN) { best = el; bestN = n; }
    }
    return best;
  };
  const badge = Object.assign(document.createElement('div'), { style: 'position:fixed;z-index:999999;left:16px;bottom:16px;padding:12px 16px;border-radius:12px;background:#ff3d7f;color:#fff;font:700 15px sans-serif;box-shadow:0 4px 20px #0006' });
  document.body.appendChild(badge);
  const say = t => { badge.textContent = '🏙 ' + t; };

  let box = findList();
  if (!box) { say('Открой список «Подписчики» и запусти снова'); return; }
  const seen = new Set(), order = [];
  let idle = 0, lastTop = -1;
  for (let round = 0; round < 5000 && idle < 12; round++) {
    box = box.isConnected ? box : (findList() || box);
    let added = 0;
    for (const a of box.querySelectorAll('a[href*="/@"]')) { const n = nickOf(a); if (n && n !== ME && !seen.has(n)) { seen.add(n); order.push(n); added++; } }
    box.scrollTop = box.scrollHeight;
    idle = added === 0 && box.scrollTop === lastTop ? idle + 1 : 0;
    lastTop = box.scrollTop;
    say(`Собрано: ${order.length}${idle ? ' · жду подгрузку…' : ''}`);
    await sleep(900 + Math.random() * 700);
  }
  const data = { source: 'collector', order: 'newest_first', collected_at: new Date().toISOString(), count: order.length, nicks: order };
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })), download: `followers_${new Date().toISOString().slice(0, 10)}.json` });
  document.body.appendChild(a); a.click(); a.remove();
  say(`Готово: ${order.length} ников. Файл скачан.`);
  console.log('Подписчиков собрано:', order.length);
})();
