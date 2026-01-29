/* =========================================================
   js/ui.js
   UI rendering (tabel + 2 store “knapper” til totals)
   FIX: UI beregner selv % og DKK ud fra rå holdings
   ========================================================= */

/* =========================================================
   AFSNIT 01 – Små helpers
   ========================================================= */
function parseISO(s) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

  return p; // fallback
}

/* =========================================================
   AFSNIT 02 – Skeleton (bygger layout)
   ========================================================= */
function buildSkeleton(container, purchaseDateISO) {
  const dateText = String(purchaseDateISO || "").slice(0, 10) || "10.09.2025";

  container.innerHTML = `
    <div class="stats">
      <button class="stat-btn" id="totalValueBtn" type="button">
        <div class="stat-title">Samlet porteføljeværdi</div>
        <div class="stat-value" id="totalValue">—</div>
      </button>

      <button class="stat-btn stat-accent" id="totalProfitBtn" type="button">
        <div class="stat-title">Samlet gevinst/tab siden ${escapeHtml(dateText)}</div>
        <div class="stat-value" id="totalProfit">—</div>
      </button>
    </div>

    <div class="table-wrap">
      <table class="table">
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
    </div>
  `;
}

/* =========================================================
   AFSNIT 03 – Render
   ========================================================= */
export function renderPortfolio({
  container,
  statusTextEl,
  lastUpdatedEl,
  holdings,
  eurDkk,
  purchaseDateISO
}) {
  if (!container) return;

  // Ryd og byg
  container.innerHTML = "";
  buildSkeleton(container, purchaseDateISO);

  const list = Array.isArray(holdings?.items) ? holdings.items : [];
  const updatedAt = holdings?.updatedAt || holdings?.updatedAtISO || null;

  const updatedDate = parseISO(updatedAt);
  const now = new Date();

  /* ---------------------------
     AFSNIT 03A – Statuslinje
     --------------------------- */
  if (lastUpdatedEl) {
    lastUpdatedEl.textContent =
      "Seneste handelsdag: " +
      formatDateTimeLocal(updatedAt) +
      (holdings?.source ? " • Opdateret af: " + holdings.source : "");
  }

  if (statusTextEl) {
    if (updatedDate && !isSameLocalDate(updatedDate, now)) {
      const days = diffDaysLocal(updatedDate, now);
      statusTextEl.textContent =
        `OK – data vist. Ingen nye kurser i dag endnu (${days} dag${days === 1 ? "" : "e"} gammel).`;
    } else {
      statusTextEl.textContent = "OK – data vist. Nye kurser i dag.";
    }
  }

  /* ---------------------------
     AFSNIT 03B – Beregninger
     --------------------------- */
  const elTotalValue = container.querySelector("#totalValue");
  const elTotalProfit = container.querySelector("#totalProfit");
  const rowsEl = container.querySelector("#rows");

  let totalValue = 0;
  let totalProfit = 0;

  for (const it of list) {
    const name = String(it?.name || "Ukendt");
    const currency = String(it?.currency || "DKK").toUpperCase();

    const qty = Number(it?.quantity ?? it?.Antal ?? 0);
    const current = Number(it?.price ?? it?.Kurs ?? NaN);
    const buy = Number(it?.buyPrice ?? it?.KøbsKurs ?? NaN);

    const currentDKK = toDKK(current, currency, eurDkk);
    const buyDKK = toDKK(buy, currency, eurDkk);

    const valueDKK = Number.isFinite(qty) && Number.isFinite(currentDKK) ? qty * currentDKK : NaN;
    const profitDKK =
      Number.isFinite(qty) && Number.isFinite(currentDKK) && Number.isFinite(buyDKK)
        ? qty * (currentDKK - buyDKK)
        : NaN;

    const investedDKK = Number.isFinite(qty) && Number.isFinite(buyDKK) ? qty * buyDKK : NaN;
    const pct = Number.isFinite(investedDKK) && investedDKK > 0 && Number.isFinite(profitDKK)
      ? (profitDKK / investedDKK) * 100
      : NaN;

    if (Number.isFinite(valueDKK)) totalValue += valueDKK;
    if (Number.isFinite(profitDKK)) totalProfit += profitDKK;

    const pctClass = Number.isFinite(pct) ? (pct >= 0 ? "pos" : "neg") : "";
    const profitClass = Number.isFinite(profitDKK) ? (profitDKK >= 0 ? "pos" : "neg") : "";

    const currentText =
      Number.isFinite(current)
        ? current.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + currency
        : "—";

    const priceDkkText = Number.isFinite(currentDKK) ? formatNumberDKK(currentDKK) : "—";
    const profitDkkText = Number.isFinite(profitDKK) ? (formatNumberDKK(profitDKK) + " DKK") : "—";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(name)}</td>
      <td class="${pctClass}">${escapeHtml(formatPct(pct))}</td>
      <td class="${profitClass}">${escapeHtml(profitDkkText)}</td>
      <td>${escapeHtml(currentText)}</td>
      <td>${escapeHtml(Number.isFinite(qty) ? qty.toLocaleString("da-DK") : "—")}</td>
      <td>${escapeHtml(priceDkkText)} DKK</td>
    `;
    rowsEl.appendChild(tr);
  }

  if (elTotalValue) elTotalValue.textContent = `${formatNumberDKK(totalValue)} DKK`;

  const totalProfitClass = totalProfit >= 0 ? "pos" : "neg";
  if (elTotalProfit) {
    elTotalProfit.textContent = `${formatNumberDKK(totalProfit)} DKK`;
    elTotalProfit.classList.remove("pos", "neg");
    elTotalProfit.classList.add(totalProfitClass);
  }
}
