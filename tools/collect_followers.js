// Сборщик подписчиков TikTok для «Города подписчиков» (v3).
// 1. Открой https://www.tiktok.com/@eben51041 (ты должен быть залогинен).
// 2. F12 → Console → (если просит) напечатай: allow pasting → вставь ВЕСЬ код → Enter.
// 3. Через ~2 минуты скачается followers_ДАТА.json → кидай его на страницу update.html.
// Скрипт только читает твой список подписчиков порциями по 30, как это делает сама страница.
(async () => {
  const badge = Object.assign(document.createElement('div'), { style: 'position:fixed;z-index:999999;left:16px;bottom:16px;padding:12px 16px;border-radius:12px;background:#ff3d7f;color:#fff;font:700 15px sans-serif;box-shadow:0 4px 20px #0006' });
  document.body.appendChild(badge);
  const say = t => { badge.textContent = '🏙 ' + t; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let secUid = null;
  try { secUid = JSON.parse(document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__').textContent).__DEFAULT_SCOPE__['webapp.user-detail'].userInfo.user.secUid; } catch (e) {}
  if (!secUid) { say('Открой свой профиль tiktok.com/@eben51041 и запусти снова'); return; }
  const seen = new Set(), order = [];
  let cursor = 0, total = '?';
  for (let page = 0; page < 2000; page++) {
    const u = `/api/user/list/?aid=1988&app_name=tiktok_web&device_platform=web_pc&count=30&maxCursor=0&minCursor=${cursor}&scene=67&secUid=${encodeURIComponent(secUid)}`;
    let j;
    try { j = await (await fetch(u, { credentials: 'include' })).json(); } catch (e) { say('Ошибка сети — запусти ещё раз'); return; }
    if (j.statusCode !== 0) { say('TikTok не отдал список (' + (j.status_msg || j.statusCode) + '). Ты залогинен?'); return; }
    total = j.total ?? total;
    for (const it of (j.userList || [])) { const n = (it.user && it.user.uniqueId || '').toLowerCase(); if (n && !seen.has(n)) { seen.add(n); order.push(n); } }
    say(`Собрано: ${order.length} из ${total}`);
    if (!j.hasMore || !j.minCursor || j.minCursor === cursor || !(j.userList || []).length) break;
    cursor = j.minCursor;
    await sleep(1200 + Math.random() * 800);
  }
  const data = { source: 'collector', order: 'newest_first', collected_at: new Date().toISOString(), count: order.length, nicks: order };
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })), download: `followers_${new Date().toISOString().slice(0, 10)}.json` });
  document.body.appendChild(a); a.click(); a.remove();
  say(`Готово: ${order.length} ников. Файл скачан.`);
})();
