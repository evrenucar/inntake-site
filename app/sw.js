const scope = new URL(self.registration.scope);
const cachePrefix = 'inntake-library-shell:' + scope.href + ':';
const cacheName = cachePrefix + 'viewer-38ea50ab09cb34bb';
const files = ['index.html', 'app.js', 'viewer.js', 'viewer-storage.js', 'lucide-icons.json',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const shell = new Set(files.map(path => new URL(path,scope).href));
const index = new URL('index.html',scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(Array.from(shell, url => new Request(url,{cache:'reload'})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const stale = (await caches.keys()).filter(key => key.startsWith(cachePrefix) && key !== cacheName);
    await Promise.all(stale.map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const page = event.request.mode === 'navigate' && url.origin === scope.origin &&
    (url.pathname === scope.pathname || url.pathname === new URL(index).pathname);
  const key = page ? index : url.href;
  if (!shell.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return await cache.match(key) || fetch(event.request);
  })());
});
