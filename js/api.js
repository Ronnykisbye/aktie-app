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

// Dansk talformat i CSV kan være "111,92" -> 111.92
function toNumberSmart(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;

  const s = String(v).trim();
  if (!s) return NaN;

  // fjern tusindtals-separatorer (.)
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
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
AFSNIT 04 – CSV parser (uden PapaParse)
- Robust nok til:
  - delimiter: ; eller ,
  - quotes: "..."
  - tomme linjer
*/
function detectDelimiter(headerLine) {
  const semi = (headerLine.match(/;/g) || []).length;
  const comma = (headerLine.match(/,/g) || []).length;
  return semi >= comma ? ";" : ",";
}

function parseCsvLine(line, delim) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // dobbelt quote inde i quoted string => "
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delim) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((s) => String(s).trim());
}

function parseCsv(csvText) {
  const text = String(csvText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (!lines.length) return [];

  const delim = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delim);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delim);
    if (!cols.length) continue;

    const row = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      row[key] = cols[c] ?? "";
    }
    rows.push(row);
  }
  return rows;
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
      buyPrice: toNumberSmart(r.KøbsKurs),
      quantity: toNumberSmart(r.Antal),
      _csvPrice: toNumberSmart(r.Kurs)
    }))
    .filter((h) => h.name);

  // 5.2: Hent prices.json (aktuel kurs + updatedAt)
  let pricesUpdatedAt = nowIso();
  let pricesSource = "csv-only";
  const priceByExactName = new Map();
  const priceByKey = new Map();

  try {
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
    const fallback = priceByKey.get(normKey(h.name));
    const p = exact || fallback;

    // price: brug prices.json hvis muligt, ellers CSV-kurs
    const price = Number.isFinite(p?.price) ? Number(p.price) : h._csvPrice;

    // currency: brug prices.json currency hvis findes, ellers CSV currency
    const currency = (p?.currency || h.currency || "DKK").toUpperCase();

    return {
      name: h.name,
      currency,
      price,
      buyPrice: h.buyPrice,
      quantity: h.quantity
    };
  });

  return {
    updatedAt: pricesUpdatedAt,
    source: `merged(${pricesSource}+csv)`,
    items: mergedItems
  };
}
