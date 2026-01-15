/*
AFSNIT 01 – Imports
*/
import { PURCHASE_DATE_ISO } from "./config.js";

/*
AFSNIT 02 – Formattere
*/
const fmtDKK = (v) => Number(v).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v) => (v > 0 ? "+" : "") + v.toFixed(2).replace(".", ",") + "%";

function arrowSymbol(delta) {
  if (delta > 0) return "▲";
  if (delta < 0) return "▼";
  return "•";
}

/*
AFSNIT 03 – Rendering
*/
export function renderPortfolio({ container, statusTextEl, lastUpdatedEl, holdings, eurDkk }) {
  const { items, updatedAt, source } = holdings;

  // Statusline
  const time = new Date(updatedAt).toLocaleString("da-DK", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
  // Statuslinje (kort)
  statusTextEl.textContent = `Kilde: ${source} | EUR/DKK: ${eurDkk.toFixed(4)} | Startdato: ${formatDate(PURCHASE_DATE_ISO)}`;
  // Seneste opdatering (dato + klokkeslæt)
  lastUpdatedEl.textContent = `Senest opdateret: ${time}`;

  let totalNowDKK = 0;
  let totalCostDKK = 0;

  let html = `
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
      <tbody>
  `;

  for (const row of items) {
    if (!row || !row.name) continue;

    const name = String(row.name).trim();
    const currency = String(row.currency || "").toUpperCase().trim();
    const price = Number(row.price);
    const buyPrice = Number(row.buyPrice);
    const quantity = Number(row.quantity);

    const priceDKK = currency === "EUR" ? price * eurDkk : price;
    const buyDKK = currency === "EUR" ? buyPrice * eurDkk : buyPrice;

    const valueNow = priceDKK * quantity;
    const valueStart = buyDKK * quantity;
    const deltaDKK = valueNow - valueStart;
    const deltaPct = buyPrice ? ((price - buyPrice) / buyPrice) * 100 : 0;

    totalNowDKK += valueNow;
    totalCostDKK += valueStart;

    const cls = deltaDKK > 0 ? "pos" : deltaDKK < 0 ? "neg" : "neu";

    html += `
      <tr>
        <td class="left">${escapeHtml(name)}</td>
        <td class="${cls}">${fmtPct(deltaPct)}</td>
        <td class="${cls}">${fmtDKK(deltaDKK)} DKK ${arrowSymbol(deltaDKK)}</td>
        <td>${price.toFixed(2)} ${currency}</td>
        <td>${quantity}</td>
        <td>${fmtDKK(priceDKK)} DKK</td>
      </tr>
    `;
  }

  html += "</tbody></table>";

  const totalDeltaDKK = totalNowDKK - totalCostDKK;
  const totalCls = totalDeltaDKK > 0 ? "pos" : totalDeltaDKK < 0 ? "neg" : "neu";

  html += `
    <div class="totals">
      <h3 class="pos">Samlet porteføljeværdi: ${fmtDKK(totalNowDKK)} DKK</h3>
      <h3 class="${totalCls}">Samlet gevinst/tab siden ${formatDate(PURCHASE_DATE_ISO)}: ${fmtDKK(totalDeltaDKK)} DKK</h3>
    </div>
  `;

  container.innerHTML = html;
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("da-DK");
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
