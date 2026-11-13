importScripts('./version.js');

const CACHE = 'hub-' + self.HUB_VERSION;
const FILES = [
  './', './index.html', './manifest.json', './version.js',
  './core/app.js', './core/modules.js', './core/storage.js', './core/router.js',
  './core/backup.js', './core/ui.js', './core/theme.css',
  './modules/palestra/index.js', './modules/palestra/data.js', './modules/palestra/parser.js',
  './modules/palestra/oggi.js', './modules/palestra/sessione.js', './modules/palestra/calendario.js',
  './modules/palestra/progressi.js', './modules/palestra/importa.js', './modules/palestra/palestra.css',
  './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-192.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Prima la cache (apertura immediata e offline), poi aggiornamento in background.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    });
    if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
    try { return await fresh; }
    catch (err) {
      if (req.mode === 'navigate') return cache.match('./index.html');
      throw err;
    }
  })());
});
