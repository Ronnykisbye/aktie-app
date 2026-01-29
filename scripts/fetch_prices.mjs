/**
 * AFSNIT 01 – Formål
 * Henter seneste NAV/indre værdi for 3 Nordea-fonde og opdaterer data/prices.json.
 * - DK-fonde hentes fra Nasdaq "Fund Info" (Indre værdi)
 * - LU-fond hentes fra NordeaFunds (Regnskabsmæssige indre værdi pr. dato) i DKK
 *   og omregnes til EUR ved hjælp af ECB EUR/DKK.
 *
 * Output:
 * {
 *   "updatedAt": "ISO UTC",        // seneste handelsdag/tid vi kan udlede
 *   "fetchedAt": "ISO UTC",        // hvornår workflowet kørte
 *   "source": "github-action",
 *   "items": [
 *     { name, isin, currency, price, history:[{date, price}, ... max 10] }
 *   ]
 * }
 */

import fs from "node:fs/promises";

/**
 * AFSNIT 02 – Konfiguration
 */
const OUT_PATH = "data/prices.json";

// Nasdaq (DK)
const NASDAQ_GLOBAL =
  "https://www.nasdaq.com/fi/european-market-activity/funds/ndiglenhkl1/fund-info?id=TX2670160";
const NASDAQ_EUROPE =
  "https://www.nasdaq.com/fi/european-market-activity/funds/ndieuenhkl1/fund-info?id=TX2670158";

// NordeaFunds (LU)
const NORDEA_EMPOWER =
  "https://www.nordeafunds.com/da/fonde/empower-europe-fund-bq";

// ECB EUR rates (EUR base, includes DKK)
const ECB_DAILY_XML =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

/**
 * AFSNIT 03 – Små hjælpefunktioner
 */
function toNumber(str) {
  if (!str) return null;
  // "209,69" -> 209.69
  const cleaned = String(str).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function isoNowUtc() {
  return new Date().toISOString();
}

function yyyyMmDdFromDate(dateObj) {
  const y = dateObj.getUTCFullYear();
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "aktie-app-bot/1.0" },
  });
  if (!res.ok) {
    throw new Error(`Fetch fejlede (${res.status}) for ${url}`);
  }
  return await res.text();
}

/**
 * AFSNIT 04 – Parsere (Nasdaq)
 * Vi udtrækker "Indre værdi (realtid) 209,69"
 */
function parseNasdaqIndreVaerdi(html) {
  // prøv flere varianter (sprog/format)
  const patterns = [
    /Indre værdi\s*\(realtid\)\s*([0-9]+(?:[.,][0-9]+)?)/i,
    /Net Asset Value\s*\(real time\)\s*([0-9]+(?:[.,][0-9]+)?)/i,
  ];

  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) return toNumber(m[1]);
  }
  return null;
}

/**
 * AFSNIT 05 – Parsere (NordeaFunds)
 * Udtrækker:
 * "Regnskabsmæssige indre værdi (per 27.01.) 853,99"
 */
function parseNordeaFundsIndreVaerdiDkkAndDate(html) {
  // dato i format "27.01." og værdi som "853,99"
  const m = html.match(
    /Regnskabsmæssige indre værdi\s*\(per\s*([0-9]{2})\.([0-9]{2})\.\)\s*([\d.,]+)/i
  );

  if (!m) return { dkk: null, date: null };

  const day = Number(m[1]);
  const month = Number(m[2]);
  const dkk = toNumber(m[3]);

  if (!dkk || !day || !month) return { dkk: null, date: null };

  // Antag samme år som "nu" (det passer til din case her i januar)
  const now = new Date();
  const year = now.getUTCFullYear();
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;

  return { dkk, date };
}

/**
 * AFSNIT 06 – ECB EUR/DKK
 * ECB XML har EUR som base, og DKK er fx 7.46...
 */
function parseEcbDkkRate(xml) {
  // fx: currency='DKK' rate='7.4602'
  const m = xml.match(/currency=['"]DKK['"]\s+rate=['"]([0-9.]+)['"]/i);
  if (!m) return null;
  const rate = Number(m[1]);
  return Number.isFinite(rate) ? rate : null;
}

/**
 * AFSNIT 07 – History (max 10 punkter)
 */
function loadPrevious(jsonText) {
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function ensureHistory(prevItem) {
  if (!prevItem || !Array.isArray(prevItem.history)) return [];
  // behold kun gyldige punkter
  return prevItem.history
    .filter((p) => p && p.date && typeof p.price === "number")
    .slice(-10);
}

function upsertHistory(history, date, price) {
  if (!date || typeof price !== "number") return history.slice(-10);

  const last = history[history.length - 1];
  if (last && last.date === date) {
    // overskriv sidste datapunkt hvis samme dato (fx re-run)
    last.price = price;
    return history.slice(-10);
  }

  history.push({ date, price });
  return history.slice(-10);
}

/**
 * AFSNIT 08 – Main
 */
async function main() {
  const fetchedAt = isoNowUtc();

  // læs tidligere fil hvis den findes
  let prev = null;
  try {
    const prevText = await fs.readFile(OUT_PATH, "utf-8");
    prev = loadPrevious(prevText);
  } catch {
    prev = null;
  }

  // 1) DK fonde fra Nasdaq
  const [htmlGlobal, htmlEurope] = await Promise.all([
    fetchText(NASDAQ_GLOBAL),
    fetchText(NASDAQ_EUROPE),
  ]);

  const priceGlobal = parseNasdaqIndreVaerdi(htmlGlobal);
  const priceEurope = parseNasdaqIndreVaerdi(htmlEurope);

  if (priceGlobal == null) {
    throw new Error("Kunne ikke finde indre værdi på Nasdaq for Global Enhanced.");
  }
  if (priceEurope == null) {
    throw new Error("Kunne ikke finde indre værdi på Nasdaq for Europe Enhanced.");
  }

  // 2) LU fond fra NordeaFunds: indre værdi i DKK + dato
  const htmlEmpower = await fetchText(NORDEA_EMPOWER);
  const { dkk: empowerDkk, date: empowerDate } =
    parseNordeaFundsIndreVaerdiDkkAndDate(htmlEmpower);

  if (empowerDkk == null || !empowerDate) {
    throw new Error(
      "Kunne ikke finde 'Regnskabsmæssige indre værdi (per ..)' på NordeaFunds siden."
    );
  }

  // 3) ECB EUR/DKK for omregning (så appen kan vise kurs i EUR for LU-fonden)
  const ecbXml = await fetchText(ECB_DAILY_XML);
  const eurDkk = parseEcbDkkRate(ecbXml);

  if (eurDkk == null) {
    throw new Error("Kunne ikke finde EUR/DKK i ECB daily XML.");
  }

  const empowerEur = Number((empowerDkk / eurDkk).toFixed(2));

  // 4) Byg items + history (10 seneste)
  const today = new Date();
  const todayIso = yyyyMmDdFromDate(today);

  const prevItems = Array.isArray(prev?.items) ? prev.items : [];

  function prevByIsin(isin) {
    return prevItems.find((x) => x && x.isin === isin) || null;
  }

  // DK0060949964 – Europe Enhanced
  const europePrev = prevByIsin("DK0060949964");
  let europeHistory = ensureHistory(europePrev);
  europeHistory = upsertHistory(europeHistory, todayIso, priceEurope);

  // DK0060949881 – Global Enhanced
  const globalPrev = prevByIsin("DK0060949881");
  let globalHistory = ensureHistory(globalPrev);
  globalHistory = upsertHistory(globalHistory, todayIso, priceGlobal);

  // LU3076185670 – Empower Europe Fund BQ (vi gemmer i EUR i appens "Kurs"-kolonne)
  const empowerPrev = prevByIsin("LU3076185670");
  let empowerHistory = ensureHistory(empowerPrev);
  empowerHistory = upsertHistory(empowerHistory, empowerDate, empowerEur);

  // 5) updatedAt: brug den “nyeste” dato vi faktisk har (empowerDate kan være i går)
  // Vi sætter updatedAt til "fetchedAt" men appen viser handelsdag ud fra dette felt i dag.
  // Derfor sætter vi updatedAt til fetchedAt (UTC), og appen kan stadig vise "senest tjekket"
  // separat via fetchedAt, som den allerede gør.
  const updatedAt = fetchedAt;

  const out = {
    updatedAt,
    fetchedAt,
    source: "github-action",
    items: [
      {
        name: "Nordea Empower Europe Fund BQ",
        isin: "LU3076185670",
        currency: "EUR",
        price: empowerEur,
        history: empowerHistory,
      },
      {
        name: "Nordea Invest Europe Enhanced KL 1",
        isin: "DK0060949964",
        currency: "DKK",
        price: priceEurope,
        history: europeHistory,
      },
      {
        name: "Nordea Invest Global Enhanced KL 1",
        isin: "DK0060949881",
        currency: "DKK",
        price: priceGlobal,
        history: globalHistory,
      },
    ],
  };

  await fs.writeFile(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf-8");

  console.log("✅ Opdaterede", OUT_PATH);
  console.log(
    "Empower (EUR):",
    empowerEur,
    "DKK indre værdi:",
    empowerDkk,
    "EUR/DKK:",
    eurDkk
  );
  console.log("Europe Enhanced (DKK):", priceEurope);
  console.log("Global Enhanced (DKK):", priceGlobal);
}

main().catch((err) => {
  console.error("❌ FEJL:", err?.message || err);
  process.exit(1);
});
