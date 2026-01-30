/* =========================================================
   service-worker.js
   Formål:
   - Cache PWA-filer
   - Network-first for data/prices.json (så “Opdater” får friske tal)
   - Cache-version bump ved ændringer (så CSS/JS ikke hænger fast)
   ========================================================= */

const CACHE_NAME = "aktie-app-v3"; // <- BUMP version når vi ændrer CSS/JS

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./css/colors.css",
  "./css/components.css",
  "./css/style.css",
  "./js/main.js",
  "./js/api.js",
  "./js/ui.js",
  "./data/prices.json",
  "./data/fonde.csv",
  "./manifest.webmanifest"
].map((p) => p.replace(/^\.\/\//, "./"));

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

  // Network-first for priser (så “Opdater” får det nyeste)
  if (url.pathname.endsWith("/data/prices.json")) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Default: cache-first for resten
  event.respondWith(cacheFirst(event.request));
});
