'use strict';
/* Export: ZIP of CSV files, Excel (.xlsx) master paste file, verification, master-sent flags. No external libraries. */

/* ---------- ZIP (stored, no compression) ---------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0; const d = new Date();
  const dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(h.buffer, name, data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    cen.push(c.buffer, name); off += 30 + name.length + data.length;
  }
  const cs = cen.reduce((a, b) => a + (b.byteLength || b.length), 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cen, e.buffer], { type: 'application/zip' });
}
/* ---------- CSV ---------- */
const csvCell = v => { if (v == null) return ''; if (typeof v === 'object') v = (v && v.d) ? v.d : (v && v.t) ? v.t : JSON.stringify(v); v = String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const toCSV = (cols, rows) => '﻿' + [cols.map(csvCell).join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\r\n') + '\r\n';
function parseCSVCount(text) { // number of data rows (verification), quote-aware
  text = text.replace(/^﻿/, ''); let rows = 0, q = false, any = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (c === '"') { if (q && text[i + 1] === '"') i++; else q = !q; any = true; } else if (!q && c === '\n') { rows++; any = false; } else if (c !== '\r') any = true; }
  if (any) rows++; return Math.max(0, rows - 1);
}
/* ---------- XLSX (minimal, typed cells) ---------- */
const xmlEsc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colL = n => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const serial = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
/* cell: null | number | string | {d:'YYYY-MM-DD'} | {t:'HH:MM'} */
function sheetXML(cols, rows) {
  const cellXML = (v, r, c) => { const ref = colL(c) + r; if (v == null || v === '') return '';
    if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
    if (v && v.d) { const m = v.d.match(/(\d+)-(\d+)-(\d+)/); return `<c r="${ref}" s="1"><v>${serial(+m[1], +m[2], +m[3])}</v></c>`; }
    if (v && v.t) { const m = v.t.match(/(\d+):(\d+)/); return `<c r="${ref}" s="2"><v>${((+m[1]) * 60 + (+m[2])) / 1440}</v></c>`; }
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`; };
  const head = `<row r="1">${cols.map((h, i) => `<c r="${colL(i)}1" t="inlineStr" s="3"><is><t>${xmlEsc(h)}</t></is></c>`).join('')}</row>`;
  const body = rows.map((row, i) => `<row r="${i + 2}">${row.map((v, c) => cellXML(v, i + 2, c)).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${head}${body}</sheetData></worksheet>`;
}
function makeXlsx(sheets) {
  const files = [];
  files.push({ name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` });
  files.push({ name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` });
  files.push({ name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` });
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
  files.push({ name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/><numFmt numFmtId="165" formatCode="hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>` });
  sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXML(s.cols, s.rows) }));
  const z = makeZip(files); return new Blob([z], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
/* ---------- totals that also understand imported history ---------- */
function loopTotal(l) { if (l.medium_count != null || l.large_count != null) return (l.medium_count || 0) + (l.large_count || 0); if (l.male_count != null || l.female_count != null) return (l.male_count || 0) + (l.female_count || 0); return null; }
function tripKeepers(t, loops) { const v = loops.map(loopTotal).filter(x => x != null); if (v.length) return v.reduce((a, b) => a + b, 0); const lt = t.legacy_typed_totals; return lt && lt.keepers_typed != null ? lt.keepers_typed : null; }
const hhmm = ts => ts ? tsTime(ts) : null;
const SKY_M = { CLEAR_SUN: 'Clr / Sun', OVERCAST: 'Overcast', RAIN: 'Rain' }, WIND_M = { CALM: 'Calm', MILD: 'Mild', MODERATE: 'Moderate', WINDY: 'Windy' }, WATER_M = { CALM: 'Calm', CHOPPY: 'Choppy', MIXED: 'Mixed', BAD_CHOP: 'Bad chop' };

/* ---------- gather one consistent snapshot ---------- */
async function gatherAll() {
  const g = { areas: await getAll('areas'), locations: await getAll('locations') }; const trips = (await getAll('trips')).filter(t => !t.deleted_at && !t.purged_at); g.trips = trips.sort((a, b) => a.trip_id < b.trip_id ? -1 : 1);
  for (const s of ['area_visits', 'deployments', 'loops', 'loop_unit_counts', 'readings', 'events', 'tide_events', 'fuel_purchases', 'edit_log']) g[s] = (await getAll(s)).filter(r => !r.deleted_at);
  g.slack = await slackMin(); return g;
}
const byTrip = (g, s, id) => g[s].filter(r => r.trip_id === id);
function tripChanged(g, t) { // changed since sent to master?
  if (!t.master_exported_at) return true; const ex = +tsToDate(t.master_exported_at);
  const kids = ['area_visits', 'deployments', 'loops', 'loop_unit_counts', 'readings', 'events', 'tide_events', 'fuel_purchases'].some(s => byTrip(g, s, t.trip_id).some(r => r.updated_at && +tsToDate(r.updated_at) > ex + 1000));
  return kids || (t.updated_at && +tsToDate(t.updated_at) > ex + 3000);
}
const MASTER_TRIP_COLS = ['trip_id', 'season', 'include_in_comparison', 'trip_date', 'month', 'day_of_season', 'depart_time', 'return_time', 'duration_hours', 'engine_hours_start', 'engine_hours_end', 'engine_hours_used', 'passengers', 'air_temp_f', 'water_temp_f', 'temp_note', 'weather_sky', 'wind_condition', 'water_condition', 'depth_min_ft', 'depth_max_ft', 'salinity_note', 'tide1_type', 'tide1_time', 'tide2_type', 'tide2_time', 'tide3_type', 'tide3_time', 'moon_pct', 'equipment_type', 'line_count', 'line_length_ft', 'trap_count', 'equipment_detail_source', 'bait_note', 'location_text', 'keepers_typed', 'male_typed', 'female_typed', 'loops_recorded', 'keepers_from_loops', 'loops_minus_typed', 'keepers_per_hour', 'season_cumulative_keepers', 'notes', 'data_flags', 'legacy_source'];
const MASTER_LOOP_COLS = ['loop_id', 'trip_id', 'seq', 'start_time', 'count_male', 'count_female', 'count_total', 'count_basis', 'medium_count', 'large_count', 'data_flags', 'legacy_source'];
const LT_TXT = { RUN: '', PICKUP_MOVE: 'pick-up (moving)', PICKUP_FINAL: 'pick-up (final)' };
function tripFacts(g, t) {
  const rd = byTrip(g, 'readings', t.trip_id), deps = byTrip(g, 'deployments', t.trip_id).sort((a, b) => a.seq - b.seq), loops = byTrip(g, 'loops', t.trip_id).sort((a, b) => a.seq - b.seq), tides = byTrip(g, 'tide_events', t.trip_id).sort((a, b) => a.tide_time < b.tide_time ? -1 : 1);
  const first = (v, ctx) => { const x = rd.filter(r => r.variable === v && r.value_num != null); return (x.find(r => r.context === ctx) || x[0] || {}).value_num ?? null; };
  const depth = rd.filter(r => r.variable === 'DEPTH_FT'), dmin = depth.map(r => r.value_min ?? r.value_num).filter(x => x != null), dmax = depth.map(r => r.value_max ?? r.value_num).filter(x => x != null);
  const sal = rd.filter(r => r.variable === 'SALINITY' && (r.value_num != null || r.value_text)).map(r => r.value_num != null ? `${r.value_num} ${r.unit || ''}`.trim() : r.value_text);
  const units = {}; deps.forEach(d => { if (!units[d.unit_label]) units[d.unit_label] = d; }); const ul = Object.values(units), areas = Object.fromEntries(g.areas.map(a => [a.area_id, a.name])), locs = Object.fromEntries(g.locations.map(l => [l.location_id, l]));
  const trot = ul.filter(d => d.equipment_type === 'TROTLINE'), traps = ul.filter(d => d.equipment_type === 'TRAP');
  const moon = rd.find(r => r.variable === 'MOON_ILLUM_PCT');
  const keep = tripKeepers(t, loops), durH = t.return_ts ? minutesBetween(t.depart_ts, t.return_ts) / 60 : null;
  return { rd, deps, loops, tides, air: first('AIR_TEMP_F', 'AT_DOCK_DEPART'), water: first('WATER_TEMP_F', 'AT_DOCK_DEPART'), dmin: dmin.length ? Math.min(...dmin) : null, dmax: dmax.length ? Math.max(...dmax) : null, sal,
    eq: ul.length ? (ul.some(d => d.equipment_type === 'POT') ? 'POT' : ul[0].equipment_type) : null, lineCount: trot.length || null, lineLen: trot.length ? trot[0].line_length_ft : null, trapCount: traps.some(d => d.trap_count != null) ? traps.reduce((a, d) => a + (d.trap_count || 0), 0) : null,
    bait: [...new Set(ul.map(d => d.bait_type).filter(Boolean).map(baitLabel))].join('; '), where: ul.map(d => { const l = locs[d.location_id]; return l ? `${areas[l.area_id] || '?'} – ${l.name} (${d.unit_label})` : null; }).filter(Boolean).join('; '),
    moon: moon ? moon.value_num : (t.moon_illumination_pct ?? null), keep, durH };
}
function masterTripRow(g, t) {
  const f = tripFacts(g, t), T = f.tides.slice(0, 3), ty = x => x && x.tide_type ? (x.tide_type === 'HIGH' ? 'H' : 'L') : null, ti = x => x && x.tide_time ? { t: hhmm(x.tide_time) } : null;
  const lr = t.legacy_raw || {}, lt = t.legacy_typed_totals, hist = !!t.legacy_source;
  const sky = lr.weather_text_as_typed ? lr.weather_text_as_typed : SKY_M[t.weather_sky], wind = lr.weather_text_as_typed ? (lr.wind_condition_as_typed || null) : WIND_M[t.wind_condition];
  const v = { trip_id: t.trip_id, include_in_comparison: hist ? (lr.include_in_comparison || 'Y') : (f.eq === 'POT' ? 'N' : 'Y'), trip_date: { d: t.trip_date }, depart_time: { t: hhmm(t.depart_ts) }, return_time: t.return_ts ? { t: hhmm(t.return_ts) } : null, engine_hours_start: t.engine_hours_start, engine_hours_end: t.engine_hours_end, passengers: t.passengers,
    air_temp_f: f.air, water_temp_f: f.water, temp_note: lr.temp_note || null, weather_sky: sky || null, wind_condition: wind || null, water_condition: WATER_M[t.water_condition] || null, depth_min_ft: f.dmin, depth_max_ft: f.dmax, salinity_note: f.sal.join('; ') || null,
    tide1_type: ty(T[0]), tide1_time: ti(T[0]), tide2_type: ty(T[1]), tide2_time: ti(T[1]), tide3_type: ty(T[2]), tide3_time: ti(T[2]), moon_pct: f.moon, equipment_type: f.eq, line_count: f.lineCount, line_length_ft: f.lineLen, trap_count: f.trapCount, equipment_detail_source: hist ? (lr.equipment_detail_source || null) : (f.deps.length ? 'app' : null),
    bait_note: f.bait || lr.bait_note || null, location_text: f.where || lr.location_text || null, keepers_typed: lt ? lt.keepers_typed : f.keep, male_typed: lt ? lt.male_typed : null, female_typed: lt ? lt.female_typed : null, notes: t.trip_notes, data_flags: hist ? (lr.data_flags || null) : 'from CrabMetrics app', legacy_source: hist ? t.legacy_source : 'CrabMetrics ' + self.APP_VERSION };
  return MASTER_TRIP_COLS.map(c => v[c] ?? null);
}
function masterLoopRows(g, t) {
  return byTrip(g, 'loops', t.trip_id).sort((a, b) => a.seq - b.seq).map(l => {
    const legacy = l.male_count != null || l.female_count != null;
    const v = { loop_id: l.loop_id, trip_id: l.trip_id, seq: l.seq, start_time: { t: hhmm(l.start_ts) }, count_male: l.male_count, count_female: l.female_count, count_basis: (l.legacy_raw && l.legacy_raw.count_basis) || (l.count_status === 'NOT_COUNTED' ? 'not counted' : legacy ? 'male and female written' : 'medium and large counted'), medium_count: l.medium_count, large_count: l.large_count, data_flags: (l.legacy_raw && l.legacy_raw.data_flags) || [LT_TXT[l.loop_type]].filter(Boolean).join('; ') || null, legacy_source: l.legacy_source || 'CrabMetrics ' + self.APP_VERSION };
    return MASTER_LOOP_COLS.map(c => v[c] ?? null);
  });
}
/* ---------- all tables as CSV ---------- */
const RAW_STORES = ['trips', 'area_visits', 'deployments', 'loops', 'loop_unit_counts', 'readings', 'events', 'tide_events', 'fuel_purchases', 'edit_log'];
function rawTable(rows, keyField) {
  const cols = []; for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  cols.sort((a, b) => (a === keyField ? -1 : b === keyField ? 1 : 0)); return { cols, rows: rows.map(r => cols.map(c => r[c] ?? null)) };
}
function analysisTables(g) {
  const areas = Object.fromEntries(g.areas.map(a => [a.area_id, a.name])), locs = Object.fromEntries(g.locations.map(l => [l.location_id, l.name]));
  const tc = ['trip_id', 'trip_date', 'season', 'status', 'depart_ts', 'return_ts', 'calc_duration_hours', 'engine_hours_start', 'engine_hours_end', 'calc_engine_hours_used', 'passengers', 'weather_sky', 'wind_condition', 'water_condition', 'air_temp_f', 'water_temp_f', 'moon_illumination_pct', 'area_names', 'equipment_type', 'calc_loop_count', 'calc_medium_total', 'calc_large_total', 'calc_keepers_total', 'calc_keepers_basis', 'calc_keepers_per_trip_hour', 'calc_crabbing_hours', 'calc_keepers_per_crabbing_hour', 'fuel_gallons', 'fuel_total_cost', 'trip_notes'];
  const tr = [], lc = ['trip_id', 'trip_date', 'loop_id', 'seq', 'loop_type', 'start_ts', 'end_ts', 'calc_loop_minutes', 'calc_minutes_since_depart', 'count_status', 'medium_count', 'large_count', 'male_count', 'female_count', 'calc_total', 'calc_tide_phase', 'area_name', 'weather_sky', 'wind_condition', 'water_condition', 'wind_speed_mph', 'air_temp_f', 'water_temp_f', 'moon_illumination_pct', 'equipment_type', 'bait', 'notes'], lr = [];
  for (const t of g.trips) {
    const f = tripFacts(g, t), vis = byTrip(g, 'area_visits', t.trip_id), fuel = byTrip(g, 'fuel_purchases', t.trip_id), ls = f.loops, md = ls.some(l => l.medium_count != null) ? ls.reduce((a, l) => a + (l.medium_count || 0), 0) : null, lg = ls.some(l => l.large_count != null) ? ls.reduce((a, l) => a + (l.large_count || 0), 0) : null;
    const cm = vis.reduce((a, x) => a + (x.leave_ts ? minutesBetween(x.arrive_ts, x.leave_ts) : 0), 0), basis = ls.some(l => loopTotal(l) != null) ? 'loops' : (t.legacy_typed_totals ? 'typed total' : null);
    const wind = f.rd.find(r => r.variable === 'WIND_SPEED' && r.value_num != null);
    tr.push([t.trip_id, t.trip_date, t.trip_date.slice(0, 4), t.status, t.depart_ts, t.return_ts, f.durH == null ? null : Math.round(f.durH * 100) / 100, t.engine_hours_start, t.engine_hours_end, (t.engine_hours_start != null && t.engine_hours_end != null) ? t.engine_hours_end - t.engine_hours_start : null, t.passengers, t.weather_sky, t.wind_condition, t.water_condition, f.air, f.water, f.moon,
      [...new Set(vis.map(v => areas[v.area_id]).filter(Boolean))].join('; ') || null, f.eq, ls.length, md, lg, f.keep, basis, (f.keep != null && f.durH) ? Math.round(f.keep / f.durH * 100) / 100 : null, cm ? Math.round(cm / 6) / 10 : null, (f.keep != null && cm >= 5) ? Math.round(f.keep / (cm / 60) * 100) / 100 : null, fuel.reduce((a, x) => a + (x.gallons || 0), 0) || null, fuel.reduce((a, x) => a + (x.total_cost || 0), 0) || null, t.trip_notes]);
    const td = f.tides.map(x => ({ type: x.tide_type, date: tsToDate(x.tide_time) }));
    for (const l of ls) { const v = vis.find(x => x.area_visit_id === l.area_visit_id), dep = f.deps.find(d => d.area_visit_id === l.area_visit_id);
      lr.push([t.trip_id, t.trip_date, l.loop_id, l.seq, l.loop_type, l.start_ts, l.end_ts, l.end_ts ? minutesBetween(l.start_ts, l.end_ts) : null, minutesBetween(t.depart_ts, l.start_ts), l.count_status, l.medium_count, l.large_count, l.male_count, l.female_count, loopTotal(l), td.length ? tidePhase(tsToDate(l.start_ts), td, g.slack) : 'UNKNOWN', v ? areas[v.area_id] : null, t.weather_sky, t.wind_condition, t.water_condition, wind ? wind.value_num : null, f.air, f.water, f.moon, dep ? dep.equipment_type : f.eq, dep && dep.bait_type, l.loop_notes]); }
  }
  return { trips_analysis: { cols: tc, rows: tr }, loops_analysis: { cols: lc, rows: lr } };
}
const README_TXT = `CrabMetrics export
==================
Files in this ZIP (see manifest.csv for the row counts):
- master_trips.csv / master_loops.csv : same columns and order as the Trips and Loops sheets of the master workbook. Formula columns are left empty. Paste the rows under the last row of the master, then fill the formulas down.
- trips_analysis.csv / loops_analysis.csv : one flat row per trip / per loop with calculated fields (names start with calc_) for analysis.
- One CSV per stored table (trips, area_visits, deployments, loops, loop_unit_counts, readings, events, tide_events, fuel_purchases, edit_log) with every stored field. Tables link by trip_id and the IDs inside each file.
- areas.csv and locations.csv : your area and spot lists (all areas and spots are included in every export).
Formats: dates YYYY-MM-DD; time of day HH:MM (24-hour); timestamps YYYY-MM-DD HH:MM:SS +hh:mm America/New_York; temperatures F; wind mph; depth and lengths ft.
Blank means not recorded. A 0 is a real zero. "Not measured", "Not applicable" and "Unknown" are kept in the status fields of readings.
Deleted records and trips in the Trash are not included. Files open in Excel (UTF-8).`;

/* ---------- build an export ---------- */
async function buildExport(scope) {
  const g = await gatherAll(); let trips = g.trips;
  if (scope.mode === 'new') trips = trips.filter(t => t.status === 'COMPLETED' && tripChanged(g, t));
  else if (scope.mode === 'one') trips = trips.filter(t => t.trip_id === scope.trip);
  else if (scope.mode === 'range') trips = trips.filter(t => (!scope.from || t.trip_date >= scope.from) && (!scope.to || t.trip_date <= scope.to));
  const ids = new Set(trips.map(t => t.trip_id)), sub = { areas: g.areas, locations: g.locations, trips, slack: g.slack };
  for (const s of RAW_STORES.slice(1)) sub[s] = g[s].filter(r => ids.has(r.trip_id));
  return { g: sub, trips };
}
function stamp() { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`; }
async function exportZip(scope) {
  const { g, trips } = await buildExport(scope), files = [], man = [], expect = {};
  const add = (name, cols, rows, desc) => { files.push({ name, data: toCSV(cols, rows) }); man.push([name, rows.length, desc]); expect[name] = rows.length; };
  const mt = trips.map(t => masterTripRow(g, t)), ml = trips.flatMap(t => masterLoopRows(g, t));
  add('master_trips.csv', MASTER_TRIP_COLS, mt, 'Master workbook Trips columns (formula columns empty)'); add('master_loops.csv', MASTER_LOOP_COLS, ml, 'Master workbook Loops columns (formula column empty)');
  const A = analysisTables(g); add('trips_analysis.csv', A.trips_analysis.cols, A.trips_analysis.rows, 'One row per trip with calc_ fields'); add('loops_analysis.csv', A.loops_analysis.cols, A.loops_analysis.rows, 'One row per loop with calc_ fields and tide phase');
  for (const s of RAW_STORES) { const T = rawTable(g[s], STORES[s]); add(s + '.csv', T.cols.length ? T.cols : [STORES[s]], T.rows, 'Stored table: ' + s); }
  for (const s of ['areas', 'locations']) { const T = rawTable(g[s], STORES[s]); add(s + '.csv', T.cols.length ? T.cols : [STORES[s]], T.rows, 'Stored list: ' + s); }
  const manifest = toCSV(['file', 'rows', 'description'], man.concat([['(app version)', self.APP_VERSION, ''], ['(exported at)', now(), ''], ['(scope)', scopeText(scope), ''], ['(trips)', trips.map(t => t.trip_id).join(' '), '']]));
  files.unshift({ name: 'README.txt', data: README_TXT }, { name: 'manifest.csv', data: manifest });
  const blob = makeZip(files), name = `crabmetrics-export-${stamp()}.zip`;
  // verify by reading the CSV text back
  let ok = true, bad = []; for (const f of files) if (expect[f.name] != null) { const n = parseCSVCount(f.data); if (n !== expect[f.name]) { ok = false; bad.push(`${f.name}: ${n} read back, ${expect[f.name]} expected`); } }
  return { blob, name, trips, counts: { trips: trips.length, loops: ml.length, files: files.length }, ok, bad };
}
async function exportXlsx(scope) {
  const { g, trips } = await buildExport(scope), mt = trips.map(t => masterTripRow(g, t)), ml = trips.flatMap(t => masterLoopRows(g, t));
  const note = [['HOW TO PASTE INTO THE MASTER WORKBOOK'], ['1. Open the master workbook and this file side by side.'],
    ['2. On this file\'s Trips tab, select the data rows (not the header row), copy them, and paste into the first empty row of the master Trips tab, column A.'],
    ['3. Do the same for the Loops tab into the master Loops tab.'],
    ['4. The formula columns are empty here on purpose. In the master Trips tab select the formula cells of the last OLD row down through the new rows (columns B, E, F, I, L and AN to AR; hold Cmd/Ctrl to select several blocks) and press Cmd+D (Mac) or Ctrl+D (Windows). Do the same for column G in the Loops tab.'],
    ['5. For trips from this app, Loops column G (count_total) should add medium_count and large_count: =IF(AND(E2="",F2="",I2="",J2=""),"",N(E2)+N(F2)+N(I2)+N(J2)). Change it once in the master and fill it down the whole column.'],
    ['6. Back in CrabMetrics, tap "Mark these trips as sent to master".'], ['Exported ' + now() + ' by CrabMetrics ' + self.APP_VERSION + ' · ' + trips.length + ' trips, ' + ml.length + ' loops.']];
  const blob = makeXlsx([{ name: 'Trips', cols: MASTER_TRIP_COLS, rows: mt }, { name: 'Loops', cols: MASTER_LOOP_COLS, rows: ml }, { name: 'How to paste', cols: ['Instructions'], rows: note }]);
  return { blob, name: `crabmetrics-master-paste-${stamp()}.xlsx`, trips, counts: { trips: mt.length, loops: ml.length }, ok: true, bad: [] };
}
const scopeText = s => ({ all: 'All trips', new: 'Not yet sent to master (or changed since)', one: 'One trip: ' + s.trip, range: 'Dates ' + (s.from || 'start') + ' to ' + (s.to || 'end') })[s.mode];
function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }

/* ---------- export screen ---------- */
SCREENS.export = async () => {
  const X = S.exp || (S.exp = { mode: 'new', trip: null, from: '', to: '' });
  const g = await gatherAll(), all = g.trips, done = all.filter(t => t.status === 'COMPLETED');
  if (!X.trip && all.length) X.trip = all[all.length - 1].trip_id;
  const nNew = done.filter(t => tripChanged(g, t)).length, { trips } = await buildExport(X);
  const mode = (m, l) => `<button class="${X.mode === m ? 'sel' : ''}" data-a="expMode" data-v="${m}">${l}</button>`;
  return `<h1>Export</h1>${ACTION_BAR('<button data-a="go" data-s="data">Back</button> <button data-a="go" data-s="home">Home</button>')}
 <div class="row">${mode('new', 'Not yet sent to master (' + nNew + ')')}${mode('all', 'All trips (' + all.length + ')')}${mode('one', 'One trip')}${mode('range', 'Date range')}</div>
 ${X.mode === 'one' ? `<select id="xtrip" style="font:inherit;padding:10px;margin:6px">${all.slice().reverse().map(t => `<option ${t.trip_id === X.trip ? 'selected' : ''}>${t.trip_id}</option>`).join('')}</select>` : ''}
 ${X.mode === 'range' ? `<div class="row"><input type="text" id="xfrom" placeholder="From YYYY-MM-DD" value="${esc(X.from)}" style="max-width:240px;margin:4px"><input type="text" id="xto" placeholder="To YYYY-MM-DD" value="${esc(X.to)}" style="max-width:240px;margin:4px"></div>` : ''}
 <div class="card"><b>${trips.length} trips selected</b> <span class="mut">${trips.map(t => t.trip_id).slice(0, 12).join(' ')}${trips.length > 12 ? ' …' : ''}</span><br><span class="mut">Open trips are included when you pick All, One trip or a date range.</span></div>
 <div class="row"><button class="p big" data-a="expZip" ${trips.length ? '' : 'disabled'}>Export CSV files (ZIP)</button><button class="big" data-a="expXlsx" ${trips.length ? '' : 'disabled'}>Excel master paste file</button></div>
 <div id="xres"></div><!--ACT--><!--/ACT-->`;
};
async function expShow(r, kind) {
  const el = document.getElementById('xres'); if (!el) return;
  el.innerHTML = `<div class="${r.ok ? 'card' : 'warn'}"><b>${esc(r.name)}</b> saved to Downloads (${Math.round(r.blob.size / 1024)} KB).<br>${r.counts.trips} trips, ${r.counts.loops} loops${r.counts.files ? ', ' + r.counts.files + ' files' : ''}.<br>${r.ok ? '<b>Verified:</b> the rows read back from the files match the stored data.' : '<b>CHECK FAILED:</b> ' + esc(r.bad.join('; '))}
  ${kind === 'xlsx' ? `<div class="mut">After you paste these into the master, mark them as sent so they are left out next time.</div><button class="p" data-a="markSent">Mark these ${r.trips.length} trips as sent to master</button>` : ''}</div>`;
  S.lastTrips = r.trips.map(t => t.trip_id);
}
Object.assign(ACT, {
  expMode(e) { S.exp.mode = e.dataset.v; render(); },
  async expZip() { readExpInputs(); const r = await exportZip(S.exp); downloadBlob(r.blob, r.name); expShow(r, 'zip'); },
  async expXlsx() { readExpInputs(); const r = await exportXlsx(S.exp); downloadBlob(r.blob, r.name); expShow(r, 'xlsx'); },
  async markSent() {
    const ids = S.lastTrips || []; if (!ids.length || !confirm(`Mark ${ids.length} trips as sent to the master?`)) return;
    for (const id of ids) await put('trips', { trip_id: id, master_exported_at: now() }, { noCount: true }); render();
  }
});
function readExpInputs() { const X = S.exp, a = id => document.getElementById(id); if (a('xtrip')) X.trip = a('xtrip').value; if (a('xfrom')) { X.from = a('xfrom').value.trim(); X.to = a('xto').value.trim(); } }
