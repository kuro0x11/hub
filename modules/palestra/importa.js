import * as D from './data.js';
import { parseScheda, parseRx } from './parser.js';
import { h, toast } from '../../core/ui.js';

export default function importa(root, ctx) {
  let P = null;

  // ---- passo 1: scelta del file ----
  const pickView = () => {
    const inp = h('input', { type: 'file', class: 'file', accept: '.html,.htm,text/html', onchange: async () => {
      const f = inp.files[0];
      if (!f) return;
      const parsed = parseScheda(await f.text(), f.name);
      if (!parsed.sheets.length) { inp.value = ''; return toast('Nessuna scheda trovata nel file'); }
      P = prepare(parsed);
      previewView();
    } });
    root.replaceChildren(
      h('header', { class: 'top' },
        h('button', { class: 'backbtn', 'aria-label': 'Indietro', text: '‹', onclick: () => ctx.back('palestra/oggi') })),
      h('div', { class: 'oggi' },
        h('h1', { text: 'Importa scheda' }),
        h('div', { class: 'grow' }),
        h('label', { class: 'btn primary big' }, 'Scegli file', inp)));
  };

  function prepare(parsed) {
    for (const sh of parsed.sheets) {
      for (const it of sh.items) {
        it.same = it.weeks.every((w) => w === it.weeks[0]);
        const sim = !D.findExact(it.nome) && it.nome ? D.findSimilar(it.nome) : null;
        it.match = sim ? { exId: sim.id, nome: sim.nome } : null;
        it.yes = !!sim;
      }
    }
    return parsed;
  }

  // ---- passo 2: anteprima modificabile ----
  function previewView() {
    const summary = h('p', { class: 'mu small sum' });
    const items = () => P.sheets.flatMap((sh) => sh.items.filter((it) => !it.removed));
    const isBad = (it) => !it.nome.trim() || it.weeks.some((w) => !parseRx(w));
    const updateSummary = () => {
      const all = items();
      const bad = all.filter(isBad).length, dub = all.filter((it) => !isBad(it) && it.dub).length;
      summary.textContent = `${P.sheets.length} schede · ${all.length} esercizi`
        + (bad ? ` · ${bad} non riconosciute` : '') + (dub ? ` · ${dub} da controllare` : '');
    };

    const itemEl = (it, sh) => {
      const el = h('div', { class: 'pi' });
      const flag = h('span', { class: 'flag small' });
      const wk = h('div', { class: 'wk' });
      const check = () => {
        const bad = isBad(it);
        el.classList.toggle('warn', bad || !!it.dub);
        el.dataset.state = bad ? 'bad' : it.dub ? 'dub' : 'ok';
        flag.textContent = bad ? 'Non riconosciuta' : it.dub || '';
        for (const i of wk.querySelectorAll('input')) i.classList.toggle('bad', !parseRx(i.value));
        updateSummary();
      };
      const rxField = (w, all) => {
        const inp = h('input', {
          class: 'field', value: it.weeks[w] || '', placeholder: '3x8/10 @9',
          'aria-label': all ? 'Serie' : 'Serie settimana ' + (w + 1),
          autocapitalize: 'off', autocomplete: 'off', spellcheck: false,
          oninput: () => {
            if (all) it.weeks = it.weeks.map(() => inp.value); else it.weeks[w] = inp.value;
            if (it.dub === 'Settimane mancanti') it.dub = '';
            check();
          },
        });
        return all ? inp : h('label', { class: 'wl' }, h('span', { class: 'mu small', text: 'S' + (w + 1) }), inp);
      };
      const drawWeeks = () => {
        wk.replaceChildren(...(it.same
          ? [rxField(0, true), h('button', { class: 'link', text: 'Per settimana', onclick: () => { it.same = false; drawWeeks(); check(); } })]
          : [0, 1, 2, 3].map((w) => rxField(w))));
      };
      drawWeeks();

      el.append(
        h('div', { class: 'pr' },
          h('input', { class: 'field strong', value: it.nome, placeholder: 'Nome esercizio', 'aria-label': 'Nome',
            oninput: (e) => { it.nome = e.target.value; check(); } }),
          h('button', { class: 'x', 'aria-label': 'Elimina riga', text: '✕', onclick: () => {
            it.removed = true;
            el.hidden = true;
            updateSummary();
            toast('Riga eliminata', { undo: () => { it.removed = false; el.hidden = false; updateSummary(); } });
          } })),
        flag,
        wk,
        h('div', { class: 'pr' },
          h('input', { class: 'field', value: it.note, placeholder: 'Note', 'aria-label': 'Note',
            oninput: (e) => { it.note = e.target.value; } }),
          h('label', { class: 'rec' },
            h('span', { class: 'mu small', text: 'Rec. s' }),
            h('input', { class: 'field', inputmode: 'numeric', value: it.rec, 'aria-label': 'Recupero in secondi',
              oninput: (e) => {
                it.rec = Math.max(0, parseInt(e.target.value, 10) || 0);
                if (it.dub === 'Recupero da controllare') it.dub = '';
                check();
              } }))),
        it.match ? h('div', { class: 'same' },
          h('span', { class: 'small', text: `È lo stesso di «${it.match.nome}»?` }),
          sameChips(it)) : '');
      check();
      return el;
    };

    const sameChips = (it) => {
      const box = h('div', { class: 'chips' });
      const draw = () => box.replaceChildren(
        h('button', { class: 'chip' + (it.yes ? ' on' : ''), text: 'Sì', onclick: () => { it.yes = true; draw(); } }),
        h('button', { class: 'chip' + (!it.yes ? ' on' : ''), text: 'No', onclick: () => { it.yes = false; draw(); } }));
      draw();
      return box;
    };

    const body = h('div', { class: 'preview' },
      P.sheets.map((sh) => h('section', { 'data-sheet': sh.id },
        h('h2', { class: 'sec', text: 'Scheda ' + sh.id }),
        sh.items.map((it) => itemEl(it, sh)))));

    root.replaceChildren(
      h('header', { class: 'top' },
        h('button', { class: 'backbtn', 'aria-label': 'Indietro', text: '‹', onclick: pickView }),
        h('strong', { text: 'Anteprima' }), h('span', { class: 'sp' })),
      h('input', { class: 'field strong', value: P.nome, 'aria-label': 'Nome del blocco', oninput: (e) => { P.nome = e.target.value; } }),
      summary, body,
      h('div', { class: 'bottombar' }, h('button', { class: 'btn primary', text: 'Conferma', onclick: () => confirm(body) })));
    root.classList.add('sess');
    updateSummary();
    scrollTo(0, 0);
  }

  // ---- passo 3: conferma → nuovo blocco, il precedente resta in archivio ----
  function confirm(body) {
    const bad = body.querySelector('.pi[data-state="bad"]:not([hidden])');
    if (bad) {
      bad.scrollIntoView({ block: 'center' });
      return toast('Correggi o elimina le righe evidenziate');
    }
    const b = {
      id: D.uid(), nome: P.nome.trim() || 'Blocco', importato: new Date().toISOString(), settimane: 4,
      sheets: P.sheets.map((sh) => ({
        id: sh.id,
        exercises: sh.items.filter((it) => !it.removed).map((it) => {
          const nome = it.nome.trim();
          const exId = D.findExact(nome) || (it.match && it.yes ? it.match.exId : D.uid());
          D.db.exercises[exId] = { id: exId, nome };
          return {
            exId, nome, note: it.note.trim(), recupero: it.rec || 90, fondamentale: !!it.fond,
            restPause: !!it.restPause, weeks: it.weeks.map((w) => parseRx(w)),
          };
        }),
      })).filter((sh) => sh.exercises.length),
    };
    if (!b.sheets.length) return toast('Nessun esercizio da importare');
    D.saveExercises();
    D.saveBlock(b);
    D.db.state = { blockId: b.id, week: 1, next: b.sheets[0].id };
    D.saveState();
    ctx.go('palestra/oggi', true);
  }

  pickView();
}
