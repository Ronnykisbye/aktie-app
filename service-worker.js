// --- Aktie-App Service Worker v1.0 ---
const CACHE_NAME = "aktie-app-cache-v1";
const URLS_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./fonde.csv",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Installer SW og gem filer lokalt
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
});

// Aktiver – fjern gamle caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))
    )
  );
});

// Hent filer – brug cache først
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response =>
      response || fetch(event.request)
    )
  );
});
