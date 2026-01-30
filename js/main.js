/* =========================================================
   js/main.js (LÅST til index.html)
   - Matcher id'er i index.html 1:1
   - Tema-toggle stabil (data-theme + localStorage)
   - Opdater -> henter data -> render
   - Graf -> åbner/lukker + redraw ved tema/resize
   ========================================================= */

import { getLatestHoldingsPrices, getEURDKK } from "./api.js";
import { renderPortfolio, renderChart } from "./ui.js";

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
   AFSNIT 02 – Theme
   ========================= */
const THEME_KEY = "aktieapp-theme";

function setTheme(t) {
  const theme = t === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  if (themeIcon) themeIcon.textContent = theme === "dark" ? "🌙" : "☀️";
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return setTheme(saved);

  const htmlTheme = document.documentElement.getAttribute("data-theme") || "dark";
  setTheme(htmlTheme);
}

/* =========================
   AFSNIT 03 – State
   ========================= */
let lastHoldings = null;
let lastEurDkk = null;

function ensureCanvasSize() {
  if (!chartCanvas) return;
  const maxW = Math.min(980, Math.max(560, window.innerWidth - 60));
  chartCanvas.width = maxW;
  chartCanvas.height = 240;
}

/* =========================
   AFSNIT 04 – Load + render
   ========================= */
async function loadAndRender({ reason = "init" } = {}) {
  try {
    if (statusEl) statusEl.textContent = reason === "refresh" ? "Henter nye data..." : "Indlæser data...";

    const refreshedAtISO = new Date().toISOString();

    const eurDkk = await getEURDKK();
    const holdings = await getLatestHoldingsPrices();

    lastHoldings = holdings;
    lastEurDkk = eurDkk;

    renderPortfolio({
      statusEl,
      totalValueEl,
      totalGainEl,
      rowsEl,
      boxTotalEl,
      boxGainEl,
      holdings,
      eurDkk,
      refreshedAtISO
    });

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
   AFSNIT 05 – Graf UI
   ========================= */
function openChart() {
  if (!chartSection) return;
  chartSection.hidden = false;

  if (chartType && !chartType.value) chartType.value = "gain";
  ensureCanvasSize();

  if (lastHoldings) {
    renderChart({ canvas: chartCanvas, holdings: lastHoldings, eurDkk: lastEurDkk, mode: chartType.value });
  }
}

function closeChart() {
  if (!chartSection) return;
  chartSection.hidden = true;
}

/* =========================
   AFSNIT 06 – Events
   ========================= */
initTheme();

btnTheme?.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  setTheme(cur === "dark" ? "light" : "dark");

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
   AFSNIT 07 – Start
   ========================= */
loadAndRender({ reason: "init" });
