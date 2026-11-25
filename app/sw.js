const scope = new URL(self.registration.scope);
const cachePrefix = `inntake-library-shell:${scope.href}:`;
const cacheName = `${cachePrefix}1`;
const shell = new Set(['./index.html', './app.css', './app.js', './data.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', '../assets/jersey-15.woff2'].map(path => new URL(path, scope).href));
const index = new URL('./index.html', scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll([...shell]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const stale = (await caches.keys()).filter(name => name.startsWith(cachePrefix) && name !== cacheName);
    await Promise.all(stale.map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isAppPage = request.mode === 'navigate' && url.origin === scope.origin &&
    (url.pathname === scope.pathname || url.pathname === new URL(index).pathname);
  const key = isAppPage ? index : url.href;
  if (!shell.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(key, response.clone());
      return response;
    } catch {
      return (await cache.match(key)) || Response.error();
    }
  })());
});
