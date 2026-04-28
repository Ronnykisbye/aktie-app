/* =========================================================
   scripts/fetch_prices.mjs
   REN HISTORIK VERSION
   - Starter historik FRA NU (ingen gamle "previous" data)
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
   AFSNIT 03 – RESET DATO
   ========================= */
const RESET_HISTORY_BEFORE = "2026-04-28";

/* =========================
   AFSNIT 04 – Helpers
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

  return `${dk.getFullYear()}-${pad2(dk.getMonth() + 1)}-${pad2(dk.getDate())}`;
}

function asNumber(value) {
  if (value === null || value === undefined) return null;

  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/* =========================
   AFSNIT 05 – HTTP
   ========================= */
const HEADERS = {
  "User-Agent": "Mozilla/5.0",
};

async function fetchText(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function findNumber(text) {
  const m = text.match(/(\d{1,5}(?:[.,]\d{1,6}))/);
  return m ? asNumber(m[1]) : null;
}

/* =========================
   AFSNIT 06 – DATAKILDER
   ========================= */
async function fetchFromFT(url) {
  const html = await fetchText(url);
  const text = stripHtml(html);
  const price = findNumber(text);

  if (!price) throw new Error("FT fejl");

  return {
    price,
    source: "ft-markets",
    marketTimeISO: nowIsoUtc()
  };
}

/* =========================
   AFSNIT 07 – FONDE
   ========================= */
const FUNDS = [
  {
    name: "Nordea Invest Europe Enhanced KL 1",
    isin: "DK0060949964",
    url: "https://markets.ft.com/data/funds/tearsheet/summary?s=DK0060949964:DKK"
  },
  {
    name: "Nordea Invest Global Enhanced KL 1",
    isin: "DK0060949881",
    url: "https://markets.ft.com/data/funds/tearsheet/summary?s=DK0060949881:DKK"
  }
];

/* =========================
   AFSNIT 08 – HISTORIK RESET
   ========================= */
function resetHistoryIfNeeded(history) {
  if (!Array.isArray(history)) return [];

  return history.filter(h => h.date >= RESET_HISTORY_BEFORE);
}

/* =========================
   AFSNIT 09 – MAIN
   ========================= */
async function main() {
  const prev = await fs.readFile(PRICES_PATH, "utf-8")
    .then(JSON.parse)
    .catch(() => ({ items: [] }));

  const prevMap = new Map(prev.items.map(i => [i.isin, i]));

  const today = dkDateYYYYMMDD();
  const results = [];

  for (const fund of FUNDS) {
    const data = await fetchFromFT(fund.url);

    const prevItem = prevMap.get(fund.isin);

    const history = resetHistoryIfNeeded(prevItem?.history);

    history.push({
      date: today,
      price: data.price
    });

    results.push({
      name: fund.name,
      isin: fund.isin,
      price: data.price,
      currency: "DKK",
      updatedAt: data.marketTimeISO,
      source: data.source,
      history
    });
  }

  const out = {
    updatedAt: nowIsoUtc(),
    source: "github-action",
    items: results
  };

  await fs.writeFile(PRICES_PATH, JSON.stringify(out, null, 2));

  console.log("✅ Historik nulstillet og opdateret");
}

main();
