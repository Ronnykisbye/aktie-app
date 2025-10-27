// --- Aktie-App Service Worker v2.0 ---
const CACHE_NAME = "aktie-app-cache-v2";
const URLS_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./fonde.csv",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Installer og cache filer
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
  );
  self.skipWaiting(); // aktiver straks ny SW
});

// Aktivér – fjern gamle caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))
    )
  );
  self.clients.claim(); // sørg for at nye tabs bruger den
});

// Fetch – prøv netværk først, ellers cache
self.addEventListener("fetch", event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // opdater cachen i baggrunden
        const resClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return response;
      })
      .catch(() => caches.match(event.request)) // fallback til cache offline
  );
});

// Lyt efter opdateringer (valgfri log)
self.addEventListener("message", event => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
