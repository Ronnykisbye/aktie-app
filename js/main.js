/* =========================================================
   main.js – AKTIE APP
   Ansvar:
   - Theme toggle (dark/light)
   - Data loading
   - Rendering af tabel og totals
   - Opdater-knap
   ========================================================= */

import { loadPrices, loadHoldings } from "./api.js";
import { renderTable, renderTotals, renderGraph } from "./ui.js";

/* =========================================================
   AFSNIT 01 – THEME (DETTE VAR FEJLEN)
   ========================================================= */

const themeBtn = document.getElementById("themeToggle");
const root = document.documentElement;

// Init theme
const savedTheme = localStorage.getItem("theme") || "dark";
root.setAttribute("data-theme", savedTheme);
updateThemeIcon(savedTheme);

// Toggle theme
themeBtn?.addEventListener("click", () => {
  const current = root.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";

  root.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  updateThemeIcon(next);
});

function updateThemeIcon(theme) {
  themeBtn.textContent = theme === "dark" ? "🌙" : "☀️";
}

/* =========================================================
   AFSNIT 02 – ELEMENTER
   ========================================================= */

const refreshBtn = document.getElementById("refresh");
const statusText = document.getElementById("statusText");
const lastUpdatedEl = document.getElementById("lastUpdated");
const graphBtn = document.getElementById("graph");
const graphPanel = document.getElementById("graphPanel");
const graphClose = document.getElementById("graphClose");

/* =========================================================
   AFSNIT 03 – OPDATER DATA
   ========================================================= */

async function updateData() {
  try {
    flash();

    const prices = await loadPrices();
    const holdings = await loadHoldings();

    renderTable(prices, holdings);
    renderTotals(prices, holdings);

    const now = new Date();
    statusText.textContent = "OK – data vist. Nye kurser i dag.";
    lastUpdatedEl.textContent =
      "Senest tjekket: " +
      now.toLocaleDateString("da-DK") +
      ", " +
      now.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });

  } catch (err) {
    console.error(err);
    statusText.textContent = "Fejl ved hentning af data";
  }
}

/* =========================================================
   AFSNIT 04 – GRAF
   ========================================================= */

graphBtn?.addEventListener("click", () => {
  graphPanel.hidden = false;
  renderGraph();
});

graphClose?.addEventListener("click", () => {
  graphPanel.hidden = true;
});

/* =========================================================
   AFSNIT 05 – VISUEL FEEDBACK
   ========================================================= */

function flash() {
  const el = document.querySelector(".app");
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}

/* =========================================================
   AFSNIT 06 – INIT
   ========================================================= */

refreshBtn?.addEventListener("click", updateData);

// Kør ved load
updateData();
