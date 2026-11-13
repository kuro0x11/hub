// IndexedDB: un contenitore (object store) per modulo, più "core".
const DB = 'hub';
let db;

const req = (r) => new Promise((res, rej) => {
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

export async function open(names) {
  let d = await req(indexedDB.open(DB));
  const missing = names.filter((n) => !d.objectStoreNames.contains(n));
  if (missing.length) {
    const v = d.version + 1;
    d.close();
    const r = indexedDB.open(DB, v);
    r.onupgradeneeded = () => {
      for (const n of missing) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n);
    };
    d = await req(r);
  }
  d.onversionchange = () => d.close();
  db = d;
}

export function store(name) {
  const os = (mode) => db.transaction(name, mode).objectStore(name);
  const done = (tx) => new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = tx.onabort = () => rej(tx.error);
  });
  return {
    get: (k) => req(os('readonly').get(k)),
    set: (k, v) => { const s = os('readwrite'); s.put(v, k); return done(s.transaction); },
    del: (k) => { const s = os('readwrite'); s.delete(k); return done(s.transaction); },
    async all() {
      const s = os('readonly');
      const [keys, vals] = await Promise.all([req(s.getAllKeys()), req(s.getAll())]);
      const out = {};
      keys.forEach((k, i) => { out[k] = vals[i]; });
      return out;
    },
    replace(obj) {
      const s = os('readwrite');
      s.clear();
      for (const [k, v] of Object.entries(obj || {})) s.put(v, k);
      return done(s.transaction);
    },
  };
}
