/**
 * =========================================================
 * AFSNIT 01 – Formål
 * =========================================================
 * Henter fondskurser og gemmer historik (90 dage)
 * Bruges af GitHub Actions
 */

import fs from "node:fs";
import path from "node:path";

/**
 * =========================================================
 * AFSNIT 02 – Kilder
 * =========================================================
 */
const SOURCES = [
  {
    name: "Nordea Invest Europe Enhanced KL 1",
    currency: "DKK",
    url: "https://m.netdania.com/funds/ndieuenhkl1-co/idc-dla-eq",
    parser: "netdania"
  },
  {
    name: "Nordea Invest Global Enhanced KL 1",
    currency: "DKK",
    url: "https://m.netdania.com/funds/ndiglenhkl1-co/idc-dla-eq",
    parser: "netdania"
  },
  {
    name: "Nordea Empower Europe Fund BQ",
    currency: "EUR",
    url: "https://fundsnow.os.fundconnect.com/solutions/default/fundinfo?clientID=FIIF&currency=EUR&isin=LU3076185670&language=en-GB",
    parser: "fundconnect"
  }
];

const HISTORY_DAYS = 90;

/**
 * =========================================================
 * AFSNIT 03 – Hjælpere
 * =========================================================
 */
function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function todayISO() {
  return new Date().toISOString();
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function toFloat(v) {
  return Number(String(v).replace(",", "."));
}

/**
 * =========================================================
 * AFSNIT 04 – Parsere
 * =========================================================
 */
function parseNetdania(html) {
  const price = html.match(/\n\s*([0-9]+[.,][0-9]+)\s*\n/)?.[1];
  const time = html.match(/\n\s*(\d{1,2}-[A-Za-z]+-\d{2}\s+\d{2}:\d{2}:\d{2})\s*\n/)?.[1];

  if (!price || !time) throw new Error("NetDania parse error");

  return {
    price: toFloat(price),
    iso: new Date(time.replace(/-/g, " ")).toISOString()
  };
}

function parseFundConnect(html) {
  const m = html.match(/NAV\s+([\d.,]+)\s+as\s+of\s+(\d{2}\/\d{2})/i);
  if (!m) throw new Error("FundConnect parse error");

  const [_, price, date] = m;
  const [dd, mm] = date.split("/");
  const year = new Date().getFullYear();

  const iso = new Date(Date.UTC(year, mm - 1, dd, 12, 0, 0)).toISOString();

  return {
    price: toFloat(price),
    iso
  };
}

/**
 * =========================================================
 * AFSNIT 05 – Main
 * =========================================================
 */
async function main() {
  const outFile = path.join(process.cwd(), "data/prices.json");
  const previous = readJSON(outFile);

  const result = {
    updatedAt: todayISO(),
    source: "github-action",
    items: []
  };

  for (const src of SOURCES) {
    let price, iso;

    try {
      const html = await fetch(src.url).then(r => r.text());
      const parsed =
        src.parser === "netdania"
          ? parseNetdania(html)
          : parseFundConnect(html);

      price = parsed.price;
      iso = parsed.iso;
    } catch {
      const prev = previous?.items?.find(i => i.name === src.name);
      if (!prev) throw new Error(`No fallback for ${src.name}`);
      price = prev.price;
      iso = previous.updatedAt;
    }

    const today = todayDateOnly();
    const prevHistory = previous?.items?.find(i => i.name === src.name)?.history || [];

    const history = [
      { date: today, price },
      ...prevHistory.filter(h => h.date !== today)
    ].slice(0, HISTORY_DAYS);

    result.items.push({
      name: src.name,
      currency: src.currency,
      price,
      history
    });
  }

  writeJSON(outFile, result);
  console.log("✔ prices.json updated with history");
}

main();
