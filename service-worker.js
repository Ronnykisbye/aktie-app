/* =========================================================
   service-worker.js
   - Network-first for HTML/CSS/JS så opdateringer slår igennem
   ========================================================= */

const CACHE_NAME = "aktieapp-v2026-01-30-1";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./css/colors.css",
  "./css/components.css",
  "./css/style.css",
  "./js/main.js",
  "./js/api.js",
  "./js/ui.js",
  "./img/icon.png",
  "./img/refresh.png",
  "./img/pdf.png",
  "./img/chart.png",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request, { cache: "no-store" });
    cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Kun vores eget site
  if (url.origin !== location.origin) return;

  const path = url.pathname;

  // Network-first for HTML/CSS/JS (så farver og knapper opdaterer)
  if (path.endsWith(".html") || path.endsWith(".css") || path.endsWith(".js")) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Billeder: cache-first er fint
  event.respondWith(cacheFirst(event.request));
});
