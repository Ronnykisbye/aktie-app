/* =========================================================
   AFSNIT 01 – Imports
   ========================================================= */
import { getLatestHoldingsPrices, getEURDKK } from "./api.js";
import { renderPortfolio } from "./ui.js";
import { PURCHASE_DATE_ISO } from "./config.js";

/* =========================================================
   AFSNIT 02 – DOM refs
   ========================================================= */
const el = {
  refresh: document.getElementById("refresh"),
  table: document.getElementById("table"),
  statusText: document.getElementById("statusText"),
  lastUpdated: document.getElementById("lastUpdated"),
  themeToggle: document.getElementById("themeToggle"),

  // graf UI
  graphBtn: document.getElementById("graph"),
  graphPanel: document.getElementById("graphPanel"),
  graphClose: document.getElementById("graphClose"),
  graphMode: document.getElementById("graphMode"),
  graphCanvas: document.getElementById("graphCanvas")
};

/* =========================================================
   AFSNIT 03 – Theme (dark/light)
   ========================================================= */
function applyTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t);
  if (el.themeToggle) el.themeToggle.textContent = t === "dark" ? "☀️" : "🌙";
  localStorage.setItem("aktie_theme", t);
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
   AFSNIT 04 – Status helper
   ========================================================= */
function setStatus(text) {
  if (el.statusText) el.statusText.textContent = text;
}

/* =========================================================
   AFSNIT 05 – CSV fallback merge (robust mod hard reload)
   ========================================================= */
function hasValidHoldingsQuantities(holdings) {
  const items = holdings?.items || [];
  if (!items.length) return false;
  return items.some(x => Number(x.quantity ?? x.Antal ?? 0) > 0);
}

function parseCsvSimple(text) {
  // CSV: Navn,Valuta,Kurs,KøbsKurs,Antal
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
   AFSNIT 06 – Graf: data + tegning (canvas)
   ========================================================= */

// Vi gemmer seneste data, så grafen kan tegnes uden ekstra fetch
let latest = {
  holdings: null,
  eurDkk: 0,
  updatedAtISO: null
};

function toDKK(price, currency, eurDkk) {
  const p = Number(price);
  if (!Number.isFinite(p)) return 0;
  const c = String(currency || "DKK").toUpperCase();
  if (c === "DKK") return p;
  if (c === "EUR") return p * Number(eurDkk || 0);
  return p;
}

function shortName(name) {
  return String(name || "Ukendt")
    .replace(/^Nordea\s+/i, "")
    .replace(/\s+KL\s*\d+$/i, "")
    .trim();
}

function fmtDKKValue(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("da-DK", { maximumFractionDigits: 2 }) + " DKK";
}

function formatDateShort(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("da-DK", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(d);
}

function clearCanvas(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
}

function drawBarChartValuesInside(canvas, title, series) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  clearCanvas(ctx, w, h);

  const padL = 40;
  const padR = 16;
  const padT = 28;
  const padB = 42;

  ctx.font = "bold 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillStyle = "#cfe8ff";
  ctx.fillText(title, padL, 18);

  if (!series?.length) {
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "#cfe8ff";
    ctx.fillText("Ingen data til graf.", padL, 50);
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

  ctx.strokeStyle = "rgba(207,232,255,0.35)";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, baseY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(padL, zeroY);
  ctx.lineTo(padL + chartW, zeroY);
  ctx.stroke();

  const barGap = 14;
  const barW = Math.max(24, Math.floor((chartW - barGap * (series.length - 1)) / series.length));
  const totalBarsW = barW * series.length + barGap * (series.length - 1);
  const startX = padL + Math.max(0, Math.floor((chartW - totalBarsW) / 2));

  ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.textAlign = "center";

  series.forEach((s, i) => {
    const v = Number(s.value) || 0;

    const x = startX + i * (barW + barGap);
    const scaled = (Math.abs(v) / maxAbs) * (hasNeg && hasPos ? chartH / 2 : chartH);

    const yTop = v >= 0 ? (zeroY - scaled) : zeroY;
    const barH = scaled;

    ctx.fillStyle = v > 0 ? "rgba(0,200,140,0.85)" : v < 0 ? "rgba(230,80,80,0.85)" : "rgba(50,150,255,0.75)";
    ctx.fillRect(x, yTop, barW, barH);

    // Værdi-tekst INDE i baren (hvis der er plads)
    const txt = fmtDKKValue(v);
    ctx.fillStyle = "#0b1016";
    const insideY = v >= 0 ? (yTop + 18) : (yTop + barH - 10);
    ctx.fillText(txt, x + barW / 2, Math.max(padT + 18, Math.min(baseY - 6, insideY)));

    // Kort label under
    ctx.fillStyle = "rgba(207,232,255,0.85)";
    ctx.fillText(shortName(s.label), x + barW / 2, baseY + 20);
  });

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(207,232,255,0.6)";
  ctx.fillText("Bemærk: Grafen viser nuværende data (ingen historik endnu).", padL, h - 12);
}

/**
 * Linje-graf med 2 punkter pr. fond:
 * - Punkt A: købskurs (PURCHASE_DATE_ISO)
 * - Punkt B: nuværende kurs (holdings.updatedAt)
 * Skriver beløbet ved slutpunktet (inde i grafområdet).
 */
function drawTwoPointLineChart(canvas, title, seriesByFund, startISO, endISO) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  clearCanvas(ctx, w, h);

  const padL = 54;
  const padR = 24;
  const padT = 30;
  const padB = 44;

  ctx.font = "bold 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillStyle = "#cfe8ff";
  ctx.fillText(title, padL, 18);

  const allPoints = [];
  seriesByFund.forEach(f => f.points.forEach(p => allPoints.push(p.value)));

  if (!allPoints.length) {
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "#cfe8ff";
    ctx.fillText("Ingen data til graf.", padL, 50);
    return;
  }

  // Skala
  const minV = Math.min(...allPoints);
  const maxV = Math.max(...allPoints);
  const range = Math.max(1e-6, maxV - minV);

  // Lidt “luft” så labels ikke rammer kanten
  const topPad = range * 0.12;
  const bottomPad = range * 0.10;

  const minYVal = minV - bottomPad;
  const maxYVal = maxV + topPad;

  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const x0 = padL;
  const x1 = padL + chartW;

  function yOf(v) {
    const t = (v - minYVal) / (maxYVal - minYVal);
    return padT + (1 - t) * chartH;
  }

  // Grid + akser
  ctx.strokeStyle = "rgba(207,232,255,0.22)";
  ctx.lineWidth = 1;

  // Y-grid (3 linjer)
  for (let i = 0; i <= 3; i++) {
    const yy = padT + (chartH * i) / 3;
    ctx.beginPath();
    ctx.moveTo(padL, yy);
    ctx.lineTo(padL + chartW, yy);
    ctx.stroke();
  }

  // Akse venstre
  ctx.strokeStyle = "rgba(207,232,255,0.35)";
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + chartH);
  ctx.stroke();

  // X labels (datoer)
  ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillStyle = "rgba(207,232,255,0.85)";
  ctx.textAlign = "left";
  ctx.fillText(formatDateShort(startISO), x0, padT + chartH + 28);
  ctx.textAlign = "right";
  ctx.fillText(formatDateShort(endISO), x1, padT + chartH + 28);

  // Y labels (min/max)
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(207,232,255,0.7)";
  ctx.fillText(fmtDKKValue(maxV), padL - 8, yOf(maxV) + 4);
  ctx.fillText(fmtDKKValue(minV), padL - 8, yOf(minV) + 4);

  // Farver pr. fond (3 stk)
  const colors = ["#4ec7ff", "#00c88c", "#f7b84b"];

  // Tegn hver fond
  ctx.textAlign = "left";
  seriesByFund.forEach((fund, idx) => {
    const c = colors[idx % colors.length];
    const pA = fund.points[0];
    const pB = fund.points[1];

    const yA = yOf(pA.value);
    const yB = yOf(pB.value);

    // linje
    ctx.strokeStyle = c;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, yA);
    ctx.lineTo(x1, yB);
    ctx.stroke();

    // punkter
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x0, yA, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x1, yB, 4, 0, Math.PI * 2);
    ctx.fill();

    // beløb ved slutpunkt (inde i grafen)
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "#eaf6ff";
    const label = `${shortName(fund.label)}: ${fmtDKKValue(pB.value)}`;
    const labelY = Math.max(padT + 14, Math.min(padT + chartH - 6, yB - 8));
    ctx.fillText(label, x1 - 190, labelY);
  });

  // Note
  ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillStyle = "rgba(207,232,255,0.6)";
  ctx.textAlign = "left";
  ctx.fillText("Bemærk: 2 punkter pr. fond (køb → nu). Historik kan tilføjes senere.", padL, h - 12);
}

function buildProfitSeries(holdings, eurDkk) {
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

    return { label: name, value: profitDKK, unit: "DKK" };
  });
}

function buildTwoPointPriceSeries(holdings, eurDkk, startISO, endISO) {
  const list = Array.isArray(holdings?.items) ? holdings.items : [];
  return list.map(it => {
    const name = it.name || "Ukendt";
    const currency = (it.currency || "DKK").toUpperCase();

    const current = Number(it.price ?? it.Kurs ?? 0);
    const buy = Number(it.buyPrice ?? it.KøbsKurs ?? 0);

    const currentDKK = toDKK(current, currency, eurDkk);
    const buyDKK = toDKK(buy, currency, eurDkk);

    return {
      label: name,
      points: [
        { x: startISO, value: buyDKK },
        { x: endISO, value: currentDKK }
      ]
    };
  });
}

function renderGraphIfPossible() {
  if (!el.graphPanel || el.graphPanel.hidden) return;
  if (!el.graphMode) return;

  const mode = el.graphMode.value;
  if (!mode) return;

  const holdings = latest.holdings;
  const eurDkk = latest.eurDkk;

  if (!holdings) return;

  const endISO = latest.updatedAtISO || new Date().toISOString();
  const startISO = PURCHASE_DATE_ISO || "2025-09-10";

  if (mode === "profit") {
    const series = buildProfitSeries(holdings, eurDkk);
    drawBarChartValuesInside(el.graphCanvas, "Gevinst/tab (DKK) pr. fond", series);
  } else if (mode === "price_all") {
    const byFund = buildTwoPointPriceSeries(holdings, eurDkk, startISO, endISO);
    drawTwoPointLineChart(
      el.graphCanvas,
      "Kurs-udvikling (DKK) pr. fond – køb → nu",
      byFund,
      startISO,
      endISO
    );
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
      console.warn("⚠️ CSV merge mangler – kører fallback merge fra fonde.csv");
      holdings = await mergeFromFondeCsv(holdings);
    }

    // Gem seneste data til graf
    latest.holdings = holdings;
    latest.eurDkk = eurDkk;
    latest.updatedAtISO = holdings?.updatedAt || null;

    renderPortfolio({
      container: el.table,
      statusTextEl: el.statusText,
      lastUpdatedEl: el.lastUpdated,
      holdings,
      eurDkk,
      purchaseDateISO: PURCHASE_DATE_ISO
    });

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
