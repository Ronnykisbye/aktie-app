/* =========================================================
   ui.js
   UI rendering (tabel + 2 store “knapper” til totals)
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

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clearEl(el) {
  if (!el) return;
  el.innerHTML = "";
}

/* =========================================================
   AFSNIT 02 – Skeleton (bygger layout)
   ========================================================= */
function buildSkeleton(container) {
  container.innerHTML = `
    <div class="stats">
      <button class="stat-btn" id="totalValueBtn" type="button">
        <div class="stat-title">Samlet porteføljeværdi</div>
        <div class="stat-value" id="totalValue">—</div>
      </button>

      <button class="stat-btn stat-accent" id="totalProfitBtn" type="button">
        <div class="stat-title">Samlet gevinst/tab siden 10.09.2025</div>
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
  clearEl(container);

  const updatedAt = holdings?.updatedAt || holdings?.updatedAtISO || null;
  const list = Array.isArray(holdings?.items) ? holdings.items : [];

  buildSkeleton(container);

  const updatedDate = parseISO(updatedAt);
  const now = new Date();

  // Linjen med “Seneste handelsdag”
  if (lastUpdatedEl) {
    lastUpdatedEl.textContent =
      "Seneste handelsdag: " +
      formatDateTimeLocal(updatedAt) +
      (holdings?.source ? " • Opdateret af: " + holdings.source : "");
  }

  // Status (OK / hvor gammel)
  if (statusTextEl) {
    if (updatedDate && !isSameLocalDate(updatedDate, now)) {
      const days = diffDaysLocal(updatedDate, now);
      statusTextEl.textContent =
        `OK – data vist. Ingen nye kurser i dag endnu (${days} dag${days === 1 ? "" : "e"} gammel).`;
    } else {
      statusTextEl.textContent = "OK – data vist. Nye kurser i dag.";
    }
  }

  // Find elementer til totals
  const elTotalValue = container.querySelector("#totalValue");
  const elTotalProfit = container.querySelector("#totalProfit");
  const rowsEl = container.querySelector("#rows");

  // Beregninger
  // NOTE: main.js sender allerede rækker med udregnede felter.
  // Her summerer vi bare på de felter, der ligger i list.
  let totalValue = 0;
  let totalProfit = 0;

  // Render rækker
  for (const it of list) {
    const name = escapeHtml(it.name);
    const pct = it.gainPctText ?? "—";
    const gainDkk = it.gainDkk ?? null;
    const gainDkkText = it.gainDkkText ?? "—";

    const price = it.price ?? null;
    const cur = it.currency ?? "";
    const count = it.count ?? it.quantity ?? it.amount ?? null;

    const priceDkk = it.priceDkk ?? null;

    // Summer
    if (Number.isFinite(it.valueDkk)) totalValue += it.valueDkk;
    if (Number.isFinite(gainDkk)) totalProfit += gainDkk;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${name}</td>
      <td class="pos">${escapeHtml(pct)}</td>
      <td class="pos">${escapeHtml(gainDkkText)}</td>
      <td>${escapeHtml(price ?? "—")} ${escapeHtml(cur)}</td>
      <td>${escapeHtml(count ?? "—")}</td>
      <td>${escapeHtml(priceDkk ?? "—")} DKK</td>
    `;
    rowsEl.appendChild(tr);
  }

  if (elTotalValue) elTotalValue.textContent = `${formatNumberDKK(totalValue)} DKK`;
  if (elTotalProfit) elTotalProfit.textContent = `${formatNumberDKK(totalProfit)} DKK`;
}
