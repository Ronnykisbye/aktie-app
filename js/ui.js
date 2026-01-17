/* =========================================================
   AFSNIT 01 – Formatteringshjælpere
   ========================================================= */

export function fmtDKK(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return (
    new Intl.NumberFormat("da-DK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(x) + " DKK"
  );
}

export function fmtNum(n, digits = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("da-DK", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(x);
}

export function fmtPct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return fmtNum(x, 2) + " %";
}

export function clsByNumber(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "neu";
  if (x > 0) return "pos";
  if (x < 0) return "neg";
  return "neu";
}

function toDKK(price, currency, eurDkk) {
  const p = Number(price);
  if (!Number.isFinite(p)) return NaN;
  if ((currency || "DKK").toUpperCase() === "EUR") return p * Number(eurDkk || NaN);
  return p;
}

/* =========================================================
   AFSNIT 02 – Dato / tid helpers (lokal tid)
   ========================================================= */

function parseISO(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTimeLocal(iso) {
  const d = parseISO(iso);
  if (!d) return "—";
  return new Intl.DateTimeFormat("da-DK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}

function isSameLocalDate(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function diffDaysLocal(a, b) {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

/* =========================================================
   AFSNIT 03 – Små UI helpers
   ========================================================= */

function renderInfoBox(container, msg) {
  container.innerHTML = `
    <div style="
      margin-top:14px;
      padding:14px;
      border-radius:14px;
      border:1px solid var(--border);
      background:var(--card);
      box-shadow:0 10px 22px rgba(0,0,0,0.10);
      text-align:center;
      color:var(--muted);
      font-weight:700;
    ">
      ${msg}
    </div>
  `;
}

/* =========================================================
   AFSNIT 04 – UI skeleton
   ========================================================= */

function buildSkeleton(container) {
  container.innerHTML = `
    <div class="totals"></div>
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
      <tbody></tbody>
    </table>
  `;
}

/* =========================================================
   AFSNIT 05 – Totals
   ========================================================= */

function renderTotals({ totalValue, totalProfit, purchaseDateISO }) {
  const el = document.querySelector(".totals");
  if (!el) return;

  const dateText = purchaseDateISO
    ? purchaseDateISO.split("-").reverse().join(".")
    : "—";

  el.innerHTML = `
    <h3>
      Samlet porteføljeværdi:
      <span class="value">${fmtDKK(totalValue)}</span>
    </h3>
    <h3 class="${clsByNumber(totalProfit)}">
      Samlet gevinst/tab siden ${dateText}:
      <span class="value">${fmtDKK(totalProfit)}</span>
    </h3>
  `;
}

/* =========================================================
   AFSNIT 06 – Rækker
   ========================================================= */

function renderRows(rows) {
  const tbody = document.querySelector("tbody");
  if (!tbody) return;

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.name}</td>
      <td class="${clsByNumber(r.profitPct)}">${fmtPct(r.profitPct)}</td>
      <td class="${clsByNumber(r.profitDKK)}">${fmtDKK(r.profitDKK)}</td>
      <td>${fmtNum(r.currentPrice, 2)} ${r.currency}</td>
      <td>${fmtNum(r.units, 0)}</td>
      <td>${fmtDKK(r.currentPriceDKK)}</td>
    </tr>
  `).join("");
}

/* =========================================================
   AFSNIT 07 – renderPortfolio (OFFICIEL)
   ========================================================= */

export function renderPortfolio({ container, statusTextEl, lastUpdatedEl, holdings, eurDkk }) {
  if (!container) return;

  const list = Array.isArray(holdings)
    ? holdings
    : holdings?.items || [];

  const updatedAt = holdings?.updatedAt || list[0]?.updatedAt || null;

  buildSkeleton(container);

  const updatedDate = parseISO(updatedAt);
  const now = new Date();

  /* === A: LABEL === */
  if (lastUpdatedEl) {
    lastUpdatedEl.textContent =
      "Seneste handelsdag: " + formatDateTimeLocal(updatedAt);
  }

  /* === C: STATUS === */
  if (statusTextEl) {
    if (updatedDate && !isSameLocalDate(updatedDate, now)) {
      const days = diffDaysLocal(updatedDate, now);
      statusTextEl.textContent =
        `OK – data vist. Ingen nye kurser i dag endnu (${days} dag${days === 1 ? "" : "e"} gammel).`;
    } else {
      statusTextEl.textContent = "OK – data vist.";
    }
  }

  if (!list.length) {
    renderInfoBox(container, "Ingen data tilgængelig.");
    return;
  }

  const rows = list.map(h => {
    const units = Number(h.quantity ?? h.Antal ?? 0);
    const price = Number(h.price ?? h.Kurs ?? 0);
    const buy = Number(h.buyPrice ?? h.KøbsKurs ?? 0);
    const currency = (h.currency || "DKK").toUpperCase();

    const currentDKK = toDKK(price, currency, eurDkk);
    const buyDKK = toDKK(buy, currency, eurDkk);

    const value = units * currentDKK;
    const profit = value - units * buyDKK;

    return {
      name: h.name || "Ukendt",
      units,
      currency,
      currentPrice: price,
      currentPriceDKK: currentDKK,
      profitDKK: profit,
      profitPct: buyDKK ? (profit / (units * buyDKK)) * 100 : 0,
      valueNow: value
    };
  });

  renderTotals({
    totalValue: rows.reduce((s, r) => s + r.valueNow, 0),
    totalProfit: rows.reduce((s, r) => s + r.profitDKK, 0),
    purchaseDateISO: "2025-09-10"
  });

  renderRows(rows);
}
