/* =========================================================
   main.js
   - App bootstrap, theme, refresh, blink/feedback
   ========================================================= */

import { getLatestHoldingsPrices } from "./api.js";
import { renderTable, renderTotals, toggleChartSection, renderChart } from "./ui.js";

const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");

const refreshBtn = document.getElementById("refresh");
const pdfBtn = document.getElementById("pdf");
const graphBtn = document.getElementById("graph");

const chartClose = document.getElementById("chartClose");
const chartType = document.getElementById("chartType");

const statusEl = document.getElementById("status");
const boxTotal = document.getElementById("boxTotal");
const boxGain = document.getElementById("boxGain");

function setStatus(text) {
  statusEl.textContent = text;
}

function flashBoxes() {
  boxTotal.classList.remove("flash");
  boxGain.classList.remove("flash");
  // trigger reflow så animation kan gentages
  void boxTotal.offsetWidth;
  void boxGain.offsetWidth;
  boxTotal.classList.add("flash");
  boxGain.classList.add("flash");
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);

  // Icon: 🌙 = mørk, ☀️ = lys (vis det du kan skifte til)
  if (theme === "dark") themeIcon.textContent = "☀️";
  else themeIcon.textContent = "🌙";
}

function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") {
    applyTheme(saved);
  } else {
    applyTheme("dark");
  }
}

/* ---------- EVENTS ---------- */
themeToggle?.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
});

graphBtn?.addEventListener("click", () => {
  toggleChartSection(true);
  renderChart(chartType.value);
});

chartClose?.addEventListener("click", () => {
  toggleChartSection(false);
});

chartType?.addEventListener("change", () => {
  renderChart(chartType.value);
});

refreshBtn?.addEventListener("click", async () => {
  await loadAndRender(true);
});

pdfBtn?.addEventListener("click", () => {
  window.print();
});

/* ---------- LOAD + RENDER ---------- */
async function loadAndRender(fromManualClick = false) {
  try {
    setStatus(fromManualClick ? "Henter nye kurser…" : "Indlæser…");

    const data = await getLatestHoldingsPrices();

    renderTable(data);
    renderTotals(data);

    // feedback
    flashBoxes();

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");

    setStatus(`OK — data vist. Senest tjekket: ${hh}.${mm} • Opdateret automatisk af GitHub`);
  } catch (err) {
    console.error(err);
    setStatus("Fejl: kunne ikke hente data (tjek netværk eller API).");
  }
}

/* ---------- START ---------- */
initTheme();
loadAndRender(false);
