'use strict';
/* CrabMetrics screens and actions. Data work is in db.js, math in calc.js, keypad in pad.js. */
let S = { screen: 'home' };
const ACT = {};
const SCREENS = {};
const app = () => document.getElementById('app');
function onSaved() { const e = document.getElementById('saved'); if (!e) return; e.style.display = 'block'; e.textContent = 'Saved ' + now().slice(11, 19); clearTimeout(onSaved.t); onSaved.t = setTimeout(() => e.style.display = 'none', 2500); }
function go(screen, extra) { PAD = null; S = Object.assign({ screen }, extra || {}); closeModal(); render(); window.scrollTo(0, 0); }
async function render() {
  document.getElementById('ver').textContent = 'v' + self.APP_VERSION;
  let h = await SCREENS[S.screen]();
  const m = h.match(/<!--ACT-->([\s\S]*?)<!--\/ACT-->/g), bar = m && m.map(x => x.replace(/<!--\/?ACT-->/g, '')).find(x => x.trim());
  if (m) { h = h.replace(/<!--ACT-->[\s\S]*?<!--\/ACT-->/g, ''); if (bar) { const i = h.indexOf('</h1>'); h = (i >= 0 ? h.slice(0, i + 5) + '<div class="topbar">' + bar + '</div>' + h.slice(i + 5) : h) + '<div class="botbar">' + bar + '</div>'; } }
  app().innerHTML = h;
  if (S.afterRender) S.afterRender();
}
function modal(html) { closeModal(); const m = document.createElement('div'); m.className = 'modal'; m.id = 'modal'; m.innerHTML = `<div>${html}</div>`; document.body.appendChild(m); }
function closeModal() { const m = document.getElementById('modal'); if (m) m.remove(); }
function msg(t) { const m = document.getElementById('msg'); if (m) { m.style.display = 'block'; m.textContent = t; } }
const ACTION_BAR = h => `<!--ACT-->${h}<!--/ACT-->`;

/* ---- common queries ---- */
async function currentTrip() { return live(await getAll('trips')).filter(t => t.status === 'IN_PROGRESS').sort((a, b) => a.trip_id < b.trip_id ? 1 : -1)[0] || null; }
async function activeDeps(tripId) { return live(await getAll('deployments')).filter(d => d.trip_id === tripId && !d.deploy_end_ts).sort((a, b) => a.unit_label < b.unit_label ? -1 : 1); }
async function openVisit(tripId) { return live(await getAll('area_visits')).filter(v => v.trip_id === tripId && !v.leave_ts)[0] || null; }
async function tripLoops(tripId) { return live(await getAll('loops')).filter(l => l.trip_id === tripId).sort((a, b) => a.seq - b.seq); }
async function areaName(id) { const a = id && await getOne('areas', id); return a ? a.name : '(none)'; }
async function spotName(id) { const a = id && await getOne('locations', id); return a ? a.name : '(not recorded)'; }
const isActive = r => r.active !== false;
async function addReading(tripId, visitId, r) {
  const id = await nextChild(tripId, 'R', 3);
  return put('readings', Object.assign({ reading_id: id, trip_id: tripId, area_visit_id: visitId, value_num: null, value_min: null, value_max: null, value_text: null, unit: null, basis: null, source: null, obs_ts: now(), context: 'ON_SITE', status: null }, r));
}
const READ_DEF = { WIND_SPEED: { unit: 'mph', basis: 'EXTERNAL', source: 'WINDY_APP' }, WIND_DIR: { unit: 'compass', basis: 'EXTERNAL', source: 'WINDY_APP' },
  DEPTH_FT: { unit: 'ft', basis: 'MEASURED', source: 'GARMIN' }, AIR_TEMP_F: { unit: 'F', basis: 'MEASURED', source: 'GARMIN' },
  WATER_TEMP_F: { unit: 'F', basis: 'MEASURED', source: 'GARMIN' }, SALINITY: { unit: 'ppt', basis: 'MEASURED', source: 'SALINITY_METER' } };

/* ================= HOME ================= */
SCREENS.home = async () => {
  const t = await currentTrip(), areas = live(await getAll('areas')).filter(isActive), lb = await metaGet('last_backup_at');
  const days = lb ? Math.floor((Date.now() - tsToDate(lb)) / 86400000) : null;
  const bk = lb ? `Last backup: ${lb.slice(0, 16)} (${days === 0 ? 'today' : days + ' day' + (days === 1 ? '' : 's') + ' ago'})` : 'No backup yet';
  return `<h1>CrabMetrics</h1>
 ${t ? `<div class="card"><b>Trip in progress: ${t.trip_id}</b><br><button class="p big" data-a="go" data-s="hub">Resume trip</button></div>` : ''}
 ${!areas.length ? `<div class="warn">No areas yet. Go to <b>Data &amp; backup → Restore from file</b> to load your spot list, or add an area under <b>Areas &amp; spots</b>.</div>` : ''}
 <button class="p big" data-a="startTrip" ${t ? 'disabled' : ''}>Start trip</button>
 <button class="big" data-a="go" data-s="data">Data &amp; backup</button>
 <button class="big" data-a="go" data-s="spots">Areas &amp; spots</button>
 <div class="card ${lb && days < 7 ? '' : 'warnbox'}"><span>${bk}</span></div>`;
};

/* ================= START TRIP ================= */
function tsFromFields(v) { return mkTs(new Date(+v.y, +v.mo - 1, +v.d, +v.h, +v.mi, 0)); }
function tsDialog(title, ts, cb) {
  const d = tsToDate(ts) || new Date();
  padDialog({ title, fields: [{ key: 'y', label: 'Year', val: d.getFullYear(), max: 4 }, { key: 'mo', label: 'Month', val: p2(d.getMonth() + 1), max: 2 }, { key: 'd', label: 'Day', val: p2(d.getDate()), max: 2 },
    { key: 'h', label: 'Hour (24h)', val: p2(d.getHours()), max: 2 }, { key: 'mi', label: 'Minute', val: p2(d.getMinutes()), max: 2 }], okLabel: 'OK' });
  PAD.opts.onOk = v => {
    const x = Object.fromEntries(Object.entries(v).map(([k, val]) => [k, val == null ? NaN : +val]));
    if (!(x.y >= 2020 && x.y <= 2100 && x.mo >= 1 && x.mo <= 12 && x.d >= 1 && x.d <= 31 && x.h >= 0 && x.h <= 23 && x.mi >= 0 && x.mi <= 59)) { alert('Check the date and time: month 1-12, day 1-31, hour 0-23, minute 0-59.'); return false; }
    cb(tsFromFields(v)); return true;
  };
}
function numDialog(title, label, cur, opts, cb) {
  padDialog({ title, fields: [Object.assign({ key: 'v', label, val: cur, max: 3 }, opts)], okLabel: 'OK' });
  PAD.opts.onOk = v => { cb(v.v); return true; };
  PAD.opts.buttons = [{ label: 'Clear', act: 'padClear' }];
}
SCREENS.start = async () => {
  const D = S.draft;
  const box = (k, label, val, unit) => `<div class="fld sm" data-a="startField" data-k="${k}"><b>${label}</b><span>${val === '' || val == null ? '—' : esc(val)}</span>${unit ? `<small>${unit}</small>` : ''}</div>`;
  return `<h1>Begin trip (leaving the dock)</h1>${ACTION_BAR(`<button class="p big" data-a="beginTrip">Begin trip</button> <button data-a="go" data-s="home">Cancel</button>`)}
 <div class="row"><div class="fld sm wide" data-a="startField" data-k="depart"><b>Date / depart (edit)</b><span>${tsDate(D.depart)} ${tsTime(D.depart)}</span></div>
  ${box('eng', 'Engine hours start', D.eng, D.engHint ? 'last trip ended ' + D.engHint : '')}
  <div class="fld sm"><b>Passengers</b><span class="stp"><button class="sm" data-a="pass" data-v="-1">−</button> ${D.pass == null ? '—' : D.pass} <button class="sm" data-a="pass" data-v="1">+</button></span></div>
  ${box('air', 'Air temp', D.air, '°F')}${box('water', 'Water temp', D.water, '°F')}</div>
 <p class="mut">Area, spots and lines are entered later, when you tap <b>Begin crabbing</b> on location.</p>`;
};
/* Begin crabbing: area, Line A/B spots and directions (on location) */
SCREENS.crab = async () => {
  const D = S.draft, areas = live(await getAll('areas')).filter(isActive).sort((a, b) => a.name < b.name ? -1 : 1);
  const spots = live(await getAll('locations')).filter(l => isActive(l) && l.area_id === D.area_id).sort(bySpot);
  const line = u => { const L = D.lines[u]; return `<div class="card"><h2>Line ${u}</h2><div class="row">${spots.map(s => `<button class="${L.spot === s.location_id ? 'sel' : ''}" data-a="spotPick" data-u="${u}" data-id="${s.location_id}">${esc(s.name)}</button>`).join('')}<button class="sm" data-a="addSpot" data-u="${u}">+ Add new spot</button></div>${dirPicker('D', u, L)}</div>`; };
  return `<h1>Begin crabbing</h1>${ACTION_BAR(`<button class="p big" data-a="beginCrabbing" ${D.area_id ? '' : 'disabled'}>Begin crabbing</button> <button data-a="go" data-s="hub">Cancel</button>`)}
 <h2>Area</h2><div class="row">${areas.map(a => `<button class="${D.area_id === a.area_id ? 'sel' : ''}" data-a="areaPick" data-id="${a.area_id}">${esc(a.name)}</button>`).join('')}<button class="sm" data-a="addArea">+ Add new area</button></div>
 ${D.area_id ? line('A') + line('B') : '<p class="mut">Pick an area to choose spots.</p>'}
 <div class="card row"><button class="${D.perLine ? 'sel' : ''}" data-a="perLineToggle">Count each line separately: ${D.perLine ? 'ON' : 'OFF'}</button></div>`;
};
function dirPicker(prefix, u, L) {
  return `<div class="row"><span class="mut">Direction:&nbsp;</span>${DIRS.map(d => `<button class="sm ${L.dir === d && L.deg == null ? 'sel' : ''}" data-a="dir" data-p="${prefix}" data-u="${u}" data-v="${d}">${d}</button>`).join('')}
 <button class="sm ${L.deg != null ? 'sel' : ''}" data-a="degEntry" data-p="${prefix}" data-u="${u}">° ${L.deg != null ? L.deg : '___'}</button>
 <button class="sm ${L.dir === 'UNKNOWN' ? 'sel' : ''}" data-a="dir" data-p="${prefix}" data-u="${u}" data-v="UNKNOWN">?</button></div>`;
}
const lineRef = e => e.dataset.p === 'D' ? S.draft.lines[e.dataset.u] : S.mv.lines[e.dataset.u];
async function prefill(L, spotId) {
  if ((L.dir != null || L.deg != null) && !L.auto) return; const sp = await getOne('locations', spotId);
  if (sp && sp.usual_heading_deg != null) { L.deg = sp.usual_heading_deg; L.dir = nearest(sp.usual_heading_deg); L.auto = true; } else if (L.auto) { L.dir = null; L.deg = null; L.auto = false; }
}
Object.assign(ACT, {
  go(e) { go(e.dataset.s); },
  closeM() { closeModal(); },
  async startTrip() {
    const trips = live(await getAll('trips')).filter(t => t.engine_hours_end != null).sort((a, b) => a.trip_id < b.trip_id ? 1 : -1);
    const last = trips[0];
    go('start', { draft: { depart: now(), eng: last ? String(last.engine_hours_end) : '', engHint: last ? String(last.engine_hours_end) : '', pass: null, air: '', water: '' } });
  },
  startField(e) {
    const D = S.draft, k = e.dataset.k;
    if (k === 'depart') tsDialog('Trip date and depart time', D.depart, ts => { D.depart = ts; render(); });
    else if (k === 'eng') numDialog('Engine hours at start', 'Hours (whole)', D.eng, { max: 5 }, v => { D.eng = v == null ? '' : v; render(); });
    else numDialog(k === 'air' ? 'Air temperature °F' : 'Water temperature °F', '°F', D[k], { max: 3 }, v => { D[k] = v == null ? '' : v; render(); });
  },
  pass(e) { const D = S.draft, d = +e.dataset.v; D.pass = D.pass == null ? (d > 0 ? 1 : 0) : Math.max(0, Math.min(20, D.pass + d)); render(); },
  areaPick(e) { S.draft.area_id = e.dataset.id; S.draft.lines.A.spot = S.draft.lines.B.spot = null; render(); },
  async spotPick(e) { const L = S.draft.lines[e.dataset.u]; L.spot = e.dataset.id; await prefill(L, e.dataset.id); render(); },
  perLineToggle() { S.draft.perLine = !S.draft.perLine; render(); },
  dir(e) { const L = lineRef(e); L.dir = e.dataset.v; L.deg = null; L.auto = false; render(); },
  degEntry(e) {
    const L = lineRef(e);
    padDialog({ title: 'Heading in degrees (from chartplotter)', fields: [{ key: 'deg', label: 'Degrees (0–360)', val: L.deg == null ? '' : L.deg, max: 3 }], okLabel: 'OK', buttons: [{ label: 'No degrees', act: 'padClear' }] });
    PAD.opts.onOk = v => { if (v.deg == null) { L.deg = null; } else { const n = +v.deg; if (n > 360) { alert('Degrees must be 0 to 360'); return false; } L.deg = n % 360; L.dir = nearest(L.deg); } L.auto = false; render(); return true; };
    PAD.opts.onClear = () => { L.deg = null; L.auto = false; render(); };
  },
  async beginTrip() {
    const D = S.draft, id = await nextTripId(), t0 = D.depart, eng = D.eng === '' ? null : +D.eng;
    await put('trips', { trip_id: id, status: 'IN_PROGRESS', trip_date: tsDate(t0), depart_ts: t0, return_ts: null, engine_hours_start: eng, engine_hours_end: null, passengers: D.pass,
      weather_sky: null, wind_condition: null, water_condition: null, count_per_line: false, trip_notes: null, next_counters: {} });
    for (const [k, v] of [['AIR_TEMP_F', D.air], ['WATER_TEMP_F', D.water]]) if (v !== '') await addReading(id, null, Object.assign({ variable: k, value_num: +v, obs_ts: t0, context: 'AT_DOCK_DEPART' }, READ_DEF[k]));
    go('hub');
  },
  async crabStart() {
    const areas = live(await getAll('areas')).filter(isActive);
    go('crab', { draft: { area_id: areas.length === 1 ? areas[0].area_id : null, lines: { A: { spot: null, dir: null, deg: null }, B: { spot: null, dir: null, deg: null } }, perLine: !!(await metaGet('count_per_line_default', false)) } });
  },
  async beginCrabbing() {
    const D = S.draft, t = await currentTrip(), tn = now(), n = live(await getAll('area_visits')).filter(v => v.trip_id === t.trip_id).length;
    const vid = await nextChild(t.trip_id, 'V', 2);
    await put('area_visits', { area_visit_id: vid, trip_id: t.trip_id, seq: n + 1, area_id: D.area_id, arrive_ts: tn, leave_ts: null, stay_notes: null });
    const nd = live(await getAll('deployments')).filter(x => x.trip_id === t.trip_id).length;
    let i = 0; for (const u of ['A', 'B']) { const L = D.lines[u], did = await nextChild(t.trip_id, 'D', 2);
      await put('deployments', { deployment_id: did, trip_id: t.trip_id, area_visit_id: vid, seq: nd + (++i), unit_label: u, equipment_type: 'TROTLINE', location_id: L.spot, lay_heading: L.dir, lay_heading_deg: L.deg, heading_reference: 'UNKNOWN', deploy_start_ts: tn, deploy_end_ts: null, end_reason: null, moved_to_deployment_id: null }); }
    await put('trips', { trip_id: t.trip_id, count_per_line: D.perLine });
    go('hub'); conditionsDialog('full');
  },
  async finishCrabbing() {
    const t = await currentTrip(), v = await openVisit(t.trip_id); if (!v) return;
    if (!confirm('Finish crabbing? This records that the lines are picked up and you are heading back to the dock.')) return;
    const t0 = now();
    for (const d of await activeDeps(t.trip_id)) await put('deployments', { deployment_id: d.deployment_id, deploy_end_ts: t0, end_reason: 'PICKED_UP_FINAL' });
    await put('area_visits', { area_visit_id: v.area_visit_id, leave_ts: t0 });
    go('hub');
  }
});

/* ================= TRIP HUB ================= */
SCREENS.hub = async () => {
  const t = await currentTrip(); if (!t) { S.screen = 'home'; return SCREENS.home(); }
  const deps = await activeDeps(t.trip_id), loops = await tripLoops(t.trip_id), v = await openVisit(t.trip_id);
  const sum = k => loops.some(l => l[k] != null) ? loops.reduce((a, l) => a + (l[k] || 0), 0) : '—';
  let h = `<h1>Trip ${t.trip_id}</h1>`;
  h += ACTION_BAR(v
    ? `<button class="p big" data-a="loopStart">Start loop #${loops.length ? loops[loops.length - 1].seq + 1 : 1}</button> <button class="big" data-a="go" data-s="move">Move lines</button> <button class="big" data-a="condOpen">Conditions</button> <button class="big" data-a="noteOpen">Note</button> <button class="big" data-a="finishCrabbing">Finish crabbing</button> <button data-a="go" data-s="home">Home</button>`
    : `<button class="p big" data-a="crabStart">Begin crabbing</button> <button class="big" data-a="condOpen">Conditions</button> <button class="big" data-a="noteOpen">Note</button> <button class="big" data-a="go" data-s="finish">Finish trip</button> <button data-a="go" data-s="home">Home</button>`);
  h += `<div class="card"><b>Trip time <span id="ttime">${fmtMin(minutesBetween(t.depart_ts, now()))}</span></b> · ${v ? 'Crabbing at: ' + esc(await areaName(v.area_id)) : 'Not crabbing now'} · Loops: ${loops.length}<br>
   <span class="mut">Calculated totals: Medium ${sum('medium_count')} · Large ${sum('large_count')} · Count each line separately: ${t.count_per_line ? 'ON' : 'OFF'}</span></div>`;
  for (const d of deps) {
    const sp = d.location_id ? await getOne('locations', d.location_id) : null, lp = linePath(sp, d, d.line_length_ft || 600);
    h += `<div class="card"><b>Line ${d.unit_label}</b> — ${esc(await spotName(d.location_id))}, facing ${d.lay_heading_deg != null ? d.lay_heading_deg + '°' : esc(d.lay_heading || 'not set')}
     ${lp ? `<div class="mut">Calculated end (${d.line_length_ft || 600} ft, approximate): ${lp.lat.toFixed(5)}, ${lp.lon.toFixed(5)}${lp.uncertain ? ' (±22° compass-point uncertainty)' : ''}</div>` : `<div class="mut">No spot coordinates or direction yet, so no line path.</div>`}</div>`;
  }
  if (t.trip_notes) h += `<div class="card"><b>Notes</b><br>${esc(t.trip_notes)}</div>`;
  if (loops.length) h += `<h2>Loops so far</h2><table><tr><th>#</th><th>Time</th><th>Medium</th><th>Large</th></tr>` + loops.map(l => `<tr><td>${l.seq}</td><td>${tsTime(l.end_ts || l.start_ts)}</td><td>${l.medium_count ?? '—'}</td><td>${l.large_count ?? '—'}</td></tr>`).join('') + `</table>`;
  S.afterRender = () => { clearInterval(S.tt); S.tt = setInterval(() => { const e = document.getElementById('ttime'); if (!e) { clearInterval(S.tt); return; } e.textContent = fmtMin(minutesBetween(t.depart_ts, now())); }, 20000); };
  return h;
};

/* ================= LOOP: timer then count pad ================= */
SCREENS.loopTimer = async () => `<h1>Loop running</h1><div class="tm" id="tm">0:00</div>
 <p class="mut">Started ${tsTime(S.loop.start_ts)}. Tap when the lines are up and you are ready to count.</p>
 <button class="p big" data-a="linesUp">End of Loop Count</button> <button class="danger" data-a="loopCancel">Cancel loop</button>`;
const countFields = perLine => perLine ? [['A_M', 'Line A Medium'], ['A_L', 'Line A Large'], ['B_M', 'Line B Medium'], ['B_L', 'Line B Large']] : [['M', 'Medium'], ['L', 'Large']];
SCREENS.count = async () => {
  if (!PAD) PAD = new PadEngine(countFields(S.perLine).map(([k, l]) => ({ key: k, label: l, val: '', max: 3 })), paintCount);
  PAD.paint = paintCount;
  S.afterRender = paintCount;
  return `<h1 style="margin:2px 0 6px">Count — loop ${S.loop.seq}</h1><div class="cnt"><div id="cf" class="g-f"></div><div class="g-p">${padHTML(false)}</div>
  <div class="g-b"><p class="mut" style="margin:0 0 4px">Empty = not counted. Typing 0 = counted zero.</p><button class="p big" data-a="saveLoop">Save loop</button> <button class="big" data-a="backToHub">Back</button></div></div>`;
};
function paintCount() { const c = document.getElementById('cf'); if (!c || !PAD) return; c.innerHTML = `<div class="row">${fieldBoxes(PAD)}</div>` + (S.perLine ? `<p class="mut">Total: Medium ${sumF('_M')}, Large ${sumF('_L')}</p>` : ''); }
function sumF(sfx) { let any = false, t = 0; PAD.fields.filter(f => f.key.endsWith(sfx)).forEach(f => { if (f.val !== '') { any = true; t += +f.val; } }); return any ? t : '—'; }
Object.assign(ACT, {
  async loopStart() {
    const t = await currentTrip(), loops = await tripLoops(t.trip_id), lid = await nextChild(t.trip_id, 'L', 2);
    S = { screen: 'loopTimer', tripId: t.trip_id, perLine: t.count_per_line, loop: { id: lid, seq: Math.max(0, ...loops.map(l => l.seq)) + 1, start_ts: now(), t0: Date.now(), type: 'RUN' } }; PAD = null;
    S.timer = setInterval(() => { const e = document.getElementById('tm'); if (!e) { clearInterval(S.timer); return; } const s = Math.floor((Date.now() - S.loop.t0) / 1000); e.textContent = Math.floor(s / 60) + ':' + p2(s % 60); }, 1000);
    render();
  },
  loopCancel() { clearInterval(S.timer); go('hub'); },
  linesUp() { clearInterval(S.timer); S.loop.end_ts = now(); PAD = null; S.screen = 'count'; render(); },
  backToHub() { go('hub'); },
  focus(e) { PAD.focus(+e.dataset.i); },
  d(e) { PAD && PAD.key('d', e.dataset.v); }, bk() { PAD && PAD.key('bk'); }, next() { PAD && PAD.key('next'); }, dot() { PAD && PAD.key('dot'); },
  async saveLoop() {
    const L = S.loop, F = Object.fromEntries(PAD.fields.map(f => [f.key, f.val === '' ? null : +f.val])), tripId = S.tripId;
    const deps = await activeDeps(tripId); let m, l;
    if (S.perLine) { const mv = [F.A_M, F.B_M], lv = [F.A_L, F.B_L]; m = mv.every(x => x == null) ? null : mv.reduce((a, b) => a + (b || 0), 0); l = lv.every(x => x == null) ? null : lv.reduce((a, b) => a + (b || 0), 0); } else { m = F.M; l = F.L; }
    if (m == null && l == null && !confirm('No counts entered. Save this loop as NOT COUNTED?')) return;
    const v = await openVisit(tripId);
    await put('loops', { loop_id: L.id, trip_id: tripId, area_visit_id: v && v.area_visit_id, seq: L.seq, loop_type: L.type, start_ts: L.start_ts, end_ts: L.end_ts, medium_count: m, large_count: l, male_count: null, female_count: null, count_status: (m == null && l == null) ? 'NOT_COUNTED' : 'COUNTED', loop_notes: null, size_basis: 'MEASURED' });
    if (S.perLine) for (const d of deps) await put('loop_unit_counts', { id: L.id + '-' + d.unit_label, loop_id: L.id, trip_id: tripId, deployment_id: d.deployment_id, unit_label: d.unit_label, medium_count: F[d.unit_label + '_M'], large_count: F[d.unit_label + '_L'], count_status: (F[d.unit_label + '_M'] == null && F[d.unit_label + '_L'] == null) ? 'NOT_COUNTED' : 'COUNTED' });
    go('hub');
  }
});

/* ================= MOVE LINES ================= */
SCREENS.move = async () => {
  const M = S.mv || (S.mv = { which: 'A', area_id: null, lines: { A: { spot: null, dir: null, deg: null }, B: { spot: null, dir: null, deg: null } } });
  const areas = live(await getAll('areas')).filter(isActive).sort((a, b) => a.name < b.name ? -1 : 1);
  const spots = live(await getAll('locations')).filter(l => isActive(l) && l.area_id === M.area_id).sort(bySpot), units = M.which === 'BOTH' ? ['A', 'B'] : [M.which];
  const sec = u => { const L = M.lines[u]; return `<div class="card"><h2>Line ${u} — new spot</h2><div class="row">${spots.map(s => `<button class="${L.spot === s.location_id ? 'sel' : ''}" data-a="mvSpot" data-u="${u}" data-id="${s.location_id}">${esc(s.name)}</button>`).join('')}<button class="sm" data-a="addSpot" data-u="MV${u}">+ Add new spot</button></div>${dirPicker('M', u, L)}</div>`; };
  return `<h1>Move lines</h1>${ACTION_BAR(`<button class="p big" data-a="doMove" ${M.area_id && units.every(u => M.lines[u].spot) ? '' : 'disabled'}>Move</button> <button data-a="go" data-s="hub">Cancel</button>`)}
 <div class="row">${['A', 'B', 'BOTH'].map(w => `<button class="${M.which === w ? 'sel' : ''}" data-a="mvWhich" data-v="${w}">${w === 'BOTH' ? 'Both lines' : 'Line ' + w}</button>`).join('')}</div>
 <h2>New area</h2><div class="row">${areas.map(a => `<button class="${M.area_id === a.area_id ? 'sel' : ''}" data-a="mvArea" data-id="${a.area_id}">${esc(a.name)}</button>`).join('')}</div>
 ${M.area_id ? units.map(sec).join('') : '<p class="mut">Pick the area to choose spots.</p>'}<p class="mut">Each line gets its own spot and direction.</p><!--ACT--><!--/ACT-->`;
};
Object.assign(ACT, {
  mvWhich(e) { S.mv.which = e.dataset.v; render(); },
  mvArea(e) { S.mv.area_id = e.dataset.id; S.mv.lines.A.spot = S.mv.lines.B.spot = null; render(); },
  async mvSpot(e) { const L = S.mv.lines[e.dataset.u]; L.spot = e.dataset.id; await prefill(L, e.dataset.id); render(); },
  async doMove() {
    const M = S.mv, t = await currentTrip(), t0 = now(), deps = await activeDeps(t.trip_id), moving = deps.filter(d => M.which === 'BOTH' || d.unit_label === M.which);
    if (!confirm(`Move ${moving.map(d => 'Line ' + d.unit_label).join(' and ')} to the new spot? The old placements stay in the record.`)) return;
    const cur = await openVisit(t.trip_id); let vid = cur.area_visit_id, newVisit = false;
    if (cur.area_id !== M.area_id) { await put('area_visits', { area_visit_id: cur.area_visit_id, leave_ts: t0 }); vid = await nextChild(t.trip_id, 'V', 2);
      const n = live(await getAll('area_visits')).filter(v => v.trip_id === t.trip_id).length + 1;
      await put('area_visits', { area_visit_id: vid, trip_id: t.trip_id, seq: n, area_id: M.area_id, arrive_ts: t0, leave_ts: null, stay_notes: null }); newVisit = true; }
    for (const d of moving) {
      const nid = await nextChild(t.trip_id, 'D', 2), L = M.lines[d.unit_label], n = live(await getAll('deployments')).filter(x => x.trip_id === t.trip_id).length + 1;
      await put('deployments', { deployment_id: d.deployment_id, deploy_end_ts: t0, end_reason: 'MOVED', moved_to_deployment_id: nid });
      await put('deployments', { deployment_id: nid, trip_id: t.trip_id, area_visit_id: vid, seq: n, unit_label: d.unit_label, equipment_type: d.equipment_type, line_length_ft: d.line_length_ft ?? null, location_id: L.spot, lay_heading: L.dir, lay_heading_deg: L.deg, heading_reference: 'UNKNOWN', deploy_start_ts: t0, deploy_end_ts: null, end_reason: null, moved_to_deployment_id: null });
    }
    S.mv = null; go('hub'); if (newVisit) conditionsDialog('visit');
  }
});

/* ================= CONDITIONS (readings) ================= */
let CND = null;
function chipRow(label, key, list, cur) { return `<div class="row"><span class="mut chiplab">${label}</span>${list.map(([c, l]) => `<button class="sm ${cur === c ? 'sel' : ''}" data-a="cnd" data-k="${key}" data-v="${c}">${l}</button>`).join('')}</div>`; }
function chipsHTML(mode) {
  let h = chipRow('Wind from', 'dir', DIRS.map(d => [d, d]), CND.dir);
  if (mode === 'full') h += chipRow('Salinity unit', 'sal', [['ppt', 'ppt'], ['ppm', 'ppm']], CND.sal) + chipRow('Sky', 'sky', LISTS.weather_sky, CND.sky) + chipRow('Wind', 'windc', LISTS.wind_condition, CND.windc) + chipRow('Water', 'waterc', LISTS.water_condition, CND.waterc);
  return h;
}
async function conditionsDialog(mode) {
  const t = await currentTrip(); if (!t) return;
  CND = { mode, dir: null, sal: 'ppt', sky: t.weather_sky, windc: t.wind_condition, waterc: t.water_condition };
  const fields = [{ key: 'wind', label: 'Wind speed', unit: 'mph', max: 2 }, { key: 'depth', label: 'Depth', unit: 'ft', max: 3, decimal: true }, { key: 'depth2', label: 'Depth to', unit: 'ft', max: 3, decimal: true }];
  if (mode === 'full') fields.push({ key: 'air', label: 'Air temp', unit: '°F', max: 3 }, { key: 'water', label: 'Water temp', unit: '°F', max: 3 }, { key: 'sal', label: 'Salinity', max: 4, decimal: true });
  padDialog({ title: mode === 'visit' ? 'Conditions at this area' : 'Conditions', fields, compact: true, extra: `<div id="chips">${chipsHTML(mode)}</div>`, okLabel: 'Save', buttons: [{ label: 'Skip', act: 'closeM' }] });
  PAD.opts.onOk = async v => {
    const warns = []; const t2 = await currentTrip(), vis = await openVisit(t2.trip_id), jobs = [];
    const add = (variable, val, extra) => { const w = rangeWarn(variable, val, (extra && extra.unit) || READ_DEF[variable].unit); if (w) warns.push(w); jobs.push(Object.assign({ variable }, READ_DEF[variable], extra, { value_num: val })); };
    if (v.wind != null) add('WIND_SPEED', +v.wind, {});
    if (CND.dir) jobs.push(Object.assign({ variable: 'WIND_DIR', value_text: CND.dir }, READ_DEF.WIND_DIR));
    if (v.depth != null && v.depth2 != null) { const a = +v.depth, b = +v.depth2, lo = Math.min(a, b), hi = Math.max(a, b); const w = rangeWarn('DEPTH_FT', hi); if (w) warns.push(w); jobs.push(Object.assign({ variable: 'DEPTH_FT', value_min: lo, value_max: hi }, READ_DEF.DEPTH_FT)); }
    else if (v.depth != null) add('DEPTH_FT', +v.depth, {});
    if (v.air != null) add('AIR_TEMP_F', +v.air, {});
    if (v.water != null) add('WATER_TEMP_F', +v.water, {});
    if (v.sal != null) add('SALINITY', +v.sal, { unit: CND.sal });
    if (warns.length && !confirm(warns.join('\n') + '\nSave anyway?')) return false;
    for (const j of jobs) await addReading(t2.trip_id, vis && vis.area_visit_id, j);
    const tp = { trip_id: t2.trip_id }; if (CND.sky) tp.weather_sky = CND.sky; if (CND.windc) tp.wind_condition = CND.windc; if (CND.waterc) tp.water_condition = CND.waterc;
    if (Object.keys(tp).length > 1) await put('trips', tp);
    if (!jobs.length && Object.keys(tp).length === 1) return true;
    render(); return true;
  };
}
Object.assign(ACT, {
  condOpen() { conditionsDialog('full'); },
  cnd(e) { const k = e.dataset.k, v = e.dataset.v; CND[k] = CND[k] === v ? (k === 'sal' ? 'ppt' : null) : v; document.getElementById('chips').innerHTML = chipsHTML(CND.mode); },
  padOk: async () => { const o = PAD.opts, vals = padValues(); const r = o.validate ? o.validate(vals) : ''; if (r) { alert(r); return; } const ok = o.onOk ? await o.onOk(vals) : true; if (ok !== false) closeModal(); },
  padClear() { const o = PAD.opts; if (o.onClear) { o.onClear(); closeModal(); } else { PAD.fields[PAD.active].val = ''; PAD.paint(); } },
  noteOpen: async () => {
    const t = await currentTrip();
    modal(`<h2>Trip note</h2><textarea id="tn" rows="6" enterkeyhint="done">${esc(t.trip_notes || '')}</textarea><div class="row" style="margin-top:8px"><button class="p big" id="tnok">Save note</button><button data-a="closeM">Cancel</button></div>`);
    document.getElementById('tnok').onclick = async () => { await put('trips', { trip_id: t.trip_id, trip_notes: document.getElementById('tn').value.trim() || null }); closeModal(); render(); };
  }
});

/* ================= FINISH TRIP ================= */
SCREENS.finish = async () => {
  const t = await currentTrip(), F = S.fin || (S.fin = { ret: now(), eng: '', gal: '', ppg: '', tot: '', vendor: '', notes: t.trip_notes || '', blanks: {} });
  const loops = await tripLoops(t.trip_id), nc = loops.filter(l => l.count_status === 'NOT_COUNTED').length, sum = k => loops.some(l => l[k] != null) ? loops.reduce((a, l) => a + (l[k] || 0), 0) : '—';
  const b = (k, label, val, unit) => `<div class="fld sm" data-a="finField" data-k="${k}"><b>${label}</b><span>${val === '' || val == null ? '—' : esc(val)}</span>${unit ? `<small>${unit}</small>` : ''}</div>`;
  const warns = []; if (await openVisit(t.trip_id)) warns.push('You did not tap Finish crabbing; lines will be closed at the return time'); if (nc) warns.push(`${nc} loop${nc > 1 ? 's have' : ' has'} no count`);
  return `<h1>Finish trip ${t.trip_id}</h1>
 <div class="row"><div class="fld sm wide" data-a="finField" data-k="ret"><b>Return time (edit)</b><span>${tsDate(F.ret)} ${tsTime(F.ret)}</span></div>${b('eng', 'Engine hours end', F.eng, t.engine_hours_start != null ? 'start ' + t.engine_hours_start : '')}</div>
 <div class="card"><b>Totals (calculated)</b> Loops ${loops.length} · Medium ${sum('medium_count')} · Large ${sum('large_count')} · Trip time ${fmtMin(minutesBetween(t.depart_ts, F.ret))}
  ${warns.length ? `<div class="warn">⚠ ${warns.join(' · ')}</div>` : ''}<button class="sm" data-a="reviewBlanks">Review blanks</button> ${Object.keys(F.blanks).length ? `<span class="mut">${Object.keys(F.blanks).length} marked</span>` : ''}</div>
 <h2>Fuel (optional)</h2><div class="row">${b('gal', 'Gallons', F.gal)}${b('ppg', 'Price per gallon', F.ppg, '$')}${b('tot', 'Total cost', F.tot, '$')}</div>
 <input type="text" id="fvendor" placeholder="Fuel vendor (optional)" enterkeyhint="done" value="${esc(F.vendor)}" style="margin:6px 0">
 <label>Final notes</label><textarea id="fnotes" rows="3" enterkeyhint="done">${esc(F.notes)}</textarea>
 <div class="row" style="margin-top:8px"><button class="p big" data-a="completeTrip">Mark trip complete ✔</button> <button class="big" data-a="go" data-s="hub">Back</button></div>`;
};
Object.assign(ACT, {
  finField(e) {
    const F = S.fin, k = e.dataset.k;
    if (k === 'ret') tsDialog('Return date and time', F.ret, ts => { F.ret = ts; render(); });
    else if (k === 'eng') numDialog('Engine hours at end', 'Hours (whole)', F.eng, { max: 5 }, v => { F.eng = v == null ? '' : v; render(); });
    else numDialog({ gal: 'Gallons', ppg: 'Price per gallon', tot: 'Total cost' }[k], { gal: 'Gallons', ppg: '$ / gallon', tot: 'Total $' }[k], F[k], { max: 5, decimal: true }, v => { F[k] = v == null ? '' : v; render(); });
  },
  async reviewBlanks() {
    const t = await currentTrip(), F = S.fin, rd = live(await getAll('readings')).filter(r => r.trip_id === t.trip_id);
    const items = [['AIR_TEMP_F', 'Air temperature'], ['WATER_TEMP_F', 'Water temperature'], ['WIND_SPEED', 'Wind speed'], ['DEPTH_FT', 'Depth'], ['SALINITY', 'Salinity']].filter(([v]) => !rd.some(r => r.variable === v));
    if (t.passengers == null) items.push(['passengers', 'Passengers']); if (F.eng === '') items.push(['engine_hours_end', 'Engine hours end']);
    S.items = items;
    if (!items.length) { alert('Nothing is blank.'); return; }
    modal(`<h2>Review blanks</h2><p class="mut">Mark why each is blank, or leave it blank.</p>${items.map(([k, l]) => `<div class="card"><b>${l}</b><div class="row">${[['', 'Leave blank'], ['NOT_MEASURED', 'Not measured'], ['NOT_APPLICABLE', 'Not applicable'], ['UNKNOWN', 'Unknown']].map(([c, n]) => `<button class="sm ${((F.blanks[k] || '') === c) ? 'sel' : ''}" data-a="blank" data-k="${k}" data-v="${c}">${n}</button>`).join('')}</div></div>`).join('')}<button class="p big" data-a="closeM">Done</button>`);
  },
  blank(e) { const F = S.fin, k = e.dataset.k, v = e.dataset.v; if (v) F.blanks[k] = v; else delete F.blanks[k]; ACT.reviewBlanks(); },
  async completeTrip() {
    const t = await currentTrip(), F = S.fin; F.vendor = document.getElementById('fvendor').value.trim(); F.notes = document.getElementById('fnotes').value.trim();
    const warns = [], eng = F.eng === '' ? null : +F.eng, gal = F.gal === '' ? null : +F.gal, ppg = F.ppg === '' ? null : +F.ppg, tot = F.tot === '' ? null : +F.tot;
    if (minutesBetween(t.depart_ts, F.ret) < 0) warns.push('Return time is before the depart time.');
    if (eng != null && t.engine_hours_start != null && eng < t.engine_hours_start) warns.push('Engine hours at end are lower than at start.');
    if (eng != null && t.engine_hours_start != null && eng > t.engine_hours_start + 24) warns.push('Engine hours at end are more than 24 above the start.');
    if (gal != null && gal <= 0) warns.push('Gallons should be more than 0.');
    if (gal != null && ppg != null && tot != null && Math.abs(Math.round(gal * ppg * 100) / 100 - tot) > 0.02) warns.push(`Total $${tot} does not match gallons × price ($${(Math.round(gal * ppg * 100) / 100).toFixed(2)}).`);
    if (warns.length && !confirm(warns.join('\n') + '\nComplete the trip anyway?')) return;
    if (!confirm('Mark this trip complete (back at the dock)? Any lines still down will be closed.')) return;
    const t0 = F.ret;
    for (const [k, st] of Object.entries(F.blanks)) {
      if (k === 'passengers' || k === 'engine_hours_end') await put('trips', { trip_id: t.trip_id, [k + '_status']: st });
      else await addReading(t.trip_id, null, { variable: k, status: st, unit: READ_DEF[k].unit, context: 'AT_RETURN', obs_ts: t0 });
    }
    for (const d of await activeDeps(t.trip_id)) await put('deployments', { deployment_id: d.deployment_id, deploy_end_ts: t0, end_reason: 'PICKED_UP_FINAL' });
    for (const v of live(await getAll('area_visits')).filter(v => v.trip_id === t.trip_id && !v.leave_ts)) await put('area_visits', { area_visit_id: v.area_visit_id, leave_ts: t0 });
    if (gal != null || ppg != null || tot != null || F.vendor) { const fid = await nextFuelId(t.trip_date); await put('fuel_purchases', { fuel_id: fid, trip_id: t.trip_id, purchase_date: t.trip_date, gallons: gal, price_per_gallon: ppg, total_cost: tot, vendor: F.vendor || null, notes: null }); }
    await put('trips', { trip_id: t.trip_id, status: 'COMPLETED', return_ts: t0, engine_hours_end: eng, trip_notes: F.notes || null });
    S.fin = null; go('done', { tripId: t.trip_id });
  }
});
SCREENS.done = async () => `<h1>Trip ${S.tripId} complete ✔</h1><p>Saved on this tablet. Save a backup now so the trip is also stored outside the tablet.</p>
 <button class="p big" data-a="backup">Backup now</button> <button class="big" data-a="go" data-s="home">Home</button><div id="msg" class="warn" style="display:none"></div>`;

/* ================= DATA & BACKUP ================= */
let shareFile = null;
async function prepShare() { const b = document.getElementById('shareBtn'); if (!b || !db) return; try { const { blob, name } = await makeBackup(); shareFile = new File([blob], name, { type: 'application/json' }); if (navigator.canShare && navigator.canShare({ files: [shareFile] })) b.disabled = false; } catch (e) {} }
SCREENS.data = async () => {
  const trips = live(await getAll('trips')).sort((a, b) => a.trip_id < b.trip_id ? 1 : -1), loops = live(await getAll('loops')), lb = await metaGet('last_backup_at');
  S.afterRender = () => { setTimeout(prepShare, 300); const p = document.getElementById('persist'); if (p && navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(v => p.textContent = v ? 'protected (persistent)' : 'not guaranteed'); };
  return `<h1>Data &amp; backup</h1>${ACTION_BAR('<button data-a="go" data-s="home">Home</button>')}
 <button class="p big" data-a="backup">Save backup file</button> <button class="big" id="shareBtn" data-a="shareBackup" disabled>Share backup</button> <button class="big" data-a="restorePick">Restore from file</button><input type="file" id="rf" accept=".json,application/json" style="display:none">
 <div id="msg" class="warn" style="display:none"></div>
 <div class="card"><b>Last backup:</b> ${lb ? lb.slice(0, 16) : 'none yet'}<br><b>Storage kept by Chrome:</b> <span id="persist">see Home after opening</span></div>
 <div class="card"><b>Program version:</b> ${self.APP_VERSION}<br><button class="sm" data-a="chkUpdate">Check for update</button> <span id="updmsg" class="mut"></span></div>
 <div class="card"><b>Erase everything</b><br><span class="mut">Erases every trip, loop, count, area and spot on this tablet. A backup file is saved first.</span><br><button class="sm danger" data-a="eraseAll">Erase ALL data…</button></div>
 <h2>Trips (${trips.length})</h2><table><tr><th>Trip</th><th>Status</th><th>Loops</th></tr>${trips.map(t => `<tr><td>${t.trip_id}</td><td>${t.status === 'COMPLETED' ? 'finished' : 'open'}</td><td>${loops.filter(l => l.trip_id === t.trip_id).length}</td></tr>`).join('')}</table><!--ACT--><!--/ACT-->`;
};
Object.assign(ACT, {
  async backup() { const { blob, name } = await makeBackup(), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    await metaSet('last_backup_at', now()); msg(`Backup saved to Downloads as ${name} (${blob.size} bytes)`); },
  shareBackup() { if (!shareFile) return; navigator.share({ files: [shareFile], title: shareFile.name }).then(() => metaSet('last_backup_at', now())).catch(err => msg('Share cancelled or failed: ' + err.name + ' : ' + err.message)); },
  restorePick() { const f = document.getElementById('rf'); f.value = ''; f.onchange = () => f.files[0] && restoreFile(f.files[0]); f.click(); },
  chkUpdate() { checkUpdate(); }, forceRefresh() { forceRefresh(); },
  async eraseAll() {
    const a = await getAll('trips'), l = await getAll('locations');
    if (!confirm(`This will ERASE all ${a.length} trips and ${l.length} spots on this tablet, and everything else you have entered. A backup file will be saved to Downloads first. Continue?`)) return;
    const w = prompt('Type ERASE (capital letters) to confirm.'); if (w !== 'ERASE') { msg('Nothing was erased.'); return; }
    await ACT.backup(); await eraseAllData(); go('data'); setTimeout(() => msg('All data erased. A backup file was saved to Downloads just before. Use Restore from file to load your spot list.'), 300);
  }
});
async function restoreFile(file) {
  let j; try { j = JSON.parse(await file.text()); } catch (e) { msg('That file could not be read as a backup.'); return; }
  const plan = await planRestore(j); if (!plan) { msg('This is not a CrabMetrics backup or spot-list file.'); return; }
  const txt = `File has ${plan.total} records: ${plan.nDup} already here (${plan.nDiff} of those differ from what is here and will be left as they are); ${plan.nAdd} would be added. Existing records are never overwritten.${plan.note ? '\n' + plan.note : ''}\nAdd them?`;
  if (!confirm(txt)) return;
  await applyRestore(plan); onSaved(); msg(`Restore done: ${plan.nAdd} added, ${plan.nDup} skipped (already present).`);
}

/* ================= AREAS & SPOTS ================= */
SCREENS.spots = async () => {
  const areas = live(await getAll('areas')).sort((a, b) => a.name < b.name ? -1 : 1), locs = live(await getAll('locations')), f = !!S.onlyFinish;
  const shown = areas.map(a => ({ a, ls: locs.filter(l => l.area_id === a.area_id && (!f || l.needs_review)).sort(bySpot) })).filter(x => !f || x.ls.length);
  return `<h1>Areas &amp; spots</h1>${ACTION_BAR('<button data-a="go" data-s="home">Home</button>')}<button class="sm" data-a="addArea">+ Add new area</button> <button class="sm ${f ? 'sel' : ''}" data-a="toggleFinish">To finish: ${f ? 'ON' : 'OFF'}</button>`
    + shown.map(({ a, ls }) => `<div class="card"><b>${esc(a.name)}</b>${a.active === false ? ' (retired)' : ''} <button class="sm" data-a="editArea" data-id="${a.area_id}">Edit</button>
   ${ls.map(l => `<div class="row"><span>${esc(l.name)}${l.active === false ? ' (retired)' : ''}${l.needs_review ? ' <span class="mut">(to finish)</span>' : ''}${l.latitude != null ? ' 📍' : ''}${l.usual_heading_deg != null ? ' <span class="mut">' + l.usual_heading_deg + '°</span>' : ''}</span><button class="sm" data-a="editSpot" data-id="${l.location_id}">Edit</button>
   ${l.latitude != null ? `<a href="https://www.google.com/maps?q=${l.latitude},${l.longitude}&z=17&t=k" target="_blank" rel="noopener">map</a>` : ''}</div>`).join('')}</div>`).join('') + `<!--ACT--><!--/ACT-->`;
};
function areaDialog(rec, cb) {
  modal(`<h2>${rec ? 'Edit area' : 'New area'}</h2><label>Name</label><input type="text" enterkeyhint="done" id="an" value="${esc(rec ? rec.name : '')}">
 ${rec ? `<button class="${rec.active === false ? 'sel' : ''}" data-a="toggleRetire" data-id="${rec.area_id}" data-st="areas">${rec.active === false ? 'Retired (tap to restore)' : 'Retire area'}</button>` : ''}
 <div class="stick"><button class="p big" id="aok">Save</button> <button data-a="closeM">Cancel</button></div>`);
  document.getElementById('aok').onclick = async () => {
    const n = document.getElementById('an').value.trim(); if (!n) { alert('Name needed'); return; }
    const dup = live(await getAll('areas')).find(a => a.name.toLowerCase() === n.toLowerCase() && (!rec || a.area_id !== rec.area_id)); if (dup) { alert('That area name already exists'); return; }
    const r = await put('areas', { area_id: rec ? rec.area_id : 'AREA-' + Date.now().toString(36), name: n, tide_station_id: rec ? rec.tide_station_id : null }); closeModal(); cb && cb(r);
  };
}
async function spotDialog(areaId, rec, cb) {
  const sib = live(await getAll('locations')).filter(l => l.area_id === areaId); let def = '01'; while (sib.some(l => l.name === def)) def = p2(+def + 1);
  modal(`<h2>${rec ? 'Edit spot' : 'New spot in ' + esc(await areaName(areaId))}</h2><label>Name</label><input type="text" enterkeyhint="done" id="sn" value="${esc(rec ? rec.name : def)}">
 <label>Position from chartplotter (not shown on crab screens)</label><input type="text" enterkeyhint="done" id="sp" value="${esc(rec ? rec.position_text || '' : '')}" placeholder="Example: 38°36.738' N 075°06.274' W"><div id="pc" class="mut"></div>
 <label>Usual heading in degrees (optional; pre-fills the direction)</label><input type="text" inputmode="numeric" enterkeyhint="done" id="uh" value="${rec && rec.usual_heading_deg != null ? rec.usual_heading_deg : ''}" placeholder="e.g. 322">
 ${rec ? `<div class="row"><button class="${rec.active === false ? 'sel' : ''}" data-a="toggleRetire" data-id="${rec.location_id}" data-st="locations">${rec.active === false ? 'Retired (tap to restore)' : 'Retire spot'}</button></div>` : ''}
 <div class="row"><button class="${rec && rec.needs_review ? 'sel' : ''}" id="nr">${!rec || rec.needs_review ? 'Mark: to finish later ✔' : 'Mark: to finish later'}</button></div>
 <div class="stick"><button class="p big" id="sok">Save</button> <button data-a="closeM">Cancel</button></div>`);
  let nr = !rec || rec.needs_review; const nrb = document.getElementById('nr'); nrb.onclick = () => { nr = !nr; nrb.textContent = nr ? 'Mark: to finish later ✔' : 'Mark: to finish later'; };
  const sp = document.getElementById('sp'), pc = document.getElementById('pc');
  const chk = () => { const t = sp.value.trim(); if (!t) { pc.textContent = ''; return; } const c = parseCoord(t); pc.textContent = c ? `Read as ${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}` : 'Could not read this position (it will still be saved as text).'; }; sp.oninput = chk; chk();
  document.getElementById('sok').onclick = async () => {
    const n = document.getElementById('sn').value.trim(); if (!n) { alert('Name needed'); return; }
    if (sib.some(l => l.name.toLowerCase() === n.toLowerCase() && (!rec || l.location_id !== rec.location_id))) { alert('That spot name already exists in this area'); return; }
    const t = sp.value.trim(), c = parseCoord(t), uhv = document.getElementById('uh').value.trim();
    if (uhv !== '' && !(/^\d{1,3}$/.test(uhv) && +uhv <= 360)) { alert('Usual heading must be 0 to 360 degrees'); return; }
    const r = await put('locations', { location_id: rec ? rec.location_id : 'LOC-' + Date.now().toString(36), area_id: areaId, name: n, position_text: t || null, latitude: c ? c.lat : null, longitude: c ? c.lon : null,
      coordinate_basis: c ? (rec && rec.coordinate_basis) || 'TYPED_FROM_CHARTPLOTTER' : null, usual_heading_deg: uhv === '' ? null : (+uhv) % 360, needs_review: !!nr, created_on_trip_id: rec ? rec.created_on_trip_id : (S.tripId || null) });
    closeModal(); cb && cb(r);
  };
}
Object.assign(ACT, {
  addArea() { areaDialog(null, async r => { if (S.screen === 'start') S.draft.area_id = r.area_id; render(); }); },
  async addSpot(e) { const u = e.dataset.u, mv = u.startsWith('MV'), aid = mv ? S.mv.area_id : S.draft.area_id; spotDialog(aid, null, r => { if (mv) S.mv.lines[u.slice(2)].spot = r.location_id; else S.draft.lines[u].spot = r.location_id; render(); }); },
  async editArea(e) { areaDialog(await getOne('areas', e.dataset.id), () => render()); },
  async editSpot(e) { const l = await getOne('locations', e.dataset.id); spotDialog(l.area_id, l, () => render()); },
  async toggleRetire(e) { const r = await getOne(e.dataset.st, e.dataset.id); await put(e.dataset.st, { [STORES[e.dataset.st]]: r[STORES[e.dataset.st]], active: r.active === false }); closeModal(); render(); },
  toggleFinish() { S.onlyFinish = !S.onlyFinish; render(); }
});
