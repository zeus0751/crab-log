'use strict';
/* Trip summary report: calculation (tripReport) + screen (SCREENS.report). Calculated values only; nothing here is stored. */

const MIN = 60000;

/* Active crabbing intervals [ms,ms]: area visits (arrive -> leave, or now/return if still open) minus events that affect active time. */
function activeIntervals(trip, visits, events, endFallback) {
  let iv = [];
  for (const v of visits) {
    const a = tsToDate(v.arrive_ts), b = v.leave_ts ? tsToDate(v.leave_ts) : endFallback;
    if (a && b && b > a) iv.push([+a, +b]);
  }
  let evMin = 0;
  for (const e of events) {
    if (e.affects_active_time === false) continue;
    const a = tsToDate(e.start_ts), b = e.end_ts ? tsToDate(e.end_ts) : null;
    if (!a || !b || b <= a) continue;
    const out = [];
    for (const [s, f] of iv) {
      const lo = Math.max(s, +a), hi = Math.min(f, +b);
      if (hi > lo) { evMin += (hi - lo) / MIN; if (lo > s) out.push([s, lo]); if (hi < f) out.push([hi, f]); } else out.push([s, f]);
    }
    iv = out;
  }
  return { iv, evMin: Math.round(evMin) };
}
const overlapMin = (iv, lo, hi) => iv.reduce((a, [s, f]) => a + Math.max(0, Math.min(f, hi) - Math.max(s, lo)), 0) / MIN;

/* Pure calculation. tides: [{type:'HIGH'|'LOW', date:Date}] ; slack in minutes. */
function tripReport(trip, loops, visits, events, tides, slack, nowDate) {
  const end = trip.return_ts ? tsToDate(trip.return_ts) : nowDate, dep = tsToDate(trip.depart_ts);
  const counted = loops.filter(l => l.count_status !== 'NOT_COUNTED' && (l.medium_count != null || l.large_count != null));
  const cnt = l => (l.medium_count || 0) + (l.large_count || 0);
  const sum = k => loops.some(l => l[k] != null) ? loops.reduce((a, l) => a + (l[k] || 0), 0) : null;
  const total = counted.length ? counted.reduce((a, l) => a + cnt(l), 0) : null;
  const { iv, evMin } = activeIntervals(trip, visits, events, end);
  const crabMin = Math.round(iv.reduce((a, [s, f]) => a + (f - s), 0) / MIN);
  const R = { total, large: sum('large_count'), medium: sum('medium_count'), loops: loops.length, counted: counted.length,
    avgLoop: counted.length ? total / counted.length : null, crabMin, evMin, perHour: crabMin > 0 && total != null ? total / (crabMin / 60) : null, groups: [], note: '' };
  const T = tides.filter(x => x.date).sort((a, b) => a.date - b.date), sl = slack * MIN;
  const group = (label, test, lo, hi) => {
    const ls = counted.filter(l => test(+tsToDate(l.start_ts))), c = ls.reduce((a, l) => a + cnt(l), 0), m = overlapMin(iv, lo, hi);
    return { label, loops: ls.length, crabs: ls.length ? c : 0, avg: ls.length ? c / ls.length : null, min: Math.round(m), perHour: m > 0 && ls.length ? c / (m / 60) : null };
  };
  const INF = 8.64e15;
  if (!T.length) { R.groups.push(group('Unknown (no tide times entered)', () => true, -INF, INF)); return R; }
  const inSpan = T.filter(x => x.date >= dep && x.date <= end);
  if (inSpan.length) {
    const C = inSpan[0], c = +C.date, rising = C.type === 'LOW', // LOW tide then rising; HIGH tide then falling
      bl = C.type === 'HIGH' ? 'Incoming' : 'Outgoing', al = C.type === 'HIGH' ? 'Outgoing' : 'Incoming';
    R.groups.push(group(`Before change (${bl})`, t => t < c - sl, -INF, c - sl), group('Slack', t => t >= c - sl && t <= c + sl, c - sl, c + sl), group(`After change (${al})`, t => t > c + sl, c + sl, INF));
    R.change = `${C.type === 'HIGH' ? 'High' : 'Low'} tide at ${String(C.date.getHours()).padStart(2, '0')}:${String(C.date.getMinutes()).padStart(2, '0')}, slack window ±${slack} min`;
    if (inSpan.length > 1) R.note = `This trip has ${inSpan.length} tide changes; the report splits at the first one only.`;
    return R;
  }
  /* no tide change during the trip: whole trip is one tide (or slack if near a tide just outside the trip) */
  const mid = +dep + (+end - +dep) / 2, prev = [...T].reverse().find(x => +x.date <= mid), next = T.find(x => +x.date > mid);
  const near = T.some(x => Math.abs(+x.date - +dep) <= sl || Math.abs(+x.date - +end) <= sl);
  let lab = prev ? (prev.type === 'HIGH' ? 'Outgoing' : 'Incoming') : next ? (next.type === 'HIGH' ? 'Incoming' : 'Outgoing') : 'Unknown';
  R.groups.push(group(`${lab} (no tide change during the trip)`, () => true, -INF, INF));
  if (near) R.note = 'A tide change falls within the slack window just outside the trip times.';
  return R;
}

const f1 = x => x == null ? '—' : (Math.round(x * 10) / 10).toFixed(1);
const hm = m => m == null ? '—' : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;

async function buildReport(tripId) {
  const t = await getOne('trips', tripId); if (!t || t.deleted_at) return null;
  const by = a => live(a).filter(x => x.trip_id === tripId);
  const loops = by(await getAll('loops')).sort((a, b) => a.seq - b.seq), visits = by(await getAll('area_visits')).sort((a, b) => a.seq - b.seq), events = by(await getAll('events')),
    tides = by(await getAll('tide_events')).map(x => ({ type: x.tide_type, date: tsToDate(x.tide_time) })), slack = +(await metaGet('slack_window_min', 30)),
    areas = Object.fromEntries((await getAll('areas')).map(a => [a.area_id, a.name]));
  return { t, visits, areas, R: tripReport(t, loops, visits, events, tides, slack, new Date()), slack };
}

SCREENS.report = async () => {
  const B = await buildReport(S.tripId); if (!B) { S.screen = 'history'; return SCREENS.history(); }
  const { t, R, visits, areas } = B;
  const wx = [labelOf('weather_sky', t.weather_sky), labelOf('wind_condition', t.wind_condition), labelOf('water_condition', t.water_condition)].filter(Boolean).join(' · ');
  const names = [...new Set(visits.map(v => areas[v.area_id]).filter(Boolean))].join(', ');
  let h = `<h1>Trip summary</h1>` + ACTION_BAR(`<button class="p big" data-a="printReport">Save as PDF / Print</button> <button class="big" data-a="reportBack">Back</button> <button data-a="go" data-s="home">Home</button>`);
  h += `<div class="card"><b>${esc(t.trip_id)}</b> · ${esc(tsDate(t.depart_ts))}${names ? ' · ' + esc(names) : ''}<br><span class="mut">${esc(wx) || 'Conditions not entered'}</span></div>`;
  h += `<div class="card"><b>Total crabs <span class="crab big">${R.total ?? '—'}</span></b> · Large <span class="crab">${R.large ?? '—'}</span> · Medium <span class="crab">${R.medium ?? '—'}</span><br>
    Loops ${R.loops}${R.counted !== R.loops ? ` (${R.counted} counted)` : ''} · Average crabs per loop <b>${f1(R.avgLoop)}</b><br>
    Crabbing time <b>${hm(R.crabMin)}</b> (events deducted: ${R.evMin} min) · Crabs per hour <b>${f1(R.perHour)}</b></div>`;
  h += `<h2>By tide</h2><table><tr><th>Tide</th><th>Loops</th><th>Crabs</th><th>Avg per loop</th><th>Time</th><th>Crabs/hr</th></tr>` +
    R.groups.map(g => `<tr><td>${esc(g.label)}</td><td>${g.loops}</td><td><span class="crab">${g.crabs}</span></td><td>${f1(g.avg)}</td><td>${hm(g.min)}</td><td>${f1(g.perHour)}</td></tr>`).join('') + `</table>`;
  if (R.change) h += `<p class="mut">${esc(R.change)}.</p>`;
  if (R.note) h += `<p class="warn">${esc(R.note)}</p>`;
  h += `<p class="mut">All figures on this page are calculated from the trip's saved records. Crabbing time = time at crabbing areas minus events. Loops are placed by their start time. "—" means not enough information.</p>`;
  return h;
};
Object.assign(ACT, {
  report(e) { go('report', { tripId: S.tripId, reportBack: e.dataset.back || 'trip' }); },
  reportBack() { go(S.reportBack || 'trip', { tripId: S.tripId }); },
  printReport() { window.print(); },
});
