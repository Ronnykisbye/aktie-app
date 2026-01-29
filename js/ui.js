/* =========================================================
   AFSNIT 01 – Format helpers
   ========================================================= */
function fmtDKK(n) {
  const x = Number(n) || 0;
  return x.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " DKK";
}

function fmtPct(n) {
  const x = Number(n) || 0;
  const sign = x > 0 ? "+" : "";
  return sign + x.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";
}

function toDKK(price, currency, eurDkk) {
  const p = Number(price);
  if (!Number.isFinite(p)) return 0;
  const c = String(currency || "DKK").toUpperCase();
  if (c === "DKK") return p;
  if (c === "EUR") return p * Number(eurDkk || 0);
  return p;
}

function toLocalDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("da-DK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}

function daysSince(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const ms = now.getTime() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/* =========================================================
   AFSNIT 02 – UI: render
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

  const items = Array.isArray(holdings?.items) ? holdings.items : [];

  // find “seneste updatedAt” i datasættet
  let maxUpdatedAt = holdings?.updatedAt || null;
  for (const it of items) {
    if (it?.updatedAt && (!maxUpdatedAt || it.updatedAt > maxUpdatedAt)) {
      maxUpdatedAt = it.updatedAt;
    }
  }

  // beregninger
  let totalValue = 0;
  let totalProfit = 0;

  const rows = items.map((it) => {
    const name = it?.name || "Ukendt";
    const currency = (it?.currency || "DKK").toUpperCase();

    const qty = Number(it?.quantity ?? it?.Antal ?? 0) || 0;

    const current = Number(it?.price ?? it?.Kurs ?? 0) || 0;
    const buy = Number(it?.buyPrice ?? it?.KøbsKurs ?? 0) || 0;

    const currentDKK = toDKK(current, currency, eurDkk);
    const buyDKK = toDKK(buy, currency, eurDkk);

    const valueDKK = qty * currentDKK;
    const profitDKK = qty * (currentDKK - buyDKK);

    totalValue += valueDKK;
    totalProfit += profitDKK;

    const investedDKK = qty * buyDKK;
    const pct = investedDKK > 0 ? (profitDKK / investedDKK) * 100 : 0;

    return {
      name,
      pct,
      profitDKK,
      currentText:
        currency === "EUR"
          ? (Number(current).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR")
          : (Number(current).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " DKK"),
      qty,
      currentDKK
    };
  });

  // statuslinje
  const dSince = daysSince(maxUpdatedAt);
  const checkedAtText = ""; // main.js tilføjer “Senest tjekket …” bagefter
  const staleText =
    dSince === null ? "OK – data vist." :
    dSince === 0 ? "OK – data vist. Nye kurser i dag." :
    `OK – data vist. Ingen nye kurser i dag endnu (${dSince} dag gammel).`;

  if (statusTextEl) {
    statusTextEl.textContent = `${staleText}${checkedAtText}`;
  }

  if (lastUpdatedEl) {
    const lu = toLocalDateTime(maxUpdatedAt);
    lastUpdatedEl.textContent = `Seneste handelsdag: ${lu || "—"}`;
  }

  // render HTML (bokse + tabel)
  const profitClass = totalProfit >= 0 ? "pos" : "neg";

  container.innerHTML = `
    <div class="summaryRow">
      <div class="summaryCard">
        <div class="summaryLabel">Samlet porteføljeværdi:</div>
        <div class="summaryValue">${fmtDKK(totalValue)}</div>
      </div>

      <div class="summaryCard">
        <div class="summaryLabel">Samlet gevinst/tab siden ${String(purchaseDateISO || "").slice(0,10) || "start"}:</div>
        <div class="summaryValue ${profitClass}">${fmtDKK(totalProfit)}</div>
      </div>
    </div>

    <div class="tableWrap">
      <table class="portfolioTable">
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
          ${rows.map(r => `
            <tr>
              <td>${r.name}</td>
              <td class="${r.pct >= 0 ? "pos" : "neg"}">${fmtPct(r.pct)}</td>
              <td class="${r.profitDKK >= 0 ? "pos" : "neg"}">${fmtDKK(r.profitDKK)}</td>
              <td>${r.currentText}</td>
              <td>${Number(r.qty).toLocaleString("da-DK")}</td>
              <td>${fmtDKK(r.currentDKK)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}
