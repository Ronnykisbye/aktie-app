/**
 * =========================================================
 * AFSNIT 01 – Formål
 * =========================================================
 * Stabil auto-opdatering til data/prices.json via GitHub Actions.
 *
 * Problemet (typisk):
 * - Scraping fra Nordnet ændrer ofte HTML / blokerer bots -> giver “ingen nye kurser” i flere dage.
 *
 * Løsning (mere robust):
 * - DKK-fonde hentes fra NetDania (viser kurs + dato/tid)
 * - EUR-fond hentes fra FundConnect (viser NAV + “as of”)
 *
 * Robusthed:
 * - Hvis parsing fejler: brug forrige pris fra data/prices.json (fallback)
 * - Workflow må ikke stoppe pga. små ændringer – men må ikke skrive tom data
 * - updatedAt sættes til “seneste kendte tidspunkt” fra kilderne (ikke bare now)
 */

import fs from "node:fs";
import path from "node:path";

/**
 * =========================================================
 * AFSNIT 02 – Konfiguration (kilder)
 * =========================================================
 * NetDania-siderne indeholder typisk:
 *   # NORDEA INVEST ...
 *   146.55
 *   15-January-26 13:14:08
 *
 * FundConnect indeholder typisk:
 *   NAV 106.851 as of 02/01
 */
const SOURCES = [
  {
    name: "Nordea Invest Europe Enhanced KL 1",
    currency: "DKK",
    url: "https://m.netdania.com/funds/ndieuenhkl1-co/idc-dla-eq",
    parser: "netdania_fund"
  },
  {
    name: "Nordea Invest Global Enhanced KL 1",
    currency: "DKK",
    url: "https://m.netdania.com/funds/ndiglenhkl1-co/idc-dla-eq",
    parser: "netdania_fund"
  },
  {
    name: "Nordea Empower Europe Fund BQ",
    currency: "EUR",
    url: "https://fundsnow.os.fundconnect.com/solutions/default/fundinfo?clientID=FIIF&currency=EUR&isin=LU3076185670&language=en-GB&shelves=FIIF",
    parser: "fundconnect_nav_en"
  }
];

/**
 * =========================================================
 * AFSNIT 03 – Utilities
 * =========================================================
 */
function nowIso() {
  return new Date().toISOString();
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonPretty(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (GitHubActions; Aktie-App; +https://github.com/ronnykisbye/aktie-app)",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "da,en;q=0.8"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function toFloatAny(s) {
  // accepter både "146.55" og "146,55"
  const n = Number(String(s).trim().replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`Kunne ikke parse tal: ${s}`);
  return n;
}

// Month name -> month index
const MONTHS = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11
};

function isoFromNetdaniaStamp(stamp) {
  // "15-January-26 13:14:08"
  const m = String(stamp).trim().match(
    /^(\d{1,2})-([A-Za-z]+)-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/
  );
  if (!m) throw new Error(`NetDania: kunne ikke parse tidspunkt: ${stamp}`);

  const day = Number(m[1]);
  const monName = String(m[2]).toLowerCase();
  const yy = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const ss = Number(m[6]);

  const month = MONTHS[monName];
  if (month === undefined) throw new Error(`NetDania: ukendt måned: ${m[2]}`);

  // Antag 2000-tallet (NetDania viser "26" for 2026)
  const year = 2000 + yy;

  // Vi gemmer som UTC. (Tidzone er ikke angivet i kilden; til “seneste handelsdag”-dato er dette fint.)
  const d = new Date(Date.UTC(year, month, day, hh, mm, ss));
  return d.toISOString();
}

function isoFromFundconnectAsOf(asOfDDMM) {
  // "02/01" (DD/MM) – year antages til indeværende år, men hvis det ligger “i fremtiden”
  // ift. i dag (fx 31/12 -> 02/01 ved årsskifte), rulles et år tilbage.
  const m = String(asOfDDMM).trim().match(/^(\d{2})\/(\d{2})$/);
  if (!m) throw new Error(`FundConnect: kunne ikke parse as-of dato: ${asOfDDMM}`);

  const dd = Number(m[1]);
  const mo = Number(m[2]) - 1;

  const now = new Date();
  let year = now.getUTCFullYear();

  // Lav en dato midt på dagen for stabilitet
  let candidate = new Date(Date.UTC(year, mo, dd, 12, 0, 0));

  // Hvis candidate er mere end 2 dage fremme (årsskifte-case), træk et år fra
  const diffDays = (candidate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > 2) {
    year -= 1;
    candidate = new Date(Date.UTC(year, mo, dd, 12, 0, 0));
  }

  return candidate.toISOString();
}

/**
 * =========================================================
 * AFSNIT 04 – Parsere
 * =========================================================
 */
function parseNetdaniaFund(html) {
  // Finder først prisen: typisk står den som et “rent tal” på egen linje
  // og bagefter et timestamp.
  //
  // Vi går efter mønster:
  //   # NORDEA ...
  //   <PRICE>
  //   <STAMP>
  //
  // Men HTML kan variere, så vi matcher mere fleksibelt.
  const priceMatch = html.match(/\n\s*([0-9]{1,6}(?:[.,][0-9]{1,6})?)\s*\n/);
  if (!priceMatch?.[1]) throw new Error("NetDania: kunne ikke finde pris");

  const stampMatch = html.match(/\n\s*(\d{1,2}-[A-Za-z]+-\d{2}\s+\d{2}:\d{2}:\d{2})\s*\n/);
  if (!stampMatch?.[1]) throw new Error("NetDania: kunne ikke finde timestamp");

  const price = toFloatAny(priceMatch[1]);
  const asIso = isoFromNetdaniaStamp(stampMatch[1]);

  return { price, asIso };
}

function parseFundconnectNavEN(html) {
  // Eksempel: "NAV 106.851 as of 02/01"
  const m = html.match(/NAV\s+([0-9]{1,6}(?:[.,][0-9]{1,6})?)\s+as\s+of\s+(\d{2}\/\d{2})/i);
  if (!m?.[1] || !m?.[2]) throw new Error("FundConnect: kunne ikke finde 'NAV <tal> as of DD/MM'");

  const price = toFloatAny(m[1]);
  const asIso = isoFromFundconnectAsOf(m[2]);

  return { price, asIso };
}

/**
 * =========================================================
 * AFSNIT 05 – Fallback (forrige prices.json)
 * =========================================================
 */
function buildPrevMap(prev) {
  const map = new Map();
  for (const it of prev?.items || []) {
    const key = String(it?.name || "").trim().toLowerCase();
    if (!key) continue;
    map.set(key, it);
  }
  return map;
}

function getPrevPrice(prevMap, name) {
  const key = String(name || "").trim().toLowerCase();
  const it = prevMap.get(key);
  if (!it) return null;

  const p = Number(it.price);
  if (!Number.isFinite(p)) return null;

  return { price: p, currency: it.currency || null, source: it.source || "previous" };
}

/**
 * =========================================================
 * AFSNIT 06 – Main
 * =========================================================
 */
async function main() {
  const repoRoot = process.cwd();
  const outPath = path.join(repoRoot, "data", "prices.json");

  const prev = readJsonSafe(outPath);
  const prevMap = buildPrevMap(prev);

  const items = [];
  let anyLive = false;

  // updatedAt sættes til “seneste asIso” fra live-kilder
  let latestIso = prev?.updatedAt || nowIso();

  for (const src of SOURCES) {
    try {
      const html = await fetchText(src.url);

      let parsed;
      if (src.parser === "netdania_fund") {
        parsed = parseNetdaniaFund(html);
      } else if (src.parser === "fundconnect_nav_en") {
        parsed = parseFundconnectNavEN(html);
      } else {
        throw new Error(`Ukendt parser: ${src.parser}`);
      }

      items.push({
        name: src.name,
        currency: src.currency,
        price: parsed.price,
        source: src.url
      });

      anyLive = true;

      if (parsed.asIso && String(parsed.asIso) > String(latestIso)) {
        latestIso = parsed.asIso;
      }
    } catch (err) {
      // Fallback: brug sidste kendte pris hvis muligt
      const prevP = getPrevPrice(prevMap, src.name);
      if (prevP) {
        console.warn(
          `WARN: ${src.name}: ${String(err?.message || err)} -> bruger fallback (${prevP.price})`
        );
        items.push({
          name: src.name,
          currency: src.currency,
          price: prevP.price,
          source: `${prevP.source} (fallback)`
        });
      } else {
        throw new Error(
          `FATAL: ${src.name}: ingen live pris og ingen fallback. ${String(err?.message || err)}`
        );
      }
    }
  }

  const out = {
    updatedAt: anyLive ? latestIso : (prev?.updatedAt || nowIso()),
    source: "github-action",
    items
  };

  writeJsonPretty(outPath, out);
  console.log(`Wrote ${outPath} with ${items.length} items. anyLive=${anyLive} updatedAt=${out.updatedAt}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
