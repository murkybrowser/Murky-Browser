(() => {
  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const kind = q.get("kind") || "net";
  const code = Number(q.get("code") || 0);
  const name = (q.get("name") || "").replace(/^net::/, "");
  const statusText = q.get("text") || "";
  const failedUrl = q.get("url") || "";
  let host = "";
  try { host = new URL(failedUrl).hostname; } catch {}

  const ICON = {
    wifiOff: '<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>',
    searchX: '<path d="m13.5 8.5-5 5"/><path d="m8.5 8.5 5 5"/><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    server: '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    unplug: '<path d="m19 5 3-3"/><path d="m2 22 3-3"/><path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"/><path d="M7.5 13.5 10 11"/><path d="M10.5 16.5 13 14"/><path d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/><path d="m2 2 20 20"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9.5 12.5 5 5"/><path d="m14.5 12.5-5 5"/>',
  };

  const S = {
    again: "Try again", back: "Go back", safety: "Back to safety", tech: "Technical details",
    proceed: "Proceed to {site} (unsafe)", online: "Back online. Reconnecting…",
    certNote: "Murky blocked this page to protect you. If you understand the risk, you can open it anyway. Anything you send to {site} may be visible to others.",
    musicT: "Listen to some music while you wait?", musicPlay: "Play music", musicPause: "Pause music",
    play: "Press space or click to play", retry: "Game over. Press space or click to retry", thisSite: "this site",
    nfT: "Page not found", nfL: "There's nothing at this address. It may have moved or been deleted.",
    denT: "Access denied", denL: "You don't have permission to view this page. You may need to sign in.",
    manyT: "Too many requests", manyL: "This site is asking you to slow down. Wait a bit and try again.",
    srvT: "Server error", srvL: "Something went wrong on the site's end. Try again in a moment.",
    httpT: "Couldn't open this page", httpL: "The site refused to show this page.",
    offT: "You're offline", offL: "Murky can't reach the internet. Check your connection and we'll reconnect when you're back.",
    dnsT: "Can't find this site", dnsL: "Murky couldn't find a server called {site}. Check the address for typos.",
    refT: "{site} refused to connect", refL: "The site might be down. Try again in a moment.",
    toT: "Took too long to respond", toL: "{site} didn't answer in time. Try again in a moment.",
    rstT: "Connection interrupted", rstL: "The connection to {site} was dropped before the page finished loading.",
    certT: "This site isn't safe to open", certL: "Murky couldn't verify that this site's connection is secure, so it blocked the page.",
    certName: "The site's security certificate was issued for a different address.",
    certDate: "The site's security certificate has expired or isn't valid yet. Check your device's date and time.",
    certCA: "The site's certificate was issued by an authority Murky doesn't trust.",
    blkT: "Blocked by Murky", blkL: "{site} was blocked by your ad and tracker protection.",
    redT: "Too many redirects", redL: "{site} keeps sending Murky in circles. Clearing its cookies often helps.",
    badT: "That address doesn't look right", badL: "Murky can't open this address. Check it for typos.",
    prxT: "Proxy problem", prxL: "Murky couldn't connect through your proxy server.",
    fileT: "File not found", fileL: "That file doesn't exist or can't be opened.",
    genT: "Something went wrong", genL: "Murky couldn't load {site}. Try again in a moment.",
  };
  let MAP = {};
  const tr = (key, vars) => {
    const en = S[key] || key;
    let out = MAP[en] || en;
    const site = host || (MAP[S.thisSite] || S.thisSite);
    return out.replace(/\{site\}/g, (vars && vars.site) || site);
  };
  window.murkyErrorText = tr;

  const NET = {
    offline: ["ERR_INTERNET_DISCONNECTED", "ERR_NETWORK_CHANGED", "ERR_NETWORK_ACCESS_DENIED"],
    dns: ["ERR_NAME_NOT_RESOLVED", "ERR_NAME_RESOLUTION_FAILED", "ERR_DNS_TIMED_OUT", "ERR_DNS_MALFORMED_RESPONSE", "ERR_DNS_SERVER_FAILED"],
    refused: ["ERR_CONNECTION_REFUSED"],
    timeout: ["ERR_CONNECTION_TIMED_OUT", "ERR_TIMED_OUT"],
    reset: ["ERR_CONNECTION_RESET", "ERR_CONNECTION_CLOSED", "ERR_CONNECTION_FAILED", "ERR_CONNECTION_ABORTED", "ERR_EMPTY_RESPONSE", "ERR_ADDRESS_UNREACHABLE"],
    blocked: ["ERR_BLOCKED_BY_CLIENT", "ERR_BLOCKED_BY_RESPONSE", "ERR_BLOCKED_BY_ADMINISTRATOR"],
    redirects: ["ERR_TOO_MANY_REDIRECTS"],
    badurl: ["ERR_INVALID_URL", "ERR_UNSAFE_PORT", "ERR_DISALLOWED_URL_SCHEME", "ERR_INVALID_REDIRECT"],
    proxy: ["ERR_PROXY_CONNECTION_FAILED", "ERR_TUNNEL_CONNECTION_FAILED", "ERR_PROXY_AUTH_UNSUPPORTED"],
    nofile: ["ERR_FILE_NOT_FOUND", "ERR_ACCESS_DENIED"],
  };
  function classifyNet() {
    if (/^ERR_(CERT|SSL|BAD_SSL)/.test(name) || (code <= -200 && code >= -219) || code === -107 || code === -113) return "cert";
    for (const [cat, list] of Object.entries(NET)) if (list.includes(name)) return cat;
    return "generic";
  }
  function certReason() {
    if (name === "ERR_CERT_COMMON_NAME_INVALID" || code === -200) return "certName";
    if (name === "ERR_CERT_DATE_INVALID" || code === -201) return "certDate";
    if (name === "ERR_CERT_AUTHORITY_INVALID" || code === -202) return "certCA";
    return "certL";
  }

  function build() {
    const o = { icon: "alert", tone: "", t: "genT", l: "genL", game: false, cert: false };
    let tech = name ? `${name}${code ? ` (${code})` : ""}` : "";

    if (kind === "http") {
      let m;
      if (code === 404 || code === 410) m = ["searchX", "nfT", "nfL"];
      else if (code === 401 || code === 403) m = ["lock", "denT", "denL"];
      else if (code === 429) m = ["clock", "manyT", "manyL"];
      else if (code === 408 || code === 504) m = ["clock", "toT", "toL"];
      else if (code >= 500) m = ["server", "srvT", "srvL"];
      else m = ["alert", "httpT", "httpL"];
      Object.assign(o, { icon: m[0], t: m[1], l: m[2], prefix: String(code) });
      return { o, tech: `HTTP ${code}${statusText ? " " + statusText : ""}` };
    }

    let cat = classifyNet();
    if (!navigator.onLine && ["dns", "timeout", "reset", "generic"].includes(cat)) cat = "offline";
    const set = (icon, t, l, extra) => Object.assign(o, { icon, t, l }, extra || {});
    switch (cat) {
      case "offline": set("wifiOff", "offT", "offL", { game: true }); break;
      case "dns": set("searchX", "dnsT", "dnsL"); break;
      case "refused": set("unplug", "refT", "refL"); break;
      case "timeout": set("clock", "toT", "toL"); break;
      case "reset": set("unplug", "rstT", "rstL"); break;
      case "cert": set("shield", "certT", certReason(), { tone: "warn", cert: true }); break;
      case "blocked": set("ban", "blkT", "blkL"); break;
      case "redirects": set("repeat", "redT", "redL"); break;
      case "badurl": set("link", "badT", "badL"); break;
      case "proxy": set("unplug", "prxT", "prxL"); break;
      case "nofile": set("file", "fileT", "fileL"); break;
      default: break;
    }
    return { o, tech };
  }

  function applyTheme(s) {
    if (!s) return;
    const r = document.documentElement;
    const bg = s.background || "#0A1412";
    r.style.setProperty("--bg", bg);
    r.style.setProperty("--surface", s.surface || "#10201D");
    r.style.setProperty("--accent", s.accent || "#E3A857");
    const n = parseInt(String(bg).replace("#", "").slice(0, 6), 16);
    const whiteness = (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 765;
    const light = whiteness > 0.75;
    r.style.setProperty("--text", light ? "#000000" : "#FFFFFF");
    r.style.setProperty("--text-dim", light ? "#555555" : "#A8A8A8");
    if ("backgroundImage" in s) {
      const photo = s.backgroundImage ? String(s.backgroundImage) : "";
      r.style.setProperty("--bg-image", photo ? `url("${photo.replace(/"/g, '\\"')}")` : "none");
      r.style.setProperty("--bg-fit", s.backgroundFit === "stretch" ? "100% 100%" : "cover");
    }
    const f = s.fontFamily === "mono" ? '"Cascadia Mono", Consolas, monospace' : s.fontFamily === "serif" ? "Georgia, serif" : '"Segoe UI", system-ui, -apple-system, sans-serif';
    r.style.setProperty("--ui-font", f);
  }

  function bridge(fn) {
    const mp = window.murkyPage;
    if (mp && typeof mp[fn] === "function") return mp[fn]();
    if (fn === "errorBack") { if (history.length > 1) history.back(); return; }
    if (failedUrl) location.href = failedUrl;
  }

  function button(label, cls, fn) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "link " + cls;
    b.textContent = label;
    b.addEventListener("click", fn);
    return b;
  }

  function render() {
    const { o, tech } = build();
    const title = (o.prefix ? o.prefix + " " : "") + tr(o.t);
    document.title = title;
    $("icon").innerHTML = ICON[o.icon] || ICON.alert;
    $("icon").classList.toggle("warn", o.tone === "warn");
    $("title").textContent = title;
    $("lead").textContent = tr(o.l);
    if (failedUrl) { $("addr").textContent = failedUrl; $("addr").title = failedUrl; $("addr").hidden = false; }

    const actions = $("actions");
    actions.replaceChildren();
    if (o.cert) {
      actions.append(button(tr("safety"), "primary", () => bridge("errorBack")));
    } else {
      actions.append(button(tr("again"), "primary", () => bridge("errorRetry")));
      actions.append(button(tr("back"), "", () => bridge("errorBack")));
    }

    $("advSummary").textContent = tr("tech");
    const box = $("tech");
    box.replaceChildren();
    if (tech) { const p = document.createElement("p"); const c = document.createElement("code"); c.textContent = tech; p.append(c); box.append(p); }
    if (o.cert) {
      const p = document.createElement("p"); p.textContent = tr("certNote"); box.append(p);
      box.append(button(tr("proceed"), "danger", () => bridge("errorProceed")));
    }
    $("adv").hidden = !box.childNodes.length;
    $("musicT").textContent = tr("musicT");
    $("music").hidden = !o.game;
    if (window.murkyMusicLabels) window.murkyMusicLabels();
    if (o.game) { $("gameWrap").hidden = false; window.dispatchEvent(new Event("murky-game-visible")); }
  }

  window.addEventListener("online", () => {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = tr("online");
    document.body.appendChild(t);
    setTimeout(() => bridge("errorRetry"), 700);
  });

  async function localize(st) {
    const target = String((st && st.preferredLanguages && st.preferredLanguages[0]) || "en").toLowerCase().split(/[-_]/)[0];
    if (target === "en" || !window.murkyPage?.localizeText) return;
    const keys = Object.values(S);
    const out = await window.murkyPage.localizeText(keys, target);
    if (!Array.isArray(out)) return;
    MAP = {};
    keys.forEach((k, i) => { if (out[i] != null) MAP[k] = String(out[i]); });
    render();
  }

  (async () => {
    applyTheme({ background: q.get("bg") || undefined, surface: q.get("sf") || undefined, accent: q.get("ac") || undefined });
    try { render(); } catch (err) { console.error("[murky] error page render failed", err); }
    try {
      const st = await window.murkyPage?.getSettings?.();
      if (st) { applyTheme(st); await localize(st); }
    } catch {}
    try { window.murkyPage?.onSettingsUpdate?.((st) => { applyTheme(st); localize(st).catch(() => {}); }); } catch {}
  })();
})();
