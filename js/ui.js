/* =========================================================
   js/ui.js (LÅST til index.html DOM)
   - Udfylder #totalValue, #totalGain, #fundRows, #status
   - Ingen HTML-injection
   - Graf: beløb på søjler + læsbar tekst i light/dark
   ========================================================= */

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
  return v.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toDKK(value, currency, eurDkk) {
  const v = Number(value);
  if (!Number.isFinite(v)) return NaN;
  const c = String(currency || "DKK").toUpperCase();
  if (c === "EUR") return v * Number(eurDkk);
  return v;
}

function theme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function flash(el) {
  if (!el) return;
  el.classList.remove("flash");
  // force reflow
  void el.offsetWidth;
  el.classList.add("flash");
}

export function renderPortfolio({ statusEl, totalValueEl, totalGainEl, rowsEl, boxTotalEl, boxGainEl, holdings, eurDkk, refreshedAtISO }) {
  const list = Array.isArray(holdings?.items) ? holdings.items : [];

  // status
  const lastTrading = parseISO(holdings?.meta?.lastTradingDayISO);
  const githubUpdated = parseISO(holdings?.meta?.githubUpdatedISO);
  const refreshedAt = parseISO(refreshedAtISO);

  const parts = [];
  parts.push("OK — data vist.");
  parts.push(`Seneste handelsdag: ${fmtTime(lastTrading)}`);
  parts.push("Opdateret af GitHub");
  parts.push(`Sidst opdateret: ${fmtTime(refreshedAt)}`);

  if (statusEl) statusEl.textContent = parts.join(" • ");

  // totals
  let totalValue = 0;
  let totalPurchase = 0;

  for (const it of list) {
    const qty = Number(it?.quantity ?? 0);
    const price = toDKK(it?.price, it?.currency, eurDkk);
    const buy = toDKK(it?.buyPrice, it?.currency, eurDkk);

    const value = Number.isFinite(qty) && Number.isFinite(price) ? qty * price : 0;
    const purchase = Number.isFinite(qty) && Number.isFinite(buy) ? qty * buy : 0;

    totalValue += value;
    totalPurchase += purchase;
  }

  const totalGain = totalValue - totalPurchase;

  if (totalValueEl) totalValueEl.textContent = `${fmtDKK(totalValue)} DKK`;
  if (totalGainEl) totalGainEl.textContent = `${fmtDKK(totalGain)} DKK`;

  flash(boxTotalEl);
  flash(boxGainEl);

  // table
  if (rowsEl) rowsEl.innerHTML = "";

  for (const it of list) {
    const name = String(it?.name || "Ukendt");
    const currency = String(it?.currency || "DKK").toUpperCase();
    const qty = Number(it?.quantity ?? 0);

    const price = Number(it?.price ?? NaN);
    const buy = Number(it?.buyPrice ?? NaN);

    const priceDKK = toDKK(price, currency, eurDkk);
    const buyDKK = toDKK(buy, currency, eurDkk);

    const value = Number.isFinite(qty) && Number.isFinite(priceDKK) ? qty * priceDKK : NaN;
    const purchase = Number.isFinite(qty) && Number.isFinite(buyDKK) ? qty * buyDKK : NaN;

    const gain = Number.isFinite(value) && Number.isFinite(purchase) ? value - purchase : NaN;
    const pct = Number.isFinite(gain) && Number.isFinite(purchase) && purchase !== 0 ? (gain / purchase) * 100 : NaN;

    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.textContent = name;

    const tdPct = document.createElement("td");
    tdPct.textContent = `${pct >= 0 ? "+" : ""}${fmtPct(pct)} %`;
    tdPct.className = pct >= 0 ? "pos" : "neg";

    const tdGain = document.createElement("td");
    tdGain.textContent = `${fmtDKK(gain)} DKK`;
    tdGain.className = gain >= 0 ? "pos" : "neg";

    const tdPrice = document.createElement("td");
    tdPrice.textContent = currency === "EUR" ? `${fmtPct(price)} EUR` : `${fmtPct(price)} DKK`;

    const tdQty = document.createElement("td");
    tdQty.textContent = qty.toLocaleString("da-DK");

    const tdPriceDKK = document.createElement("td");
    tdPriceDKK.textContent = `${fmtDKK(priceDKK)} DKK`;

    tr.append(tdName, tdPct, tdGain, tdPrice, tdQty, tdPriceDKK);
    rowsEl?.appendChild(tr);
  }
}

export function renderChart({ canvas, holdings, eurDkk, mode }) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const list = Array.isArray(holdings?.items) ? holdings.items : [];
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const th = theme();
  const txtStrong = th === "light" ? "rgba(10,27,43,0.92)" : "rgba(255,255,255,0.92)";
  const txtMuted = th === "light" ? "rgba(10,27,43,0.70)" : "rgba(255,255,255,0.80)";
  const axis = th === "light" ? "rgba(10,27,43,0.18)" : "rgba(255,255,255,0.25)";
  const zero = th === "light" ? "rgba(10,27,43,0.25)" : "rgba(255,255,255,0.35)";

  if (!list.length) {
    ctx.font = "16px system-ui";
    ctx.fillStyle = txtStrong;
    ctx.fillText("Ingen data at vise.", 20, 40);
    return;
  }

  const labels = list.map((x) => String(x?.name || "Ukendt"));
  const values = list.map((x) => {
    const currency = String(x?.currency || "DKK").toUpperCase();
    const qty = Number(x?.quantity ?? 0);
    const price = Number(x?.price ?? NaN);
    const buy = Number(x?.buyPrice ?? NaN);

    const priceDKK = toDKK(price, currency, eurDkk);
    const buyDKK = toDKK(buy, currency, eurDkk);

    if (mode === "gain") {
      return Number.isFinite(qty) && Number.isFinite(priceDKK) && Number.isFinite(buyDKK)
        ? qty * (priceDKK - buyDKK)
        : 0;
    }
    return Number.isFinite(priceDKK) ? priceDKK : 0;
  });

  const padL = 60, padR = 22, padT = 28, padB = 70; // <-- mere plads til 2 linjer labels
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const minV = Math.min(...values, 0);
  const maxV = Math.max(...values, 0);
  const range = (maxV - minV) || 1;

  const yOf = (v) => padT + (1 - (v - minV) / range) * innerH;

  ctx.lineWidth = 1;
  ctx.strokeStyle = axis;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + innerH);
  ctx.lineTo(padL + innerW, padT + innerH);
  ctx.stroke();

  if (minV < 0 && maxV > 0) {
    const y0 = yOf(0);
    ctx.strokeStyle = zero;
    ctx.beginPath();
    ctx.moveTo(padL, y0);
    ctx.lineTo(padL + innerW, y0);
    ctx.stroke();
  }

  ctx.textAlign = "left";
  ctx.fillStyle = txtStrong;
  ctx.font = "15px system-ui";
  ctx.fillText(mode === "gain" ? "Gevinst/tab (DKK) pr fond" : "Nuværende kurs (DKK) pr fond", padL, 18);

  const n = values.length;
  const gap = 14;
  const barW = Math.max(18, (innerW - gap * (n - 1)) / n);

  for (let i = 0; i < n; i++) {
    const v = values[i];
    const x = padL + i * (barW + gap);
    const y = yOf(v);
    const y0 = yOf(0);

    const top = Math.min(y, y0);
    const height = Math.max(2, Math.abs(y0 - y));

    ctx.fillStyle =
      mode === "gain"
        ? (v > 0 ? "rgba(18,209,142,0.88)" : v < 0 ? "rgba(255,90,95,0.88)" : "rgba(0,191,255,0.78)")
        : "rgba(0,191,255,0.78)";

    ctx.fillRect(x, top, barW, height);

    // beløb på bar (hvid)
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "12px system-ui";
    ctx.fillText(`${fmtDKK(v)} DKK`, x + barW / 2, top + 16);

    // label (lige, 2 linjer, professionelt)
    ctx.fillStyle = txtMuted;
    ctx.font = "13px system-ui";
    ctx.textAlign = "center";

    const raw = labels[i].replace(/^Nordea\s+/i, "").trim();
    const maxLen = 16;

    const words = raw.split(/\s+/);
    let line1 = "";
    let line2 = "";

    for (const w2 of words) {
      if ((line1 + " " + w2).trim().length <= maxLen && line2 === "") {
        line1 = (line1 + " " + w2).trim();
      } else {
        line2 = (line2 + " " + w2).trim();
      }
    }

    if (!line1) line1 = raw.slice(0, maxLen);
    if (line2.length > maxLen) line2 = line2.slice(0, maxLen - 1) + "…";

    const baseY = padT + innerH + 24;
    ctx.fillText(line1, x + barW / 2, baseY);
    if (line2) ctx.fillText(line2, x + barW / 2, baseY + 16);
  }
}
