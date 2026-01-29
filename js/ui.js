/* =========================================================
   js/ui.js
   - Render totals + tabel
   - FIX: Beregner selv DKK/% ud fra rå data (price/buyPrice/quantity)
   - FIX: Bruger .totals markup (matcher css/components.css)
   - FIX: “Blink” når der er opdateret (visuel feedback)
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

function isSameLocalDate(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function diffDaysLocal(a, b) {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  const ms = db - da;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function toDKK(price, currency, eurDkk) {
  const p = Number(price);
  if (!Number.isFinite(p)) return NaN;

  const c = String(currency || "DKK").toUpperCase();
  if (c === "DKK") return p;
  if (c === "EUR") return p * Number(eurDkk || 0);

  return p; // fallback hvis ukendt valuta
}

function clearEl(el) {
  if (!el) return;
  el.innerHTML = "";
}

function flash(el) {
  if (!el) return;
  el.classList.remove("flash");
  // force reflow, så animation altid starter
  void el.offsetWidth;
  el.classList.add("flash");
}

/* =========================================================
   AFSNIT 02 – Markup der matcher CSS (.totals + h3 + .value)
   ========================================================= */
function buildSkeleton(container, purchaseDateISO) {
  const dateText = (purchaseDateISO || "2025-09-10").slice(0, 10);

  container.innerHTML = `
    <div class="totals" id="totals">
      <h3 class="neu total-value" id="totalValueCard">
        Samlet porteføljeværdi
        <span class="value" id="totalValue">—</span>
      </h3>

      <h3 class="neu" id="totalProfitCard">
        Samlet gevinst/tab siden ${dateText.split("-").reverse().join(".")}
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
   AFSNIT 03 – Render (beregner alt her)
   ========================================================= */
export function renderPortfolio({
  container,
  statusTextEl,
  lastUpdatedEl,
  holdings,
  eurDkk,
  purchaseDateISO
}) {
  clearEl(container);

  const updatedAt = holdings?.updatedAt || holdings?.updatedAtISO || null;
  const list = Array.isArray(holdings?.items) ? holdings.items : [];

  buildSkeleton(container, purchaseDateISO);

  const updatedDate = parseISO(updatedAt);
  const now = new Date();

  // “Seneste handelsdag …”
  if (lastUpdatedEl) {
    lastUpdatedEl.textContent =
      "Seneste handelsdag: " +
      formatDateTimeLocal(updatedAt) +
      " • Opdateret automatisk af GitHub";
  }

  // Status-linje
  if (statusTextEl) {
    if (updatedDate && !isSameLocalDate(updatedDate, now)) {
      const days = diffDaysLocal(updatedDate, now);
      statusTextEl.textContent =
        `OK – data vist. Ingen nye kurser i dag endnu (${days} dag${days === 1 ? "" : "e"} gammel).`;
    } else {
      statusTextEl.textContent = "OK – data vist. Nye kurser i dag.";
    }
  }

  const totalsEl = container.querySelector("#totals");
  const elTotalValueCard = container.querySelector("#totalValueCard");
  const elTotalProfitCard = container.querySelector("#totalProfitCard");

  const elTotalValue = container.querySelector("#totalValue");
  const elTotalProfit = container.querySelector("#totalProfit");
  const rowsEl = container.querySelector("#rows");

  let totalValueDKK = 0;
  let totalProfitDKK = 0;

  for (const it of list) {
    const name = String(it?.name || "Ukendt");
    const currency = String(it?.currency || "DKK").toUpperCase();

    const qty = Number(it?.quantity ?? 0);
    const current = Number(it?.price ?? NaN);
    const buy = Number(it?.buyPrice ?? NaN);

    const currentDKK = toDKK(current, currency, eurDkk);
   _toggle: {
      // if currency is EUR and eurDkk missing, currentDKK becomes NaN – ok
    }
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

  // Totals
  if (elTotalValue) elTotalValue.textContent = `${formatNumberDKK(totalValueDKK)} DKK`;
  if (elTotalProfit) elTotalProfit.textContent = `${formatNumberDKK(totalProfitDKK)} DKK`;

  // Farve-klassificering på profit-kortet
  if (elTotalProfitCard) {
    elTotalProfitCard.classList.remove("pos", "neg", "neu");
    elTotalProfitCard.classList.add(totalProfitDKK > 0 ? "pos" : totalProfitDKK < 0 ? "neg" : "neu");
  }

  // Visuel feedback (blink)
  flash(totalsEl);
  flash(elTotalValueCard);
  flash(elTotalProfitCard);
}
