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

export function fmtPct(n, digits = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  const sign = x > 0 ? "+" : "";
  return `${sign}${fmtNum(x, digits)} %`;
}

/* =========================================================
   AFSNIT 02 – Dato/tid (UTC ISO -> lokal DK)
   ========================================================= */

function parseISO(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateTimeLocal(iso) {
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
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function diffDaysLocal(a, b) {
  // Sammenlign lokale datoer (midnat->midnat)
  const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  const ms = bb - aa;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/* =========================================================
   AFSNIT 03 – Beregninger
   ========================================================= */

function toNumber(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function toDKK(price, currency, eurDkk) {
  const p = toNumber(price);
  const c = String(currency || "DKK").toUpperCase();
  if (c === "DKK") return p;
  if (c === "EUR") return p * toNumber(eurDkk);
  return p;
}

function computeRow(h, eurDkk) {
  const qty = toNumber(h.quantity ?? h.Antal);
  const price = toNumber(h.price ?? h.Kurs);
  const buyPrice = toNumber(h.buyPrice ?? h.KøbsKurs);
  const currency = String(h.currency || "DKK").toUpperCase();

  const priceDKK = toDKK(price, currency, eurDkk);
  const buyDKK = toDKK(buyPrice, currency, eurDkk);

  const valueDKK = qty * priceDKK;
  const costDKK = qty * buyDKK;
  const profitDKK = valueDKK - costDKK;
  const profitPct = costDKK > 0 ? (profitDKK / costDKK) * 100 : 0;

  return {
    name: h.name || "Ukendt",
    currency,
    qty,
    price,
    buyPrice,
    priceDKK,
    buyDKK,
    valueDKK,
    costDKK,
    profitDKK,
    profitPct
  };
}

/* =========================================================
   AFSNIT 04 – DOM helpers
   ========================================================= */

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

function renderInfoBox(container, text) {
  const div = document.createElement("div");
  div.className = "info";
  div.textContent = text;
  container.appendChild(div);
}

function buildSkeleton(container) {
  // Her bygger vi kun den store tabel + totals (ingen “Overblik” tabel)
  container.innerHTML = `
    <div class="cards">
      <div class="card">
        <div class="card-title">Samlet porteføljeværdi:</div>
        <div class="card-value" id="totalValue">—</div>
      </div>
      <div class="card">
        <div class="card-title">Samlet gevinst/tab siden 10.09.2025:</div>
        <div class="card-value accent" id="totalProfit">—</div>
      </div>
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
   AFSNIT 05 – Render
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
      statusTextEl.textContent = "OK – data vist.";
    }
  }

  if (!list.length) {
    renderInfoBox(container, "Ingen data tilgængelig.");
    return;
  }

  const rows = list.map(h => computeRow(h, eurDkk));

  const totalVa
