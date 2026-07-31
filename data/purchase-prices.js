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
   AFSNIT 02 – Modtagne bruttoudbytter

   Kilde:
   - Nordea Invests udbytter for 2025, udbetalt 06.02.2026
   - Europe Enhanced: 5,20 DKK × 2.632 = 13.686,40 DKK
   - Global Enhanced: 3,70 DKK × 1.788 = 6.615,60 DKK
   - Empower Europe BQ er ikke udbyttebetalende
   ========================= */

export const DIVIDENDS_BY_NAME = Object.freeze({
  "Nordea Empower Europe Fund BQ": Object.freeze({
    grossTotalDKK: 0,
    paymentDate: null
  }),
  "Nordea Invest Europe Enhanced KL 1": Object.freeze({
    grossTotalDKK: 13686.40,
    paymentDate: "2026-02-06"
  }),
  "Nordea Invest Global Enhanced KL 1": Object.freeze({
    grossTotalDKK: 6615.60,
    paymentDate: "2026-02-06"
  })
});

/* =========================
   AFSNIT 03 – Helpers
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

export function getDividendByName(name) {
  const key = normName(name);
  const dividend = DIVIDENDS_BY_NAME[key];
  return dividend
    ? { grossTotalDKK: Number(dividend.grossTotalDKK) || 0, paymentDate: dividend.paymentDate || null }
    : { grossTotalDKK: 0, paymentDate: null };
}

export function getTotalInvestedDKK() {
  return Object.values(PURCHASE_TOTAL_DKK_BY_NAME)
    .map((n) => Number(n) || 0)
    .reduce((a, b) => a + b, 0);
}

export function getTotalGrossDividendsDKK() {
  return Object.values(DIVIDENDS_BY_NAME)
    .map((item) => Number(item.grossTotalDKK) || 0)
    .reduce((a, b) => a + b, 0);
}
