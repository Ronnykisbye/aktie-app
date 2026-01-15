/*
AFSNIT 01 – Imports
*/
import { getEURDKK, getLatestHoldingsPrices } from "./api.js";
import { renderPortfolio } from "./ui.js";
import { initThemeToggle } from "./theme.js";

/*
AFSNIT 02 – DOM hooks
*/
const els = {
  refreshBtn: document.getElementById("refresh"),
  forceBtn: document.getElementById("force"),
  statusText: document.getElementById("statusText"),
  lastUpdated: document.getElementById("lastUpdated"),
  tableWrap: document.getElementById("table")
};

/*
AFSNIT 03 – App state
*/
let inFlight = false;

/*
AFSNIT 04 – Load & refresh
*/
async function load({ force } = { force: false }) {
  if (inFlight) return;
  inFlight = true;

  setStatus(force ? "Henter friske data (ingen cache)..." : "Opdaterer data...");
  disable(true);

  try {
    const eurDkk = await getEURDKK();
    const holdings = await getLatestHoldingsPrices();

    renderPortfolio({
      container: els.tableWrap,
      statusTextEl: els.statusText,
      lastUpdatedEl: els.lastUpdated,
      holdings,
      eurDkk
    });
  } catch (e) {
    console.error(e);
    setStatus("Fejl: kunne ikke hente data. Tjek netforbindelse eller kilder.");
  } finally {
    disable(false);
    inFlight = false;
  }
}

function setStatus(msg) {
  els.statusText.textContent = msg;
}

function disable(on) {
  els.refreshBtn.disabled = on;
  els.forceBtn.disabled = on;
}

/*
AFSNIT 05 – Events
*/
els.refreshBtn.addEventListener("click", () => load({ force: false }));
els.forceBtn.addEventListener("click", () => load({ force: true }));

// Auto-load ved start
initThemeToggle();
load({ force: false });
