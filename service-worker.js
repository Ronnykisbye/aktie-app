/* =========================================================
   AFSNIT 01 – Konstanter
   ========================================================= */
const CACHE_NAME = "aktie-app-v1";

/* =========================================================
   AFSNIT 02 – Install / Activate
   ========================================================= */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/* =========================================================
   AFSNIT 03 – Helpers: Kun cache http/https
   ========================================================= */
function isCacheableRequest(request) {
  try {
    const url = new URL(request.url);

    // Cache API understøtter kun http/https – alt andet skal ignoreres
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;

    // Kun GET giver mening at cache
    if (request.method !== "GET") return false;

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   AFSNIT 04 – Fetch: cache-first for egne assets, network fallback
   (men IGNORER chrome-extension:// osv.)
   ========================================================= */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Vigtigt: hvis det ikke er cachebart, så lad browseren håndtere det normalt
  if (!isCacheableRequest(req)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      const cached = await cache.match(req);
      if (cached) return cached;

      const fresh = await fetch(req);

      // Kun cache OK-svar
      if (fresh && fresh.ok) {
        try {
          await cache.put(req, fresh.clone());
        } catch (e) {
          // ekstra sikkerhed: ingen crash pga cache.put
          console.warn("Cache put fejlede:", e);
        }
      }

      return fresh;
    })()
  );
});
