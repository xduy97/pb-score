const CACHE_NAME = 'pb-scorer-v3';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first cho app shell + font (kể cả Google Fonts, dùng opaque response no-cors),
// mạng ưu tiên cho các request khác nếu có, rơi về cache nếu mất mạng.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isFont = req.url.startsWith('https://fonts.googleapis.com') || req.url.startsWith('https://fonts.gstatic.com');
  const isAppShell = APP_SHELL.some((p) => req.url.endsWith(p.replace('./', '')));

  if (isFont || isAppShell) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req, { mode: isFont ? 'no-cors' : 'cors' })
          .then((res) => {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
            return res;
          })
          .catch(() => cached);
      })
    );
    return;
  }

  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
