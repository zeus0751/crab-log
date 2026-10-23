'use strict';
/* Settings, editable lists, merge spots, storage status. Uses helpers from ui.js and history.js. */

/* ---------- editable lists (gear, bait, event types) ---------- */
/* Base lists live in ui.js. Changes are kept in meta 'lists_custom'. Retired values stay valid in history. */
const BASE_LISTS = { equipment: EQS.map(x => x.slice(0, 2)), bait: BAITS.map(x => x.slice(0, 2)), event: EVTYPES.map(x => x.slice(0, 2)) };
const LIVE_LISTS = { equipment: EQS, bait: BAITS, event: EVTYPES };
const LIST_TITLE = { equipment: 'Gear', bait: 'Bait', event: 'Event types' };
const onlyActive = arr => arr.filter(x => x[2] !== false);
async function loadLists() {
  const cfg = await metaGet('lists_custom', {});
  for (const k of Object.keys(LIVE_LISTS)) {
    const c = cfg[k] || {}, items = BASE_LISTS[k].map(([code, label]) => [code, (c.label && c.label[code]) || label, !(c.off || []).includes(code)]);
    for (const [code, label] of (c.add || [])) items.push([code, (c.label && c.label[code]) || label, !(c.off || []).includes(code)]);
    LIVE_LISTS[k].length = 0; items.forEach(i => LIVE_LISTS[k].push(i));
  }
}
async function saveListCfg(fn) { const cfg = await metaGet('lists_custom', {}); fn(cfg); await metaSet('lists_custom', cfg); await loadLists(); onSaved(); }
const listCfgOf = (cfg, k) => (cfg[k] = cfg[k] || { add: [], off: [], label: {} });

SCREENS.lists = async () => `<h1>Edit lists</h1>${ACTION_BAR('<button data-a="go" data-s="settings">Back</button>')}
 <p class="mut">Add a value, rename it, or retire it. A retired value disappears from the choices but stays in every earlier trip. Renaming changes the label everywhere (the stored code does not change).</p>
 ${Object.keys(LIVE_LISTS).map(k => `<div class="card"><b>${LIST_TITLE[k]}</b>${LIVE_LISTS[k].map(([c, l, a]) => `<div class="row"><span>${esc(l)}${a === false ? ' <span class="mut">(retired)</span>' : ''}</span><button class="sm" data-a="listRename" data-l="${k}" data-c="${c}">Rename</button><button class="sm ${a === false ? 'sel' : ''}" data-a="listToggle" data-l="${k}" data-c="${c}">${a === false ? 'Restore' : 'Retire'}</button></div>`).join('')}
 <button class="sm p" data-a="listAdd" data-l="${k}">+ Add to ${LIST_TITLE[k].toLowerCase()}</button></div>`).join('')}<!--ACT--><!--/ACT-->`;

function textDialog(title, label, cur, cb, hint) {
  modal(`<h2>${esc(title)}</h2><label>${esc(label)}</label><input type="text" enterkeyhint="done" id="tdv" value="${esc(cur || '')}">${hint ? `<p class="mut">${hint}</p>` : ''}<div class="stick"><button class="p big" id="tdok">Save</button> <button data-a="closeM">Cancel</button></div>`);
  document.getElementById('tdok').onclick = async () => { const v = document.getElementById('tdv').value.trim(); if (await cb(v) !== false) closeModal(); };
}
Object.assign(ACT, {
  listAdd(e) {
    const k = e.dataset.l;
    textDialog('Add to ' + LIST_TITLE[k].toLowerCase(), 'Name', '', async v => {
      if (!v) { alert('Name needed'); return false; }
      if (LIVE_LISTS[k].some(x => x[1].toLowerCase() === v.toLowerCase())) { alert('That name is already in the list (it may be retired: use Restore).'); return false; }
      let code = v.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'ITEM', base = code, n = 2; while (LIVE_LISTS[k].some(x => x[0] === code)) code = base + '_' + n++;
      await saveListCfg(cfg => listCfgOf(cfg, k).add.push([code, v])); render();
    });
  },
  listRename(e) {
    const k = e.dataset.l, c = e.dataset.c, cur = LIVE_LISTS[k].find(x => x[0] === c);
    textDialog('Rename', 'New name', cur[1], async v => {
      if (!v) { alert('Name needed'); return false; }
      if (LIVE_LISTS[k].some(x => x[0] !== c && x[1].toLowerCase() === v.toLowerCase())) { alert('Another value already has that name.'); return false; }
      await saveListCfg(cfg => { listCfgOf(cfg, k).label[c] = v; }); render();
    }, 'Earlier trips will show the new name. The stored code stays "' + esc(c) + '".');
  },
  async listToggle(e) {
    const k = e.dataset.l, c = e.dataset.c;
    await saveListCfg(cfg => { const o = listCfgOf(cfg, k).off, i = o.indexOf(c); if (i >= 0) o.splice(i, 1); else o.push(c); }); render();
  }
});

/* ---------- settings screen ---------- */
async function storageInfo() {
  let persisted = null, usage = null, quota = null;
  try { if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); } catch (e) {}
  try { if (navigator.storage && navigator.storage.estimate) { const s = await navigator.storage.estimate(); usage = s.usage; quota = s.quota; } } catch (e) {}
  return { persisted, usage, quota };
}
const mb = b => b == null ? 'unknown' : (b / 1048576).toFixed(1) + ' MB';
SCREENS.settings = async () => {
  const slack = await metaGet('slack_window_min', 30), sp = await metaGet('default_trap_spacing_ft', 59), pl = !!(await metaGet('count_per_line_default', false)), zip = await metaGet('home_zip', ''),
    st = await storageInfo(), lb = await metaGet('last_backup_at'), merges = await metaGet('spot_merges', []),
    nFinish = live(await getAll('locations')).filter(l => l.needs_review && l.active !== false).length;
  return `<h1>Settings</h1>${ACTION_BAR('<button data-a="go" data-s="home">Home</button>')}
 <div class="card"><b>Defaults</b>
  <div class="row"><span>Slack window around a tide: <b>${slack} min</b></span><button class="sm" data-a="setSlack">Change</button></div>
  <div class="row"><span>Default trap spacing: <b>${sp} ft</b> <span class="mut">(estimate)</span></span><button class="sm" data-a="setSpacing">Change</button></div>
  <div class="row"><span>Count each line separately by default: <b>${pl ? 'ON' : 'OFF'}</b></span><button class="sm ${pl ? 'sel' : ''}" data-a="setPerLine">${pl ? 'Turn off' : 'Turn on'}</button></div>
  <div class="row"><span>Home ZIP code: <b>${esc(zip) || 'not set'}</b></span><button class="sm" data-a="setZip">Change</button></div>
  <p class="mut">The home ZIP is stored for future location-based calculations. The moon is calculated from the date and does not need it.</p></div>
 <div class="card"><b>Units (fixed)</b><br><span class="mut">Wind mph · temperatures °F · lengths and depths ft · dates YYYY-MM-DD · times 24-hour · time zone America/New_York. These are fixed so every season stays comparable; nothing is converted silently.</span></div>
 <div class="card"><b>Lists</b><br><button class="big" data-a="go" data-s="lists">Edit gear, bait and event lists</button></div>
 <div class="card"><b>Spots</b><br><button class="big" data-a="go" data-s="spots" data-finish="1">To finish list (${nFinish})</button> <button class="big" data-a="mergeOpen">Merge two spots…</button>
  ${merges.length ? `<h2>Merge history</h2>${merges.slice().reverse().map(m => `<div class="row"><span>${m.at.slice(0, 16)}: ${esc(m.from_name)} → ${esc(m.to_name)} (${m.deployment_ids.length} lines)${m.undone_at ? ' <span class="mut">undone</span>' : ''}</span>${m.undone_at ? '' : `<button class="sm" data-a="mergeUndo" data-id="${m.id}">Undo</button>`}</div>`).join('')}` : ''}</div>
 <div class="card"><b>This tablet</b><br>Program version: ${self.APP_VERSION} · data format (schema) ${self.SCHEMA_VERSION}<br>
  Storage protection: <b>${st.persisted === true ? 'protected (persistent)' : st.persisted === false ? 'NOT guaranteed' : 'unknown'}</b> ${st.persisted === false ? '<button class="sm" data-a="askPersist">Request protection</button>' : ''}<br>
  Space used by CrabMetrics: ${mb(st.usage)} of ${mb(st.quota)} available<br>Last backup: ${lb ? lb.slice(0, 16) : 'none yet'}<br>
  <button class="sm" data-a="chkUpdate">Check for update</button> <span id="updmsg" class="mut"></span></div><!--ACT--><!--/ACT-->`;
};
Object.assign(ACT, {
  async setSlack() { numDialog('Slack window', 'Minutes either side of a tide change (0 to 120)', String(await metaGet('slack_window_min', 30)), { max: 3 }, async v => { const n = v == null ? NaN : +v; if (!(n >= 0 && n <= 120)) { alert('Enter 0 to 120'); return; } await metaSet('slack_window_min', n); onSaved(); render(); }); },
  async setSpacing() { numDialog('Default trap spacing', 'Feet between traps (10 to 200)', String(await metaGet('default_trap_spacing_ft', 59)), { max: 3 }, async v => { const n = v == null ? NaN : +v; if (!(n >= 10 && n <= 200)) { alert('Enter 10 to 200'); return; } await metaSet('default_trap_spacing_ft', n); onSaved(); render(); }); },
  async setPerLine() { await metaSet('count_per_line_default', !(await metaGet('count_per_line_default', false))); onSaved(); render(); },
  setZip() { metaGet('home_zip', '').then(z => textDialog('Home ZIP code', '5-digit ZIP (leave empty to clear)', z, async v => { if (v && !/^\d{5}$/.test(v)) { alert('Enter 5 digits, or leave empty'); return false; } await metaSet('home_zip', v || null); onSaved(); render(); })); },
  async askPersist() { let ok = false; try { ok = await navigator.storage.persist(); } catch (e) {} alert(ok ? 'Storage is now protected.' : 'Chrome did not grant protection. Keep saving backup files.'); render(); }
});

/* ---------- merge two spots (FR-60) ---------- */
function mergeState() { return S.mg = S.mg || { area: null, from: null, to: null }; }
async function mergeDialog() {
  const g = mergeState(), areas = live(await getAll('areas')).filter(isActive).sort((a, b) => a.name < b.name ? -1 : 1), locs = live(await getAll('locations')).filter(l => l.area_id === g.area && l.active !== false).sort(bySpot);
  const chips = (key, other) => locs.filter(l => l.location_id !== g[other]).map(l => `<button class="sm ${g[key] === l.location_id ? 'sel' : ''}" data-a="mgPick" data-k="${key}" data-id="${l.location_id}">${esc(l.name)}</button>`).join('');
  modal(`<h2>Merge two spots</h2><p class="mut">Use this when two spots turn out to be the same place. Every line recorded at the spot you remove moves to the spot you keep. You can undo it from Settings.</p>
   <label>Area</label><div class="row">${areas.map(a => `<button class="sm ${g.area === a.area_id ? 'sel' : ''}" data-a="mgArea" data-id="${a.area_id}">${esc(a.name)}</button>`).join('')}</div>
   ${g.area ? `<label>Spot to REMOVE (its name is kept as an alias)</label><div class="row">${chips('from', 'to')}</div><label>Spot to KEEP</label><div class="row">${chips('to', 'from')}</div>` : ''}
   <div class="stick"><button class="p big" data-a="mgPreview" ${g.from && g.to ? '' : 'disabled'}>Next: see what will change</button> <button data-a="closeM">Cancel</button></div>`);
}
Object.assign(ACT, {
  mergeOpen() { S.mg = { area: null, from: null, to: null }; mergeDialog(); },
  mgArea(e) { S.mg = { area: e.dataset.id, from: null, to: null }; mergeDialog(); },
  mgPick(e) { mergeState()[e.dataset.k] = e.dataset.id; mergeDialog(); },
  async mgPreview() {
    const g = mergeState(), from = await getOne('locations', g.from), to = await getOne('locations', g.to), deps = live(await getAll('deployments')).filter(d => d.location_id === from.location_id);
    const trips = new Set(deps.map(d => d.trip_id)).size;
    modal(`<h2>Confirm merge</h2><p><b>${esc(from.name)}</b> will be merged into <b>${esc(to.name)}</b> (area ${esc(await areaName(from.area_id))}).</p>
     <ul><li>${deps.length} recorded line${deps.length === 1 ? '' : 's'} on ${trips} trip${trips === 1 ? '' : 's'} will move to ${esc(to.name)}.</li><li>"${esc(from.name)}" is retired and kept as an alias of ${esc(to.name)}.</li>
     ${from.position_text && !to.position_text ? `<li class="warnbox">${esc(to.name)} has no position but ${esc(from.name)} does. The position is NOT copied; edit ${esc(to.name)} afterwards if you want it.</li>` : ''}</ul>
     <div class="stick"><button class="p big" data-a="mgGo">Merge now</button> <button data-a="mergeOpen">Back</button> <button data-a="closeM">Cancel</button></div>`);
  },
  async mgGo() {
    const g = mergeState(), from = await getOne('locations', g.from), to = await getOne('locations', g.to), deps = live(await getAll('deployments')).filter(d => d.location_id === from.location_id), id = 'MG-' + Date.now().toString(36);
    for (const d of deps) { await logEdit('deployments', d, { location_id: to.location_id }); await put('deployments', { deployment_id: d.deployment_id, location_id: to.location_id }, { quiet: true }); }
    await put('locations', { location_id: to.location_id, aliases: [...(to.aliases || []), from.name] }, { quiet: true });
    await put('locations', { location_id: from.location_id, active: false, merged_into: to.location_id });
    const m = await metaGet('spot_merges', []); m.push({ id, at: now(), from: from.location_id, to: to.location_id, from_name: from.name, to_name: to.name, deployment_ids: deps.map(d => d.deployment_id) }); await metaSet('spot_merges', m);
    closeModal(); S.mg = null; render();
  },
  async mergeUndo(e) {
    const m = await metaGet('spot_merges', []), r = m.find(x => x.id === e.dataset.id); if (!r || r.undone_at) return;
    if (!confirm(`Undo the merge of ${r.from_name} into ${r.to_name}? Lines that were moved go back to ${r.from_name}. Lines you have changed since stay where they are.`)) return;
    let back = 0, kept = 0;
    for (const did of r.deployment_ids) { const d = await getOne('deployments', did); if (d && d.location_id === r.to) { await logEdit('deployments', d, { location_id: r.from }); await put('deployments', { deployment_id: did, location_id: r.from }, { quiet: true }); back++; } else kept++; }
    const from = await getOne('locations', r.from), to = await getOne('locations', r.to);
    await put('locations', { location_id: r.from, active: true, merged_into: null }, { quiet: true });
    await put('locations', { location_id: r.to, aliases: (to.aliases || []).filter(a => a !== r.from_name) }, { quiet: true });
    r.undone_at = now(); await metaSet('spot_merges', m); onSaved(); render();
    alert(`Merge undone. ${back} line${back === 1 ? '' : 's'} moved back${kept ? `, ${kept} left where they are because they were changed since` : ''}.`);
  }
});
