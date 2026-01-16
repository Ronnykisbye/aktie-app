/**
 * =========================================================
 * AFSNIT 01 – Formaal
 * =========================================================
 * Stabil auto-opdatering til data/prices.json via GitHub Actions:
 * - Nordea Invest Europe Enhanced KL 1 (DKK)  -> Nordnet (Senest ... DKK)
 * - Nordea Invest Global Enhanced KL 1 (DKK)  -> Nordnet (Senest ... DKK)
 * - Nordea Empower Europe Fund BQ (EUR)       -> FundConnect (Indre værdi ...)
 *
 * Robusthed:
 * - Hvis parsing fejler: brug forrige pris fra data/prices.json (fallback)
 * - Workflow maa ikke stoppe pga. små ændringer på websites
 * - updatedAt opdateres kun når mindst én fond er hentet "live"
 */

import fs from "node:fs";
import path from "node:path";

/**
 * =========================================================
 * AFSNIT 02 – Konfiguration (stabile URL'er)
 * =========================================================
 */
const SOURCES = [
  {
    name: "Nordea Invest Europe Enhanced KL 1",
    currency: "DKK",
    url: "https://www.nordnet.dk/investeringsforeninger/liste/nordea-invest-europe-enhanced-ndieuenhkl1-xcse",
    parser: "nordnet_dkk"
  },
  {
    name: "Nordea Invest Global Enhanced KL 1",
    currency: "DKK",
    url: "https://www.nordnet.dk/investeringsforeninger/liste/nordea-invest-global-enhanced-ndiglenhkl1-xcse",
    parser: "nordnet_dkk"
  },
  {
    name: "Nordea Empower Europe Fund BQ",
    currency: "EUR",
    // FundConnect (offentlig side) viser "Indre værdi ..."
    url: "https://fundsnow.os.fundconnect.com/solutions/default/fundinfo?clientID=DKNB&currency=DKK&isin=LU3076185670&language=da-DK&shelves=DKNB",
    parser: "fundconnect_nav"
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
      // lille "real browser" UA reducerer risiko for blokering
      "user-agent": "Mozilla/5.0 (GitHubActions; Aktie-App; +https://github.com/ronnykisbye/aktie-app)",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function dkToFloat(s) {
  // "146,20" -> 146.20
  const t = String(s).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`Kunne ikke parse DK tal: ${s}`);
  return n;
}

function dotToFloat(s) {
  // "779.85" -> 779.85
  const n = Number(String(s).trim().replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`Kunne ikke parse tal: ${s}`);
  return n;
}

/**
 * =========================================================
 * AFSNIT 04 – Parsere
 * =========================================================
 */
function parseNordnetDKK(html) {
  // Nordnet-side indeholder typisk: "Senest 146,20 DKK"
  const m = html.match(/Senest\s+([0-9]{1,4},[0-9]{1,6})\s*DKK/i);
  if (!m?.[1]) throw new Error("Nordnet: kunne ikke finde 'Senest <tal> DKK'");
  return dkToFloat(m[1]);
}

function parseFundconnectNAV(html) {
  // FundConnect indeholder typisk: "Indre værdi 779.85 pr. 23-12"
  // NB: Punktum-decimal forekommer ofte her.
  const m = html.match(/Indre\s+værdi\s+([0-9]{1,6}(?:[.,][0-9]{1,6})?)/i);
  if (!m?.[1]) throw new Error("FundConnect: kunne ikke finde 'Indre værdi <tal>'");
  return dotToFloat(m[1]);
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

  for (const src of SOURCES) {
    try {
      const html = await fetchText(src.url);

      let price;
      if (src.parser === "nordnet_dkk") {
        price = parseNordnetDKK(html);
      } else if (src.parser === "fundconnect_nav") {
        price = parseFundconnectNAV(html);
      } else {
        throw new Error(`Ukendt parser: ${src.parser}`);
      }

      items.push({
        name: src.name,
        currency: src.currency,
        price,
        source: src.url
      });

      anyLive = true;
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
        // Hvis vi ikke har fallback, skal vi fejle – ellers får vi "tom" data
        throw new Error(`FATAL: ${src.name}: ingen live pris og ingen fallback. ${String(err?.message || err)}`);
      }
    }
  }

  // updatedAt: hvis mindst én live blev hentet, brug NU; ellers behold gammel
  const updatedAt = anyLive ? nowIso() : (prev?.updatedAt || nowIso());

  const out = {
    updatedAt,
    source: "github-action",
    items
  };

  writeJsonPretty(outPath, out);
  console.log(`Wrote ${outPath} with ${items.length} items. anyLive=${anyLive}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
