/* =========================================================
   purchase-prices.js
   Formål:
   - Én sandhed for “købspris/indskud” pr. fond i DKK
   - Bruges til korrekt beregning af samlet gevinst/tab

   Kilde:
   - Afledt af bankens viste “nuværende værdi” og “ændring (%)”
   - Så tallene matcher bankens “værdiændring (ekskl. udbytte)”

   VIGTIGT:
   - Beløb er TOTALT investeret pr. fond (ikke pr. unit)
   ========================================================= */

/* =========================================================
   AFSNIT 01 – Købspris total (DKK) pr. ISIN
   ========================================================= */
export const PURCHASE_TOTAL_DKK_BY_ISIN = Object.freeze({
  // Nordea Empower Europe Fund BQ
  "LU3076185670": 302418,

  // Nordea Invest Europe Enhanced KL 1
  "DK0060949964": 350056,

  // Nordea Invest Global Enhanced KL 1
  "DK0060949881": 350090
});

/* =========================================================
   AFSNIT 02 – Helpers
   ========================================================= */
export function getPurchaseTotalDKK(isin) {
  const key = String(isin || "").trim();
  return Number(PURCHASE_TOTAL_DKK_BY_ISIN[key] ?? 0) || 0;
}

export function getTotalInvestedDKK() {
  return Object.values(PURCHASE_TOTAL_DKK_BY_ISIN)
    .map((n) => Number(n) || 0)
    .reduce((a, b) => a + b, 0);
}
