// ===============================
// Graf toggle
// ===============================
const graphBtn = document.getElementById("graph");
const graphPanel = document.getElementById("graphPanel");
const graphClose = document.getElementById("graphClose");

if (graphBtn && graphPanel) {
  graphBtn.addEventListener("click", () => {
    const open = !graphPanel.hasAttribute("hidden");
    graphPanel.toggleAttribute("hidden", open);
    graphBtn.classList.toggle("active", !open);
  });
}

if (graphClose) {
  graphClose.addEventListener("click", () => {
    graphPanel.setAttribute("hidden", true);
    graphBtn.classList.remove("active");
  });
}
