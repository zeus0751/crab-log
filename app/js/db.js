'use strict';
/* CrabMetrics data layer: IndexedDB, IDs, standard columns, backup and restore.
   No screen code in this file. Field names follow 02_Data_Dictionary. */
const TZ = 'America/New_York';
const DB_NAME = 'crabmetrics';
/* store name -> key field */
const STORES = {
  meta: 'key', trips: 'trip_id', area_visits: 'area_visit_id', deployments: 'deployment_id', loops: 'loop_id',
  loop_unit_counts: 'id', readings: 'reading_id', fuel_purchases: 'fuel_id', tide_events: 'tide_id', events: 'event_id',
  areas: 'area_id', locations: 'location_id', lookup_values: 'id', edit_log: 'id'
};
const DATA_STORES = Object.keys(STORES).filter(s => s !== 'meta');
let db = null;

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 2);
    r.onupgradeneeded = () => { for (const [s, k] of Object.entries(STORES)) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: k }); };
    r.onsuccess = () => { db = r.result; res(db); };
    r.onerror = () => rej(r.error);
  });
}
function tx(store, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode); let out;
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    out = fn(t);
  });
}
const getAll = s => new Promise((res, rej) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
const getOne = (s, id) => new Promise((res, rej) => { const q = db.transaction(s).objectStore(s).get(id); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
const live = rows => rows.filter(r => !r.deleted_at);
const p2 = n => String(n).padStart(2, '0');

/* ---- timestamps: 'YYYY-MM-DD HH:MM:SS -04:00 America/New_York' ---- */
function mkTs(d) {
  const o = -d.getTimezoneOffset(), a = Math.abs(o);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())} ${o < 0 ? '-' : '+'}${p2(Math.floor(a / 60))}:${p2(a % 60)} ${TZ}`;
}
const now = () => mkTs(new Date());
/* parse our ts back to a Date (uses the offset in the string) */
function tsToDate(ts) { if (!ts) return null; const m = ts.match(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) ([+-]\d\d:\d\d)/); return m ? new Date(`${m[1]}T${m[2]}${m[3]}`) : null; }
const tsDate = ts => ts ? ts.slice(0, 10) : '';
const tsTime = ts => ts ? ts.slice(11, 16) : '';
const minutesBetween = (a, b) => { const x = tsToDate(a), y = tsToDate(b); return x && y ? Math.round((y - x) / 60000) : null; };

/* ---- put with standard columns; edits are counted, never silent ---- */
async function put(store, rec, opts = {}) {
  const kp = STORES[store], old = rec[kp] != null ? await getOne(store, rec[kp]) : null, t = now();
  const full = Object.assign({}, old || { created_at: t, edit_count: 0, deleted_at: null, legacy_source: null, legacy_raw: null }, rec);
  full.updated_at = t; full.schema_version = self.SCHEMA_VERSION;
  if (old && !opts.noCount) full.edit_count = (old.edit_count || 0) + 1;
  await tx(store, 'readwrite', x => x.objectStore(store).put(full));
  if (!opts.quiet && typeof onSaved === 'function') onSaved();
  return full;
}
const hardDelete = (store, id) => tx(store, 'readwrite', x => x.objectStore(store).delete(id));
const softDeleteAt = (store, id, ts) => put(store, { [STORES[store]]: id, deleted_at: ts }, { quiet: true });
const softDelete = (store, id) => put(store, { [STORES[store]]: id, deleted_at: now() });

/* ---- meta / settings ---- */
async function metaGet(key, dflt = null) { const r = await getOne('meta', key); return r ? r.value : dflt; }
async function metaSet(key, value) { await tx('meta', 'readwrite', x => x.objectStore('meta').put({ key, value, updated_at: now() })); }

/* ---- IDs (never reused; counters live on the trip) ---- */
async function nextTripId() {
  const all = await getAll('trips'), d = (() => { const n = new Date(); return `${n.getFullYear()}${p2(n.getMonth() + 1)}${p2(n.getDate())}`; })();
  const mx = Math.max(0, ...all.filter(t => t.trip_id.startsWith(d + '-')).map(t => +t.trip_id.slice(9)));
  return `${d}-${p2(mx + 1)}`;
}
async function nextChild(tripId, kind, width) {
  const t = await getOne('trips', tripId), c = Object.assign({}, t.next_counters || {});
  c[kind] = (c[kind] || 0) + 1;
  await put('trips', { trip_id: tripId, next_counters: c }, { noCount: true, quiet: true });
  return `${tripId}-${kind}${String(c[kind]).padStart(width, '0')}`;
}
async function nextFuelId(dateStr) {
  const d = dateStr.replace(/-/g, ''), all = await getAll('fuel_purchases');
  return `FUEL-${d}-${p2(all.filter(f => f.fuel_id.startsWith('FUEL-' + d + '-')).length + 1)}`;
}

/* ---- backup and restore ---- */
async function makeBackup() {
  const data = {}; for (const s of Object.keys(STORES)) data[s] = await getAll(s);
  const d = new Date(), name = `crabmetrics-backup-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`;
  const counts = Object.fromEntries(Object.keys(data).map(s => [s, data[s].length]));
  return { name, counts, blob: new Blob([JSON.stringify({ app: 'crabmetrics', version: self.APP_VERSION, schema: self.SCHEMA_VERSION, created: now(), counts, data }, null, 1)], { type: 'application/json' }) };
}
/* Accepts a CrabMetrics backup, or the prototype's spot-list file (areas and spots only, field names converted). */
function normalizeBackup(j) {
  if (j && j.app === 'crabmetrics' && j.data) return { data: j.data, note: null };
  if (j && j.app === 'crab-log-prototype' && j.data) {
    const conv = (rows, from, to) => (rows || []).map(r => { const o = Object.assign({}, r); o[to] = o[from]; delete o[from]; if ('retired' in o) { o.active = !o.retired; delete o.retired; } return o; });
    return { data: { areas: conv(j.data.areas, 'id', 'area_id'), locations: conv(j.data.locations, 'id', 'location_id') }, note: 'Prototype file: only areas and spots are brought in; prototype trips are not carried over.' };
  }
  return null;
}
async function planRestore(j) {
  const n = normalizeBackup(j); if (!n) return null;
  const plan = { add: {}, dup: {}, diff: {}, note: n.note, total: 0 };
  for (const s of Object.keys(STORES)) {
    const rows = n.data[s] || [], kp = STORES[s], have = new Map((await getAll(s)).map(r => [r[kp], r]));
    plan.add[s] = []; plan.dup[s] = 0; plan.diff[s] = 0;
    for (const r of rows) {
      plan.total++;
      if (s === 'meta' && r.key !== 'count_per_line_default' && r.key !== 'default_trap_spacing_ft') { plan.total--; continue; }
      const h = have.get(r[kp]);
      if (!h) plan.add[s].push(r); else { plan.dup[s]++; const a = Object.assign({}, h), b = Object.assign({}, r); for (const k of ['updated_at', 'edit_count']) { delete a[k]; delete b[k]; } if (JSON.stringify(a) !== JSON.stringify(b)) plan.diff[s]++; }
    }
  }
  plan.nAdd = Object.values(plan.add).reduce((a, b) => a + b.length, 0);
  plan.nDup = Object.values(plan.dup).reduce((a, b) => a + b, 0);
  plan.nDiff = Object.values(plan.diff).reduce((a, b) => a + b, 0);
  return plan;
}
async function applyRestore(plan) { for (const s of Object.keys(plan.add)) for (const r of plan.add[s]) await tx(s, 'readwrite', x => x.objectStore(s).put(r)); }
async function eraseAllData() { for (const s of DATA_STORES) await tx(s, 'readwrite', x => x.objectStore(s).clear()); }
