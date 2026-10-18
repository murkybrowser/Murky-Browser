(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));


  function hideBrowserDialog() {
    activeBrowserDialog = null;
    browserDialog.hidden = true;
    browserDialogBackdrop.hidden = true;
    browserDialog.setAttribute("aria-hidden", "true");
    browserDialogBackdrop.setAttribute("aria-hidden", "true");
  }

  function showBrowserDialog(payload) {
    activeBrowserDialog = payload;
    const type = payload?.type || "alert";
    browserDialogTitle.textContent = type === "confirm" ? "Confirm" : type === "prompt" ? "Input required" : "Website message";
    browserDialogSite.textContent = payload?.title || "Website";
    browserDialogMessage.textContent = payload?.message || "";
    browserDialogInput.hidden = type !== "prompt";
    browserDialogInput.value = payload?.defaultPrompt || "";
    browserDialogActions.innerHTML = "";

    if (type !== "alert") {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => window.murky.respondBrowserDialog({ tabId: payload.tabId, accept: false, promptText: browserDialogInput.value }));
      browserDialogActions.appendChild(cancel);
    }
    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "primary";
    accept.textContent = type === "confirm" ? "OK" : "OK";
    accept.addEventListener("click", () => window.murky.respondBrowserDialog({ tabId: payload.tabId, accept: true, promptText: browserDialogInput.value }));
    browserDialogActions.appendChild(accept);

    browserDialog.hidden = false;
    browserDialogBackdrop.hidden = false;
    browserDialog.setAttribute("aria-hidden", "false");
    browserDialogBackdrop.setAttribute("aria-hidden", "false");
    if (type === "prompt") setTimeout(() => browserDialogInput.focus(), 0);
    else setTimeout(() => accept.focus(), 0);
  }

  window.murky?.onBrowserDialogShow?.(showBrowserDialog);
  window.murky?.onBrowserDialogHide?.(hideBrowserDialog);
  document.addEventListener("keydown", (e) => {
    if (!activeBrowserDialog) return;
    if (e.key === "Escape" && activeBrowserDialog.type !== "alert") {
      e.preventDefault();
      window.murky.respondBrowserDialog({ tabId: activeBrowserDialog.tabId, accept: false, promptText: browserDialogInput.value });
    } else if (e.key === "Enter" && activeBrowserDialog.type === "alert") {
      e.preventDefault();
      const button = browserDialogActions.querySelector("button.primary");
      button?.click();
    }
  }, true);

  const tabstrip = $("#tabstrip");
  const addressInput = $("#addressInput");
  const addressStatus = $("#addressStatus");
  const addressPill = $("#addressPill");
  const addressWrap = $(".address-wrap");
  const starBtn = $("#starBtn");
  const tabScrollControls = $("#tabScrollControls");
  const tabScrollLeft = $("#tabScrollLeft");
  const tabScrollRight = $("#tabScrollRight");
  const browserDialogBackdrop = $("#browserDialogBackdrop");
  const browserDialog = $("#browserDialog");
  const browserDialogTitle = $("#browserDialogTitle");
  const browserDialogSite = $("#browserDialogSite");
  const browserDialogMessage = $("#browserDialogMessage");
  const browserDialogInput = $("#browserDialogInput");
  const browserDialogActions = $("#browserDialogActions");
  let activeBrowserDialog = null;


  let tabsState = [];
  let activeTabId = null;
  let currentBookmarks = [];
  let currentUrl = "";
  let addressFocused = false;

  const INTERNAL_URLS = new Set(["murky://newtab", "murky://settings", "murky://privacy", "murky://terms", "murky://extensions"]);
  const isInternalUrl = (u) => INTERNAL_URLS.has(u || "") || String(u || "").startsWith("murky://");
  window.__murkySettings = window.__murkySettings || {};

  let tooltipLocalizationRun = 0;
  async function localizeTooltips(settings = window.__murkySettings || {}) {
    const target = String(settings.preferredLanguages?.[0] || "en").toLowerCase().split(/[-_]/)[0];
    const nodes = $$("[title]");
    const originals = [];
    for (const el of nodes) {
      if (!el.dataset.murkyTooltipSource) el.dataset.murkyTooltipSource = el.getAttribute("title") || "";
      const text = el.dataset.murkyTooltipSource;
      if (text) originals.push(text.replace(/\s*\((?:Ctrl|Command|CommandOrControl)[^)]*\)\s*$/i, ""));
    }
    const run = ++tooltipLocalizationRun;
    if (!originals.length || target === "en" || !window.murky?.translateText) {
      for (const el of nodes) { if (el.dataset.murkyTooltipSource) el.setAttribute("title", el.dataset.murkyTooltipSource); }
      return;
    }
    try {
      const unique = [...new Set(originals)];
      const values = await window.murky.translateText(unique);
      if (run !== tooltipLocalizationRun) return;
      const map = new Map(unique.map((k, i) => [k, values?.[i] || k]));
      for (const el of nodes) {
        const key = el.dataset.murkyTooltipSource;
        if (!key) continue;
        const base = key.replace(/\s*\((?:Ctrl|Command|CommandOrControl)[^)]*\)\s*$/i, "");
        const suffix = key.slice(base.length);
        el.setAttribute("title", (map.get(base) || base) + suffix);
      }
    } catch {}
  }

  const tooltipObserver = new MutationObserver((mutations) => {
    if (mutations.some(m => m.type === "attributes" && m.attributeName === "title" || m.addedNodes.length)) {
      clearTimeout(tooltipObserver._timer);
      tooltipObserver._timer = setTimeout(() => localizeTooltips(), 30);
    }
  });
  tooltipObserver.observe(document.documentElement, { subtree: true, childList: true });

  const THEME_PRESETS = {
    "murky-deep": { background: "#0A1412", surface: "#10201D", accent: "#E3A857" },
    "murky-tide": { background: "#081A1E", surface: "#0E323B", accent: "#6FCF97" },
    "murky-ink": { background: "#0B0B10", surface: "#1B1B24", accent: "#8E8CD8" },
    "midnight-amber": { background: "#120A05", surface: "#241207", accent: "#F2A65A" },
    "murky-storm": { background: "#0A0E14", surface: "#151E2A", accent: "#7EA8D8" },
    "murky-moss": { background: "#0B120A", surface: "#182417", accent: "#9BC46B" },
    "murky-rose": { background: "#150A0F", surface: "#2A121C", accent: "#E38FA6" },
    "murky-slate": { background: "#0E1012", surface: "#1C2024", accent: "#B7BEC7" },
  };

   
  let themeAnimationFrame = 0;

  function hexToRgb(hex) {
    const m = /^#?([\da-f]{6})$/i.exec(hex || "");
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex({ r, g, b }) {
    const h = (n) => Math.round(n).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  }

  let lastThemeApplyAt = 0;
  function animateThemeColors(from, to, duration = 280) {
    cancelAnimationFrame(themeAnimationFrame);
    const nowTs = performance.now();
    const rapid = nowTs - lastThemeApplyAt < 450;
    lastThemeApplyAt = nowTs;
    if (rapid) duration = 110;
    const root = document.documentElement;
    const start = { background: hexToRgb(from.background), surface: hexToRgb(from.surface), accent: hexToRgb(from.accent) };
    const end = { background: hexToRgb(to.background), surface: hexToRgb(to.surface), accent: hexToRgb(to.accent) };
    if (!start.background || !start.surface || !start.accent || !end.background || !end.surface || !end.accent) {
      root.style.setProperty("--bg", to.background);
      root.style.setProperty("--surface", to.surface);
      root.style.setProperty("--accent", to.accent);
      return;
    }
    const started = performance.now();
    const ease = rapid ? (t) => t : (t) => 1 - Math.pow(1 - t, 3);
    const frame = (now) => {
      const t = Math.min(1, (now - started) / duration);
      const e = ease(t);
      for (const key of ["background", "surface", "accent"]) {
        const a = start[key], b = end[key];
        root.style.setProperty(`--${key === "background" ? "bg" : key}`, rgbToHex({
          r: a.r + (b.r - a.r) * e,
          g: a.g + (b.g - a.g) * e,
          b: a.b + (b.b - a.b) * e,
        }));
      }
      if (t < 1) themeAnimationFrame = requestAnimationFrame(frame);
    };
    themeAnimationFrame = requestAnimationFrame(frame);
  }


  function updateHomePhotoBackdrop(settings = null) {
    const spacer = document.getElementById("contentSpacer");
    if (!spacer) return;
    spacer.style.backgroundImage = "";
    spacer.style.backgroundSize = "";
    spacer.style.backgroundPosition = "";
    spacer.style.backgroundRepeat = "";
  }

  function applyAdaptiveText(background) {
    const rgb = hexToRgb(background);
    if (!rgb) return;
    const whiteness = (rgb.r + rgb.g + rgb.b) / 765;
    const light = whiteness > 0.75;
    const root = document.documentElement;
    root.style.setProperty("--text", light ? "#000000" : "#FFFFFF");
    root.style.setProperty("--text-dim", light ? "#555555" : "#A8A8A8");
  }

  const murkyTextScaleBases = new WeakMap();
  let murkyTextScaleValue = 1;
  function applyMurkyTextScale(scale = 1, { rebase = false } = {}) {
    murkyTextScaleValue = Number(scale) || 1;
    const nodes = document.querySelectorAll("body * , body");
    for (const el of nodes) {
      if (!(el instanceof Element)) continue;
      if (el.matches?.("#addressInput, #starBtn")) {
        if (rebase) el.style.fontSize = "";
        continue;
      }
      if (rebase) el.style.fontSize = "";
      let base = murkyTextScaleBases.get(el);
      const computed = parseFloat(getComputedStyle(el).fontSize);
      if (rebase || !Number.isFinite(base)) {
        base = Number.isFinite(computed) ? computed / murkyTextScaleValue : null;
        if (base != null) murkyTextScaleBases.set(el, base);
      }
      if (base != null && Number.isFinite(base)) el.style.fontSize = `${base * murkyTextScaleValue}px`;
    }
  }
  const murkyTextScaleObserver = new MutationObserver((mutations) => {
    if (!mutations.some(m => m.addedNodes.length)) return;
    applyMurkyTextScale(murkyTextScaleValue);
  });
  murkyTextScaleObserver.observe(document.body, { childList: true, subtree: true });

  function applySettings(settings) {
    window.__murkySettings = settings;
    const root = document.documentElement;
    applyAdaptiveText(settings.background);
    const previous = {
      background: root.style.getPropertyValue("--bg") || settings.background,
      surface: root.style.getPropertyValue("--surface") || settings.surface,
      accent: root.style.getPropertyValue("--accent") || settings.accent,
    };
    animateThemeColors(previous, settings);
    root.style.setProperty("--ui-scale", settings.uiFontScale || 1);
    if ((Number(settings.uiFontScale) || 1) !== murkyTextScaleValue) applyMurkyTextScale(settings.uiFontScale || 1);
    const previousToolbarScale = Number(root.style.getPropertyValue("--toolbar-scale")) || 1;
    const nextToolbarScale = Number(settings.toolbarScale) || 1;
    applyToolbarScale(nextToolbarScale);
    if (Math.abs(previousToolbarScale - nextToolbarScale) > 0.0001) {
      applyMurkyTextScale(murkyTextScaleValue, { rebase: true });
    }
    const selectedFont = settings.fontFamily === "rounded" ? "system" : (settings.fontFamily || "system");
    const uiFont = selectedFont === "system"
      ? '"MurkySans", "Segoe UI", system-ui, -apple-system, sans-serif'
      : selectedFont === "serif"
        ? '"Iowan Old Style", "Georgia", serif'
        : selectedFont === "mono"
          ? '"Cascadia Mono", "Consolas", ui-monospace, monospace'
          : `"${String(selectedFont).replace(/\"/g, "")}", "MurkySans", "Segoe UI", system-ui, sans-serif`;
    root.style.setProperty("--ui-font", uiFont);
    document.body.classList.remove("font-serif", "font-mono");
    root.style.setProperty("--glass-blur", "18px");
    root.style.setProperty("--glass-alpha", "0.72");
document.body.classList.toggle("sidebar-hidden", !settings.showSidebar);
    document.body.classList.toggle("sidebar-right", settings.sidebarSide === "right");
    updateHomePhotoBackdrop(settings);
    localizeTooltips(settings);

    if (!settings.showSidebar && openFlyoutPanel !== "downloads") closeFlyout();
    document.body.classList.toggle("downloads-flyout-open", openFlyoutPanel === "downloads");
  }

  window.__murkyApplyToolbarScale = applyToolbarScale;

  function applyToolbarScale(scale) {
    const value = Math.max(0.8, Math.min(1.2, Number(scale) || 1));
    document.documentElement.style.setProperty("--toolbar-scale", String(value));
    document.documentElement.style.setProperty("--toolbar-h", `${44 * value}px`);
    const toolbar = document.getElementById("toolbar");
    if (toolbar) { toolbar.style.height = `${44 * value}px`; toolbar.style.minHeight = `${44 * value}px`; }
  }

  async function updateSettings(partial) {
    const settings = await window.murky.setSettings(partial);
    applySettings(settings);
  }

   
  const tabEls = new Map();
  let tabHoverTimer = null;
  let tabHoverPrimed = false;
  let tabHoverId = null;
  let tabPreviewRequest = 0;
  let overlayHovered = false;
  let overlayMode = null;
  let overlayHideTimer = null;
  let isDraggingTab = false;
  let draggedTabId = null;
  let draggedTabEl = null;
  let dragPlaceholder = null;
  let dragStartX = 0;
  let dragPointerX = 0;
  let dragOriginLeft = 0;
  let dragWidth = 0;
  let suppressNextTabClick = false;

  function faviconEl(tab) {
    const el = document.createElement("div");
    el.className = "tab-favicon";
    const img = document.createElement("img");
    const isInternal = isInternalUrl(tab?.url);
    img.src = isInternal
      ? new URL("../assets/logo_amber.png", window.location.href).href
      : (tab?.favicon || new URL("../assets/logo_amber.png", window.location.href).href);
    img.alt = isInternal ? "Murky" : "";
    img.onerror = () => {
      if (!isInternal) {
        img.src = new URL("../assets/logo_amber.png", window.location.href).href;
      } else {
        img.style.visibility = "hidden";
      }
    };
    el.appendChild(img);
    return el;
  }

  function formatMemory(bytes) {
    if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "Memory unavailable";
    const mb = bytes / 1024 / 1024;
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB memory`;
    return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB memory`;
  }

  const TAB_PREVIEW_DELAY_MS = 1000;
  const TAB_PREVIEW_DETAILS_TIMEOUT = 1500;
  const TAB_PREVIEW_MEMORY_REFRESH = 2000;
  let tabPreviewMemoryTimer = null;
  let lastOverlayPayload = null;

  function stopPreviewMemoryRefresh() {
    clearInterval(tabPreviewMemoryTimer);
    tabPreviewMemoryTimer = null;
  }

  function startPreviewMemoryRefresh(id) {
    stopPreviewMemoryRefresh();
    tabPreviewMemoryTimer = setInterval(async () => {
      if (overlayMode !== "preview" || tabHoverId !== id || !lastOverlayPayload) { stopPreviewMemoryRefresh(); return; }
      let details = null;
      try { details = await window.murky.getTabDetails(id, { light: true }); } catch {}
      if (!details || overlayMode !== "preview" || tabHoverId !== id) return;
      const next = { ...lastOverlayPayload, title: details.title || lastOverlayPayload.title, memory: formatMemory(details.memoryBytes) };
      delete next.preview;
      lastOverlayPayload = { ...next, preview: lastOverlayPayload.preview };
      window.murky.showTabOverlay(next);
    }, TAB_PREVIEW_MEMORY_REFRESH);
  }

  function resetTabPreviewState() {
    clearTimeout(tabHoverTimer);
    clearTimeout(overlayHideTimer);
    stopPreviewMemoryRefresh();
    tabHoverTimer = null;
    overlayHideTimer = null;
    tabHoverId = null;
    tabHoverPrimed = false;
    overlayHovered = false;
    overlayMode = null;
    lastOverlayPayload = null;
    tabPreviewRequest++;
  }

  function schedulePreviewHide(delay = 220) {
    clearTimeout(overlayHideTimer);
    overlayHideTimer = setTimeout(() => {
      const hoveredTab = tabHoverId && tabEls.get(tabHoverId)?.matches(":hover");
      if (overlayHovered || hoveredTab) return;
      resetTabPreviewState();
      window.murky.hideTabOverlay();
    }, delay);
  }

  function hideTabPreview() {
    resetTabPreviewState();
    window.murky.hideTabOverlay();
  }

  async function showTabPreview(id) {
    const tab = tabsState.find((t) => t.id === id);
    const el = tabEls.get(id);
    if (!tab || !el || isDraggingTab) return;

    tabHoverId = id;
    const request = ++tabPreviewRequest;

    let details = null;
    try {
      details = await Promise.race([
        window.murky.getTabDetails(id),
        new Promise((resolve) => setTimeout(() => resolve(null), TAB_PREVIEW_DETAILS_TIMEOUT)),
      ]);
    } catch {}

    if (request !== tabPreviewRequest || tabHoverId !== id) return;
    if (!el.isConnected || (!el.matches(":hover") && !overlayHovered)) return;

    const rect = el.getBoundingClientRect();
    const payload = {
      mode: "preview",
      id,
      x: Math.max(8, Math.min(window.innerWidth - 300, rect.left)),
      y: Math.min(window.innerHeight - 227, rect.bottom + 7),
      title: details?.title || tab.title || "New Tab",
      memory: formatMemory(details?.memoryBytes),
      favicon: details?.favicon || tab.favicon || null,
      preview: details?.preview || null,
    };
    overlayMode = "preview";
    lastOverlayPayload = payload;
    window.murky.showTabOverlay(payload);
    startPreviewMemoryRefresh(id);
  }

  function scheduleTabPreview(id) {
    clearTimeout(tabHoverTimer);
    clearTimeout(overlayHideTimer);
    tabHoverId = id;
    if (overlayMode === "context") return;
    if (tabHoverPrimed) {
      showTabPreview(id);
      return;
    }
    tabHoverTimer = setTimeout(() => {
      if (!tabEls.get(id)?.matches(":hover")) return;
      tabHoverPrimed = true;
      showTabPreview(id);
    }, TAB_PREVIEW_DELAY_MS);
  }

  let tabDensityFrame = 0;

  function setTabScrollButtonState() {
    if (!tabScrollControls || tabScrollControls.hidden) return;
    const maxScroll = Math.max(0, tabstrip.scrollWidth - tabstrip.clientWidth);
    const atStart = tabstrip.scrollLeft <= 1;
    const atEnd = tabstrip.scrollLeft >= maxScroll - 1;
    tabScrollLeft.disabled = atStart;
    tabScrollRight.disabled = atEnd;
  }

  function updateTabDensity() {
    cancelAnimationFrame(tabDensityFrame);
    tabDensityFrame = requestAnimationFrame(() => {
      const tabs = $$(".tab:not(.dragging)");
      const count = tabs.length;
      if (!count) {
        tabstrip.classList.remove("tabs-compact", "tabs-minimum");
        tabstrip.style.removeProperty("--tab-compact-w");
        if (tabScrollControls) tabScrollControls.hidden = true;
        return;
      }

      const gap = 4;
      const minTabWidth = 44;
      const fullTabWidth = 176;
      const gapsWidth = Math.max(0, count - 1) * gap;
      const availableWithoutArrows = Math.max(0, tabstrip.getBoundingClientRect().width);
      const fullTotal = count * fullTabWidth + gapsWidth;
      const minTotal = count * minTabWidth + gapsWidth;

      if (fullTotal <= availableWithoutArrows) {
        tabstrip.classList.remove("tabs-compact", "tabs-minimum");
        tabstrip.style.removeProperty("--tab-compact-w");
        tabstrip.style.overflowX = "auto";
        if (tabScrollControls) tabScrollControls.hidden = true;
        tabstrip.scrollLeft = 0;
        return;
      }

       
       
      if (minTotal <= availableWithoutArrows) {
        const width = Math.max(minTabWidth, Math.floor((availableWithoutArrows - gapsWidth) / count));
        tabstrip.classList.add("tabs-compact");
        tabstrip.classList.toggle("tabs-minimum", width <= minTabWidth);
        tabstrip.style.setProperty("--tab-compact-w", `${width}px`);
        tabstrip.style.overflowX = "hidden";
        if (tabScrollControls) tabScrollControls.hidden = true;
        tabstrip.scrollLeft = 0;
        return;
      }

       
       
      tabstrip.classList.add("tabs-compact", "tabs-minimum");
      tabstrip.style.setProperty("--tab-compact-w", `${minTabWidth}px`);
      tabstrip.style.overflowX = "auto";
      if (tabScrollControls) tabScrollControls.hidden = false;

       
       
      requestAnimationFrame(() => { setTabScrollButtonState(); });
    });
  }

  function scrollTabsBy(direction) {
    const amount = Math.max(96, Math.floor(tabstrip.clientWidth * 0.72));
    const target = tabstrip.scrollLeft + direction * amount;
    tabstrip.scrollTo({ left: target, behavior: "smooth" });
    setTimeout(setTabScrollButtonState, 180);
    setTimeout(setTabScrollButtonState, 360);
  }

  tabScrollLeft?.addEventListener("click", (e) => {
    e.stopPropagation();
    scrollTabsBy(-1);
  });
  tabScrollRight?.addEventListener("click", (e) => {
    e.stopPropagation();
    scrollTabsBy(1);
  });
  tabstrip?.addEventListener("scroll", setTabScrollButtonState, { passive: true });

  const tabDensityResizeObserver = new ResizeObserver(updateTabDensity);
  tabDensityResizeObserver.observe(tabstrip);

  function animateTabShift(node, dx) {
    if (!node || Math.abs(dx) < 0.5) return;
    node.style.transition = "transform 150ms cubic-bezier(.2,.8,.2,1)";
    node.style.transform = `translateX(${dx}px)`;
    requestAnimationFrame(() => {
      node.style.transform = "";
      setTimeout(() => { if (node.isConnected) node.style.transition = ""; }, 165);
    });
  }

   
   
   
  function animateDomMove(move) {
    const nodes = $$(".tab:not(.dragging)");
    const first = new Map(nodes.map((node) => [node, node.getBoundingClientRect()]));
    move();
    nodes.forEach((node) => {
      const before = first.get(node);
      if (!before || !node.isConnected) return;
      const after = node.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      node.style.transition = "none";
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        if (!node.isConnected) return;
        node.style.transition = "transform 180ms cubic-bezier(.2,.8,.2,1)";
        node.style.transform = "";
        setTimeout(() => {
          if (node.isConnected) node.style.transition = "";
        }, 195);
      });
    });
  }

  function movePlaceholderTo(target, before) {
    if (!dragPlaceholder || !target) return;
    const current = before ? target.previousElementSibling : target.nextElementSibling;
    if (current === dragPlaceholder) return;

    const affected = $$(".tab:not(.dragging):not(.pinned)");
    const first = new Map(affected.map((node) => [node, node.getBoundingClientRect().left]));
    if (before) tabstrip.insertBefore(dragPlaceholder, target);
    else tabstrip.insertBefore(dragPlaceholder, target.nextSibling);

    affected.forEach((node) => {
      const oldLeft = first.get(node);
      if (oldLeft == null) return;
      const newLeft = node.getBoundingClientRect().left;
      const dx = oldLeft - newLeft;
      if (Math.abs(dx) < 0.5) return;
      node.style.transition = "none";
      node.style.transform = `translateX(${dx}px)`;
      void node.offsetWidth;
      requestAnimationFrame(() => {
        if (!node.isConnected) return;
        node.style.transition = "transform 180ms cubic-bezier(.2,.8,.2,1)";
        node.style.transform = "";
        setTimeout(() => { if (node.isConnected) node.style.transition = ""; }, 195);
      });
    });
  }

  function buildTabEl(tab) {
    const el = document.createElement("div");
    el.className = "tab";
    el.dataset.id = tab.id;
    el.draggable = false;

    const iconWrap = document.createElement("div");
    iconWrap.className = "tab-icon-wrap";
    el.appendChild(iconWrap);

    const title = document.createElement("div");
    title.className = "tab-title";
    el.appendChild(title);

    const status = document.createElement("div");
    status.className = "tab-status-icons";

    const mute = document.createElement("div");
    mute.className = "tab-mute-indicator";
    mute.hidden = true;
    mute.innerHTML = `${lucide.svg("volume-x", { "aria-hidden": "true" })}`;
    status.appendChild(mute);

    const pin = document.createElement("div");
    pin.className = "tab-pin-indicator";
    pin.innerHTML = `${lucide.svg("pin", { "aria-hidden": "true" })}`;
    pin.hidden = true;
    status.appendChild(pin);
    el.appendChild(status);

    const close = document.createElement("div");
    close.className = "tab-close";
    close.innerHTML = `${lucide.svg("x")}`;
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      suppressNextTabClick = true;
      hideTabPreview();
      closeTabAnimated(tab.id);
    });
    el.appendChild(close);

    el.addEventListener("click", () => {
      if (suppressNextTabClick) { suppressNextTabClick = false; return; }
      if (isDraggingTab) return;
      hideTabPreview();
      window.murky.activateTab(tab.id);
    });

    el.addEventListener("mouseenter", () => {
      if (!isDraggingTab) scheduleTabPreview(tab.id);
    });
    el.addEventListener("mouseleave", () => {
      clearTimeout(tabHoverTimer);
      schedulePreviewHide(260);
    });

    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.returnValue = false;
      if (isDraggingTab) return;
      showTabContextMenu(tab.id, e.clientX, e.clientY);
    });

    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || tab.isPinned || e.target.closest(".tab-close")) return;
      e.preventDefault();
      dragStartX = e.clientX;
      dragPointerX = e.clientX;
      draggedTabId = tab.id;
      draggedTabEl = el;
      const rect = el.getBoundingClientRect();
      dragOriginLeft = rect.left;
      dragWidth = rect.width;
      document.body.classList.add("tab-dragging-active");
    });

    el.classList.add("tab-collapsed");
    return el;
  }

  function startTabDrag() {
    const tab = tabsState.find((t) => t.id === draggedTabId);
    if (!tab || tab.isPinned || !draggedTabEl) return;
    isDraggingTab = true;
    suppressNextTabClick = true;
    hideTabPreview();
    const rect = draggedTabEl.getBoundingClientRect();
    dragOriginLeft = rect.left;
    dragWidth = rect.width;

    dragPlaceholder = document.createElement("div");
    dragPlaceholder.className = "tab-drag-placeholder";
    dragPlaceholder.style.width = `${dragWidth}px`;
    dragPlaceholder.style.height = `${rect.height}px`;
    dragPlaceholder.dataset.id = draggedTabId;

    tabstrip.insertBefore(dragPlaceholder, draggedTabEl);
    draggedTabEl.style.position = "fixed";
    draggedTabEl.style.left = `${rect.left}px`;
    draggedTabEl.style.top = `${rect.top}px`;
    draggedTabEl.style.width = `${dragWidth}px`;
    draggedTabEl.style.zIndex = "1000";
    draggedTabEl.style.pointerEvents = "none";
    draggedTabEl.classList.add("dragging");
    updateTabDrag(dragPointerX);
  }

  function updateTabDrag(clientX) {
    if (!isDraggingTab || !draggedTabEl || !dragPlaceholder) return;
    const stripRect = tabstrip.getBoundingClientRect();
    const pinnedNodes = $$(".tab.pinned");
    const pinnedEnd = pinnedNodes.length
      ? pinnedNodes[pinnedNodes.length - 1].getBoundingClientRect().right
      : stripRect.left;
    const minLeft = Math.max(stripRect.left, pinnedEnd + 4);
    const maxLeft = Math.max(minLeft, stripRect.right - dragWidth - 4);
    const left = Math.max(minLeft, Math.min(clientX - dragWidth / 2, maxLeft));
    draggedTabEl.style.left = `${left}px`;

    const candidates = $$(".tab:not(.pinned):not(.dragging)");
    if (!candidates.length) return;
    let target = candidates[candidates.length - 1];
    let before = false;
    for (const node of candidates) {
      const r = node.getBoundingClientRect();
      const mid = r.left + r.width / 2;
      if (clientX < mid) {
        target = node;
        before = true;
        break;
      }
    }
    movePlaceholderTo(target, before);
  }

  async function finishTabDrag() {
    if (!isDraggingTab) return;
    const el = draggedTabEl;
    if (dragPlaceholder?.parentNode) dragPlaceholder.replaceWith(el);
    el.style.position = "";
    el.style.left = "";
    el.style.top = "";
    el.style.width = "";
    el.style.zIndex = "";
    el.style.pointerEvents = "";
    el.classList.remove("dragging");
    isDraggingTab = false;
    draggedTabEl = null;
    draggedTabId = null;
    dragPlaceholder = null;
    document.body.classList.remove("tab-dragging-active");

    const ids = $$(".tab").map((node) => node.dataset.id).filter(Boolean);
    const pinnedIds = tabsState.filter((t) => t.isPinned).map((t) => t.id);
    const unpinnedIds = ids.filter((x) => !pinnedIds.includes(x));
    await window.murky.reorderTabs([...pinnedIds, ...unpinnedIds]);
    renderTabs();
    setTimeout(() => { suppressNextTabClick = false; }, 0);
  }

  function cancelTabDrag() {
    if (!draggedTabEl) return;
    const el = draggedTabEl;
    if (dragPlaceholder?.parentNode) dragPlaceholder.replaceWith(el);
    el.style.position = "";
    el.style.left = "";
    el.style.top = "";
    el.style.width = "";
    el.style.zIndex = "";
    el.style.pointerEvents = "";
    el.classList.remove("dragging");
    isDraggingTab = false;
    draggedTabEl = null;
    draggedTabId = null;
    dragPlaceholder = null;
    document.body.classList.remove("tab-dragging-active");
    renderTabs();
  }

   
   
  document.addEventListener("pointermove", (e) => {
    if (!draggedTabEl) return;
    dragPointerX = e.clientX;
    if (!isDraggingTab && Math.abs(e.clientX - dragStartX) > 5) startTabDrag();
    if (isDraggingTab) updateTabDrag(e.clientX);
  });
  document.addEventListener("pointerup", () => {
    if (!draggedTabEl) return;
    if (isDraggingTab) finishTabDrag();
    else {
      draggedTabEl = null;
      draggedTabId = null;
      document.body.classList.remove("tab-dragging-active");
    }
  });
  document.addEventListener("pointercancel", cancelTabDrag);

  function tabPreviewPrimedFor(id) {
    return tabHoverPrimed && tabHoverId === id;
  }

  function updateTabEl(el, tab) {
    el.classList.toggle("active", !!tab.isActive);
    el.classList.toggle("pinned", !!tab.isPinned);
    el.classList.toggle("muted", !!tab.isMuted);

    const iconWrap = el.querySelector(".tab-icon-wrap");
    iconWrap.innerHTML = "";
    if (tab.isLoading) {
      const spinner = document.createElement("div");
      spinner.className = "tab-spinner";
      iconWrap.appendChild(spinner);
    } else {
      iconWrap.appendChild(faviconEl(tab));
    }

    el.querySelector(".tab-title").textContent = tab.title || "New Tab";
    el.querySelector(".tab-pin-indicator").hidden = !tab.isPinned;
    el.querySelector(".tab-mute-indicator").hidden = !tab.isMuted;
    el.title = "";
  }

  function closeTabAnimated(id) {
    const el = tabEls.get(id);
    if (!el) {
      window.murky.closeTab(id);
      return;
    }

     
     
     
    suppressNextTabClick = true;
    hideTabPreview();
    el.style.pointerEvents = "none";

    window.murky.closeTab(id);
  }

  function renderTabs({ animateOrder = true } = {}) {
    const seen = new Set();

    tabsState.forEach((tab, index) => {
      seen.add(tab.id);
      let el = tabEls.get(tab.id);
      if (!el) {
        el = buildTabEl(tab);
        tabEls.set(tab.id, el);
        el.classList.add("tab-collapsed");
        const ref = tabstrip.children[index] || null;
        tabstrip.insertBefore(el, ref);
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("tab-collapsed")));
      } else if (!isDraggingTab && !dragPlaceholder) {
        const currentIndex = Array.from(tabstrip.children).indexOf(el);
        if (currentIndex !== index) {
          const ref = tabstrip.children[index] || null;
          if (animateOrder) animateDomMove(() => tabstrip.insertBefore(el, ref));
          else tabstrip.insertBefore(el, ref);
        }
      }
      updateTabEl(el, tab);
    });

    for (const [id, el] of tabEls.entries()) {
      if (!seen.has(id)) {
        tabEls.delete(id);
        el.classList.add("tab-collapsed");
        setTimeout(() => {
        if (el.isConnected) el.remove();
      }, 140);
      }
    }
    updateTabDensity();
  }

  function showTabContextMenu(id, x, y) {
    const tab = tabsState.find((t) => t.id === id);
    if (!tab) return;
    hideTabPreview();
    window.murky.showTabContextMenu({ id, x, y });
  }

  tabstrip.addEventListener("mouseleave", () => {
    clearTimeout(tabHoverTimer);
    schedulePreviewHide(300);
  });

  window.murky.onTabOverlayHover(({ inside, mode }) => {
    overlayHovered = !!inside;
    if (inside) {
      clearTimeout(overlayHideTimer);
      return;
    }
    if (mode === "closed") {
      overlayHovered = false;
      if (overlayMode) resetTabPreviewState();
      return;
    }
    if (mode === "preview") schedulePreviewHide(220);
  });

  window.murky.onTabOverlayBlur(() => resetTabPreviewState());

  function updateNavButtons() {
    const active = tabsState.find((t) => t.isActive);
    $("#navBack").disabled = !active || !active.canGoBack;
    $("#navForward").disabled = !active || !active.canGoForward;
  }

  window.murky.onTabsUpdate(({ tabs, activeTabId: aid }) => {
    if (aid !== activeTabId) addressFocused = false;
    const previousTabs = tabsState;
    const previousPinned = new Map(previousTabs.map((t) => [t.id, !!t.isPinned]));
    const pinStateChanged = tabs.some((t) => previousPinned.has(t.id) && previousPinned.get(t.id) !== !!t.isPinned);
    const previousOrder = previousTabs.map((t) => t.id).join("|");
    const nextOrder = tabs.map((t) => t.id).join("|");
    const orderChanged = previousOrder !== nextOrder;
    tabsState = tabs;
    activeTabId = aid;
    renderTabs({ animateOrder: !(pinStateChanged || (orderChanged && tabs.some((t) => t.isPinned))) });
    updateTabDensity();
    const activeEl = activeTabId ? tabEls.get(activeTabId) : null;
    if (activeEl && tabScrollControls && !tabScrollControls.hidden) {
      requestAnimationFrame(() => {
        activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        setTimeout(setTabScrollButtonState, 220);
      });
    }
    updateNavButtons();
    updateStarState();
    refreshSiteIndicator();
    updateHomePhotoBackdrop(window.__murkySettings || null);
  });

  window.murky.onNavUrl(({ url }) => {
    currentUrl = url;
    if (!addressFocused) {
      addressInput.value = isInternalUrl(url) ? "" : url;
    }
    const isLoading = tabsState.find((t) => t.isActive)?.isLoading;
    addressStatus.className = "address-status" + (isLoading ? " loading" : url.startsWith("https://") ? " secure" : "");
    updateStarState();
    refreshSiteIndicator();
  });

const MURKY_BUILTINS = {"tr":{"New tab":"Yeni sekme","Close tab":"Sekmeyi kapat","Zoom out":"Uzaklaştır","Reset zoom":"Yakınlaştırmayı sıfırla","Zoom in":"Yakınlaştır","Toggle sidebar":"Kenar çubuğunu aç/kapat","Murky Settings":"Murky Ayarları","Privacy Policy":"Gizlilik Politikası","Terms of Service":"Hizmet Şartları","Downloads":"İndirmeler","Recent Activity":"Son Etkinlik","Bookmarks":"Yer İmleri","Extensions":"Uzantılar","Manage Extensions":"Uzantıları Yönet","Appearance":"Görünüm","Typography":"Tipografi","Browsing":"Gezinme","Privacy":"Gizlilik","Language":"Dil","System":"Sistem","About":"Hakkında","Reset":"Sıfırla","Accent color":"Vurgu rengi","Background color":"Arka plan rengi","Toolbar size":"Araç çubuğu boyutu","Sidebar position":"Kenar çubuğu konumu","Interface font":"Arayüz yazı tipi","UI text scale":"Arayüz metin ölçeği","Search engine":"Arama motoru","New tab behavior":"Yeni sekme davranışı","Startup behavior":"Başlangıç davranışı","Page zoom":"Sayfa yakınlaştırması","Block known ad networks":"Bilinen reklam ağlarını engelle","Block known trackers and analytics":"Bilinen izleyicileri ve analizleri engelle","Send \"Do Not Track\" requests":"\"Do Not Track\" istekleri gönder","Ask where to save each download":"Her indirmede kaydedilecek yeri sor","Clear browsing history":"Tarama geçmişini temizle","Preferred Languages":"Tercih Edilen Diller","Let websites know the languages you speak.":"Web sitelerine konuştuğunuz dilleri bildirin.","Maximum 5 languages can be selected at a time!":"Aynı anda en fazla 5 dil seçilebilir!","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Bu dile Murky menülerini, açılır pencerelerini, ayarlarını ve diğer metinlerini çevirmede öncelik verilir.","Murky version":"Murky sürümü","Update status":"Güncelleme durumu","Outbound requests":"Giden istekler","Export request log":"İstek günlüğünü dışa aktar","Before clearing history":"Geçmişi temizlemeden önce","Crash recovery":"Çökme kurtarma","Website permissions":"Web sitesi izinleri","Local-only mode":"Yalnızca yerel mod","Export local data":"Yerel verileri dışa aktar","Purge local data":"Yerel verileri temizle","Check for updates":"Güncellemeleri kontrol et","Export":"Dışa aktar","Export history":"Geçmişi dışa aktar","Purge":"Temizle","Reset all settings":"Tüm ayarları sıfırla","Reset all":"Tümünü sıfırla","Warning":"Uyarı","Where to, today?":"Bugün nereye?","Good morning. Where to?":"Günaydın. Nereye?","Morning. What are we finding today?":"Günaydın. Bugün ne arıyoruz?","Rise and search.":"Uyan ve ara.","Good afternoon. Where to?":"İyi günler. Nereye?","Afternoon. What's next?":"İyi günler. Sırada ne var?","Where to, this afternoon?":"Bu öğleden sonra nereye?","Good evening. Where to?":"İyi akşamlar. Nereye?","Evening. What can we find?":"İyi akşamlar. Ne bulabiliriz?","Where to, tonight?":"Bu gece nereye?","Still up? Where to?":"Hâlâ ayakta mısın? Nereye?","Good night, one more search?":"İyi geceler, bir arama daha mı?","Quiet hours. Where to?":"Sessiz saatler. Nereye?","Downloaded":"İndirildi","Cancelled":"İptal edildi","Download complete":"İndirme tamamlandı","Download cancelled":"İndirme iptal edildi","Search":"Ara","No bookmarks yet, tap the star in the address bar to save a page.":"Henüz yer imi yok. Bir sayfayı kaydetmek için adres çubuğundaki yıldıza dokunun."},"de":{"New tab":"Neuer Tab","Close tab":"Tab schließen","Zoom out":"Verkleinern","Reset zoom":"Zoom zurücksetzen","Zoom in":"Vergrößern","Toggle sidebar":"Seitenleiste umschalten","Murky Settings":"Murky-Einstellungen","Privacy Policy":"Datenschutzerklärung","Terms of Service":"Nutzungsbedingungen","Downloads":"Downloads","Recent Activity":"Letzte Aktivitäten","Bookmarks":"Lesezeichen","Extensions":"Erweiterungen","Manage Extensions":"Erweiterungen verwalten","Appearance":"Darstellung","Typography":"Typografie","Browsing":"Surfen","Privacy":"Datenschutz","Language":"Sprache","System":"System","About":"Über","Reset":"Zurücksetzen","Accent color":"Akzentfarbe","Background color":"Hintergrundfarbe","Toolbar size":"Symbolleistengröße","Sidebar position":"Position der Seitenleiste","Interface font":"Oberflächenschrift","UI text scale":"UI-Textgröße","Search engine":"Suchmaschine","New tab behavior":"Verhalten neuer Tabs","Startup behavior":"Startverhalten","Page zoom":"Seitenzoom","Block known ad networks":"Bekannte Werbenetzwerke blockieren","Block known trackers and analytics":"Bekannte Tracker und Analysen blockieren","Send \"Do Not Track\" requests":"\"Do Not Track\\“-Anfragen senden","Ask where to save each download":"Vor jedem Download nach Speicherort fragen","Clear browsing history":"Browserverlauf löschen","Preferred Languages":"Bevorzugte Sprachen","Let websites know the languages you speak.":"Websites über die von dir gesprochenen Sprachen informieren.","Maximum 5 languages can be selected at a time!":"Es können höchstens 5 Sprachen gleichzeitig ausgewählt werden!","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Diese Sprache hat Vorrang bei der Übersetzung von Menüs, Popups, Einstellungen und anderen Murky-Texten.","Murky version":"Murky-Version","Update status":"Update-Status","Outbound requests":"Ausgehende Anfragen","Export request log":"Anfrageprotokoll exportieren","Before clearing history":"Vor dem Löschen des Verlaufs","Crash recovery":"Absturz-Wiederherstellung","Website permissions":"Website-Berechtigungen","Local-only mode":"Nur-lokal-Modus","Export local data":"Lokale Daten exportieren","Purge local data":"Lokale Daten löschen","Check for updates":"Nach Updates suchen","Export":"Exportieren","Export history":"Verlauf exportieren","Purge":"Löschen","Reset all settings":"Alle Einstellungen zurücksetzen","Reset all":"Alle zurücksetzen","Warning":"Warnung","Where to, today?":"Wohin heute?","Good morning. Where to?":"Guten Morgen. Wohin?","Morning. What are we finding today?":"Guten Morgen. Was suchen wir heute?","Rise and search.":"Aufstehen und suchen.","Good afternoon. Where to?":"Guten Tag. Wohin?","Afternoon. What's next?":"Guten Tag. Was kommt als Nächstes?","Where to, this afternoon?":"Wohin heute Nachmittag?","Good evening. Where to?":"Guten Abend. Wohin?","Evening. What can we find?":"Guten Abend. Was können wir finden?","Where to, tonight?":"Wohin heute Abend?","Still up? Where to?":"Noch wach? Wohin?","Good night, one more search?":"Gute Nacht, noch eine Suche?","Quiet hours. Where to?":"Ruhige Stunden. Wohin?","Downloaded":"Heruntergeladen","Cancelled":"Abgebrochen","Download complete":"Download abgeschlossen","Download cancelled":"Download abgebrochen","Search":"Suche","No bookmarks yet, tap the star in the address bar to save a page.":"Noch keine Lesezeichen. Klicke auf den Stern in der Adressleiste, um eine Seite zu speichern."},"fr":{"New tab":"Nouvel onglet","Close tab":"Fermer l’onglet","Zoom out":"Dézoomer","Reset zoom":"Réinitialiser le zoom","Zoom in":"Zoomer","Toggle sidebar":"Afficher/masquer la barre latérale","Murky Settings":"Paramètres de Murky","Privacy Policy":"Politique de confidentialité","Terms of Service":"Conditions d’utilisation","Downloads":"Téléchargements","Recent Activity":"Activité récente","Bookmarks":"Favoris","Extensions":"Extensions","Manage Extensions":"Gérer les extensions","Appearance":"Apparence","Typography":"Typographie","Browsing":"Navigation","Privacy":"Confidentialité","Language":"Langue","System":"Système","About":"À propos","Reset":"Réinitialiser","Accent color":"Couleur d’accentuation","Background color":"Couleur d’arrière-plan","Toolbar size":"Taille de la barre d’outils","Sidebar position":"Position de la barre latérale","Interface font":"Police de l’interface","UI text scale":"Échelle du texte de l’interface","Search engine":"Moteur de recherche","New tab behavior":"Comportement des nouveaux onglets","Startup behavior":"Comportement au démarrage","Page zoom":"Zoom des pages","Block known ad networks":"Bloquer les réseaux publicitaires connus","Block known trackers and analytics":"Bloquer les traqueurs et analyses connus","Send \"Do Not Track\" requests":"Envoyer les requêtes « Do Not Track »","Ask where to save each download":"Demander où enregistrer chaque téléchargement","Clear browsing history":"Effacer l’historique de navigation","Preferred Languages":"Langues préférées","Let websites know the languages you speak.":"Indiquer aux sites les langues que vous parlez.","Maximum 5 languages can be selected at a time!":"Vous pouvez sélectionner au maximum 5 langues à la fois !","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Cette langue est prioritaire pour traduire les menus, fenêtres contextuelles, paramètres et autres textes de Murky.","Murky version":"Version de Murky","Update status":"État des mises à jour","Outbound requests":"Requêtes sortantes","Export request log":"Exporter le journal des requêtes","Before clearing history":"Avant d’effacer l’historique","Crash recovery":"Récupération après plantage","Website permissions":"Autorisations des sites","Local-only mode":"Mode local uniquement","Export local data":"Exporter les données locales","Purge local data":"Effacer les données locales","Check for updates":"Rechercher des mises à jour","Export":"Exporter","Export history":"Exporter l’historique","Purge":"Effacer","Reset all settings":"Réinitialiser tous les paramètres","Reset all":"Tout réinitialiser","Warning":"Avertissement","Where to, today?":"Où aller aujourd’hui ?","Good morning. Where to?":"Bonjour. Où aller ?","Morning. What are we finding today?":"Bonjour. Que cherchons-nous aujourd’hui ?","Rise and search.":"Debout et recherchez.","Good afternoon. Where to?":"Bon après-midi. Où aller ?","Afternoon. What's next?":"Bon après-midi. Quelle est la suite ?","Where to, this afternoon?":"Où aller cet après-midi ?","Good evening. Where to?":"Bonsoir. Où aller ?","Evening. What can we find?":"Bonsoir. Que pouvons-nous trouver ?","Where to, tonight?":"Où aller ce soir ?","Still up? Where to?":"Encore debout ? Où aller ?","Good night, one more search?":"Bonne nuit, encore une recherche ?","Quiet hours. Where to?":"Heures calmes. Où aller ?","Downloaded":"Téléchargé","Cancelled":"Annulé","Download complete":"Téléchargement terminé","Download cancelled":"Téléchargement annulé","Search":"Rechercher","No bookmarks yet, tap the star in the address bar to save a page.":"Aucun favori. Appuyez sur l’étoile de la barre d’adresse pour enregistrer une page."},"es":{"New tab":"Nueva pestaña","Close tab":"Cerrar pestaña","Zoom out":"Alejar","Reset zoom":"Restablecer zoom","Zoom in":"Acercar","Toggle sidebar":"Alternar barra lateral","Murky Settings":"Configuración de Murky","Privacy Policy":"Política de privacidad","Terms of Service":"Términos de servicio","Downloads":"Descargas","Recent Activity":"Actividad reciente","Bookmarks":"Marcadores","Extensions":"Extensiones","Manage Extensions":"Administrar extensiones","Appearance":"Apariencia","Typography":"Tipografía","Browsing":"Navegación","Privacy":"Privacidad","Language":"Idioma","System":"Sistema","About":"Acerca de","Reset":"Restablecer","Accent color":"Color de acento","Background color":"Color de fondo","Toolbar size":"Tamaño de la barra de herramientas","Sidebar position":"Posición de la barra lateral","Interface font":"Fuente de la interfaz","UI text scale":"Escala del texto de la interfaz","Search engine":"Motor de búsqueda","New tab behavior":"Comportamiento de nuevas pestañas","Startup behavior":"Comportamiento al iniciar","Page zoom":"Zoom de página","Block known ad networks":"Bloquear redes publicitarias conocidas","Block known trackers and analytics":"Bloquear rastreadores y analíticas conocidas","Send \"Do Not Track\" requests":"Enviar solicitudes \"Do Not Track\"","Ask where to save each download":"Preguntar dónde guardar cada descarga","Clear browsing history":"Borrar historial de navegación","Preferred Languages":"Idiomas preferidos","Let websites know the languages you speak.":"Permite que los sitios sepan los idiomas que hablas.","Maximum 5 languages can be selected at a time!":"Se pueden seleccionar como máximo 5 idiomas a la vez.","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Este idioma tiene prioridad para traducir menús, ventanas emergentes, ajustes y otros textos de Murky.","Murky version":"Versión de Murky","Update status":"Estado de actualización","Outbound requests":"Solicitudes salientes","Export request log":"Exportar registro de solicitudes","Before clearing history":"Antes de borrar el historial","Crash recovery":"Recuperación ante fallos","Website permissions":"Permisos de sitios web","Local-only mode":"Modo solo local","Export local data":"Exportar datos locales","Purge local data":"Borrar datos locales","Check for updates":"Buscar actualizaciones","Export":"Exportar","Export history":"Exportar historial","Purge":"Borrar","Reset all settings":"Restablecer todos los ajustes","Reset all":"Restablecer todo","Warning":"Advertencia","Where to, today?":"¿Adónde hoy?","Good morning. Where to?":"Buenos días. ¿Adónde?","Morning. What are we finding today?":"Buenos días. ¿Qué buscamos hoy?","Rise and search.":"Levántate y busca.","Good afternoon. Where to?":"Buenas tardes. ¿Adónde?","Afternoon. What's next?":"Buenas tardes. ¿Qué sigue?","Where to, this afternoon?":"¿Adónde esta tarde?","Good evening. Where to?":"Buenas noches. ¿Adónde?","Evening. What can we find?":"Buenas noches. ¿Qué podemos encontrar?","Where to, tonight?":"¿Adónde esta noche?","Still up? Where to?":"¿Sigues despierto? ¿Adónde?","Good night, one more search?":"Buenas noches, ¿una búsqueda más?","Quiet hours. Where to?":"Horas tranquilas. ¿Adónde?","Downloaded":"Descargado","Cancelled":"Cancelado","Download complete":"Descarga completada","Download cancelled":"Descarga cancelada","Search":"Buscar","No bookmarks yet, tap the star in the address bar to save a page.":"Aún no hay marcadores. Pulsa la estrella de la barra de direcciones para guardar una página."},"it":{"New tab":"Nuova scheda","Close tab":"Chiudi scheda","Zoom out":"Riduci zoom","Reset zoom":"Reimposta zoom","Zoom in":"Aumenta zoom","Toggle sidebar":"Attiva/disattiva barra laterale","Murky Settings":"Impostazioni di Murky","Privacy Policy":"Informativa sulla privacy","Terms of Service":"Termini di servizio","Downloads":"Download","Recent Activity":"Attività recenti","Bookmarks":"Segnalibri","Extensions":"Estensioni","Manage Extensions":"Gestisci estensioni","Appearance":"Aspetto","Typography":"Tipografia","Browsing":"Navigazione","Privacy":"Privacy","Language":"Lingua","System":"Sistema","About":"Informazioni","Reset":"Reimposta","Accent color":"Colore principale","Background color":"Colore di sfondo","Toolbar size":"Dimensione barra degli strumenti","Sidebar position":"Posizione barra laterale","Interface font":"Carattere interfaccia","UI text scale":"Scala testo interfaccia","Search engine":"Motore di ricerca","New tab behavior":"Comportamento nuove schede","Startup behavior":"Comportamento all'avvio","Page zoom":"Zoom pagina","Block known ad networks":"Blocca reti pubblicitarie note","Block known trackers and analytics":"Blocca tracker e analisi note","Send \"Do Not Track\" requests":"Invia richieste \"Do Not Track\"","Ask where to save each download":"Chiedi dove salvare ogni download","Clear browsing history":"Cancella cronologia di navigazione","Preferred Languages":"Lingue preferite","Let websites know the languages you speak.":"Fai sapere ai siti quali lingue parli.","Maximum 5 languages can be selected at a time!":"Puoi selezionare al massimo 5 lingue alla volta!","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Questa lingua ha la priorità per tradurre menu, popup, impostazioni e altri testi di Murky.","Murky version":"Versione di Murky","Update status":"Stato aggiornamento","Outbound requests":"Richieste in uscita","Export request log":"Esporta registro richieste","Before clearing history":"Prima di cancellare la cronologia","Crash recovery":"Ripristino dopo un arresto anomalo","Website permissions":"Permessi dei siti","Local-only mode":"Modalità solo locale","Export local data":"Esporta dati locali","Purge local data":"Cancella dati locali","Check for updates":"Controlla aggiornamenti","Export":"Esporta","Export history":"Esporta cronologia","Purge":"Cancella","Reset all settings":"Reimposta tutte le impostazioni","Reset all":"Reimposta tutto","Warning":"Avviso","Where to, today?":"Dove andiamo oggi?","Good morning. Where to?":"Buongiorno. Dove andiamo?","Morning. What are we finding today?":"Buongiorno. Cosa cerchiamo oggi?","Rise and search.":"Alzati e cerca.","Good afternoon. Where to?":"Buon pomeriggio. Dove andiamo?","Afternoon. What's next?":"Buon pomeriggio. Cosa c'è dopo?","Where to, this afternoon?":"Dove andiamo questo pomeriggio?","Good evening. Where to?":"Buonasera. Dove andiamo?","Evening. What can we find?":"Buonasera. Cosa possiamo trovare?","Where to, tonight?":"Dove andiamo stasera?","Still up? Where to?":"Ancora sveglio? Dove andiamo?","Good night, one more search?":"Buonanotte, un'altra ricerca?","Quiet hours. Where to?":"Ore tranquille. Dove andiamo?","Downloaded":"Scaricato","Cancelled":"Annullato","Download complete":"Download completato","Download cancelled":"Download annullato","Search":"Cerca","No bookmarks yet, tap the star in the address bar to save a page.":"Nessun segnalibro. Tocca la stella nella barra degli indirizzi per salvare una pagina."},"pt":{"New tab":"Nova aba","Close tab":"Fechar aba","Zoom out":"Diminuir zoom","Reset zoom":"Redefinir zoom","Zoom in":"Aumentar zoom","Toggle sidebar":"Alternar barra lateral","Murky Settings":"Configurações do Murky","Privacy Policy":"Política de privacidade","Terms of Service":"Termos de serviço","Downloads":"Downloads","Recent Activity":"Atividade recente","Bookmarks":"Favoritos","Extensions":"Extensões","Manage Extensions":"Gerenciar extensões","Appearance":"Aparência","Typography":"Tipografia","Browsing":"Navegação","Privacy":"Privacidade","Language":"Idioma","System":"Sistema","About":"Sobre","Reset":"Redefinir","Accent color":"Cor de destaque","Background color":"Cor de fundo","Toolbar size":"Tamanho da barra de ferramentas","Sidebar position":"Posição da barra lateral","Interface font":"Fonte da interface","UI text scale":"Escala do texto da interface","Search engine":"Mecanismo de pesquisa","New tab behavior":"Comportamento de novas abas","Startup behavior":"Comportamento de inicialização","Page zoom":"Zoom da página","Block known ad networks":"Bloquear redes de anúncios conhecidas","Block known trackers and analytics":"Bloquear rastreadores e análises conhecidos","Send \"Do Not Track\" requests":"Enviar solicitações \"Do Not Track\"","Ask where to save each download":"Perguntar onde salvar cada download","Clear browsing history":"Limpar histórico de navegação","Preferred Languages":"Idiomas preferidos","Let websites know the languages you speak.":"Permita que os sites saibam quais idiomas você fala.","Maximum 5 languages can be selected at a time!":"No máximo 5 idiomas podem ser selecionados ao mesmo tempo!","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Este idioma tem prioridade para traduzir menus, pop-ups, configurações e outros textos do Murky.","Murky version":"Versão do Murky","Update status":"Status da atualização","Outbound requests":"Solicitações de saída","Export request log":"Exportar registro de solicitações","Before clearing history":"Antes de limpar o histórico","Crash recovery":"Recuperação de falhas","Website permissions":"Permissões de sites","Local-only mode":"Modo somente local","Export local data":"Exportar dados locais","Purge local data":"Apagar dados locais","Check for updates":"Verificar atualizações","Export":"Exportar","Export history":"Exportar histórico","Purge":"Apagar","Reset all settings":"Redefinir todas as configurações","Reset all":"Redefinir tudo","Warning":"Aviso","Where to, today?":"Para onde hoje?","Good morning. Where to?":"Bom dia. Para onde?","Morning. What are we finding today?":"Bom dia. O que vamos encontrar hoje?","Rise and search.":"Levante-se e pesquise.","Good afternoon. Where to?":"Boa tarde. Para onde?","Afternoon. What's next?":"Boa tarde. O que vem agora?","Where to, this afternoon?":"Para onde esta tarde?","Good evening. Where to?":"Boa noite. Para onde?","Evening. What can we find?":"Boa noite. O que podemos encontrar?","Where to, tonight?":"Para onde esta noite?","Still up? Where to?":"Ainda acordado? Para onde?","Good night, one more search?":"Boa noite, mais uma pesquisa?","Quiet hours. Where to?":"Horas tranquilas. Para onde?","Downloaded":"Baixado","Cancelled":"Cancelado","Download complete":"Download concluído","Download cancelled":"Download cancelado","Search":"Pesquisar","No bookmarks yet, tap the star in the address bar to save a page.":"Ainda não há favoritos. Toque na estrela da barra de endereço para salvar uma página."},"nl":{"New tab":"Nieuw tabblad","Close tab":"Tabblad sluiten","Zoom out":"Uitzoomen","Reset zoom":"Zoom resetten","Zoom in":"Inzoomen","Toggle sidebar":"Zijbalk in-/uitschakelen","Murky Settings":"Murky-instellingen","Privacy Policy":"Privacybeleid","Terms of Service":"Servicevoorwaarden","Downloads":"Downloads","Recent Activity":"Recente activiteit","Bookmarks":"Bladwijzers","Extensions":"Extensies","Manage Extensions":"Extensies beheren","Appearance":"Uiterlijk","Typography":"Typografie","Browsing":"Browsen","Privacy":"Privacy","Language":"Taal","System":"Systeem","About":"Over","Reset":"Resetten","Accent color":"Accentkleur","Background color":"Achtergrondkleur","Toolbar size":"Werkbalkgrootte","Sidebar position":"Positie van zijbalk","Interface font":"Interfacelettertype","UI text scale":"Schaal van UI-tekst","Search engine":"Zoekmachine","New tab behavior":"Gedrag van nieuwe tabbladen","Startup behavior":"Opstartgedrag","Page zoom":"Paginazoom","Block known ad networks":"Bekende advertentienetwerken blokkeren","Block known trackers and analytics":"Bekende trackers en analyses blokkeren","Send \"Do Not Track\" requests":"\"Do Not Track\"-verzoeken verzenden","Ask where to save each download":"Vragen waar elke download moet worden opgeslagen","Clear browsing history":"Browsegeschiedenis wissen","Preferred Languages":"Voorkeurstalen","Let websites know the languages you speak.":"Laat websites weten welke talen je spreekt.","Maximum 5 languages can be selected at a time!":"Er kunnen maximaal 5 talen tegelijk worden geselecteerd!","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Deze taal krijgt voorrang bij het vertalen van menu's, pop-ups, instellingen en andere tekst in Murky.","Murky version":"Murky-versie","Update status":"Updatestatus","Outbound requests":"Uitgaande verzoeken","Export request log":"Verzoekenlogboek exporteren","Before clearing history":"Voor het wissen van geschiedenis","Crash recovery":"Herstel na crash","Website permissions":"Website-machtigingen","Local-only mode":"Alleen-lokale modus","Export local data":"Lokale gegevens exporteren","Purge local data":"Lokale gegevens wissen","Check for updates":"Controleren op updates","Export":"Exporteren","Export history":"Geschiedenis exporteren","Purge":"Wissen","Reset all settings":"Alle instellingen resetten","Reset all":"Alles resetten","Warning":"Waarschuwing","Where to, today?":"Waar gaan we vandaag heen?","Good morning. Where to?":"Goedemorgen. Waarheen?","Morning. What are we finding today?":"Goedemorgen. Wat zoeken we vandaag?","Rise and search.":"Sta op en zoek.","Good afternoon. Where to?":"Goedemiddag. Waarheen?","Afternoon. What's next?":"Goedemiddag. Wat is de volgende stap?","Where to, this afternoon?":"Waarheen vanmiddag?","Good evening. Where to?":"Goedenavond. Waarheen?","Evening. What can we find?":"Goedenavond. Wat kunnen we vinden?","Where to, tonight?":"Waarheen vanavond?","Still up? Where to?":"Nog wakker? Waarheen?","Good night, one more search?":"Goedenacht, nog één zoekopdracht?","Quiet hours. Where to?":"Rustige uren. Waarheen?","Downloaded":"Gedownload","Cancelled":"Geannuleerd","Download complete":"Download voltooid","Download cancelled":"Download geannuleerd","Search":"Zoeken","No bookmarks yet, tap the star in the address bar to save a page.":"Nog geen bladwijzers. Tik op de ster in de adresbalk om een pagina op te slaan."},"ru":{"New tab":"Новая вкладка","Close tab":"Закрыть вкладку","Zoom out":"Уменьшить масштаб","Reset zoom":"Сбросить масштаб","Zoom in":"Увеличить масштаб","Toggle sidebar":"Переключить боковую панель","Murky Settings":"Настройки Murky","Privacy Policy":"Политика конфиденциальности","Terms of Service":"Условия использования","Downloads":"Загрузки","Recent Activity":"Недавняя активность","Bookmarks":"Закладки","Extensions":"Расширения","Manage Extensions":"Управление расширениями","Appearance":"Внешний вид","Typography":"Типографика","Browsing":"Браузинг","Privacy":"Конфиденциальность","Language":"Язык","System":"Система","About":"О программе","Reset":"Сбросить","Accent color":"Цвет акцента","Background color":"Цвет фона","Toolbar size":"Размер панели инструментов","Sidebar position":"Положение боковой панели","Interface font":"Шрифт интерфейса","UI text scale":"Масштаб текста интерфейса","Search engine":"Поисковая система","New tab behavior":"Поведение новых вкладок","Startup behavior":"Поведение при запуске","Page zoom":"Масштаб страницы","Block known ad networks":"Блокировать известные рекламные сети","Block known trackers and analytics":"Блокировать известные трекеры и аналитику","Send \"Do Not Track\" requests":"Отправлять запросы «Do Not Track»","Ask where to save each download":"Спрашивать, куда сохранять каждую загрузку","Clear browsing history":"Очистить историю браузера","Preferred Languages":"Предпочтительные языки","Let websites know the languages you speak.":"Сообщать сайтам, на каких языках вы говорите.","Maximum 5 languages can be selected at a time!":"Одновременно можно выбрать не более 5 языков!","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Этот язык имеет приоритет для перевода меню, всплывающих окон, настроек и других текстов Murky.","Murky version":"Версия Murky","Update status":"Состояние обновления","Outbound requests":"Исходящие запросы","Export request log":"Экспорт журнала запросов","Before clearing history":"Перед очисткой истории","Crash recovery":"Восстановление после сбоя","Website permissions":"Разрешения сайтов","Local-only mode":"Только локальный режим","Export local data":"Экспорт локальных данных","Purge local data":"Удалить локальные данные","Check for updates":"Проверить обновления","Export":"Экспорт","Export history":"Экспорт истории","Purge":"Удалить","Reset all settings":"Сбросить все настройки","Reset all":"Сбросить все","Warning":"Предупреждение","Where to, today?":"Куда сегодня?","Good morning. Where to?":"Доброе утро. Куда?","Morning. What are we finding today?":"Доброе утро. Что будем искать сегодня?","Rise and search.":"Вставайте и ищите.","Good afternoon. Where to?":"Добрый день. Куда?","Afternoon. What's next?":"Добрый день. Что дальше?","Where to, this afternoon?":"Куда сегодня днём?","Good evening. Where to?":"Добрый вечер. Куда?","Evening. What can we find?":"Добрый вечер. Что найдём?","Where to, tonight?":"Куда сегодня вечером?","Still up? Where to?":"Ещё не спишь? Куда?","Good night, one more search?":"Спокойной ночи, ещё один поиск?","Quiet hours. Where to?":"Тихие часы. Куда?","Downloaded":"Загружено","Cancelled":"Отменено","Download complete":"Загрузка завершена","Download cancelled":"Загрузка отменена","Search":"Поиск","No bookmarks yet, tap the star in the address bar to save a page.":"Закладок пока нет. Нажмите на звезду в адресной строке, чтобы сохранить страницу."},"pl":{"New tab":"Nowa karta","Close tab":"Zamknij kartę","Zoom out":"Pomniejsz","Reset zoom":"Resetuj powiększenie","Zoom in":"Powiększ","Toggle sidebar":"Przełącz pasek boczny","Murky Settings":"Ustawienia Murky","Privacy Policy":"Polityka prywatności","Terms of Service":"Warunki korzystania","Downloads":"Pobrane","Recent Activity":"Ostatnia aktywność","Bookmarks":"Zakładki","Extensions":"Rozszerzenia","Manage Extensions":"Zarządzaj rozszerzeniami","Appearance":"Wygląd","Typography":"Typografia","Browsing":"Przeglądanie","Privacy":"Prywatność","Language":"Język","System":"System","About":"Informacje","Reset":"Resetuj","Accent color":"Kolor akcentu","Background color":"Kolor tła","Toolbar size":"Rozmiar paska narzędzi","Sidebar position":"Położenie paska bocznego","Interface font":"Czcionka interfejsu","UI text scale":"Skala tekstu interfejsu","Search engine":"Wyszukiwarka","New tab behavior":"Zachowanie nowych kart","Startup behavior":"Zachowanie podczas uruchamiania","Page zoom":"Powiększenie strony","Block known ad networks":"Blokuj znane sieci reklamowe","Block known trackers and analytics":"Blokuj znane moduły śledzące i analitykę","Send \"Do Not Track\" requests":"Wysyłaj żądania \"Do Not Track\"","Ask where to save each download":"Pytaj, gdzie zapisać każdy plik","Clear browsing history":"Wyczyść historię przeglądania","Preferred Languages":"Preferowane języki","Let websites know the languages you speak.":"Informuj strony, jakimi językami się posługujesz.","Maximum 5 languages can be selected at a time!":"Jednocześnie można wybrać maksymalnie 5 języków!","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Ten język ma pierwszeństwo przy tłumaczeniu menu, wyskakujących okien, ustawień i innych tekstów Murky.","Murky version":"Wersja Murky","Update status":"Stan aktualizacji","Outbound requests":"Żądania wychodzące","Export request log":"Eksportuj dziennik żądań","Before clearing history":"Przed wyczyszczeniem historii","Crash recovery":"Odzyskiwanie po awarii","Website permissions":"Uprawnienia witryn","Local-only mode":"Tryb tylko lokalny","Export local data":"Eksportuj dane lokalne","Purge local data":"Usuń dane lokalne","Check for updates":"Sprawdź aktualizacje","Export":"Eksportuj","Export history":"Eksportuj historię","Purge":"Usuń","Reset all settings":"Resetuj wszystkie ustawienia","Reset all":"Resetuj wszystko","Warning":"Ostrzeżenie","Where to, today?":"Dokąd dziś?","Good morning. Where to?":"Dzień dobry. Dokąd?","Morning. What are we finding today?":"Dzień dobry. Czego dziś szukamy?","Rise and search.":"Wstań i szukaj.","Good afternoon. Where to?":"Dzień dobry. Dokąd?","Afternoon. What's next?":"Dzień dobry. Co dalej?","Where to, this afternoon?":"Dokąd dziś po południu?","Good evening. Where to?":"Dobry wieczór. Dokąd?","Evening. What can we find?":"Dobry wieczór. Co możemy znaleźć?","Where to, tonight?":"Dokąd dziś wieczorem?","Still up? Where to?":"Jeszcze nie śpisz? Dokąd?","Good night, one more search?":"Dobranoc, jeszcze jedno wyszukiwanie?","Quiet hours. Where to?":"Ciche godziny. Dokąd?","Downloaded":"Pobrano","Cancelled":"Anulowano","Download complete":"Pobieranie zakończone","Download cancelled":"Pobieranie anulowane","Search":"Szukaj","No bookmarks yet, tap the star in the address bar to save a page.":"Brak zakładek. Kliknij gwiazdkę na pasku adresu, aby zapisać stronę."},"ja":{"New tab":"新しいタブ","Close tab":"タブを閉じる","Zoom out":"縮小","Reset zoom":"ズームをリセット","Zoom in":"拡大","Toggle sidebar":"サイドバーを切り替え","Murky Settings":"Murky 設定","Privacy Policy":"プライバシーポリシー","Terms of Service":"利用規約","Downloads":"ダウンロード","Recent Activity":"最近のアクティビティ","Bookmarks":"ブックマーク","Extensions":"拡張機能","Manage Extensions":"拡張機能を管理","Appearance":"外観","Typography":"タイポグラフィ","Browsing":"ブラウジング","Privacy":"プライバシー","Language":"言語","System":"システム","About":"Murky について","Reset":"リセット","Accent color":"アクセントカラー","Background color":"背景色","Toolbar size":"ツールバーのサイズ","Sidebar position":"サイドバーの位置","Interface font":"インターフェースフォント","UI text scale":"UI テキストサイズ","Search engine":"検索エンジン","New tab behavior":"新しいタブの動作","Startup behavior":"起動時の動作","Page zoom":"ページズーム","Block known ad networks":"既知の広告ネットワークをブロック","Block known trackers and analytics":"既知のトラッカーと分析をブロック","Send \"Do Not Track\" requests":"「Do Not Track」リクエストを送信","Ask where to save each download":"ダウンロードごとに保存先を確認","Clear browsing history":"閲覧履歴を消去","Preferred Languages":"優先言語","Let websites know the languages you speak.":"使用する言語をウェブサイトに知らせます。","Maximum 5 languages can be selected at a time!":"同時に選択できる言語は最大5つです。","This language is given priority to translate display menus, popups, settings and other text on Murky.":"この言語を優先して Murky のメニュー、ポップアップ、設定などを翻訳します。","Murky version":"Murky バージョン","Update status":"更新状態","Outbound requests":"外部へのリクエスト","Export request log":"リクエストログをエクスポート","Before clearing history":"履歴を消去する前に","Crash recovery":"クラッシュ復旧","Website permissions":"ウェブサイトの権限","Local-only mode":"ローカルのみモード","Export local data":"ローカルデータをエクスポート","Purge local data":"ローカルデータを消去","Check for updates":"更新を確認","Export":"エクスポート","Export history":"履歴をエクスポート","Purge":"消去","Reset all settings":"すべての設定をリセット","Reset all":"すべてリセット","Warning":"警告","Where to, today?":"今日はどこへ？","Good morning. Where to?":"おはようございます。どこへ？","Morning. What are we finding today?":"おはようございます。今日は何を探しますか？","Rise and search.":"起きて検索しましょう。","Good afternoon. Where to?":"こんにちは。どこへ？","Afternoon. What's next?":"こんにちは。次は何をしますか？","Where to, this afternoon?":"今日の午後はどこへ？","Good evening. Where to?":"こんばんは。どこへ？","Evening. What can we find?":"こんばんは。何を見つけましょう？","Where to, tonight?":"今夜はどこへ？","Still up? Where to?":"まだ起きていますか？どこへ？","Good night, one more search?":"おやすみなさい。もう一度検索しますか？","Quiet hours. Where to?":"静かな時間です。どこへ？","Downloaded":"ダウンロード済み","Cancelled":"キャンセル済み","Download complete":"ダウンロード完了","Download cancelled":"ダウンロードをキャンセルしました","Search":"検索","No bookmarks yet, tap the star in the address bar to save a page.":"ブックマークはまだありません。アドレスバーの星を押してページを保存してください。"},"ko":{"New tab":"새 탭","Close tab":"탭 닫기","Zoom out":"축소","Reset zoom":"확대/축소 초기화","Zoom in":"확대","Toggle sidebar":"사이드바 전환","Murky Settings":"Murky 설정","Privacy Policy":"개인정보 처리방침","Terms of Service":"서비스 약관","Downloads":"다운로드","Recent Activity":"최근 활동","Bookmarks":"북마크","Extensions":"확장 프로그램","Manage Extensions":"확장 프로그램 관리","Appearance":"모양","Typography":"타이포그래피","Browsing":"탐색","Privacy":"개인정보 보호","Language":"언어","System":"시스템","About":"정보","Reset":"초기화","Accent color":"강조 색상","Background color":"배경색","Toolbar size":"도구 모음 크기","Sidebar position":"사이드바 위치","Interface font":"인터페이스 글꼴","UI text scale":"UI 텍스트 크기","Search engine":"검색 엔진","New tab behavior":"새 탭 동작","Startup behavior":"시작 동작","Page zoom":"페이지 확대/축소","Block known ad networks":"알려진 광고 네트워크 차단","Block known trackers and analytics":"알려진 추적기 및 분석 차단","Send \"Do Not Track\" requests":"Do Not Track 요청 보내기","Ask where to save each download":"다운로드할 때마다 저장 위치 묻기","Clear browsing history":"인터넷 사용 기록 삭제","Preferred Languages":"선호 언어","Let websites know the languages you speak.":"사용하는 언어를 웹사이트에 알립니다.","Maximum 5 languages can be selected at a time!":"한 번에 최대 5개 언어를 선택할 수 있습니다.","This language is given priority to translate display menus, popups, settings and other text on Murky.":"이 언어를 우선하여 Murky 메뉴, 팝업, 설정 및 기타 텍스트를 번역합니다.","Murky version":"Murky 버전","Update status":"업데이트 상태","Outbound requests":"외부 요청","Export request log":"요청 로그 내보내기","Before clearing history":"기록 삭제 전","Crash recovery":"충돌 복구","Website permissions":"웹사이트 권한","Local-only mode":"로컬 전용 모드","Export local data":"로컬 데이터 내보내기","Purge local data":"로컬 데이터 삭제","Check for updates":"업데이트 확인","Export":"내보내기","Export history":"기록 내보내기","Purge":"삭제","Reset all settings":"모든 설정 초기화","Reset all":"모두 초기화","Warning":"경고","Where to, today?":"오늘은 어디로 갈까요?","Good morning. Where to?":"좋은 아침이에요. 어디로 갈까요?","Morning. What are we finding today?":"좋은 아침이에요. 오늘은 무엇을 찾을까요?","Rise and search.":"일어나서 검색해 보세요.","Good afternoon. Where to?":"좋은 오후예요. 어디로 갈까요?","Afternoon. What's next?":"좋은 오후예요. 다음은 무엇일까요?","Where to, this afternoon?":"오늘 오후에는 어디로 갈까요?","Good evening. Where to?":"좋은 저녁이에요. 어디로 갈까요?","Evening. What can we find?":"좋은 저녁이에요. 무엇을 찾아볼까요?","Where to, tonight?":"오늘 밤에는 어디로 갈까요?","Still up? Where to?":"아직 깨어 있나요? 어디로 갈까요?","Good night, one more search?":"잘 자요. 한 번 더 검색할까요?","Quiet hours. Where to?":"조용한 시간이에요. 어디로 갈까요?","Downloaded":"다운로드됨","Cancelled":"취소됨","Download complete":"다운로드 완료","Download cancelled":"다운로드 취소됨","Search":"검색","No bookmarks yet, tap the star in the address bar to save a page.":"아직 북마크가 없습니다. 주소 표시줄의 별표를 눌러 페이지를 저장하세요."},"zh":{"New tab":"新标签页","Close tab":"关闭标签页","Zoom out":"缩小","Reset zoom":"重置缩放","Zoom in":"放大","Toggle sidebar":"切换侧边栏","Murky Settings":"Murky 设置","Privacy Policy":"隐私政策","Terms of Service":"服务条款","Downloads":"下载","Recent Activity":"最近活动","Bookmarks":"书签","Extensions":"扩展程序","Manage Extensions":"管理扩展程序","Appearance":"外观","Typography":"排版","Browsing":"浏览","Privacy":"隐私","Language":"语言","System":"系统","About":"关于","Reset":"重置","Accent color":"强调色","Background color":"背景颜色","Toolbar size":"工具栏大小","Sidebar position":"侧边栏位置","Interface font":"界面字体","UI text scale":"界面文字缩放","Search engine":"搜索引擎","New tab behavior":"新标签页行为","Startup behavior":"启动行为","Page zoom":"页面缩放","Block known ad networks":"阻止已知广告网络","Block known trackers and analytics":"阻止已知跟踪器和分析服务","Send \"Do Not Track\" requests":"发送“Do Not Track”请求","Ask where to save each download":"每次下载时询问保存位置","Clear browsing history":"清除浏览历史","Preferred Languages":"首选语言","Let websites know the languages you speak.":"让网站知道您使用的语言。","Maximum 5 languages can be selected at a time!":"一次最多可以选择 5 种语言！","This language is given priority to translate display menus, popups, settings and other text on Murky.":"此语言优先用于翻译 Murky 的菜单、弹窗、设置和其他文本。","Murky version":"Murky 版本","Update status":"更新状态","Outbound requests":"外发请求","Export request log":"导出请求日志","Before clearing history":"清除历史记录前","Crash recovery":"崩溃恢复","Website permissions":"网站权限","Local-only mode":"仅本地模式","Export local data":"导出本地数据","Purge local data":"清除本地数据","Check for updates":"检查更新","Export":"导出","Export history":"导出历史记录","Purge":"清除","Reset all settings":"重置所有设置","Reset all":"全部重置","Warning":"警告","Where to, today?":"今天去哪？","Good morning. Where to?":"早上好。去哪？","Morning. What are we finding today?":"早上好。今天找点什么？","Rise and search.":"起来搜索吧。","Good afternoon. Where to?":"下午好。去哪？","Afternoon. What's next?":"下午好。接下来做什么？","Where to, this afternoon?":"今天下午去哪？","Good evening. Where to?":"晚上好。去哪？","Evening. What can we find?":"晚上好。能找到什么？","Where to, tonight?":"今晚去哪？","Still up? Where to?":"还没睡？去哪？","Good night, one more search?":"晚安，再搜索一次？","Quiet hours. Where to?":"安静时间。去哪？","Downloaded":"已下载","Cancelled":"已取消","Download complete":"下载完成","Download cancelled":"下载已取消","Search":"搜索","No bookmarks yet, tap the star in the address bar to save a page.":"还没有书签。点击地址栏中的星标即可保存页面。"}};
const MURKY_CRITICAL_BUILTINS = {
  tr: {
    "The only official Murky websites are ": "Murky'nin resmi web siteleri yalnızca ",
    ". Be careful with websites claiming to be Murky.": ". Murky olduğunu iddia eden web sitelerine dikkat edin.",
    "Warning": "Uyarı",
    "Where to, today?": "Bugün nereye?",
    "Good morning. Where to?": "Günaydın. Nereye?",
    "Morning. What are we finding today?": "Günaydın. Bugün ne arıyoruz?",
    "Rise and search.": "Uyan ve ara.",
    "Good afternoon. Where to?": "İyi günler. Nereye?",
    "Afternoon. What's next?": "İyi günler. Sırada ne var?",
    "Where to, this afternoon?": "Bu öğleden sonra nereye?",
    "Good evening. Where to?": "İyi akşamlar. Nereye?",
    "Evening. What can we find?": "İyi akşamlar. Ne bulabiliriz?",
    "Where to, tonight?": "Bu gece nereye?",
    "Still up? Where to?": "Hâlâ ayakta mısın? Nereye?",
    "Good night, one more search?": "İyi geceler, bir arama daha mı?",
    "Quiet hours. Where to?": "Sessiz saatler. Nereye?"
  }
};

function murkyCriticalBuiltIn(target,text){ const m=MURKY_CRITICAL_BUILTINS[String(target||"en").toLowerCase().split(/[-_]/)[0]]; return m&&Object.prototype.hasOwnProperty.call(m,text)?m[text]:null; }

function murkyBuiltIn(target,text){ const m=MURKY_BUILTINS[String(target||"en").toLowerCase().split(/[-_]/)[0]]; return m&&Object.prototype.hasOwnProperty.call(m,text)?m[text]:null; }
  let murkyUiLanguage = "en";
  let murkyUiTranslationRun = 0;
  async function translateMurkyUi(){
    const settings=await window.murky.getSettings();
    const target=settings.preferredLanguages?.[0] || "en";
    const run=++murkyUiTranslationRun;
     
     
     
    const restoreWalker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let restoreNode;
    while(restoreNode=restoreWalker.nextNode()){
      if(restoreNode.__murkyOriginalText!=null) restoreNode.nodeValue=restoreNode.__murkyOriginalText;
    }
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const nodes=[]; let n;
    while(n=walker.nextNode()){
      const p=n.parentElement;
      if(!p||/^(SCRIPT|STYLE|NOSCRIPT|INPUT|TEXTAREA|OPTION)$/i.test(p.tagName)) continue;
      if(p.closest?.('.tab,.address-wrap,.language-list,.language-menu,.language-picker,.side-item .side-title,.side-item .side-url,#greeting,.about-warning,[data-murky-no-translate],[data-murky-built-in]')) continue;
      const raw=n.__murkyOriginalText ?? n.nodeValue ?? "";
      if(n.__murkyOriginalText==null) n.__murkyOriginalText=raw;
      if(raw.trim().length>1) nodes.push({n,raw});
    }
     
     
    nodes.forEach(x=>{if(x.n.__murkyOriginalText!=null)x.n.nodeValue=x.n.__murkyOriginalText;});
    if(target==="en"){ applyBuiltInChromeUi(target); murkyUiLanguage=target; return; }
    const groups=[]; const byParent=new Map();
    for(const item of nodes){ const parent=item.n.parentElement; if(!byParent.has(parent)) byParent.set(parent,[]); byParent.get(parent).push(item); }
    for(const items of byParent.values()){ const text=items.map(x=>x.raw.trim()).filter(Boolean).join(" "); if(text) groups.push({items,text}); }
    const sourceTexts=groups.map(x=>x.text);
    let translated=await window.murky.translateText(sourceTexts);
    if(run!==murkyUiTranslationRun) return;
    groups.forEach((g,i)=>{ const value=translated?.[i]; if(!value)return; const first=g.items[0]; const raw=first.raw; const lead=(raw.match(/^\s*/)||[''])[0],tail=(raw.match(/\s*$/)||[''])[0]; first.n.nodeValue=lead+String(value).trim()+tail; for(let j=1;j<g.items.length;j++) g.items[j].nodeValue=""; });
    applyBuiltInChromeUi(target);
    murkyUiLanguage=target;
  }

  function applyBuiltInWarning(target){
    const root=document.body;
    root.querySelectorAll('.about-warning').forEach(box=>{
      const title=box.querySelector('.about-warning-title');
      const text=box.querySelector('.about-warning-text');
      if(title){
        title.textContent = murkyBuiltIn(target,'Warning') ?? 'Warning';
      }
      if(!text) return;
      const prefix=text.querySelector('[data-murky-local="warning-prefix"]');
      const suffix=text.querySelector('[data-murky-local="warning-suffix"]');
      const urls=Array.from(text.querySelectorAll('a[data-murky-protected="url"]'));
       
       
      const p=prefix ? murkyBuiltIn(target,'The only official Murky websites are') : null;
      const q=suffix ? murkyBuiltIn(target,'. Be careful with websites claiming to be Murky.') : null;
      if(prefix && p!=null) prefix.textContent=String(p).trimEnd()+' ';
      if(suffix && q!=null) suffix.textContent=q;
      urls.forEach(a=>{
        const href=a.getAttribute('data-external') || a.getAttribute('href') || '';
        try {
          const u=new URL(href);
          a.textContent=u.hostname + (u.pathname==='/'?'':u.pathname);
        } catch { a.textContent=a.getAttribute('data-murky-original-url-text') || a.textContent; }
      });
       
      const spans=Array.from(text.children);
      spans.forEach(el=>{ if(el.tagName==='SPAN' && !el.hasAttribute('data-murky-local')) el.textContent=' '+(murkyBuiltIn(target,'and')||'and')+' '; });
    });
  }

  function applyBuiltInChromeUi(target){
    const root=document.body;
    root.querySelectorAll('[data-murky-built-in]').forEach(el=>{
      const original=el.getAttribute('data-murky-original') ?? el.textContent ?? '';
      if(!el.hasAttribute('data-murky-original')) el.setAttribute('data-murky-original',original);
      const value=murkyBuiltIn(target,original);
      if(value!=null) el.textContent=value; else if(target==='en') el.textContent=original;
    });
    root.querySelectorAll('[data-murky-local]').forEach(el=>{
      const original=el.getAttribute('data-murky-original') ?? el.textContent ?? '';
      if(!el.hasAttribute('data-murky-original')) el.setAttribute('data-murky-original',original);
      const value=murkyCriticalBuiltIn(target,original);
      if(value!=null) el.textContent=value; else if(target==='en') el.textContent=original;
    });
    root.querySelectorAll('.about-warning-title').forEach(el=>{
      const original=el.getAttribute('data-murky-original') ?? el.textContent ?? '';
      if(!el.hasAttribute('data-murky-original')) el.setAttribute('data-murky-original',original);
      const value=murkyCriticalBuiltIn(target,original);
      if(value!=null) el.textContent=value; else if(target==='en') el.textContent=original;
    });
    const greeting=root.querySelector('#greeting');
    if(greeting){
      const original=greeting.getAttribute('data-murky-original') ?? greeting.textContent ?? '';
      if(!greeting.hasAttribute('data-murky-original')) greeting.setAttribute('data-murky-original',original);
      const value=murkyCriticalBuiltIn(target,original);
      if(value!=null) greeting.textContent=value; else if(target==='en') greeting.textContent=original;
    }
    applyBuiltInWarning(target);
    const map=[['#panel-bookmarks .flyout-head span','Bookmarks'],['#panel-history .flyout-head span','Recent Activity'],['#panel-downloads .flyout-head span','Downloads'],['#bookmarksEmpty','No bookmarks yet, tap the star in the address bar to save a page.']];
    for(const [sel,key] of map){ root.querySelectorAll(sel).forEach(el=>{ const v=murkyBuiltIn(target,key); if(v!=null) el.textContent=v; }); }
  }

  window.murky.onSettingsUpdate((s) => { applySettings(s); });
  window.murky.onToolbarPreviewScale?.((scale) => applyToolbarScale(scale));

  window.murky.onDownloadsUpdate((dl) => {
    const badge = $("#downloadsBadge");
    badge.hidden = false;
    renderDownloadEntry(dl);
    showDownloadToast(dl);
    if (dl.state === "completed") setTimeout(() => (badge.hidden = true), 4000);
  });

  window.murky.onFocusAddress(() => {
    addressInput.focus();
    addressInput.select();
  });

  window.murky.onToggleSidebar(() => toggleSidebarVisibility());

   
  $("#addressPill").addEventListener("mousedown", (e) => {
    if (e.target.closest("#starBtn") || e.target.closest("#siteSlot")) return;
    if (document.activeElement !== addressInput) addressInput.focus();
  });

  addressInput.addEventListener("focus", () => {
    addressFocused = true;
  });
  addressInput.addEventListener("blur", () => {
    addressFocused = false;
    addressInput.value = isInternalUrl(currentUrl) ? "" : currentUrl;
  });
  addressInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const value = addressInput.value.trim();
      const active = tabsState.find((t) => t.isActive);
      if (active && value && window.murky?.go) {
        window.murky.addSearch?.(value).catch(() => {});
        window.murky.go(active.id, value);
      }
      addressInput.blur();
    } else if (e.key === "Escape") {
      addressInput.value = isInternalUrl(currentUrl) ? "" : (currentUrl || "");
      addressInput.blur();
    }
  });

  $("#navBack").addEventListener("click", () => activeTabId && window.murky.back(activeTabId));
  $("#navForward").addEventListener("click", () => activeTabId && window.murky.forward(activeTabId));
  $("#navReload").addEventListener("click", () => activeTabId && window.murky.reload(activeTabId));
  $("#navHome").addEventListener("click", () => {
    if (activeTabId) window.murky.go(activeTabId, "murky://newtab");
  });
  {
    const newTabBtn = $("#newTabBtn");
    let creatingNewTab = false;
    async function handleNewTabRequest() {
      if (creatingNewTab) return;
      if (!window.murky?.createTab) return;
      creatingNewTab = true;
      try {
        await window.murky.createTab("murky://newtab");
      } catch (err) {
        console.error("[murky] failed to create new tab:", err);
      } finally {
        creatingNewTab = false;
      }
    }
    newTabBtn?.addEventListener("click", handleNewTabRequest);
  }

   
  function updateStarState() {
    const isBookmarked = currentBookmarks.some((b) => b.url === currentUrl);
    starBtn.classList.toggle("active", isBookmarked);
  }

  const siteInfoBtn = $("#siteInfoBtn");
  const siteMurkyIcon = $("#siteMurkyIcon");
  let siteInfoIsOpen = false;

  function refreshSiteIndicator() {
    const active = tabsState.find((t) => t.isActive);
    const url = (active && active.url) || currentUrl || "";
    const isMurky = !url || isInternalUrl(url);
    const isWeb = /^https?:\/\//i.test(url);
    siteMurkyIcon.hidden = !isMurky;
    siteInfoBtn.hidden = !isWeb;
    if (!isWeb && siteInfoIsOpen) window.murky.closeSiteInfo();
  }

  siteInfoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const r = siteInfoBtn.getBoundingClientRect();
    window.murky.toggleSiteInfo({ x: Math.round(r.left - 6), y: Math.round(r.bottom + 6) });
  });
  window.murky.onSiteInfoState(({ open }) => {
    siteInfoIsOpen = !!open;
    siteInfoBtn.classList.toggle("active", siteInfoIsOpen);
  });
  document.addEventListener("mousedown", (e) => {
    if (!siteInfoIsOpen || e.target.closest("#siteInfoBtn")) return;
    window.murky.closeSiteInfo();
  }, true);

  starBtn.addEventListener("click", async () => {
    if (!currentUrl || isInternalUrl(currentUrl)) return;
    const active = tabsState.find((t) => t.isActive);
    const isBookmarked = currentBookmarks.some((b) => b.url === currentUrl);
    if (isBookmarked) {
      const existing = currentBookmarks.find((b) => b.url === currentUrl);
      currentBookmarks = await window.murky.removeBookmark(existing.id);
    } else {
      currentBookmarks = await window.murky.addBookmark({
        title: active?.title || currentUrl,
        url: currentUrl,
        favicon: active?.favicon || null,
      });
    }
    renderBookmarks();
    applyBuiltInChromeUi(window.__murkySettings?.preferredLanguages?.[0] || "en");
    updateStarState();
  });

  function renderBookmarks() {
    const list = $("#bookmarksList");
    list.innerHTML = "";
    $("#bookmarksEmpty").style.display = currentBookmarks.length ? "none" : "block";
    for (const bm of currentBookmarks) {
      const li = document.createElement("li");
      li.className = "side-item";
      li.innerHTML = `
        <div class="side-fav">${bm.favicon ? `<img src="${bm.favicon}">` : ""}</div>
        <div class="side-text">
          <div class="side-title">${escapeHtml(bm.title || bm.url)}</div>
          <div class="side-url">${escapeHtml(bm.url)}</div>
        </div>
        <div class="side-remove" title="Remove">
          ${lucide.svg("x", { width: "13", height: "13" })}
        </div>`;
      li.addEventListener("click", (e) => {
        if (e.target.closest(".side-remove")) return;
        if (activeTabId) window.murky.go(activeTabId, bm.url);
      });
      li.querySelector(".side-remove").addEventListener("click", async (e) => {
        e.stopPropagation();
        currentBookmarks = await window.murky.removeBookmark(bm.id);
        renderBookmarks();
        updateStarState();
      });
      list.appendChild(li);
    }
    applyBuiltInChromeUi(window.__murkySettings?.preferredLanguages?.[0] || "en");
  }

  async function renderHistory() {
    const history = await window.murky.listHistory();
    const list = $("#historyList");
    list.innerHTML = "";
    $("#historyEmpty").style.display = history.length ? "none" : "block";
    const murkyLogo = new URL("../assets/logo_light.png", window.location.href).href;

    for (const h of history.slice(0, 200)) {
      const li = document.createElement("li");
      li.className = "side-item";
      const isSearch = h.type === "search";
      const iconSrc = isSearch ? murkyLogo : (h.favicon || murkyLogo);
      const iconAlt = isSearch ? "Murky" : "";
      li.innerHTML = `
        <div class="side-fav"><img src="${escapeHtml(iconSrc)}" alt="${iconAlt}" /></div>
        <div class="side-text">
          <div class="side-title">${escapeHtml(isSearch ? h.query : (h.title || h.url))}</div>
          <div class="side-url">${escapeHtml(isSearch ? "Search" : h.url)}</div>
        </div>`;

      const img = li.querySelector(".side-fav img");
      img.addEventListener("error", () => {
        if (img.src !== murkyLogo) img.src = murkyLogo;
      }, { once: true });

      li.addEventListener("click", () => {
        if (!activeTabId) return;
        const value = isSearch ? h.query : h.url;
        window.murky.go(activeTabId, value);
      });
      list.appendChild(li);
    }
    applyBuiltInChromeUi(window.__murkySettings?.preferredLanguages?.[0] || "en");
  }

  $("#clearHistoryBtn").addEventListener("click", async () => {
    await window.murky.clearHistory();
    renderHistory();
  });

  const downloadRecords = new Map();

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "Calculating time…";
    if (seconds < 60) return `${Math.ceil(seconds)}s left`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${mins}m ${secs}s left`;
  }

  function renderDownloadEntry(dl) {
    downloadRecords.set(dl.id, dl);
    const list = $("#downloadsList");
    $("#downloadsEmpty").style.display = "none";

    let li = list.querySelector(`[data-dl="${dl.id}"]`);
    if (!li) {
      li = document.createElement("li");
      li.className = "download-entry side-item";
      li.dataset.dl = dl.id;
      list.prepend(li);
    }

    const pct = dl.totalBytes ? Math.min(100, Math.round((dl.receivedBytes / dl.totalBytes) * 100)) : 0;
    const done = dl.state === "completed";
    const cancelled = dl.state === "cancelled" || dl.state === "interrupted";
    const statusText = done ? "Downloaded" : cancelled ? "Cancelled" : `${pct}% · ${formatTime(dl.remainingSeconds)}`;

    li.innerHTML = `
      <div class="side-fav download-file-icon">
        ${lucide.svg("file")}
      </div>
      <div class="side-text download-entry-text">
        <div class="side-title">${escapeHtml(dl.filename)}</div>
        <div class="side-url">${escapeHtml(statusText)}</div>
        ${!done && !cancelled ? `<div class="download-progress"><div style="width:${pct}%"></div></div>` : ""}
      </div>
      ${!done && !cancelled ? `<button class="download-cancel" title="Cancel">×</button>` : ""}
    `;

    const cancel = li.querySelector(".download-cancel");
    if (cancel) {
      cancel.onclick = async (e) => {
        e.stopPropagation();
        await window.murky.cancelDownload(dl.id);
      };
    }

    li.onclick = async () => {
      const current = downloadRecords.get(dl.id) || dl;
      if (current.state === "progressing" || current.state === "paused") {
        await window.murky.scheduleDownloadOpen(current.id);
      } else if (current.state === "completed" && current.savePath) {
        await window.murky.openDownloadPath(current.savePath);
      }
    };
  }

   
  const downloadsPopup = $("#downloadsPopup");
  function showDownloadToast(dl) {
    let toast = downloadsPopup.querySelector(`[data-dl="${dl.id}"]`);
    const pct = dl.totalBytes ? Math.round((dl.receivedBytes / dl.totalBytes) * 100) : 0;
    const done = dl.state === "completed";
    const cancelled = dl.state === "cancelled" || dl.state === "interrupted";
    const statusText = done ? "Download complete" : cancelled ? "Download cancelled" : `Downloading ${pct}%`;

    if (!toast) {
      toast = document.createElement("div");
      toast.className = "download-toast";
      toast.dataset.dl = dl.id;
      toast.innerHTML = `
        <div class="download-toast-icon">
          ${lucide.svg("download")}
        </div>
        <div class="download-toast-text">
          <div class="download-toast-name"></div>
          <div class="download-toast-status"></div>
          <div class="download-toast-bar"><div class="download-toast-bar-fill"></div></div>
        </div>`;
      downloadsPopup.prepend(toast);
    }
    toast.classList.toggle("done", done);
    toast.querySelector(".download-toast-name").textContent = dl.filename;
    toast.querySelector(".download-toast-status").textContent = statusText;
    toast.querySelector(".download-toast-bar-fill").style.width = `${done ? 100 : pct}%`;

    applyBuiltInChromeUi(window.__murkySettings?.preferredLanguages?.[0] || "en");
    if (done || cancelled) {
      setTimeout(() => {
        toast.classList.add("leaving");
        setTimeout(() => toast.remove(), 250);
      }, 4000);
    }
  }

   
  const sidebarRail = $("#sidebarRail");
  const sidebarFlyout = $("#sidebarFlyout");
  let openFlyoutPanel = null;

  function openFlyout(panel) {
    openFlyoutPanel = panel;
    document.body.classList.toggle("downloads-flyout-open", panel === "downloads");
    document.body.classList.toggle("bookmarks-flyout-open", panel === "bookmarks");
    document.body.classList.toggle("history-flyout-open", panel === "history");
    sidebarFlyout.hidden = false;
    $$(".rail-btn[data-panel]").forEach((b) => b.classList.toggle("active", b.dataset.panel === panel));
    $$(".flyout-panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${panel}`));
    window.murky.setSidebarFlyout(true);
    if (panel === "history") renderHistory();
  }

  function closeFlyout() {
    openFlyoutPanel = null;
    document.body.classList.remove("downloads-flyout-open");
    sidebarFlyout.hidden = true;
    $$(".rail-btn[data-panel]").forEach((b) => b.classList.remove("active"));
    window.murky.setSidebarFlyout(false);
  }

  $$(".rail-btn[data-panel]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const panel = btn.dataset.panel;
      if (openFlyoutPanel === panel) closeFlyout();
      else openFlyout(panel);
    });
  });

  document.addEventListener("click", (e) => {
    if (!openFlyoutPanel) return;
    if (sidebarFlyout.contains(e.target) || sidebarRail.contains(e.target)) return;
    closeFlyout();
  });

   
   
   
  window.murky.onOpenSidebarPanel?.((panel) => {
    if (["downloads", "bookmarks", "history"].includes(panel)) openFlyout(panel);
  });

  $("#downloadsBtn").addEventListener("click", (e) => {
     
     
     
     
     
    e.stopPropagation();
    if (openFlyoutPanel === "downloads") closeFlyout();
    else openFlyout("downloads");
  });

  $("#railSettingsBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    window.murky.openSettingsTab();
  });

  function toggleSidebarVisibility() {
    updateSettings({ showSidebar: document.body.classList.contains("sidebar-hidden") });
  }
  $("#sidebarToggle").addEventListener("click", toggleSidebarVisibility);
   
   
   
  function openExtensionsMenuAt(anchorEl) {
    const r = anchorEl.getBoundingClientRect();
    window.murky.openExtensionsMenu({ x: Math.round(r.left), y: Math.round(r.bottom + 4) });
  }
  $("#extensionsBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    openExtensionsMenuAt($("#extensionsBtn"));
  });

   
  $("#winMin").addEventListener("click", () => window.murky.minimize());
  $("#winMax").addEventListener("click", () => window.murky.toggleMaximize());
  $("#winClose").addEventListener("click", () => window.murky.closeWindow());

   
  function openAppMenuAt(anchorEl) {
    const r = anchorEl.getBoundingClientRect();
    window.murky.openAppMenu({ x: Math.round(r.left), y: Math.round(r.bottom + 4) });
  }
  function openMurkyMenuAt(anchorEl) {
    const r = anchorEl.getBoundingClientRect();
    window.murky.openMurkyMenu({ x: Math.round(r.left), y: Math.round(r.bottom + 4) });
  }
  $("#menuBtn").addEventListener("click", () => openAppMenuAt($("#menuBtn")));
  $("#brandMenuBtn").addEventListener("click", () => openMurkyMenuAt($("#brandMenuBtn")));

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

   
  (async () => {
    const settings = await window.murky.getSettings();
    applySettings(settings);
    currentBookmarks = await window.murky.listBookmarks();
    renderBookmarks();
    const tabs = await window.murky.listTabs();
    tabsState = tabs;
    renderTabs();
    updateNavButtons();
    refreshSiteIndicator();
    setTimeout(()=>translateMurkyUi(),120);
  })();
})();
