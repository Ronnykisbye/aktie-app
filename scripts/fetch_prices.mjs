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

/**
 * =========================================================
 * AFSNIT 02 – Konfiguration (fonde)
 * =========================================================
 * Vi prøver Yahoo først:
 * - hvis yahooSymbol findes -> brug den direkte
 * - ellers -> søg Yahoo efter ISIN eller navn og vælg bedste symbol
 *
 * Fallback beholdes:
 * - DKK: NetDania
 * - EUR: FundConnect
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
      url: "https://fundsnow.os.fundconnect.com/solutions/default/fundinfo?clientID=FIIF&currency=EUR&isin=LU3076185670&language=en-GB"
    }
  },

  {
    name: "Nordea Invest Europe Enhanced KL 1",
    currencyHint: "DKK",

    // Yahoo: symbol ukendt i denne chat, så vi søger.
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

    // Yahoo: hvis du har den korrekte ticker for præcis denne fond i Yahoo,
    // kan du sætte den her senere. Lige nu søger vi automatisk.
    yahooSymbol: null,
    yahooSearch: {
      isin: null,
      query: "Nordea Invest Global Enhanced KL 1"
    },

    // Fallback: NetDania
    fallback: {
      type: "netdania",
      url: "https://m.netdania.com/funds/ndiglenhkl1-co/idc-dla-eq"
    }
  }
];

/**
 * =========================================================
 * AFSNIT 03 – Output og historik
 * =========================================================
 */
const OUT_FILE = "data/prices.json";
const HISTORY_RANGE = "3mo"; // Yahoo: 3 måneder
const HISTORY_INTERVAL = "1d"; // daglige datapunkter

/**
 * =========================================================
 * AFSNIT 04 – File helpers
 * =========================================================
 */
import fs from "node:fs";
import path from "node:path";

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonSafe(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * =========================================================
 * AFSNIT 05 – Date / number helpers
 * =========================================================
 */
function nowIsoUtc() {
  return new Date().toISOString();
}
function toFloat(v) {
  return Number(String(v).replace(",", "."));
}
show;

/**
 * =========================================================
 * AFSNIT 06 – Fetch helper (med timeout)
 * =========================================================
 */
async function fetchText(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/**
 * =========================================================
 * AFSNIT 07 – Yahoo Finance: søg symbol
 * =========================================================
 * Endpoint (uofficiel, men bruges af Yahoo selv):
 * https://query1.finance.yahoo.com/v1/finance/search?q=...
 */
async function yahooFindSymbol({ isin, query }) {
  const q = encodeURIComponent(isin || query);
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${q}&quotesCount=10&newsCount=0`;
  const data = await fetchJson(url);

  const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
  if (quotes.length === 0) return null;

  // Vælg "bedste" kandidat: prioriter mutualfund/etf + match på navn
  const qLower = String(query || "").toLowerCase();

  const scored = quotes.map((item) => {
    const symbol = item?.symbol || "";
    const shortname = String(item?.shortname || item?.longname || "").toLowerCase();
    const quoteType = String(item?.quoteType || "").toLowerCase();

    let score = 0;
    if (quoteType.includes("mutualfund")) score += 50;
    if (quoteType.includes("fund")) score += 30;
    if (quoteType.includes("etf")) score += 10;
    if (shortname.includes("nordea")) score += 10;
    if (qLower && shortname.includes(qLower.slice(0, 12))) score += 5;
    if (symbol) score += 1;

    return { symbol, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.symbol || null;
}

/**
 * =========================================================
 * AFSNIT 08 – Yahoo Finance: hent kurs + historik (3 måneder)
 * =========================================================
 * Endpoint:
 * https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=3mo&interval=1d
 */
async function yahooGetChart(symbol) {
  const s = encodeURIComponent(symbol);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${s}` +
    `?range=${encodeURIComponent(HISTORY_RANGE)}&interval=${encodeURIComponent(HISTORY_INTERVAL)}`;

  const data = await fetchJson(url);

  const result = data?.chart?.result?.[0];
  if (!result) throw new Error("Yahoo chart: no result");

  const meta = result?.meta || {};
  const currency = meta?.currency || null;

  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const quotes = result?.indicators?.quote?.[0] || {};
  const closes = Array.isArray(quotes?.close) ? quotes.close : [];

  // Find sidste valide close
  let lastIdx = -1;
  for (let i = closes.length - 1; i >= 0; i--) {
    if (typeof closes[i] === "number" && !Number.isNaN(closes[i])) {
      lastIdx = i;
      break;
    }
  }
  if (lastIdx === -1) throw new Error("Yahoo chart: no close price");

  const lastPrice = closes[lastIdx];
  const lastTs = timestamps[lastIdx];
  const lastIso = lastTs ? new Date(lastTs * 1000).toISOString() : nowIsoUtc();

  // Byg historik: { date: YYYY-MM-DD, price }
  const history = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const p = closes[i];
    if (!ts || typeof p !== "number" || Number.isNaN(p)) continue;
    const d = new Date(ts * 1000).toISOString().slice(0, 10);
    history.push({ date: d, price: p });
  }

  return {
    price: lastPrice,
    updatedAt: lastIso,
    currency,
    history
  };
}

/**
 * =========================================================
 * AFSNIT 09 – Fallback parsere (NetDania / FundConnect)
 * =========================================================
 */
function parseNetdania(html) {
  // NetDania-sider indeholder typisk:
  // 146.55
  // 15-January-26 13:14:08
  const price = html.match(/\n\s*([0-9]+[.,][0-9]+)\s*\n/)?.[1];
  const time = html.match(/\n\s*(\d{1,2}-[A-Za-z]+-\d{2}\s+\d{2}:\d{2}:\d{2})\s*\n/)?.[1];

  if (!price || !time) throw new Error("NetDania parse error");

  // robust konvertering: "15-January-26 13:14:08" -> ISO
  const iso = new Date(time.replace(/-/g, " ")).toISOString();

  return {
    price: toFloat(price),
    updatedAt: iso,
    currency: null,
    history: []
  };
}

function parseFundConnect(html) {
  // FundConnect indeholder typisk: "NAV 106.851 as of 02/01"
  const m = html.match(/NAV\s+([\d.,]+)\s+as\s+of\s+(\d{2}\/\d{2})/i);
  if (!m) throw new Error("FundConnect parse error");

  const price = toFloat(m[1]);
  const [dd, mm] = m[2].split("/");
  const year = new Date().getFullYear();

  // Sæt tid midt på dagen i UTC for stabilitet
  const iso = new Date(Date.UTC(year, Number(mm) - 1, Number(dd), 12, 0, 0)).toISOString();

  return {
    price,
    updatedAt: iso,
    currency: null,
    history: []
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

    // 1) Prøv Yahoo først
    try {
      const symbol =
        fund.yahooSymbol ||
        (await yahooFindSymbol({
          isin: fund.yahooSearch?.isin || null,
          query: fund.yahooSearch?.query || fund.name
        }));

      if (!symbol) throw new Error("Yahoo: symbol not found");

      const y = await yahooGetChart(symbol);

      items.push({
        name: fund.name,
        currency: y.currency || fund.currencyHint || prevItem?.currency || "DKK",
        price: Number(y.price),
        updatedAt: y.updatedAt,
        source: `yahoo:${symbol}`,
        history: Array.isArray(y.history) ? y.history : []
      });

      if (y.updatedAt > maxUpdatedAt) maxUpdatedAt = y.updatedAt;
      continue;
    } catch (err) {
      // fortsæt til fallback
    }

    // 2) Fallback: NetDania/FundConnect
    try {
      const html = await fetchText(fund.fallback.url);
      const parsed =
        fund.fallback.type === "netdania"
          ? parseNetdania(html)
          : parseFundConnect(html);

      items.push({
        name: fund.name,
        currency: fund.currencyHint || prevItem?.currency || "DKK",
        price: Number(parsed.price),
        updatedAt: parsed.updatedAt,
        source: `fallback:${fund.fallback.type}`,
        history: prevItem?.history || [] // behold historik hvis den allerede findes
      });

      if (parsed.updatedAt > maxUpdatedAt) maxUpdatedAt = parsed.updatedAt;
      continue;
    } catch (err) {
      // 3) Sidste fallback: brug forrige
    }

    if (prevItem) {
      items.push({
        name: fund.name,
        currency: prevItem.currency,
        price: prevItem.price,
        updatedAt: prevItem.updatedAt || previous.updatedAt || nowIsoUtc(),
        source: "previous",
        history: prevItem.history || []
      });
      if ((prevItem.updatedAt || "1970") > maxUpdatedAt) maxUpdatedAt = prevItem.updatedAt;
    } else {
      throw new Error(`Ingen data og ingen fallback for: ${fund.name}`);
    }
  }

  const output = {
    updatedAt: maxUpdatedAt === "1970-01-01T00:00:00.000Z" ? nowIsoUtc() : maxUpdatedAt,
    items
  };

  writeJsonSafe(OUT_FILE, output);
  console.log("✔ prices.json updated (Yahoo primary + fallback enabled)");
}

main();
