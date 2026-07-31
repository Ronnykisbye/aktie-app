import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getDividendByName,
  getTotalGrossDividendsDKK
} from "../data/purchase-prices.js";
import {
  buildPortfolioSeries,
  calcCurrentFundNumbers
} from "../js/ui.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFile(path.join(ROOT, file), "utf8");

test("brugerfladen har alle elementer som JavaScript forventer", async () => {
  const html = await read("index.html");
  const requiredIds = [
    "refresh", "pdf", "graph", "themeToggle", "themeIcon", "status",
    "boxTotal", "totalValue", "boxGain", "totalGain", "totalBreakdown", "fundRows",
    "chartSection", "chartClose", "chartType", "chartCanvas", "chartSummary"
  ];

  for (const id of requiredIds) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `Mangler #${id}`);
  }
});

test("porteføljegrafen bruger kun fælles handelsdage og viser procentændring", () => {
  const result = buildPortfolioSeries([
    {
      name: "Fond A",
      currency: "DKK",
      quantity: 1,
      history: [
        { date: "2026-07-20T12:00:00.000Z", price: 100 },
        { date: "2026-07-21T12:00:00.000Z", price: 110 },
        { date: "2026-07-22T12:00:00.000Z", price: 120 }
      ]
    },
    {
      name: "Fond B",
      currency: "DKK",
      quantity: 2,
      history: [
        { date: "2026-07-20T12:00:00.000Z", price: 50 },
        { date: "2026-07-21T12:00:00.000Z", price: 55 }
      ]
    }
  ], 7.45, { percentage: true });

  assert.deepEqual(result.dates, ["2026-07-20", "2026-07-21"]);
  assert.deepEqual(result.totals, [200, 220]);
  assert.equal(result.series[0].values[0], 0);
  assert.ok(Math.abs(result.series[0].values[1] - 10) < 1e-10);
  assert.equal(result.changeDKK, 20);
  assert.equal(result.changePct, 10);
});

test("samlet afkast medregner de dokumenterede bruttoudbytter", () => {
  assert.equal(getDividendByName("Nordea Invest Europe Enhanced KL 1").grossTotalDKK, 13686.40);
  assert.equal(getDividendByName("Nordea Invest Global Enhanced KL 1").grossTotalDKK, 6615.60);
  assert.equal(getTotalGrossDividendsDKK(), 20302);

  const result = calcCurrentFundNumbers({
    currency: "DKK",
    quantity: 1,
    price: 110,
    buyPrice: 100,
    _dividendTotalDKK: 5
  }, 7.45);

  assert.equal(result.priceGain, 10);
  assert.equal(result.dividend, 5);
  assert.equal(result.gain, 15);
  assert.equal(result.pct, 15);
});

test("alle lokale filer som index.html henviser til findes", async () => {
  const html = await read("index.html");
  const references = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((value) => !/^(?:https?:|#|data:)/.test(value));

  for (const reference of references) {
    await assert.doesNotReject(
      fs.access(path.join(ROOT, reference)),
      `Mangler filen ${reference}`
    );
  }
});

test("den gemte kursfil indeholder officiel og entydig handelshistorik", async () => {
  const prices = JSON.parse(await read("data/prices.json"));
  assert.equal(prices.source, "official-nordea");
  assert.equal(prices.items.length, 3);

  for (const item of prices.items) {
    assert.equal(item.source, "official-nordea", `${item.isin} bruger ikke officiel kilde`);
    assert.equal(item.historyVersion, 2);
    assert.ok(Number.isFinite(item.price) && item.price > 0, `${item.isin} har ugyldig kurs`);
    assert.match(item.marketDate, /^\d{4}-\d{2}-\d{2}$/);

    const days = item.history.map((point) => String(point.date).slice(0, 10));
    assert.equal(new Set(days).size, days.length, `${item.isin} har flere punkter samme handelsdag`);
  }
});

test("manuelle kurser er deaktiveret som standard", async () => {
  const manual = JSON.parse(await read("data/manual-prices.json"));
  assert.ok(manual.items.length > 0);
  assert.ok(manual.items.every((item) => item.enabled === false));
});

test("service worker bruger den korrekte sti til kursfilen", async () => {
  const worker = await read("service-worker.js");
  assert.match(worker, /\.\/data\/prices\.json/);
  assert.doesNotMatch(worker, /["']\.\/prices\.json["']/);
});
