/* =========================================================
   service-worker.js
   - Robust caching: install fejler ikke hvis en fil mangler
   - Network-first for HTML/CSS/JS (så updates slår igennem)
   - Network-first for datafiler (prices.json / fonde.csv)
   - Cache-name bump, så gamle caches ryger
   ========================================================= */

const CACHE_NAME = "aktieapp-v2026-01-30-3"; // <-- BUMP

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./css/colors.css",
  "./css/components.css",
  "./css/style.css",
  "./js/main.js",
  "./js/api.js",
  "./js/ui.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./fonde.csv",
  "./prices.json",
  "./data/purchase-prices.js"
];

async function safeCacheAll(cache, assets) {
  await Promise.allSettled(
    assets.map(async (url) => {
      try { await cache.add(url); } catch (e) { /* ignore */ }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await safeCacheAll(cache, CORE_ASSETS);
    })()
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

  if (url.origin !== location.origin) return;

  const path = url.pathname;

  // Data: altid frisk
  if (path.endsWith("/prices.json") || path.endsWith("/fonde.csv")) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // App-filer: network-first så du slipper for “gammel version”
  if (path.endsWith(".html") || path.endsWith(".css") || path.endsWith(".js") || path.endsWith("manifest.json")) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});
