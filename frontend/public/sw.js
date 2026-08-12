// Sube esta versión cada vez que cambies este archivo, para que activate()
// purgue el caché anterior en los navegadores que ya tenían el SW instalado.
const CACHE_NAME = 'reminders-app-v2';
const APP_SHELL = ['/', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Red primero, siempre. Next.js genera archivos con hash distinto en cada
  // build, así que servir el HTML/JS de un build anterior desde caché rompe
  // la app (referencia chunks que ya no existen) en cuanto se publica un
  // deploy nuevo — eso causaba la pantalla en blanco en Chrome normal
  // (con el Service Worker viejo ya instalado) y no en incógnito (sin él).
  // El caché solo se usa como respaldo si el dispositivo está sin conexión.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
