// =========================================================
// AFSNIT 01 – IMPORTS
// =========================================================
import fs from "fs";
import path from "path";

// =========================================================
// AFSNIT 02 – HJÆLPEFUNKTIONER
// =========================================================
function nowIsoUtc() {
  return new Date().toISOString();
}

function yyyyMmDdFromDate(date) {
  return date.toISOString().split("T")[0];
}

function withDailyPoint(history = [], date, price) {
  const clean = Array.isArray(history) ? history : [];

  // Undgå dublet samme dag
  if (clean.length && clean[clean.length - 1].date === date) {
    return clean;
  }

  // Kun 10 seneste punkter
  return [
    ...clean,
    { date, price }
  ].slice(-10);
}

// =========================================================
// AFSNIT 03 – STIER (VIGTIGT)
// Gem til /data/prices.json + en failsafe kopi i roden
// =========================================================
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "prices.json");
const ROOT_FALLBACK_FILE = path.join(ROOT, "prices.json");

// Sikr at /data findes
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// =========================================================
// AFSNIT 04 – LÆS EKSISTERENDE DATA
// (Prøver først /data/prices.json, ellers roden)
// =========================================================
let previous = { updatedAt: null, items: [] };

function tryReadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

const prevFromData = tryReadJson(DATA_FILE);
const prevFromRoot = tryReadJson(ROOT_FALLBACK_FILE);
previous = prevFromData || prevFromRoot || previous;

// =========================================================
// AFSNIT 05 – DINE FONDE (MANUELLE PRISER LIGE NU)
// Næste step bliver at hente automatisk (flere kilder),
// men først får vi workflow helt stabilt igen.
// =========================================================
const FUNDS = [
  {
    name: "Nordea Empower Europe Fund BQ",
    isin: "LU3076185670",
    currency: "EUR",
    price: 111.92
  },
  {
    name: "Nordea Invest Europe Enhanced KL 1",
    isin: "DK0060949964",
    currency: "DKK",
    price: 146.22
  },
  {
    name: "Nordea Invest Global Enhanced KL 1",
    isin: "DK0060949881",
    currency: "DKK",
    price: 209.53
  }
];

// =========================================================
// AFSNIT 06 – OPBYG NY PRICES.JSON (MED 10 HISTORIKPUNKTER)
// =========================================================
const today = new Date();
const todayIso = yyyyMmDdFromDate(today);
const nowIso = nowIsoUtc();

const items = [];
let maxUpdatedAt = previous.updatedAt || null;

function findPrev(isin) {
  return previous.items?.find(i => i.isin === isin) || null;
}

for (const fund of FUNDS) {
  const prevItem = findPrev(fund.isin);

  // Brug nuværende tidspunkt som updatedAt (vi henter jo “nu”)
  const updatedAt = nowIso;

  const history = withDailyPoint(
    prevItem?.history || [],
    todayIso,
    Number(fund.price)
  );

  items.push({
    name: fund.name,
    isin: fund.isin,
    currency: fund.currency,
    price: Number(fund.price),
    updatedAt,
    source: "manual",
    history
  });

  if (!maxUpdatedAt || updatedAt > maxUpdatedAt) {
    maxUpdatedAt = updatedAt;
  }
}

// =========================================================
// AFSNIT 07 – GEM FIL
// =========================================================
const output = {
  updatedAt: maxUpdatedAt,
  source: "github-action",
  items
};

// Gem til /data/prices.json (primær)
fs.writeFileSync(DATA_FILE, JSON.stringify(output, null, 2));

// Gem også en kopi i roden (failsafe)
fs.writeFileSync(ROOT_FALLBACK_FILE, JSON.stringify(output, null, 2));

console.log("✅ prices.json opdateret korrekt:", DATA_FILE);
console.log("✅ fallback copy:", ROOT_FALLBACK_FILE);
