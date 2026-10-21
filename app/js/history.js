'use strict';
/* History, trip detail and editing, Trash. Uses screens/helpers from ui.js. */

/* ---------- generic record editor ---------- */
const tsInput = ts => ts ? `${tsDate(ts)} ${tsTime(ts)}` : '';
function parseTsInput(t) { const m = t.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/); if (!m) return undefined; const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0); return (d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]) ? mkTs(d) : undefined; }
function fieldHTML(f, v) {
  const id = 'ef_' + f.k, lab = `<label for="${id}">${esc(f.label)}${f.hint ? ' <span class="mut">' + esc(f.hint) + '</span>' : ''}</label>`;
  if (f.type === 'enum') return lab + `<select id="${id}"><option value="">(blank)</option>${f.opts.map(([c, l]) => `<option value="${esc(c)}" ${v === c ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  if (f.type === 'note') return lab + `<textarea id="${id}" rows="3">${esc(v ?? '')}</textarea>`;
  const val = f.type === 'ts' ? tsInput(v) : (v ?? '');
  return lab + `<input type="text" id="${id}" enterkeyhint="done" ${f.type === 'int' ? 'inputmode="numeric"' : f.type === 'dec' ? 'inputmode="decimal"' : ''} value="${esc(val)}" ${f.type === 'ts' ? 'placeholder="YYYY-MM-DD HH:MM"' : ''}>`;
}
/* opts: {isNew, after, validate(patch, merged)->[warnings], note} */
function editRec(store, rec, title, specs, opts = {}) {
  const kp = STORES[store];
  modal(`<h2>${esc(title)}</h2>${opts.note ? `<p class="mut">${opts.note}</p>` : ''}${specs.map(f => fieldHTML(f, rec[f.k])).join('')}<div class="stick row"><button class="p big" id="erok">Save</button><button data-a="closeM">Cancel</button></div>`);
  document.getElementById('erok').onclick = async () => {
    const patch = {}, errs = [];
    for (const f of specs) {
      const raw = document.getElementById('ef_' + f.k).value, old = rec[f.k] ?? null; let nv;
      if (f.type === 'enum') nv = raw === '' ? null : raw;
      else if (f.type === 'note' || f.type === 'text') nv = raw.trim() === '' ? null : raw.trim();
      else if (raw.trim() === '') nv = null;
      else if (f.type === 'int') { if (!/^-?\d+$/.test(raw.trim())) { errs.push(f.label + ' must be a whole number'); continue; } nv = +raw.trim(); }
      else if (f.type === 'dec') { if (!/^-?\d*\.?\d+$/.test(raw.trim())) { errs.push(f.label + ' must be a number'); continue; } nv = +raw.trim(); }
      else if (f.type === 'ts') { if (raw.trim() === tsInput(old)) continue; nv = parseTsInput(raw); if (nv === undefined) { errs.push(f.label + ' must look like 2026-10-21 14:30'); continue; } }
      else if (f.type === 'date') { if (raw.trim() !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) { errs.push(f.label + ' must look like 2026-10-21'); continue; } nv = raw.trim() || null; }
      if (nv !== old && !(f.type === 'ts' && nv === old)) patch[f.k] = nv;
    }
    if (errs.length) { alert(errs.join('\n')); return; }
    if (!Object.keys(patch).length && !opts.isNew) { closeModal(); return; }
    const merged = Object.assign({}, rec, patch), warns = opts.validate ? opts.validate(patch, merged) : [];
    if (warns.length && !confirm(warns.join('\n') + '\nSave anyway?')) return;
    if (opts.derive) Object.assign(patch, opts.derive(patch, merged));
    if (opts.isNew) await put(store, Object.assign({}, rec, patch));
    else { await logEdit(store, rec, patch); await put(store, Object.assign({ [kp]: rec[kp] }, patch)); }
    closeModal(); if (opts.after) await opts.after(); else render();
  };
}
async function logEdit(store, rec, patch) {
  const kp = STORES[store], ch = Object.keys(patch).map(k => ({ field: k, old: rec[k] ?? null, new: patch[k] }));
  if (!ch.length) return;
  await put('edit_log', { id: 'EL-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), logged_at: now(), store, record_id: rec[kp], trip_id: rec.trip_id || (store === 'trips' ? rec.trip_id : null), changes: ch }, { quiet: true });
}
const mustBeAfter = (a, b, la, lb) => (a && b && minutesBetween(a, b) < 0) ? [`${lb} is before ${la}.`] : [];

/* ---------- field specs ---------- */
const ENUMS = {
  endReason: [['MOVED', 'Moved'], ['PICKED_UP_FINAL', 'Picked up (final)'], ['LOST', 'Lost'], ['OTHER', 'Other']],
  countStatus: [['COUNTED', 'Counted'], ['NOT_COUNTED', 'Not counted'], ['NOT_APPLICABLE', 'Not applicable']],
  rstatus: [['NOT_MEASURED', 'Not measured'], ['NOT_APPLICABLE', 'Not applicable'], ['UNKNOWN', 'Unknown']],
  basis: [['MEASURED', 'Measured'], ['EXTERNAL', 'External source'], ['ESTIMATED', 'Estimated'], ['CALCULATED', 'Calculated']],
  source: [['GARMIN', 'Garmin'], ['WINDY_APP', 'windy.app'], ['SALINITY_METER', 'Salinity meter'], ['APP_CALC', 'App calculation'], ['OTHER', 'Other']],
  heading: [...DIRS.map(d => [d, d]), ['UNKNOWN', 'Unknown']]
};
const tripSpecs = () => [
  { k: 'depart_ts', label: 'Depart', type: 'ts' }, { k: 'return_ts', label: 'Return', type: 'ts' },
  { k: 'engine_hours_start', label: 'Engine hours start', type: 'int' }, { k: 'engine_hours_end', label: 'Engine hours end', type: 'int' },
  { k: 'passengers', label: 'Passengers', type: 'int' },
  { k: 'weather_sky', label: 'Sky', type: 'enum', opts: LISTS.weather_sky }, { k: 'wind_condition', label: 'Wind condition', type: 'enum', opts: LISTS.wind_condition }, { k: 'water_condition', label: 'Water condition', type: 'enum', opts: LISTS.water_condition },
  { k: 'trip_notes', label: 'Notes', type: 'note' }];
const tripValidate = (p, m) => [...mustBeAfter(m.depart_ts, m.return_ts, 'depart', 'return'),
  ...((m.engine_hours_start != null && m.engine_hours_end != null && m.engine_hours_end < m.engine_hours_start) ? ['Engine hours at end are lower than at start.'] : []),
  ...((m.passengers != null && (m.passengers < 0 || m.passengers > 20)) ? ['Passengers is outside 0 to 20.'] : [])];
async function locOpts() { const ar = Object.fromEntries(live(await getAll('areas')).map(a => [a.area_id, a.name])); return live(await getAll('locations')).sort((a, b) => (ar[a.area_id] || '') < (ar[b.area_id] || '') ? -1 : 1).map(l => [l.location_id, `${ar[l.area_id] || '?'} – ${l.name}`]); }
const countOk = (v, l) => (v != null && (v < 0 || v > 999)) ? [`${l} should be 0 to 999.`] : [];

/* ---------- history list ---------- */
SCREENS.history = async () => {
  const trips = live(await getAll('trips')).sort((a, b) => a.trip_id < b.trip_id ? 1 : -1), loops = live(await getAll('loops')), visits = live(await getAll('area_visits')), areas = Object.fromEntries((await getAll('areas')).map(a => [a.area_id, a.name]));
  const trash = (await trashItems()).length;
  const rows = trips.map(t => {
    const ls = loops.filter(l => l.trip_id === t.trip_id), m = ls.some(l => l.medium_count != null) ? ls.reduce((a, l) => a + (l.medium_count || 0), 0) : null, lg = ls.some(l => l.large_count != null) ? ls.reduce((a, l) => a + (l.large_count || 0), 0) : null;
    const tot = (m == null && lg == null) ? '—' : (m || 0) + (lg || 0), an = [...new Set(visits.filter(v => v.trip_id === t.trip_id).map(v => areas[v.area_id]).filter(Boolean))].join(', ');
    return `<tr><td><b>${t.trip_id}</b></td><td>${t.status === 'COMPLETED' ? 'finished' : '<b>open</b>'}</td><td>${esc(an) || '—'}</td><td>${ls.length}</td><td>${tot}</td><td>${t.return_ts ? fmtMin(minutesBetween(t.depart_ts, t.return_ts)) : '—'}</td><td><button class="sm p" data-a="openTrip" data-id="${t.trip_id}">Open</button></td></tr>`;
  }).join('');
  return `<h1>History</h1>${ACTION_BAR('<button data-a="go" data-s="home">Home</button> <button data-a="go" data-s="trash">Trash (' + trash + ')</button>')}
 ${trips.length ? `<table><tr><th>Trip</th><th>Status</th><th>Area</th><th>Loops</th><th>Crabs</th><th>Time</th><th></th></tr>${rows}</table><p class="mut">Crabs = Medium + Large, calculated. Time = depart to return.</p>` : '<p>No trips yet.</p>'}<!--ACT--><!--/ACT-->`;
};

/* ---------- trip detail ---------- */
SCREENS.trip = async () => {
  const t = await getOne('trips', S.tripId); if (!t || t.deleted_at) { S.screen = 'history'; return SCREENS.history(); }
  const id = t.trip_id, by = a => live(a).filter(x => x.trip_id === id);
  const visits = by(await getAll('area_visits')).sort((a, b) => a.seq - b.seq), deps = by(await getAll('deployments')).sort((a, b) => a.seq - b.seq), loops = by(await getAll('loops')).sort((a, b) => a.seq - b.seq),
    rds = by(await getAll('readings')).sort((a, b) => a.obs_ts < b.obs_ts ? -1 : 1), evs = by(await getAll('events')).sort((a, b) => a.seq - b.seq), tides = by(await getAll('tide_events')).sort((a, b) => a.tide_time < b.tide_time ? -1 : 1),
    fuel = by(await getAll('fuel_purchases')), unitRows = by(await getAll('loop_unit_counts')), areas = Object.fromEntries((await getAll('areas')).map(a => [a.area_id, a.name])), locs = Object.fromEntries((await getAll('locations')).map(l => [l.location_id, l.name]));
  const logs = (await getAll('edit_log')).filter(x => x.trip_id === id);
  const sec = (title, body, add) => `<h2>${title} ${add || ''}</h2>${body || '<p class="mut">None.</p>'}`;
  const line = (txt, ...btns) => `<div class="row card" style="margin:3px 0;padding:6px 10px"><span style="flex:1;min-width:200px">${txt}</span>${btns.join('')}</div>`;
  const eb = (a, i, l = 'Edit') => `<button class="sm" data-a="${a}" data-id="${i}">${l}</button>`, db_ = (a, i) => `<button class="sm danger" data-a="${a}" data-id="${i}">Delete</button>`;
  const val = r => r.status ? ({ NOT_MEASURED: 'not measured', NOT_APPLICABLE: 'not applicable', UNKNOWN: 'unknown' })[r.status] : r.value_min != null ? `${r.value_min}–${r.value_max} ${r.unit || ''}` : r.value_num != null ? `${r.value_num} ${r.unit || ''}` : (r.value_text || '—');
  let h = `<h1>Trip ${id} ${t.status === 'COMPLETED' ? '<span class="mut">(finished)</span>' : '<b>(open)</b>'}</h1>` + ACTION_BAR('<button data-a="go" data-s="history">Back to History</button> <button data-a="go" data-s="home">Home</button>');
  h += sec('Trip', `<div class="card">Depart ${tsInput(t.depart_ts)} · Return ${tsInput(t.return_ts) || '—'} · Time ${t.return_ts ? fmtMin(minutesBetween(t.depart_ts, t.return_ts)) : '—'}<br>Engine hours ${t.engine_hours_start ?? '—'} → ${t.engine_hours_end ?? '—'} · Passengers ${t.passengers ?? '—'}<br>Sky ${labelOf('weather_sky', t.weather_sky) || '—'} · Wind ${labelOf('wind_condition', t.wind_condition) || '—'} · Water ${labelOf('water_condition', t.water_condition) || '—'}<br>Notes: ${esc(t.trip_notes) || '—'}<br><button class="sm" data-a="editTrip">Edit trip details</button></div>`);
  h += sec('Area visits', visits.map(v => line(`${v.seq}. <b>${esc(areas[v.area_id] || '?')}</b> ${tsInput(v.arrive_ts)} → ${tsInput(v.leave_ts) || '—'}${v.stay_notes ? ' — ' + esc(v.stay_notes) : ''}`, eb('editVisit', v.area_visit_id))).join(''));
  h += sec('Lines', deps.map(d => line(`<b>Line ${d.unit_label}</b> ${esc(locs[d.location_id] || '(spot not recorded)')}, ${d.lay_heading_deg != null ? d.lay_heading_deg + '°' : d.lay_heading || 'no heading'} · ${eqLabel(d.equipment_type)}${d.equipment_type === 'TRAP' ? ' ' + (d.trap_count ?? '?') + ' traps' : d.line_length_ft ? ' ' + d.line_length_ft + ' ft' : ''} · bait ${baitLabel(d.bait_type)}<br><span class="mut">${tsInput(d.deploy_start_ts)} → ${tsInput(d.deploy_end_ts) || '—'} ${d.end_reason || ''}</span>`, eb('editDep', d.deployment_id))).join(''));
  h += sec('Loops', loops.map(l => line(`<b>${l.seq}.</b> ${({ RUN: 'Run', PICKUP_MOVE: 'Pick-up (moving)', PICKUP_FINAL: 'Pick-up (final)' })[l.loop_type] || ''} ${tsInput(l.start_ts)}–${tsTime(l.end_ts)} · ${l.count_status === 'NOT_COUNTED' ? 'not counted' : 'Medium ' + (l.medium_count ?? '—') + ' · Large ' + (l.large_count ?? '—')}${l.loop_notes ? ' — ' + esc(l.loop_notes) : ''}`, `<button class="sm" data-a="editLoop" data-id="${l.loop_id}" data-back="trip">Counts</button>`, eb('editLoopInfo', l.loop_id, 'Times / notes'), db_('delRec', 'loops|' + l.loop_id))).join(''));
  h += sec('Readings', rds.map(r => line(`${r.variable.replace(/_/g, ' ').toLowerCase()}: <b>${esc(val(r))}</b> <span class="mut">${tsTime(r.obs_ts)} ${r.context || ''}</span>`, eb('editRead', r.reading_id), db_('delRec', 'readings|' + r.reading_id))).join(''), '<button class="sm" data-a="addRead">+ Add reading</button>');
  h += sec('Events', evs.map(e => line(`${evLabel(e.event_type)} ${tsInput(e.start_ts)} → ${tsInput(e.end_ts) || 'in progress'}${e.note ? ' — ' + esc(e.note) : ''}`, eb('editEvent', e.event_id), db_('delRec', 'events|' + e.event_id))).join(''));
  h += sec('Tides', tides.map(x => line(`${x.tide_type === 'HIGH' ? 'High' : 'Low'} ${tsInput(x.tide_time)} <span class="mut">${x.basis === 'PREDICTED' ? 'predicted' : 'typed'} ${x.station || ''}</span>`, eb('editTide', x.tide_id), db_('delRec', 'tide_events|' + x.tide_id))).join(''));
  h += sec('Fuel', fuel.map(f => line(`${f.gallons ?? '—'} gal × $${f.price_per_gallon ?? '—'} = $${f.total_cost ?? '—'} ${esc(f.vendor || '')}`, eb('editFuel', f.fuel_id), db_('delRec', 'fuel_purchases|' + f.fuel_id))).join(''));
  if (logs.length) h += `<h2>Edit log (${logs.length})</h2>` + logs.sort((a, b) => a.logged_at < b.logged_at ? 1 : -1).slice(0, 15).map(x => `<div class="mut">${x.logged_at.slice(0, 16)} ${x.store} ${x.record_id}: ${x.changes.map(c => `${c.field} ${JSON.stringify(c.old)} → ${JSON.stringify(c.new)}`).join('; ')}</div>`).join('');
  h += `<div class="row" style="margin-top:14px">${t.status === 'COMPLETED' ? '<button class="sm" data-a="reopenTrip">Reopen trip</button>' : ''}<button class="sm danger" data-a="delTrip">Delete this trip…</button></div>`;
  return h;
};

/* ---------- history/trip actions ---------- */
Object.assign(ACT, {
  openTrip(e) { go('trip', { tripId: e.dataset.id }); },
  async editTrip() { const t = await getOne('trips', S.tripId); editRec('trips', t, 'Edit trip ' + t.trip_id, tripSpecs(), { validate: tripValidate, derive: (p) => p.depart_ts ? { trip_date: tsDate(p.depart_ts) } : {}, note: 'The trip ID never changes.' }); },
  async editVisit(e) { const v = await getOne('area_visits', e.dataset.id), ar = live(await getAll('areas')).map(a => [a.area_id, a.name]); editRec('area_visits', v, 'Edit area visit', [{ k: 'area_id', label: 'Area', type: 'enum', opts: ar }, { k: 'arrive_ts', label: 'Arrived', type: 'ts' }, { k: 'leave_ts', label: 'Left', type: 'ts' }, { k: 'stay_notes', label: 'Notes', type: 'note' }], { validate: (p, m) => mustBeAfter(m.arrive_ts, m.leave_ts, 'arrival', 'departure') }); },
  async editDep(e) { const d = await getOne('deployments', e.dataset.id), lo = await locOpts();
    editRec('deployments', d, 'Edit line ' + d.unit_label, [{ k: 'location_id', label: 'Spot', type: 'enum', opts: lo }, { k: 'lay_heading_deg', label: 'Heading degrees', type: 'int', hint: '0–360' }, { k: 'lay_heading', label: 'Heading (compass)', type: 'enum', opts: ENUMS.heading },
      { k: 'equipment_type', label: 'Gear', type: 'enum', opts: EQS }, { k: 'line_length_ft', label: 'Line length ft', type: 'int' }, { k: 'trap_count', label: 'Traps in string', type: 'int' }, { k: 'trap_spacing_ft', label: 'Trap spacing ft', type: 'int' }, { k: 'bait_type', label: 'Bait', type: 'enum', opts: BAITS },
      { k: 'deploy_start_ts', label: 'Down at', type: 'ts' }, { k: 'deploy_end_ts', label: 'Up at', type: 'ts' }, { k: 'end_reason', label: 'End reason', type: 'enum', opts: ENUMS.endReason }],
      { validate: (p, m) => [...mustBeAfter(m.deploy_start_ts, m.deploy_end_ts, 'down time', 'up time'), ...((m.lay_heading_deg != null && (m.lay_heading_deg < 0 || m.lay_heading_deg > 360)) ? ['Heading should be 0 to 360.'] : [])], derive: p => (p.lay_heading_deg != null && !p.lay_heading) ? { lay_heading: nearest(p.lay_heading_deg) } : {} }); },
  async editLoopInfo(e) { const l = await getOne('loops', e.dataset.id), has = live(await getAll('loop_unit_counts')).some(r => r.loop_id === l.loop_id);
    const sp = [{ k: 'loop_type', label: 'Loop type', type: 'enum', opts: LTYPES }, { k: 'start_ts', label: 'Started', type: 'ts' }, { k: 'end_ts', label: 'Ended', type: 'ts' }];
    if (!has) sp.push({ k: 'medium_count', label: 'Medium', type: 'int' }, { k: 'large_count', label: 'Large', type: 'int' }, { k: 'count_status', label: 'Count status', type: 'enum', opts: ENUMS.countStatus });
    sp.push({ k: 'loop_notes', label: 'Notes', type: 'note' });
    editRec('loops', l, 'Edit loop ' + l.seq, sp, { note: has ? 'This loop has per-line counts. Use the Counts button to change them.' : '', validate: (p, m) => [...mustBeAfter(m.start_ts, m.end_ts, 'start', 'end'), ...countOk(m.medium_count, 'Medium'), ...countOk(m.large_count, 'Large')] }); },
  async editRead(e) { const r = await getOne('readings', e.dataset.id);
    editRec('readings', r, 'Edit ' + r.variable.replace(/_/g, ' ').toLowerCase(), [{ k: 'value_num', label: 'Value', type: 'dec' }, { k: 'value_min', label: 'Range low (optional)', type: 'dec' }, { k: 'value_max', label: 'Range high (optional)', type: 'dec' }, { k: 'value_text', label: 'Text value (e.g. wind direction)', type: 'text' },
      { k: 'unit', label: 'Unit', type: 'text' }, { k: 'status', label: 'If not recorded, why', type: 'enum', opts: ENUMS.rstatus }, { k: 'basis', label: 'Basis', type: 'enum', opts: ENUMS.basis }, { k: 'source', label: 'Source', type: 'enum', opts: ENUMS.source }, { k: 'obs_ts', label: 'Observed', type: 'ts' }],
      { validate: (p, m) => { const w = m.value_num != null ? rangeWarn(m.variable, m.value_num, m.unit) : null; return w ? [w] : []; }, note: 'Leaving the value blank means not recorded. Use "If not recorded, why" for Not measured, Not applicable or Unknown. A typed 0 is a real zero.' }); },
  addRead() {
    modal(`<h2>Add reading</h2><div class="row">${Object.keys(READ_DEF).map(k => `<button data-a="addReadGo" data-v="${k}">${k.replace(/_/g, ' ').toLowerCase()}</button>`).join('')}</div><button data-a="closeM">Cancel</button>`);
  },
  async addReadGo(e) {
    const t = await getOne('trips', S.tripId), k = e.dataset.v, vis = live(await getAll('area_visits')).filter(v => v.trip_id === t.trip_id).slice(-1)[0], rid = await nextChild(t.trip_id, 'R', 3);
    const rec = Object.assign({ reading_id: rid, trip_id: t.trip_id, area_visit_id: vis ? vis.area_visit_id : null, variable: k, value_num: null, value_min: null, value_max: null, value_text: null, status: null, obs_ts: t.depart_ts, context: 'ON_SITE' }, READ_DEF[k]);
    editRec('readings', rec, 'Add ' + k.replace(/_/g, ' ').toLowerCase(), [{ k: 'value_num', label: 'Value', type: 'dec' }, { k: 'value_text', label: 'Text value', type: 'text' }, { k: 'unit', label: 'Unit', type: 'text' }, { k: 'status', label: 'If not recorded, why', type: 'enum', opts: ENUMS.rstatus }, { k: 'obs_ts', label: 'Observed', type: 'ts' }], { isNew: true });
  },
  async editEvent(e) { const x = await getOne('events', e.dataset.id); editRec('events', x, 'Edit event', [{ k: 'event_type', label: 'Type', type: 'enum', opts: EVTYPES }, { k: 'start_ts', label: 'Started', type: 'ts' }, { k: 'end_ts', label: 'Ended', type: 'ts' }, { k: 'note', label: 'Note', type: 'note' }], { validate: (p, m) => mustBeAfter(m.start_ts, m.end_ts, 'start', 'end') }); },
  async editTide(e) { const x = await getOne('tide_events', e.dataset.id); editRec('tide_events', x, 'Edit tide', [{ k: 'tide_type', label: 'High or low', type: 'enum', opts: [['HIGH', 'High'], ['LOW', 'Low']] }, { k: 'tide_time', label: 'Time', type: 'ts' }, { k: 'station', label: 'NOAA station', type: 'text' }, { k: 'basis', label: 'Basis', type: 'enum', opts: [['PREDICTED', 'Predicted'], ['OBSERVED', 'Observed']] }]); },
  async editFuel(e) { const x = await getOne('fuel_purchases', e.dataset.id); editRec('fuel_purchases', x, 'Edit fuel', [{ k: 'gallons', label: 'Gallons', type: 'dec' }, { k: 'price_per_gallon', label: 'Price per gallon $', type: 'dec' }, { k: 'total_cost', label: 'Total $', type: 'dec' }, { k: 'vendor', label: 'Vendor', type: 'text' }, { k: 'notes', label: 'Notes', type: 'note' }],
    { validate: (p, m) => (m.gallons != null && m.price_per_gallon != null && m.total_cost != null && Math.abs(Math.round(m.gallons * m.price_per_gallon * 100) / 100 - m.total_cost) > 0.02) ? ['Total does not match gallons × price.'] : [] }); },
  async delRec(e) {
    const [store, id] = e.dataset.id.split('|'); if (!confirm('Delete this record? It goes to the Trash and can be restored.')) return;
    await softDelete(store, id);
    if (store === 'loops') for (const r of live(await getAll('loop_unit_counts')).filter(r => r.loop_id === id)) await softDelete('loop_unit_counts', r.id);
    render();
  },
  async reopenTrip() {
    if (await currentTrip()) { alert('Another trip is still open. Finish it first.'); return; }
    if (!confirm('Reopen this trip so you can continue it? The return time stays until you finish it again.')) return;
    const t = await getOne('trips', S.tripId); await logEdit('trips', t, { status: 'IN_PROGRESS' }); await put('trips', { trip_id: t.trip_id, status: 'IN_PROGRESS' }); go('hub');
  },
  async delTrip() {
    const t = await getOne('trips', S.tripId), n = (await tripChildren(t.trip_id)).length;
    if (!confirm(`Delete trip ${t.trip_id} and its ${n} records? It goes to the Trash and can be restored.`)) return;
    const ts = now(); for (const [s, r] of await tripChildren(t.trip_id)) await softDeleteAt(s, r[STORES[s]], ts);
    await softDeleteAt('trips', t.trip_id, ts); onSaved(); go('history');
  }
});
const CHILD_STORES = ['area_visits', 'deployments', 'loops', 'loop_unit_counts', 'readings', 'events', 'tide_events', 'fuel_purchases'];
async function tripChildren(id) { const out = []; for (const s of CHILD_STORES) for (const r of await getAll(s)) if (r.trip_id === id) out.push([s, r]); return out; }

/* ---------- Trash ---------- */
async function trashItems() {
  const trips = await getAll('trips'), delTrips = new Set(trips.filter(t => t.deleted_at).map(t => t.trip_id)), out = [];
  for (const t of trips) if (t.deleted_at && !t.purged_at) out.push({ store: 'trips', id: t.trip_id, rec: t, label: `Trip ${t.trip_id}` });
  for (const s of CHILD_STORES) for (const r of await getAll(s)) if (r.deleted_at && !delTrips.has(r.trip_id)) out.push({ store: s, id: r[STORES[s]], rec: r, label: describeRec(s, r) });
  return out.sort((a, b) => a.rec.deleted_at < b.rec.deleted_at ? 1 : -1);
}
function describeRec(s, r) {
  return ({ loops: `Loop ${r.seq} of trip ${r.trip_id}`, readings: `Reading ${(r.variable || '').replace(/_/g, ' ').toLowerCase()} (trip ${r.trip_id})`, events: `Event ${evLabel(r.event_type)} (trip ${r.trip_id})`, tide_events: `Tide ${r.tide_type} (trip ${r.trip_id})`,
    fuel_purchases: `Fuel purchase (trip ${r.trip_id})`, area_visits: `Area visit ${r.seq} (trip ${r.trip_id})`, deployments: `Line ${r.unit_label} (trip ${r.trip_id})`, loop_unit_counts: `Line counts (trip ${r.trip_id})` })[s] || s;
}
SCREENS.trash = async () => {
  const items = await trashItems();
  return `<h1>Trash</h1>${ACTION_BAR('<button data-a="go" data-s="history">Back to History</button> <button data-a="go" data-s="home">Home</button>')}
 <p class="mut">Deleted items stay here until you delete them for good. Restoring a trip brings back everything deleted with it.</p>
 ${items.length ? items.map(x => `<div class="row card" style="margin:3px 0"><span style="flex:1;min-width:220px"><b>${esc(x.label)}</b><br><span class="mut">deleted ${x.rec.deleted_at.slice(0, 16)}</span></span><button class="sm p" data-a="restoreItem" data-st="${x.store}" data-id="${x.id}">Restore</button><button class="sm danger" data-a="purgeItem" data-st="${x.store}" data-id="${x.id}">Delete for good…</button></div>`).join('') : '<p>The Trash is empty.</p>'}<!--ACT--><!--/ACT-->`;
};
Object.assign(ACT, {
  async restoreItem(e) {
    const s = e.dataset.st, id = e.dataset.id;
    if (s === 'trips') { const t = await getOne('trips', id), ts = t.deleted_at; for (const [cs, r] of await tripChildren(id)) if (r.deleted_at === ts) await put(cs, { [STORES[cs]]: r[STORES[cs]], deleted_at: null }, { quiet: true }); await put('trips', { trip_id: id, deleted_at: null }); }
    else { await put(s, { [STORES[s]]: id, deleted_at: null }); if (s === 'loops') { for (const r of (await getAll('loop_unit_counts')).filter(r => r.loop_id === id && r.deleted_at)) await put('loop_unit_counts', { id: r.id, deleted_at: null }, { quiet: true }); } }
    render();
  },
  async purgeItem(e) {
    const s = e.dataset.st, id = e.dataset.id, label = s === 'trips' ? `trip ${id} and all its records` : describeRec(s, await getOne(s, id));
    if (!confirm(`Delete ${label} for good? This cannot be undone.`)) return;
    if (!confirm(`Last check: permanently erase ${label}?`)) return;
    if (s === 'trips') { const t = await getOne('trips', id); for (const [cs, r] of await tripChildren(id)) await hardDelete(cs, r[STORES[cs]]);
      await tx('trips', 'readwrite', x => x.objectStore('trips').put({ trip_id: id, status: 'PURGED', created_at: t.created_at, deleted_at: t.deleted_at, purged_at: now(), schema_version: self.SCHEMA_VERSION })); }
    else await hardDelete(s, id);
    render();
  }
});
