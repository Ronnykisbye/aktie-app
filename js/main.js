/* =========================================================
   js/main.js

   Formål:
   - Orkestrerer indlæsning/opdatering
   - Henter data (holdings + aktuelle priser)
   - Anvender korrekt “købspris total” fra purchase-prices.js
   - Renderer UI via ui.js
   - Giver synlig feedback (blink) ved opdatering

   NOTE:
   - Vi ændrer IKKE api.js / ui.js her – vi passer på alt der virker
   ========================================================= */

/* =========================
   AFSNIT 01 – Imports
   ========================= */

import { getLatestHoldingsPrices, getEURDKK } from "./api.js";
import { renderPortfolio } from "./ui.js";
import { getPurchaseTotalDKKByName } from "../data/purchase-prices.js";

/* =========================
   AFSNIT 02 – DOM refs
   ========================= */

const container = document.getElementById("table");        // ui.js renderer hele “pakken” her
const statusEl = document.getElementById("status");
const statusTextEl = document.getElementById("statusText");
const lastUpdatedEl = document.getElementById("lastUpdated");

const btnRefresh = document.getElementById("refresh");

/* =========================
   AFSNIT 03 – Konfiguration
   ========================= */

const PURCHASE_DATE_ISO = "2025-09-10";

/* =========================
   AFSNIT 04 – UI helper (blink)
   ========================= */

function flashRender(el) {
  if (!el) return;
  el.classList.remove("flash");
  // force reflow så animation kan trigges igen
  // eslint-disable-next-line no-unused-expressions
  el.offsetWidth;
  el.classList.add("flash");
}

function setStatus(text) {
  if (statusTextEl) statusTextEl.textContent = text;
}

/* =========================
   AFSNIT 05 – “Købspris total” -> “købskurs pr stk”
   =========================
   Vi har:
   - quantity (antal)
   - current currency (EUR/DKK)
   - purchase total i DKK pr fond

   Vi skal give ui.js en “buyPrice” pr stk i fondens valuta,
   så profit% og profit(DKK) bliver korrekt.
*/

function applyPurchaseTotalsToItems(items, eurDkk) {
  return items.map((it) => {
    const name = it?.name || "";
    const qty = Number(it?.quantity ?? 0) || 0;
    const currency = String(it?.currency || "DKK").toUpperCase();

    const purchaseTotalDKK = getPurchaseTotalDKKByName(name);

    // Hvis vi ikke har et purchase-beløb eller qty=0, så lad CSV buyPrice stå
    if (!purchaseTotalDKK || !qty) return it;

    const buyDKKPerUnit = purchaseTotalDKK / qty;

    // Konverter til fondens valuta (kun relevant for EUR-fonden)
    const buyPriceInFundCurrency =
      currency === "EUR" && eurDkk ? buyDKKPerUnit / eurDkk : buyDKKPerUnit;

    return {
      ...it,
      buyPrice: Number(buyPriceInFundCurrency)
    };
  });
}

/* =========================
   AFSNIT 06 – Load/render
   ========================= */

async function loadAndRender({ reason = "init" } = {}) {
  try {
    setStatus(reason === "refresh" ? "Henter nye data..." : "Indlæser data...");

    // 1) EUR/DKK (bruges til DKK-beregning + EUR købskurs)
    const eurDkk = await getEURDKK();

    // 2) Holdings + seneste priser (api.js har cache-bust for prices.json)
    const holdings = await getLatestHoldingsPrices();

    // 3) Anvend purchase-total (DKK) -> buyPrice pr stk (fondens valuta)
    const items = Array.isArray(holdings?.items) ? holdings.items : [];
    const patchedItems = applyPurchaseTotalsToItems(items, eurDkk);

    const patchedHoldings = {
      ...holdings,
      items: patchedItems
    };

    // 4) Render
    renderPortfolio({
      container,
      statusTextEl,
      lastUpdatedEl,
      holdings: patchedHoldings,
      eurDkk,
      purchaseDateISO: PURCHASE_DATE_ISO
    });

    // 5) Blink så du altid kan se “nu er den renderet igen”
    flashRender(container);

    // 6) Status
    setStatus("OK — data vist.");
  } catch (err) {
    console.error(err);
    setStatus("FEJL — kunne ikke hente eller vise data. Se konsol.");
  }
}

/* =========================
   AFSNIT 07 – Events
   ========================= */

if (btnRefresh) {
  btnRefresh.addEventListener("click", () => {
    loadAndRender({ reason: "refresh" });
  });
}

/* =========================
   AFSNIT 08 – Start
   ========================= */

loadAndRender({ reason: "init" });
