import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFile(path.join(ROOT, file), "utf8");

test("brugerfladen har alle elementer som JavaScript forventer", async () => {
  const html = await read("index.html");
  const requiredIds = [
    "refresh", "pdf", "graph", "themeToggle", "themeIcon", "status",
    "boxTotal", "totalValue", "boxGain", "totalGain", "fundRows",
    "chartSection", "chartClose", "chartType", "chartCanvas"
  ];

  for (const id of requiredIds) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `Mangler #${id}`);
  }
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
