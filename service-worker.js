/* =========================================================
   AFSNIT 01 – Konstanter
========================================================= */
const CACHE_NAME = "aktie-app-static-v2";

const STATIC_FILES = [
  "/",
  "/index.html",
  "/style.css",
  "/main.js",
  "/ui.js",
  "/manifest.json"
];

/* =========================================================
   AFSNIT 02 – Install
========================================================= */
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_FILES))
  );
});

/* =========================================================
   AFSNIT 03 – Activate
========================================================= */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(k => k !== CACHE_NAME && caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* =========================================================
   AFSNIT 04 – Fetch
   ⚠️ VIGTIGT:
   – HTML/CSS/JS = cache
   – JSON/prices = ALTID NETVÆRK
========================================================= */
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 🔥 ALDRIG cache priser
  if (url.pathname.includes("prices")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Standard cache-first for resten
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    })
  );
});
