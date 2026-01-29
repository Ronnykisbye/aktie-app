/* =========================================================
   scripts/fetch_prices.mjs
   Henter seneste kurser (multi-source via Yahoo symbols)
   Gemmer 10 seneste punkter pr fond i data/prices.json
   Node 20+ (GitHub Actions)
   ========================================================= */

/* =========================
   AFSNIT 01 – Imports
   ========================= */
import fs from "fs/promises";
import path from "path";

/* =========================
   AFSNIT 02 – Paths
   ========================= */
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const PRICES_PATH = path.join(DATA_DIR, "prices.json");

/* =========================
   AFSNIT 03 – Helpers (dato/tid)
   ========================= */
function pad2(n) {
  return String(n).padStart(2, "0");
}

function nowIsoUtc() {
  return new Date().toISOString();
}

// Dagsdato i DK (lokal dato), så “10 seneste” bliver pr dag
function dkDateYYYYMMDD(date = new Date()) {
  const dk = new Date(
    date.toLocaleString("en-US", { timeZone: "Europe/Copenhagen" })
  );
  const y = dk.getFullYear();
  const m = pad2(dk.getMonth() + 1);
  const d = pad2(dk.getDate());
  return `${y}-${m}-${d}`;
}

function asNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function uniqByDateKeepLast(arr) {
  // hvis samme dato findes flere gange, behold den sidste
  const map = new Map();
  for (const p of arr || []) {
    if (!p?.date) continue;
    map.set(p.date, p);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function keepLastN(arr, n = 10) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(Math.max(0, arr.length - n));
}

/* =========================
   AFSNIT 04 – Load/Save JSON
   ========================= */
async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonSafe(filePath, fallback) {
  try {
    const txt = await fs.readFile(filePath, "utf-8");
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

async function writeJsonPretty(filePath, obj) {
  await ensureDir(path.dirname(filePath));
  const txt = JSON.stringify(obj, null, 2) + "\n";
  await fs.writeFile(filePath, txt, "utf-8");
}

/* =========================
   AFSNIT 05 – Yahoo fetch (quote)
   ========================= */
// Yahoo endpoint uden API key
// https://query1.finance.yahoo.com/v7/finance/quote?symbols=SYMBOL
async function fetchYahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
    symbol
  )}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Aktie-App/1.0)"
    }
  });

  if (!res.ok) {
    throw new Error(`Yahoo HTTP ${res.status} for ${symbol}`);
  }

  const data = await res.json();
  const result = data?.quoteResponse?.result?.[0];
  if (!result) {
    throw new Error(`Yahoo: no result for ${symbol}`);
  }

  const price = asNumber(result.regularMarketPrice ?? result.postMarketPrice);
  const currency = result.currency || null;

  // regularMarketTime er epoch-sekunder
  const marketTimeSec = asNumber(result.regularMarketTime);
  const marketTimeISO =
    marketTimeSec ? new Date(marketTimeSec * 1000).toISOString() : null;

  if (!price) {
    throw new Error(`Yahoo: missing price for ${symbol}`);
  }

  return {
    symbol,
    price,
    currency,
    marketTimeISO
  };
}

/* =========================
   AFSNIT 06 – Fund definitions
   ========================= */
/**
 * VIGTIGT:
 * - Jeg bruger flere Yahoo-symboler pr fond som fallback.
 * - Hvis et symbol ikke findes, prøver den næste automatisk.
 *
 * Hvis du vil ændre/tilføje symboler:
 * - Find symbolet på Yahoo Finance og indsæt her.
 */
const FUNDS = [
  {
    name: "Nordea Empower Europe Fund BQ",
    isin: "LU3076185670",
    currency: "EUR",
    yahooSymbols: [
      // du har vist disse i dine screenshots
      "LU3076185084:EUR",
      "LU3076185670:EUR"
    ]
  },
  {
    name: "Nordea Invest Europe Enhanced KL 1",
    isin: "DK0060949964",
    currency: "DKK",
    yahooSymbols: [
      // typiske varianter – vi prøver flere:
      "DK0060949964",
      "DK0060949964.CO",
      "0P0000XXXX.F" // placeholder (ignoreres hvis Yahoo ikke kender den)
    ]
  },
  {
    name: "Nordea Invest Global Enhanced KL 1",
    isin: "DK0060949881",
    currency: "DKK",
    yahooSymbols: [
      "DK0060949881",
      "DK0060949881.CO",
      "FI4000261300:EUR" // fallback (hvis DKK ikke findes, får vi i det mindste en reference)
    ]
  }
];

/* =========================
   AFSNIT 07 – Resolve latest price per fund
   ========================= */
async function resolveFundPrice(fund) {
  const attempts = [];

  for (const sym of fund.yahooSymbols || []) {
    // Ignorer tydelige placeholders
    if (!sym || sym.includes("XXXX")) continue;

    try {
      const q = await fetchYahooQuote(sym);
      attempts.push({ ok: true, ...q });
      // Vi accepterer første succes
      return {
        ok: true,
        source: "yahoo",
        symbol: q.symbol,
        price: q.price,
        currency: q.currency || fund.currency,
        marketTimeISO: q.marketTimeISO,
        attempts
      };
    } catch (e) {
      attempts.push({ ok: false, symbol: sym, error: String(e?.message || e) });
    }
  }

  return {
    ok: false,
    source: "yahoo",
    symbol: null,
    price: null,
    currency: fund.currency,
    marketTimeISO: null,
    attempts
  };
}

/* =========================
   AFSNIT 08 – History update (10 seneste)
   ========================= */
function updateHistory(prevHistory, dateYYYYMMDD, price) {
  const base = Array.isArray(prevHistory) ? prevHistory : [];
  const next = uniqByDateKeepLast([
    ...base,
    { date: dateYYYYMMDD, price: Number(price) }
  ]);
  return keepLastN(next, 10);
}

/* =========================
   AFSNIT 09 – Main
   ========================= */
async function main() {
  const prev = await readJsonSafe(PRICES_PATH, {
    updatedAt: null,
    source: null,
    items: []
  });

  const prevItems = Array.isArray(prev?.items) ? prev.items : [];
  const prevByIsin = new Map(
    prevItems
      .filter((x) => x?.isin)
      .map((x) => [x.isin, x])
  );

  const today = dkDateYYYYMMDD(new Date());

  const results = [];
  let maxMarketTimeISO = null;

  for (const fund of FUNDS) {
    const resolved = await resolveFundPrice(fund);

    const prevItem = prevByIsin.get(fund.isin) || null;
    const fallbackPrice = asNumber(prevItem?.price);

    // Hvis Yahoo fejler, behold sidste kendte pris (så appen ikke går i stykker)
    const finalPrice = resolved.ok ? resolved.price : fallbackPrice;

    // Opdater max “seneste handelsdag”
    const mt = resolved.marketTimeISO || prevItem?.updatedAt || null;
    if (mt && (!maxMarketTimeISO || mt > maxMarketTimeISO)) {
      maxMarketTimeISO = mt;
    }

    const nextHistory = updateHistory(prevItem?.history, today, finalPrice);

    results.push({
      name: fund.name,
      isin: fund.isin,
      currency: fund.currency,
      price: finalPrice,
      // gem “seneste markeds-tid” pr fond hvis vi har den
      updatedAt: mt || nowIsoUtc(),
      source: resolved.ok ? `yahoo:${resolved.symbol}` : "previous",
      // debug (kan fjernes senere) – men mega nyttigt til kvalitetssikring
      debug: {
        attempts: resolved.attempts
      },
      history: nextHistory
    });
  }

  const out = {
    updatedAt: maxMarketTimeISO || nowIsoUtc(),
    source: "github-action",
    items: results
  };

  await writeJsonPretty(PRICES_PATH, out);

  console.log("✅ Wrote", PRICES_PATH);
  console.log("updatedAt:", out.updatedAt);
  for (const it of out.items) {
    console.log("-", it.name, it.price, it.currency, it.source);
  }
}

main().catch((e) => {
  console.error("❌ fetch_prices.mjs failed:", e);
  process.exit(1);
});
