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

function fmtChartDate(value) {
  const date = parseISO(value);
  if (!date) return "—";
  return date.toLocaleDateString("da-DK", { day: "2-digit", month: "2-digit", year: "numeric" });
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
export function calcCurrentFundNumbers(item, eurDkk) {
  const currency = String(item?.currency || "DKK").toUpperCase();
  const qty = Number(item?.quantity ?? 0);

  const price = Number(item?.price ?? NaN);
  const buy = Number(item?.buyPrice ?? NaN);

  const priceDKK = toDKK(price, currency, eurDkk);
  const buyDKK = toDKK(buy, currency, eurDkk);

  const value = Number.isFinite(qty) && Number.isFinite(priceDKK) ? qty * priceDKK : NaN;
  const purchase = Number.isFinite(qty) && Number.isFinite(buyDKK) ? qty * buyDKK : NaN;
  const priceGain = Number.isFinite(value) && Number.isFinite(purchase) ? value - purchase : NaN;
  const dividend = Number(item?._dividendTotalDKK ?? 0);
  const gain = Number.isFinite(priceGain) && Number.isFinite(dividend) ? priceGain + dividend : NaN;
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
    priceGain,
    dividend,
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
  const day = String(date || "").slice(0, 10);
  const hit = history.find((p) => String(p?.date || "").slice(0, 10) === day);
  const price = Number(hit?.price);
  return Number.isFinite(price) ? price : null;
}

function getCommonHistoryDates(list) {
  if (!list.length) return [];

  const dateSets = list.map((item) =>
    new Set(
      (Array.isArray(item?.history) ? item.history : [])
        .map((point) => String(point?.date || "").slice(0, 10))
        .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    )
  );

  return [...dateSets[0]]
    .filter((date) => dateSets.every((set) => set.has(date)))
    .sort((a, b) => a.localeCompare(b));
}

function linearTrend(values) {
  const valid = values
    .map((value, index) => ({ index, value }))
    .filter((point) => Number.isFinite(point.value));

  if (valid.length < 2) return values.slice();

  const meanX = valid.reduce((sum, point) => sum + point.index, 0) / valid.length;
  const meanY = valid.reduce((sum, point) => sum + point.value, 0) / valid.length;
  const denominator = valid.reduce((sum, point) => sum + (point.index - meanX) ** 2, 0);
  const slope = denominator
    ? valid.reduce((sum, point) => sum + (point.index - meanX) * (point.value - meanY), 0) / denominator
    : 0;
  const intercept = meanY - slope * meanX;

  return values.map((_, index) => intercept + slope * index);
}

export function buildPortfolioSeries(list, eurDkk, { percentage = true } = {}) {
  const dates = getCommonHistoryDates(Array.isArray(list) ? list : []);
  const totals = dates.map((date) =>
    list.reduce((sum, item) => {
      const price = findHistoryPrice(item, date);
      const priceDKK = toDKK(price, item?.currency, eurDkk);
      const quantity = Number(item?.quantity ?? 0);
      return sum + priceDKK * quantity;
    }, 0)
  );

  const startValue = totals[0];
  const lastValue = totals.at(-1);
  const values = percentage && Number.isFinite(startValue) && startValue !== 0
    ? totals.map((total) => ((total / startValue) - 1) * 100)
    : totals.slice();
  const trendValues = linearTrend(values);
  const changeDKK = Number.isFinite(startValue) && Number.isFinite(lastValue)
    ? lastValue - startValue
    : NaN;
  const changePct = Number.isFinite(changeDKK) && startValue !== 0
    ? (changeDKK / startValue) * 100
    : NaN;
  const trendChangePct = percentage && trendValues.length > 1
    ? trendValues.at(-1) - trendValues[0]
    : Number.isFinite(startValue) && startValue !== 0 && trendValues.length > 1
      ? ((trendValues.at(-1) - trendValues[0]) / startValue) * 100
      : NaN;

  return {
    dates,
    totals,
    startValue,
    lastValue,
    changeDKK,
    changePct,
    trendChangePct,
    series: [
      { name: "Samlet portefølje", values, colorIndex: 0 },
      { name: "Lineær tendens", values: trendValues, colorIndex: 2, dashed: true, points: false }
    ]
  };
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
  totalBreakdownEl,
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
  const dataSource = String(holdings?.meta?.pricesSource || "");
  const sourceText = dataSource === "official-nordea"
    ? "Officielle Nordea-kurser"
    : dataSource.startsWith("partial-official")
      ? "Nordea-kurser med sikker fallback"
      : "Fallback-data";

  const parts = [];
  parts.push("OK — data vist.");
  parts.push(`Seneste handelsdag: ${fmtTime(lastTrading || githubUpdated)}`);
  parts.push(sourceText);
  parts.push(`Datafil: ${fmtTime(githubUpdated)}`);
  parts.push(`Vist: ${fmtTime(refreshedAt)}`);

  if (statusEl) statusEl.textContent = parts.join(" • ");

  let totalValue = 0;
  let totalPurchase = 0;
  let totalPriceGain = 0;
  let totalDividend = 0;

  for (const it of list) {
    const n = calcCurrentFundNumbers(it, eurDkk);
    if (Number.isFinite(n.value)) totalValue += n.value;
    if (Number.isFinite(n.purchase)) totalPurchase += n.purchase;
    if (Number.isFinite(n.priceGain)) totalPriceGain += n.priceGain;
    if (Number.isFinite(n.dividend)) totalDividend += n.dividend;
  }

  const totalGain = totalPriceGain + totalDividend;

  if (totalValueEl) totalValueEl.textContent = `${fmtDKK(totalValue)} DKK`;
  if (totalGainEl) totalGainEl.textContent = `${fmtDKK(totalGain)} DKK`;
  if (totalBreakdownEl) {
    totalBreakdownEl.textContent =
      `Kursgevinst: ${fmtDKK(totalPriceGain)} DKK • Bruttoudbytte: ${fmtDKK(totalDividend)} DKK`;
  }

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
  if (mode === "portfolio" || mode === "portfolio-value") {
    return buildPortfolioSeries(list, eurDkk, { percentage: mode === "portfolio" });
  }

  const dates = getAllHistoryDates(list);

  const series = list.map((item) => {
    const name = String(item?.name || "Ukendt");
    const currency = String(item?.currency || "DKK").toUpperCase();
    const qty = Number(item?.quantity ?? 0);
    const buyDKK = toDKK(item?.buyPrice, currency, eurDkk);
    const dividendTotalDKK = Number(item?._dividendTotalDKK ?? 0);
    const dividendPaymentDate = String(item?._dividendPaymentDate || "");

    const values = dates.map((date) => {
      const histPrice = findHistoryPrice(item, date);
      if (histPrice === null) return null;

      const histPriceDKK = toDKK(histPrice, currency, eurDkk);

      if (mode === "price") return Number.isFinite(histPriceDKK) ? histPriceDKK : null;
      if (mode === "value") return Number.isFinite(histPriceDKK) && Number.isFinite(qty) ? histPriceDKK * qty : null;

      const paidDividend =
        dividendPaymentDate && date.slice(0, 10) >= dividendPaymentDate
          ? dividendTotalDKK
          : 0;

      return Number.isFinite(histPriceDKK) && Number.isFinite(buyDKK) && Number.isFinite(qty)
        ? qty * (histPriceDKK - buyDKK) + paidDividend
        : null;
    });

    return { name, values, colorIndex: null };
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

  if (mode === "gain" || mode === "portfolio") {
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
    mode === "portfolio"
      ? "Samlet portefølje: procentvis udvikling"
      : mode === "portfolio-value"
        ? "Samlet porteføljeværdi"
        : mode === "price"
      ? "Fancy graf: Historisk kursudvikling"
      : mode === "value"
        ? "Fancy graf: Porteføljeværdi pr. fond"
        : "Fancy graf: Samlet afkast pr. fond";

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
    const axisText = mode === "portfolio"
      ? `${value >= 0 ? "+" : ""}${fmtPct(value)} %`
      : fmtShortDKK(value);
    ctx.fillText(axisText, padL - 10, y + 4);
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
    const colorIndex = Number.isInteger(set.colorIndex) ? set.colorIndex : sIndex;
    const color = t.colors[colorIndex % t.colors.length];

    ctx.save();
    ctx.shadowColor = t.glow[colorIndex % t.glow.length];
    ctx.shadowBlur = set.dashed ? 0 : 14;
    ctx.strokeStyle = color;
    ctx.lineWidth = set.dashed ? 2 : 3;
    ctx.setLineDash(set.dashed ? [8, 6] : []);
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
    ctx.setLineDash([]);
    ctx.restore();

    if (set.points === false) continue;

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
    ctx.fillText(fmtChartDate(dates[hoverIndex]), boxX + 12, boxY + 20);

    for (let i = 0; i < series.length; i++) {
      const val = series[i].values[hoverIndex];
      const colorIndex = Number.isInteger(series[i].colorIndex) ? series[i].colorIndex : i;
      const color = t.colors[colorIndex % t.colors.length];

      ctx.fillStyle = color;
      ctx.fillRect(boxX + 12, boxY + 36 + i * 22, 10, 10);

      ctx.fillStyle = t.textStrong;
      ctx.font = "12px system-ui";
      const tooltipValue = mode === "portfolio"
        ? `${val >= 0 ? "+" : ""}${fmtPct(val)} %`
        : `${fmtDKK(val)} DKK`;
      ctx.fillText(`${shortName(series[i].name)}: ${tooltipValue}`, boxX + 30, boxY + 46 + i * 22);
    }
  }

  ctx.fillStyle = t.textMuted;
  ctx.font = "12px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(fmtChartDate(dates[0]), padL, padT + innerH + 28);

  ctx.textAlign = "right";
  ctx.fillText(fmtChartDate(dates[dates.length - 1]), padL + innerW, padT + innerH + 28);

  let legendX = padL;
  const legendY = h - 24;

  for (let i = 0; i < series.length; i++) {
    const colorIndex = Number.isInteger(series[i].colorIndex) ? series[i].colorIndex : i;
    const color = t.colors[colorIndex % t.colors.length];
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
export function renderChart({ canvas, holdings, eurDkk, mode, summaryEl }) {
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const list = Array.isArray(holdings?.items) ? holdings.items : [];
  const selectedMode = String(mode || "gain").toLowerCase();
  const portfolio = selectedMode === "portfolio" || selectedMode === "portfolio-value"
    ? buildPortfolioSeries(list, eurDkk, { percentage: selectedMode === "portfolio" })
    : null;

  if (summaryEl) {
    if (portfolio?.dates.length) {
      const signDKK = portfolio.changeDKK >= 0 ? "+" : "";
      const signPct = portfolio.changePct >= 0 ? "+" : "";
      const trendSign = portfolio.trendChangePct >= 0 ? "+" : "";
      summaryEl.textContent =
        `Fælles handelsdage: ${fmtChartDate(portfolio.dates[0])}–${fmtChartDate(portfolio.dates.at(-1))}` +
        ` • Ændring: ${signDKK}${fmtDKK(portfolio.changeDKK)} DKK (${signPct}${fmtPct(portfolio.changePct)} %)` +
        ` • Lineær tendens: ${trendSign}${fmtPct(portfolio.trendChangePct)} %`;
    } else {
      summaryEl.textContent = "Denne visning sammenligner fondenes verificerede historiske datapunkter.";
    }
  }

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
