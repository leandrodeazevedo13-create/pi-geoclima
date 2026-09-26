// GeoClima Vale - SW fix para dev
const CACHE_NAME = 'geoclima-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  
  // NÃO intercepta nada do Vite em dev
  if (
    url.includes('/@vite/') ||
    url.includes('@vite/client') ||
    url.includes('@react-refresh') ||
    url.includes('__vite') ||
    url.includes('/src/') ||
    url.includes('node_modules') ||
    url.includes('/@fs/') ||
    url.startsWith('chrome-extension://') ||
    url.includes('sockjs') ||
    url.includes('hot-update')
  ) {
    return; // deixa o Vite lidar
  }

  // Só cacheia em produção e se for GET http(s)
  if (e.request.method !== 'GET' || !url.startsWith('http')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // só cacheia se for do seu site e ok
        if (res.ok && url.includes(self.location.origin)) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});