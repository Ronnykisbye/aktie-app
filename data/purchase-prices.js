/* =========================================================
   data/purchase-prices.js

   Formål:
   - Én sandhed for “købspris/indskud” pr. fond i DKK
   - Bruges til korrekt beregning af samlet gevinst/tab

   VIGTIGT:
   - Beløb er TOTALT investeret pr. fond (ikke pr. stk)
   - CSV’en har ikke ISIN, derfor mapper vi på NAVN
   ========================================================= */

/* =========================
   AFSNIT 01 – Købspris TOTAL (DKK) pr. NAVN
   ========================= */

export const PURCHASE_TOTAL_DKK_BY_NAME = Object.freeze({
  // Navne skal matche dem, der står i fonde.csv (Navn-kolonnen)
  "Nordea Empower Europe Fund BQ": 302418,
  "Nordea Invest Europe Enhanced KL 1": 350056,
  "Nordea Invest Global Enhanced KL 1": 350090
});

/* =========================
   AFSNIT 02 – Helpers
   ========================= */

function normName(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getPurchaseTotalDKKByName(name) {
  const key = normName(name);
  return Number(PURCHASE_TOTAL_DKK_BY_NAME[key] ?? 0) || 0;
}

export function getTotalInvestedDKK() {
  return Object.values(PURCHASE_TOTAL_DKK_BY_NAME)
    .map((n) => Number(n) || 0)
    .reduce((a, b) => a + b, 0);
}
