import fs from "fs";
import path from "path";

// ==========================
// Hjælpefunktioner
// ==========================
function nowIsoUtc() {
  return new Date().toISOString();
}

function yyyyMmDdFromDate(date) {
  return date.toISOString().split("T")[0];
}

function withDailyPoint(history = [], date, price) {
  const clean = Array.isArray(history) ? history : [];

  // undgå dublet samme dag
  if (clean.length && clean[clean.length - 1].date === date) {
    return clean;
  }

  return [
    ...clean,
    {
      date,
      price
    }
  ].slice(-10); // kun 10 seneste
}

// ==========================
// Stier
// ==========================
const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, "prices.json");

// ==========================
// Læs eksisterende data
// ==========================
let previous = {
  updatedAt: null,
  items: []
};

if (fs.existsSync(DATA_FILE)) {
  try {
    previous = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (err) {
    console.warn("Kunne ikke læse tidligere data – starter forfra");
  }
}

// ==========================
// DINE FONDE (manuelt defineret)
// ==========================
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

// ==========================
// Opbyg ny fil
// ==========================
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

  const updatedAt = prevItem?.updatedAt || nowIso;

  const history = withDailyPoint(
    prevItem?.history || [],
    todayIso,
    Number(fund.price)
  );

  items.push({
    name: fund.name,
    isin: fund.isin,
    currency: fund.currency,
    price: fund.price,
    updatedAt,
    source: "manual",
    history
  });

  if (!maxUpdatedAt || updatedAt > maxUpdatedAt) {
    maxUpdatedAt = updatedAt;
  }
}

// ==========================
// Gem fil
// ==========================
const output = {
  updatedAt: maxUpdatedAt,
  items
};

fs.writeFileSync(DATA_FILE, JSON.stringify(output, null, 2));

console.log("✅ prices.json opdateret korrekt");
