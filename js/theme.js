/*
AFSNIT 01 – Theme toggle (dark/light)
- Gemmer valg i localStorage
- Sætter html[data-theme]
*/

const THEME_KEY = "aktie_app_theme"; // "dark" | "light"

function getInitialTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark" || saved === "light") return saved;

  // Hvis brugeren ikke har valgt før: følg system
  const prefersLight =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches;

  return prefersLight ? "light" : "dark";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}

function setButtonState(btn, theme) {
  if (!btn) return;
  // Viser ikon + tooltip
  if (theme === "light") {
    btn.textContent = "☀️";
    btn.setAttribute("aria-label", "Skift til mørkt tema");
    btn.title = "Skift til dark";
  } else {
    btn.textContent = "🌙";
    btn.setAttribute("aria-label", "Skift til lyst tema");
    btn.title = "Skift til light";
  }
}

/*
AFSNIT 02 – Init
*/
export function initThemeToggle() {
  const btn = document.getElementById("themeToggle");
  const initial = getInitialTheme();
  applyTheme(initial);
  setButtonState(btn, initial);

  if (!btn) return;
  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "light" ? "dark" : "light";
    applyTheme(next);
    setButtonState(btn, next);
  });
}
