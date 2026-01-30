/* =========================================================
   js/ui.js (LÅST til index.html DOM)
   - Udfylder eksisterende felter (ingen HTML-injection)
   - Stats: #totalValue / #totalGain
   - Tabel: #fundRows
   - Status: #status
   - Graf: beløb på søjler + læsbar i light/dark
   ========================================================= */

/* =========================
   AFSNIT 01 – Helpers
   ========================= */
function parseISO(s) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDKK(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  const sign = x > 0 ? "+" : "";
  return sign + x.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";
}

function fmtLocalDateTime(iso) {
  const d = parseISO(iso);
  if (!d) return "—";
  return d.toLocaleString("da-DK", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
}

function toDKK(price, currency, eurDkk) {
  const p = Number(price);
  if (!Number.isFinite(p)) return NaN;
  const c = String(currency || "DKK").toUpperCase();
  if (c === "DKK") return p;
  if (c === "EUR") return p * Number(eurDkk || 0);
  return p; // fallback
}

function flash(el) {
  if (!el) return;
  el.classList.remove("flash");
  // force reflow
  void el.offsetWidth;
  el.classList.add("flash");
}

function theme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/* =========================
   AFSNIT 02 – Render (stats + tabel + status)
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
  const updatedAt = holdings?.updatedAt || holdings?.updatedAtISO || null;

  // --- totals ---
  let totalValueDKK = 0;
  let totalGainDKK = 0;

  // --- tabel ---
  if (rowsEl) rowsEl.innerHTML = "";

  for (const it of list) {
    const name = String(it?.name || "Ukendt");
    const currency = String(it?.currency || "DKK").toUpperCase();
    const qty = Number(it?.quantity ?? 0);

    const price = Number(it?.price ?? NaN);
    const buy = Number(it?.buyPrice ?? NaN);

    const priceDKK = toDKK(price, currency, eurDkk);
    const buyDKK = toDKK(buy, currency, eurDkk);

    const valueDKK = Number.isFinite(qty) && Number.isFinite(priceDKK) ? qty * priceDKK : NaN;
    const gainDKK =
      Number.isFinite(qty) && Number.isFinite(priceDKK) && Number.isFinite(buyDKK)
        ? qty * (priceDKK - buyDKK)
        : NaN;

    const investedDKK = Number.isFinite(qty) && Number.isFinite(buyDKK) ? qty * buyDKK : NaN;
    const pct =
      Number.isFinite(investedDKK) && investedDKK > 0 && Number.isFinite(gainDKK)
        ? (gainDKK / investedDKK) * 100
        : NaN;

    if (Number.isFinite(valueDKK)) totalValueDKK += valueDKK;
    if (Number.isFinite(gainDKK)) totalGainDKK += gainDKK;

    const pctClass = Number.isFinite(pct) ? (pct > 0 ? "pos" : pct < 0 ? "neg" : "neu") : "neu";
    const gainClass = Number.isFinite(gainDKK) ? (gainDKK > 0 ? "pos" : gainDKK < 0 ? "neg" : "neu") : "neu";

    if (rowsEl) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="left">${name}</td>
        <td class="${pctClass}">${fmtPct(pct)}</td>
        <td class="${gainClass}">${Number.isFinite(gainDKK) ? fmtDKK(gainDKK) + " DKK" : "—"}</td>
        <td>${Number.isFinite(price) ? price.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"} ${currency}</td>
        <td>${Number.isFinite(qty) ? qty.toLocaleString("da-DK") : "—"}</td>
        <td>${Number.isFinite(priceDKK) ? fmtDKK(priceDKK) : "—"} DKK</td>
      `;
      rowsEl.appendChild(tr);
    }
  }

  // totals ud
  if (totalValueEl) totalValueEl.textContent = `${fmtDKK(totalValueDKK)} DKK`;
  if (totalGainEl) totalGainEl.textContent = `${fmtDKK(totalGainDKK)} DKK`;

  // farve på gain tal (via class på selve værdien)
  if (totalGainEl) {
    totalGainEl.classList.remove("pos", "neg", "neu");
    totalGainEl.classList.add(totalGainDKK > 0 ? "pos" : totalGainDKK < 0 ? "neg" : "neu");
  }

  // status (med opdater tidspunkt)
  const refreshedLocal = fmtLocalDateTime(refreshedAtISO);
  const tradeLocal = fmtLocalDateTime(updatedAt);

  if (statusEl) {
    statusEl.textContent = `OK — data vist.  •  Seneste handelsdag: ${tradeLocal}  •  Opdateret af GitHub  •  Sidst opdateret: ${refreshedLocal}`;
  }

  // blink på bokse som “signal”
  flash(boxTotalEl);
  flash(boxGainEl);
}

/* =========================
   AFSNIT 03 – Graf (beløb på søjler)
   mode:
   - "gain"  : gevinst/tab DKK pr fond
   - "price" : nuværende kurs DKK pr fond
   ========================= */
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
  const txtMuted = th === "light" ? "rgba(10,27,43,0.70)" : "rgba(255,255,255,0.70)";
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
      const g =
        Number.isFinite(qty) && Number.isFinite(priceDKK) && Number.isFinite(buyDKK)
          ? qty * (priceDKK - buyDKK)
          : 0;
      return g;
    }

    return Number.isFinite(priceDKK) ? priceDKK : 0;
  });

  const padL = 60, padR = 22, padT = 28, padB = 60;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const minV = Math.min(...values, 0);
  const maxV = Math.max(...values, 0);
  const range = (maxV - minV) || 1;

  const yOf = (v) => padT + (1 - (v - minV) / range) * innerH;

  // akser
  ctx.lineWidth = 1;
  ctx.strokeStyle = axis;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + innerH);
  ctx.lineTo(padL + innerW, padT + innerH);
  ctx.stroke();

  // zero-linje
  if (minV < 0 && maxV > 0) {
    const y0 = yOf(0);
    ctx.strokeStyle = zero;
    ctx.beginPath();
    ctx.moveTo(padL, y0);
    ctx.lineTo(padL + innerW, y0);
    ctx.stroke();
  }

  const n = values.length;
  const gap = 14;
  const barW = Math.max(18, (innerW - gap * (n - 1)) / n);

  // titel
  ctx.textAlign = "left";
  ctx.fillStyle = txtStrong;
  ctx.font = "14px system-ui";
  ctx.fillText(mode === "gain" ? "Gevinst/tab (DKK) pr fond" : "Nuværende kurs (DKK) pr fond", padL, 18);

  // bars
  for (let i = 0; i < n; i++) {
    const v = values[i];
    const x = padL + i * (barW + gap);
    const y = yOf(v);
    const y0 = yOf(0);

    const top = Math.min(y, y0);
    const height = Math.max(2, Math.abs(y0 - y));

    // bar farve
    if (mode === "gain") {
      ctx.fillStyle =
        v > 0 ? "rgba(18,209,142,0.88)" :
        v < 0 ? "rgba(255,90,95,0.88)" :
        "rgba(0,191,255,0.78)";
    } else {
      ctx.fillStyle = "rgba(0,191,255,0.78)";
    }

    ctx.fillRect(x, top, barW, height);

    // beløb på søjle (hvid på baren)
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "12px system-ui";

    const valText = `${fmtDKK(v)} DKK`;
    const textY = top + 16; // inde i baren
    ctx.fillText(valText, x + barW / 2, textY);

    // labels (skrå)
    ctx.fillStyle = txtMuted;
    ctx.font = "12px system-ui";
    ctx.save();
    ctx.translate(x + barW / 2, padT + innerH + 22);
    ctx.rotate(-0.30);
    ctx.fillText(labels[i].slice(0, 22), 0, 0);
    ctx.restore();
  }
}
