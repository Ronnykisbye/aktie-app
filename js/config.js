/*
AFSNIT 01 – Konfiguration
- Alt der er "indstillinger" samles her.
*/
export const PURCHASE_DATE_ISO = "2025-09-10";

/*
AFSNIT 02 – Data-kilder
- prices.json: genereres af GitHub Action (hyppige opdateringer)
- fonde.csv: fallback / manuelt overblik
*/
export const PRICES_JSON_PATH = "./data/prices.json";
export const CSV_PATH = "./fonde.csv";

/*
AFSNIT 03 – FX-kilde
*/
export const FX_URL = "https://api.frankfurter.app/latest?from=EUR&to=DKK";
export const FX_CACHE_KEY = "eurdkk_v2";
