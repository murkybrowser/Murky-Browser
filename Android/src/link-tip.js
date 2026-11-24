(() => {
  const tip = document.getElementById("tip");
  const root = document.documentElement;

  function lum(hex) {
    const n = parseInt(String(hex || "").replace("#", "").slice(0, 6), 16);
    if (!Number.isFinite(n)) return 0;
    return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
  }

  function applyTheme(t) {
    if (!t) return;
    const surface = t.surface || t.background || "#10201D";
    root.style.setProperty("--surface", surface);
    root.style.setProperty("--accent", t.accent || "#E3A857");
    root.style.setProperty("--text", lum(surface) > 0.6 ? "#161616" : "#E4EDE9");
    if (t.font) root.style.setProperty("--font", t.font);
  }

  window.murkyLinkTip?.onShow(({ url, theme }) => {
    applyTheme(theme);
    tip.textContent = url || "";
    requestAnimationFrame(() => requestAnimationFrame(() => tip.classList.add("show")));
  });
  window.murkyLinkTip?.onHide(() => tip.classList.remove("show"));
})();
