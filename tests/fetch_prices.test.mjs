import test from "node:test";
import assert from "node:assert/strict";

import {
  addHistoryPoint,
  isValidPrice,
  parseNordeaLatestNav,
  toNumber
} from "../scripts/fetch_prices.mjs";

test("læser LatestNAV fra Nordeas HTML-data", () => {
  const html = 'før &quot;LatestNAV&quot;:{&quot;@Date&quot;:&quot;2026-07-17T00:00:00+02:00&quot;,&quot;#&quot;:&quot;229.6808&quot;} efter';
  assert.deepEqual(parseNordeaLatestNav(html), {
    price: 229.6808,
    marketDate: "2026-07-17",
    marketDateISO: "2026-07-16T22:00:00.000Z"
  });
});

test("samme handelsdag erstattes i stedet for at blive kopieret", () => {
  const history = [{ date: "2026-07-17T08:00:00.000Z", price: 150 }];
  assert.deepEqual(addHistoryPoint(history, "2026-07-17", 151), [
    { date: "2026-07-17T12:00:00.000Z", price: 151 }
  ]);
});

test("gammel kunstig historik bliver nulstillet", () => {
  const history = Array.from({ length: 10 }, (_, index) => ({
    date: `2026-07-${String(index + 1).padStart(2, "0")}T20:00:00.000Z`,
    price: 116.01
  }));
  const result = addHistoryPoint(history, "2026-07-20", 116.13, { resetLegacy: true });
  assert.equal(result.length, 1);
  assert.equal(result.at(-1).price, 116.13);
});

test("tal og sikkerhedsgrænser valideres", () => {
  assert.equal(toNumber("1.234,56"), 1234.56);
  assert.equal(isValidPrice({ min: 50, max: 300 }, 150.4), true);
  assert.equal(isValidPrice({ min: 50, max: 300 }, 999), false);
});
