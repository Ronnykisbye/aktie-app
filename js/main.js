/* =========================================================
   js/main.js (LÅST til index.html DOM)
   - Bruger KUN id'er der findes i index.html
   - Stabil tema-toggle
   - Stabil graf (open/close + redraw)
   - Status inkluderer "Sidst opdateret" (lokal tid)
   ========================================================= */

import { getLatestHoldingsPrices, getEURDKK } from "./api.js";
import { renderPortfolio, renderChart } from "./ui.js";
import { getPurchaseTotalDKKByName } from "../data/purchase-prices.js";

/* =========================
   AFSNIT 01 – DOM refs (MATCHER index.html)
   ========================= */
const btnTheme = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");

const btnRefresh = document.getElementById("refresh");
const btnPDF = document.getElementById("pdf");
const btnGraph = document.getElementById("graph");

const statusEl = document.getElementById("status");

const boxTotalEl = document.getElementById("boxTotal");
const totalValueEl = document.getElementById("totalValue");

const boxGainEl = document.getElementById("boxGain");
const totalGainEl = document.getElementById("totalGain");

const rowsEl = document.getElementById("fundRows");

const chartSection = document.getElementById("chartSection");
const chartClose = document.getElementById("chartClose");
const chartType = document.getElementById("chartType");
const chartCanvas = document.getElementById("chartCanvas");

/* =========================
   AFSNIT 02 – Konfig
   ========================= */
const THEME_KEY = "aktieapp-theme";

/* =========================
   AFSNIT 03 – Tema (stabil)
   ========================= */
function setTheme(t) {
  const theme = t === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  if (themeIcon) themeIcon.textContent = theme === "dark" ? "🌙" : "☀️";
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return setTheme(saved);

  // fallback: brug det der står i HTML (default dark)
  const htmlTheme = document.documentElement.getAttribute("data-theme") || "dark";
  setTheme(htmlTheme);
}

/* =========================
   AFSNIT 04 – Purchase totals -> buyPrice pr stk
   ========================= */
function applyPurchaseTotalsToItems(items, eurDkk) {
  return items.map((it) => {
    const name = it?.name || "";
    const qty = Number(it?.quantity ?? 0) || 0;
    const currency = String(it?.currency || "DKK").toUpperCase();
    const purchaseTotalDKK = getPurchaseTotalDKKByName(name);

    if (!purchaseTotalDKK || !qty) return it;

    const buyDKKPerUnit = purchaseTotalDKK / qty;
    const buyPriceInFundCurrency = currency === "EUR" && eurDkk ? buyDKKPerUnit / eurDkk : buyDKKPerUnit;

    return { ...it, buyPrice: Number(buyPriceInFundCurrency) };
  });
}

/* =========================
   AFSNIT 05 – State (graf redraw)
   ========================= */
let lastHoldings = null;
let lastEurDkk = null;

/* =========================
   AFSNIT 06 – Canvas size (så den ser ens ud)
   ========================= */
function ensureCanvasSize() {
  if (!chartCanvas) return;
  // 900 bred gør labels mere læsbare, men vi tilpasser hvis mobil
  const maxW = Math.min(980, Math.max(520, window.innerWidth - 60));
  chartCanvas.width = maxW;
  chartCanvas.height = 220;
}

/* =========================
   AFSNIT 07 – Load + render
   ========================= */
async function loadAndRender({ reason = "init" } = {}) {
  try {
    if (statusEl) statusEl.textContent = reason === "refresh" ? "Henter nye data..." : "Indlæser data...";

    const refreshedAtISO = new Date().toISOString();

    // 1) EUR/DKK
    const eurDkk = await getEURDKK();

    // 2) Holdings
    const holdings = await getLatestHoldingsPrices();

    // 3) Patch buyPrice fra purchase totals
    const items = Array.isArray(holdings?.items) ? holdings.items : [];
    const patchedItems = applyPurchaseTotalsToItems(items, eurDkk);
    const patchedHoldings = { ...holdings, items: patchedItems };

    lastHoldings = patchedHoldings;
    lastEurDkk = eurDkk;

    // 4) Render stats + tabel + status
    renderPortfolio({
      statusEl,
      totalValueEl,
      totalGainEl,
      rowsEl,
      boxTotalEl,
      boxGainEl,
      holdings: patchedHoldings,
      eurDkk,
      refreshedAtISO
    });

    // 5) hvis graf åben: redraw
    if (chartSection && !chartSection.hidden) {
      ensureCanvasSize();
      renderChart({
        canvas: chartCanvas,
        holdings: lastHoldings,
        eurDkk: lastEurDkk,
        mode: chartType?.value || "gain"
      });
    }
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.textContent = "FEJL — kunne ikke hente eller vise data. Se konsol.";
  }
}

/* =========================
   AFSNIT 08 – Graf UI (stabil)
   ========================= */
function openChart() {
  if (!chartSection) return;
  chartSection.hidden = false;

  if (!chartType.value) chartType.value = "gain";

  ensureCanvasSize();

  if (lastHoldings) {
    renderChart({ canvas: chartCanvas, holdings: lastHoldings, eurDkk: lastEurDkk, mode: chartType.value });
  } else {
    loadAndRender({ reason: "init" }).then(() => {
      ensureCanvasSize();
      renderChart({ canvas: chartCanvas, holdings: lastHoldings, eurDkk: lastEurDkk, mode: chartType.value });
    });
  }
}

function closeChart() {
  if (!chartSection) return;
  chartSection.hidden = true;
}

/* =========================
   AFSNIT 09 – Events
   ========================= */
initTheme();

btnTheme?.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  setTheme(cur === "dark" ? "light" : "dark");

  // redraw chart hvis den er åben (så tekstfarver passer)
  if (chartSection && !chartSection.hidden && lastHoldings) {
    ensureCanvasSize();
    renderChart({ canvas: chartCanvas, holdings: lastHoldings, eurDkk: lastEurDkk, mode: chartType?.value || "gain" });
  }
});

btnRefresh?.addEventListener("click", () => loadAndRender({ reason: "refresh" }));
btnPDF?.addEventListener("click", () => window.print());
btnGraph?.addEventListener("click", openChart);

chartClose?.addEventListener("click", closeChart);

chartType?.addEventListener("change", () => {
  if (!lastHoldings) return;
  ensureCanvasSize();
  renderChart({ canvas: chartCanvas, holdings: lastHoldings, eurDkk: lastEurDkk, mode: chartType.value });
});

window.addEventListener("resize", () => {
  if (chartSection && !chartSection.hidden && lastHoldings) {
    ensureCanvasSize();
    renderChart({ canvas: chartCanvas, holdings: lastHoldings, eurDkk: lastEurDkk, mode: chartType?.value || "gain" });
  }
});

/* =========================
   AFSNIT 10 – Start
   ========================= */
loadAndRender({ reason: "init" });
