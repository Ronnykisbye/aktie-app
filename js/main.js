/* =========================================================
   AFSNIT 01 – Imports
   ========================================================= */
import { getLatestHoldingsPrices, getEURDKK } from "./api.js";
import { renderPortfolio } from "./ui.js";
import { loadTheme, toggleTheme } from "./theme.js";

/* =========================================================
   AFSNIT 02 – DOM
   ========================================================= */
const elStatusText = document.getElementById("statusText");
const elLastUpdated = document.getElementById("lastUpdated");
const elTable = document.getElementById("table");

const btnRefresh = document.getElementById("refresh");
const btnGraph = document.getElementById("graph");
const graphPanel = document.getElementById("graphPanel");
const graphClose = document.getElementById("graphClose");
const graphMode = document.getElementById("graphMode");
const graphCanvas = document.getElementById("graphCanvas");

const themeToggle = document.getElementById("themeToggle");

/* =========================================================
   AFSNIT 03 – State
   ========================================================= */
let lastHoldings = null;
let lastEurDkk = null;

/* =========================================================
   AFSNIT 04 – Init
   ========================================================= */
loadTheme();

themeToggle?.addEventListener("click", () => {
  const next = toggleTheme();
  themeToggle.textContent = next === "light" ? "🌙" : "☀️";

  // Hvis grafen er åben, så redraw med nye farver (vigtigt i light mode)
  if (!graphPanel?.hidden) {
    drawCurrentGraph();
  }
});

/* =========================================================
   AFSNIT 05 – Refresh flow
   ========================================================= */
async function refreshAll() {
  try {
    elStatusText.textContent = "Henter data…";

    const [holdings, eurDkk] = await Promise.all([
      getLatestHoldingsPrices(),
      getEURDKK()
    ]);

    lastHoldings = holdings;
    lastEurDkk = eurDkk;

    renderPortfolio({
      container: elTable,
      statusTextEl: elStatusText,
      lastUpdatedEl: elLastUpdated,
      holdings,
      eurDkk,
      purchaseDateISO: "2025-09-10"
    });

    // Hvis grafen er åben, opdater den også
    if (!graphPanel?.hidden) {
      drawCurrentGraph();
    }
  } catch (err) {
    console.error(err);
    elStatusText.textContent = "⚠️ Fejl – kunne ikke hente data.";
  }
}

btnRefresh?.addEventListener("click", refreshAll);

/* =========================================================
   AFSNIT 06 – Graf UI
   ========================================================= */
btnGraph?.addEventListener("click", () => {
  graphPanel.hidden = false;
  drawCurrentGraph();
});

graphClose?.addEventListener("click", () => {
  graphPanel.hidden = true;
});

graphMode?.addEventListener("change", drawCurrentGraph);

/* =========================================================
   AFSNIT 06B – Graf: farver der virker i både lys/mørk
   ========================================================= */
function getCanvasPalette(){
  const theme = document.documentElement.getAttribute("data-theme") || "dark";

  // Light: mørk tekst
  if (theme === "light") {
    return {
      title: "#0c1722",
      text:  "#0c1722",
      label: "rgba(12,23,34,0.85)",
      grid:  "rgba(12,23,34,0.22)",
      note:  "rgba(12,23,34,0.55)"
    };
  }

  // Dark: lys tekst
  return {
    title: "#cfe8ff",
    text:  "#cfe8ff",
    label: "rgba(207,232,255,0.85)",
    grid:  "rgba(207,232,255,0.35)",
    note:  "rgba(207,232,255,0.6)"
  };
}

/* =========================================================
   AFSNIT 06C – Tegn graf (bar chart)
   ========================================================= */
function clearCanvas(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
}

function drawBarChart({ title, series }) {
  if (!graphCanvas) return;

  const ctx = graphCanvas.getContext("2d");
  const w = graphCanvas.width;
  const h = graphCanvas.height;

  clearCanvas(ctx, w, h);

  const pal = getCanvasPalette();

  // Layout
  const padL = 40;
  const padR = 16;
  const padT = 28;
  const padB = 42;

  // Titel
  ctx.font = "bold 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillStyle = pal.title;
  ctx.fillText(title, padL, 18);

  if (!series?.length) {
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = pal.text;
    ctx.fillText("Ingen data til graf.", padL, 50);
    return;
  }

  const values = series.map(s => Number(s.value) || 0);
  const maxAbs = Math.max(1, ...values.map(v => Math.abs(v)));

  // Akse-område
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const baseY = padT + chartH;

  // 0-linje hvis der er både +/-
  const hasNeg = values.some(v => v < 0);
  const hasPos = values.some(v => v > 0);

  let zeroY = baseY;
  if (hasNeg && hasPos) {
    zeroY = padT + chartH / 2;
  } else if (hasNeg && !hasPos) {
    zeroY = padT;
  } else {
    zeroY = baseY;
  }

  // Grid line
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, zeroY);
  ctx.lineTo(padL + chartW, zeroY);
  ctx.stroke();

  // Bars
  const gap = 16;
  const barW = (chartW - gap * (series.length - 1)) / series.length;

  ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.textAlign = "center";

  series.forEach((s, i) => {
    const v = Number(s.value) || 0;
    const x = padL + i * (barW + gap);

    const barH = (Math.abs(v) / maxAbs) * (hasNeg && hasPos ? chartH / 2 : chartH);

    const y = v >= 0 ? zeroY - barH : zeroY;
    const hBar = barH;

    // Bar color
    ctx.fillStyle =
      v > 0 ? "rgba(0,200,140,0.85)" :
      v < 0 ? "rgba(230,80,80,0.85)" :
      "rgba(50,150,255,0.75)";

    ctx.fillRect(x, y, barW, hBar);

    // Value text (over bar)
    const valueText = `${(Number(s.value) || 0).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DKK`;
    ctx.fillStyle = pal.text;
    const vtY = v >= 0 ? y - 8 : y + hBar + 16;
    ctx.fillText(valueText, x + barW / 2, vtY);

    // Label (under)
    ctx.fillStyle = pal.label;
    ctx.fillText(s.label, x + barW / 2, baseY + 20);
  });

  // Note
  ctx.fillStyle = pal.note;
  ctx.textAlign = "left";
  ctx.fillText("Bemærk: Grafen viser nuværende data (ingen historik endnu).", padL, h - 12);
}

/* =========================================================
   AFSNIT 06D – Vælg hvad der vises
   ========================================================= */
function drawCurrentGraph() {
  if (!lastHoldings) return;

  const mode = graphMode?.value || "profit";
  const items = Array.isArray(lastHoldings.items) ? lastHoldings.items : [];

  if (mode === "profit") {
    const series = items.map(it => ({
      label: (it.short || it.name || "").replace("Nordea ", "").slice(0, 22),
      value: Number(it.gainDkk ?? it.profitDkk ?? 0) || 0
    }));
    drawBarChart({ title: "Gevinst/tab (DKK) pr. fond", series });
    return;
  }

  if (mode === "price_all") {
    const series = items.map(it => ({
      label: (it.short || it.name || "").replace("Nordea ", "").slice(0, 22),
      value: Number(it.priceDkk ?? it.price ?? 0) || 0
    }));
    drawBarChart({ title: "Kurs (DKK) pr. fond", series });
    return;
  }

  drawBarChart({ title: "Graf", series: [] });
}


/* =========================================================
   AFSNIT 07 – Core: Load + render
   ========================================================= */
async function loadAndRender() {
  try {
    setStatus("Henter data…");

    const [eurDkk, holdingsRaw] = await Promise.all([
      getEURDKK(),
      getLatestHoldingsPrices()
    ]);

    let holdings = holdingsRaw;

    if (!hasValidHoldingsQuantities(holdings)) {
      console.warn("⚠️ CSV merge mangler – kører fallback merge fra fonde.csv");
      holdings = await mergeFromFondeCsv(holdings);
    }

    // Gem seneste data til graf
    latest.holdings = holdings;
    latest.eurDkk = eurDkk;

    renderPortfolio({
      container: el.table,
      statusTextEl: el.statusText,
      lastUpdatedEl: el.lastUpdated,
      holdings,
      eurDkk,
      purchaseDateISO: PURCHASE_DATE_ISO
    });

    // ✅ Tilføj “Senest tjekket: …” efter renderPortfolio har sat status
    appendCheckedAt();

    // Hvis grafpanelet er åbent, redraw
    renderGraphIfPossible();

  } catch (err) {
    console.error(err);
    setStatus("Fejl – kunne ikke hente data.");
    if (el.lastUpdated) el.lastUpdated.textContent = "Seneste handelsdag: —";
  }
}

/* =========================================================
   AFSNIT 08 – Events
   ========================================================= */
function initEvents() {
  if (el.refresh) el.refresh.addEventListener("click", loadAndRender);

  // Graf UI: åbne/lukke + redraw
  if (el.graphBtn && el.graphPanel) {
    el.graphBtn.addEventListener("click", () => {
      el.graphPanel.hidden = !el.graphPanel.hidden;
      // Tegn hvis åbent og mode allerede valgt
      renderGraphIfPossible();
    });
  }

  if (el.graphClose && el.graphPanel) {
    el.graphClose.addEventListener("click", () => {
      el.graphPanel.hidden = true;
    });
  }

  if (el.graphMode) {
    el.graphMode.addEventListener("change", () => {
      renderGraphIfPossible();
    });
  }
}

/* =========================================================
   AFSNIT 09 – Boot
   ========================================================= */
initTheme();
initEvents();
loadAndRender();
