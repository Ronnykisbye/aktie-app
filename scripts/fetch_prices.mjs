/* =========================================================
   Hent officielle fondskurser fra Nordea og gem historik.
   ========================================================= */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const PRICES_PATH = path.join(DATA_DIR, "prices.json");
const MANUAL_PATH = path.join(DATA_DIR, "manual-prices.json");
const MAX_HISTORY_POINTS = 400;

export const FUNDS = [
  {
    isin: "LU3076185670",
    name: "Nordea Empower Europe Fund BQ",
    currency: "EUR",
    url: "https://www.nordeafunds.com/fi/rahastot/empower-europe-fund-bq",
    fallbackPrice: 116.01,
    min: 50,
    max: 300
  },
  {
    isin: "DK0060949964",
    name: "Nordea Invest Europe Enhanced KL 1",
    currency: "DKK",
    url: "https://www.nordeafunds.com/da/fonde/europe-enhanced-kl-1",
    fallbackPrice: 141.88,
    min: 50,
    max: 300
  },
  {
    isin: "DK0060949881",
    name: "Nordea Invest Global Enhanced KL 1",
    currency: "DKK",
    url: "https://www.nordeafunds.com/da/fonde/global-enhanced-kl-1",
    fallbackPrice: 213.49,
    min: 100,
    max: 400
  }
];

export function toNumber(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
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
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

export function isValidPrice(fund, price) {
  const number = toNumber(price);
  return number !== null && number >= fund.min && number <= fund.max;
}

function decodeRelevantHtml(value) {
  return String(value)
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&amp;", "&");
}

/** Henter den første LatestNAV i Nordeas indlejrede fondsdata. */
export function parseNordeaLatestNav(html) {
  const decoded = decodeRelevantHtml(html);
  const match = decoded.match(
    /"LatestNAV"\s*:\s*\{\s*"@Date"\s*:\s*"([^"]+)"\s*,\s*"#"\s*:\s*"([^"]+)"\s*\}/
  );

  if (!match) throw new Error("LatestNAV blev ikke fundet på Nordea-siden");

  const price = toNumber(match[2]);
  const parsedDate = new Date(match[1]);
  if (price === null || Number.isNaN(parsedDate.getTime())) {
    throw new Error("Nordea returnerede en ugyldig kurs eller dato");
  }

  return {
    price,
    marketDate: match[1].slice(0, 10),
    marketDateISO: parsedDate.toISOString()
  };
}

export async function fetchOfficialPrice(fund, fetchImpl = fetch) {
  const response = await fetchImpl(fund.url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "Aktie-App/1.0 (+https://github.com/Ronnykisbye/aktie-app)"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) throw new Error(`Nordea svarede HTTP ${response.status}`);
  const result = parseNordeaLatestNav(await response.text());
  if (!isValidPrice(fund, result.price)) {
    throw new Error(`Kurs ${result.price} ligger uden for sikkerhedsgrænsen`);
  }
  return result;
}

function normalizedHistory(history) {
  const byDay = new Map();
  for (const point of Array.isArray(history) ? history : []) {
    const date = String(point?.date || "");
    const price = toNumber(point?.price);
    if (!/^\d{4}-\d{2}-\d{2}/.test(date) || price === null) continue;
    byDay.set(date.slice(0, 10), { date, price });
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function addHistoryPoint(history, marketDate, price, { resetLegacy = false } = {}) {
  let clean = normalizedHistory(history);

  // Historik fra version 1 bestod af gentagne manuelle kurser uden markedsdata.
  if (resetLegacy) clean = [];

  const day = String(marketDate).slice(0, 10);
  const point = { date: `${day}T12:00:00.000Z`, price: Number(price) };
  const existingIndex = clean.findIndex((item) => item.date.slice(0, 10) === day);
  if (existingIndex >= 0) clean[existingIndex] = point;
  else clean.push(point);

  return clean
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_HISTORY_POINTS);
}

export async function updatePrices({ fetchImpl = fetch } = {}) {
  const manual = await readJson(MANUAL_PATH, { items: [] });
  const previous = await readJson(PRICES_PATH, { items: [] });
  const manualByIsin = new Map((manual.items || []).map((item) => [String(item?.isin || "").trim(), item]));
  const previousByIsin = new Map((previous.items || []).map((item) => [String(item?.isin || "").trim(), item]));
  const updatedAt = new Date().toISOString();
  const results = [];

  for (const fund of FUNDS) {
    const manualItem = manualByIsin.get(fund.isin);
    const previousItem = previousByIsin.get(fund.isin);
    let finalPrice;
    let marketDate;
    let source;
    let warning = null;

    try {
      const official = await fetchOfficialPrice(fund, fetchImpl);
      finalPrice = official.price;
      marketDate = official.marketDate;
      source = "official-nordea";
    } catch (error) {
      warning = error instanceof Error ? error.message : String(error);
      const manualPrice = toNumber(manualItem?.price);
      const previousPrice = toNumber(previousItem?.price);

      if (manualItem?.enabled === true && isValidPrice(fund, manualPrice)) {
        finalPrice = manualPrice;
        marketDate = String(manualItem?.marketDate || updatedAt).slice(0, 10);
        source = "manual-emergency";
      } else if (isValidPrice(fund, previousPrice)) {
        finalPrice = previousPrice;
        marketDate = String(previousItem?.marketDate || previousItem?.updatedAt || updatedAt).slice(0, 10);
        source = "previous-safe";
      } else {
        finalPrice = fund.fallbackPrice;
        marketDate = updatedAt.slice(0, 10);
        source = "fallback-safe";
      }
    }

    const history = addHistoryPoint(previousItem?.history, marketDate, finalPrice, {
      resetLegacy: source === "official-nordea" && previousItem?.historyVersion !== 2
    });

    results.push({
      name: fund.name,
      isin: fund.isin,
      currency: fund.currency,
      price: finalPrice,
      marketDate,
      updatedAt,
      source,
      historyVersion: 2,
      ...(warning ? { warning } : {}),
      history
    });
  }

  const officialCount = results.filter((item) => item.source === "official-nordea").length;
  const marketDates = results.map((item) => item.marketDate).filter(Boolean).sort();
  const out = {
    updatedAt,
    lastTradingDay: marketDates.at(-1) || updatedAt.slice(0, 10),
    source: officialCount === FUNDS.length ? "official-nordea" : `partial-official-${officialCount}-of-${FUNDS.length}`,
    runId: Date.now(),
    items: results
  };

  await writeJson(PRICES_PATH, out);
  return out;
}

export async function main() {
  const out = await updatePrices();
  for (const item of out.items) {
    console.log(`${item.isin}: ${item.price} ${item.currency} (${item.marketDate}, ${item.source})`);
    if (item.warning) console.warn(`  Advarsel: ${item.warning}`);
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  main().catch((error) => {
    console.error("Kunne ikke opdatere kurser:", error);
    process.exit(1);
  });
}
