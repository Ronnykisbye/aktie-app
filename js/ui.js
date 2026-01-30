/* =========================================================
   js/ui.js
   - Render totals + tabel
   - Beregner selv DKK/% ud fra rå data (price/buyPrice/quantity)
   - Bruger .totals markup (matcher css/components.css)
   - “Blink” når der er opdateret (visuel feedback)
   - FIX: Eksporterer renderChart (så graf-knap altid virker)
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

  return p;
}

function flash(el) {
  if (!el) return;
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}

/* =========================================================
   AFSNIT 02 – Skeleton (de 2 store bokse + tabel)
   ========================================================= */
function buildSkeleton(container, purchaseDateISO) {
  const dateText = (purchaseDateISO || "2025-09-10").slice(0, 10);
  const pretty = dateText.split("-").reverse().join(".");

  container.innerHTML = `
    <div class="totals" id="totals">
      <h3 class="neu total-value" id="totalValueCard">
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
   AFSNIT 03 – Render Portfolio
   ========================================================= */
export function renderPortfolio({ container, statusTextEl, lastUpdatedEl, holdings, eurDkk, purchaseDateISO }) {
  buildSkeleton(container, purchaseDateISO);

  const updatedAt = holdings?.updatedAt || holdings?.updatedAtISO || null;
  if (lastUpdatedEl) {
    lastUpdatedEl.textContent = "Seneste handelsdag: " + formatDateTimeLocal(updatedAt) + " • Opdateret af GitHub";
  }

  const list = Array.isArray(holdings?.items) ? holdings.items : [];
  const rowsEl = container.querySelector("#rows");

  const totalValueEl = container.querySelector("#totalValue");
  const totalProfitEl = container.querySelector("#totalProfit");
  const totalValueCard = container.querySelector("#totalValueCard");
  const totalProfitCard = container.querySelector("#totalProfitCard");
  const totalsWrap = container.querySelector("#totals");

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

  if (totalValueEl) totalValueEl.textContent = `${formatNumberDKK(totalValueDKK)} DKK`;
  if (totalProfitEl) totalProfitEl.textContent = `${formatNumberDKK(totalProfitDKK)} DKK`;

  totalProfitCard?.classList.remove("pos", "neg", "neu");
  totalProfitCard?.classList.add(totalProfitDKK > 0 ? "pos" : totalProfitDKK < 0 ? "neg" : "neu");

  if (statusTextEl) statusTextEl.textContent = "OK — data vist.";

  flash(totalsWrap);
  flash(totalValueCard);
  flash(totalProfitCard);
}

/* =========================================================
   AFSNIT 04 – FIX: Render Chart (stabil “snapshot” bar chart)
   ========================================================= */
export function renderChart({ canvas, holdings, eurDkk, mode }) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const list = Array.isArray(holdings?.items) ? holdings.items : [];
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  if (!list.length) {
    ctx.font = "16px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("Ingen data at vise.", 20, 40);
    return;
  }

  const labels = list.map(x => String(x?.name || "Ukendt"));
  const values = list.map((x) => {
    const currency = String(x?.currency || "DKK").toUpperCase();
    const qty = Number(x?.quantity ?? 0);
    const price = Number(x?.price ?? NaN);
    const buy = Number(x?.buyPrice ?? NaN);

    const priceDKK = toDKK(price, currency, eurDkk);
    const buyDKK = toDKK(buy, currency, eurDkk);

    if (mode === "profit") {
      const p = Number.isFinite(qty) && Number.isFinite(priceDKK) && Number.isFinite(buyDKK)
        ? qty * (priceDKK - buyDKK)
        : 0;
      return p;
    }
    return Number.isFinite(priceDKK) ? priceDKK : 0;
  });

  const padL = 60, padR = 20, padT = 22, padB = 50;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const minV = Math.min(...values, 0);
  const maxV = Math.max(...values, 0);
  const range = (maxV - minV) || 1;

  const yOf = (v) => padT + (1 - (v - minV) / range) * innerH;

  // Axes
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + innerH);
  ctx.lineTo(padL + innerW, padT + innerH);
  ctx.stroke();

  // Zero line
  if (minV < 0 && maxV > 0) {
    const y0 = yOf(0);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(padL, y0);
    ctx.lineTo(padL + innerW, y0);
    ctx.stroke();
  }

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

    if (mode === "profit") {
      ctx.fillStyle = v > 0 ? "rgba(18,209,142,0.85)" : v < 0 ? "rgba(255,90,95,0.85)" : "rgba(14,165,255,0.75)";
    } else {
      ctx.fillStyle = "rgba(14,165,255,0.75)";
    }
    ctx.fillRect(x, top, barW, height);

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "12px system-ui";
    ctx.save();
    ctx.translate(x + barW / 2, padT + innerH + 18);
    ctx.rotate(-0.35);
    ctx.textAlign = "center";
    ctx.fillText(labels[i].slice(0, 18), 0, 0);
    ctx.restore();
  }

  ctx.fillStyle = "rgba(255,255,255,0.90)";
  ctx.font = "14px system-ui";
  ctx.fillText(mode === "profit" ? "Gevinst/tab (DKK) pr fond" : "Nuværende kurs (DKK) pr fond", padL, 16);
}
