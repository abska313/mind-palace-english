// Service worker — القصر الذهني
// Change VERSION only when you change the CDN list or the icons.
// index.html updates by itself (network first).
const VERSION = 'v1';
const CACHE = 'palace-' + VERSION;

const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

const CDN = [
  'https://cdn.tailwindcss.com/3.4.17',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Inter:wght@500;600;700;800;900&display=swap'
];

const CDN_HOSTS = [
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.map(u => cache.add(u).catch(() => {})));
    await Promise.all(CDN.map(async u => {
      try {
        const res = await fetch(new Request(u, { mode: 'no-cors' }));
        await cache.put(u, res);
      } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('palace-') && k !== CACHE).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(event, req));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin || CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event, req));
  }
});

// Page: try the network (max 4s), otherwise use the saved copy
async function networkFirst(event, req) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then(res => {
    if (res && res.ok) cache.put('./index.html', res.clone());
    return res;
  });
  net.catch(() => {});
  try {
    return await Promise.race([
      net,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
    ]);
  } catch (_) {
    const cached = (await cache.match(req)) || (await cache.match('./index.html')) || (await cache.match('./'));
    if (cached) return cached;
    try { return await net; } catch (e) { return Response.error(); }
  }
}

// Files + CDN: serve the saved copy instantly, refresh it in the background
async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const update = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  event.waitUntil(update);
  if (cached) return cached;
  const res = await update;
  return res || Response.error();
}
