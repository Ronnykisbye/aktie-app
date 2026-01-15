// --- Aktie-App Service Worker v3.0 ---
// Formaal: offline-stoette til statiske filer.

const CACHE_NAME = "aktie-app-cache-v3";

const URLS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./fonde.csv",
  "./data/prices.json",

  // Icons
  "./icon-192.png",
  "./icon-512.png",

  // CSS
  "./css/colors.css",
  "./css/layout.css",
  "./css/components.css",

  // JS
  "./js/config.js",
  "./js/api.js",
  "./js/ui.js",
  "./js/main.js",
];

// Installer og cache filer
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE)));
  self.skipWaiting();
});

// Aktivér – fjern gamle caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))))
  );
  self.clients.claim();
});

// Fetch – netværk først, ellers cache
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
