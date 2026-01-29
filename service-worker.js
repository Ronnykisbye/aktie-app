/* =========================================================
   AFSNIT 01 – Konstanter
   ========================================================= */
const CACHE_NAME = "aktie-app-v2";

/* =========================================================
   AFSNIT 02 – Install / Activate
   ========================================================= */
self.addEventListener("install", (event) => {
  // Brug den nye SW med det samme
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Slet gamle caches (v1 osv.)
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)));

      // Tag kontrol over klienten
      await self.clients.claim();
    })()
  );
});

/* =========================================================
   AFSNIT 03 – Helpers
   ========================================================= */
function isHttpGet(request) {
  try {
    const url = new URL(request.url);
    return (url.protocol === "http:" || url.protocol === "https:") && request.method === "GET";
  } catch {
    return false;
  }
}

function isDataFile(url) {
  const p = url.pathname.toLowerCase();
  // Data må ALDRIG caches (så Opdater altid får frisk data)
  return p.endsWith(".json") || p.endsWith(".csv") || p.includes("prices");
}

function isAppAsset(url) {
  const p = url.pathname.toLowerCase();
  // App-assets: vi vil helst have dem friske (network-first)
  return p.endsWith(".js") || p.endsWith(".css") || p.endsWith(".html") || p.endsWith("/") || p === "/aktie-app";
}

/* =========================================================
   AFSNIT 04 – Fetch strategi
   - DATA (json/csv/prices): NETWORK ONLY (ingen cache)
   - APP-ASSETS (html/js/css): NETWORK FIRST (cache som fallback)
   - ANDRE: CACHE FIRST (ok til fx ikoner)
   ========================================================= */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (!isHttpGet(req)) return;

  const url = new URL(req.url);

  // 1) DATA: aldrig cache
  if (isDataFile(url)) {
    event.respondWith(fetch(req, { cache: "no-store" }));
    return;
  }

  // 2) APP-ASSETS: network-first (så du får nyeste app uden Ctrl+Shift+R)
  if (isAppAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) {
            try { await cache.put(req, fresh.clone()); } catch {}
          }
          return fresh;
        } catch {
          // Hvis offline/fejl: fallback til cache
          const cached = await cache.match(req);
          if (cached) return cached;
          throw new Error("Offline og ingen cache til asset");
        }
      })()
    );
    return;
  }

  // 3) Resten: cache-first
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;

      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        try { await cache.put(req, fresh.clone()); } catch {}
      }
      return fresh;
    })()
  );
});
