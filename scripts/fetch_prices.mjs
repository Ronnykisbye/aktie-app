/* =========================================================
   STABIL MANUEL VERSION
   - Ingen scraping
   - Du styrer kurser
   - Historik bygges korrekt
   ========================================================= */

import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");

const PRICES_PATH = path.join(DATA_DIR, "prices.json");
const MANUAL_PATH = path.join(DATA_DIR, "manual-prices.json");

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function readJSON(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch {
    return fallback;
  }
}

async function main() {
  const manual = await readJSON(MANUAL_PATH, { items: [] });
  const prev = await readJSON(PRICES_PATH, { items: [] });

  const prevMap = new Map(prev.items.map(i => [i.name, i]));

  const results = [];

  for (const m of manual.items) {
    const prevItem = prevMap.get(m.name);

    const history = Array.isArray(prevItem?.history)
      ? prevItem.history
      : [];

    history.push({
      date: today(),
      price: m.price
    });

    results.push({
      name: m.name,
      currency: m.currency,
      price: m.price,
      updatedAt: new Date().toISOString(),
      source: "manual",
      history
    });
  }

  const out = {
    updatedAt: new Date().toISOString(),
    source: "manual",
    items: results
  };

  await fs.writeFile(PRICES_PATH, JSON.stringify(out, null, 2));

  console.log("✅ Manual update OK");
}

main();
