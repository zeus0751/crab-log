/*
 * CrabMetrics Data Transfer script (Google Apps Script), version 1.0
 * Lives inside the CrabMaster_Data Google Sheet (Extensions > Apps Script).
 * The CrabMetrics app sends trips here; the script adds new trips, updates changed trips,
 * never touches the formula columns, and reports exactly what it did.
 * Actions: ping, plan (preview, changes nothing), commit (writes), read (for the app's own verification).
 */
const SECRET = 'PASTE-YOUR-KEY-HERE';          // must equal the key shown in CrabMetrics > Settings > Data Transfer
const SCRIPT_VERSION = '1.3';
const SHEETS = {
  Trips: {
    key: 'trip_id',
    formula: ['season', 'month', 'day_of_season', 'duration_hours', 'engine_hours_used', 'loops_recorded', 'keepers_from_loops', 'loops_minus_typed', 'keepers_per_hour', 'season_cumulative_keepers', 'large_total', 'medium_total'],
    date: ['trip_date'], time: ['depart_time', 'return_time', 'tide1_time', 'tide2_time', 'tide3_time'],
    num: ['engine_hours_start', 'engine_hours_end', 'passengers', 'air_temp_f', 'water_temp_f', 'depth_min_ft', 'depth_max_ft', 'moon_pct', 'line_count', 'line_length_ft', 'trap_count', 'keepers_typed', 'male_typed', 'female_typed'],
    numFmt: { depth_min_ft: '0.0', depth_max_ft: '0.0' },   // one decimal, like the earlier entries
    probe: 'season'
  },
  Loops: {
    key: 'loop_id',
    formula: ['count_total'],
    date: [], time: ['start_time'],
    num: ['seq', 'count_male', 'count_female', 'medium_count', 'large_count'],
    numFmt: {},
    probe: 'count_total'
  }
};

function doGet() { return ContentService.createTextOutput('CrabMetrics Data Transfer script ' + SCRIPT_VERSION + ' is running.'); }

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    if (SECRET === 'PASTE-YOUR-KEY-HERE' || req.key !== SECRET) throw new Error('The key does not match. Check the key in the script and in CrabMetrics Settings.');
    if (req.action === 'ping') out = ping();
    else if (req.action === 'plan') out = plan(req.trips || []).summary;
    else if (req.action === 'read') out = readTrips(req.trip_ids || []);
    else if (req.action === 'commit') {
      const lock = LockService.getScriptLock(); lock.waitLock(30000);
      try { out = commit(req.trips || []); } finally { lock.releaseLock(); }
    } else throw new Error('Unknown action');
    out.ok = true;
  } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- reading the sheet ---------- */
function loadSheet(name) {
  const def = SHEETS[name], sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('The sheet has no tab named ' + name);
  const nc = sh.getLastColumn(), headers = sh.getRange(1, 1, 1, nc).getValues()[0].map(String), nr = Math.max(sh.getLastRow() - 1, 1);
  const col = {}; headers.forEach((h, i) => col[h] = i);
  if (col[def.key] === undefined) throw new Error('Tab ' + name + ' has no column ' + def.key);
  const rng = sh.getRange(2, 1, nr, nc), vals = rng.getValues(), disp = rng.getDisplayValues();
  const rows = vals.map((r, i) => {
    const o = {};
    headers.forEach((h, j) => { if (def.formula.includes(h)) return; o[h] = norm(def, h, (def.date.includes(h) || def.time.includes(h)) ? disp[i][j] : r[j]); });
    return o;
  });
  const byKey = {}; rows.forEach((o, i) => { if (o[def.key] !== '') byKey[o[def.key]] = i; });
  return { name, def, sh, headers, col, rows, byKey, nr };
}
function norm(def, h, v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v !== null) { if (v.d !== undefined) return String(v.d); if (v.t !== undefined) return pad5(String(v.t)); }
  if (typeof v === 'string') {
    v = v.trim(); if (v === '') return '';
    if (def.time.includes(h)) return pad5(v);
    if (def.date.includes(h)) { const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : v; }
    return v;
  }
  return v;
}
function pad5(t) { const m = t.match(/^(\d{1,2}):(\d{2})/); return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : t; }
function same(a, b) {
  if (a === '' && b === '') return true;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  if (typeof a === 'number' && b !== '' && !isNaN(Number(b))) return Math.abs(a - Number(b)) < 1e-9;
  if (typeof b === 'number' && a !== '' && !isNaN(Number(a))) return Math.abs(b - Number(a)) < 1e-9;
  return String(a) === String(b);
}
function diffCols(def, sheetRow, newRow) {
  const d = [];
  for (const h of Object.keys(sheetRow)) { if (h === def.key || !(h in newRow)) continue; const nv = norm(def, h, newRow[h]); if (!same(sheetRow[h], nv)) d.push(h); }
  return d;
}

/* ---------- plan: compare, change nothing ---------- */
function plan(trips) {
  const T = loadSheet('Trips'), L = loadSheet('Loops'), items = [];
  const loopsByTrip = {}; L.rows.forEach((o, i) => { if (o.loop_id !== '') (loopsByTrip[o.trip_id] = loopsByTrip[o.trip_id] || []).push(i); });
  const sum = { trips: { new: 0, changed: 0, same: 0 }, loops: { new: 0, changed: 0, removed: 0, same: 0 }, items: [] };
  for (const t of trips) {
    const it = { trip_id: t.trip_id, trip: 'new', tripRow: -1, changedCols: [], loops: { new: [], changed: [], removed: [], same: [] } };
    const ti = T.byKey[t.trip_id];
    if (ti === undefined) it.trip = 'new'; else { it.tripRow = ti; it.changedCols = diffCols(T.def, T.rows[ti], t.row); it.trip = it.changedCols.length ? 'changed' : 'same'; }
    const have = {}; (loopsByTrip[t.trip_id] || []).forEach(i => have[L.rows[i].loop_id] = i);
    const sent = {};
    for (const lp of (t.loops || [])) {
      sent[lp.loop_id] = true; const li = have[lp.loop_id];
      if (li === undefined) { const other = L.byKey[lp.loop_id]; if (other !== undefined) throw new Error('Loop ' + lp.loop_id + ' exists in the sheet under a different trip. Nothing was changed.'); it.loops.new.push(lp.loop_id); }
      else if (diffCols(L.def, L.rows[li], lp).length) it.loops.changed.push(lp.loop_id); else it.loops.same.push(lp.loop_id);
    }
    for (const id of Object.keys(have)) if (!sent[id]) it.loops.removed.push(id);
    items.push(it);
    sum.trips[it.trip]++; ['new', 'changed', 'removed', 'same'].forEach(k => sum.loops[k] += it.loops[k].length);
    sum.items.push({ trip_id: it.trip_id, trip: it.trip, changedCols: it.changedCols, loops: { new: it.loops.new.length, changed: it.loops.changed.length, removed: it.loops.removed.length, same: it.loops.same.length } });
  }
  return { summary: sum, items, T, L };
}

/* ---------- commit ---------- */
function commit(trips) {
  const P = plan(trips), T = P.T, L = P.L, byId = {}; trips.forEach(t => byId[t.trip_id] = t);
  const nextEmpty = (S, used) => { for (let i = 0; i < S.nr; i++) if (S.rows[i][S.def.key] === '' && !used[i]) { used[i] = true; return i; } throw new Error('No empty row left in the ' + S.name + ' tab. Extend its formulas further down first. Nothing was changed.'); };
  const usedT = {}, usedL = {};
  // dry run: find every target row first so a full sheet changes nothing
  const work = [];
  for (const it of P.items) {
    const t = byId[it.trip_id];
    if (it.trip === 'new') work.push({ S: T, i: nextEmpty(T, usedT), obj: t.row });
    else if (it.trip === 'changed') work.push({ S: T, i: it.tripRow, obj: t.row });
    for (const lp of (t.loops || [])) {
      if (it.loops.new.includes(lp.loop_id)) work.push({ S: L, i: nextEmpty(L, usedL), obj: lp });
      else if (it.loops.changed.includes(lp.loop_id)) work.push({ S: L, i: L.byKey[lp.loop_id], obj: lp });
    }
    for (const id of it.loops.removed) { const blank = {}; Object.keys(L.rows[L.byKey[id]]).forEach(k => blank[k] = null); work.push({ S: L, i: L.byKey[id], obj: blank }); }
  }
  for (const w of work) {   // every formula column in the target row must still hold its formula
    for (const h of w.S.def.formula) {
      if (w.S.col[h] === undefined) continue;
      if (!w.S.sh.getRange(w.i + 2, w.S.col[h] + 1).getFormula()) throw new Error(w.S.name + ' row ' + (w.i + 2) + ' is missing the formula in column ' + h + '. Copy the formulas down from a good row first. Nothing was changed.');
    }
  }
  for (const w of work) writeRow(w.S, w.i + 2, w.obj);
  SpreadsheetApp.flush();
  return { summary: P.summary };
}
function writeRow(S, rowNum, obj) {
  const def = S.def, runs = []; let cur = null;
  S.headers.forEach((h, j) => { if (def.formula.includes(h) || h === '' || !(h in obj)) { cur = null; return; } if (!cur) { cur = []; runs.push(cur); } cur.push({ h, j }); });
  for (const run of runs) {
    const rng = S.sh.getRange(rowNum, run[0].j + 1, 1, run.length);
    const cur = rng.getNumberFormats()[0];   // keep a number format already in the sheet; otherwise use ours
    rng.setNumberFormats([run.map((c, k) => def.date.includes(c.h) ? 'yyyy-mm-dd' : def.time.includes(c.h) ? 'hh:mm' : def.num.includes(c.h) ? ((cur[k] && cur[k] !== 'General') ? cur[k] : (def.numFmt[c.h] || 'General')) : '@')]);
    rng.setValues([run.map(c => toCell(def, c.h, obj[c.h]))]);
  }
}
function toCell(def, h, v) {
  const n = norm(def, h, v); if (n === '') return '';
  if (def.date.includes(h)) { const m = String(n).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000 : n; }
  if (def.time.includes(h)) { const m = String(n).match(/^(\d{2}):(\d{2})$/); return m ? (+m[1] * 60 + +m[2]) / 1440 : n; }
  return n;
}

/* ---------- read back for the app's own check ---------- */
function readTrips(ids) {
  const T = loadSheet('Trips'), L = loadSheet('Loops'), want = {}; ids.forEach(i => want[i] = true);
  const trips = {}, loops = {};
  for (const id of ids) if (T.byKey[id] !== undefined) trips[id] = T.rows[T.byKey[id]];
  L.rows.forEach(o => { if (o.loop_id !== '' && want[o.trip_id]) loops[o.loop_id] = o; });
  return { trips, loops };
}
function ping() { const ss = SpreadsheetApp.getActive(); return { sheet: ss.getName(), version: SCRIPT_VERSION }; }
