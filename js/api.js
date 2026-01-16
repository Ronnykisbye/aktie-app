/*
AFSNIT 01 – Imports
*/
import { PRICES_JSON_PATH, CSV_PATH, FX_URL, FX_CACHE_KEY } from "./config.js";

/*
AFSNIT 02 – Helpers (tid/cache/fetch)
*/
const nowIso = () => new Date().toISOString();

// Cache-busting: tving altid frisk download af JSON/CSV
function cacheBust(url) {
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

async function fetchJson(url) {
  const res = await fetch(cacheBust(url), { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(cacheBust(url), { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function normName(s) {
  return String(s || "").trim();
}
function normKey(s) {
  // fallback-match (case-insensitive)
  return String(s || "").trim().toLowerCase();
}

/*
AFSNIT 03 – FX (EUR->DKK) med cache
*/
export async function getEURDKK() {
  try {
    const cached = JSON.parse(localStorage.getItem(FX_CACHE_KEY) || "null");
    if (cached?.rate) {
      // opdater i baggrunden
      refreshFXInBackground(cached.rate).catch(() => {});
      return cached.rate;
    }
    const rate = await fetchFXRate();
    saveFXRate(rate);
    return rate;
  } catch {
    return 7.46; // sikker fallback
  }
}

async function refreshFXInBackground(current) {
  const next = await fetchFXRate();
  if (Math.abs(next - current) >= 0.0001) saveFXRate(next);
}

async function fetchFXRate() {
  const data = await fetchJson(FX_URL);
  const rate = data?.rates?.DKK;
  if (!rate) throw new Error("Ingen DKK rate i FX svar");
  return rate;
}

function saveFXRate(rate) {
  localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ rate, iso: nowIso() }));
}

/*
AFSNIT 04 – CSV parser (holdings)
*/
function parseCsv(csvText) {
  // PapaParse er loaded via CDN i index.html
  if (typeof Papa === "undefined") throw new Error("PapaParse mangler");
  const parsed = Papa.parse(csvText, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true
  });
  return parsed.data || [];
}

/*
AFSNIT 05 – Merge: fonde.csv (antal/købskurs) + prices.json (aktuel kurs/updatedAt)
Return-format:
{
  updatedAt: "...",
  source: "merged(...)",
  items: [
    { name, currency, price, buyPrice, quantity }
  ]
}
*/
export async function getLatestHoldingsPrices() {
  // 5.1: Hent holdings fra CSV (ALTID – fordi prices.json ikke har antal/købskurs)
  const csvText = await fetchText(CSV_PATH);
  const rows = parseCsv(csvText);

  // Holdings-liste i stabilt format (CSV styrer quantity/buyPrice)
  const holdings = rows
    .map((r) => ({
      name: normName(r.Navn),
      currency: String(r.Valuta || "DKK").toUpperCase(),
      buyPrice: Number(r.KøbsKurs),
      quantity: Number(r.Antal),
      _csvPrice: Number(r.Kurs)
    }))
    .filter((h) => h.name);

  // 5.2: Hent prices.json (aktuel kurs + updatedAt)
  let pricesUpdatedAt = nowIso();
  let pricesSource = "csv-only";
  const priceByExactName = new Map();
  const priceByKey = new Map();

  try {
    // VIGTIGT: fetchJson bruger cacheBust => altid frisk
    const prices = await fetchJson(PRICES_JSON_PATH);

    pricesUpdatedAt = prices?.updatedAt || pricesUpdatedAt;
    pricesSource = prices?.source || "prices.json";

    const items = Array.isArray(prices?.items) ? prices.items : [];
    for (const it of items) {
      const n = normName(it?.name);
      if (!n) continue;

      const obj = {
        name: n,
        currency: String(it?.currency || "DKK").toUpperCase(),
        price: Number(it?.price)
      };

      // 1) præcis match først
      priceByExactName.set(n, obj);
      // 2) fallback match (case-insensitive)
      priceByKey.set(normKey(n), obj);
    }
  } catch (e) {
    console.warn("prices.json ikke tilgængelig – bruger kun CSV data", e);
  }

  // 5.3: Merge pr. holding (holdings definerer porteføljen)
  const mergedItems = holdings.map((h) => {
    const exact = priceByExactName.get(h.name);
    const fuzzy = priceByKey.get(normKey(h.name));
    const p = exact || fuzzy || null;

    const currentPrice = p ? p.price : h._csvPrice;
    const currentCurrency = p ? p.currency : h.currency;

    // buyPrice/quantity kommer ALTID fra CSV (ikke fra prices.json)
    return {
      name: h.name,
      currency: currentCurrency,
      price: Number(currentPrice),
      buyPrice: Number(h.buyPrice),
      quantity: Number(h.quantity)
    };
  });

  return {
    updatedAt: pricesUpdatedAt,
    source: `merged(${pricesSource}+fonde.csv)`,
    items: mergedItems
  };
}
