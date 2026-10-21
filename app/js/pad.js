'use strict';
/* The shared numeric keypad. One keypad types into whichever field is highlighted.
   First digit after selecting a field replaces the old value. Empty = not entered; typed 0 = zero. */
let PAD = null;   // the active keypad engine
class PadEngine {
  constructor(fields, paint) { this.fields = fields; this.active = 0; this.fresh = true; this.paint = paint; }
  key(act, v) {
    const f = this.fields[this.active]; if (!f) return;
    if (act === 'd') { if (this.fresh) { f.val = ''; this.fresh = false; } if (String(f.val).replace('.', '').length < (f.max || 3)) f.val = String(f.val) + v; }
    else if (act === 'dot') { if (!f.decimal) return; if (this.fresh) { f.val = '0'; this.fresh = false; } if (!String(f.val).includes('.')) f.val = (String(f.val) || '0') + '.'; }
    else if (act === 'bk') { f.val = String(f.val).slice(0, -1); this.fresh = false; }
    else if (act === 'next') { this.active = (this.active + 1) % this.fields.length; this.fresh = true; }
    this.paint();
  }
  focus(i) { this.active = i; this.fresh = true; this.paint(); }
}
function padHTML(withDot) {
  return `<div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-a="d" data-v="${n}">${n}</button>`).join('')}
 <button data-a="bk" aria-label="delete">⌫</button><button data-a="d" data-v="0">0</button><button class="p" data-a="next">NEXT</button>
 ${withDot ? '<button class="dot" data-a="dot">.</button>' : ''}</div>`;
}
function fieldBoxes(eng, pfx) {
  return eng.fields.map((f, i) => `<div class="fld ${i === eng.active ? 'act' : ''}" data-a="focus" data-i="${i}"><b>${esc(f.label)}</b><span>${f.val === '' ? '—' : esc(f.val)}</span>${f.unit ? `<small>${esc(f.unit)}</small>` : ''}</div>`).join('');
}
/* Generic dialog with a keypad.  opts: {title, fields:[{key,label,val,max,decimal,unit}], extra: html, buttons:[{label,act,cls}], onOk(vals)->bool|void, validate(vals)->msg} */
function padDialog(opts) {
  const fields = opts.fields.map(f => Object.assign({ val: '', max: 3 }, f, { val: f.val == null ? '' : String(f.val) }));
  const withDot = fields.some(f => f.decimal);
  const paint = () => { const c = document.getElementById('pdf'); if (c) c.innerHTML = fieldBoxes(PAD); };
  PAD = new PadEngine(fields, paint);
  PAD.opts = opts;
  modal(`<div class="dg ${opts.compact ? 'dgc' : ''}"><div class="dg-l"><h2 style="margin:0 0 6px">${opts.title}</h2><div class="row" id="pdf">${fieldBoxes(PAD)}</div>${opts.compact ? '' : opts.extra || ''}
  <div class="row" style="margin-top:8px"><button class="p big" data-a="padOk">${opts.okLabel || 'OK'}</button>${(opts.buttons || []).map(b => `<button class="${b.cls || ''}" data-a="${b.act}">${b.label}</button>`).join('')}<button data-a="closeM">Cancel</button></div></div>
  <div class="dg-p">${padHTML(withDot)}</div>${opts.compact ? '<div class="dg-x">' + (opts.extra || '') + '</div>' : ''}</div>`);
}
function padValues() { return Object.fromEntries(PAD.fields.map(f => [f.key, f.val === '' ? null : f.val])); }
