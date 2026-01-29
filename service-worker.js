const CACHE_NAME = "aktie-app-v2";

// Kun statiske filer må caches
const STATIC_ASSETS = [
  "/aktie-app/",
  "/aktie-app/index.html",
  "/aktie-app/style.css",
  "/aktie-app/main.js",
  "/aktie-app/ui.js",
  "/aktie-app/colors.css",
  "/aktie-app/layout.css",
  "/aktie-app/components.css",
  "/aktie-app/manifest.json",
  "/aktie-app/icon-192.png"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // ❗ ALDRIG cache data-filer
  if (
    url.pathname.includes("prices") ||
    url.pathname.includes("fonde") ||
    url.pathname.endsWith(".json")
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache kun statiske filer
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});
