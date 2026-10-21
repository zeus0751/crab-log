'use strict';
/* Pure calculation helpers and fixed lists. No storage and no screen code. */
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const DEG = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
const nearest = deg => DIRS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
const LISTS = {
  weather_sky: [['CLEAR_SUN', 'Clear / Sun'], ['OVERCAST', 'Overcast'], ['RAIN', 'Rain']],
  wind_condition: [['CALM', 'Calm'], ['MILD', 'Mild'], ['MODERATE', 'Moderate'], ['WINDY', 'Windy']],
  water_condition: [['CALM', 'Calm'], ['CHOPPY', 'Choppy'], ['MIXED', 'Mixed'], ['BAD_CHOP', 'Bad chop']]
};
const labelOf = (list, code) => { const x = (LISTS[list] || []).find(r => r[0] === code); return x ? x[1] : (code || ''); };

/* Positions: decimal "38.6123, -75.1034", degrees-decimal minutes "38°36.738' N 075°06.274' W",
   or degrees-minutes-seconds "38°29'49.37"N, 75° 3'29.48"W". */
function parseCoord(text) {
  if (!text) return null; const t = text.trim();
  const dec = t.match(/^\s*([+-]?\d+\.\d+)\s*[,\s]\s*([+-]?\d+\.\d+)\s*$/);
  if (dec) return ok(+dec[1], +dec[2]);
  const t2 = t.replace(/[”“″]/g, '"').replace(/[’‘′]/g, "'");
  const re = /(\d+)\s*[°\s]\s*(\d+(?:\.\d+)?)\s*'?\s*(?:(\d+(?:\.\d+)?)\s*")?\s*([NSEW])/gi; let m; const v = [];
  while ((m = re.exec(t2))) { let x = +m[1] + (+m[2]) / 60 + (m[3] ? (+m[3]) / 3600 : 0); if (/[SW]/i.test(m[4])) x = -x; v.push(x); }
  if (v.length === 2) return ok(v[0], v[1]);
  return null;
  function ok(a, b) { return (Math.abs(a) <= 90 && Math.abs(b) <= 180) ? { lat: a, lon: b } : null; }
}
/* End of a line: from the spot position, along the heading (compass reference not yet confirmed; treated as true north). */
function linePath(spot, dep, lengthFt = 600) {
  if (!spot || spot.latitude == null) return null;
  const th = dep.lay_heading_deg != null ? dep.lay_heading_deg : DEG[dep.lay_heading]; if (th == null) return null;
  const r = th * Math.PI / 180, ftLat = 364567;
  return { lat: spot.latitude + lengthFt * Math.cos(r) / ftLat, lon: spot.longitude + lengthFt * Math.sin(r) / (ftLat * Math.cos(spot.latitude * Math.PI / 180)), uncertain: dep.lay_heading_deg == null };
}
const bySpot = (a, b) => ((a.sort_order ?? 9999) - (b.sort_order ?? 9999)) || (a.name < b.name ? -1 : 1);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = s => (s === '' || s == null) ? null : Number(s);
const fmtMin = m => m == null ? '—' : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

/* Warn-never-block ranges (dictionary 2.8). Returns a message or ''. */
function rangeWarn(variable, value, unit) {
  if (value == null) return '';
  const r = { AIR_TEMP_F: [0, 120, 'Air temperature'], WATER_TEMP_F: [32, 100, 'Water temperature'], WIND_SPEED: [0, 60, 'Wind speed'], DEPTH_FT: [0, 12, 'Depth'], SALINITY: [0, 200, 'Salinity'] }[variable];
  if (!r) return '';
  if (variable === 'SALINITY' && unit === 'ppm') return '';
  if (value < r[0] || value > r[1]) return `${r[2]} ${value} is outside the usual range ${r[0]} to ${r[1]}.`;
  return '';
}
