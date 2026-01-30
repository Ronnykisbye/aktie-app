/* =========================================================
   main.js – AKTIE-APP
   Ansvar:
   - Tema (dark/light) via html[data-theme]
   - Hente data (prices.json + fonde.csv merge via api.js)
   - Sikre korrekt købsværdi (fra data/purchase-prices.js)
   - Render (tabel + totals) via ui.js
   - Statuslinje + “Senest tjekket”
   ========================================================= */

/* =========================================================
   AFSNIT 01 – Imports (SKAL MATCHE api.js/ui.js)
   ========================================================= */
import { getLatestHoldingsPrices, getEURDKK } from "./api.js";
import { renderPortfolio } from "./ui.js";
import { PURCHASE_DATE_ISO } from "./config.js";
import { getPurchaseTotalDKK } from "../data/purchase-prices.js";

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
  applyTheme(saved || "dark");
  el.themeToggle?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
  });
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

  localStorage.setItem("aktie_last_checked_at", checkedAt);

  const cleaned = base.replace(/\s*•\s*Senest tjekket:.*$/i, "").trim();
  el.statusText.textContent = `${cleaned} • Senest tjekket: ${checkedAt}`;
}

/* =========================================================
   AFSNIT 05 – Blink / visuel feedback
   ========================================================= */
function flashUI() {
  const app = document.querySelector(".app");
  if (!app) return;
  app.classList.remove("flash");
  void app.offsetWidth; // reflow
  app.classList.add("flash");
}

/* =========================================================
   AFSNIT 06 – CSV fallback merge (robust)
   ========================================================= */
function hasValidHoldingsQuantities(holdings) {
  const items = holdings?.items || [];
  if (!items.length) return false;
  return items.some((x) => Number(x.quantity ?? x.Antal ?? 0) > 0);
}

function parseCsvSimple(text) {
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
   AFSNIT 07 – KØBSVÆRDI-FIX (DET VIGTIGE)
   Hvorfor:
   - Din “samlet gevinst” kan ellers blive forkert
   - Vi bruger bank-afledt TOTAL købspris pr. ISIN (DKK)
   Hvordan:
   - Vi omsætter total DKK købspris til buyPrice pr. enhed,
     så ui.js’ eksisterende logik virker:
       profit = qty * (currentDKK - buyDKK)
   - For EUR-fonden: vi sætter buyPrice i EUR sådan at:
       buyDKK = (buyEUR * eurDkk) = købDKK_pr_enhed
   ========================================================= */
function applyPurchasePricesToHoldings(holdings, eurDkk) {
  const items = Array.isArray(holdings?.items) ? holdings.items : [];
  const out = items.map((it) => {
    const isin = String(it?.isin || "").trim();
    const totalBuyDKK = getPurchaseTotalDKK(isin);

    // Hvis vi ikke har en købspris, lad den være som den er
    if (!totalBuyDKK) return it;

    const qty = Number(it?.quantity ?? it?.Antal ?? 0) || 0;
    if (qty <= 0) return it;

    const currency = String(it?.currency || "DKK").toUpperCase();
    const buyDKKperUnit = totalBuyDKK / qty;

    let buyPriceUnit = buyDKKperUnit; // default i DKK
    if (currency === "EUR") {
      const fx = Number(eurDkk || 0);
      // Undgå division med 0
      buyPriceUnit = fx > 0 ? (buyDKKperUnit / fx) : 0;
    }

    return {
      ...it,
      // ui.js læser buyPrice (eller KøbsKurs) som “per unit” i fondens valuta
      buyPrice: buyPriceUnit,
      // (valgfrit) debugfelt til dig senere
      buyPriceSource: "purchase-prices.js (totalDKK->unit)"
    };
  });

  return { ...holdings, items: out };
}

/* =========================================================
   AFSNIT 08 – Graf (minimal: behold eksisterende)
   ========================================================= */
let latest = { holdings: null, eurDkk: 0 };

function renderGraphIfPossible() {
  // Graf-tegningen håndteres i ui.js / eksisterende kodeflow.
  // Vi nøjes med at sikre data er opdateret.
  // (Hvis du vil, udvider vi senere til historik-linjer.)
  return;
}

/* =========================================================
   AFSNIT 09 – Core: Load + render
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

    // ✅ HER: påfør korrekte købsværdier fra data/purchase-prices.js
    holdings = applyPurchasePricesToHoldings(holdings, eurDkk);

    // Gem til evt. graf
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
    renderGraphIfPossible();
  } catch (err) {
    console.error(err);
    setStatus("Fejl – kunne ikke hente data.");
    if (el.lastUpdated) el.lastUpdated.textContent = "Seneste handelsdag: —";
  }
}

/* =========================================================
   AFSNIT 10 – Events
   ========================================================= */
function initEvents() {
  el.refresh?.addEventListener("click", loadAndRender);

  if (el.graphBtn && el.graphPanel) {
    el.graphBtn.addEventListener("click", () => {
      el.graphPanel.hidden = !el.graphPanel.hidden;
    });
  }

  el.graphClose?.addEventListener("click", () => {
    if (el.graphPanel) el.graphPanel.hidden = true;
  });

  el.graphMode?.addEventListener("change", () => {
    // behold
  });
}

/* =========================================================
   AFSNIT 11 – Boot
   ========================================================= */
initTheme();
initEvents();
loadAndRender();
