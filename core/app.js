import * as storage from './storage.js';
import * as router from './router.js';
import * as backup from './backup.js';
import { h, toast } from './ui.js';
import { modules } from './modules.js';

const app = document.getElementById('app');
const names = ['core', ...modules.map((m) => m.id)];
const ready = {};
let core, dispose, token = 0;

async function initModule(m) {
  if (ready[m.id]) return;
  const st = storage.store(m.id);
  const from = (await st.get('_schema')) || 0;
  if (from < m.schema) {
    await m.migrate(st, from);
    await st.set('_schema', m.schema);
  }
  await m.init({ store: st });
  ready[m.id] = true;
}

async function reinit() {
  for (const k of Object.keys(ready)) delete ready[k];
  router.refresh();
}

const fileRow = (label, accept, onfile) => {
  const inp = h('input', { type: 'file', class: 'file', accept, onchange: () => {
    if (inp.files[0]) onfile(inp.files[0]);
    inp.value = '';
  } });
  return h('label', { class: 'row' }, label, inp);
};

function hub() {
  core.set('last', '');
  app.replaceChildren(h('main', {},
    h('h1', { text: 'Hub' }),
    h('nav', { class: 'rows' },
      modules.map((m) => h('a', { class: 'row strong', href: '#/' + m.id, text: m.nome }))),
    h('nav', { class: 'rows quiet' },
      h('button', { class: 'row', text: 'Esporta backup', onclick: () => backup.exportBackup(names) }),
      fileRow('Importa backup', '.json,application/json', (f) => backup.importBackup(f, names, reinit))),
    h('p', { class: 'mu small', text: 'v' + self.HUB_VERSION })));
}

async function render(parts) {
  const my = ++token;
  if (dispose) { try { dispose(); } catch (e) { /* niente */ } dispose = null; }
  if (!parts.length) return hub();
  const m = modules.find((x) => x.id === parts[0]);
  if (!m) return router.go('', true);
  await initModule(m);
  if (my !== token) return;
  core.set('last', m.id);
  const id = parts[1] || m.screens[0].id;
  const tab = m.screens.find((s) => s.id === id);
  const view = tab || (m.sub && m.sub[id]);
  if (!view) return router.go(m.id, true);

  const main = h('main', { class: tab ? 'tabs' : '' });
  const kids = [];
  if (tab) {
    const due = await backup.isDue();
    if (my !== token) return;
    kids.push(h('header', { class: 'top' },
      h('a', { class: 'link', href: '#/', text: '‹ Hub' }),
      due && h('button', { class: 'link', text: 'Backup consigliato',
        onclick: async (e) => { if (await backup.exportBackup(names)) e.target.remove(); } })));
  }
  kids.push(main);
  if (tab) {
    kids.push(h('nav', { class: 'tabbar' }, m.screens.slice(0, 3).map((s) =>
      h('a', { href: `#/${m.id}/${s.id}`, class: s.id === id ? 'on' : '', text: s.label }))));
  }
  app.replaceChildren(...kids);
  scrollTo(0, 0);
  const ctx = {
    args: parts.slice(2),
    go: (p, replace) => router.go(p, replace),
    back: (fallback) => router.back(fallback),
    refresh: router.refresh,
    toast,
  };
  const d = await view.render(main, ctx);
  if (my === token) dispose = typeof d === 'function' ? d : null;
  else if (typeof d === 'function') d();
}

async function boot() {
  await storage.open(names);
  core = storage.store('core');
  if (!(await core.get('firstRun'))) await core.set('firstRun', Date.now());
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if (!location.hash) {
    const last = await core.get('last');
    if (last && modules.some((m) => m.id === last)) history.replaceState(null, '', '#/' + last);
  }
  router.start(render);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

boot();
