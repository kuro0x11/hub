// Dati del modulo Palestra: tutto in memoria, scritto su IndexedDB a ogni modifica.
import { norm } from './parser.js';

export const db = { state: null, blocks: {}, sessions: {}, exercises: {}, weights: [] };
let st;

const put = (k, v) => st.set(k, v).catch((e) => console.error(e));

export async function load(store) {
  st = store;
  const all = await store.all();
  db.state = all.state || { blockId: null, week: 1, next: 'A' };
  db.exercises = all.exercises || {};
  db.weights = all.weights || [];
  db.blocks = {};
  db.sessions = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('block:')) db.blocks[v.id] = v;
    else if (k.startsWith('session:')) db.sessions[v.id] = v;
  }
}

export const saveState = () => put('state', db.state);
export const saveExercises = () => put('exercises', db.exercises);
export const saveWeights = () => put('weights', db.weights);
export const saveBlock = (b) => { db.blocks[b.id] = b; return put('block:' + b.id, b); };
export const saveSession = (s) => { db.sessions[s.id] = s; return put('session:' + s.id, s); };
export const delSession = (s) => { delete db.sessions[s.id]; return st.del('session:' + s.id).catch((e) => console.error(e)); };

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const ymd = (d) => {
  d = new Date(d);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const monday = (d) => {
  d = new Date(d);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
};

export const block = () => db.blocks[db.state.blockId] || null;
export const sessionsSorted = () => Object.values(db.sessions).sort((a, b) => a.start - b.start);
export const hasWork = (s) => s.entries.some((e) => e.sets.some((x) => x.done));
export const openSession = () => sessionsSorted().reverse().find((s) => !s.end) || null;

// Obiettivo del PT per l'esercizio in posizione `idx` di una sessione.
export function target(s, idx) {
  const sh = db.blocks[s.blockId] && db.blocks[s.blockId].sheets.find((x) => x.id === s.sheet);
  if (!sh) return null;
  const entry = s.entries[idx];
  const ex = sh.exercises[idx] && sh.exercises[idx].exId === entry.exId
    ? sh.exercises[idx] : sh.exercises.find((e) => e.exId === entry.exId);
  return ex ? { ex, week: ex.weeks[s.week - 1] || ex.weeks[0] } : null;
}

function lastEntry(exId, before) {
  const list = sessionsSorted();
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].start >= before) continue;
    const e = list[i].entries.find((x) => x.exId === exId && x.sets.some((y) => y.done));
    if (e) return e;
  }
  return null;
}

export function repsRange(reps) {
  if (reps === 'max') return null;
  const p = String(reps).split('/').map(Number);
  return { min: p[0], max: p[p.length - 1] };
}

// Valori già pronti nel campo: kg dell'ultima volta corretti in base all'RPE reale.
export function prefill(exId, t, i, before) {
  const prev = lastEntry(exId, before);
  const last = prev && (prev.sets[i] && prev.sets[i].done ? prev.sets[i] : [...prev.sets].reverse().find((x) => x.done));
  let kg = last ? last.kg : null;
  let up = false;
  if (last && kg > 0 && last.rpe != null && t.rpeMin != null) {
    if (last.rpe < t.rpeMin) { kg += 2.5; up = true; }
    else if (last.rpe > t.rpeMax + 1) kg = Math.max(0, kg - 2.5);
  }
  const r = repsRange(t.reps);
  let reps;
  if (!r) reps = last ? last.reps : null;
  else if (r.min === r.max) reps = r.min;
  else reps = last && !up && last.reps != null ? Math.min(r.max, Math.max(r.min, last.reps)) : r.min;
  return { kg, reps, rpe: t.rpeMin != null ? Math.min(10, Math.max(6, Math.round(t.rpeMin))) : null, fail: t.reps === 'max', done: false };
}

export function startSession(sheetId, week) {
  const b = block();
  const sh = b.sheets.find((x) => x.id === sheetId);
  const start = Date.now();
  const s = {
    id: uid(), start, end: null, blockId: b.id, sheet: sheetId, week,
    entries: sh.exercises.map((ex) => ({
      exId: ex.exId, nome: ex.nome,
      sets: (ex.weeks[week - 1] || ex.weeks[0]).sets.map((t, i) => prefill(ex.exId, t, i, start)),
    })),
    cardio: '', note: '',
  };
  saveSession(s);
  return s;
}

// Chiude la sessione: la prossima scheda è la successiva, la settimana avanza dopo l'ultima (D).
export function finishSession(s) {
  s.end = Date.now();
  saveSession(s);
  const b = block();
  if (!b || b.id !== s.blockId) return;
  const ids = b.sheets.map((x) => x.id);
  const i = ids.indexOf(s.sheet);
  db.state.next = ids[(i + 1) % ids.length];
  if (i === ids.length - 1 && s.week === db.state.week) db.state.week = Math.min(4, db.state.week + 1);
  saveState();
}

// ---- stesso esercizio tra un blocco e l'altro ----
function lev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

export function similarity(a, b) {
  const A = norm(a), B = norm(b);
  if (A === B) return 1;
  const nums = (s) => (s.match(/\d+/g) || []).join(',');
  if (nums(A) !== nums(B)) return 0; // numeri diversi = inclinazioni diverse
  const ta = new Set(A.split(' ')), tb = new Set(B.split(' '));
  let c = 0;
  for (const w of ta) if (tb.has(w)) c++;
  return Math.max((2 * c) / (ta.size + tb.size), 1 - lev(A, B) / Math.max(A.length, B.length));
}

export function findExact(nome) {
  const n = norm(nome);
  const hit = Object.values(db.exercises).find((e) => norm(e.nome) === n);
  return hit ? hit.id : null;
}

export function findSimilar(nome) {
  let best = null, score = 0.6;
  for (const e of Object.values(db.exercises)) {
    const s = similarity(nome, e.nome);
    if (s < 1 && s >= score) { best = e; score = s; }
  }
  return best;
}
