/* ============================================================
   QRONOS 2.0 · service-worker.js
   PWA Service Worker — Cache-first + Network fallback
   ============================================================ */

'use strict';

const CACHE_NAME    = 'qronos-v2.0.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  // Chart.js CDN — se intenta cachear en install
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js',
  // Fonts (optional — fallback a system fonts si offline)
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap',
];

/* ──────────────────────────────────────────────
   INSTALL — Pre-cachear assets estáticos
   ────────────────────────────────────────────── */
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando QRONOS v2.0.0…');

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cachear assets locales (forzado)
      const localAssets = STATIC_ASSETS.filter(url => !url.startsWith('http'));
      await cache.addAll(localAssets);

      // Cachear CDN assets con manejo de errores individual
      const cdnAssets = STATIC_ASSETS.filter(url => url.startsWith('http'));
      await Promise.allSettled(
        cdnAssets.map(url =>
          fetch(url, { mode: 'cors' })
            .then(res => res.ok ? cache.put(url, res) : Promise.resolve())
            .catch(() => console.warn('[SW] No se pudo cachear:', url))
        )
      );

      console.log('[SW] Assets cacheados correctamente.');
    })
  );

  // Activa inmediatamente sin esperar que los clientes antiguos cierren
  self.skipWaiting();
});

/* ──────────────────────────────────────────────
   ACTIVATE — Limpiar caches viejas
   ────────────────────────────────────────────── */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando…');

  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Eliminando cache obsoleta:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ──────────────────────────────────────────────
   FETCH — Estrategia de cache
   ────────────────────────────────────────────── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ── NO interceptar llamadas al backend /analizar (siempre necesitan red) ──
  if (url.pathname.startsWith('/analizar') || url.pathname.startsWith('/health')) {
    return; // Pasar al network directamente
  }

  // ── NO interceptar peticiones a la API de Gemini ──
  if (url.hostname.includes('generativelanguage.googleapis.com')) {
    return;
  }

  // ── Estrategia: Cache First → Network Fallback ──
  if (request.method === 'GET') {
    event.respondWith(cacheFirstStrategy(request));
  }
});

async function cacheFirstStrategy(request) {
  try {
    // 1. Buscar en cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // 2. Si no está en cache, buscar en red
    const networkResponse = await fetch(request);

    // 3. Si la respuesta es válida, cachearla
    if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;

  } catch (err) {
    // 4. Si la red falla y no hay cache, devolver página offline
    const cached = await caches.match('./index.html');
    if (cached) return cached;

    // 5. Última opción: respuesta de error básica
    return new Response(
      `<!DOCTYPE html>
      <html lang="es">
        <head><meta charset="UTF-8"><title>QRONOS 2.0 — Sin conexión</title>
        <style>
          body { font-family: sans-serif; background: #030b1a; color: #fff;
                 display: flex; align-items: center; justify-content: center;
                 min-height: 100vh; margin: 0; text-align: center; }
          h1 { font-size: 1.5rem; margin-bottom: .5rem; }
          p  { color: #9aafc7; font-size: .9rem; }
        </style></head>
        <body>
          <div>
            <h1>⏱ QRONOS 2.0</h1>
            <h2>Sin conexión</h2>
            <p>Verifica tu conexión a internet e intenta de nuevo.</p>
          </div>
        </body>
      </html>`,
      {
        status:  200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }
}

/* ──────────────────────────────────────────────
   BACKGROUND SYNC (futuro — estructura lista)
   ────────────────────────────────────────────── */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-records') {
    console.log('[SW] Background sync: sincronizando registros…');
    // TODO: Implementar sync con backend cuando haya conexión
    // event.waitUntil(syncPendingRecords());
  }
});

/* ──────────────────────────────────────────────
   PUSH NOTIFICATIONS (estructura lista para futuro)
   ────────────────────────────────────────────── */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  self.registration.showNotification(data.title || 'QRONOS 2.0', {
    body:    data.body    || 'Nueva alerta de eficiencia',
    icon:    './icons/icon-192.png',
    badge:   './icons/icon-72.png',
    vibrate: [200, 100, 200],
    data:    { url: data.url || './' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || './')
  );
});

console.log('[SW] QRONOS 2.0 Service Worker cargado.');
