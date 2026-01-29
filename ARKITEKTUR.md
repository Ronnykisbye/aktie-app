# AKTIE-APP – Arkitektur & hvor alt ligger

Build: 2026-01-29

## 1) Overblik
Appen er en statisk GitHub Pages app (PWA), hvor:
- `index.html` er “skallen” (UI placeholders + loader CSS/JS)
- CSS er delt i 3 filer (tema → komponenter → lokale tweaks)
- JS henter data, beregner og renderer tabel/totals/graf

---

## 2) HTML (UI-struktur)
**Fil: `index.html`**
Indeholder:
- Header + titel
- Knapper: Opdater / PDF / Graf
- Statuslinje: statusText + lastUpdated
- Graf-panel: graphPanel + canvas + dropdown
- Table placeholder: `#table`

VIGTIGT:
- CSS skal loades i rækkefølge:
  1) `css/colors.css`
  2) `css/components.css`
  3) `css/style.css`

---

## 3) CSS (Design, tema, knapper, layout)
### 3.1 Tema og farver
**Fil: `css/colors.css`**
Her ligger:
- CSS-variabler for mørk mode (`:root`)
- CSS-variabler for lys mode (`html[data-theme="light"]`)
Eksempler:
- `--bg`, `--card`, `--txt`, `--muted`
- `--brand`, `--green`, `--red`
- `--thead1`, `--thead2`

➡️ Hvis farver i dark/light er “forkerte”, er det ofte her.

### 3.2 Komponenter (knapper, layout, graf, totals)
**Fil: `css/components.css`**
Her ligger:
- Knapper (primær + ghost)
- Actions-layout (knappernes række)
- Graf-panel + dropdown styling
- Totals-kort styling
- Tabel generelle styles (hvis brugt)
- Flash/blick-animation (.flash)

➡️ Hvis knapperne ser grå/blege ud, er det her vi retter.

### 3.3 Lokale tweaks (stats + tabeljusteringer)
**Fil: `css/style.css`**
Her ligger:
- Stats/totals-specifikke justeringer (hvis du bruger `.stats`, `.stat-btn`)
- Tabel wrapper tweaks (padding, max-width)
- Små “fine-tuning” ændringer, der ikke hører til i components

➡️ Denne fil må IKKE ændre knapfarver (det ligger i components).

---

## 4) JavaScript (logik)
### 4.1 Orkestrering
**Fil: `js/main.js`**
Ansvar:
- Håndtere “Opdater” klik
- Hente data (prices + holdings)
- Beregne udvikling DKK og %
- Kalde UI rendering

### 4.2 Data-loading / API
**Fil: `js/api.js`**
Ansvar:
- Hente `data/prices.json`
- Hente holdings CSV
- Merge og mapping (isin → fond)
- Evt. valuta (EUR/DKK) hvis nødvendigt

### 4.3 UI rendering
**Fil: `js/ui.js`**
Ansvar:
- Statuslinje tekst
- Totals: “Samlet porteføljeværdi” + “Samlet gevinst/tab”
- Tabel rendering
- Graf rendering (canvas)

---

## 5) Data
**Fil: `data/prices.json`**
Indeholder:
- updatedAt
- items med name/isin/currency/price/updatedAt
- (muligt) history til graf

**Fil: holdings CSV (navn kan variere)**
Indeholder:
- ISIN + antal + evt. startkurs
Bruges til at beregne totalværdi og gevinst/tab.

---

## 6) PWA / Cache
**Fil: `service-worker.js`**
Ansvar:
- Cache af app-filer til offline
- Skal behandles varsomt
Mål:
- `data/prices.json` skal helst være “network-first”
- Resten kan være “cache-first”

---

## 7) Når vi retter noget (standard)
Regel:
- Vi ændrer kun, når vi leverer HELE filer.
- Vi ændrer kun én ting ad gangen + tester.

Test efter ændring:
- Ctrl+Shift+R (hard reload)
- Normal reload + tryk “Opdater”
- Skift tema (dark/light)
