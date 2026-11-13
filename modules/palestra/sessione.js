import * as D from './data.js';
import { formatRx } from './parser.js';
import { h, stepper, fmtKg, fmtDate, toast, beepIn } from '../../core/ui.js';

// Il recupero vive fuori dalla schermata: continua anche se cambio vista.
const timer = { end: 0, cancel: null, doneUntil: 0 };

function stopTimer() {
  if (timer.cancel) timer.cancel();
  timer.cancel = null;
  timer.end = 0;
}
function startTimer(sec) {
  stopTimer();
  timer.doneUntil = 0;
  timer.end = Date.now() + sec * 1000;
  timer.cancel = beepIn(sec);
}

const recTxt = (s) => (s % 60 === 0 ? `${s / 60}′` : `${s}″`);
const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function sessione(root, ctx) {
  const s = D.db.sessions[ctx.args[0]];
  if (!s) { ctx.go('palestra/oggi', true); return; }
  const live = !s.end;
  const save = () => D.saveSession(s);

  const nextUndone = (e0 = 0, i0 = 0) => {
    const flat = [];
    s.entries.forEach((en, e) => en.sets.forEach((x, i) => flat.push([e, i, x])));
    const from = flat.findIndex(([e, i]) => e === e0 && i === i0);
    const order = from < 0 ? flat : [...flat.slice(from), ...flat.slice(0, from)];
    const hit = order.find(([, , x]) => !x.done);
    return hit ? [hit[0], hit[1]] : null;
  };
  let open = live ? nextUndone() : null;

  const list = h('div', { class: 'exs' });
  const progFill = h('i', {});
  const bar = h('div', { class: 'bottombar' });

  // ---- serie ----
  const valTxt = (x, t) => `${fmtKg(x.kg)} kg × ${x.reps == null ? (t && t.reps === 'max' ? 'max' : '–') : x.reps}`;
  const refs = {};

  function toggle(e, i) {
    const x = s.entries[e].sets[i];
    x.done = !x.done;
    if (x.done) {
      x.ts = Date.now();
      if (x.kg == null) x.kg = 0;
      if (x.reps == null) x.reps = 0;
      if (live) {
        const t = D.target(s, e);
        startTimer(t ? t.ex.recupero : 90);
      }
      open = nextUndone(e, i);
    } else {
      open = [e, i];
    }
    save();
    drawList(true);
    drawBar();
  }

  function row(x, e, i, t) {
    const v = h('span', { class: 'v', text: valTxt(x, t) });
    refs[e + ':' + i] = () => { v.textContent = valTxt(x, t); };
    return h('div', { class: 'set' + (x.done ? ' done' : ''), onclick: () => { open = [e, i]; drawList(); } },
      h('span', { class: 'n', text: i + 1 }),
      v,
      h('span', { class: 'r', text: (x.rpe != null ? '@' + x.rpe : '') + (x.fail ? ' ced.' : '') }),
      h('button', { class: 'tick', 'aria-label': x.done ? 'Fatta' : 'Segna fatta', text: '✓',
        onclick: (ev) => { ev.stopPropagation(); toggle(e, i); } }));
  }

  function editor(x, e, i) {
    const sets = s.entries[e].sets;
    const rpeBox = h('div', { class: 'chips' });
    const drawRpe = () => rpeBox.replaceChildren(
      ...[6, 7, 8, 9, 10].map((n) => h('button', { class: 'chip' + (x.rpe === n ? ' on' : ''), text: n,
        'aria-label': 'RPE ' + n, onclick: () => { x.rpe = n; save(); drawRpe(); } })));
    drawRpe();
    const fail = h('button', { class: 'chip fail' + (x.fail ? ' on' : ''), text: 'Cedimento',
      onclick: () => { x.fail = !x.fail; save(); fail.classList.toggle('on', x.fail); } });
    return h('div', { class: 'set open' + (x.done ? ' done' : '') },
      h('div', { class: 'sl cap', text: 'Serie ' + (i + 1) }),
      stepper({ label: 'kg', value: x.kg, step: 2.5, dec: true, onchange: (v) => {
        x.kg = v;
        x.m = 1;
        // stesso carico sulle serie successive non ancora toccate
        for (let j = i + 1; j < sets.length; j++) {
          if (!sets[j].done && !sets[j].m) { sets[j].kg = v; if (refs[e + ':' + j]) refs[e + ':' + j](); }
        }
        save();
      } }),
      stepper({ label: 'rip', value: x.reps, step: 1, onchange: (v) => { x.reps = v == null ? null : Math.round(v); save(); } }),
      h('div', { class: 'rpe' }, h('span', { class: 'lab cap', text: 'RPE' }), rpeBox),
      h('div', { class: 'act' },
        fail,
        h('button', { class: 'btn big tickbig' + (x.done ? '' : ' primary'), 'aria-label': x.done ? 'Fatta' : 'Segna fatta',
          text: '✓', onclick: () => toggle(e, i) })));
  }

  function card(entry, e) {
    const t = D.target(s, e);
    const goal = t && [formatRx(t.week).replace(/x/g, '×').replace(/ TUT /, ' · TUT '), 'rec. ' + recTxt(t.ex.recupero)].join(' · ');
    return h('section', { class: 'ex' },
      h('h2', { text: entry.nome }),
      goal && h('p', { class: 'goal', text: goal }),
      t && t.ex.note && h('p', { class: 'note mu small', text: t.ex.note }),
      entry.sets.map((x, i) => {
        const isOpen = open && open[0] === e && open[1] === i;
        return isOpen ? editor(x, e, i) : row(x, e, i, t && t.week.sets[i]);
      }));
  }

  function drawList(follow) {
    const y = scrollY;
    list.replaceChildren(...s.entries.map(card));
    const all = s.entries.flatMap((en) => en.sets);
    progFill.style.width = (all.length ? (all.filter((x) => x.done).length / all.length) * 100 : 0) + '%';
    scrollTo(0, y);
    if (follow) {
      const el = list.querySelector('.set.open');
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }

  // ---- barra in basso: recupero oppure "Fine" ----
  let mode = '';
  function drawBar() {
    const now = Date.now();
    if (timer.end && now >= timer.end) { timer.end = 0; timer.cancel = null; timer.doneUntil = now + 8000; }
    const next = timer.end ? 'timer' : now < timer.doneUntil ? 'done' : live ? (nextUndone() ? 'fine' : 'fine-all') : 'none';
    if (next !== mode) {
      mode = next;
      if (mode === 'timer') {
        bar.replaceChildren(h('button', { class: 'btn timer', onclick: () => { stopTimer(); drawBar(); } },
          h('span', { class: 'clock' }), h('span', { class: 'mu', text: 'Salta' })));
      } else if (mode === 'done') {
        bar.replaceChildren(h('button', { class: 'btn primary', role: 'alert', text: 'Recupero finito',
          onclick: () => { timer.doneUntil = 0; drawBar(); } }));
      } else if (mode === 'none') {
        bar.replaceChildren();
      } else {
        bar.replaceChildren(h('button', { class: 'btn' + (mode === 'fine-all' ? ' primary' : ''), text: 'Fine', onclick: finish }));
      }
      bar.hidden = mode === 'none';
    }
    if (mode === 'timer') bar.querySelector('.clock').textContent = mmss(timer.end - now);
  }

  function remove(msg) {
    stopTimer();
    D.delSession(s);
    toast(msg, { undo: () => { D.saveSession(s); ctx.refresh(); } });
  }

  function finish() {
    stopTimer();
    timer.doneUntil = 0;
    if (!D.hasWork(s)) remove('Sessione vuota eliminata');
    else D.finishSession(s);
    ctx.go('palestra/oggi', true);
  }

  // ---- cardio e note: nascosti finché non li tocco ----
  const extra = h('div', { class: 'extra' });
  const drawExtra = (show) => {
    if (!show && !s.cardio && !s.note) {
      extra.replaceChildren(h('button', { class: 'link', text: '+ Cardio e note', onclick: () => drawExtra(true) }));
      return;
    }
    extra.replaceChildren(
      h('input', { class: 'field', placeholder: 'Cardio', value: s.cardio || '', 'aria-label': 'Cardio',
        oninput: (ev) => { s.cardio = ev.target.value; save(); } }),
      h('textarea', { class: 'field', placeholder: 'Note', value: s.note || '', 'aria-label': 'Note',
        oninput: (ev) => { s.note = ev.target.value; save(); } }));
  };
  drawExtra(false);

  root.append(
    h('header', { class: 'top' },
      h('button', { class: 'backbtn', 'aria-label': 'Indietro', text: '‹', onclick: () => ctx.back('palestra/oggi') }),
      h('div', { class: 'ttl' },
        h('strong', { text: `Scheda ${s.sheet} · settimana ${s.week}` }),
        h('span', { class: 'mu small', text: fmtDate(s.start, { weekday: 'short', day: 'numeric', month: 'short' }) }))),
    h('div', { class: 'prog' }, progFill),
    list, extra,
    h('button', { class: 'link', text: 'Elimina sessione', onclick: () => { remove('Sessione eliminata'); ctx.back('palestra/oggi'); } }),
    bar);
  root.classList.add('sess');
  drawList();
  drawBar();

  const iv = setInterval(drawBar, 250);
  // Schermo acceso durante l'allenamento, dove il sistema lo permette.
  let lock = null;
  const keepOn = () => {
    if (live && document.visibilityState === 'visible' && navigator.wakeLock) {
      navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
    }
  };
  keepOn();
  document.addEventListener('visibilitychange', keepOn);
  return () => {
    clearInterval(iv);
    document.removeEventListener('visibilitychange', keepOn);
    if (lock) lock.release().catch(() => {});
  };
}
