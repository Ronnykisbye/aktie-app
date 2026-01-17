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

  const cur = (currency || "DKK").toUpperCase();
  if (cur === "EUR") return p * Number(eurDkk || NaN);
  return p;
}

/* =========================================================
   AFSNIT 02 – Dato/tid helpers (lokal tid)
   ========================================================= */

function parseISO(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
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
  // Forskellen i hele lokale dage (a -> b)
  if (!a || !b) return null;
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  const ms = db.getTime() - da.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/* =========================================================
   AFSNIT 03 – Små UI helpers
   ========================================================= */

function renderInfoBox(container, msg) {
  container.innerHTML = `
    <div style="
      margin-top:14px;
      padding:14px 14px;
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
   AFSNIT 04 – Build UI skeleton i #table container
   (matcher din index.html hvor #table er en tom div)
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
   AFSNIT 05 – Totals (2 tydelige 3D bokse)
   ========================================================= */

function renderTotals({ totalValue, totalProfit, purchaseDateISO }) {
  const totalsEl = document.querySelector(".totals");
  if (!totalsEl) return;

  const dateText = purchaseDateISO
    ? purchaseDateISO.split("-").reverse().join(".")
    : "—";

  totalsEl.innerHTML = `
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
   AFSNIT 06 – Render tabelrækker
   ========================================================= */

function renderRows(rows) {
  const tbody = document.querySelector("tbody");
  if (!tbody) return;

  tbody.innerHTML = rows
    .map((r) => {
      const pctClass = clsByNumber(r.profitPct);
      const dkkClass = clsByNumber(r.profitDKK);

      const kursTxt = Number.isFinite(r.currentPrice)
        ? `${fmtNum(r.currentPrice, 2)} ${r.currency || "DKK"}`
        : "—";

      return `
        <tr>
          <td class="left">${r.name}</td>
          <td class="${pctClass}">${fmtPct(r.profitPct)}</td>
          <td class="${dkkClass}">${fmtDKK(r.profitDKK)}</td>
          <td>${kursTxt}</td>
          <td>${fmtNum(r.units, 0)}</td>
          <td>${fmtDKK(r.currentPriceDKK)}</td>
        </tr>
      `;
    })
    .join("");
}

/* =========================================================
   AFSNIT 07 – OFFICIEL export: renderPortfolio
   Matcher main.js:
   renderPortfolio({ container, statusTextEl, lastUpdatedEl, holdings, eurDkk })
   holdings kan være:
   A) { updatedAt, items:[...] }   <-- det du har nu
   B) [ ... ]                     <-- fallback
   ========================================================= */

export function renderPortfolio(opts) {
  const { container, statusTextEl, lastUpdatedEl, holdings, eurDkk } = opts || {};
  if (!container) return;

  // A) Hvis holdings er objekt med items, så brug items
  const list = Array.isArray(holdings)
    ? holdings
    : holdings && Array.isArray(holdings.items)
    ? holdings.items
    : [];

  const updatedAt =
    holdings && holdings.updatedAt
      ? holdings.updatedAt
      : list[0] && list[0].updatedAt
      ? list[0].updatedAt
      : "";

  // Byg UI
  buildSkeleton(container);

  // =========================================================
  // AFSNIT 07.1 – “Seneste handelsdag” + automatisk status (A + C)
  // =========================================================
  const updatedDate = parseISO(updatedAt);
  const now = new Date();

  if (lastUpdatedEl) {
    // A: Skift label til “Seneste handelsdag”
    lastUpdatedEl.textContent = `Seneste handelsdag: ${formatDateTimeLocal(updatedAt)}`;
  }

  // Hvis ingen data: vis forklaring (men UI er stadig synligt)
  if (!list.length) {
    renderTotals({ totalValue: 0, totalProfit: 0, purchaseDateISO: "2025-09-10" });
    renderInfoBox(
      container,
      "Der er ingen priser at vise endnu. Tjek at data/prices.json indeholder items."
    );
    if (statusTextEl) statusTextEl.textContent = "Ingen data (holdings tom).";
    return;
  }

  // C: Automatisk forklaring hvis data ikke er fra i dag
  if (statusTextEl) {
    if (updatedDate && !isSameLocalDate(updatedDate, now)) {
      const days = diffDaysLocal(updatedDate, now);
      const extra =
        Number.isFinite(days) && days > 0
          ? ` (${days} dag${days === 1 ? "" : "e"} gammel)`
          : "";
      statusTextEl.textContent = `OK – data vist. Ingen nye kurser i dag endnu${extra}.`;
    } else {
      statusTextEl.textContent = "OK – data vist.";
    }
  }

  // =========================================================
  // AFSNIT 07.2 – Konverter items -> rows (robust mod feltnavne)
  // =========================================================
  const rows = list.map((h) => {
    const name = h.name || h.Navn || h.title || "Ukendt";

    // antal kan hedde: quantity / Antal / units
    const units = Number(h.quantity ?? h.Antal ?? h.units ?? h.qty ?? 0);

    // kurs kan hedde: price / Kurs / currentPrice
    const currency = (h.currency || h.Valuta || h.ccy || "DKK").toUpperCase();
    const currentPrice = Number(h.price ?? h.Kurs ?? h.currentPrice ?? NaN);

    // købskurs kan hedde: buyPrice / KøbsKurs / købskurs
    const buyPrice = Number(
      h.buyPrice ?? h.KøbsKurs ?? h.koebskurs ?? h.purchasePrice ?? NaN
    );
    const buyCurrency = (h.buyCurrency || currency).toUpperCase();

    const currentPriceDKK = toDKK(currentPrice, currency, eurDkk);
    const buyPriceDKK = toDKK(buyPrice, buyCurrency, eurDkk);

    const valueNow = units * currentPriceDKK;
    const valueBuy = units * buyPriceDKK;

    const profitDKK =
      Number.isFinite(valueNow) && Number.isFinite(valueBuy) ? valueNow - valueBuy : NaN;
    const profitPct =
      Number.isFinite(valueBuy) && valueBuy !== 0 ? (profitDKK / valueBuy) * 100 : NaN;

    return {
      name,
      units,
      currency,
      currentPrice,
      currentPriceDKK,
      profitDKK,
      profitPct,
      valueNow
    };
  });

  // Totals
  const totalValue = rows.reduce((sum, r) => sum + (Number.isFinite(r.valueNow) ? r.valueNow : 0), 0);
  const totalProfit = rows.reduce((sum, r) => sum + (Number.isFinite(r.profitDKK) ? r.profitDKK : 0), 0);

  renderTotals({
    totalValue,
    totalProfit,
    purchaseDateISO: "2025-09-10"
  });

  renderRows(rows);
}
