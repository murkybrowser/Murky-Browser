(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const host = (new URLSearchParams(location.search).get("host") || "").trim().toLowerCase();
  const OPTIONS = [["block", "Never"], ["ask", "Always ask"], ["allow", "Always allow"]];
  let data = null;

  const L = {};
  let localOn = false;
  const STATIC_KEYS = ["Site settings", "Cache and cookies", "Loading…", "Clear", "Never", "Always ask", "Always allow", "Size unknown", "Clearing…",
    'Applies to this site and its subdomains. "Always ask" shows a prompt each time the site requests access.',
    "No site selected. Open Site settings from the address bar while on a website.",
    "{size}, {n} cookie", "{size}, {n} cookies", "{site} - Site settings"];
  const t = (k) => (Object.prototype.hasOwnProperty.call(L, k) ? L[k] : k);
  const tf = (k, v) => t(k).replace(/\{(\w+)\}/g, (_m, n) => (v && n in v ? v[n] : ""));
  async function loadLocal() {
    const keys = STATIC_KEYS.concat((data && data.permissionList || []).map((p) => p.label));
    try {
      const out = await window.murkyPage.localizeText(keys);
      for (const k of Object.keys(L)) delete L[k];
      keys.forEach((k, i) => { if (Array.isArray(out) && out[i] != null && out[i] !== k) L[k] = String(out[i]); });
    } catch {}
    localOn = Object.keys(L).length > 0;
  }
  function mark(el) { if (!el) return; if (localOn) el.setAttribute("data-murky-no-translate", ""); else el.removeAttribute("data-murky-no-translate"); }
  function applyStatic() {
    $$("[data-i18n]").forEach((el) => {
      if (el.id === "usage" && data) return;
      if (el.id === "title" && data) return;
      el.textContent = t(el.dataset.i18n);
      mark(el);
    });
  }

  function applyTheme(s) {
    if (!s) return;
    const r = document.documentElement;
    r.style.setProperty("--bg", s.background || "#0A1412");
    r.style.setProperty("--surface", s.surface || "#10201D");
    r.style.setProperty("--accent", s.accent || "#E3A857");
    const n = parseInt(String(s.background || "#0A1412").replace("#", ""), 16);
    const whiteness = (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 765;
    const light = whiteness > 0.75;
    r.style.setProperty("--text", light ? "#000000" : "#FFFFFF");
    r.style.setProperty("--text-dim", light ? "#555555" : "#A8A8A8");
  }

  const customSelects = new Map();
    function setupCustomSelect(select) {
      if (!select || customSelects.has(select.id)) return;
      const wrap = document.createElement("div");
      wrap.className = "murky-select-wrap";
      select.parentNode.insertBefore(wrap, select);
      wrap.appendChild(select);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "murky-select-btn";
      btn.setAttribute("aria-haspopup", "listbox");
      const menu = document.createElement("div");
      menu.className = "murky-select-menu";
      menu.hidden = true;
      menu.setAttribute("role", "listbox");
      wrap.appendChild(btn);
      wrap.appendChild(menu);

      const sync = () => {
        const opt = select.options[select.selectedIndex];
        btn.textContent = opt ? opt.textContent : "";
        menu.querySelectorAll(".murky-select-option").forEach((item) => item.classList.toggle("selected", item.dataset.value === select.value));
      };
      const close = () => { wrap.classList.remove("open"); menu.hidden = true; };
      const open = () => {
        document.querySelectorAll(".murky-select-wrap.open").forEach((other) => { if (other !== wrap) other.classList.remove("open"); });
        document.querySelectorAll(".murky-select-menu:not([hidden])").forEach((other) => { if (other !== menu) other.hidden = true; });
        sync(); wrap.classList.add("open"); menu.hidden = false;
      };
      Array.from(select.options).forEach((opt) => {
        const item = document.createElement("button");
        item.type = "button"; item.className = "murky-select-option"; item.dataset.value = opt.value;
        item.textContent = opt.textContent; item.setAttribute("role", "option");
        item.addEventListener("click", () => {
          if (select.value !== opt.value) {
            select.value = opt.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
          sync(); close(); btn.focus({ preventScroll: true });
        });
        menu.appendChild(item);
      });
      btn.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden ? open() : close(); });
      select.addEventListener("change", sync);
      customSelects.set(select.id, { sync, close });
      sync();
    }
    $("select") && $$('select').forEach(setupCustomSelect);
    document.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".murky-select-wrap")) customSelects.forEach(({ close }) => close());
    });
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".murky-select-wrap")) customSelects.forEach(({ close }) => close());
  });

  function fmtBytes(b) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
    return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function renderUsage() {
    const n = data.cookieCount;
    const size = typeof data.usageBytes === "number" ? fmtBytes(data.usageBytes) : t("Size unknown");
    $("#usage").textContent = tf(n === 1 ? "{size}, {n} cookie" : "{size}, {n} cookies", { size, n });
    mark($("#usage"));
    $("#clearBtn").disabled = false;
  }

  function renderPermissions() {
    const box = $("#perms");
    box.replaceChildren();
    for (const p of data.permissionList) {
      const row = document.createElement("div");
      row.className = "row";
      const label = document.createElement("label");
      label.textContent = t(p.label);
      mark(label);
      const select = document.createElement("select");
      select.id = `perm-${p.key}`;
      for (const [value, text] of OPTIONS) {
        const o = document.createElement("option");
        o.value = value; o.textContent = t(text);
        select.appendChild(o);
      }
      select.value = data.permissions[p.key] || "ask";
      row.append(label, select);
      box.appendChild(row);
      select.addEventListener("change", async () => {
        const updated = await window.murkyPage.setSitePermission(data.apex, p.key, select.value);
        if (updated) data.permissions = updated;
      });
      setupCustomSelect(select);
    }
    mark(box);
  }

  function render() {
    $("#title").textContent = data.apex;
    document.title = tf("{site} - Site settings", { site: data.apex });
    renderUsage();
    renderPermissions();
    $("#siteBody").hidden = false;
  }

  async function load() {
    if (!host) { await loadLocal(); applyStatic(); $("#empty").hidden = false; return; }
    data = await window.murkyPage.getSiteSettings(host);
    if (!data) { $("#empty").hidden = false; return; }
    await loadLocal();
    applyStatic();
    render();
  }

  $("#clearBtn").addEventListener("click", async () => {
    $("#clearBtn").disabled = true;
    $("#usage").textContent = t("Clearing…");
    const fresh = await window.murkyPage.clearSiteData(host);
    if (fresh) data = { ...data, cookieCount: fresh.cookieCount, usageBytes: fresh.usageBytes };
    renderUsage();
  });

  (async () => {
    try { applyTheme(await window.murkyPage.getSettings()); } catch {}
    window.murkyPage.onSettingsUpdate?.((st) => {
      applyTheme(st);
      loadLocal().then(() => { applyStatic(); if (data) { $("#perms").replaceChildren(); renderPermissions(); render(); } }).catch(() => {});
    });
    load();
  })();
})();
