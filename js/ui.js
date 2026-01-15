/* =========================================================
   AFSNIT 01 – Hjælpere (formattering)
   ========================================================= */

export function fmtDKK(n) {
  try {
    return new Intl.NumberFormat("da-DK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(n)) + " DKK";
  } catch {
    return `${n} DKK`;
  }
}

export function fmtPct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return new Intl.NumberFormat("da-DK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(x) + " %";
}

/* =========================================================
   AFSNIT 02 – Klasse til positiv/negativ/neutral
   ========================================================= */

export function clsByNumber(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "neu";
  if (x > 0) return "pos";
  if (x < 0) return "neg";
  return "neu";
}

/* =========================================================
   AFSNIT 03 – Render totals (3D bokse + 3D tal-pill)
   VIGTIGT:
   - Bokse styles via .totals h3 i components.css
   - Tallene får <span class="value"> ... </span>
   ========================================================= */

export function renderTotals({ totalValue, totalProfit, purchaseDateISO }) {
  const totalsEl = document.querySelector(".totals");
  if (!totalsEl) return;

  const dateText = purchaseDateISO
    ? purchaseDateISO.split("-").reverse().join(".")
    : "";

  const profitClass = clsByNumber(totalProfit);

  totalsEl.innerHTML = `
    <h3>
      Samlet porteføljeværdi:
      <span class="value">${fmtDKK(totalValue)}</span>
    </h3>

    <h3 class="${profitClass}">
      Samlet gevinst/tab siden ${dateText}:
      <span class="value">${fmtDKK(totalProfit)}</span>
    </h3>
  `;
}

/* =========================================================
   AFSNIT 04 – Render tabel
   Forventer rows med:
   { name, units, buyPrice, currentPrice, valueNow, profitDKK, profitPct }
   ========================================================= */

export function renderTable(rows) {
  const tbody = document.querySelector("tbody");
  if (!tbody) return;

  tbody.innerHTML = rows.map(r => {
    const profitClass = clsByNumber(r.profitDKK);

    return `
      <tr>
        <td class="left">${r.name ?? ""}</td>
        <td>${r.units ?? ""}</td>
        <td>${fmtDKK(r.buyPrice)}</td>
        <td>${fmtDKK(r.currentPrice)}</td>
        <td>${fmtDKK(r.valueNow)}</td>
        <td class="${profitClass}">${fmtDKK(r.profitDKK)}</td>
        <td class="${profitClass}">${fmtPct(r.profitPct)}</td>
      </tr>
    `;
  }).join("");
}

/* =========================================================
   AFSNIT 05 – Render statuslinje (senest opdateret)
   - appen kan kalde setLastUpdated(text)
   ========================================================= */

export function setLastUpdated(text) {
  const el = document.querySelector("#lastUpdated");
  if (!el) return;
  el.textContent = text || "";
}
