/* =========================================================
   main.js – AKTIE-APP
   Ansvar:
   - Tema (dark/light) via html[data-theme]
   - Hente data (prices.json + fonde.csv merge via api.js)
   - Render (tabel + totals) via ui.js
   - Statuslinje: “Senest tjekket” (når du trykker opdater)
   - Graf (canvas)
   ========================================================= */

/* =========================================================
   AFSNIT 01 – Imports (SKAL MATCHE api.js/ui.js)
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
   AFSNIT 03 – Theme (dark/light) – bruger html[data-theme]
   ========================================================= */
function applyTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t);

  // ikon: i mørk mode vis “☀️” (kan skifte til lys), i lys mode vis “🌙”
  if (el.themeToggle) el.themeToggle.textContent = t === "dark" ? "☀️" : "🌙";

  localStorage.setItem("aktie_theme", t);
}

function initTheme() {
  const saved = localStorage.getItem("aktie_theme");

  // Default: dark (så matcher dit <html data-theme="dark">)
  applyTheme(saved || "dark");

  if (el.themeToggle) {
    el.themeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      applyTheme(current === "dark" ? "light" : "dark");
    });
  }
}

/* =========================================================
   AFSNIT 04 – Status helpers + “Senest tjekket”
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

  // Gem tidspunkt lokalt (praktisk)
  localStorage.setItem("aktie_last_checked_at", checkedAt);

  // Undgå dubletter
  const cleaned = base.replace(/\s*•\s*Senest tjekket:.*$/i, "").trim();
  el.statusText.textContent = `${cleaned} • Senest tjekket: ${checkedAt}`;
}

/* =========================================================
   AFSNIT 05 – “Blink”/visuel feedback ved opdatering
   (kræver at CSS har .flash animation – hvis ikke, sker intet)
   ========================================================= */
function flashUI() {
  const app = document.querySelector(".app");
  if (!app) return;
  app.classList.remove("flash");
  void app.offsetWidth; // reflow trick
  app.classList.add("flash");
}

/* =========================================================
   AFSNIT 06 – CSV fallback merge (robust mod hard reload)
   ========================================================= */
function hasValidHoldingsQuantities(holdings) {
  const items = holdings?.items || [];
  if (!items.length) return false;
  return items.some((x) => Number(x.quantity ?? x.Antal ?? 0) > 0);
}

function parseCsvSimple(text) {
  // CSV: Navn,Valuta,Kurs,KøbsKurs,Antal
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((s) => s.trim());

  return lines.slice(1).map((line) => {
    const parts = line.split(",").map((s) => s.trim());
    const row = {};
    header.forEach((h, i) => (row[h] = parts[i] ?? ""));
    return row;
  });
}

async function mergeFromFondeCsv(holdings) {
  const res = await fetch("fonde.csv?t=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("Kunne ikke hente fonde.csv (" + res.status + ")");
  const csvText = await res.text();

  const rows =
    window.Papa && window.Papa.parse
      ? window.Papa.parse(csvText, { header: true, skipEmptyLines: true }).data
      : parseCsvSimple(csvText);

  const map = new Map(rows.map((r) => [String(r.Navn || "").trim().toLowerCase(), r]));

  const items = (holdings?.items || []).map((it) => {
    const key = String(it.name || "").trim().toLowerCase();
    const r = map.get(key);

    if (!r) return it;

    return {
      ...it,
      currency: it.currency || r.Valuta || "DKK",
      buyPrice: Number(r["KøbsKurs"] ?? r.KøbsKurs ?? 0),
      quantity: Number(r.Antal ?? 0)
    };
  });

  return { ...holdings, items };
}

/* =========================================================
   AFSNIT 07 – Graf: beregning + tegning (canvas)
   ========================================================= */

// Vi gemmer seneste data, så grafen kan tegnes uden ekstra fetch
let latest = {
  holdings: null,
  eurDkk: 0
};

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

  return list.map((it) => {
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

function drawBarChart(canvas, title, series) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Layout
  const padL = 40;
  const padR = 16;
  const padT = 28;
  const padB = 42;

  // Titel
  ctx.font = "bold 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillStyle = "#cfe8ff";
  ctx.fillText(title, padL, 18);

  if (!series?.length) {
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "#cfe8ff";
    ctx.fillText("Ingen data til graf.", padL, 50);
    return;
  }

  const values = series.map((s) => Number(s.value) || 0);
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));

  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const baseY = padT + chartH;

  const hasNeg = values.some((v) => v < 0);
  const hasPos = values.some((v) => v > 0);

  let zeroY = baseY;
  if (hasNeg && hasPos) zeroY = padT + chartH / 2;
  else if (hasNeg && !hasPos) zeroY = padT;

  // Akser
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

  ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.textAlign = "center";

  series.forEach((s, i) => {
    const v = Number(s.value) || 0;

    const x = startX + i * (barW + barGap);
    const scaled = (Math.abs(v) / maxAbs) * (hasNeg && hasPos ? chartH / 2 : chartH);

    const yTop = v >= 0 ? zeroY - scaled : zeroY;
    const barH = scaled;

    ctx.fillStyle =
      v > 0 ? "rgba(0,200,140,0.85)" : v < 0 ? "rgba(230,80,80,0.85)" : "rgba(50,150,255,0.75)";
    ctx.fillRect(x, yTop, barW, barH);

    // Værdi-tekst (over/under søjle)
    ctx.fillStyle = "#eaf6ff";
    const valueText =
      (Math.round(v * 100) / 100).toLocaleString("da-DK", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }) +
      " " +
      (s.unit || "");
    const vtY = v >= 0 ? yTop - 6 : yTop + barH + 14;
    ctx.fillText(valueText, x + barW / 2, vtY);

    // Label
    const label = String(s.label || "").replace("Nordea ", "");
    ctx.fillStyle = "rgba(207,232,255,0.85)";
    ctx.fillText(label, x + barW / 2, baseY + 20);
  });

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(207,232,255,0.6)";
  ctx.fillText("Bemærk: Grafen viser nuværende data (ingen historik endnu).", padL, h - 12);
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
    drawBarChart(el.graphCanvas, "Gevinst/tab (DKK) pr. fond", buildGraphSeries("profit", holdings, eurDkk));
  } else if (mode === "price_all") {
    drawBarChart(el.graphCanvas, "Nuværende kurs (DKK) pr. fond", buildGraphSeries("price_all", holdings, eurDkk));
  }
}

/* =========================================================
   AFSNIT 08 – Core: Load + render
   ========================================================= */
async function loadAndRender() {
  try {
    flashUI();
    setStatus("Henter data…");

    const [eurDkk, holdingsRaw] = await Promise.all([getEURDKK(), getLatestHoldingsPrices()]);
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

    // Tilføj “Senest tjekket” efter render
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
   AFSNIT 09 – Events
   ========================================================= */
function initEvents() {
  if (el.refresh) el.refresh.addEventListener("click", loadAndRender);

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
   AFSNIT 10 – Boot
   ========================================================= */
initTheme();
initEvents();
loadAndRender();
