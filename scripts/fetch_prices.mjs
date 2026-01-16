/**
 * AFSNIT 01 - Formaal
 * - Henter friske kurser og skriver data/prices.json
 * - Designet til GitHub Actions (ingen hemmelige API-nogler).
 */

import fs from "node:fs";
import path from "node:path";

const TODAY_RATES_URL = "https://www.nordeafunds.com/da/investorinformation/dagens-kurser";

const FUND_SOURCES = [
  {
    name: "Nordea Invest Europe Enhanced KL 1",
    currency: "DKK",
    type: "todays_rates",
    // Nordea kan ændre visningen af navnet på "dagens kurser" (små variationer)
    // Vi prøver flere match-strenge i prioriteret rækkefølge.
    match: [
      "Europe Enhanced KL 1",
      "Invest Europe Enhanced",
      "Europe Enhanced"
    ]
  },
  {
    name: "Nordea Invest Global Enhanced KL 1",
    currency: "DKK",
    type: "todays_rates",
    match: [
      "Global Enhanced KL 1",
      "Invest Global Enhanced",
      "Global Enhanced"
    ]
  },
  {
    name: "Nordea Empower Europe Fund BQ",
    currency: "EUR",
    type: "fund_page_nav",
    url: "https://www.nordeafunds.com/da/fonde/empower-europe-fund-bq",
    // Finder tallet efter "Regnskabsmæssige indre værdi" (DK format)
    navRegex: /Regnskabsmæssige\s+indre\s+værdi[^\d]*([0-9]{1,4}\,[0-9]{1,6})/i
  }
];

/**
 * AFSNIT 02 - CSV indlæsning
 */
function readFondeCsv(csvPath) {
  const csv = fs.readFileSync(csvPath, "utf8");
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split(";").map((s) => s.trim());

  const rows = lines.map((line) => {
    const parts = line.split(";");
    const row = {};
    header.forEach((h, i) => (row[h] = (parts[i] ?? "").trim()));
    return row;
  });
  return rows;
}

/**
 * AFSNIT 03 - Fetch helpers
 */
async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (GitHubActions; Aktie-App)"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function dkNumberToFloat(str) {
  // "146,50" -> 146.50
  return Number(String(str).replace(/\./g, "").replace(",", "."));
}

/**
 * AFSNIT 04 - Parsere
 */
function parseTodaysRates(html, matchList) {
  // Strategy: Find et vindue af tekst omkring navnet og grib foerste tal efter "Salgskurs"
  const windowSize = 2500;
  const hay = html.toLowerCase();

  const candidates = Array.isArray(matchList) ? matchList : [matchList];
  let usedMatch = null;
  let idx = -1;

  for (const m of candidates) {
    const i = hay.indexOf(String(m).toLowerCase());
    if (i !== -1) {
      usedMatch = m;
      idx = i;
      break;
    }
  }

  if (idx === -1) {
    throw new Error(
      `Kunne ikke finde nogen af disse matches paa dagens-kurser siden: ${candidates.join(" | ")}`
    );
  }

  const start = Math.max(0, idx - windowSize);
  const end = Math.min(html.length, idx + windowSize);
  const chunk = html.slice(start, end);

  // Salgskurs 146,50 (eller lign.)
  const salg = chunk.match(/Salgskurs\s*([0-9]{1,4}\,[0-9]{1,6})/i);
  if (salg?.[1]) return dkNumberToFloat(salg[1]);

  // Fallback: Indre vaerdi 146,50
  const indre = chunk.match(/Indre\s+værdi\s*([0-9]{1,4}\,[0-9]{1,6})/i);
  if (indre?.[1]) return dkNumberToFloat(indre[1]);

  throw new Error(`Kunne ikke parse kurs for match '${usedMatch}'`);
}

function parseFundPageNav(html, regex) {
  const m = html.match(regex);
  if (!m?.[1]) throw new Error("Kunne ikke finde NAV paa fondsiden");
  return dkNumberToFloat(m[1]);
}

/**
 * AFSNIT 05 - Main
 */
async function main() {
  const repoRoot = process.cwd();
  const csvRows = readFondeCsv(path.join(repoRoot, "fonde.csv"));

  // 5.0 Læs evt. tidligere data/prices.json som fallback
  let prev = null;
  try {
    const prevPath = path.join(repoRoot, "data/prices.json");
    if (fs.existsSync(prevPath)) {
      prev = JSON.parse(fs.readFileSync(prevPath, "utf8"));
    }
  } catch {
    prev = null;
  }

  const prevByName = new Map(
    (prev?.items || []).map((it) => [String(it?.name || "").trim().toLowerCase(), it])
  );

  // 5.1 Hent dagens-kurser side 1 gang
  const todaysRatesHtml = await fetchText(TODAY_RATES_URL);

  // 5.2 Saml priser
  const items = [];

  for (const src of FUND_SOURCES) {
    let price;
    let source;

    try {
      if (src.type === "todays_rates") {
        price = parseTodaysRates(todaysRatesHtml, src.match);
        source = "nordeafunds/dagens-kurser";
      } else if (src.type === "fund_page_nav") {
        const html = await fetchText(src.url);
        price = parseFundPageNav(html, src.navRegex);
        source = src.url;
      } else {
        throw new Error(`Ukendt type: ${src.type}`);
      }
    } catch (err) {
      // Fallback: brug seneste kendte pris fra data/prices.json hvis den findes
      const key = src.name.trim().toLowerCase();
      const prevItem = prevByName.get(key);
      if (prevItem?.price != null && Number.isFinite(Number(prevItem.price))) {
        console.warn(
          `WARN: ${src.name}: ${String(err?.message || err)} -> bruger forrige pris (${prevItem.price})`
        );
        price = Number(prevItem.price);
        source = `${prevItem.source || "previous"} (fallback)`;
      } else {
        // Hvis vi ikke har en fallback, skal vi fejle højt og tydeligt
        throw err;
      }
    }

    // Find matching i CSV for koebskurs/antal
    const matchRow = csvRows.find(
      (r) => String(r.Navn || "").trim().toLowerCase() === src.name.trim().toLowerCase()
    );

    items.push({
      name: src.name,
      currency: src.currency,
      price,
      buyPrice: matchRow
        ? Number(
            String(
              matchRow["KøbsKurs"] ||
                matchRow["KoebsKurs"] ||
                matchRow["KøbsKurs"] ||
                0
            ).replace(",", ".")
          )
        : null,
      quantity: matchRow ? Number(String(matchRow["Antal"] || 0).replace(",", ".")) : null,
      source
    });
  }

  const out = {
    // updatedAt opdateres kun hvis der faktisk er ændringer i kurserne.
    updatedAt: prev?.updatedAt || new Date().toISOString(),
    source: "github-action",
    items
  };

  // 5.3 Hvis priserne reelt ændrer sig, så sæt ny updatedAt
  const prevItems = prev?.items || [];
  const prevMap = new Map(
    prevItems.map((it) => [String(it?.name || "").trim().toLowerCase(), Number(it?.price)])
  );

  const changed = items.some((it) => {
    const k = String(it?.name || "").trim().toLowerCase();
    const before = prevMap.get(k);
    const after = Number(it?.price);
    if (!Number.isFinite(after)) return false;
    if (!Number.isFinite(before)) return true;
    return Math.abs(after - before) > 0.0000001;
  });

  if (changed || !prev) {
    out.updatedAt = new Date().toISOString();
  }

  fs.writeFileSync(path.join(repoRoot, "data/prices.json"), JSON.stringify(out, null, 2));
  console.log("Wrote data/prices.json with", items.length, "items");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
