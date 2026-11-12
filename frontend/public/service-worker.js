const CACHE_NAME = 'aarogya-shell-v1';
const SHELL_URLS = ['/', '/manifest.webmanifest', '/icons/aarogya.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/')) || Response.error()));
    return;
  }
  if (!['script', 'style', 'font', 'worker'].includes(request.destination)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(request);
    const network = fetch(request).then(response => {
      if (response.ok && response.type === 'basic' && !response.headers.has('set-cookie') && !/no-store/i.test(response.headers.get('cache-control') || '')) cache.put(request, response.clone());
      return response;
    });
    return cached || network;
  }));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
