/* =========================================================
   js/ui.js
   - Udfylder #totalValue, #totalGain, #fundRows, #status
   - Ingen HTML-injection i tabeldata
   - Graf:
     1) Historisk linjegraf hvis history[] findes
     2) Fallback til søjlegraf hvis der endnu ikke er historik
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

  if (Math.abs(v) >= 1_000_000) {
    return `${(v / 1_000_000).toLocaleString("da-DK", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })} mio.`;
  }

  if (Math.abs(v) >= 1_000) {
    return `${(v / 1_000).toLocaleString("da-DK", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    })}k`;
  }

  return fmtDKK(v);
}

function toDKK(value, currency, eurDkk) {
  const v = Number(value);
  if (!Number.isFinite(v)) return NaN;

  const c = String(currency || "DKK").toUpperCase();

  if (c === "EUR") return v * Number(eurDkk);
  return v;
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

  const value =
    Number.isFinite(qty) && Number.isFinite(priceDKK) ? qty * priceDKK : NaN;

  const purchase =
    Number.isFinite(qty) && Number.isFinite(buyDKK) ? qty * buyDKK : NaN;

  const gain =
    Number.isFinite(value) && Number.isFinite(purchase)
      ? value - purchase
      : NaN;

  const pct =
    Number.isFinite(gain) && Number.isFinite(purchase) && purchase !== 0
      ? (gain / purchase) * 100
      : NaN;

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
    tdPrice.textContent =
      n.currency === "EUR"
        ? `${fmtPct(n.price)} EUR`
        : `${fmtPct(n.price)} DKK`;

    const tdQty = document.createElement("td");
    tdQty.textContent = Number(n.qty).toLocaleString("da-DK");

    const tdPriceDKK = document.createElement("td");
    tdPriceDKK.textContent = `${fmtDKK(n.priceDKK)} DKK`;

    tr.append(tdName, tdPct, tdGain, tdPrice, tdQty, tdPriceDKK);
    rowsEl?.appendChild(tr);
  }
}

/* =========================
   AFSNIT 04 – Canvas tema
   ========================= */
function getChartTheme() {
  const th = theme();

  return {
    bg: th === "light" ? "rgba(255,255,255,0)" : "rgba(0,0,0,0)",
    textStrong:
      th === "light" ? "rgba(10,27,43,0.95)" : "rgba(255,255,255,0.95)",
    textMuted:
      th === "light" ? "rgba(10,27,43,0.70)" : "rgba(255,255,255,0.75)",
    grid:
      th === "light" ? "rgba(10,27,43,0.12)" : "rgba(255,255,255,0.12)",
    axis:
      th === "light" ? "rgba(10,27,43,0.25)" : "rgba(255,255,255,0.25)",
    colors: [
      "rgba(0,191,255,0.95)",
      "rgba(18,209,142,0.95)",
      "rgba(255,204,0,0.95)",
      "rgba(255,90,160,0.95)"
    ],
    fills: [
      "rgba(0,191,255,0.12)",
      "rgba(18,209,142,0.12)",
      "rgba(255,204,0,0.12)",
      "rgba(255,90,160,0.12)"
    ]
  };
}

/* =========================
   AFSNIT 05 – Graf fallback: søjler
   ========================= */
function renderBarChart({ ctx, canvas, list, eurDkk, mode }) {
  const w = canvas.width;
  const h = canvas.height;
  const t = getChartTheme();

  ctx.clearRect(0, 0, w, h);

  const labels = list.map((x) => String(x?.name || "Ukendt"));

  const values = list.map((x) => {
    const n = calcCurrentFundNumbers(x, eurDkk);

    if (mode === "price") return Number.isFinite(n.priceDKK) ? n.priceDKK : 0;
    return Number.isFinite(n.gain) ? n.gain : 0;
  });

  const padL = 70;
  const padR = 28;
  const padT = 38;
  const padB = 78;

  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const minV = Math.min(...values, 0);
  const maxV = Math.max(...values, 0);
  const range = maxV - minV || 1;

  const yOf = (v) => padT + (1 - (v - minV) / range) * innerH;

  ctx.lineWidth = 1;
  ctx.strokeStyle = t.axis;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + innerH);
  ctx.lineTo(padL + innerW, padT + innerH);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = t.textStrong;
  ctx.font = "700 15px system-ui";
  ctx.fillText(
    mode === "price"
      ? "Nuværende kurs i DKK pr. fond"
      : "Gevinst/tab i DKK pr. fond",
    padL,
    22
  );

  const n = values.length;
  const gap = 18;
  const barW = Math.max(18, (innerW - gap * (n - 1)) / n);

  for (let i = 0; i < n; i++) {
    const v = values[i];
    const x = padL + i * (barW + gap);
    const y = yOf(v);
    const y0 = yOf(0);

    const top = Math.min(y, y0);
    const height = Math.max(2, Math.abs(y0 - y));

    ctx.fillStyle =
      mode === "price"
        ? t.colors[0]
        : v >= 0
          ? t.colors[1]
          : "rgba(255,90,95,0.90)";

    ctx.fillRect(x, top, barW, height);

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "700 12px system-ui";
    ctx.fillText(`${fmtDKK(v)} DKK`, x + barW / 2, top + 17);

    ctx.fillStyle = t.textMuted;
    ctx.font = "13px system-ui";

    const raw = labels[i].replace(/^Nordea\s+/i, "").trim();
    const words = raw.split(/\s+/);

    let line1 = "";
    let line2 = "";

    for (const word of words) {
      if ((line1 + " " + word).trim().length <= 18 && line2 === "") {
        line1 = (line1 + " " + word).trim();
      } else {
        line2 = (line2 + " " + word).trim();
      }
    }

    if (line2.length > 20) line2 = line2.slice(0, 19) + "…";

    const baseY = padT + innerH + 28;

    ctx.fillText(line1, x + barW / 2, baseY);
    if (line2) ctx.fillText(line2, x + barW / 2, baseY + 17);
  }

  ctx.textAlign = "left";
  ctx.fillStyle = t.textMuted;
  ctx.font = "12px system-ui";
  ctx.fillText(
    "Bemærk: Historik mangler eller har kun ét punkt. Viser derfor nuværende data.",
    padL,
    h - 14
  );
}

/* =========================
   AFSNIT 06 – Graf: historisk linjegraf
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

      if (mode === "price") {
        return Number.isFinite(histPriceDKK) ? histPriceDKK : null;
      }

      if (mode === "value") {
        return Number.isFinite(histPriceDKK) && Number.isFinite(qty)
          ? histPriceDKK * qty
          : null;
      }

      return Number.isFinite(histPriceDKK) &&
        Number.isFinite(buyDKK) &&
        Number.isFinite(qty)
        ? qty * (histPriceDKK - buyDKK)
        : null;
    });

    return {
      name,
      values
    };
  });

  return {
    dates,
    series
  };
}

function renderLineChart({ ctx, canvas, list, eurDkk, mode }) {
  const w = canvas.width;
  const h = canvas.height;
  const t = getChartTheme();

  ctx.clearRect(0, 0, w, h);

  const { dates, series } = buildHistoricalSeries(list, eurDkk, mode);
  const flat = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));

  if (dates.length < 2 || flat.length < 2) {
    renderBarChart({ ctx, canvas, list, eurDkk, mode });
    return;
  }

  const padL = 82;
  const padR = 32;
  const padT = 46;
  const padB = 78;

  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  let minV = Math.min(...flat);
  let maxV = Math.max(...flat);

  if (mode === "gain") {
    minV = Math.min(minV, 0);
    maxV = Math.max(maxV, 0);
  }

  const margin = (maxV - minV || 1) * 0.08;
  minV -= margin;
  maxV += margin;

  const range = maxV - minV || 1;

  const xOf = (i) =>
    dates.length === 1
      ? padL + innerW / 2
      : padL + (i / (dates.length - 1)) * innerW;

  const yOf = (v) => padT + (1 - (v - minV) / range) * innerH;

  const title =
    mode === "price"
      ? "Historisk kursudvikling i DKK"
      : mode === "value"
        ? "Historisk porteføljeværdi pr. fond"
        : "Historisk gevinst/tab pr. fond";

  ctx.fillStyle = t.textStrong;
  ctx.font = "800 16px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(title, padL, 24);

  ctx.strokeStyle = t.grid;
  ctx.lineWidth = 1;

  const gridLines = 5;

  for (let i = 0; i <= gridLines; i++) {
    const y = padT + (i / gridLines) * innerH;
    const value = maxV - (i / gridLines) * range;

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

  if (mode === "gain" && minV < 0 && maxV > 0) {
    const y0 = yOf(0);

    ctx.strokeStyle = t.axis;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(padL, y0);
    ctx.lineTo(padL + innerW, y0);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (let sIndex = 0; sIndex < series.length; sIndex++) {
    const set = series[sIndex];
    const color = t.colors[sIndex % t.colors.length];

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

    ctx.fillStyle = color;

    for (let i = 0; i < set.values.length; i++) {
      const v = set.values[i];

      if (!Number.isFinite(v)) continue;

      const x = xOf(i);
      const y = yOf(v);

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const firstDate = dates[0] || "";
  const lastDate = dates[dates.length - 1] || "";

  ctx.fillStyle = t.textMuted;
  ctx.font = "12px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(firstDate, padL, padT + innerH + 26);

  ctx.textAlign = "right";
  ctx.fillText(lastDate, padL + innerW, padT + innerH + 26);

  const legendY = h - 22;
  let legendX = padL;

  for (let i = 0; i < series.length; i++) {
    const name = series[i].name
      .replace(/^Nordea\s+/i, "")
      .replace("Invest ", "")
      .replace(" Enhanced KL 1", "")
      .replace(" Fund BQ", "")
      .trim();

    const color = t.colors[i % t.colors.length];

    ctx.fillStyle = color;
    ctx.fillRect(legendX, legendY - 10, 12, 12);

    ctx.fillStyle = t.textMuted;
    ctx.font = "12px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(name, legendX + 18, legendY);

    legendX += Math.min(230, 42 + name.length * 7);
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

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const t = getChartTheme();

  if (!list.length) {
    ctx.font = "16px system-ui";
    ctx.fillStyle = t.textStrong;
    ctx.fillText("Ingen data at vise.", 20, 40);
    return;
  }

  const selectedMode = String(mode || "gain").toLowerCase();

  renderLineChart({
    ctx,
    canvas,
    list,
    eurDkk,
    mode: selectedMode
  });
}
