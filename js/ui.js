/* =========================================================
   js/ui.js
   - Render totals + tabel
   - Beregner DKK/% ud fra rå data (price/buyPrice/quantity)
   - Totals renderes som 2 store “kort/knapper”
   - Graf: stabil snapshot-graf + BELØB TEKST på søjler
   ========================================================= */

/* =========================================================
   AFSNIT 01 – Helpers
   ========================================================= */
function parseISO(s) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatNumberDKK(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  const sign = x > 0 ? "+" : "";
  return sign + x.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";
}

function formatPrice(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTimeLocal(iso) {
  const d = parseISO(iso);
  if (!d) return "—";
  return d.toLocaleString("da-DK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function toDKK(price, currency, eurDkk) {
  const p = Number(price);
  if (!Number.isFinite(p)) return NaN;

  const c = String(currency || "DKK").toUpperCase();
  if (c === "DKK") return p;
  if (c === "EUR") return p * Number(eurDkk || 0);
  return p;
}

function flash(el) {
  if (!el) return;
  el.classList.remove("flash");
  // force reflow
  // eslint-disable-next-line no-unused-expressions
  el.offsetWidth;
  el.classList.add("flash");
}

function getTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/* =========================================================
   AFSNIT 02 – Skeleton (2 store totals + tabel)
   ========================================================= */
function buildSkeleton(container, purchaseDateISO) {
  const dateText = (purchaseDateISO || "2025-09-10").slice(0, 10);
  const pretty = dateText.split("-").reverse().join(".");

  container.innerHTML = `
    <div class="totals" id="totals">
      <h3 class="neu" id="totalValueCard">
        Samlet porteføljeværdi
        <span class="value" id="totalValue">—</span>
      </h3>

      <h3 class="neu" id="totalProfitCard">
        Samlet gevinst/tab siden ${pretty}
        <span class="value" id="totalProfit">—</span>
      </h3>
    </div>

    <table>
      <thead>
        <tr>
          <th>Navn</th>
          <th>Udvikling (%)</th>
          <th>Udvikling (DKK)</th>
          <th>Kurs</th>
          <th>Antal</th>
          <th>Kurs (DKK)</th>
        </tr>
      </thead>
      <tbody id="rows"></tbody>
    </table>
  `;
}

/* =========================================================
   AFSNIT 03 – Render portfolio (tabel + totals)
   ========================================================= */
export function renderPortfolio({
  container,
  statusTextEl,
  lastUpdatedEl,
  holdings,
  eurDkk,
  purchaseDateISO
}) {
  buildSkeleton(container, purchaseDateISO);

  const updatedAt = holdings?.updatedAt || holdings?.updatedAtISO || null;
  if (lastUpdatedEl) {
    lastUpdatedEl.textContent = "Seneste handelsdag: " + formatDateTimeLocal(updatedAt) + " • Opdateret af GitHub";
  }

  const list = Array.isArray(holdings?.items) ? holdings.items : [];
  const rowsEl = container.querySelector("#rows");

  const totalsEl = container.querySelector("#totals");
  const elTotalValueCard = container.querySelector("#totalValueCard");
  const elTotalProfitCard = container.querySelector("#totalProfitCard");

  const elTotalValue = container.querySelector("#totalValue");
  const elTotalProfit = container.querySelector("#totalProfit");

  let totalValueDKK = 0;
  let totalProfitDKK = 0;

  for (const it of list) {
    const name = String(it?.name || "Ukendt");
    const currency = String(it?.currency || "DKK").toUpperCase();

    const qty = Number(it?.quantity ?? 0);
    const current = Number(it?.price ?? NaN);
    const buy = Number(it?.buyPrice ?? NaN);

    const currentDKK = toDKK(current, currency, eurDkk);
    const buyDKK = toDKK(buy, currency, eurDkk);

    const investedDKK = Number.isFinite(qty) && Number.isFinite(buyDKK) ? qty * buyDKK : NaN;
    const valueDKK = Number.isFinite(qty) && Number.isFinite(currentDKK) ? qty * currentDKK : NaN;
    const profitDKK =
      Number.isFinite(qty) && Number.isFinite(currentDKK) && Number.isFinite(buyDKK)
        ? qty * (currentDKK - buyDKK)
        : NaN;

    const pct =
      Number.isFinite(investedDKK) && investedDKK > 0 && Number.isFinite(profitDKK)
        ? (profitDKK / investedDKK) * 100
        : NaN;

    if (Number.isFinite(valueDKK)) totalValueDKK += valueDKK;
    if (Number.isFinite(profitDKK)) totalProfitDKK += profitDKK;

    const pctClass = Number.isFinite(pct) ? (pct > 0 ? "pos" : pct < 0 ? "neg" : "neu") : "neu";
    const profitClass =
      Number.isFinite(profitDKK) ? (profitDKK > 0 ? "pos" : profitDKK < 0 ? "neg" : "neu") : "neu";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="left">${name}</td>
      <td class="${pctClass}">${formatPct(pct)}</td>
      <td class="${profitClass}">${Number.isFinite(profitDKK) ? formatNumberDKK(profitDKK) + " DKK" : "—"}</td>
      <td>${formatPrice(current)} ${currency}</td>
      <td>${Number.isFinite(qty) ? qty.toLocaleString("da-DK") : "—"}</td>
      <td>${Number.isFinite(currentDKK) ? formatNumberDKK(currentDKK) : "—"} DKK</td>
    `;
    rowsEl.appendChild(tr);
  }

  if (elTotalValue) elTotalValue.textContent = `${formatNumberDKK(totalValueDKK)} DKK`;
  if (elTotalProfit) elTotalProfit.textContent = `${formatNumberDKK(totalProfitDKK)} DKK`;

  if (elTotalProfitCard) {
    elTotalProfitCard.classList.remove("pos", "neg", "neu");
    elTotalProfitCard.classList.add(totalProfitDKK > 0 ? "pos" : totalProfitDKK < 0 ? "neg" : "neu");
  }

  if (statusTextEl) statusTextEl.textContent = "OK — data vist.";

  // Visuel feedback (blink)
  flash(totalsEl);
  flash(elTotalValueCard);
  flash(elTotalProfitCard);
}

/* =========================================================
   AFSNIT 04 – Graf (snapshot) + beløb på søjler
   mode:
   - "profit"    = gevinst/tab i DKK pr fond
   - "price_all" = nuværende kurs i DKK pr fond
   ========================================================= */
export function renderChart({ canvas, holdings, eurDkk, mode }) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const theme = getTheme();
  const textStrong = theme === "light" ? "rgba(10,27,43,0.92)" : "rgba(255,255,255,0.92)";
  const textMuted  = theme === "light" ? "rgba(10,27,43,0.72)" : "rgba(255,255,255,0.72)";
  const axisCol    = theme === "light" ? "rgba(10,27,43,0.18)" : "rgba(255,255,255,0.25)";
  const zeroCol    = theme === "light" ? "rgba(10,27,43,0.25)" : "rgba(255,255,255,0.35)";

  const list = Array.isArray(holdings?.items) ? holdings.items : [];
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  if (!list.length) {
    ctx.font = "16px system-ui";
    ctx.fillStyle = textStrong;
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
    const buyDKK   = toDKK(buy, currency, eurDkk);

    if (mode === "profit") {
      const p =
        Number.isFinite(qty) && Number.isFinite(priceDKK) && Number.isFinite(buyDKK)
          ? qty * (priceDKK - buyDKK)
          : 0;
      return p;
    }
    return Number.isFinite(priceDKK) ? priceDKK : 0;
  });

  const padL = 60, padR = 22, padT = 30, padB = 64;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const minV = Math.min(...values, 0);
  const maxV = Math.max(...values, 0);
  const range = (maxV - minV) || 1;

  const yOf = (v) => padT + (1 - (v - minV) / range) * innerH;

  // Axes
  ctx.lineWidth = 1;
  ctx.strokeStyle = axisCol;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + innerH);
  ctx.lineTo(padL + innerW, padT + innerH);
  ctx.stroke();

  // Zero-line
  if (minV < 0 && maxV > 0) {
    const y0 = yOf(0);
    ctx.strokeStyle = zeroCol;
    ctx.beginPath();
    ctx.moveTo(padL, y0);
    ctx.lineTo(padL + innerW, y0);
    ctx.stroke();
  }

  const n = values.length;
  const gap = 14;
  const barW = Math.max(18, (innerW - gap * (n - 1)) / n);

  ctx.textAlign = "center";

  for (let i = 0; i < n; i++) {
    const v = values[i];
    const x = padL + i * (barW + gap);
    const y = yOf(v);
    const y0 = yOf(0);

    const top = Math.min(y, y0);
    const height = Math.max(2, Math.abs(y0 - y));

    // Bar farve
    if (mode === "profit") {
      ctx.fillStyle =
        v > 0 ? "rgba(18,209,142,0.88)" :
        v < 0 ? "rgba(255,90,95,0.88)" :
        "rgba(14,165,255,0.78)";
    } else {
      ctx.fillStyle = "rgba(14,165,255,0.78)";
    }

    ctx.fillRect(x, top, barW, height);

    // BELØB på søjlen
    const valueText = `${formatNumberDKK(v)} DKK`;
    ctx.font = "12px system-ui";
    ctx.fillStyle = textStrong;

    const textY = top - 8;
    if (textY > padT + 10) {
      ctx.fillText(valueText, x + barW / 2, textY);
    } else {
      ctx.fillText(valueText, x + barW / 2, top + 18);
    }

    // Labels
    ctx.fillStyle = textMuted;
    ctx.font = "12px system-ui";
    ctx.save();
    ctx.translate(x + barW / 2, padT + innerH + 22);
    ctx.rotate(-0.28);
    ctx.fillText(labels[i].slice(0, 22), 0, 0);
    ctx.restore();
  }

  // Titel
  ctx.textAlign = "left";
  ctx.fillStyle = textStrong;
  ctx.font = "14px system-ui";
  const title = mode === "profit" ? "Gevinst/tab (DKK) pr fond" : "Nuværende kurs (DKK) pr fond";
  ctx.fillText(title, padL, 18);
}
