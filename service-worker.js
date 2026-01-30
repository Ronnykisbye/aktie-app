/* =========================================================
   service-worker.js
   - Cache PWA-filer
   - Network-first for datafiler (prices.json / fonde.csv)
   - Bump CACHE_NAME ved ændringer, så vi ikke ser gamle filer
   ========================================================= */

const CACHE_NAME = "aktie-app-v4"; // <-- BUMPET

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./icon.svg",
  "./css/colors.css",
  "./css/components.css",
  "./css/style.css",
  "./js/main.js",
  "./js/api.js",
  "./js/ui.js",
  "./js/purchase-prices.js",
  "./prices.json",
  "./fonde.csv",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
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
  try {
    const fresh = await fetch(request, { cache: "no-store" });
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const fresh = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Network-first for datafiler (altid friske)
  if (url.pathname.endsWith("/prices.json") || url.pathname.endsWith("/fonde.csv")) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Default: cache-first for resten
  event.respondWith(cacheFirst(event.request));
});
