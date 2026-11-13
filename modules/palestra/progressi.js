import * as D from './data.js';
import { h, chips, lineChart, fmtKg, fmtNum, fmtDate, parseNum, toast } from '../../core/ui.js';

let selected = null;
let metric = 'max';

const epley = (kg, reps) => (reps <= 1 ? kg : kg * (1 + reps / 30));

function history(exId) {
  const out = [];
  for (const s of D.sessionsSorted()) {
    const sets = s.entries.filter((e) => e.exId === exId).flatMap((e) => e.sets.filter((x) => x.done));
    if (sets.length) {
      out.push({
        s, sets,
        max: Math.max(...sets.map((x) => x.kg || 0)),
        rm: Math.max(...sets.map((x) => epley(x.kg || 0, x.reps || 0))),
        vol: sets.reduce((a, x) => a + (x.kg || 0) * (x.reps || 0), 0),
      });
    }
  }
  return out;
}

export default function progressi(root) {
  // ---- esercizi ----
  const names = {};
  let latest = null;
  for (const s of D.sessionsSorted()) {
    for (const e of s.entries) {
      if (e.sets.some((x) => x.done)) { names[e.exId] = (D.db.exercises[e.exId] || e).nome; latest = e.exId; }
    }
  }
  const ids = Object.keys(names).sort((a, b) => names[a].localeCompare(names[b], 'it'));
  if (!ids.includes(selected)) selected = latest;

  const exBox = h('div', {});
  const drawEx = () => {
    if (!ids.length) { exBox.replaceChildren(h('p', { class: 'mu', text: 'Nessun allenamento registrato' })); return; }
    const hist = history(selected);
    const pts = hist.map((x) => ({ x: x.s.start, y: Math.round(x[metric] * 10) / 10 }));
    let rec = null;
    for (const x of hist) for (const st of x.sets) {
      if (!rec || st.kg > rec.kg || (st.kg === rec.kg && st.reps > rec.reps)) rec = { kg: st.kg, reps: st.reps, at: x.s.start };
    }
    const bestRm = Math.max(...hist.map((x) => x.rm));
    exBox.replaceChildren(
      h('select', { class: 'field', 'aria-label': 'Esercizio', onchange: (e) => { selected = e.target.value; drawEx(); } },
        ids.map((id) => h('option', { value: id, selected: id === selected, text: names[id] }))),
      chips([{ value: 'max', label: 'Carico' }, { value: 'rm', label: '1RM' }, { value: 'vol', label: 'Volume' }],
        metric, (v) => { metric = v; drawEx(); }),
      lineChart([{ pts, line: true, dots: true }]),
      rec && h('p', { class: 'record' },
        h('span', { class: 'mu small', text: 'Record ' }),
        h('strong', { 'data-record': '1', text: `${fmtKg(rec.kg)} kg × ${rec.reps}` }),
        h('span', { class: 'mu small', text: ` · ${fmtDate(rec.at)} · 1RM ${fmtNum(Math.round(bestRm * 10) / 10)}` })),
      h('div', { class: 'hist' }, hist.slice().reverse().slice(0, 30).map((x) => h('div', { class: 'hrow' },
        h('span', { class: 'mu small', text: `${fmtDate(x.s.start)} · ${x.s.sheet}` }),
        h('span', { text: x.sets.map((st) => `${fmtKg(st.kg)}×${st.reps}`).join('  ') })))));
  };

  // ---- peso corporeo ----
  const wBox = h('div', {});
  const drawW = () => {
    const list = D.db.weights.slice().sort((a, b) => a.d.localeCompare(b.d));
    const ts = (d) => new Date(d + 'T12:00:00').getTime();
    const weeks = {};
    for (const w of list) {
      const k = D.monday(ts(w.d)).getTime();
      (weeks[k] = weeks[k] || []).push(w.kg);
    }
    const avg = Object.keys(weeks).sort((a, b) => a - b).map((k) => ({
      x: +k + 3.5 * 864e5,
      y: Math.round((weeks[k].reduce((a, v) => a + v, 0) / weeks[k].length) * 10) / 10,
    }));
    const today = D.ymd(new Date());
    const cur = list.find((w) => w.d === today);
    const inp = h('input', {
      class: 'field', inputmode: 'decimal', placeholder: 'Peso di oggi (kg)', 'aria-label': 'Peso di oggi',
      value: cur ? fmtNum(cur.kg) : '', enterkeyhint: 'done',
      onkeydown: (e) => { if (e.key === 'Enter') inp.blur(); },
      onchange: () => {
        const v = parseNum(inp.value);
        if (v == null || v < 20 || v > 400) { inp.value = cur ? fmtNum(cur.kg) : ''; return; }
        D.db.weights = D.db.weights.filter((w) => w.d !== today).concat({ d: today, kg: v });
        D.saveWeights();
        drawW();
      },
    });
    wBox.replaceChildren(
      inp,
      list.length ? lineChart([
        { pts: list.map((w) => ({ x: ts(w.d), y: w.kg })), dots: true, dim: true },
        { pts: avg, line: true, dots: avg.length === 1 },
      ]) : null,
      h('div', { class: 'hist' }, list.slice().reverse().slice(0, 5).map((w) => h('div', { class: 'hrow' },
        h('span', { class: 'mu small', text: fmtDate(ts(w.d)) }),
        h('span', { text: fmtNum(w.kg) + ' kg' }),
        h('button', { class: 'x', 'aria-label': 'Elimina', text: '✕', onclick: () => {
          const before = D.db.weights;
          D.db.weights = before.filter((x) => x !== w);
          D.saveWeights();
          drawW();
          toast('Peso eliminato', { undo: () => { D.db.weights = before; D.saveWeights(); drawW(); } });
        } })))));
  };

  root.append(
    h('h1', { text: 'Progressi' }), exBox,
    h('h2', { class: 'sec', text: 'Peso corporeo' }), wBox);
  drawEx();
  drawW();
}
