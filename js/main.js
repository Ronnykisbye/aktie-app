import { renderPortfolio } from "./ui.js";

/* =========================================================
   AFSNIT 01 – DOM
   ========================================================= */

const tableContainer = document.getElementById("table");
const statusText = document.getElementById("statusText");
const lastUpdated = document.getElementById("lastUpdated");

const btnRefresh = document.getElementById("refresh");
const btnGraph = document.getElementById("graph");

const graphPanel = document.getElementById("graphPanel");
const graphMode = document.getElementById("graphMode");
const graphClose = document.getElementById("graphClose");
const canvas = document.getElementById("graphCanvas");
const ctx = canvas.getContext("2d");

/* =========================================================
   AFSNIT 02 – DATA
   ========================================================= */

let latestData = null;

/* =========================================================
   AFSNIT 03 – FETCH
   ========================================================= */

async function loadData() {
  const res = await fetch("data/prices.json?t=" + Date.now());
  const json = await res.json();

  latestData = json;

  renderPortfolio({
    container: tableContainer,
    statusTextEl: statusText,
    lastUpdatedEl: lastUpdated,
    holdings: json,
    eurDkk: json.eurDkk || 7.45
  });
}

btnRefresh.addEventListener("click", loadData);

/* =========================================================
   AFSNIT 04 – GRAF UI
   ========================================================= */

btnGraph.addEventListener("click", () => {
  graphPanel.hidden = !graphPanel.hidden;
});

graphClose.addEventListener("click", () => {
  graphPanel.hidden = true;
});

graphMode.addEventListener("change", () => {
  if (!latestData) return;

  if (graphMode.value === "profit") {
    drawProfitGraph();
  }

  if (graphMode.value === "price_all") {
    drawPriceGraph();
  }
});

/* =========================================================
   AFSNIT 05 – GRAF: GEVINST
   ========================================================= */

function drawProfitGraph() {
  clearCanvas();

  const rows = latestData.items;

  const labels = rows.map(r => r.name);
  const values = rows.map(r =>
    (r.price - r.buyPrice) * r.quantity
  );

  drawBarChart(labels, values, "Gevinst (DKK)");
}

/* =========================================================
   AFSNIT 06 – GRAF: KURSER
   ========================================================= */

function drawPriceGraph() {
  clearCanvas();

  const rows = latestData.items;

  const labels = rows.map(r => r.name);
  const values = rows.map(r => r.price);

  drawBarChart(labels, values, "Kurs");
}

/* =========================================================
   AFSNIT 07 – GENERISK BAR-GRAF
   ========================================================= */

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawBarChart(labels, values, title) {
  const w = canvas.width;
  const h = canvas.height;

  const max = Math.max(...values) * 1.1;
  const barWidth = w / values.length - 40;

  ctx.clearRect(0, 0, w, h);

  // Titel
  ctx.fillStyle = "#fff";
  ctx.font = "16px sans-serif";
  ctx.fillText(title, 20, 30);

  values.forEach((v, i) => {
    const x = 60 + i * (barWidth + 40);
    const y = h - (v / max) * (h - 80);
    const height = (v / max) * (h - 80);

    ctx.fillStyle = "#2fd1ff";
    ctx.fillRect(x, y, barWidth, height);

    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.fillText(labels[i], x, h - 20);
  });
}

/* =========================================================
   INIT
   ========================================================= */

loadData();
