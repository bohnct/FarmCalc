// Service worker: caches the app so it works with no signal in the field.
// Bump VERSION whenever app files change so phones pick up the update.
const VERSION = 'farmcalc-v7';
const FONT_CACHE = 'farmcalc-fonts';

const APP_FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/bundle.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONT_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Google Fonts (handwriting font): cache after first use
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try {
        const res = await fetch(e.request);
        if (res.ok || res.type === 'opaque') await c.put(e.request, res.clone());
        return res;
      } catch { return hit || Response.error(); }
    }));
    return;
  }

  if (url.origin !== location.origin) return;

  // App files: network first so updates show right away; fall back to the
  // cache when offline or when the connection is too slow (weak field signal).
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const net = fetch(e.request).then(res => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    });
    const timeout = new Promise(res => setTimeout(res, 2500));
    try {
      const first = await Promise.race([net, timeout]);
      if (first) return first;
    } catch { /* offline */ }
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    try { return await net; } catch { return (await cache.match('index.html')) || Response.error(); }
  })());
});
