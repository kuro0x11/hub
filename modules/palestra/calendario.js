import * as D from './data.js';
import { h } from '../../core/ui.js';

let view = null;

export default function calendario(root, ctx) {
  const now = new Date();
  view = view || { y: now.getFullYear(), m: now.getMonth() };

  const draw = () => {
    const sessions = D.sessionsSorted().filter(D.hasWork);
    const byDay = {};
    for (const s of sessions) (byDay[D.ymd(s.start)] = byDay[D.ymd(s.start)] || []).push(s);

    const first = new Date(view.y, view.m, 1);
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const today = D.ymd(now);
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(h('span', {}));
    for (let d = 1; d <= days; d++) {
      const key = D.ymd(new Date(view.y, view.m, d));
      const list = byDay[key];
      cells.push(h('button', {
        class: 'day' + (list ? ' on' : '') + (key === today ? ' today' : ''),
        disabled: !list,
        'aria-label': d + (list ? ' scheda ' + list.map((s) => s.sheet).join(' ') : ''),
        onclick: () => ctx.go('palestra/sessione/' + list[list.length - 1].id),
      }, h('span', { class: 'd', text: d }), h('span', { class: 'l', text: list ? list.map((s) => s.sheet).join('') : '' })));
    }

    const mon = D.monday(now).getTime();
    const inWeek = sessions.filter((s) => s.start >= mon && s.start < mon + 7 * 864e5).length;
    const inMonth = sessions.filter((s) => {
      const d = new Date(s.start);
      return d.getFullYear() === view.y && d.getMonth() === view.m;
    }).length;
    const stat = (n, label, id) => h('div', { class: 'stat' },
      h('strong', { text: n, 'data-stat': id }), h('span', { class: 'mu small', text: label }));
    const shift = (k) => () => {
      const d = new Date(view.y, view.m + k, 1);
      view = { y: d.getFullYear(), m: d.getMonth() };
      draw();
    };

    root.replaceChildren(
      h('div', { class: 'calhead' },
        h('button', { class: 'backbtn', 'aria-label': 'Mese precedente', text: '‹', onclick: shift(-1) }),
        h('strong', { text: first.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) }),
        h('button', { class: 'backbtn', 'aria-label': 'Mese successivo', text: '›', onclick: shift(1) })),
      h('div', { class: 'cal' },
        ['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((w) => h('span', { class: 'wd mu small', text: w })),
        cells),
      h('div', { class: 'stats' },
        stat(inWeek, 'Settimana', 'settimana'), stat(inMonth, 'Mese', 'mese'), stat(sessions.length, 'Totali', 'totali')));
  };
  draw();
}
