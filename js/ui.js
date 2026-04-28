/* =========================================================
   js/ui.js
   Fancy graf-version
   - 3 linjer
   - Hover tooltip
   - Lodret markør
   - Neon-look
   - Ingen søjlegraf fallback
   ========================================================= */

/* =========================
   AFSNIT 01 – Format helpers
   ========================= */
function parseISO(s) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtTime(d) {
  if (!d) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

function fmtDKK(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("da-DK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function fmtPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("da-DK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function fmtShortDKK(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";

  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString("da-DK", { maximumFractionDigits: 1 })} mio.`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toLocaleString("da-DK", { maximumFractionDigits: 0 })}k`;

  return fmtDKK(v);
}

function toDKK(value, currency, eurDkk) {
  const v = Number(value);
  if (!Number.isFinite(v)) return NaN;

  const c = String(currency || "DKK").toUpperCase();
  return c === "EUR" ? v * Number(eurDkk) : v;
}

function theme() {
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

function flash(el) {
  if (!el) return;
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}

/* =========================
   AFSNIT 02 – Beregninger
   ========================= */
function calcCurrentFundNumbers(item, eurDkk) {
  const currency = String(item?.currency || "DKK").toUpperCase();
  const qty = Number(item?.quantity ?? 0);

  const price = Number(item?.price ?? NaN);
  const buy = Number(item?.buyPrice ?? NaN);

  const priceDKK = toDKK(price, currency, eurDkk);
  const buyDKK = toDKK(buy, currency, eurDkk);

  const value = Number.isFinite(qty) && Number.isFinite(priceDKK) ? qty * priceDKK : NaN;
  const purchase = Number.isFinite(qty) && Number.isFinite(buyDKK) ? qty * buyDKK : NaN;
  const gain = Number.isFinite(value) && Number.isFinite(purchase) ? value - purchase : NaN;
  const pct = Number.isFinite(gain) && Number.isFinite(purchase) && purchase !== 0 ? (gain / purchase) * 100 : NaN;

  return {
    currency,
    qty,
    price,
    buy,
    priceDKK,
    buyDKK,
    value,
    purchase,
    gain,
    pct
  };
}

function getAllHistoryDates(list) {
  const dates = new Set();

  for (const item of list) {
    const history = Array.isArray(item?.history) ? item.history : [];
    for (const point of history) {
      if (point?.date) dates.add(point.date);
    }
  }

  return Array.from(dates).sort((a, b) => a.localeCompare(b));
}

function findHistoryPrice(item, date) {
  const history = Array.isArray(item?.history) ? item.history : [];
  const hit = history.find((p) => p?.date === date);
  const price = Number(hit?.price);
  return Number.isFinite(price) ? price : null;
}

function shortName(name) {
  return String(name || "")
    .replace(/^Nordea\s+/i, "")
    .replace(/^Invest\s+/i, "")
    .replace("Enhanced KL 1", "")
    .replace("Fund BQ", "")
    .trim();
}

/* =========================
   AFSNIT 03 – Portfolio render
   ========================= */
export function renderPortfolio({
  statusEl,
  totalValueEl,
  totalGainEl,
  rowsEl,
  boxTotalEl,
  boxGainEl,
  holdings,
  eurDkk,
  refreshedAtISO
}) {
  const list = Array.isArray(holdings?.items) ? holdings.items : [];

  const lastTrading = parseISO(holdings?.meta?.lastTradingDayISO);
  const githubUpdated = parseISO(holdings?.meta?.githubUpdatedISO);
  const refreshedAt = parseISO(refreshedAtISO);

  const parts = [];
  parts.push("OK — data vist.");
  parts.push(`Seneste handelsdag: ${fmtTime(lastTrading || githubUpdated)}`);
  parts.push("Opdateret af GitHub");
  parts.push(`Sidst opdateret: ${fmtTime(refreshedAt)}`);

  if (statusEl) statusEl.textContent = parts.join(" • ");

  let totalValue = 0;
  let totalPurchase = 0;

  for (const it of list) {
    const n = calcCurrentFundNumbers(it, eurDkk);
    if (Number.isFinite(n.value)) totalValue += n.value;
    if (Number.isFinite(n.purchase)) totalPurchase += n.purchase;
  }

  const totalGain = totalValue - totalPurchase;

  if (totalValueEl) totalValueEl.textContent = `${fmtDKK(totalValue)} DKK`;
  if (totalGainEl) totalGainEl.textContent = `${fmtDKK(totalGain)} DKK`;

  flash(boxTotalEl);
  flash(boxGainEl);

  if (rowsEl) rowsEl.innerHTML = "";

  for (const it of list) {
    const name = String(it?.name || "Ukendt");
    const n = calcCurrentFundNumbers(it, eurDkk);

    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.textContent = name;

    const tdPct = document.createElement("td");
    tdPct.textContent = `${n.pct >= 0 ? "+" : ""}${fmtPct(n.pct)} %`;
    tdPct.className = n.pct >= 0 ? "pos" : "neg";

    const tdGain = document.createElement("td");
    tdGain.textContent = `${fmtDKK(n.gain)} DKK`;
    tdGain.className = n.gain >= 0 ? "pos" : "neg";

    const tdPrice = document.createElement("td");
    tdPrice.textContent = n.currency === "EUR" ? `${fmtPct(n.price)} EUR` : `${fmtPct(n.price)} DKK`;

    const tdQty = document.createElement("td");
    tdQty.textContent = Number(n.qty).toLocaleString("da-DK");

    const tdPriceDKK = document.createElement("td");
    tdPriceDKK.textContent = `${fmtDKK(n.priceDKK)} DKK`;

    tr.append(tdName, tdPct, tdGain, tdPrice, tdQty, tdPriceDKK);
    rowsEl?.appendChild(tr);
  }
}

/* =========================
   AFSNIT 04 – Chart theme
   ========================= */
function getChartTheme() {
  const th = theme();

  return {
    textStrong: th === "light" ? "rgba(10,27,43,0.95)" : "rgba(255,255,255,0.95)",
    textMuted: th === "light" ? "rgba(10,27,43,0.72)" : "rgba(255,255,255,0.72)",
    grid: th === "light" ? "rgba(10,27,43,0.12)" : "rgba(255,255,255,0.12)",
    axis: th === "light" ? "rgba(10,27,43,0.30)" : "rgba(255,255,255,0.30)",
    tooltipBg: th === "light" ? "rgba(255,255,255,0.96)" : "rgba(7,16,26,0.96)",
    tooltipBorder: th === "light" ? "rgba(0,150,210,0.45)" : "rgba(0,191,255,0.45)",
    colors: [
      "rgba(0,191,255,1)",
      "rgba(18,209,142,1)",
      "rgba(255,204,0,1)"
    ],
    glow: [
      "rgba(0,191,255,0.25)",
      "rgba(18,209,142,0.25)",
      "rgba(255,204,0,0.25)"
    ]
  };
}

/* =========================
   AFSNIT 05 – Historiske serier
   ========================= */
function buildHistoricalSeries(list, eurDkk, mode) {
  const dates = getAllHistoryDates(list);

  const series = list.map((item) => {
    const name = String(item?.name || "Ukendt");
    const currency = String(item?.currency || "DKK").toUpperCase();
    const qty = Number(item?.quantity ?? 0);
    const buyDKK = toDKK(item?.buyPrice, currency, eurDkk);

    const values = dates.map((date) => {
      const histPrice = findHistoryPrice(item, date);
      if (histPrice === null) return null;

      const histPriceDKK = toDKK(histPrice, currency, eurDkk);

      if (mode === "price") return Number.isFinite(histPriceDKK) ? histPriceDKK : null;
      if (mode === "value") return Number.isFinite(histPriceDKK) && Number.isFinite(qty) ? histPriceDKK * qty : null;

      return Number.isFinite(histPriceDKK) && Number.isFinite(buyDKK) && Number.isFinite(qty)
        ? qty * (histPriceDKK - buyDKK)
        : null;
    });

    return { name, values };
  });

  return { dates, series };
}

/* =========================
   AFSNIT 06 – Fancy linjegraf
   ========================= */
function renderFancyLineChart({ ctx, canvas, list, eurDkk, mode, hoverX = null }) {
  const w = canvas.width;
  const h = canvas.height;
  const t = getChartTheme();

  ctx.clearRect(0, 0, w, h);

  const { dates, series } = buildHistoricalSeries(list, eurDkk, mode);
  const flat = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));

  if (!dates.length || !flat.length) {
    ctx.fillStyle = t.textStrong;
    ctx.font = "16px system-ui";
    ctx.fillText("Ingen historik at vise endnu.", 30, 45);
    return;
  }

  const padL = 88;
  const padR = 42;
  const padT = 54;
  const padB = 88;

  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  let minV = Math.min(...flat);
  let maxV = Math.max(...flat);

  if (mode === "gain") {
    minV = Math.min(minV, 0);
    maxV = Math.max(maxV, 0);
  }

  if (minV === maxV) {
    const spread = Math.max(Math.abs(maxV) * 0.08, 1000);
    minV -= spread;
    maxV += spread;
  } else {
    const spread = (maxV - minV) * 0.12;
    minV -= spread;
    maxV += spread;
  }

  const range = maxV - minV || 1;

  const xOf = (i) => {
    if (dates.length === 1) return padL + innerW / 2;
    return padL + (i / (dates.length - 1)) * innerW;
  };

  const yOf = (v) => padT + (1 - (v - minV) / range) * innerH;

  const title =
    mode === "price"
      ? "Fancy graf: Historisk kursudvikling"
      : mode === "value"
        ? "Fancy graf: Porteføljeværdi pr. fond"
        : "Fancy graf: Gevinst/tab pr. fond";

  ctx.fillStyle = t.textStrong;
  ctx.font = "800 16px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(title, padL, 26);

  ctx.strokeStyle = t.grid;
  ctx.lineWidth = 1;

  for (let i = 0; i <= 5; i++) {
    const y = padT + (i / 5) * innerH;
    const value = maxV - (i / 5) * range;

    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + innerW, y);
    ctx.stroke();

    ctx.fillStyle = t.textMuted;
    ctx.font = "12px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(fmtShortDKK(value), padL - 10, y + 4);
  }

  ctx.strokeStyle = t.axis;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + innerH);
  ctx.lineTo(padL + innerW, padT + innerH);
  ctx.stroke();

  let hoverIndex = null;

  if (hoverX !== null && dates.length > 0) {
    const clampedX = Math.max(padL, Math.min(padL + innerW, hoverX));
    const ratio = dates.length === 1 ? 0 : (clampedX - padL) / innerW;
    hoverIndex = Math.round(ratio * (dates.length - 1));
  }

  for (let sIndex = 0; sIndex < series.length; sIndex++) {
    const set = series[sIndex];
    const color = t.colors[sIndex % t.colors.length];

    ctx.save();
    ctx.shadowColor = t.glow[sIndex % t.glow.length];
    ctx.shadowBlur = 14;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();

    let started = false;

    for (let i = 0; i < set.values.length; i++) {
      const v = set.values[i];
      if (!Number.isFinite(v)) continue;

      const x = xOf(i);
      const y = yOf(v);

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
    ctx.restore();

    for (let i = 0; i < set.values.length; i++) {
      const v = set.values[i];
      if (!Number.isFinite(v)) continue;

      const x = xOf(i);
      const y = yOf(v);

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, hoverIndex === i ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (hoverIndex !== null) {
    const x = xOf(hoverIndex);

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + innerH);
    ctx.stroke();
    ctx.setLineDash([]);

    const boxW = 245;
    const boxH = 28 + series.length * 22;
    const boxX = x + boxW + 18 > w ? x - boxW - 18 : x + 18;
    const boxY = padT + 10;

    ctx.fillStyle = t.tooltipBg;
    ctx.strokeStyle = t.tooltipBorder;
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = t.textStrong;
    ctx.font = "700 13px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(dates[hoverIndex] || "—", boxX + 12, boxY + 20);

    for (let i = 0; i < series.length; i++) {
      const val = series[i].values[hoverIndex];
      const color = t.colors[i % t.colors.length];

      ctx.fillStyle = color;
      ctx.fillRect(boxX + 12, boxY + 36 + i * 22, 10, 10);

      ctx.fillStyle = t.textStrong;
      ctx.font = "12px system-ui";
      ctx.fillText(`${shortName(series[i].name)}: ${fmtDKK(val)} DKK`, boxX + 30, boxY + 46 + i * 22);
    }
  }

  ctx.fillStyle = t.textMuted;
  ctx.font = "12px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(dates[0] || "", padL, padT + innerH + 28);

  ctx.textAlign = "right";
  ctx.fillText(dates[dates.length - 1] || "", padL + innerW, padT + innerH + 28);

  let legendX = padL;
  const legendY = h - 24;

  for (let i = 0; i < series.length; i++) {
    const color = t.colors[i % t.colors.length];
    const name = shortName(series[i].name);

    ctx.fillStyle = color;
    ctx.fillRect(legendX, legendY - 10, 12, 12);

    ctx.fillStyle = t.textMuted;
    ctx.font = "12px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(name, legendX + 18, legendY);

    legendX += Math.min(230, 48 + name.length * 7);
  }
}

/* =========================
   AFSNIT 07 – Public graf render
   ========================= */
export function renderChart({ canvas, holdings, eurDkk, mode }) {
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const list = Array.isArray(holdings?.items) ? holdings.items : [];
  const selectedMode = String(mode || "gain").toLowerCase();

  function draw(hoverX = null) {
    renderFancyLineChart({
      ctx,
      canvas,
      list,
      eurDkk,
      mode: selectedMode,
      hoverX
    });
  }

  canvas.onmousemove = (event) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const x = (event.clientX - rect.left) * scaleX;
    draw(x);
  };

  canvas.onmouseleave = () => draw(null);

  draw(null);
}
