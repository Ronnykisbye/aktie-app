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

  // graf UI (kun toggle – selve graf-logik kommer senere)
  graphBtn: document.getElementById("graph"),
  graphPanel: document.getElementById("graphPanel"),
  graphClose: document.getElementById("graphClose"),
  graphMode: document.getElementById("graphMode")
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
  // Hvis alle quantity er 0/mangler, så er CSV-merge ikke slået igennem
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

  // Brug PapaParse hvis den findes, ellers simpel parser
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
   AFSNIT 06 – Core: Load + render
   ========================================================= */
async function loadAndRender() {
  try {
    setStatus("Henter data…");

    const [eurDkk, holdingsRaw] = await Promise.all([
      getEURDKK(),
      getLatestHoldingsPrices()
    ]);

    let holdings = holdingsRaw;

    // Fallback hvis hard reload gav holdings uden antal/købskurs
    if (!hasValidHoldingsQuantities(holdings)) {
      console.warn("⚠️ CSV merge mangler – kører fallback merge fra fonde.csv");
      holdings = await mergeFromFondeCsv(holdings);
    }

    renderPortfolio({
      container: el.table,
      statusTextEl: el.statusText,
      lastUpdatedEl: el.lastUpdated,
      holdings,
      eurDkk,
      purchaseDateISO: PURCHASE_DATE_ISO
    });

  } catch (err) {
    console.error(err);
    setStatus("Fejl – kunne ikke hente data.");
    if (el.lastUpdated) el.lastUpdated.textContent = "Seneste handelsdag: —";
  }
}

/* =========================================================
   AFSNIT 07 – Events
   ========================================================= */
function initEvents() {
  if (el.refresh) el.refresh.addEventListener("click", loadAndRender);

  // Graf UI (kun åbne/lukke i dette trin)
  if (el.graphBtn && el.graphPanel) {
    el.graphBtn.addEventListener("click", () => {
      el.graphPanel.hidden = !el.graphPanel.hidden;
    });
  }
  if (el.graphClose && el.graphPanel) {
    el.graphClose.addEventListener("click", () => {
      el.graphPanel.hidden = true;
    });
  }
}

/* =========================================================
   AFSNIT 08 – Boot
   ========================================================= */
initTheme();
initEvents();
loadAndRender();
