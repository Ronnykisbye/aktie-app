# Aktie-App – File Oversigt (hvor alt ligger)

## 1) index.html
- Indlæser CSS i rækkefølge:
  1) css/colors.css (tema-variabler)
  2) css/components.css (UI-komponenter: knapper, cards, tabel, graf)
  3) css/style.css (basis layout + små lokale overrides)
- Indeholder UI: header, knapper, statuslinje, cards, tabel, graf-panel.

## 2) css/colors.css
- Kun CSS-variabler (dark + light).
- Styrer baggrund/tekst/kort/border farver via CSS variables.

## 3) css/components.css
- UI-komponenter:
  - Knapper (primær + ghost)
  - Blink-animation (.flash)
  - Cards (samlet porteføljeværdi + gevinst/tab)
  - Tabel styling (thead/tbody)
  - Graf-panel + dropdown styling

## 4) css/style.css
- Basis layout:
  - body/app/header så alt står stabilt
- Må IKKE overstyre knapfarver (de styres i components.css)

## 5) js/main.js
- Orkestrering:
  - klik “Opdater” → henter data → beregner → render via ui.js
  - opdaterer “senest tjekket” (browser-tid)
  - sætter statuslinje tekst

## 6) js/api.js
- Data-lag:
  - loader prices.json
  - loader holdings (csv)
  - evt. EUR/DKK
  - mapper ISIN → fond

## 7) js/ui.js
- UI render:
  - totals/cards
  - tabel rækker
  - graf-panel + chart tegning
  - visuel feedback (blink) når UI er genberegnet

## 8) service-worker.js
- PWA caching
- Skal være network-first for data/prices.json (for at Opdater kan få friske data)

## 9) data/prices.json
- Seneste priser + updatedAt + evt history
- Bruges til tabel + graf
