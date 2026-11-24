"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const PLATFORM = process.platform;
const WEBKIT_EPOCH_MS = 11644473600000;

const home = () => os.homedir();
const localAppData = () => process.env.LOCALAPPDATA || path.join(home(), "AppData", "Local");
const roamingAppData = () => process.env.APPDATA || path.join(home(), "AppData", "Roaming");
const macSupport = () => path.join(home(), "Library", "Application Support");

const BROWSERS = {
  chrome:   { name: "Google Chrome", engine: "chromium", keychain: "Chrome",
    dir: () => PLATFORM === "win32" ? path.join(localAppData(), "Google", "Chrome", "User Data") : PLATFORM === "darwin" ? path.join(macSupport(), "Google", "Chrome") : path.join(home(), ".config", "google-chrome") },
  edge:     { name: "Microsoft Edge", engine: "chromium", keychain: "Microsoft Edge",
    dir: () => PLATFORM === "win32" ? path.join(localAppData(), "Microsoft", "Edge", "User Data") : PLATFORM === "darwin" ? path.join(macSupport(), "Microsoft Edge") : path.join(home(), ".config", "microsoft-edge") },
  brave:    { name: "Brave", engine: "chromium", keychain: "Brave",
    dir: () => PLATFORM === "win32" ? path.join(localAppData(), "BraveSoftware", "Brave-Browser", "User Data") : PLATFORM === "darwin" ? path.join(macSupport(), "BraveSoftware", "Brave-Browser") : path.join(home(), ".config", "BraveSoftware", "Brave-Browser") },
  vivaldi:  { name: "Vivaldi", engine: "chromium", keychain: "Vivaldi",
    dir: () => PLATFORM === "win32" ? path.join(localAppData(), "Vivaldi", "User Data") : PLATFORM === "darwin" ? path.join(macSupport(), "Vivaldi") : path.join(home(), ".config", "vivaldi") },
  opera:    { name: "Opera", engine: "chromium", keychain: "Opera", flatProfile: true,
    dir: () => PLATFORM === "win32" ? path.join(roamingAppData(), "Opera Software", "Opera Stable") : PLATFORM === "darwin" ? path.join(macSupport(), "com.operasoftware.Opera") : path.join(home(), ".config", "opera") },
  operagx:  { name: "Opera GX", engine: "chromium", keychain: "Opera", flatProfile: true,
    dir: () => PLATFORM === "win32" ? path.join(roamingAppData(), "Opera Software", "Opera GX Stable") : PLATFORM === "darwin" ? path.join(macSupport(), "com.operasoftware.OperaGX") : path.join(home(), ".config", "opera-gx") },
  chromium: { name: "Chromium", engine: "chromium", keychain: "Chromium",
    dir: () => PLATFORM === "win32" ? path.join(localAppData(), "Chromium", "User Data") : PLATFORM === "darwin" ? path.join(macSupport(), "Chromium") : path.join(home(), ".config", "chromium") },
  firefox:  { name: "Mozilla Firefox", engine: "firefox",
    dir: () => PLATFORM === "win32" ? path.join(roamingAppData(), "Mozilla", "Firefox") : PLATFORM === "darwin" ? path.join(macSupport(), "Firefox") : path.join(home(), ".mozilla", "firefox") },
};
const FALLBACK_ORDER = ["chrome", "edge", "firefox", "brave", "opera", "operagx", "vivaldi", "chromium"];
const KNOWN_UNSUPPORTED = { safari: "Safari", ie: "Internet Explorer" };

const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024, ...opts }, (err, stdout) => resolve(err ? "" : String(stdout || "")));
    } catch { resolve(""); }
  });
}

function idFromString(s) {
  const v = String(s || "").toLowerCase();
  if (!v) return null;
  if (v.includes("murky")) return null;
  if (v.includes("operagx") || v.includes("opera gx") || v.includes("opera-gx")) return "operagx";
  if (v.includes("opera")) return "opera";
  if (v.includes("brave")) return "brave";
  if (v.includes("vivaldi")) return "vivaldi";
  if (v.includes("msedge") || v.includes("edge")) return "edge";
  if (v.includes("firefox")) return "firefox";
  if (v.includes("chromium")) return "chromium";
  if (v.includes("chrome")) return "chrome";
  if (v.includes("safari")) return "safari";
  if (v.startsWith("ie.") || v.includes("iexplore")) return "ie";
  return null;
}

async function regValue(key, name) {
  const out = await run("reg", ["query", key, "/v", name]);
  const m = out.match(new RegExp(name + "\\s+REG_\\w+\\s+(.+)", "i"));
  return m ? m[1].trim() : "";
}

async function detectDefaultBrowserId() {
  try {
    if (PLATFORM === "win32") {
      const base = "HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\";
      const progId = (await regValue(base + "https\\UserChoice", "ProgId")) || (await regValue(base + "http\\UserChoice", "ProgId"));
      return idFromString(progId);
    }
    if (PLATFORM === "darwin") {
      const plist = path.join(home(), "Library", "Preferences", "com.apple.LaunchServices", "com.apple.launchservices.secure.plist");
      const json = await run("plutil", ["-convert", "json", "-o", "-", plist]);
      const data = json ? JSON.parse(json) : null;
      const handlers = (data && data.LSHandlers) || [];
      const hit = handlers.find((h) => h && (h.LSHandlerURLScheme === "https" || h.LSHandlerURLScheme === "http") && h.LSHandlerRoleAll);
      return hit ? idFromString(hit.LSHandlerRoleAll) : "safari";
    }
    const out = (await run("xdg-settings", ["get", "default-web-browser"])).trim();
    return idFromString(out);
  } catch { return null; }
}

function chromiumProfileDir(def) {
  const base = def.dir();
  if (!exists(base)) return null;
  if (def.flatProfile) return exists(path.join(base, "Bookmarks")) || exists(path.join(base, "History")) ? base : null;
  const state = readJson(path.join(base, "Local State"));
  const candidates = [];
  const last = state && state.profile && (state.profile.last_used || (state.profile.last_active_profiles || [])[0]);
  if (last) candidates.push(String(last));
  candidates.push("Default");
  try { for (const d of fs.readdirSync(base)) if (/^Profile \d+$/.test(d)) candidates.push(d); } catch {}
  for (const c of candidates) {
    const p = path.join(base, c);
    if (exists(path.join(p, "Bookmarks")) || exists(path.join(p, "History"))) return p;
  }
  return null;
}

function firefoxProfileDir(def) {
  const roots = [def.dir()];
  if (PLATFORM === "linux") roots.push(path.join(home(), "snap", "firefox", "common", ".mozilla", "firefox"), path.join(home(), ".var", "app", "org.mozilla.firefox", ".mozilla", "firefox"));
  for (const base of roots) {
    if (!exists(base)) continue;
    let ini = "";
    try { ini = fs.readFileSync(path.join(base, "profiles.ini"), "utf8"); } catch {}
    const sections = [];
    let cur = null;
    for (const raw of ini.split(/\r?\n/)) {
      const line = raw.trim();
      const h = /^\[(.+)\]$/.exec(line);
      if (h) { cur = { name: h[1], kv: {} }; sections.push(cur); continue; }
      const kv = /^([^=]+)=(.*)$/.exec(line);
      if (kv && cur) cur.kv[kv[1].trim()] = kv[2].trim();
    }
    const resolve = (s) => (s && s.kv.Path ? (s.kv.IsRelative === "0" ? s.kv.Path : path.join(base, s.kv.Path)) : null);
    const picks = [];
    const install = sections.find((s) => /^Install/i.test(s.name) && s.kv.Default);
    if (install) picks.push(path.isAbsolute(install.kv.Default) ? install.kv.Default : path.join(base, install.kv.Default));
    const profiles = sections.filter((s) => /^Profile/i.test(s.name));
    const def1 = profiles.find((s) => s.kv.Default === "1");
    if (def1) picks.push(resolve(def1));
    for (const s of profiles) picks.push(resolve(s));
    try { for (const d of fs.readdirSync(path.join(base, "Profiles"))) picks.push(path.join(base, "Profiles", d)); } catch {}
    for (const p of picks) if (p && exists(path.join(p, "places.sqlite"))) return p;
  }
  return null;
}

function locate(id) {
  if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(BROWSERS, id)) return null;
  const def = BROWSERS[id];
  const profile = def.engine === "firefox" ? firefoxProfileDir(def) : chromiumProfileDir(def);
  return profile ? { id, name: def.name, engine: def.engine, profile } : null;
}

async function getSource() {
  const defId = await detectDefaultBrowserId();
  if (defId && BROWSERS[defId]) {
    const hit = locate(defId);
    if (hit) return { available: true, id: hit.id, name: hit.name, isDefault: true };
  }
  for (const id of FALLBACK_ORDER) {
    if (id === defId) continue;
    const hit = locate(id);
    if (hit) return { available: true, id: hit.id, name: hit.name, isDefault: false };
  }
  const unsupportedName = defId && KNOWN_UNSUPPORTED[defId];
  return { available: false, id: defId || null, name: unsupportedName || (defId && BROWSERS[defId] ? BROWSERS[defId].name : ""), isDefault: !!defId };
}

function sqliteModule() {
  try { return require("node:sqlite"); } catch { return null; }
}

async function copyFile(src, dst) {
  try { fs.copyFileSync(src, dst); return true; } catch {}
  if (PLATFORM === "win32") {
    const q = (s) => String(s).replace(/'/g, "''");
    const ps = `$ErrorActionPreference='Stop';$i=[IO.File]::Open('${q(src)}','Open','Read','ReadWrite,Delete');try{$o=[IO.File]::Create('${q(dst)}');try{$i.CopyTo($o)}finally{$o.Close()}}finally{$i.Close()}`;
    try {
      await new Promise((resolve, reject) => execFile("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { windowsHide: true, timeout: 20000 }, (e) => (e ? reject(e) : resolve())));
      return fs.existsSync(dst);
    } catch {}
  }
  return false;
}

async function snapshot(file, tmp, tag) {
  if (!exists(file)) return null;
  const dst = path.join(tmp, tag + ".db");
  if (!(await copyFile(file, dst))) return null;
  for (const ext of ["-wal", "-shm", "-journal"]) if (exists(file + ext)) await copyFile(file + ext, dst + ext);
  return dst;
}

function queryAll(dbFile, sql, params = []) {
  const mod = sqliteModule();
  if (!mod) throw new Error("sqlite-unavailable");
  const db = new mod.DatabaseSync(dbFile);
  try { return db.prepare(sql).all(...params); }
  finally { try { db.close(); } catch {} }
}
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const isWebUrl = (u) => /^https?:\/\//i.test(String(u || ""));

function readChromiumBookmarks(profile) {
  const data = readJson(path.join(profile, "Bookmarks"));
  const out = [];
  if (!data || !data.roots) return out;
  const walk = (node) => {
    if (!node) return;
    if (node.type === "url" && isWebUrl(node.url)) {
      let created = 0;
      try { created = Number(BigInt(node.date_added || 0) / 1000n) - WEBKIT_EPOCH_MS; } catch {}
      out.push({ title: String(node.name || node.url), url: String(node.url), createdAt: created > 0 ? created : Date.now() });
    }
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  for (const root of Object.values(data.roots)) if (root && typeof root === "object") walk(root);
  return out;
}

function readChromiumHistory(dbFile) {
  const pages = queryAll(dbFile,
    "SELECT url, title, (last_visit_time/1000 - 11644473600000) AS ts FROM urls WHERE hidden = 0 AND url LIKE 'http%' ORDER BY last_visit_time DESC LIMIT 1700")
    .map((r) => ({ type: "page", url: String(r.url), title: String(r.title || r.url), favicon: null, ts: num(r.ts) || Date.now() }));
  let searches = [];
  try {
    searches = queryAll(dbFile,
      "SELECT k.term AS term, (u.last_visit_time/1000 - 11644473600000) AS ts FROM keyword_search_terms k JOIN urls u ON u.id = k.url_id ORDER BY u.last_visit_time DESC LIMIT 600")
      .map((r) => ({ type: "search", query: String(r.term || "").trim(), ts: num(r.ts) || Date.now() }))
      .filter((s) => s.query);
  } catch {}
  return { pages, searches };
}

let dpapiKeyCache = null;
async function chromiumCookieKey(def, base) {
  if (PLATFORM === "win32") {
    if (dpapiKeyCache && dpapiKeyCache.base === base) return dpapiKeyCache.key;
    const state = readJson(path.join(base, "Local State"));
    const enc = state && state.os_crypt && state.os_crypt.encrypted_key;
    if (!enc) return null;
    const raw = Buffer.from(enc, "base64");
    if (raw.slice(0, 5).toString() !== "DPAPI") return null;
    const b64 = raw.slice(5).toString("base64");
    const ps = `Add-Type -AssemblyName System.Security;$b=[Convert]::FromBase64String('${b64}');[Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'))`;
    const out = (await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps])).trim();
    const key = out ? Buffer.from(out, "base64") : null;
    dpapiKeyCache = { base, key };
    return key;
  }
  if (PLATFORM === "darwin") {
    const pw = (await run("security", ["find-generic-password", "-w", "-s", `${def.keychain} Safe Storage`])).trim();
    return pw ? crypto.pbkdf2Sync(pw, "saltysalt", 1003, 16, "sha1") : null;
  }
  return crypto.pbkdf2Sync("peanuts", "saltysalt", 1, 16, "sha1");
}

function decryptCookie(buf, key, metaVersion) {
  try {
    const b = Buffer.from(buf);
    const tag = b.slice(0, 3).toString("latin1");
    if (tag !== "v10" && tag !== "v11") return null;
    let plain;
    if (PLATFORM === "win32") {
      if (!key || b.length < 3 + 12 + 16) return null;
      const d = crypto.createDecipheriv("aes-256-gcm", key, b.slice(3, 15));
      d.setAuthTag(b.slice(b.length - 16));
      plain = Buffer.concat([d.update(b.slice(15, b.length - 16)), d.final()]);
    } else {
      if (!key) return null;
      const d = crypto.createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
      plain = Buffer.concat([d.update(b.slice(3)), d.final()]);
    }
    if (metaVersion >= 24) plain = plain.slice(32);
    return plain.toString("utf8");
  } catch { return null; }
}

async function readChromiumCookies(def, base, profile, dbFile) {
  const rows = queryAll(dbFile,
    "SELECT host_key, name, value, encrypted_value, path, is_secure, is_httponly, samesite, has_expires, (expires_utc/1000000 - 11644473600) AS exp FROM cookies");
  let metaVersion = 0;
  try { metaVersion = num(queryAll(dbFile, "SELECT value FROM meta WHERE key = 'version'")[0]?.value); } catch {}
  let key = null, needKey = rows.some((r) => r.encrypted_value && r.encrypted_value.length);
  if (needKey) key = await chromiumCookieKey(def, base);
  const now = Date.now() / 1000;
  const cookies = [];
  let undecryptable = 0;
  for (const r of rows) {
    let value = r.value ? String(r.value) : "";
    if (!value && r.encrypted_value && r.encrypted_value.length) {
      const v = decryptCookie(r.encrypted_value, key, metaVersion);
      if (v == null) { undecryptable++; continue; }
      value = v;
    }
    const exp = r.has_expires ? num(r.exp) : 0;
    if (r.has_expires && exp <= now) continue;
    const ss = num(r.samesite);
    cookies.push({
      host: String(r.host_key), name: String(r.name), value, path: String(r.path || "/"),
      secure: !!r.is_secure, httpOnly: !!r.is_httponly,
      sameSite: ss === 0 ? "no_restriction" : ss === 1 ? "lax" : ss === 2 ? "strict" : "unspecified",
      expires: exp > 0 ? exp : 0,
    });
  }
  return { cookies, undecryptable };
}

function readFirefoxBookmarks(dbFile) {
  return queryAll(dbFile,
    "SELECT b.title AS title, p.url AS url, (b.dateAdded/1000) AS added FROM moz_bookmarks b JOIN moz_places p ON p.id = b.fk WHERE b.type = 1 AND p.url LIKE 'http%'")
    .map((r) => ({ title: String(r.title || r.url), url: String(r.url), createdAt: num(r.added) || Date.now() }));
}
function readFirefoxHistory(dbFile) {
  return queryAll(dbFile,
    "SELECT url, title, (last_visit_date/1000) AS ts FROM moz_places WHERE last_visit_date IS NOT NULL AND url LIKE 'http%' ORDER BY last_visit_date DESC LIMIT 1700")
    .map((r) => ({ type: "page", url: String(r.url), title: String(r.title || r.url), favicon: null, ts: num(r.ts) || Date.now() }));
}
function readFirefoxSearches(dbFile) {
  return queryAll(dbFile,
    "SELECT value, (lastUsed/1000) AS ts FROM moz_formhistory WHERE fieldname = 'searchbar-history' ORDER BY lastUsed DESC LIMIT 600")
    .map((r) => ({ type: "search", query: String(r.value || "").trim(), ts: num(r.ts) || Date.now() }))
    .filter((s) => s.query);
}
function readFirefoxCookies(dbFile) {
  const now = Date.now() / 1000;
  const rows = queryAll(dbFile, "SELECT host, name, value, path, expiry, isSecure, isHttpOnly, sameSite FROM moz_cookies WHERE originAttributes = ''");
  const cookies = [];
  for (const r of rows) {
    let exp = num(r.expiry);
    if (exp > 1e11) exp = exp / 1000;
    if (exp && exp <= now) continue;
    const ss = num(r.sameSite);
    cookies.push({
      host: String(r.host), name: String(r.name), value: String(r.value || ""), path: String(r.path || "/"),
      secure: !!r.isSecure, httpOnly: !!r.isHttpOnly,
      sameSite: ss === 0 ? "no_restriction" : ss === 1 ? "lax" : ss === 2 ? "strict" : "unspecified",
      expires: exp > 0 ? exp : 0,
    });
  }
  return { cookies, undecryptable: 0 };
}

function toElectronCookie(c) {
  const hostOnly = !c.host.startsWith(".");
  const host = c.host.replace(/^\./, "");
  if (!host) return null;
  const secure = c.secure || /^__(Secure|Host)-/.test(c.name);
  const sameSite = c.sameSite === "no_restriction" && !secure ? "unspecified" : c.sameSite;
  const det = { url: `${secure ? "https" : "http"}://${host}${c.path.startsWith("/") ? c.path : "/" + c.path}`, name: c.name, value: c.value, path: c.path, secure, httpOnly: c.httpOnly, sameSite };
  if (!hostOnly) det.domain = c.host;
  if (c.expires) det.expirationDate = c.expires;
  return det;
}

async function migrate(id, hooks) {
  const progress = (p, phase, detail) => { try { hooks.progress && hooks.progress(Math.max(0, Math.min(100, Math.round(p))), phase, detail || {}); } catch {} };
  if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(BROWSERS, id)) return { ok: false, id: String(id), name: "", bookmarks: 0, history: 0, searches: 0, cookies: 0, undecryptableCookies: 0, locked: [], unavailable: [], error: "not-found" };
  const summary = { ok: false, id, name: (BROWSERS[id] && BROWSERS[id].name) || "", bookmarks: 0, history: 0, searches: 0, cookies: 0, undecryptableCookies: 0, locked: [], unavailable: [] };
  const src = locate(id);
  if (!src) { summary.error = "not-found"; return summary; }
  const def = BROWSERS[id];
  const sqlite = sqliteModule();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "murky-migrate-"));
  const safe = async (fn) => { try { return await fn(); } catch { return undefined; } };

  try {
    progress(2, "prepare");
    const isFx = src.engine === "firefox";
    const base = def.dir();

    progress(6, "bookmarks");
    let bookmarks = [];
    if (isFx) {
      const f = await snapshot(path.join(src.profile, "places.sqlite"), tmp, "places");
      if (f && sqlite) bookmarks = (await safe(() => readFirefoxBookmarks(f))) || [];
      else summary.locked.push("bookmarks");
      src._places = f;
    } else {
      bookmarks = (await safe(() => readChromiumBookmarks(src.profile))) || [];
    }
    bookmarks.sort((a, b) => b.createdAt - a.createdAt);
    if (bookmarks.length && hooks.importBookmarks) await hooks.importBookmarks(bookmarks);
    summary.bookmarks = bookmarks.length;
    progress(15, "bookmarks", { count: bookmarks.length });

    progress(18, "history");
    let pages = [], searches = [];
    if (!sqlite) {
      summary.unavailable.push("history", "cookies");
    } else if (isFx) {
      if (src._places) {
        pages = (await safe(() => readFirefoxHistory(src._places))) || [];
      }
      const fh = await snapshot(path.join(src.profile, "formhistory.sqlite"), tmp, "form");
      if (fh) searches = (await safe(() => readFirefoxSearches(fh))) || [];
    } else {
      const hf = await snapshot(path.join(src.profile, "History"), tmp, "history");
      if (hf) { const r = await safe(() => readChromiumHistory(hf)); if (r) { pages = r.pages; searches = r.searches; } }
      else summary.locked.push("history");
    }
    progress(35, "history");
    const all = [...pages, ...searches];
    if (all.length && hooks.importHistory) await hooks.importHistory(all);
    summary.history = pages.length;
    summary.searches = searches.length;
    progress(45, "history", { count: pages.length + searches.length });

    progress(46, "cookies");
    let cookieData = { cookies: [], undecryptable: 0 };
    if (sqlite) {
      if (isFx) {
        const cf = await snapshot(path.join(src.profile, "cookies.sqlite"), tmp, "cookies");
        if (cf) cookieData = (await safe(() => readFirefoxCookies(cf))) || cookieData; else summary.locked.push("cookies");
      } else {
        const cp = [path.join(src.profile, "Network", "Cookies"), path.join(src.profile, "Cookies")].find(exists);
        const cf = cp ? await snapshot(cp, tmp, "cookies") : null;
        if (cf) cookieData = (await safe(() => readChromiumCookies(def, base, src.profile, cf))) || cookieData; else if (cp) summary.locked.push("cookies");
      }
    }
    summary.undecryptableCookies = cookieData.undecryptable;
    const total = cookieData.cookies.length;
    let done = 0, set = 0;
    const CHUNK = 40;
    for (let i = 0; i < total; i += CHUNK) {
      const slice = cookieData.cookies.slice(i, i + CHUNK);
      const results = await Promise.all(slice.map(async (c) => {
        const det = toElectronCookie(c);
        if (!det || !hooks.setCookie) return false;
        try { await hooks.setCookie(det); return true; } catch { return false; }
      }));
      set += results.filter(Boolean).length;
      done += slice.length;
      progress(46 + (done / Math.max(1, total)) * 52, "cookies", { done, total });
    }
    summary.cookies = set;
    progress(100, "done");
    summary.ok = true;
    return summary;
  } catch (err) {
    summary.error = String((err && err.message) || err);
    return summary;
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { getSource, migrate, detectDefaultBrowserId, BROWSERS, _internals: { idFromString, decryptCookie, toElectronCookie, locate } };
