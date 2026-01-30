/* =========================================================
   js/main.js

   Formål:
   - Orkestrerer indlæsning/opdatering
   - Renderer UI via ui.js
   - FIX: Stabil graf (import/export matcher 100%)
   - FIX: Stabil theme toggle (lokal storage + data-theme)

   VIGTIGT:
   - Små kontrollerede ændringer
   ========================================================= */

import { getLatestHoldingsPrices, getEURDKK } from "./api.js";
import { renderPortfolio, renderChart } from "./ui.js";
import { getPurchaseTotalDKKByName } from "./purchase-prices.js";

/* =========================================================
   AFSNIT 01 – DOM refs
   ========================================================= */
const container = document.getElementById("table");

const statusTextEl = document.getElementById("statusText");
const lastUpdatedEl = document.getElementById("lastUpdated");

const btnRefresh = document.getElementById("refresh");
const btnTheme = document.getElementById("themeToggle");

const btnGraph = document.getElementById("graph");
const graphPanel = document.getElementById("graphPanel");
const graphClose = document.getElementById("graphClose");
const graphMode = document.getElementById("graphMode");
const graphCanvas = document.getElementById("graphCanvas");

/* =========================================================
   AFSNIT 02 – Konfiguration
   ========================================================= */
const PURCHASE_DATE_ISO = "2025-09-10";
const THEME_KEY = "aktieapp-theme";

/* =========================================================
   AFSNIT 03 – Tema (stabil)
   ========================================================= */
function setTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem(THEME_KEY, t);

  if (btnTheme) btnTheme.textContent = t === "dark" ? "🌙" : "☀️";
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") {
    setTheme(saved);
    return;
  }
  // fallback: behold det der står i HTML
  const htmlTheme = document.documentElement.getAttribute("data-theme") || "dark";
  setTheme(htmlTheme);
}

/* =========================================================
   AFSNIT 04 – Blink helper
   ========================================================= */
function flashRender(el) {
  if (!el) return;
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}

function setStatus(text) {
  if (statusTextEl) statusTextEl.textContent = text;
}

/* =========================================================
   AFSNIT 05 – Purchase totals -> buyPrice pr stk (valuta)
   ========================================================= */
function applyPurchaseTotalsToItems(items, eurDkk) {
  return items.map((it) => {
    const name = it?.name || "";
    const qty = Number(it?.quantity ?? 0) || 0;
    const currency = String(it?.currency || "DKK").toUpperCase();

    const purchaseTotalDKK = getPurchaseTotalDKKByName(name);

    if (!purchaseTotalDKK || !qty) return it;

    const buyDKKPerUnit = purchaseTotalDKK / qty;

    const buyPriceInFundCurrency =
      currency === "EUR" && eurDkk ? buyDKKPerUnit / eurDkk : buyDKKPerUnit;

    return { ...it, buyPrice: Number(buyPriceInFundCurrency) };
  });
}

/* =========================================================
   AFSNIT 06 – Data state (så graf kan gen-tegnes)
   ========================================================= */
let lastHoldings = null;
let lastEurDkk = null;

/* =========================================================
   AFSNIT 07 – Load/render
   ========================================================= */
async function loadAndRender({ reason = "init" } = {}) {
  try {
    setStatus(reason === "refresh" ? "Henter nye data..." : "Indlæser data...");

    const eurDkk = await getEURDKK();
    const holdings = await getLatestHoldingsPrices();

    const items = Array.isArray(holdings?.items) ? holdings.items : [];
    const patchedItems = applyPurchaseTotalsToItems(items, eurDkk);

    const patchedHoldings = { ...holdings, items: patchedItems };

    lastHoldings = patchedHoldings;
    lastEurDkk = eurDkk;

    renderPortfolio({
      container,
      statusTextEl,
      lastUpdatedEl,
      holdings: patchedHoldings,
      eurDkk,
      purchaseDateISO: PURCHASE_DATE_ISO
    });

    flashRender(container);
    setStatus("OK — data vist.");

    // hvis grafpanel er åbent, så tegn igen
    if (graphPanel && !graphPanel.hidden) {
      const mode = graphMode?.value || "profit";
      renderChart({ canvas: graphCanvas, holdings: lastHoldings, eurDkk: lastEurDkk, mode });
    }
  } catch (err) {
    console.error(err);
    setStatus("FEJL — kunne ikke hente eller vise data. Se konsol.");
  }
}

/* =========================================================
   AFSNIT 08 – Graf UI (stabil)
   ========================================================= */
function openGraph() {
  if (!graphPanel) return;
  graphPanel.hidden = false;

  // hvis der ikke er valgt noget, så sæt default
  if (graphMode && (!graphMode.value || graphMode.value === "")) {
    graphMode.value = "profit";
  }

  if (lastHoldings) {
    renderChart({
      canvas: graphCanvas,
      holdings: lastHoldings,
      eurDkk: lastEurDkk,
      mode: graphMode?.value || "profit"
    });
  } else {
    // hvis data ikke er loaded endnu, så hent først
    loadAndRender({ reason: "init" }).then(() => {
      renderChart({
        canvas: graphCanvas,
        holdings: lastHoldings,
        eurDkk: lastEurDkk,
        mode: graphMode?.value || "profit"
      });
    });
  }
}

function closeGraph() {
  if (!graphPanel) return;
  graphPanel.hidden = true;
}

/* =========================================================
   AFSNIT 09 – Events
   ========================================================= */
initTheme();

btnTheme?.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  setTheme(cur === "dark" ? "light" : "dark");
});

btnRefresh?.addEventListener("click", () => loadAndRender({ reason: "refresh" }));

btnGraph?.addEventListener("click", openGraph);
graphClose?.addEventListener("click", closeGraph);

graphMode?.addEventListener("change", () => {
  if (!lastHoldings) return;
  renderChart({ canvas: graphCanvas, holdings: lastHoldings, eurDkk: lastEurDkk, mode: graphMode.value });
});

/* =========================================================
   AFSNIT 10 – Start
   ========================================================= */
loadAndRender({ reason: "init" });
