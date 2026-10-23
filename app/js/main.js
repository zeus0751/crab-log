'use strict';
/* Startup, events, screen-awake, updates. */
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
document.addEventListener('pointerdown', e => { const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && e.target !== a && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) a.blur(); });
document.addEventListener('focusin', e => { if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350); });
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-a]'); if (!t) return; const f = ACT[t.dataset.a]; if (!f) return;
  try { const r = f(Object.assign(e, { dataset: t.dataset })); if (r && r.then) await r; } catch (err) { alert('Error: ' + err.message); }
});
function netBar() { document.getElementById('bar').classList.toggle('off', !navigator.onLine); }
addEventListener('online', netBar); addEventListener('offline', netBar);

let lock = null, wantLock = false;
async function getLock() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wantLock) getLock(); });
document.addEventListener('pointerdown', () => { if (!wantLock) { wantLock = true; getLock(); } }, { once: true });

async function checkUpdate() {
  const m = document.getElementById('updmsg'), say = t => { if (m) m.innerHTML = t; };
  say('Checking…');
  try {
    const r = await fetch('js/version.js?cb=' + Date.now(), { cache: 'no-store' }), t = await r.text(), v = (t.match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
    if (!v) { say('Could not read the newest version. Try again with a connection.'); return; }
    if (v === self.APP_VERSION) { say('You have the newest version (' + v + ').'); return; }
    say('Newest is ' + v + '; you have ' + self.APP_VERSION + '. Fetching it…');
    const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.update();
    await new Promise(r => setTimeout(r, 4000));
    const reg2 = await navigator.serviceWorker.getRegistration();
    if (reg2 && reg2.waiting) { say('Version ' + v + ' is ready. <button class="p sm" id="ap">Apply update</button>'); document.getElementById('ap').onclick = () => reg2.waiting.postMessage('SKIP_WAITING'); }
    else say('Version ' + v + ' is available but not installing by itself. <button class="p sm" data-a="forceRefresh">Refresh program (keeps your data)</button>');
  } catch (e) { say('Check failed: ' + e.message + ' (no connection?)'); }
}
async function forceRefresh() {
  const m = document.getElementById('updmsg');
  try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) if (k.startsWith('crabmetrics-cache-')) await caches.delete(k);
    if (m) m.textContent = 'Done. Reloading…'; setTimeout(() => location.reload(), 600);
  } catch (e) { if (m) m.textContent = 'Problem: ' + e.message; }
}
function offerUpdate(w) {
  const d = document.createElement('div'); d.className = 'warn'; d.innerHTML = 'A new version is ready. <button class="p sm" id="upd">Apply update</button>';
  document.body.insertBefore(d, document.getElementById('app')); document.getElementById('upd').onclick = () => w.postMessage('SKIP_WAITING');
}
if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => { const w = reg.installing; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w); }); });
    });
    let reloaded = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded) return; reloaded = true; location.reload(); });
  });
}
(async () => {
  await openDB(); await loadLists();
  let persisted = false;
  if (navigator.storage && navigator.storage.persist) { try { persisted = await navigator.storage.persist(); } catch (e) {} }
  netBar(); await render();
  const p = document.getElementById('persist'); if (p) p.textContent = persisted ? 'protected (persistent)' : 'not guaranteed';
  const t = await currentTrip(); if (t && S.screen === 'home') modal(`<h2>Trip ${t.trip_id} is still open</h2><button class="p big" data-a="go" data-s="hub">Resume trip</button> <button class="big" data-a="closeM">Not now</button>`);
})();
