(() => {
  const $ = (s) => document.querySelector(s);
  const stage = $("#stage"), dots = $("#dots"), actions = $("#actions");
  let view = "onboarding";

  const THEMES = {
    "murky-deep": ["Murky Deep", "#0A1412", "#10201D", "#E3A857"],
    "murky-tide": ["Tide Pool", "#081A1E", "#0E323B", "#6FCF97"],
    "murky-ink": ["Ink Well", "#0B0B10", "#1B1B24", "#8E8CD8"],
    "midnight-amber": ["Midnight Amber", "#120A05", "#241207", "#F2A65A"],
    "murky-storm": ["Storm Front", "#0A0E14", "#151E2A", "#7EA8D8"],
    "murky-moss": ["Moss", "#0B120A", "#182417", "#9BC46B"],
    "murky-rose": ["Rose", "#150A0F", "#2A121C", "#E38FA6"],
    "murky-slate": ["Slate", "#0E1012", "#1C2024", "#B7BEC7"],
  };

  const LEGAL = {
    terms: {
      title: "Terms of Service",
      sections: [
        ["Using Murky", "Murky is browser software provided for general web browsing and related productivity features. You are responsible for your use of the browser and for the content you access through it."],
        ["Third-party websites and services", "Murky can access websites, search engines, downloads, and other third-party services. Those services have their own terms, policies, and requirements. Your use of them is governed by their respective terms."],
        ["Responsible use", "You must not use Murky to violate applicable law, interfere with networks or services, distribute malware, infringe intellectual property rights, or attempt to gain unauthorized access to systems or accounts."],
        ["Software changes", "Murky may be updated, modified, or discontinued. Features may change over time, including privacy controls, supported websites, and browser functionality."],
        ["Downloads and content", "You are responsible for deciding which files and content to download or open. Murky does not guarantee that third-party content is safe, accurate, available, or free of harmful material."],
        ["No warranty", "Murky is provided on an as available basis to the maximum extent permitted by law. We do not promise that the browser will always be uninterrupted, error-free, or compatible with every website or device."],
        ["Limitation of liability", "To the maximum extent permitted by applicable law, the Murky project and its contributors are not responsible for indirect, incidental, special, or consequential losses arising from your use of the software or third-party websites."],
        ["Changes to these terms", "These terms may be updated as the software evolves. Continuing to use a newer version of Murky after an update means you accept the revised terms to the extent permitted by law."],
        ["Acceptance", "If you do not agree with these terms, do not use Murky. If local law requires a different treatment of any provision, that provision will apply only to the extent permitted by law."]
      ]
    },
    privacy: {
      title: "Privacy Policy",
      sections: [
        ["Information stored locally", "Murky may store settings, bookmarks, browsing history, recent searches, session information, and download preferences in your device's local application data. These records are used to provide browser features and are not intentionally uploaded to Murky servers."],
        ["Websites you visit", "When you browse the web, your requests go to the websites and services you choose to visit. Those websites may collect information according to their own privacy policies. Murky does not control the privacy practices of third-party websites."],
        ["Search and voice features", "Your selected search engine receives searches when you submit them. Murky's voice-search feature processes supported speech locally on your device when its local speech model is available. Network services used by a website you visit remain subject to that website's policies."],
        ["Blocking and Do Not Track", "Murky can block requests to a built-in list of known advertising and tracking domains. You can also enable Do Not Track requests. Blocking is best-effort and does not guarantee that every advertisement or tracker will be prevented."],
        ["Downloads", "Files you download are saved according to your browser settings and your operating system. Murky does not inspect the contents of downloaded files for advertising or analytics purposes."],
        ["Security", "Murky uses Chromium's web isolation features for regular websites. No software can guarantee absolute security, so keep Murky and your operating system updated and use care when visiting unfamiliar sites or downloading files."],
        ["Changes", "We may update this policy when Murky's features or data practices change."],
        ["Contact", "For privacy questions about a particular Murky distribution, use the support or contact channel provided with that distribution."]
      ]
    }
  };

  let step = 0;
  let direction = "left";
  let accepted = false;
  let selectedTheme = null;
  let selectedLanguage = "en";
  let supportedLanguages = [];

  let themeAnimationFrame = 0;
  let hasRenderedSettings = false;

  const STEP_MIGRATE = 4, STEP_DEFAULT = 5, STEP_DONE = 6;
  let migSource = null;
  let migState = "idle";
  let migPct = 0, migPhase = "prepare", migSummary = null;
  let skipEnterAnim = false;
  const MIG_STRINGS = [
    "Migrate Data From Another Browser?", "Looking for your browser…",
    "Bring your bookmarks, search history and cookies over from {name} so you can pick up right where you left off.",
    "We couldn't find another browser's data on this computer, so there's nothing to migrate.",
    "Preparing…", "Importing bookmarks…", "Importing history…", "Importing cookies…", "Finishing up…",
    "Migration complete", "Here's what came over from {name}:", "Migration didn't finish", "Something went wrong while reading {name}'s data. You can try again or skip this step.",
    "bookmarks", "history entries", "searches", "cookies", "Nothing new was found to import.",
    "Some data couldn't be read because {name} is open. Close it and try again to import the rest.",
    "{n} cookies are protected by {name} and couldn't be imported.",
    "Back", "Skip", "Migrate", "Migrating…", "Try again", "Next",
  ];
  let migStrings = {}, migStringsLang = "";
  async function loadMigStrings() {
    const lang = selectedLanguage || "en";
    if (migStringsLang === lang) return;
    migStringsLang = lang; migStrings = {};
    if (lang === "en") return;
    try {
      const out = await window.murkyOnboarding.translateText(MIG_STRINGS);
      MIG_STRINGS.forEach((k, i) => { if (out && out[i]) migStrings[k] = String(out[i]); });
    } catch {}
  }
  const mt = (k, vars) => {
    let out = migStrings[k] || k;
    if (vars) for (const [a, b] of Object.entries(vars)) out = out.split("{" + a + "}").join(b);
    return out;
  };
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function hexToRgb(hex) {
    const m = /^#?([\da-f]{6})$/i.exec(hex || "");
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

   
  let settingsThemeAnimationFrame = 0;
  function hexRgb(hex) {
    const n = parseInt((hex || "").replace("#", ""), 16);
    return Number.isFinite(n) ? { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 } : null;
  }
  function hexColor(rgb) {
    const h = (n) => Math.round(n).toString(16).padStart(2, "0");
    return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`;
  }
  let themeTarget = null;
  function animateSettingsTheme(from, to, duration = 460) {
    cancelAnimationFrame(settingsThemeAnimationFrame);
    const start = { background: hexRgb(from.background), surface: hexRgb(from.surface), accent: hexRgb(from.accent) };
    const end = { background: hexRgb(to.background), surface: hexRgb(to.surface), accent: hexRgb(to.accent) };
    const root = document.documentElement;
    if (Object.values(start).some((v) => !v) || Object.values(end).some((v) => !v)) {
      root.style.setProperty("--bg", to.background); root.style.setProperty("--surface", to.surface); root.style.setProperty("--accent", to.accent);
      return;
    }
    themeTarget = `${to.background}|${to.surface}|${to.accent}`;
    const started = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const frame = (now) => {
      const t = Math.min(1, (now - started) / duration), e = ease(t);
      for (const key of ["background", "surface", "accent"]) {
        const a = start[key], b = end[key];
        root.style.setProperty(`--${key === "background" ? "bg" : key}`, hexColor({
          r: a.r + (b.r - a.r) * e,
          g: a.g + (b.g - a.g) * e,
          b: a.b + (b.b - a.b) * e,
        }));
      }
      if (t < 1) settingsThemeAnimationFrame = requestAnimationFrame(frame);
    };
    settingsThemeAnimationFrame = requestAnimationFrame(frame);
  }

  function applySettings(s, animate = true) {
    if (!s) return;
    const root = document.documentElement;
    const current = {
      background: root.style.getPropertyValue("--bg") || s.background || "#0A1412",
      surface: root.style.getPropertyValue("--surface") || s.surface || "#10201D",
      accent: root.style.getPropertyValue("--accent") || s.accent || "#E3A857",
    };
    const next = {
      background: s.background || current.background,
      surface: s.surface || current.surface,
      accent: s.accent || current.accent,
    };
    const key = `${next.background}|${next.surface}|${next.accent}`;
    if (animate && hasRenderedSettings) { if (key !== themeTarget) animateSettingsTheme(current, next); }
    else {
      cancelAnimationFrame(settingsThemeAnimationFrame); themeTarget = key;
      root.style.setProperty("--bg", next.background);
      root.style.setProperty("--surface", next.surface);
      root.style.setProperty("--accent", next.accent);
    }
    if (s.theme) selectedTheme = s.theme;
    hasRenderedSettings = true;
  }

  function renderLanguageStep(el) {
    const wrap = document.createElement("div"); wrap.className = "language-onboarding";
    wrap.innerHTML = `<div class="language-picker" id="languagePicker"><input id="languageInput" type="text" autocomplete="off" spellcheck="false" placeholder="Search languages"><div class="language-menu" id="languageMenu" data-murky-no-translate hidden></div></div>`;
    const picker = wrap.querySelector("#languagePicker"), input = wrap.querySelector("#languageInput"), menu = wrap.querySelector("#languageMenu");
    const nameOf = (code) => (supportedLanguages.find((x) => x.code === code) || {}).name || "";
    let typed = false;
    input.value = nameOf(selectedLanguage);

    function renderMenu() {
      const q = typed ? input.value.trim().toLocaleLowerCase() : "";
      const list = supportedLanguages.filter((x) => !q || x.name.toLocaleLowerCase().includes(q) || x.code.toLowerCase().includes(q));
      menu.innerHTML = list.length
        ? list.map((x) => `<button type="button" class="murky-select-option${x.code === selectedLanguage ? " selected" : ""}" data-code="${x.code}">${x.name}</button>`).join("")
        : `<div class="language-empty">No languages found</div>`;
      menu.querySelectorAll(".murky-select-option").forEach((b) => b.addEventListener("click", async () => {
        selectedLanguage = b.dataset.code; typed = false; input.value = nameOf(selectedLanguage);
        closeMenu(); input.blur();
        await window.murkyOnboarding.setLanguage(selectedLanguage);
        renderActions();
      }));
      const sel = menu.querySelector(".selected"); if (sel) sel.scrollIntoView({ block: "nearest" });
    }
    function openMenu() { typed = false; renderMenu(); picker.classList.add("open"); menu.hidden = false; stage.classList.add("lang"); }
    function closeMenu() { picker.classList.remove("open"); menu.hidden = true; typed = false; input.value = nameOf(selectedLanguage); }
    input.addEventListener("focus", () => { openMenu(); input.select(); });
    input.addEventListener("click", () => { if (menu.hidden) openMenu(); });
    input.addEventListener("input", () => { typed = true; picker.classList.add("open"); menu.hidden = false; renderMenu(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeMenu(); input.blur(); }
      if (e.key === "Enter") { const first = menu.querySelector(".murky-select-option"); if (first) first.click(); }
    });
    document.addEventListener("pointerdown", (e) => { if (!picker.isConnected) return; if (!e.target.closest("#languagePicker")) closeMenu(); });
    el.appendChild(wrap);
  }

  async function translateOnboardingUi(){
    const target=selectedLanguage||"en"; if(target==="en") return;
    const nodes=[];
    for(const root of [stage,actions]){ const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT); let n; while(n=walker.nextNode()){const p=n.parentElement;if(!p||/^(SCRIPT|STYLE|NOSCRIPT|OPTION)$/i.test(p.tagName)||p.closest("[data-no-translate],[data-murky-no-translate]"))continue;const t=n.nodeValue.trim();if(t.length>1)nodes.push({n,t,lead:n.nodeValue.match(/^\s*/)[0],trail:n.nodeValue.match(/\s*$/)[0]});} }
    const translated=await window.murkyOnboarding.translateText(nodes.map(x=>x.t)); nodes.forEach((x,i)=>{if(translated?.[i])x.n.nodeValue=x.lead+String(translated[i]).trim()+x.trail;});
  }

  function migrateCopy() {
    const name = migSource && migSource.available ? migSource.name : "";
    if (migState === "done") return [mt("Migration complete"), mt("Here's what came over from {name}:", { name: `<span data-no-translate>${esc(name)}</span>` })];
    if (migState === "failed") return [mt("Migration didn't finish"), mt("Something went wrong while reading {name}'s data. You can try again or skip this step.", { name: `<span data-no-translate>${esc(name)}</span>` })];
    if (migSource === null) return ["Migrate Data From Another Browser?", "Looking for your browser…"];
    if (!migSource.available) return ["Migrate Data From Another Browser?", "We couldn't find another browser's data on this computer, so there's nothing to migrate."];
    return [`Migrate Data From <span data-no-translate>${esc(name)}</span>?`, `Bring your bookmarks, search history and cookies over from <span data-no-translate>${esc(name)}</span> so you can pick up right where you left off.`];
  }

  const MIG_PHASE_TEXT = { prepare: "Preparing…", bookmarks: "Importing bookmarks…", history: "Importing history…", cookies: "Importing cookies…", done: "Finishing up…" };
  function renderMigrateBody(el) {
    if (migState === "running") {
      const box = document.createElement("div");
      box.className = "mig";
      box.innerHTML = `<div class="mig-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${migPct}"><div class="mig-fill" style="width:${migPct}%"></div></div><div class="mig-meta"><span class="mig-text" data-no-translate>${esc(mt(MIG_PHASE_TEXT[migPhase] || MIG_PHASE_TEXT.prepare))}</span><span class="mig-pct" data-no-translate>${migPct}%</span></div>`;
      el.appendChild(box);
    } else if (migState === "done" && migSummary) {
      const sm = migSummary, name = migSource ? migSource.name : "";
      const rows = [[sm.bookmarks, "bookmarks"], [sm.history, "history entries"], [sm.searches, "searches"], [sm.cookies, "cookies"]].filter(([n]) => n > 0);
      const box = document.createElement("div");
      box.className = "mig-result";
      box.setAttribute("data-no-translate", "");
      let html = rows.length ? `<div class="mig-chips">${rows.map(([n, k]) => `<span class="mig-chip"><b>${Number(n).toLocaleString()}</b> ${esc(mt(k))}</span>`).join("")}</div>` : `<p>${esc(mt("Nothing new was found to import."))}</p>`;
      if (sm.locked && sm.locked.length) html += `<p class="mig-note">${esc(mt("Some data couldn't be read because {name} is open. Close it and try again to import the rest.", { name }))}</p>`;
      if (sm.undecryptableCookies > 0) html += `<p class="mig-note">${esc(mt("{n} cookies are protected by {name} and couldn't be imported.", { n: sm.undecryptableCookies.toLocaleString(), name }))}</p>`;
      box.innerHTML = html;
      el.appendChild(box);
    }
  }
  function updateMigProgress() {
    const bar = stage.querySelector(".mig-bar"); if (!bar) return;
    bar.setAttribute("aria-valuenow", String(migPct));
    const fill = bar.querySelector(".mig-fill"); if (fill) fill.style.width = migPct + "%";
    const t = stage.querySelector(".mig-text"); if (t) t.textContent = mt(MIG_PHASE_TEXT[migPhase] || MIG_PHASE_TEXT.prepare);
    const pc = stage.querySelector(".mig-pct"); if (pc) pc.textContent = migPct + "%";
  }
  async function startMigration() {
    if (!migSource || !migSource.available || migState === "running") return;
    migState = "running"; migPct = 0; migPhase = "prepare"; migSummary = null;
    skipEnterAnim = true; render();
    await loadMigStrings();
    updateMigProgress();
    const off = window.murkyOnboarding.onMigrateProgress((p) => {
      migPct = Math.max(migPct, Math.min(100, Number(p.percent) || 0));
      migPhase = p.phase || migPhase;
      updateMigProgress();
    });
    let res;
    try { res = await window.murkyOnboarding.migrate(migSource.id); } catch { res = { ok: false }; }
    try { if (typeof off === "function") off(); } catch {}
    migSummary = res || { ok: false };
    if (migSummary.ok) { migPct = 100; migPhase = "done"; updateMigProgress(); await sleep(450); }
    migState = migSummary.ok ? "done" : "failed";
    if (step === STEP_MIGRATE && view === "onboarding") { skipEnterAnim = true; render(); }
  }
  function refreshMigrationSource() {
    migSource = null;
    window.murkyOnboarding.getMigrationSource().then((info) => {
      migSource = info && typeof info === "object" ? info : { available: false };
      if (step === STEP_MIGRATE && view === "onboarding" && migState === "idle") { skipEnterAnim = true; render(); }
    }).catch(() => { migSource = { available: false }; });
  }

  function render() {
    if (view !== "onboarding") {
      renderLegal();
      return;
    }
    const slides = [
      ["Welcome to Murky", "A quieter browser with thoughtful controls, smooth themes, and your browsing experience at the center."],
      ["Choose your language", "Select the language Murky should use for its interface and page translation."],
      ["A quick agreement", "Please read Murky's Terms of Service and Privacy Policy, then confirm that you accept them."],
      ["Make it yours", "Choose a preset theme now, or skip this step and change it later in Settings."],
      migrateCopy(),
      ["Set Murky as Default Browser?", ""],
      ["You're all set!", "Everything is ready. Your first tab is waiting. Welcome to Murky."]
    ];
    stage.classList.toggle("lang", step === 1);
    const [title, body] = slides[step];
    const el = document.createElement("div");
    el.className = skipEnterAnim ? "slide" : `slide enter-${direction}`;
    skipEnterAnim = false;
    el.innerHTML = `<h2>${title}</h2>${body ? `<p>${body}</p>` : ""}`;

    if (step === 2) {
      const label = document.createElement("label");
      label.className = "check";
      label.innerHTML = `<input id="accept" type="checkbox"><span class="fake-check"></span><span>I have read and accept the <a href="#" data-legal="terms">Terms of Service</a> and <a href="#" data-legal="privacy">Privacy Policy</a>.</span>`;
      el.appendChild(label);
      label.querySelector("input").checked = accepted;
      label.querySelector("input").addEventListener("change", e => { accepted = e.target.checked; renderActions(); });
      label.querySelectorAll("[data-legal]").forEach(a => a.addEventListener("click", e => {
        e.preventDefault(); openLegal(a.dataset.legal);
      }));
    }

    if (step === 1) {
      renderLanguageStep(el);
    }

    if (step === STEP_MIGRATE) renderMigrateBody(el);

    if (step === 3) {
      const grid = document.createElement("div");
      grid.className = "themes";
      for (const [key, [name, bg, surface, accent]] of Object.entries(THEMES)) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "theme-swatch" + (selectedTheme === key ? " selected" : "");
        b.style.setProperty("--sw1", bg); b.style.setProperty("--sw2", surface); b.style.setProperty("--sw3", accent);
        b.setAttribute("aria-label", name); b.title = name;
        b.innerHTML = "<span></span>";
        b.addEventListener("click", () => {
          if (selectedTheme === key) return;
          const root = document.documentElement;
          const cs = getComputedStyle(root);
          animateSettingsTheme(
            { background: root.style.getPropertyValue("--bg") || cs.getPropertyValue("--bg").trim(), surface: root.style.getPropertyValue("--surface") || cs.getPropertyValue("--surface").trim(), accent: root.style.getPropertyValue("--accent") || cs.getPropertyValue("--accent").trim() },
            { background: bg, surface, accent }
          );
          selectedTheme = key;
          grid.querySelectorAll(".theme-swatch").forEach((x) => x.classList.toggle("selected", x === b));
          window.murkyOnboarding.setTheme({ theme: key, background: bg, backgroundImage: null, surface, accent });
        });
        grid.appendChild(b);
      }
      el.appendChild(grid);
    }

    stage.replaceChildren(el);
    dots.innerHTML = slides.map((_, i) => `<span class="dot${i === step ? " active" : ""}"></span>`).join("");
    renderActions();
    setTimeout(()=>translateOnboardingUi(),40);
  }

  function renderLegal() {
    const legal = LEGAL[view];
    stage.classList.remove("lang");
    const el = document.createElement("div");
    el.className = "slide legal-view enter-left";
    const sections = legal.sections.map(([heading, body]) => `<section><h3>${heading}</h3><p>${body}</p></section>`).join("");
    el.innerHTML = `<h2>${legal.title}</h2><div class="legal-scroll">${sections}</div>`;
    stage.replaceChildren(el);
    dots.innerHTML = [0,1,2,3,4,5,6].map(i => `<span class="dot${i === step ? " active" : ""}"></span>`).join("");
    actions.innerHTML = "";
    const back = document.createElement("button"); back.className = "btn"; back.textContent = "Back";
    back.onclick = () => { view = "onboarding"; render(); };
    actions.appendChild(back);
    setTimeout(() => translateOnboardingUi(), 40);
  }

  function openLegal(which) {
    if (!LEGAL[which]) return;
    view = which;
    render();
  }
  function renderActions() {
    actions.innerHTML = "";
    actions.classList.remove("split");
    const add = (label, cls, onclick, disabled) => {
      const b = document.createElement("button");
      b.className = cls; b.textContent = label; b.disabled = !!disabled; b.onclick = onclick;
      actions.appendChild(b);
      return b;
    };
    const busy = step === STEP_MIGRATE && migState === "running";
    if (step > 0 && step < STEP_DONE) add("Back", "btn", () => changeStep(-1), busy);

    if (step === 0) {
      add("Next", "btn primary", () => changeStep(1));
    } else if (step === 1) {
      add("Next", "btn primary", () => changeStep(1), !selectedLanguage);
    } else if (step === 2) {
      add("Next", "btn primary", () => changeStep(1), !accepted);
    } else if (step === 3) {
      add("Skip", "btn", () => changeStep(1));
      add("Next", "btn primary", () => changeStep(1));
    } else if (step === STEP_MIGRATE) {
      const ready = !!(migSource && migSource.available);
      if (migState === "done") {
        if (migSummary && migSummary.locked && migSummary.locked.length) add(mt("Try again"), "btn", () => startMigration()).setAttribute("data-no-translate", "");
        add("Next", "btn primary", () => changeStep(1));
      } else {
        add("Skip", "btn", () => changeStep(1), busy);
        const go = add(busy ? mt("Migrating…") : migState === "failed" ? mt("Try again") : "Migrate", "btn primary", () => startMigration(), busy || !ready);
        if (busy || migState === "failed") go.setAttribute("data-no-translate", "");
      }
    } else if (step === STEP_DEFAULT) {
      const skip = add("Skip", "btn", () => changeStep(1));
      const set = add("Set as Default", "btn primary", async () => { set.disabled = true; skip.disabled = true; try { await window.murkyOnboarding.setDefaultBrowser(); } catch {} changeStep(1); });
    } else {
      add("Start browsing", "btn primary", () => { document.body.classList.add("closing"); setTimeout(() => window.murkyOnboarding.complete(), 300); });
    }
  }

  let transitionToken = 0;
  function changeStep(delta) {
    const next = Math.max(0, Math.min(STEP_DONE, step + delta));
    if (next === step) return;
    const current = stage.querySelector(".slide");
    const exitDirection = delta > 0 ? "left" : "right";
    const token = ++transitionToken;
    direction = exitDirection;
    if (current) current.classList.add(`exit-${exitDirection}`);
    setTimeout(() => {
      if (token !== transitionToken) return;
      step = next;
      render();
    }, 260);
  }

  $("#appClose").addEventListener("click", () => window.murkyOnboarding.closeApp());
  window.murkyOnboarding.getSupportedLanguages().then(list=>{supportedLanguages=Array.isArray(list)?list:[];}).catch(()=>{supportedLanguages=[{code:"en",name:"English"}]});


  window.murkyOnboarding.onInit((settings) => {
    document.body.classList.remove("closing");
    applySettings(settings, false);
    selectedLanguage = settings?.preferredLanguages?.[0] || "en";
    refreshMigrationSource();
    render();
  });
  window.murkyOnboarding.onSettings((settings) => applySettings(settings, true));
  window.murkyOnboarding.onReset((settings) => {
    transitionToken++;
    cancelAnimationFrame(settingsThemeAnimationFrame);
    document.body.classList.remove("closing");
    selectedLanguage = settings?.preferredLanguages?.[0] || "en";
    view = "onboarding";
    step = 0;
    direction = "left";
    accepted = false;
    migState = "idle"; migPct = 0; migSummary = null;
    refreshMigrationSource();
    selectedTheme = settings?.theme || selectedTheme;
    if (settings) applySettings(settings, false);
    render();
  });
  window.murkyOnboarding.getSettings().then((s) => {
    applySettings(s, false);
    if (migSource === null) refreshMigrationSource();
    render();
  });
})();
