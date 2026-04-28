/* =========================================================
   scripts/fetch_prices.mjs
   STABIL VERSION (KVALITETSSIKRET)
   - Ingen tilfældige tal
   - Validering af kurs
   - Fallback til sidste kendte værdi
   ========================================================= */

import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const PRICES_PATH = path.join(DATA_DIR, "prices.json");

/* =========================
   AFSNIT 01 – Helpers
   ========================= */
function nowIsoUtc() {
  return new Date().toISOString();
}

function asNumber(value) {
  if (!value) return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP fejl");
  return res.text();
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

/* =========================
   AFSNIT 02 – VALIDERING
   ========================= */
function isValidPrice(name, price) {
  if (!price) return false;

  if (name.includes("Empower")) return price > 50 && price < 300;
  if (name.includes("Europe Enhanced")) return price > 50 && price < 300;
  if (name.includes("Global Enhanced")) return price > 100 && price < 400;

  return false;
}

/* =========================
   AFSNIT 03 – KILDER
   ========================= */
async function fetchFromFT(url) {
  const html = await fetchText(url);
  const text = stripHtml(html);

  // Kig efter NAV / Price først
  const match =
    text.match(/NAV\s+(\d{1,5}(?:[.,]\d+)?)/i) ||
    text.match(/Price\s+(\d{1,5}(?:[.,]\d+)?)/i);

  if (!match) throw new Error("Ingen kurs fundet");

  const price = asNumber(match[1]);

  if (!price) throw new Error("Ugyldig kurs");

  return price;
}

/* =========================
   AFSNIT 04 – FONDE
   ========================= */
const FUNDS = [
  {
    name: "Nordea Empower Europe Fund BQ",
    isin: "LU3076185670",
    currency: "EUR",
    url: "https://markets.ft.com/data/funds/tearsheet/summary?s=LU3076185670"
  },
  {
    name: "Nordea Invest Europe Enhanced KL 1",
    isin: "DK0060949964",
    currency: "DKK",
    url: "https://markets.ft.com/data/funds/tearsheet/summary?s=DK0060949964:DKK"
  },
  {
    name: "Nordea Invest Global Enhanced KL 1",
    isin: "DK0060949881",
    currency: "DKK",
    url: "https://markets.ft.com/data/funds/tearsheet/summary?s=DK0060949881:DKK"
  }
];

/* =========================
   AFSNIT 05 – MAIN
   ========================= */
async function main() {
  const prev = await fs.readFile(PRICES_PATH, "utf-8")
    .then(JSON.parse)
    .catch(() => ({ items: [] }));

  const prevMap = new Map(prev.items.map(i => [i.isin, i]));

  const results = [];

  for (const fund of FUNDS) {
    let price = null;
    let source = "unknown";

    try {
      const fetched = await fetchFromFT(fund.url);

      if (isValidPrice(fund.name, fetched)) {
        price = fetched;
        source = "ft-valid";
      } else {
        throw new Error("Pris udenfor range");
      }

    } catch (e) {
      const fallback = prevMap.get(fund.isin);

      if (fallback?.price) {
        price = fallback.price;
        source = "fallback";
      } else {
        price = null;
        source = "failed";
      }
    }

    results.push({
      name: fund.name,
      isin: fund.isin,
      currency: fund.currency,
      price,
      updatedAt: nowIsoUtc(),
      source,
      history: [
        {
          date: new Date().toISOString().slice(0, 10),
          price
        }
      ]
    });
  }

  const out = {
    updatedAt: nowIsoUtc(),
    source: "github-action",
    items: results
  };

  await fs.writeFile(PRICES_PATH, JSON.stringify(out, null, 2));

  console.log("✅ Stabil version kørt");
}

main();
