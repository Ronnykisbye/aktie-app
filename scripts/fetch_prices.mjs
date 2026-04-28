/* =========================================================
   scripts/fetch_prices.mjs
   Henter seneste kurser til aktie-app
   Gemmer 10 seneste punkter pr. fond i data/prices.json
   Node 20+ (GitHub Actions)

   VIGTIGT:
   - Denne version bruger flere kilder.
   - "previous" bruges kun som nødbackup.
   - Hele filen er skrevet som fuld erstatning.
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
   AFSNIT 03 – Konstanter
   ========================= */
const STATIC_EUR_TO_DKK = 7.45;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
  "Accept-Language": "da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7"
};

/* =========================
   AFSNIT 04 – Hjælpefunktioner
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
    .replace(/\./g, "")
    .replace(",", ".");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatError(e) {
  return String(e?.message || e || "Ukendt fejl");
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/gi, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function findFirstNumberAfter(text, startText, wordsAfter = 40) {
  const idx = text.toLowerCase().indexOf(startText.toLowerCase());
  if (idx < 0) return null;

  const part = text.slice(idx, idx + wordsAfter * 25);
  const match = part.match(/(\d{1,4}(?:[.,]\d{1,6}))/);

  return match ? asNumber(match[1]) : null;
}

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

/* =========================
   AFSNIT 05 – JSON Load/Save
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
   AFSNIT 06 – HTTP Fetch
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
   AFSNIT 07 – Datakilder
   ========================= */
async function fetchNordeaInvestTodayRate(fundName) {
  const url = "https://www.nordeafunds.com/da/investorinformation/dagens-kurser";
  const html = await fetchText(url);
  const text = stripHtml(html);

  const idx = text.toLowerCase().indexOf(fundName.toLowerCase());
  if (idx < 0) {
    throw new Error(`Nordea dagens kurser: fandt ikke "${fundName}"`);
  }

  const area = text.slice(idx, idx + 600);

  const innerValueMatch = area.match(/Indre værdi\s+(\d{1,4}(?:[.,]\d{1,6}))/i);
  const sellMatch = area.match(/Salgskurs\s+(\d{1,4}(?:[.,]\d{1,6}))/i);
  const buyMatch = area.match(/Købskurs\s+(\d{1,4}(?:[.,]\d{1,6}))/i);

  const price =
    asNumber(innerValueMatch?.[1]) ||
    asNumber(sellMatch?.[1]) ||
    asNumber(buyMatch?.[1]);

  if (!price) {
    throw new Error(`Nordea dagens kurser: fandt ingen kurs for "${fundName}"`);
  }

  return {
    price,
    currency: "DKK",
    source: "nordea-dagens-kurser",
    marketTimeISO: nowIsoUtc()
  };
}

async function fetchNordnetRate(url, expectedCurrency) {
  const html = await fetchText(url);
  const text = stripHtml(html);

  const currencyPattern = expectedCurrency === "EUR" ? "EUR" : "DKK";

  const regex = new RegExp(
    `(\\d{1,4}(?:[.,]\\d{1,6}))\\s*${currencyPattern}`,
    "i"
  );

  const match = text.match(regex);
  const price = asNumber(match?.[1]);

  if (!price) {
    throw new Error(`Nordnet: fandt ingen ${currencyPattern}-kurs`);
  }

  return {
    price,
    currency: expectedCurrency,
    source: "nordnet",
    marketTimeISO: nowIsoUtc()
  };
}

async function fetchFinanzenFundRate(url, expectedCurrency) {
  const html = await fetchText(url);
  const text = stripHtml(html);

  const currencyPattern = expectedCurrency === "EUR" ? "EUR" : "DKK";

  const regexes = [
    new RegExp(`bei\\s+(\\d{1,4}(?:[.,]\\d{1,6}))\\s+${currencyPattern}`, "i"),
    new RegExp(`(\\d{1,4}(?:[.,]\\d{1,6}))\\s+${currencyPattern}`, "i")
  ];

  for (const regex of regexes) {
    const match = text.match(regex);
    const price = asNumber(match?.[1]);

    if (price) {
      return {
        price,
        currency: expectedCurrency,
        source: "finanzen",
        marketTimeISO: nowIsoUtc()
      };
    }
  }

  throw new Error(`Finanzen: fandt ingen ${currencyPattern}-kurs`);
}

/* =========================
   AFSNIT 08 – Fund definitions
   ========================= */
const FUNDS = [
  {
    name: "Nordea Empower Europe Fund BQ",
    isin: "LU3076185670",
    currency: "EUR",
    sources: [
      {
        type: "finanzen",
        url: "https://www.finanzen.net/fonds/nordea-1-empower-europe-bq-lu3076185670"
      }
    ]
  },
  {
    name: "Nordea Invest Europe Enhanced KL 1",
    isin: "DK0060949964",
    currency: "DKK",
    sources: [
      {
        type: "nordea-today",
        fundName: "Europe Enhanced KL 1"
      },
      {
        type: "nordnet",
        url: "https://www.nordnet.dk/investeringsforeninger/liste/nordea-invest-europe-enhanced-ndieuenhkl1-xcse"
      }
    ]
  },
  {
    name: "Nordea Invest Global Enhanced KL 1",
    isin: "DK0060949881",
    currency: "DKK",
    sources: [
      {
        type: "nordea-today",
        fundName: "Global Enhanced KL 1"
      },
      {
        type: "nordnet",
        url: "https://www.nordnet.dk/investeringsforeninger/liste/nordea-invest-global-enhanced-ndiglenhkl1-xcse"
      }
    ]
  }
];

/* =========================
   AFSNIT 09 – Kursopslag
   ========================= */
async function fetchFromSource(source, fund) {
  if (source.type === "nordea-today") {
    return await fetchNordeaInvestTodayRate(source.fundName);
  }

  if (source.type === "nordnet") {
    return await fetchNordnetRate(source.url, fund.currency);
  }

  if (source.type === "finanzen") {
    return await fetchFinanzenFundRate(source.url, fund.currency);
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
   AFSNIT 10 – Historik
   ========================= */
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
   AFSNIT 11 – Main
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
    eurToDkk: STATIC_EUR_TO_DKK,
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
