/* =========================================================
   scripts/fetch_prices.mjs
   Henter seneste fondskurser til aktie-app
   Gemmer 10 seneste punkter pr. fond i data/prices.json
   Node 20+ / GitHub Actions

   AFSNIT-OPDELING:
   - Ingen Yahoo
   - Ingen browser-CORS
   - Flere offentlige kilder pr. fond
   - "previous" bruges kun som nødbackup
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
   AFSNIT 03 – HTTP headers
   ========================= */
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
  "Accept-Language": "da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7"
};

/* =========================
   AFSNIT 04 – Dato og tal
   ========================= */
function pad2(n) {
  return String(n).padStart(2, "0");
}

function nowIsoUtc() {
  return new Date().toISOString();
}

function dkDateYYYYMMDD(date = new Date()) {
  const dk = new Date(
    date.toLocaleString("en-US", { timeZone: "Europe/Copenhagen" })
  );

  const y = dk.getFullYear();
  const m = pad2(dk.getMonth() + 1);
  const d = pad2(dk.getDate());

  return `${y}-${m}-${d}`;
}

function asNumber(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatError(e) {
  return String(e?.message || e || "Ukendt fejl");
}

/* =========================
   AFSNIT 05 – HTML tekst
   ========================= */
function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function findNumberNear(text, keywords) {
  const lower = text.toLowerCase();

  for (const keyword of keywords) {
    const idx = lower.indexOf(keyword.toLowerCase());

    if (idx < 0) continue;

    const area = text.slice(idx, idx + 500);

    const match = area.match(/(\d{1,5}(?:[.,]\d{1,6}))/);

    const number = asNumber(match?.[1]);

    if (number) return number;
  }

  return null;
}

function findCurrencyNumber(text, currency) {
  const regex = new RegExp(
    `(\\d{1,5}(?:[.,]\\d{1,6}))\\s*${currency}`,
    "i"
  );

  const match = text.match(regex);
  return asNumber(match?.[1]);
}

/* =========================
   AFSNIT 06 – JSON load/save
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
   AFSNIT 07 – Fetch tekst
   ========================= */
async function fetchText(url) {
  const res = await fetch(url, {
    headers: HEADERS,
    redirect: "follow"
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ved hentning af ${url}`);
  }

  return await res.text();
}

/* =========================
   AFSNIT 08 – Kilde: Financial Times
   ========================= */
async function fetchFromFT(url, expectedCurrency) {
  const html = await fetchText(url);
  const text = stripHtml(html);

  const keywords = [
    "Last price",
    "NAV",
    "Price",
    "Close",
    "Previous close"
  ];

  const nearNumber = findNumberNear(text, keywords);
  const currencyNumber = findCurrencyNumber(text, expectedCurrency);

  const price = nearNumber || currencyNumber;

  if (!price) {
    throw new Error("FT Markets: kunne ikke finde kurs");
  }

  return {
    price,
    currency: expectedCurrency,
    source: "ft-markets",
    marketTimeISO: nowIsoUtc()
  };
}

/* =========================
   AFSNIT 09 – Kilde: FundConnect / FundsNow
   ========================= */
async function fetchFromFundConnect(url, expectedCurrency) {
  const html = await fetchText(url);
  const text = stripHtml(html);

  const keywords = [
    "Indre værdi",
    "NAV",
    "Seneste kurs",
    "Kurs",
    "Price"
  ];

  const nearNumber = findNumberNear(text, keywords);
  const currencyNumber = findCurrencyNumber(text, expectedCurrency);

  const price = nearNumber || currencyNumber;

  if (!price) {
    throw new Error("FundConnect: kunne ikke finde kurs");
  }

  return {
    price,
    currency: expectedCurrency,
    source: "fundconnect",
    marketTimeISO: nowIsoUtc()
  };
}

/* =========================
   AFSNIT 10 – Kilde: StockEvents
   ========================= */
async function fetchFromStockEvents(url, expectedCurrency) {
  const html = await fetchText(url);
  const text = stripHtml(html);

  const price =
    findCurrencyNumber(text, expectedCurrency === "EUR" ? "EUR" : "DKK") ||
    findNumberNear(text, ["current price", "price", "stock price"]);

  if (!price) {
    throw new Error("StockEvents: kunne ikke finde kurs");
  }

  return {
    price,
    currency: expectedCurrency,
    source: "stockevents",
    marketTimeISO: nowIsoUtc()
  };
}

/* =========================
   AFSNIT 11 – Fonde
   ========================= */
const FUNDS = [
  {
    name: "Nordea Empower Europe Fund BQ",
    isin: "LU3076185670",
    currency: "EUR",
    sources: [
      {
        type: "fundconnect",
        url:
          "https://fundsnow.os.fundconnect.com/solutions/default/fundinfo?clientID=DKNB&currency=EUR&isin=LU3076185670&language=da-DK&shelves=DKNB"
      },
      {
        type: "stockevents",
        url: "https://stockevents.app/en/stock/LU3076185670.FUND"
      }
    ]
  },
  {
    name: "Nordea Invest Europe Enhanced KL 1",
    isin: "DK0060949964",
    currency: "DKK",
    sources: [
      {
        type: "ft",
        url:
          "https://markets.ft.com/data/funds/tearsheet/summary?s=DK0060949964:DKK"
      },
      {
        type: "fundconnect",
        url:
          "https://fundsnow.os.fundconnect.com/solutions/default/fundinfo?clientID=DKNB&currency=DKK&isin=DK0060949964&language=da-DK&shelves=DKNB"
      }
    ]
  },
  {
    name: "Nordea Invest Global Enhanced KL 1",
    isin: "DK0060949881",
    currency: "DKK",
    sources: [
      {
        type: "ft",
        url:
          "https://markets.ft.com/data/funds/tearsheet/summary?s=DK0060949881:DKK"
      },
      {
        type: "fundconnect",
        url:
          "https://fundsnow.os.fundconnect.com/solutions/default/fundinfo?clientID=DKNB&currency=DKK&isin=DK0060949881&language=da-DK&shelves=DKNB"
      }
    ]
  }
];

/* =========================
   AFSNIT 12 – Hent kurs pr. kilde
   ========================= */
async function fetchFromSource(source, fund) {
  if (source.type === "ft") {
    return await fetchFromFT(source.url, fund.currency);
  }

  if (source.type === "fundconnect") {
    return await fetchFromFundConnect(source.url, fund.currency);
  }

  if (source.type === "stockevents") {
    return await fetchFromStockEvents(source.url, fund.currency);
  }

  throw new Error(`Ukendt kilde: ${source.type}`);
}

async function resolveFundPrice(fund) {
  const attempts = [];

  for (const source of fund.sources || []) {
    try {
      const result = await fetchFromSource(source, fund);

      attempts.push({
        ok: true,
        source: result.source,
        price: result.price,
        currency: result.currency
      });

      return {
        ok: true,
        source: result.source,
        price: result.price,
        currency: result.currency || fund.currency,
        marketTimeISO: result.marketTimeISO || nowIsoUtc(),
        attempts
      };
    } catch (e) {
      attempts.push({
        ok: false,
        source: source.type,
        error: formatError(e)
      });
    }
  }

  return {
    ok: false,
    source: "previous",
    price: null,
    currency: fund.currency,
    marketTimeISO: null,
    attempts
  };
}

/* =========================
   AFSNIT 13 – Historik
   ========================= */
function uniqByDateKeepLast(arr) {
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

function updateHistory(prevHistory, dateYYYYMMDD, price) {
  const finalPrice = asNumber(price);

  if (!finalPrice) {
    return keepLastN(uniqByDateKeepLast(prevHistory || []), 10);
  }

  const base = Array.isArray(prevHistory) ? prevHistory : [];

  const next = uniqByDateKeepLast([
    ...base,
    {
      date: dateYYYYMMDD,
      price: finalPrice
    }
  ]);

  return keepLastN(next, 10);
}

/* =========================
   AFSNIT 14 – Main
   ========================= */
async function main() {
  const prev = await readJsonSafe(PRICES_PATH, {
    updatedAt: null,
    source: null,
    items: []
  });

  const prevItems = Array.isArray(prev?.items) ? prev.items : [];

  const prevByIsin = new Map(
    prevItems.filter((x) => x?.isin).map((x) => [x.isin, x])
  );

  const today = dkDateYYYYMMDD(new Date());
  const results = [];

  let maxMarketTimeISO = null;

  for (const fund of FUNDS) {
    const resolved = await resolveFundPrice(fund);
    const prevItem = prevByIsin.get(fund.isin) || null;
    const fallbackPrice = asNumber(prevItem?.price);

    const finalPrice = resolved.ok ? resolved.price : fallbackPrice;
    const finalCurrency = resolved.currency || fund.currency;
    const mt = resolved.marketTimeISO || prevItem?.updatedAt || nowIsoUtc();

    if (mt && (!maxMarketTimeISO || mt > maxMarketTimeISO)) {
      maxMarketTimeISO = mt;
    }

    const nextHistory = updateHistory(prevItem?.history, today, finalPrice);

    results.push({
      name: fund.name,
      isin: fund.isin,
      currency: finalCurrency,
      price: finalPrice,
      updatedAt: mt,
      source: resolved.ok ? resolved.source : "previous",
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
