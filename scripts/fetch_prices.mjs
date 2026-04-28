/* =========================================================
   scripts/fetch_prices.mjs
   STABIL VERSION MED INTRADAY HISTORIK
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

/* =========================
   AFSNIT 01 – Tid (DK med klokkeslæt)
   ========================= */
function nowDK() {
  const dk = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Copenhagen" })
  );

  const y = dk.getFullYear();
  const m = String(dk.getMonth() + 1).padStart(2, "0");
  const d = String(dk.getDate()).padStart(2, "0");

  const h = String(dk.getHours()).padStart(2, "0");
  const min = String(dk.getMinutes()).padStart(2, "0");

  return `${y}-${m}-${d} ${h}:${min}`;
}

function nowIso() {
  return new Date().toISOString();
}

/* =========================
   AFSNIT 02 – Helpers
   ========================= */
function toNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/* =========================
   AFSNIT 03 – Validering
   ========================= */
function isValidPrice(fund, price) {
  const n = toNumber(price);
  if (!n) return false;
  if (n < fund.min) return false;
  if (n > fund.max) return false;
  return true;
}

/* =========================
   AFSNIT 04 – HISTORIK (INTRADAY)
   ========================= */
function addHistoryPoint(history, timestamp, price) {
  const clean = Array.isArray(history)
    ? history.filter((p) => p?.date && Number.isFinite(Number(p?.price)))
    : [];

  clean.push({
    date: timestamp,
    price
  });

  // behold sidste 50 punkter
  return clean.slice(-50);
}

/* =========================
   AFSNIT 05 – MAIN
   ========================= */
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

  const timestamp = nowDK();
  const updatedAt = nowIso();

  const results = [];

  for (const fund of FUNDS) {
    const manualItem = manualByIsin.get(fund.isin);
    const previousItem = previousByIsin.get(fund.isin);

    const manualPrice = toNumber(manualItem?.price);
    const previousPrice = toNumber(previousItem?.price);

    let finalPrice;
    let source;

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

    const history = addHistoryPoint(
      previousItem?.history,
      timestamp,
      finalPrice
    );

    results.push({
      name: fund.name,
      isin: fund.isin,
      currency: fund.currency,
      price: finalPrice,
      updatedAt,
      source,
      history
    });
  }

  const out = {
    updatedAt,
    source: "manual-intraday",
    items: results
  };

  await writeJson(PRICES_PATH, out);

  console.log("✅ Intraday historik OK");
}

main().catch((error) => {
  console.error("❌ fejl:", error);
  process.exit(1);
});
