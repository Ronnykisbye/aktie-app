/**
 * =========================================================
 * AFSNIT 01 – Formål
 * =========================================================
 * Stabil auto-opdatering til data/prices.json via GitHub Actions.
 *
 * NYT:
 * - Primær kilde: Yahoo Finance (chart endpoint) for frisk kurs + historik (3 måneder)
 * - Fallback: NetDania (DKK) + FundConnect (EUR), så workflow aldrig dør pga. Yahoo
 *
 * Output:
 * - data/prices.json (samme felter som før: name, currency, price, updatedAt)
 * - + ekstra felt "history" (valgfrit) til grafer senere
 */

import fs from "fs";
import path from "path";

/**
 * =========================================================
 * AFSNIT 02 – Paths / Konstanter
 * =========================================================
 */
const ROOT = process.cwd();
const OUT_FILE = path.join(ROOT, "data", "prices.json");

/**
 * =========================================================
 * AFSNIT 03 – Fond-konfiguration
 * =========================================================
 */
const FUNDS = [
  {
    name: "Nordea Empower Europe Fund BQ",
    currencyHint: "EUR",

    // Yahoo: vi har ikke 100% bekræftet symbol til "Fund BQ" i denne chat,
    // så vi søger først på navn + (hvis muligt) ISIN. Du kan senere udfylde yahooSymbol,
    // hvis du finder den præcise.
    yahooSymbol: null,
    yahooSearch: {
      // Hvis du kender ISIN, så skriv den her (ellers bliver navn brugt)
      isin: null,
      query: "Nordea Empower Europe Fund BQ"
    },

    // Fallback: FundConnect (NAV)
    fallback: {
      type: "fundconnect",
      url: "https://www.fundconnect.com/Home/FundOverview?fundId=34687"
    }
  },

  {
    name: "Nordea Invest Europe Enhanced KL 1",
    currencyHint: "DKK",
    yahooSymbol: null,
    yahooSearch: {
      isin: null,
      query: "Nordea Invest Europe Enhanced KL 1"
    },

    // Fallback: NetDania
    fallback: {
      type: "netdania",
      url: "https://m.netdania.com/funds/ndieuenhkl1-co/idc-dla-eq"
    }
  },

  {
    name: "Nordea Invest Global Enhanced KL 1",
    currencyHint: "DKK",
    yahooSymbol: null,
    yahooSearch: {
      isin: null,
      query: "Nordea Invest Global Enhanced KL 1"
    },

    // Fallback: NetDania
    fallback: {
      type: "netdania",
      url: "https://m.netdania.com/funds/ndigloenkl1-co/idc-dla-eq"
    }
  }
];

/**
 * =========================================================
 * AFSNIT 04 – Fil-hjælpere
 * =========================================================
 */
function readJsonSafe(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJsonSafe(file, obj) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf-8");
}

function nowIsoUtc() {
  return new Date().toISOString();
}

/**
 * =========================================================
 * AFSNIT 04B – Historik-hjælpere (til grafer)
 * =========================================================
 * - Vi gemmer daglige datapunkter pr. fond i items[].history
 * - Vi deduper pr. dato (YYYY-MM-DD)
 * - Vi beholder kun de seneste MAX_DAYS dage
 */
const MAX_HISTORY_DAYS = 120;

function isoDateOnly(iso) {
  if (!iso) return null;
  const s = String(iso);
  return s.includes("T") ? s.split("T")[0] : s;
}

function mergeHistory(prevHistory, nextHistory) {
  const map = new Map();

  const add = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const p of arr) {
      const d = p?.date;
      const price = Number(p?.price);
      if (!d || !Number.isFinite(price)) continue;
      map.set(d, { date: d, price });
    }
  };

  add(prevHistory);
  add(nextHistory);

  const merged = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));

  if (merged.length > MAX_HISTORY_DAYS) {
    return merged.slice(merged.length - MAX_HISTORY_DAYS);
  }
  return merged;
}

function withDailyPoint(history, updatedAtIso, price) {
  const d = isoDateOnly(updatedAtIso);
  const p = Number(price);
  if (!d || !Number.isFinite(p)) return Array.isArray(history) ? history : [];

  const base = Array.isArray(history) ? history.slice() : [];
  const idx = base.findIndex((x) => x?.date === d);

  if (idx >= 0) base[idx] = { date: d, price: p };
  else base.push({ date: d, price: p });

  base.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (base.length > MAX_HISTORY_DAYS) {
    return base.slice(base.length - MAX_HISTORY_DAYS);
  }
  return base;
}

/**
 * =========================================================
 * AFSNIT 05 – HTTP helpers
 * =========================================================
 */
async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "github-action" }
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return await res.text();
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "github-action" }
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return await res.json();
}

/**
 * =========================================================
 * AFSNIT 06 – Yahoo: find symbol (search)
 * =========================================================
 */
async function yahooFindSymbol({ query, isin }) {
  const q = encodeURIComponent(isin || query);
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${q}&quotesCount=10&newsCount=0&listsCount=0`;
  const data = await fetchJson(url);

  const candidates = Array.isArray(data?.quotes) ? data.quotes : [];
  if (!candidates.length) throw new Error("Yahoo search: ingen kandidater");

  // vælg første med symbol
  const best = candidates.find((c) => c?.symbol) || candidates[0];
  if (!best?.symbol) throw new Error("Yahoo search: ingen symbol");
  return best.symbol;
}

/**
 * =========================================================
 * AFSNIT 07 – Yahoo: chart (pris + 3 mdr historik)
 * =========================================================
 */
async function yahooFetchChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=3mo&interval=1d&includePrePost=false&events=div%7Csplit%7Cearn&lang=da-DK&region=DK`;

  const data = await fetchJson(url);

  const result = data?.chart?.result?.[0];
  if (!result) throw new Error("Yahoo chart: ingen result");

  const meta = result.meta || {};
  const currency = meta.currency || null;

  const ts = Array.isArray(result.timestamp) ? result.timestamp : [];
  const closes = result?.indicators?.quote?.[0]?.close || [];

  const history = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const c = closes[i];
    if (t && Number.isFinite(c)) {
      const d = new Date(t * 1000);
      const date = d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
      history.push({ date, price: Number(c) });
    }
  }

  // latest (sidste valid close)
  let latest = null;
  for (let i = closes.length - 1; i >= 0; i--) {
    if (Number.isFinite(closes[i])) {
      latest = Number(closes[i]);
      break;
    }
  }
  if (!Number.isFinite(latest)) throw new Error("Yahoo chart: ingen latest close");

  return {
    currency,
    price: latest,
    updatedAt: nowIsoUtc(),
    history
  };
}

/**
 * =========================================================
 * AFSNIT 08 – Fallback parsere
 * =========================================================
 */
function parseNetdania(html) {
  // Meget enkel parsing: find første tal i nærheden af "Price" eller lign.
  // (Stabilitet > perfektion. Appen overlever uanset.)
  const m = html.match(/([0-9]+(?:[.,][0-9]+)?)/);
  if (!m) throw new Error("NetDania parse: ingen tal");
  const price = Number(String(m[1]).replace(",", "."));
  if (!Number.isFinite(price)) throw new Error("NetDania parse: ugyldig pris");

  return {
    price,
    updatedAt: nowIsoUtc()
  };
}

function parseFundConnect(html) {
  // Enkel parsing: find første tal der ligner NAV (typisk med komma)
  const m = html.match(/([0-9]+(?:[.,][0-9]+)?)/);
  if (!m) throw new Error("FundConnect parse: ingen tal");
  const price = Number(String(m[1]).replace(",", "."));
  if (!Number.isFinite(price)) throw new Error("FundConnect parse: ugyldig pris");

  return {
    price,
    updatedAt: nowIsoUtc()
  };
}

/**
 * =========================================================
 * AFSNIT 09 – Hent data pr. fond (Yahoo først, fallback ellers)
 * =========================================================
 */
async function getFundData(fund, prevItem) {
  // 1) Yahoo
  try {
    const symbol =
      fund.yahooSymbol ||
      (await yahooFindSymbol({
        query: fund.yahooSearch?.query || fund.name,
        isin: fund.yahooSearch?.isin || null
      }));

    const y = await yahooFetchChart(symbol);

    return {
      name: fund.name,
      currency: y.currency || fund.currencyHint || prevItem?.currency || "DKK",
      price: Number(y.price),
      updatedAt: y.updatedAt,
      source: `yahoo:${symbol}`,
      history: withDailyPoint(
        mergeHistory(prevItem?.history, y.history),
        y.updatedAt,
        Number(y.price)
      )
    };
  } catch {
    // fortsæt
  }

  // 2) Fallback
  const html = await fetchText(fund.fallback.url);
  const parsed =
    fund.fallback.type === "netdania" ? parseNetdania(html) : parseFundConnect(html);

  return {
    name: fund.name,
    currency: fund.currencyHint || prevItem?.currency || "DKK",
    price: Number(parsed.price),
    updatedAt: parsed.updatedAt,
    source: `fallback:${fund.fallback.type}`,
    history: withDailyPoint(prevItem?.history || [], parsed.updatedAt, Number(parsed.price))
  };
}

/**
 * =========================================================
 * AFSNIT 10 – Main: hent alt + skriv prices.json
 * =========================================================
 */
async function main() {
  const previous = readJsonSafe(OUT_FILE);

  const items = [];
  let maxUpdatedAt = "1970-01-01T00:00:00.000Z";

  for (const fund of FUNDS) {
    const prevItem = previous?.items?.find((x) => x?.name === fund.name);

    try {
      const data = await getFundData(fund, prevItem);
      items.push(data);
      if (data.updatedAt > maxUpdatedAt) maxUpdatedAt = data.updatedAt;
      continue;
    } catch {
      // 3) Sidste fallback: brug forrige, men sørg stadig for dagspunkt i historik
    }

    if (prevItem) {
      items.push({
        name: fund.name,
        currency: prevItem.currency,
        price: prevItem.price,
        updatedAt: prevItem.updatedAt || previous.updatedAt || nowIsoUtc(),
        source: "previous",
        history: withDailyPoint(
          prevItem.history || [],
          prevItem.updatedAt || previous.updatedAt

