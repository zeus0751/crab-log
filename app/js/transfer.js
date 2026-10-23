'use strict';
/* Data Transfer: sends trips to the CrabMaster_Data Google Sheet through the CrabMetrics Apps Script.
   Preview first, then write, then read back and compare before marking trips as sent. */
const XF_FORMULA = { Trips: ['season', 'month', 'day_of_season', 'duration_hours', 'engine_hours_used', 'loops_recorded', 'keepers_from_loops', 'loops_minus_typed', 'keepers_per_hour', 'season_cumulative_keepers'], Loops: ['count_total'] };
const xfObj = (cols, arr) => Object.fromEntries(cols.map((c, i) => [c, arr[i] ?? null]));
function xfNorm(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') { if (v.d !== undefined) return String(v.d); if (v.t !== undefined) { const m = String(v.t).match(/^(\d{1,2}):(\d{2})/); return m ? m[1].padStart(2, '0') + ':' + m[2] : String(v.t); } }
  return typeof v === 'string' ? v.trim() : v;
}
function xfSame(a, b) {
  a = xfNorm(a); b = xfNorm(b); if (a === '' && b === '') return true;
  if (a !== '' && b !== '' && !isNaN(Number(a)) && !isNaN(Number(b)) && (typeof a === 'number' || typeof b === 'number')) return Math.abs(Number(a) - Number(b)) < 1e-9;
  return String(a) === String(b);
}
async function xfCall(action, extra) {
  const url = await metaGet('xfer_url'), key = await metaGet('xfer_key');
  if (!url || !key) throw new Error('Data Transfer is not set up yet. Go to Settings → Data Transfer.');
  let r; try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ key, action }, extra || {})) }); }
  catch (e) { throw new Error('Could not reach Google. Check the Wi-Fi connection and the web address in Settings.'); }
  const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch (e) { throw new Error('Google did not answer as expected. The web address may be wrong, or the script is not deployed for "Anyone".'); }
  if (!j.ok) throw new Error(j.error || 'The script reported an error.'); return j;
}
async function xfBuild(all) {
  const g = await gatherAll(), done = g.trips.filter(t => t.status === 'COMPLETED'), cand = all ? done : done.filter(t => tripChanged(g, t));
  return { g, trips: cand.map(t => ({ trip_id: t.trip_id, row: xfObj(MASTER_TRIP_COLS, masterTripRow(g, t)), loops: masterLoopRows(g, t).map(r => xfObj(MASTER_LOOP_COLS, r)) })) };
}
SCREENS.transfer = async () => {
  const url = await metaGet('xfer_url'), key = await metaGet('xfer_key'), X = S.xf || (S.xf = {}), ok = !!(url && key), P = X.plan;
  const lb = await metaGet('xfer_last_at');
  const tbl = P ? `<table><tr><th>Trip</th><th>Sheet</th><th>Loops new</th><th>changed</th><th>removed</th></tr>${P.items.map(i => `<tr><td>${i.trip_id}</td><td>${{ new: 'new', changed: 'changed (' + i.changedCols.join(', ') + ')', same: 'already there' }[i.trip]}</td><td>${i.loops.new}</td><td>${i.loops.changed}</td><td>${i.loops.removed}</td></tr>`).join('')}</table>` : '';
  const todo = P ? P.trips.new + P.trips.changed + P.loops.new + P.loops.changed + P.loops.removed : 0;
  return `<h1>Data Transfer</h1>${ACTION_BAR('<button data-a="go" data-s="home">Home</button> <button data-a="go" data-s="settings">Settings</button>')}
 ${!ok ? '<div class="warn">Not set up yet. Open Settings → Data Transfer and enter the web address and key.</div>' : ''}
 <p class="mut">Needs Wi-Fi. Sends the finished trips that are not yet in the Google Sheet (or changed since). You see a preview first, nothing is written until you confirm.${lb ? ' Last transfer: ' + lb.slice(0, 16) + '.' : ''}</p>
 <div class="row"><button class="p big" data-a="xfCheck" data-v="new" ${ok ? '' : 'disabled'}>Check what will transfer</button><button class="big" data-a="xfCheck" data-v="all" ${ok ? '' : 'disabled'}>Compare ALL trips with the sheet</button></div>
 <div id="xfmsg" class="mut"></div>
 ${P ? `<div class="card"><b>${P.trips.new}</b> new trips, <b>${P.trips.changed}</b> changed, <b>${P.trips.same}</b> already there.<br>Loops: <b>${P.loops.new}</b> new, <b>${P.loops.changed}</b> changed, <b>${P.loops.removed}</b> removed (deleted in the app), ${P.loops.same} unchanged.</div>${tbl}
 ${todo ? `<button class="p big" data-a="xfGo">Transfer now</button>` : `<div class="card">Nothing to write.${P.trips.same ? ' <button class="sm" data-a="xfMark">Mark these ' + P.trips.same + ' trips as sent</button>' : ''}</div>`}` : ''}
 <div id="xfres"></div><!--ACT--><!--/ACT-->`;
};
const xfMsg = t => { const m = document.getElementById('xfmsg'); if (m) m.textContent = t; };
Object.assign(ACT, {
  async xfCheck(e) {
    xfMsg('Checking with the sheet…');
    try { const B = await xfBuild(e.dataset.v === 'all'); if (!B.trips.length) { S.xf = { plan: null }; render(); setTimeout(() => xfMsg('Nothing waiting: every finished trip is already marked as sent.'), 100); return; }
      const sum = await xfCall('plan', { trips: B.trips }); S.xf = { plan: sum, payload: B.trips }; render(); }
    catch (err) { xfMsg(err.message); }
  },
  async xfGo() {
    const X = S.xf; if (!X || !X.payload) return; xfMsg('Writing to the sheet…');
    try {
      await xfCall('commit', { trips: X.payload });
      const ids = X.payload.map(t => t.trip_id), back = await xfCall('read', { trip_ids: ids }), bad = [];
      for (const t of X.payload) {
        const sr = back.trips[t.trip_id]; if (!sr) { bad.push(t.trip_id + ': not found in the sheet'); continue; }
        for (const c of MASTER_TRIP_COLS) if (!XF_FORMULA.Trips.includes(c) && !xfSame(t.row[c], sr[c])) bad.push(`${t.trip_id} ${c}: app "${xfNorm(t.row[c])}" sheet "${sr[c]}"`);
        for (const l of t.loops) { const s2 = back.loops[l.loop_id]; if (!s2) { bad.push(l.loop_id + ': not found in the sheet'); continue; } for (const c of MASTER_LOOP_COLS) if (!XF_FORMULA.Loops.includes(c) && !xfSame(l[c], s2[c])) bad.push(`${l.loop_id} ${c}: app "${xfNorm(l[c])}" sheet "${s2[c]}"`); }
        const want = new Set(t.loops.map(l => l.loop_id)); for (const id of Object.keys(back.loops)) if (back.loops[id].trip_id === t.trip_id && !want.has(id)) bad.push(id + ': still in the sheet but not in the app');
      }
      const el = document.getElementById('xfres');
      if (bad.length) { el.innerHTML = `<div class="warn"><b>CHECK FAILED. Nothing was marked as sent.</b><br>${bad.slice(0, 12).map(esc).join('<br>')}${bad.length > 12 ? '<br>… ' + (bad.length - 12) + ' more' : ''}<br>The sheet may already hold some of this data; run Check again to see its state.</div>`; xfMsg(''); return; }
      for (const id of ids) await put('trips', { trip_id: id, master_exported_at: now() }, { noCount: true, quiet: true });
      await metaSet('xfer_last_at', now()); onSaved();
      S.xf = {}; await render(); const r2 = document.getElementById('xfres'); if (r2) r2.innerHTML = `<div class="card"><b>Transfer complete and verified.</b><br>${ids.length} trips and ${X.payload.reduce((a, t) => a + t.loops.length, 0)} loops were written, read back from the sheet and matched. They are now marked as sent.</div>`;
    } catch (err) { xfMsg(err.message); }
  },
  async xfMark() {
    const X = S.xf; if (!X || !X.payload) return; xfMsg('Verifying…');
    try { const ids = X.payload.map(t => t.trip_id), back = await xfCall('read', { trip_ids: ids });
      for (const id of ids) if (back.trips[id]) await put('trips', { trip_id: id, master_exported_at: now() }, { noCount: true, quiet: true });
      S.xf = {}; await render(); xfMsg('Marked as sent.'); } catch (err) { xfMsg(err.message); }
  },
  xfSetUrl() { metaGet('xfer_url', '').then(u => textDialog('Web address', 'Paste the web app URL from the script deployment', u, async v => { if (v && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(v)) { alert('That does not look like the web app address. It starts with https://script.google.com/macros/s/ and ends with /exec'); return false; } await metaSet('xfer_url', v || null); onSaved(); render(); })); },
  async xfKey() {
    const k = (await metaGet('xfer_key')) || '';
    modal(`<h2>Transfer key</h2><p>This key must be identical in the script (the line <code>const SECRET = '…'</code>) and here. Use at least 16 letters and numbers. Keep it private; it is never saved in backup files or on GitHub.</p><input type="text" id="xk" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(k)}" style="font-family:monospace"><div class="stick"><button class="p big" id="xks">Save key</button> <button id="xkr">Make a random key</button> <button id="xkc">Copy</button> <button data-a="closeM">Close</button></div>`);
    const inp = document.getElementById('xk');
    document.getElementById('xkr').onclick = () => { const a = new Uint8Array(24); crypto.getRandomValues(a); inp.value = Array.from(a, b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join(''); };
    document.getElementById('xkc').onclick = () => { inp.select(); try { navigator.clipboard.writeText(inp.value); } catch (e) { document.execCommand('copy'); } document.getElementById('xkc').textContent = 'Copied'; };
    document.getElementById('xks').onclick = async () => { const v = inp.value.trim(); if (v.length < 16 || /[\s'"\\]/.test(v)) { alert('The key needs at least 16 characters, with no spaces or quotation marks.'); return; } await metaSet('xfer_key', v); onSaved(); closeModal(); render(); };
  },
  async xfTest() { const m = document.getElementById('xftest'); m.textContent = 'Testing…'; try { const r = await xfCall('ping'); m.textContent = 'Connected to "' + r.sheet + '" (script ' + r.version + ').'; } catch (err) { m.textContent = err.message; } }
});
