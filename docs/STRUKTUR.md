# Aktie-App – Struktur (hvor alt ligger)

Denne fil er lavet for at gøre det let at rette app’en i fremtidige chats.

---

## 1) HTML (indgang)
**Fil:** `index.html`

Indeholder:
- Knapper:
  - `#refresh` (Opdater)
  - `#pdf` (PDF) – har class `ghost`
  - `#graph` (Graf) – har class `ghost`
- Tema toggle:
  - `#themeToggle`
- Status:
  - `#statusText`
  - `#lastUpdated`
- UI container:
  - `#table`  ← ui.js renderer hele “pakken” her (kort + tabel + graf)

---

## 2) JavaScript – flow
### A) Orkestrering / App-start
**Fil:** `js/main.js`
Gør:
1) Henter EUR/DKK via `getEURDKK()` (api.js)
2) Henter holdings + priser via `getLatestHoldingsPrices()` (api.js)
3) Overskriver buyPrice pr. stk ud fra købssummer i `data/purchase-prices.js`
4) Kalder `renderPortfolio()` (ui.js)
5) Tricker “blink” (`.flash`) så bruger kan se opdatering

### B) Data-hentning / merge
**Fil:** `js/api.js`
Gør:
- Læser `fonde.csv` (holdings: navn, valuta, købskurs, antal)
- Læser `data/prices.json` (seneste kurs)
- Merges og returnerer et samlet objekt:
  - `updatedAt`, `source`, `items[]`

### C) UI rendering
**Fil:** `js/ui.js`
Eksporterer:
- `renderPortfolio({...})`
Som renderer:
- Top-kort (Samlet porteføljeværdi + Samlet gevinst/tab)
- Tabel
- Grafpanel

---

## 3) Datafiler
### Holdings (antal + købskurs)
**Fil:** `fonde.csv`
Kolonner:
- Navn
- Valuta
- Kurs
- KøbsKurs
- Antal

### Priser (aktuelle kurser + updatedAt)
**Fil:** `data/prices.json`

### Købssummer pr fond (TOTAL investeret)
**Fil:** `data/purchase-prices.js`
Bruges til korrekt samlet gevinst/tab.

---

## 4) CSS
### Farve-variabler
**Fil:** `css/colors.css`
Indeholder CSS variables for dark/light.

### Komponent-styling (knapper mm.)
**Fil:** `css/components.css`
Styrer knapper og “app-følelse”.

### Layout + overrides (inkl. ghost knapper + blink)
**Fil:** `css/style.css`

---

## 5) PWA / Service Worker
**Fil:** `service-worker.js`
Cacher app assets. Vigtigt ved “Opdater”/cache-problemer.

---

## 6) GitHub Actions (automatisk opdatering)
**Fil:** `.github/workflows/update-prices.yml`
Planlægger job (cron) + kører `scripts/fetch_prices.mjs`.
