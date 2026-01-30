/* =========================================================
   js/main.js  (BIG)

   Formål:
   - Stabil opdatering + render
   - Stabil tema-toggle (data-theme + localStorage)
   - Stabil graf-panel (åbn/luk + redraw)
   - Korrekt import af purchase-prices fra /data/
   ========================================================= */

/* =========================
   AFSNIT 01 – Imports
   ========================= */
import { getLatestHoldingsPrices, getEURDKK } from "./api.js";
import { renderPortfolio, renderChart } from "./ui.js";
import { getPurchaseTotalDKKByName } from "../data/purchase-prices.js";

/* =========================
   AFSNIT 02 – DOM refs
   ========================= */
const container = document.getElementById("table");

const statusTextEl = document.getElementById("statusText");
const lastUpdatedEl = document.getElementById("lastUpdated");

const btnRefresh = document.getElementById("refresh");
const btnPDF = document.getElementById("pdf");
const btnGraph = document.getElementById("graph");
const btnTheme = document.getElementById("themeToggle");

const graphPanel = document.getElementById("graphPanel");
const graphCanvas = document.getElementById("graphCanvas");
const graphMode = document.getElementById("graphMode");
const graphClose = document.getElementById("graphClose");

/* =========================
   AFSNIT 03 – Konfiguration
   ========================= */
const PURCHASE_DATE_ISO = "2025-09-10";
const THEME_KEY = "aktieapp-theme";

/* =========================
   AFSNIT 04 – UI helpers
   ========================= */
function setStatus(text) {
  if (statusTextEl) statusTextEl.textContent = text;
}

function flashRender(el) {
  if (!el) return;
  el.classList.remove("flash");
  // force reflow (så blink kan trigges igen)
  // eslint-disable-next-line no-unused-expressions
  el.offsetWidth;
  el.classList.add("flash");
}

/* =========================
   AFSNIT 05 – Tema (stabil)
   ========================= */
function setTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem(THEME_KEY, t);

  // ikon på knap
  if (btnTheme) btnTheme.textContent = t === "dark" ? "🌙" : "☀️";
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") {
    setTheme(saved);
    return;
  }

  const htmlTheme = document.documentElement.getAttribute("data-theme") || "dark";
  setTheme(htmlTheme);
}

/* =========================
   AFSNIT 06 – Køb (TOTAL DKK) -> buyPrice pr stk i fondens valuta
   ========================= */
function applyPurchaseTotalsToItems(items, eurDkk) {
  return items.map((it) => {
    const name = it?.name || "";
    const qty = Number(it?.quantity ?? 0) || 0;
    const currency = String(it?.currency || "DKK").toUpperCase();

    const purchaseTotalDKK = getPurchaseTotalDKKByName(name);

    // hvis vi ikke har purchase total eller qty=0 -> behold den buyPrice der evt. kommer fra CSV
    if (!purchaseTotalDKK || !qty) return it;

    const buyDKKPerUnit = purchaseTotalDKK / qty;

    // EUR-fond: konverter DKK -> EUR pr stk (så profit% bliver korrekt)
    const buyPriceInFundCurrency =
      currency === "EUR" && eurDkk ? buyDKKPerUnit / eurDkk : buyDKKPerUnit;

    return {
      ...it,
      buyPrice: Number(buyPriceInFundCurrency)
    };
  });
}

/* =========================
   AFSNIT 07 – State (så graf kan redraw)
   ========================= */
let lastHoldings = null;
let lastEurDkk = null;

/* =========================
   AFSNIT 08 – Load + render
   ========================= */
async function loadAndRender({ reason = "init" } = {}) {
  try {
    setStatus(reason === "refresh" ? "Henter nye data..." : "Indlæser data...");

    // 1) EUR/DKK
    const eurDkk = await getEURDKK();

    // 2) Holdings + seneste priser
    const holdings = await getLatestHoldingsPrices();

    // 3) Patch buyPrice baseret på purchase totals
    const items = Array.isArray(holdings?.items) ? holdings.items : [];
    const patchedItems = applyPurchaseTotalsToItems(items, eurDkk);
    const patchedHoldings = { ...holdings, items: patchedItems };

    // gem state
    lastHoldings = patchedHoldings;
    lastEurDkk = eurDkk;

    // 4) Render tabel + totals
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

    // 5) Hvis graf-panel er åbent: redraw
    if (graphPanel && !graphPanel.hidden) {
      const mode = graphMode?.value || "profit";
      renderChart({ canvas: graphCanvas, holdings: lastHoldings, eurDkk: lastEurDkk, mode });
    }
  } catch (err) {
    console.error(err);
    setStatus("FEJL — kunne ikke hente eller vise data. Se konsol.");
  }
}

/* =========================
   AFSNIT 09 – Graf UI (stabil)
   ========================= */
function openGraph() {
  if (!graphPanel) return;
  graphPanel.hidden = false;

  // default valg
  if (graphMode && (!graphMode.value || graphMode.value === "")) {
    graphMode.value = "profit";
  }

  // tegn hvis vi har data
  if (lastHoldings) {
    renderChart({
      canvas: graphCanvas,
      holdings: lastHoldings,
      eurDkk: lastEurDkk,
      mode: graphMode?.value || "profit"
    });
  } else {
    // ellers hent data først
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

/* =========================
   AFSNIT 10 – Events
   ========================= */
initTheme();

btnTheme?.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  setTheme(cur === "dark" ? "light" : "dark");
});

btnRefresh?.addEventListener("click", () => loadAndRender({ reason: "refresh" }));

btnPDF?.addEventListener("click", () => window.print());

btnGraph?.addEventListener("click", openGraph);
graphClose?.addEventListener("click", closeGraph);

graphMode?.addEventListener("change", () => {
  if (!lastHoldings) return;
  renderChart({
    canvas: graphCanvas,
    holdings: lastHoldings,
    eurDkk: lastEurDkk,
    mode: graphMode.value
  });
});

/* =========================
   AFSNIT 11 – Start
   ========================= */
loadAndRender({ reason: "init" });
