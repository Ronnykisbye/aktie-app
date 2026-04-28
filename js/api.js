/*
AFSNIT 01 – Imports
*/
import { PRICES_JSON_PATH, CSV_PATH } from "./config.js";

/*
AFSNIT 02 – Helpers
*/
const nowIso = () => new Date().toISOString();

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
  return String(s || "").trim().toLowerCase();
}

function toNumberSmart(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;

  const s = String(v).trim();
  if (!s) return NaN;

  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);

  return Number.isFinite(n) ? n : NaN;
}

/*
AFSNIT 03 – Fast EUR til DKK
*/
const EUR_TO_DKK = 7.45;

export async function getEURDKK() {
  return EUR_TO_DKK;
}

/*
AFSNIT 04 – CSV parser
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
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (!lines.length) return [];

  const delim = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delim);

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delim);
    if (!cols.length) continue;

    const row = {};

    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = cols[c] ?? "";
    }

    rows.push(row);
  }

  return rows;
}

/*
AFSNIT 05 – Merge: CSV + prices.json
*/
export async function getLatestHoldingsPrices() {
  const csvText = await fetchText(CSV_PATH);
  const rows = parseCsv(csvText);

  const holdings = rows
    .map((r) => ({
      name: normName(r.Navn),
      currency: String(r.Valuta || "DKK").toUpperCase(),
      buyPrice: toNumberSmart(r.KøbsKurs),
      quantity: toNumberSmart(r.Antal),
      _csvPrice: toNumberSmart(r.Kurs)
    }))
    .filter((h) => h.name);

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
        isin: it?.isin || "",
        currency: String(it?.currency || "DKK").toUpperCase(),
        price: Number(it?.price),
        updatedAt: it?.updatedAt || pricesUpdatedAt,
        source: it?.source || pricesSource,
        history: Array.isArray(it?.history) ? it.history : []
      };

      priceByExactName.set(n, obj);
      priceByKey.set(normKey(n), obj);
    }
  } catch (e) {
    console.warn("prices.json ikke tilgængelig", e);
  }

  const mergedItems = holdings.map((h) => {
    const exact = priceByExactName.get(h.name);
    const fallback = priceByKey.get(normKey(h.name));
    const p = exact || fallback;

    const price = Number.isFinite(p?.price) ? Number(p.price) : h._csvPrice;
    const currency = (p?.currency || h.currency || "DKK").toUpperCase();

    return {
      name: h.name,
      isin: p?.isin || "",
      currency,
      price,
      buyPrice: h.buyPrice,
      quantity: h.quantity,
      updatedAt: p?.updatedAt || pricesUpdatedAt,
      source: p?.source || pricesSource,
      history: Array.isArray(p?.history) ? p.history : []
    };
  });

  return {
    updatedAt: pricesUpdatedAt,
    source: `merged(${pricesSource}+csv)`,
    meta: {
      githubUpdatedISO: pricesUpdatedAt,
      lastTradingDayISO: pricesUpdatedAt
    },
    items: mergedItems
  };
}
