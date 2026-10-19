
const CACHE_NAME = 'geoclima-vale-v2';
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(['/'])));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(resp => resp || fetch(event.request).catch(()=> caches.match('/'))));
});
self.addEventListener('push', event => {
  let data = { title: '🚨 GeoClima Vale', body: 'Novo alerta da Defesa Civil - Verifique o mapa' };
  try { if(event.data) data = event.data.json(); } catch(e){ if(event.data) data.body = event.data.text(); }
  const options = {
    body: data.body,
    icon: 'https://cdn-icons-png.flaticon.com/512/1146/1146869.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/1146/1146869.png',
    tag: data.tag || 'geoclima-alerta',
    requireInteraction: true,
    vibrate: [300,100,300,100,500],
    data: { url: '/' },
    actions: [{ action: 'ver', title: 'Ver Mapa' }, { action: 'fechar', title: 'Fechar' }]
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if(event.action === 'fechar') return;
  event.waitUntil(clients.matchAll({ type: 'window' }).then(arr => {
    const win = arr.find(c => c.url.includes(self.location.origin) && 'focus' in c);
    if(win){ win.focus(); win.navigate('/'); } else { clients.openWindow('/'); }
  }));
});
