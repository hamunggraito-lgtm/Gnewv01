// ================================================================
// SERVICE WORKER - GAMAS 2026
// Naikkan angka versi di CACHE_NAME setiap kali update file,
// supaya browser mengambil versi baru (bukan cache lama).
// ================================================================
const CACHE_NAME = 'gamas-2026-v7';

const APP_SHELL = [
  './',
  './index.html',
  './dashboard-kerja.html',
  './dashboard-laporan.html',
  './dashboard-data.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// File HTML = "network-first": selalu coba ambil versi terbaru dari internet
// dulu, baru pakai cache kalau lagi offline. Supaya perbaikan kode langsung
// kepakai begitu file baru diupload, tanpa nyangkut di cache lama.
function isHtmlRequest(request) {
  if (request.mode === 'navigate') return true;
  const url = new URL(request.url);
  return url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/');
}

// Install: simpan file utama ke cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: hapus cache versi lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Izinkan halaman memaksa service worker baru langsung aktif
// (dipakai oleh script update-detector di HTML)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Cuma tangani GET.
  if (request.method !== 'GET') return;

  // Cuma tangani skema http/https. Request dari ekstensi browser
  // (chrome-extension://, moz-extension://, dll) TIDAK BISA di-cache
  // oleh Cache API, dan mencobanya menyebabkan error
  // "Request scheme 'chrome-extension' is unsupported" di console.
  if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) {
    return;
  }

  // HTML: network-first, supaya versi terbaru selalu dipakai kalau online.
  if (isHtmlRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Aset lain (JS/CSS/gambar/ikon): cache-first seperti biasa.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => cached);
    })
  );
});
