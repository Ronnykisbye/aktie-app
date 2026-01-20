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
  const sign = x > 0 ? "+" : "";
  return sign + fmtNum(x, 2) + " %";
}

export function clsByNumber(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  if (x > 0) return "pos";
  if (x < 0) return "neg";
  return "";
}

/* =========================================================
   AFSNIT 02 – Dato/tid (lokal) + “dage gammel”
   ========================================================= */

function parseISO(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTimeLocal(input) {
  const d = input instanceof Date ? input : parseISO(input);
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

function diffDaysLocal(older, newer) {
  if (!older || !newer) return 0;

  // Sammenlign på “dato-niveau” (lokal tid) for stabilt “X dage gammel”
  const o = new Date(older.getFullYear(), older.getMonth(), older.getDate());
  const n = new Date(newer.getFullYear(), newer.getMonth(), newer.getDate());

  const ms = n.getTime() - o.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

/* =========================================================
   AFSNIT 03 – UI helpers (skeleton/boxes)
   ========================================================= */

function buildSkeleton(container) {
  container.innerHTML = `
    <div class="totals-grid" id="totalsGrid"></div>

    <div class="table-wrap">
      <table class="data-table">
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
        <tbody id="rowsBody"></tbody>
      </table>
    </div>
  `;
}

function renderInfoBox(container, text) {
  container.innerHTML = `
    <div class="info-box">
      ${text}
    </div>
  `;
}

/* =========================================================
   AFSNIT 04 – Totals (3D bokse)
   ========================================================= */

function renderTotals({ totalValue, totalProfit, purchaseDateISO }) {
  const totalsGrid = document.getElementById("totalsGrid");
  if (!totalsGrid) return;

  totalsGrid.innerHTML = `
    <div class="total-card">
      <div class="total-title">Samlet porteføljeværdi:</div>
      <div class="total-pill">${fmtDKK(totalValue)}</div>
    </div>

    <div class="total-card">
      <div class="total-title">Samlet gevinst/tab siden ${purchaseDateISO.split("-").reverse().join(".")}:</div>
      <div class="total-pill ${clsByNumber(totalProfit)}">${fmtDKK(totalProfit)}</div>
    </div>
  `;
}

/* =========================================================
   AFSNIT 05 – Tabelrækker
   ========================================================= */

function renderRows(rows) {
  const tbody = document.getElementById("rowsBody");
  if (!tbody) return;

  tbody.innerHTML = rows
    .map(r => {
      return `
        <tr>
          <td>${r.name}</td>

          <td class="${clsByNumber(r.profitPct)}">
            ${fmtPct(r.profitPct)}
          </td>

          <td class="${clsByNumber(r.profitDKK)}">
            ${fmtDKK(r.profitDKK)}
          </td>

          <td>
            ${fmtNum(r.currentPrice, 2)} ${r.currency}
          </td>

          <td>
            ${fmtNum(r.units, 0)}
          </td>

          <td>
            ${fmtDKK(r.currentPriceDKK)}
          </td>
        </tr>
      `;
    })
    .join("");
}

/* =========================================================
   AFSNIT 06 – Konvertering / beregning
   ========================================================= */

function toDKK(price, currency, eurDkk) {
  const p = Number(price);
  if (!Number.isFinite(p)) return 0;

  const c = (currency || "DKK").toUpperCase();

  if (c === "DKK") return p;
  if (c === "EUR") return p * Number(eurDkk || 0);

  // fallback: hvis ukendt valuta, så behandl som DKK for ikke at smadre UI
  return p;
}

/* =========================================================
   AFSNIT 07 – Hovedrender: portfolio
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

  /* === A: LABEL (tydeligere) === */
  if (lastUpdatedEl) {
    lastUpdatedEl.textContent =
      "Seneste kurs fra: " + formatDateTimeLocal(updatedAt);
  }

  /* === C: STATUS (senest tjekket + alder) === */
  if (statusTextEl) {
    const latestTxt = formatDateTimeLocal(updatedAt);
    const checkedTxt = formatDateTimeLocal(now);

    if (updatedDate && !isSameLocalDate(updatedDate, now)) {
      const days = diffDaysLocal(updatedDate, now);
      statusTextEl.textContent =
        `OK – data vist. Ingen nye kurser i dag endnu (${days} dag${days === 1 ? "" : "e"} gammel). ` +
        `Seneste kurs: ${latestTxt}. Senest tjekket: ${checkedTxt}.`;
    } else {
      statusTextEl.textContent =
        `OK – data vist. Seneste kurs: ${latestTxt}. Senest tjekket: ${checkedTxt}.`;
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
    const profit = units * (currentDKK - buyDKK);

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
