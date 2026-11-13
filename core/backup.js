import { store } from './storage.js';
import { toast } from './ui.js';

const DAYS = 14;
const core = () => store('core');

export async function isDue() {
  const c = await core().all();
  const last = c.lastBackup || c.firstRun || Date.now();
  return Date.now() - last > DAYS * 864e5;
}

async function snapshot(names) {
  const out = {};
  for (const n of names) out[n] = await store(n).all();
  return out;
}

export async function exportBackup(names) {
  const data = {
    app: 'hub',
    versione: self.HUB_VERSION,
    data: new Date().toISOString(),
    contenitori: await snapshot(names),
  };
  const name = `hub-backup-${data.data.slice(0, 10)}.json`;
  const json = JSON.stringify(data);
  let shared = false;
  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      shared = true;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return false;
  }
  if (!shared) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  await core().set('lastBackup', Date.now());
  toast('Backup esportato');
  return true;
}

export async function importBackup(file, names, onChange) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { data = null; }
  if (!data || data.app !== 'hub' || !data.contenitori) return toast('File non valido');
  const before = await snapshot(names);
  const apply = async (snap) => {
    for (const n of names) if (snap[n]) await store(n).replace(snap[n]);
    await onChange();
  };
  await apply(data.contenitori);
  toast('Backup importato', { undo: () => apply(before) });
}
