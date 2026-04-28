/* =========================================================
   scripts/fetch_prices.mjs
   STABIL MANUEL VERSION MED ISIN
   - Ingen scraping
   - Ingen forkerte 0-kurser
   - Matcher på ISIN
   - Bevarer historik
   ========================================================= */

import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");

const PRICES_PATH = path.join(DATA_DIR, "prices.json");
const MANUAL_PATH = path.join(DATA_DIR, "manual-prices.json");

const FUNDS = [
  {
    isin: "LU3076185670",
    name: "Nordea Empower Europe Fund BQ",
    currency: "EUR",
    fallbackPrice: 116.01,
    min: 50,
    max: 300
  },
  {
    isin: "DK0060949964",
    name: "Nordea Invest Europe Enhanced KL 1",
    currency: "DKK",
    fallbackPrice: 141.88,
    min: 50,
    max: 300
  },
  {
    isin: "DK0060949881",
    name: "Nordea Invest Global Enhanced KL 1",
    currency: "DKK",
    fallbackPrice: 213.49,
    min: 100,
    max: 400
  }
];

function todayDK() {
  const dk = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Copenhagen" })
  );

  const y = dk.getFullYear();
  const m = String(dk.getMonth() + 1).padStart(2, "0");
  const d = String(dk.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value) {
  if (value === null || value === undefined) return null;

  const n = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function readJson(filePath, fallback) {
  try {
    const txt = await fs.readFile(filePath, "utf-8");
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function isValidPrice(fund, price) {
  const n = toNumber(price);

  if (!n) return false;
  if (n < fund.min) return false;
  if (n > fund.max) return false;

  return true;
}

function upsertToday(history, date, price) {
  const clean = Array.isArray(history)
    ? history.filter((p) => p?.date && Number.isFinite(Number(p?.price)))
    : [];

  const withoutToday = clean.filter((p) => p.date !== date);

  withoutToday.push({
    date,
    price
  });

  return withoutToday
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);
}

async function main() {
  const manual = await readJson(MANUAL_PATH, { items: [] });
  const previous = await readJson(PRICES_PATH, { items: [] });

  const manualByIsin = new Map(
    (manual.items || [])
      .filter((x) => x?.isin)
      .map((x) => [String(x.isin).trim(), x])
  );

  const previousByIsin = new Map(
    (previous.items || [])
      .filter((x) => x?.isin)
      .map((x) => [String(x.isin).trim(), x])
  );

  const date = todayDK();
  const updatedAt = nowIso();

  const results = [];

  for (const fund of FUNDS) {
    const manualItem = manualByIsin.get(fund.isin);
    const previousItem = previousByIsin.get(fund.isin);

    const manualPrice = toNumber(manualItem?.price);
    const previousPrice = toNumber(previousItem?.price);

    let finalPrice = null;
    let source = "";

    if (isValidPrice(fund, manualPrice)) {
      finalPrice = manualPrice;
      source = "manual";
    } else if (isValidPrice(fund, previousPrice)) {
      finalPrice = previousPrice;
      source = "previous-safe";
    } else {
      finalPrice = fund.fallbackPrice;
      source = "fallback-safe";
    }

    const history = upsertToday(previousItem?.history, date, finalPrice);

    results.push({
      name: fund.name,
      isin: fund.isin,
      currency: fund.currency,
      price: finalPrice,
      updatedAt,
      source,
      debug: {
        manualPrice,
        previousPrice,
        fallbackPrice: fund.fallbackPrice,
        acceptedRange: `${fund.min}-${fund.max}`
      },
      history
    });
  }

  const out = {
    updatedAt,
    source: "manual-isin-safe",
    items: results
  };

  await writeJson(PRICES_PATH, out);

  console.log("✅ Manual ISIN update OK");
  for (const item of results) {
    console.log("-", item.name, item.price, item.currency, item.source);
  }
}

main().catch((error) => {
  console.error("❌ fetch_prices.mjs failed:", error);
  process.exit(1);
});
