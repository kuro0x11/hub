// Componenti e utilità condivise da tutti i moduli.

export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e) { try { e[k] = v; } catch (err) { e.setAttribute(k, v); } }
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
}

// ---- numeri e date ----
export const fmtNum = (v) => (v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ','));
export const fmtKg = (v) => (v == null ? '–' : fmtNum(v));
export function parseNum(s) {
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
export const fmtDate = (ts, opts = { day: 'numeric', month: 'short' }) =>
  new Date(ts).toLocaleDateString('it-IT', opts);

// ---- avviso con "Annulla" ----
let toastTimer;
export function toast(msg, { undo, ms = 6000 } = {}) {
  const el = document.getElementById('toast');
  const hide = () => el.classList.remove('on');
  el.replaceChildren(
    h('span', { text: msg }),
    undo && h('button', { text: 'Annulla', onclick: () => { hide(); undo(); } }));
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, undo ? ms : 2500);
}

// ---- − numero + (la tastiera compare solo toccando il numero) ----
export function stepper({ label, value, step, dec, onchange }) {
  const set = (v) => {
    if (v != null) v = Math.max(0, Math.round(v * 100) / 100);
    value = v;
    inp.value = fmtNum(v);
    onchange(v);
  };
  const inp = h('input', {
    inputmode: dec ? 'decimal' : 'numeric', value: fmtNum(value), placeholder: '–',
    'aria-label': label, autocomplete: 'off', enterkeyhint: 'done',
    onfocus: () => inp.select(),
    onchange: () => set(parseNum(inp.value)),
    onkeydown: (e) => { if (e.key === 'Enter') inp.blur(); },
  });
  return h('div', { class: 'stepper' },
    h('span', { class: 'lab', text: label }),
    h('button', { text: '−', 'aria-label': label + ' meno', onclick: () => set((value || 0) - step) }),
    inp,
    h('button', { text: '+', 'aria-label': label + ' più', onclick: () => set((value || 0) + step) }));
}

// ---- gruppo di chip a scelta singola ----
export function chips(items, current, onpick) {
  const box = h('div', { class: 'chips' });
  const draw = () => box.replaceChildren(...items.map((it) =>
    h('button', { class: 'chip' + (it.value === current ? ' on' : ''), text: it.label,
      onclick: () => { current = it.value; draw(); onpick(current); } })));
  draw();
  return box;
}

// ---- grafico a linea in SVG ----
// series: [{ pts: [{x, y}], line: bool, dots: bool, dim: bool }]
export function lineChart(series) {
  const box = h('div', { class: 'chart' });
  const all = series.flatMap((s) => s.pts);
  if (!all.length) { box.append(h('p', { class: 'mu', text: 'Nessun dato' })); return box; }
  const W = 320, H = 150, L = 8, R = 8, T = 20, B = 22;
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const xa = Math.min(...xs), xb = Math.max(...xs), ya = Math.min(...ys), yb = Math.max(...ys);
  const x0 = xa === xb ? xa - 1 : xa, x1 = xa === xb ? xb + 1 : xb;
  const y0 = ya === yb ? ya - 1 : ya, y1 = ya === yb ? yb + 1 : yb;
  const X = (x) => (L + ((x - x0) / (x1 - x0)) * (W - L - R)).toFixed(1);
  const Y = (y) => (T + (1 - (y - y0) / (y1 - y0)) * (H - T - B)).toFixed(1);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" data-n="${all.length}">`;
  svg += `<line class="ax" x1="${L}" y1="${H - B + 6}" x2="${W - R}" y2="${H - B + 6}"/>`;
  for (const s of series) {
    if (s.line && s.pts.length > 1) {
      svg += `<polyline class="ln" points="${s.pts.map((p) => X(p.x) + ',' + Y(p.y)).join(' ')}"/>`;
    }
    if (s.dots) {
      for (const p of s.pts) {
        svg += `<circle class="${s.dim ? 'dim' : 'dot'}" cx="${X(p.x)}" cy="${Y(p.y)}" r="${s.dim ? 2 : 3.5}"/>`;
      }
    }
  }
  svg += `<text x="${L}" y="12">${fmtNum(yb)}</text>`;
  if (ya !== yb) svg += `<text x="${W - R}" y="12" text-anchor="end">min ${fmtNum(ya)}</text>`;
  svg += `<text x="${L}" y="${H - 2}">${fmtDate(xa)}</text>`;
  if (xa !== xb) svg += `<text x="${W - R}" y="${H - 2}" text-anchor="end">${fmtDate(xb)}</text>`;
  box.innerHTML = svg + '</svg>';
  return box;
}

// ---- suono (va sbloccato da un tocco: lo fa il ✓) ----
let ac;
export function audio() {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
  } catch (e) { ac = null; }
  return ac;
}

// Programma tre bip tra `sec` secondi. Restituisce la funzione per annullarli.
export function beepIn(sec) {
  const a = audio();
  if (!a) return () => {};
  const nodes = [];
  for (let i = 0; i < 3; i++) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.6;
    o.connect(g);
    g.connect(a.destination);
    const t = a.currentTime + Math.max(0, sec) + i * 0.4;
    o.start(t);
    o.stop(t + 0.22);
    nodes.push(o, g);
  }
  return () => nodes.forEach((n) => { try { n.disconnect(); } catch (e) { /* niente */ } });
}
