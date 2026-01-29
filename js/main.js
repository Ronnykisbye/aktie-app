/* =========================================================
   js/main.js
   FIXES:
   - Graf: værdier tegnes i selve søjlen (ingen overlap med overskrift)
   - Graf: palette pr tema (læsbar i light/dark)
   - Blink: visuel feedback ved render
   ========================================================= */

import { getLatestHoldingsPrices, getEURDKK } from "./api.js";
import { renderPortfolio } from "./ui.js";
import { PURCHASE_DATE_ISO } from "./config.js";

const el = {
  refresh: document.getElementById("refresh"),
  table: document.getElementById("table"),
  statusText: document.getElementById("statusText"),
  lastUpdated: document.getElementById("lastUpdated"),
  themeToggle: document.getElementById("themeToggle"),

  graphBtn: document.getElementById("graph"),
  graphPanel: document.getElementById("graphPanel"),
  graphClose: document.getElementById("graphClose"),
  graphMode: document.getElementById("graphMode"),
  graphCanvas: document.getElementById("graphCanvas")
};

/* =========================================================
   AFSNIT 03 – Theme
   ========================================================= */
function applyTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t);
  if (el.themeToggle) el.themeToggle.textContent = t === "dark" ? "☀️" : "🌙";
  localStorage.setItem("aktie_theme", t);

  renderGraphIfPossible();
}

function initTheme() {
  const saved = localStorage.getItem("aktie_theme");
  applyTheme(saved || "light");

  if (el.themeToggle) {
    el.themeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      applyTheme(current === "dark" ? "light" : "dark");
    });
  }
}

/* =========================================================
   AFSNIT 04 – Status + Senest tjekket + Blink
   ========================================================= */
function formatLocalNow(d = new Date()) {
  return new Intl.DateTimeFormat("da-DK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}

function setStatus(text) {
  if (el.statusText) el.statusText.textContent = text;
}

function appendCheckedAt() {
  if (!el.statusText) return;

  const base = el.statusText.textContent || "";
  const checkedAt = formatLocalNow(new Date());

  localStorage.setItem("aktie_last_checked_at", checkedAt);

  const cleaned = base.replace(/\s*•\s*Senest tjekket:.*$/i, "").trim();
  el.statusText.textContent = `${cleaned} • Senest tjekket: ${checkedAt}`;
}

function flash(node) {
  if (!node) return;
  node.classList.remove("flash");
  void node.offsetWidth; // force reflow
  node.classList.add("flash");
}

/* =========================================================
   AFSNIT 05 – CSV fallback merge
   ========================================================= */
function hasValidHoldingsQuantities(holdings) {
  const items = holdings?.items || [];
  if (!items.length) return false;
  return items.some(x => Number(x.quantity ?? x.Antal ?? 0) > 0);
}

function parseCsvSimple(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map(s => s.trim());

  return lines.slice(1).map(line => {
    const parts = line.split(",").map(s => s.trim());
    const row = {};
    header.forEach((h, i) => (row[h] = parts[i] ?? ""));
    return row;
  });
}

async function mergeFromFondeCsv(holdings) {
  const res = await fetch("fonde.csv?t=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("Kunne ikke hente fonde.csv (" + res.status + ")");
  const csvText = await res.text();

  const rows = (window.Papa && window.Papa.parse)
    ? window.Papa.parse(csvText, { header: true, skipEmptyLines: true }).data
    : parseCsvSimple(csvText);

  const map = new Map(
    rows.map(r => [String(r.Navn || "").trim().toLowerCase(), r])
  );

  const items = (holdings?.items || []).map(it => {
    const key = String(it.name || "").trim().toLowerCase();
    const r = map.get(key);
    if (!r) return it;

    return {
      ...it,
      currency: (it.currency || r.Valuta || "DKK"),
      buyPrice: Number(r["KøbsKurs"] ?? r.KøbsKurs ?? 0),
      quantity: Number(r.Antal ?? 0)
    };
  });

  return { ...holdings, items };
}

/* =========================================================
   AFSNIT 06 – Graf
   ========================================================= */
let latest = { holdings: null, eurDkk: 0 };

function toDKK(price, currency, eurDkk) {
  const p = Number(price);
  if (!Number.isFinite(p)) return 0;

  const c = String(currency || "DKK").toUpperCase();
  if (c === "DKK") return p;
  if (c === "EUR") return p * Number(eurDkk || 0);
  return p;
}

function buildGraphSeries(mode, holdings, eurDkk) {
  const list = Array.isArray(holdings?.items) ? holdings.items : [];

  return list.map(it => {
    const name = it.name || "Ukendt";
    const units = Number(it.quantity ?? it.Antal ?? 0);
    const currency = (it.currency || "DKK").toUpperCase();
    const current = Number(it.price ?? it.Kurs ?? 0);
    const buy = Number(it.buyPrice ?? it.KøbsKurs ?? 0);

    const currentDKK = toDKK(current, currency, eurDkk);
    const buyDKK = toDKK(buy, currency, eurDkk);
    const profitDKK = units * (currentDKK - buyDKK);

    if (mode === "profit") return { label: name, value: profitDKK, unit: "DKK" };
    if (mode === "price_all") return { label: name, value: currentDKK, unit: "DKK" };
    return { label: name, value: 0, unit: "" };
  });
}

function getCanvasPalette() {
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  if (theme === "light") {
    return {
      title: "#0c1722",
      text: "#0c1722",
      label: "rgba(12,23,34,0.80)",
      grid: "rgba(12,23,34,0.20)",
      note: "rgba(12,23,34,0.55)",
      valueOnBar: "#0b1a12" // mørk tekst i lyse temaer
    };
  }
  return {
    title: "#cfe8ff",
    text: "#eaf6ff",
    label: "rgba(207,232,255,0.85)",
    grid: "rgba(207,232,255,0.35)",
    note: "rgba(207,232,255,0.60)",
    valueOnBar: "#06130c" // mørk tekst på grøn bar virker godt
  };
}

function clearCanvas(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
}

/* =========================================================
   AFSNIT 06C – Bar chart (værdi i bar)
   ========================================================= */
function drawBarChart(canvas, title, series) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const pal = getCanvasPalette();
  const w = canvas.width;
  const h = canvas.height;

  clearCanvas(ctx, w, h);

  // Giv ekstra plads til titel, så intet kan ramme den
  const padL = 46;
  const padR = 18;
  const padT = 52;   // <-- mere top-plads end før
  const padB = 54;

  // Titel
  ctx.font = "bold 15px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillStyle = pal.title;
  ctx.textAlign = "left";
  ctx.fillText(title, padL, 24);

  if (!series?.length) {
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = pal.text;
    ctx.fillText("Ingen data til graf.", padL, 58);
    return;
  }

  const values = series.map(s => Number(s.value) || 0);
  const maxAbs = Math.max(1, ...values.map(v => Math.abs(v)));

  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const baseY = padT + chartH;

  const hasNeg = values.some(v => v < 0);
  const hasPos = values.some(v => v > 0);

  let zeroY = baseY;
  if (hasNeg && hasPos) zeroY = padT + chartH / 2;
  else if (hasNeg && !hasPos) zeroY = padT;
  else zeroY = baseY;

  // Akser / grid
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, baseY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(padL, zeroY);
  ctx.lineTo(padL + chartW, zeroY);
  ctx.stroke();

  // Bars
  const barGap = 14;
  const barW = Math.max(32, Math.floor((chartW - barGap * (series.length - 1)) / series.length));
  const totalBarsW = barW * series.length + barGap * (series.length - 1);
  const startX = padL + Math.max(0, Math.floor((chartW - totalBarsW) / 2));

  // Tekst
  ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.textAlign = "center";

  series.forEach((s, i) => {
    const v = Number(s.value) || 0;

    const x = startX + i * (barW + barGap);
    const scaled = (Math.abs(v) / maxAbs) * (hasNeg && hasPos ? chartH / 2 : chartH);

    const yTop = v >= 0 ? (zeroY - scaled) : zeroY;
    const barH = scaled;

    // Bar color
    const barColor =
      v > 0 ? "rgba(0,200,140,0.85)" :
      v < 0 ? "rgba(230,80,80,0.85)" :
      "rgba(50,150,255,0.75)";

    ctx.fillStyle = barColor;
    ctx.fillRect(x, yTop, barW, barH);

    // ---- VÆRDI-TEKST: inde i bar (primært) ----
    const valueText =
      (Math.round(v * 100) / 100).toLocaleString("da-DK", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }) + " " + (s.unit || "");

    // Hvis baren er høj nok: skriv inde i baren
    // Ellers: skriv lige over/under, men ALDRIG i titel-området
    const minInside = 26;
    let textY;

    if (barH >= minInside) {
      // inde i bar
      textY = v >= 0 ? (yTop + 18) : (yTop + barH - 10);
      ctx.fillStyle = "#06130c"; // mørk tekst på farvede barer (læsbart)
      ctx.textBaseline = "alphabetic";
      ctx.fillText(valueText, x + barW / 2, textY);
    } else {
      // bar for lille -> udenfor, men clamp under titel
      const safeTop = padT + 16; // alt over dette er “titel-zonen”
      textY = v >= 0 ? (yTop - 8) : (yTop + barH + 16);
      if (textY < safeTop) textY = safeTop;
      ctx.fillStyle = pal.text;
      ctx.fillText(valueText, x + barW / 2, textY);
    }

    // Label under
    const label = String(s.label || "").replace("Nordea ", "");
    ctx.fillStyle = pal.label;
    ctx.fillText(label, x + barW / 2, baseY + 24);
  });

  // Note
  ctx.textAlign = "left";
  ctx.fillStyle = pal.note;
  ctx.fillText("Bemærk: Grafen viser nuværende data (ingen historik endnu).", padL, h - 14);
}

function renderGraphIfPossible() {
  if (!el.graphPanel || el.graphPanel.hidden) return;
  if (!el.graphMode) return;

  const mode = el.graphMode.value;
  if (!mode) return;

  const holdings = latest.holdings;
  const eurDkk = latest.eurDkk;
  if (!holdings) return;

  if (mode === "profit") {
    const series = buildGraphSeries("profit", holdings, eurDkk);
    drawBarChart(el.graphCanvas, "Gevinst/tab (DKK) pr. fond", series);
  } else if (mode === "price_all") {
    const series = buildGraphSeries("price_all", holdings, eurDkk);
    drawBarChart(el.graphCanvas, "Nuværende kurs (DKK) pr. fond", series);
  }
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
      holdings = await mergeFromFondeCsv(holdings);
    }

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

    appendCheckedAt();

    // Blink når vi har rendret nye beregninger
    flash(el.table);
    flash(el.statusText);

    renderGraphIfPossible();
    flash(el.graphPanel);

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

  if (el.graphBtn && el.graphPanel) {
    el.graphBtn.addEventListener("click", () => {
      el.graphPanel.hidden = !el.graphPanel.hidden;
      renderGraphIfPossible();
      flash(el.graphPanel);
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
      flash(el.graphPanel);
    });
  }
}

/* =========================================================
   AFSNIT 09 – Boot
   ========================================================= */
initTheme();
initEvents();
loadAndRender();
