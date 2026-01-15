/*
AFSNIT 01 – Imports
*/
import { PRICES_JSON_PATH, CSV_PATH, FX_URL, FX_CACHE_KEY } from "./config.js";

/*
AFSNIT 02 – Helpers
*/
const nowIso = () => new Date().toISOString();
const cacheBust = (url) => `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;

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
AFSNIT 04 – Priser
- 1) Forsøg prices.json (hyppig opdatering)
- 2) Fallback til fonde.csv
*/
export async function getLatestHoldingsPrices() {
  // 4.1: Prøv prices.json
  try {
    const prices = await fetchJson(PRICES_JSON_PATH);
    if (prices?.items?.length) return normalizePricesJson(prices);
  } catch (e) {
    console.warn("prices.json ikke tilgængelig - bruger fallback CSV", e);
  }

  // 4.2: Fallback til CSV
  const csvText = await fetchText(CSV_PATH);
  const rows = parseCsv(csvText);
  return {
    updatedAt: nowIso(),
    source: "csv",
    items: rows.map(r => ({
      name: r.Navn,
      currency: String(r.Valuta || "").toUpperCase(),
      price: Number(r.Kurs),
      buyPrice: Number(r.KøbsKurs),
      quantity: Number(r.Antal),
    }))
  };
}

function normalizePricesJson(prices) {
  // Forventet format:
  // { updatedAt: "...", items:[ {name, currency, price, buyPrice, quantity} ] }
  return {
    updatedAt: prices.updatedAt || nowIso(),
    source: prices.source || "prices.json",
    items: prices.items
  };
}

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
