/* Pickleball Scorer — service worker
 *
 * Thay đổi so với bản cũ:
 *  - index.html dùng NETWORK-FIRST: deploy bản mới là thấy ngay, không còn kẹt
 *    cache tới khi tự tay đổi CACHE_NAME.
 *  - Icon/font dùng CACHE-FIRST kèm cập nhật ngầm (stale-while-revalidate).
 *  - Cache từng file riêng thay vì addAll: thiếu 1 icon không làm hỏng cả cache.
 *  - Nhận diện app shell bằng đường dẫn đã chuẩn hoá, không dùng endsWith().
 */

const VERSION = 'v7';
const SHELL_CACHE = 'pb-shell-' + VERSION;
const ASSET_CACHE = 'pb-assets-' + VERSION;
const KEEP = [SHELL_CACHE, ASSET_CACHE];

const SHELL = ['./', './index.html'];
const ASSETS = [
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png'
];

const isFontHost = url =>
  url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com';

/** So khớp theo pathname đã chuẩn hoá về scope của SW. */
function scopePath(url){
  const base = new URL(self.registration.scope);
  return url.origin === base.origin && url.pathname.startsWith(base.pathname)
    ? url.pathname.slice(base.pathname.length)
    : null;
}
const isShellPath = p => p === '' || p === 'index.html';

/** Cache từng URL độc lập — một file lỗi không kéo đổ phần còn lại. */
async function cacheEach(cacheName, urls){
  const cache = await caches.open(cacheName);
  await Promise.allSettled(urls.map(async u => {
    const res = await fetch(new Request(u, { cache: 'reload' }));
    if(res.ok) await cache.put(u, res);
  }));
}

self.addEventListener('install', event => {
  event.waitUntil((async ()=>{
    await cacheEach(SHELL_CACHE, SHELL);
    await cacheEach(ASSET_CACHE, ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)));
    if(self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

/** Ưu tiên mạng, hết mạng thì lấy bản cache gần nhất. */
async function networkFirst(request, cacheName, preload){
  const cache = await caches.open(cacheName);
  try{
    const res = (preload && await preload) || await fetch(request);
    if(res && res.ok) cache.put(request, res.clone());
    return res;
  } catch(e){
    const cached = await cache.match(request) || await cache.match('./index.html');
    if(cached) return cached;
    throw e;
  }
}

/** Trả cache ngay, đồng thời làm mới ngầm cho lần mở sau. */
async function staleWhileRevalidate(request, cacheName){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(res => { if(res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()); return res; })
    .catch(()=>null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);

  // Điều hướng trang: luôn thử mạng trước để nhận bản mới.
  if(req.mode === 'navigate'){
    event.respondWith(networkFirst(req, SHELL_CACHE, event.preloadResponse));
    return;
  }

  if(isFontHost(url)){
    event.respondWith(staleWhileRevalidate(req, ASSET_CACHE));
    return;
  }

  const p = scopePath(url);
  if(p === null) return;                       // request ngoài scope: để trình duyệt tự lo
  if(isShellPath(p)){
    event.respondWith(networkFirst(req, SHELL_CACHE, null));
    return;
  }
  event.respondWith(staleWhileRevalidate(req, ASSET_CACHE));
});
