(() => {
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const shell = $("shell");
  let ctx = null;

  const L = {};
  let localOn = false;
  const KEYS = ["Cookies and Data", "Site settings", "Permissions and storage", "Clear cookies", "You may be signed out of this site",
    "Connection is Secure", "Connection is Not Secure", "Your connection to this site is encrypted", "Information you send could be seen by others",
    "{n} cookie saved", "{n} cookies saved", "Close", "Back"];
  const t = (k) => (Object.prototype.hasOwnProperty.call(L, k) ? L[k] : k);
  const tf = (k, v) => t(k).replace(/\{(\w+)\}/g, (_m, n) => (v && n in v ? v[n] : ""));
  const mark = (el) => { if (localOn) el.setAttribute("data-murky-no-translate", ""); else el.removeAttribute("data-murky-no-translate"); };
  async function loadLocal() {
    try {
      const out = await window.murkySiteInfo.localizeText(KEYS);
      for (const k of Object.keys(L)) delete L[k];
      KEYS.forEach((k, i) => { if (Array.isArray(out) && out[i] != null && out[i] !== k) L[k] = String(out[i]); });
    } catch {}
    localOn = Object.keys(L).length > 0;
  }
  function applyStatic() {
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); mark(el); });
    document.querySelectorAll("[data-i18n-attr]").forEach((el) => { const v = t(el.dataset.i18nAttr); el.setAttribute("title", v); el.setAttribute("aria-label", v); });
  }

  function theme(s) {
    if (!s) return;
    root.style.setProperty("--bg", s.background || "#0A1412");
    root.style.setProperty("--surface", s.surface || "#10201D");
    root.style.setProperty("--surface2", s.surface2 || s.surface || "#172B27");
    root.style.setProperty("--border", s.border || "rgba(255,255,255,.11)");
    const n = parseInt(String(s.background || "#0A1412").replace("#", ""), 16);
    const whiteness = (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 765;
    const light = whiteness > 0.75;
    root.style.setProperty("--text", light ? "#000000" : "#FFFFFF");
    root.style.setProperty("--dim", light ? "#555555" : "#A8A8A8");
    root.style.setProperty("--warn", light ? "#9A6B00" : "#F2C14E");
    root.style.setProperty("--accent", s.accent || "#E3A857");
    const f = s.fontFamily === "mono" ? "Cascadia Mono,Consolas,monospace" : s.fontFamily === "serif" ? "Georgia,serif" : s.fontFamily === "rounded" ? "Arial Rounded MT Bold,Segoe UI,sans-serif" : "Segoe UI,system-ui,sans-serif";
    root.style.setProperty("--ui", f);
    document.body.style.fontSize = `${13.5 * (Number(s.uiFontScale) || 1)}px`;
  }

  function animate(mode) {
    document.body.classList.remove("open", "close");
    void document.body.offsetWidth;
    document.body.classList.add(mode === "close" ? "close" : "open");
  }

  function fit() {
    requestAnimationFrame(() => window.murkySiteInfo.resize(Math.ceil(shell.getBoundingClientRect().height) + 2));
  }

  function showView(name) {
    $("viewMain").hidden = name !== "main";
    $("viewCookies").hidden = name !== "cookies";
    fit();
  }

  const saved = (n) => tf(n === 1 ? "{n} cookie saved" : "{n} cookies saved", { n });

  function render() {
    if (!ctx) return;
    $("domain").textContent = ctx.apex;
    $("connText").textContent = t(ctx.secure ? "Connection is Secure" : "Connection is Not Secure");
    $("connText").classList.toggle("warn", !ctx.secure);
    $("connMeta").textContent = t(ctx.secure ? "Your connection to this site is encrypted" : "Information you send could be seen by others");
    $("cookiesMeta").textContent = saved(ctx.cookieCount);
    $("cookieCountText").textContent = saved(ctx.cookieCount);
    ["connText", "connMeta", "cookiesMeta", "cookieCountText"].forEach((id) => mark($(id)));
    $("cookieDomain").textContent = ctx.apex;
    $("clearBtn").classList.toggle("disabled", ctx.cookieCount === 0);
    fit();
  }

  async function load() {
    try { ctx = await window.murkySiteInfo.getContext(); } catch { ctx = null; }
    await loadLocal();
    applyStatic();
    showView("main");
    render();
  }

  const onActivate = (el, fn) => {
    el.addEventListener("click", fn);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
  };
  onActivate($("cookiesBtn"), () => showView("cookies"));
  onActivate($("settingsBtn"), () => window.murkySiteInfo.openSiteSettings());
  $("backBtn").addEventListener("click", () => showView("main"));
  $("closeBtn").addEventListener("click", () => window.murkySiteInfo.close());
  $("closeBtn2").addEventListener("click", () => window.murkySiteInfo.close());
  onActivate($("clearBtn"), async () => {
    if ($("clearBtn").classList.contains("disabled")) return;
    try {
      const res = await window.murkySiteInfo.clearCookies();
      if (ctx) ctx.cookieCount = res?.cookieCount ?? 0;
    } catch {}
    render();
  });

  window.murkySiteInfo.onTheme((st) => { theme(st); loadLocal().then(() => { applyStatic(); render(); }).catch(() => {}); });
  window.murkySiteInfo.onAnimate(animate);
  window.murkySiteInfo.onShow(({ settings } = {}) => { theme(settings); animate("open"); load(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") window.murkySiteInfo.close(); });
})();
