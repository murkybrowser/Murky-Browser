const root = document.getElementById("root");

let current = null;
let panel = null;
let parts = null;
let shown = false;
let exitTimer = null;

function applyTheme(theme = {}) {
  const r = document.documentElement;
  r.style.setProperty("--bg", theme.background || "#0A1412");
  r.style.setProperty("--surface", theme.surface || "#10201D");
  r.style.setProperty("--surface-2", theme.surface || "#10201D");
  r.style.setProperty("--accent", theme.accent || "#E3A857");
  const bg = String(theme.background || "#0A1412").replace("#", "");
  const n = parseInt(bg, 16);
  const whiteness = (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 765;
  const light = whiteness > 0.75;
  r.style.setProperty("--text", light ? "#000000" : "#FFFFFF");
  r.style.setProperty("--text-dim", light ? "#555555" : "#A8A8A8");
  r.style.setProperty("--danger", theme.danger || "#E0654F");
  r.style.setProperty("--font", theme.font || '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif');
  r.style.setProperty("--scale", theme.uiScale || 1);
}

function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function wirePanel(el) {
  el.addEventListener("mouseenter", () => { if (current) window.murkyOverlay.hover(true, current.mode); });
  el.addEventListener("mouseleave", () => { if (current) window.murkyOverlay.hover(false, current.mode); });
}


function makePreviewPanel() {
  const el = document.createElement("div");
  el.className = "panel preview";
  el.innerHTML = `
    <div class="content">
      <div class="preview-image"></div>
      <div class="preview-info">
        <div class="preview-title"></div>
        <div class="preview-memory"><span class="dot"></span><span class="mem-text"></span></div>
      </div>
    </div>`;
  parts = {
    content: el.querySelector(".content"),
    image: el.querySelector(".preview-image"),
    title: el.querySelector(".preview-title"),
    memory: el.querySelector(".preview-memory"),
    memText: el.querySelector(".mem-text"),
  };
  parts.content.addEventListener("animationend", () => {
    parts.content.classList.remove("swap-r", "swap-l", "swap-f");
  });
  wirePanel(el);
  return el;
}

function makePlaceholder(p) {
  const wrap = document.createElement("div");
  wrap.className = "placeholder";
  const badge = document.createElement("div");
  badge.className = "badge";
  const letter = (String(p.title || "").trim()[0] || "•").toUpperCase();
  if (p.favicon && /^(https:|data:image\/)/i.test(p.favicon)) {
    const icon = new Image();
    icon.alt = "";
    icon.draggable = false;
    icon.onerror = () => { badge.textContent = letter; };
    icon.src = p.favicon;
    badge.appendChild(icon);
  } else {
    badge.textContent = letter;
  }
  const text = document.createElement("div");
  text.className = "ph-text";
  text.textContent = "Preview appears after you visit this tab";
  wrap.append(badge, text);
  return wrap;
}

function setImage(p) {
  const box = parts.image;
  box.replaceChildren();
  if (p.preview) {
    const img = new Image();
    img.alt = "";
    img.draggable = false;
    img.onerror = () => { if (box.contains(img)) box.replaceChildren(makePlaceholder(p)); };
    img.src = p.preview;
    box.appendChild(img);
  } else {
    box.appendChild(makePlaceholder(p));
  }
}

function setMemory(text) {
  const t = text || "Memory unavailable";
  parts.memText.textContent = t;
  parts.memory.classList.toggle("unavailable", /unavailable/i.test(t));
}

function renderPreview(p, prev) {
  const needsBuild = !panel || !panel.classList.contains("preview");
  if (needsBuild) {
    panel = makePreviewPanel();
    root.replaceChildren(panel);
  }

  const sameTab = !needsBuild && prev && prev.mode === "preview" && prev.id === p.id;
  const wasShown = shown && !needsBuild;

  parts.title.textContent = p.title || "New Tab";
  setMemory(p.memory);
  if (!sameTab || "preview" in p) setImage(p);

  panel.classList.remove("exiting");

  if (!wasShown) {
    replay(panel, "entering");
  } else if (!sameTab && p.animate) {
    const cls = p.slideDir > 0 ? "swap-r" : p.slideDir < 0 ? "swap-l" : "swap-f";
    parts.content.classList.remove("swap-r", "swap-l", "swap-f");
    replay(parts.content, cls);
  }
}


function renderContext(p) {
  const el = document.createElement("div");
  el.className = "panel context";
  const menu = document.createElement("div");
  menu.className = "menu";
  for (const item of (p.actions || [])) {
    const btn = document.createElement("button");
    btn.textContent = item.label;
    if (item.danger) btn.classList.add("danger");
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await window.murkyOverlay.action(p.id, item.action);
      await window.murkyOverlay.hide();
    });
    menu.appendChild(btn);
  }
  el.appendChild(menu);
  wirePanel(el);
  panel = el;
  parts = null;
  root.replaceChildren(el);
  replay(el, "entering");
}


function render(payload) {
  const prev = current;
  current = payload;
  applyTheme(payload.theme);
  clearTimeout(exitTimer);

  if (payload.mode === "context") renderContext(payload);
  else renderPreview(payload, prev);
  shown = true;
}

window.murkyOverlay.onAnimateOut?.(() => {
  if (!panel) return;
  panel.classList.remove("entering");
  panel.classList.add("exiting");
  clearTimeout(exitTimer);
  exitTimer = setTimeout(() => { shown = false; }, 100);
});

window.murkyOverlay.onUpdate(render);
