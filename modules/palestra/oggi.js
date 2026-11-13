import * as D from './data.js';
import { h, audio } from '../../core/ui.js';

export default function oggi(root, ctx) {
  const b = D.block();
  if (!b) {
    root.append(h('div', { class: 'oggi' },
      h('h1', { text: 'Palestra' }),
      h('div', { class: 'grow' }),
      h('a', { class: 'btn primary big', href: '#/palestra/importa', text: 'Importa scheda' })));
    return;
  }
  const ids = b.sheets.map((s) => s.id);
  const cur = D.openSession();

  const draw = () => {
    const st = D.db.state;
    if (!ids.includes(st.next)) st.next = ids[0];
    const sheet = cur ? cur.sheet : st.next;
    const week = cur ? cur.week : st.week;
    root.replaceChildren(h('div', { class: 'oggi' },
      h('h1', { text: 'Palestra' }),
      h('div', { class: 'grow' }),
      !cur && h('div', { class: 'tags' },
        h('button', { class: 'chip', text: 'Scheda ' + sheet, onclick: () => {
          st.next = ids[(ids.indexOf(sheet) + 1) % ids.length];
          D.saveState();
          draw();
        } }),
        h('button', { class: 'chip', text: 'Settimana ' + week, onclick: () => {
          st.week = (week % 4) + 1;
          D.saveState();
          draw();
        } })),
      h('button', {
        class: 'btn primary big',
        text: `${cur ? 'Continua' : 'Inizia'} Scheda ${sheet} · settimana ${week}`,
        onclick: () => {
          audio();
          const s = cur || D.startSession(sheet, week);
          ctx.go('palestra/sessione/' + s.id);
        },
      }),
      h('a', { class: 'link center', href: '#/palestra/importa', text: 'Importa scheda' })));
  };
  draw();
}
