// Lettura della scheda del PT (HTML esportato da un'app di note) in locale, con DOMParser.

const ALIAS = { man: 'manubri', manubrio: 'manubri', bil: 'bilanciere', rem: 'rematore' };

export const norm = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim()
  .split(' ').map((w) => ALIAS[w] || w).join(' ');

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pretty = (s) => (s && s === s.toUpperCase() ? cap(s.toLowerCase()) : s);
const num = (s) => parseFloat(s.replace(',', '.'));

// ---- prescrizione: "3x8/10 @10", "3xmax @9", "6,8,10 @10", "6 @8, 6 @9 TUT 2-1-X" ----
const TOK = /^(?:(\d+)\s*[x×*]\s*)?(max|\d+(?:\s*\/\s*\d+)?)\s*(?:@\s*(\d+(?:[.,]5)?)(?:\s*\/\s*(\d+(?:[.,]5)?))?)?$/i;

export function parseRx(str) {
  let tut = null;
  const s = String(str || '')
    .replace(/TUT\s*:?\s*((?:[\dx]\s*-\s*){2,3}[\dx])/i, (m, a) => { tut = a.replace(/\s/g, '').toUpperCase(); return ' '; })
    .replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const sets = [];
  for (const tk of s.split(/\s*[,;]\s*/)) {
    const m = tk.trim().match(TOK);
    if (!m) return null;
    const n = m[1] ? +m[1] : 1;
    if (n < 1 || n > 12) return null;
    const reps = m[2].toLowerCase().replace(/\s/g, '');
    const a = m[3] ? num(m[3]) : null;
    const b = m[4] ? num(m[4]) : a;
    for (let i = 0; i < n; i++) sets.push({ reps, rpeMin: a, rpeMax: b });
  }
  if (!sets.length || sets.length > 12) return null;
  for (let i = sets.length - 2; i >= 0; i--) {
    if (sets[i].rpeMin == null && sets[i + 1].rpeMin != null) Object.assign(sets[i], { rpeMin: sets[i + 1].rpeMin, rpeMax: sets[i + 1].rpeMax });
  }
  for (let i = 1; i < sets.length; i++) {
    if (sets[i].rpeMin == null && sets[i - 1].rpeMin != null) Object.assign(sets[i], { rpeMin: sets[i - 1].rpeMin, rpeMax: sets[i - 1].rpeMax });
  }
  return { sets, tut };
}

const n2 = (v) => String(v).replace('.', ',');
const rpeTxt = (s) => (s.rpeMin == null ? '' : ' @' + n2(s.rpeMin) + (s.rpeMax !== s.rpeMin ? '/' + n2(s.rpeMax) : ''));

export function formatRx(rx) {
  if (!rx) return '';
  const { sets } = rx;
  const sameRpe = sets.every((s) => s.rpeMin === sets[0].rpeMin && s.rpeMax === sets[0].rpeMax);
  const sameReps = sets.every((s) => s.reps === sets[0].reps);
  let out;
  if (sameRpe && sameReps) out = `${sets.length}x${sets[0].reps}${rpeTxt(sets[0])}`;
  else if (sameRpe) out = sets.map((s) => s.reps).join(',') + rpeTxt(sets[0]);
  else out = sets.map((s) => s.reps + rpeTxt(s)).join(', ');
  return out + (rx.tut ? ' TUT ' + rx.tut : '');
}

// ---- righe di testo dal DOM ----
const BLOCK = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR', 'TABLE',
  'SECTION', 'ARTICLE', 'BLOCKQUOTE', 'BODY', 'HEADER', 'FOOTER', 'DL', 'DT', 'DD', 'PRE']);

function lines(doc) {
  const out = [];
  let cur = { t: '', cb: false };
  const flush = () => {
    const t = cur.t.replace(/\s+/g, ' ').trim();
    if (!t) { cur.t = ''; return; }
    out.push({ t, cb: cur.cb });
    cur = { t: '', cb: false };
  };
  (function walk(n) {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) cur.t += c.nodeValue;
      else if (c.nodeType === 1) {
        const tag = c.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE') continue;
        if (tag === 'BR') { flush(); continue; }
        if (tag === 'INPUT') { if (c.type === 'checkbox') cur.cb = true; continue; }
        const b = BLOCK.has(tag);
        if (b) flush();
        walk(c);
        if (b) flush();
      }
    }
  })(doc.body);
  flush();
  return out;
}

// ---- note: parentesi e "ultima serie Rest-Pause" ----
function splitNotes(text) {
  const notes = [];
  let restPause = false;
  text = text.replace(/\(\s*(TUT[^)]*)\)/gi, ' $1 ');
  text = text.replace(/\(([^)]*)\)/g, (m, a) => { if (a.trim()) notes.push(a.trim()); return ' '; });
  text = text.replace(/(?:ultim[ao]\s+serie\s+(?:in\s+|a\s+)?)?rest[\s-]*pause(?:\s+\d+\w*)?/i, (m) => {
    restPause = true;
    notes.push(cap(m.trim()));
    return ' ';
  });
  return { text: text.replace(/\s+/g, ' ').trim(), notes, restPause };
}

const RX_START = /\d+\s*[x×]\s*(?:max|\d)|\b\d+(?:\/\d+)?(?:\s*,\s*\d+(?:\/\d+)?)+\s*(?:@|TUT|$)|\b(?:max|\d+(?:\/\d+)?)\s*@\s*\d/i;
const SETT = /\bSETT(?:IMAN[AE])?\.?\s*\d/i;
const WEEK = /^SETT(?:IMAN[AE])?\.?\s*(\d(?:\s*(?:E|,|-|\/|&)\s*\d)*)\s*[:=–-]?\s*(.*)$/i;

function parseExercise(raw) {
  const { text, notes, restPause } = splitNotes(raw);
  const m = text.match(RX_START);
  if (!m) {
    // prescrizione presente ma scritta in modo non riconosciuto: separo comunque il nome
    const loose = text.match(/^(.*?\D)\s+(\d+\s*[x×,@].*)$/i);
    return loose ? { nome: loose[1].trim(), rx: null, notes, restPause, raw: loose[2] } : { nome: text, rx: null, notes, restPause };
  }
  const nome = text.slice(0, m.index).replace(/[\s:–-]+$/, '');
  const rest = text.slice(m.index);
  let rx = parseRx(rest);
  if (!rx) {
    const pm = rest.match(/^(?:[\d@/,.\s×x-]|max|TUT)+/i);
    if (pm) {
      rx = parseRx(pm[0]);
      const extra = rest.slice(pm[0].length).trim();
      if (rx && extra) notes.push(extra);
    }
  }
  return { nome, rx, notes, restPause, raw: rx ? null : rest };
}

// ---- recuperi ----
function parseTime(t) {
  let m;
  if ((m = t.match(/(\d+)\s*(?:'|′|’|min)\s*(\d+)\s*(?:"|″|”|''|’’|sec)/i))) return +m[1] * 60 + +m[2];
  if ((m = t.match(/(\d+)\s*(?:"|″|”|“|''|’’|sec\w*|s\b)/i))) return +m[1];
  if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:'|′|’|‘|min\w*|m\b)/i))) return Math.round(num(m[1]) * 60);
  if ((m = t.match(/\d+/))) return +m[0] <= 10 ? +m[0] * 60 : +m[0];
  return null;
}

const wordEq = (a, b) => {
  if (a === b) return true;
  const k = Math.min(a.length, b.length);
  return k >= 4 && a.slice(0, k - 1) === b.slice(0, k - 1);
};

// 'si' = il nome inizia con una voce dell'elenco; 'forse' = la parola compare altrove nel nome.
function fondMatch(nome, list) {
  const words = norm(nome).split(' ');
  let maybe = false;
  for (const li of list) {
    if (li.every((w, i) => words[i] && wordEq(w, words[i]))) return 'si';
    if (li.every((w) => words.some((x) => wordEq(w, x)))) maybe = true;
  }
  return maybe ? 'forse' : 'no';
}

// ---- documento intero ----
export function parseScheda(html, fileName) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const secs = [];
  const rest = { fond: 180, altri: 90, list: [] };
  let sec = null, cur = null, wantList = false, title = null;

  const addList = (t) => {
    for (const p of t.split(/\s*(?:,|;|\/|\+|\be\b)\s*/i)) {
      const w = norm(p).split(' ').filter(Boolean);
      if (w.length) rest.list.push(w);
    }
  };
  const newItem = (nome, notes = [], restPause = false) => {
    const it = { nome: pretty(nome), note: [...notes], weeks: ['', '', '', ''], restPause, hasSett: false, fromRx: false };
    sec.items.push(it);
    cur = it;
    return it;
  };

  for (const { t: raw, cb } of lines(doc)) {
    const t = raw.replace(/^(?:[☐☑☒✓✔□▢◻•·*]|-\s|\[[ x]?\])\s*/i, '').trim();
    if (!t) continue;
    let m;

    if ((m = t.match(/^SCHEDA\s+([A-Z])\b/i))) {
      sec = { id: m[1].toUpperCase(), items: [] };
      secs.push(sec);
      cur = null;
      wantList = false;
      continue;
    }

    if (/^(?:PAUS[AE]|RECUPER[OI])\b/i.test(t)) {
      for (const seg of t.split(/(?=\bPAUS[AE]\b)/i)) {
        const time = parseTime(seg);
        if (/FONDAMENTAL/i.test(seg)) {
          if (time) rest.fond = time;
          const names = seg.replace(/PAUS[AE]|FONDAMENTAL[EI]?|RECUPER[OI]/gi, ' ')
            .replace(/\d+\s*(?:['"′″’”“‘]+|min\w*|sec\w*)/gi, ' ').replace(/[():\d]/g, ' ').trim();
          if (/[a-z]/i.test(names)) addList(names); else wantList = true;
        } else if (time) rest.altri = time;
      }
      continue;
    }

    if (wantList) {
      wantList = false;
      if (!RX_START.test(t) && !SETT.test(t)) { addList(t); continue; }
    }

    if (!sec) { if (!title) title = t; continue; }

    if (SETT.test(t)) {
      for (const seg of t.split(/(?=\bSETT(?:IMAN[AE])?\.?\s*\d)/i)) {
        const wm = seg.trim().match(WEEK);
        if (!wm) { if (seg.trim()) newItem(seg.trim()); continue; }
        if (!cur || cur.fromRx) newItem('');
        const d = wm[1].match(/\d/g).map(Number);
        const weeks = /-/.test(wm[1]) && d.length === 2
          ? Array.from({ length: d[1] - d[0] + 1 }, (_, i) => d[0] + i) : d;
        const sn = splitNotes(wm[2]);
        const rx = parseRx(sn.text);
        for (const w of weeks) if (w >= 1 && w <= 4) cur.weeks[w - 1] = rx ? formatRx(rx) : wm[2].trim();
        for (const n of sn.notes) if (!cur.note.includes(n)) cur.note.push(n);
        if (sn.restPause) cur.restPause = true;
        cur.hasSett = true;
      }
      continue;
    }

    const ex = parseExercise(t);
    if (ex.rx) {
      const it = newItem(ex.nome, ex.notes, ex.restPause);
      it.weeks = it.weeks.map(() => formatRx(ex.rx));
      it.fromRx = true;
      continue;
    }
    if (cur && !cb && (/^\(/.test(t) || (ex.restPause && !ex.nome))) {
      cur.note.push(...ex.notes);
      if (ex.restPause) cur.restPause = true;
      continue;
    }
    const it = newItem(ex.nome || t, ex.notes, ex.restPause);
    if (ex.raw) { it.weeks = it.weeks.map(() => ex.raw); it.fromRx = true; }
  }

  // L'indice in testa ripete "SCHEDA A/B/C/D": per ogni lettera tengo la sezione con più esercizi.
  const valid = (s) => s.items.filter((it) => it.weeks.some((w) => parseRx(w))).length;
  const best = {};
  for (const s of secs) if (!best[s.id] || valid(s) >= valid(best[s.id])) best[s.id] = s;
  const sheets = Object.keys(best).sort().map((id) => best[id]).filter((s) => valid(s) > 0);

  for (const s of sheets) {
    for (const it of s.items) {
      it.dub = '';
      const some = it.weeks.some(Boolean);
      if (some && !it.weeks.every(Boolean)) {
        for (let w = 0; w < 4; w++) if (!it.weeks[w]) it.weeks[w] = it.weeks[w - 1] || it.weeks.find(Boolean);
        it.dub = 'Settimane mancanti';
      }
      const fm = rest.list.length ? fondMatch(it.nome, rest.list) : 'no';
      it.fond = fm === 'si' || it.hasSett;
      if (!it.fond && fm === 'forse' && some) it.dub = 'Recupero da controllare';
      it.rec = it.fond ? rest.fond : rest.altri;
      it.note = it.note.join(' · ');
      delete it.fromRx;
    }
  }

  const fromFile = String(fileName || '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  const docTitle = (doc.title || '').trim();
  const nome = fromFile || (/^(notepad|note|untitled|)$/i.test(docTitle) ? '' : docTitle) || title
    || 'Blocco ' + new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  return { nome, sheets, rest };
}
