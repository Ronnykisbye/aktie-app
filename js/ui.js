/* =========================================================
   AFSNIT 01 – Formatteringshjælpere
   ========================================================= */

export function fmtDKK(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("da-DK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(x) + " DKK";
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

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("da-DK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}

/* =========================================================
   AFSNIT 02 – Render: tom/fejl beskeder
   ========================================================= */

function renderEmpty(container, msg) {
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
   AFSNIT 03 – Render: tabel + totals (2 bokse)
   - Vi bygger HTML ind i #table containeren
   - Så matcher vi index.html hvor der kun er <div id="table"></div>
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

function renderRows(rows) {
  const tbody = document.querySelector("tbody");
  if (!tbody) return;

  tbody.innerHTML = rows.map(r => {
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
  }).join("");
}

/* =========================================================
   AFSNIT 04 – OFFICIEL export: renderPortfolio
   Matcher main.js:
   renderPortfolio({ container, statusTextEl, lastUpdatedEl, holdings, eurDkk })
   ========================================================= */

export function renderPortfolio(opts) {
  const {
    container,
    statusTextEl,
    lastUpdatedEl,
    holdings,
    eurDkk
  } = opts || {};

  if (!container) return;

  // 1) Hvis ingen holdings, så vis forklaring (i stedet for “tom skærm”)
  if (!Array.isArray(holdings) || holdings.length === 0) {
    buildSkeleton(container);
    renderTotals({ totalValue: 0, totalProfit: 0, purchaseDateISO: "2025-09-10" });
    renderEmpty(container, "Der er ingen priser at vise endnu. Tjek at data/prices.json indeholder items (ikke placeholder).");
    if (statusTextEl) statusTextEl.textContent = "Ingen data (holdings tom).";
    if (lastUpdatedEl) lastUpdatedEl.textContent = "Senest opdateret: —";
    return;
  }

  // 2) Byg UI-skelet
  buildSkeleton(container);

  // 3) Find “senest opdateret” hvis holdings har meta
  //    (vi prøver flere mulige felter, så det virker robust)
  const updatedAt =
    holdings.updatedAt ||
    holdings[0]?.updatedAt ||
    holdings[0]?.meta?.updatedAt ||
    "";

  if (lastUpdatedEl) {
    lastUpdatedEl.textContent = `Senest opdateret: ${formatDateTime(updatedAt)}`;
  }

  // 4) Konverter holdings -> rows (robust mod forskellige feltnavne)
  const rows = holdings.map(h => {
    const name = h.name || h.Navn || h.title || "Ukendt";
    const units = Number(h.units ?? h.antal ?? h.qty ?? 0);

    const currency = (h.currency || h.valuta || h.ccy || "DKK").toUpperCase();
    const currentPrice = Number(h.currentPrice ?? h.kurs ?? h.price ?? NaN);

    // Købspris kan hedde mange ting – vi prøver dem alle
    const buyPrice = Number(h.buyPrice ?? h.købskurs ?? h.koebskurs ?? h.purchasePrice ?? NaN);
    const buyCurrency = (h.buyCurrency || h.buyCcy || currency).toUpperCase();

    const currentPriceDKK = toDKK(currentPrice, currency, eurDkk);
    const buyPriceDKK = toDKK(buyPrice, buyCurrency, eurDkk);

    const valueNow = units * currentPriceDKK;
    const valueBuy = units * buyPriceDKK;

    const profitDKK = (Number.isFinite(valueNow) && Number.isFinite(valueBuy)) ? (valueNow - valueBuy) : NaN;
    const profitPct = (Number.isFinite(valueBuy) && valueBuy !== 0) ? ((profitDKK / valueBuy) * 100) : NaN;

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

  // 5) Totals
  const totalValue = rows.reduce((sum, r) => sum + (Number.isFinite(r.valueNow) ? r.valueNow : 0), 0);
  const totalProfit = rows.reduce((sum, r) => sum + (Number.isFinite(r.profitDKK) ? r.profitDKK : 0), 0);

  renderTotals({
    totalValue,
    totalProfit,
    purchaseDateISO: "2025-09-10"
  });

  // 6) Tabel
  renderRows(rows);

  if (statusTextEl) statusTextEl.textContent = "OK – data vist.";
}
