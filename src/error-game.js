(() => {
  const canvas = document.getElementById("game");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const tr = (k) => (window.murkyErrorText ? window.murkyErrorText(k) : k);
  const BEST_KEY = "murkyDiveBest";
  const H = 200;
  const S = 2;
  let W = 560, dpr = 1, best = 0;
  try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch {}

  const FISH_W = 42, FISH_H = 26, FISH_CY = 13;
  const ROCK_W = 22, CAP_H = 14, BODY_H = 16;
  const PEARL = 8;

  function parseColor(v) {
    v = String(v || "").trim();
    let m = /^#([0-9a-f]{3})$/i.exec(v);
    if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
    m = /^#([0-9a-f]{6})/i.exec(v);
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    m = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(v);
    if (m) return [+m[1], +m[2], +m[3]];
    return null;
  }
  const lum = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
  const hex = (c) => "#" + c.map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("");

  let P = null, themeSig = "", sprites = {};
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const bg = parseColor(cs.getPropertyValue("--bg")) || [10, 20, 18];
    const tx = parseColor(cs.getPropertyValue("--text")) || [255, 255, 255];
    const sig = bg.join(",") + "|" + tx.join(",");
    if (sig === themeSig && P) return;
    themeSig = sig;
    const dark = lum(tx) > lum(bg);
    const mix = (k) => hex([0, 1, 2].map((i) => bg[i] + (tx[i] - bg[i]) * k));
    const a = (k, al) => `rgba(${[0, 1, 2].map((i) => Math.round(bg[i] + (tx[i] - bg[i]) * k)).join(",")},${al})`;
    P = dark ? {
      back: mix(0.34), body: mix(0.48), belly: mix(0.64), fin: mix(0.38), line: mix(0.2), whisk: mix(0.52), eye: mix(0),
      rFill: mix(0.16), rHi: mix(0.23), rSh: mix(0.11), rEdge: mix(0.3), rSpeck: mix(0.2),
      pearl: mix(0.9), pearlEdge: mix(0.5), pearlHi: mix(1),
    } : {
      back: mix(0.58), body: mix(0.42), belly: mix(0.26), fin: mix(0.5), line: mix(0.78), whisk: mix(0.62), eye: mix(1),
      rFill: mix(0.12), rHi: mix(0.06), rSh: mix(0.18), rEdge: mix(0.3), rSpeck: mix(0.16),
      pearl: mix(0.05), pearlEdge: mix(0.5), pearlHi: mix(0),
    };
    P.ink = mix(1);
    P.inkDim = a(1, 0.62);
    P.bubble = a(1, 0.32);
    P.pop = a(1, 1);
    buildSprites();
  }

  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.imageSmoothingEnabled = false; return [c, g]; };
  const lerp = (pts, x) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
    return pts[pts.length - 1][1];
  };
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  const TOP = [[9, 1.8], [14, 3.4], [19, 4.6], [24, 5.0], [28, 4.8], [30, 4.2], [31.5, 3.0], [32.5, 1.6], [33, 0]];
  const hTop = (x) => lerp(TOP, x), hBot = (x) => lerp(TOP, x) * 0.8;

  function buildFish(frame) {
    const [c, g] = mk(FISH_W, FISH_H);
    const cy = FISH_CY;
    const kind = Array.from({ length: FISH_H }, () => new Array(FISH_W).fill(""));
    const set = (x, y, k) => { if (x >= 0 && x < FISH_W && y >= 0 && y < FISH_H) kind[y][x] = k; };

    for (let x = 9; x <= 32; x++) {
      const t0 = cy - hTop(x), t1 = cy + hBot(x);
      for (let y = 0; y < FISH_H; y++) {
        const yc = y + 0.5;
        if (yc < t0 || yc > t1) continue;
        const t = (yc - t0) / (t1 - t0);
        set(x, y, t < 0.32 ? "back" : t > 0.7 ? "belly" : "body");
      }
    }
    const sway = frame === 0 ? -1 : 1;
    for (let x = 0; x <= 8; x++) {
      const d = 9 - x, hh = Math.min(1.8 + d * 0.5, 4.8) * (x === 0 ? 0.72 : 1), off = sway * (d / 9) * 2.4, mid = cy + off;
      for (let y = 0; y < FISH_H; y++) {
        const yc = y + 0.5;
        if (Math.abs(yc - mid) > hh) continue;
        set(x, y, "fin");
      }
    }
    const topY = (x) => Math.round(cy - hTop(x));
    const botY = (x) => Math.round(cy + hBot(x));
    [[17, 1], [18, 2], [19, 3], [20, 3], [21, 3], [22, 2], [23, 1]].forEach(([x, h]) => { for (let i = 1; i <= h; i++) set(x, topY(x) - i, "fin"); });
    [[11, 1], [12, 1], [13, 2], [14, 1]].forEach(([x, h]) => { for (let i = 1; i <= h; i++) set(x, topY(x) - i, "fin"); });
    [[11, 1], [12, 2], [13, 2], [14, 2], [15, 2], [16, 2], [17, 2], [18, 1]].forEach(([x, h]) => { for (let i = 0; i < h; i++) set(x, botY(x) + i, "fin"); });
    for (let i = 0; i < 4; i++) { set(27 - i, botY(27) - 1 + i, "fin"); set(26 - i, botY(26) - 1 + i, "fin"); }

    const filled = (x, y) => y >= 0 && y < FISH_H && x >= 0 && x < FISH_W && kind[y][x];
    const edge = [];
    for (let y = 0; y < FISH_H; y++) for (let x = 0; x < FISH_W; x++) {
      if (!kind[y][x]) continue;
      if (!filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1)) edge.push([x, y]);
    }
    const col = { back: P.back, body: P.body, belly: P.belly, fin: P.fin };
    for (let y = 0; y < FISH_H; y++) for (let x = 0; x < FISH_W; x++) if (kind[y][x]) { g.fillStyle = col[kind[y][x]]; g.fillRect(x, y, 1, 1); }
    g.fillStyle = P.line; for (const [x, y] of edge) g.fillRect(x, y, 1, 1);
    g.fillStyle = P.eye; g.fillRect(28, cy - 2, 1, 1);
    g.fillStyle = P.line; g.fillRect(28, cy + 1, 5, 1);
    g.globalAlpha = 0.6; g.fillRect(25, cy - 3, 1, 6); g.globalAlpha = 1;

    const w = frame;
    const barbels = [
      [[33, cy - 1], [34, cy - 2], [35, cy - 3], [36, cy - 3], [37, cy - 3], [38, cy - 2 + w], [39, cy - 1 + w]],
      [[33, cy], [34, cy], [35, cy], [36, cy + 1], [37, cy + 1], [38, cy + 2 + w], [39, cy + 3 + w], [40, cy + 3 + w]],
      [[31, cy + 3], [32, cy + 4], [33, cy + 5], [34, cy + 6], [35, cy + 6], [36, cy + 7 + w], [37, cy + 8 + w]],
      [[29, cy + 3], [30, cy + 4], [31, cy + 5], [32, cy + 6], [33, cy + 7], [34, cy + 7 + w]],
    ];
    g.fillStyle = P.whisk;
    for (const b of barbels) for (const [x, y] of b) g.fillRect(x, y, 1, 1);
    return c;
  }

  function buildRock() {
    const shade = (g, x, y, w, edgeL, edgeR) => {
      let col = P.rFill;
      if (x - edgeL < 3) col = P.rHi; else if (edgeR - x < 4) col = P.rSh;
      if (hash(x, y) < 0.07) col = P.rSpeck;
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    };
    const [cap, cg] = mk(ROCK_W, CAP_H);
    const rows = [];
    for (let y = 0; y < CAP_H; y++) {
      const hw = ROCK_W / 2 * Math.sqrt(Math.max(0, 1 - ((CAP_H - 1 - y) / CAP_H) ** 2));
      const x0 = Math.round(ROCK_W / 2 - hw), x1 = Math.round(ROCK_W / 2 + hw) - 1;
      rows.push([x0, x1]);
      for (let x = x0; x <= x1; x++) shade(cg, x, y, ROCK_W, x0, x1);
    }
    cg.fillStyle = P.rEdge;
    rows.forEach(([x0, x1], y) => { cg.fillRect(x0, y, 1, 1); cg.fillRect(x1, y, 1, 1); });
    for (let x = rows[0][0]; x <= rows[0][1]; x++) cg.fillRect(x, 0, 1, 1);
    for (let y = 1; y < CAP_H; y++) { const [x0, x1] = rows[y], [p0, p1] = rows[y - 1]; for (let x = x0; x < p0; x++) cg.fillRect(x, y, 1, 1); for (let x = p1 + 1; x <= x1; x++) cg.fillRect(x, y, 1, 1); }
    const [body, bg2] = mk(ROCK_W, BODY_H);
    for (let y = 0; y < BODY_H; y++) for (let x = 0; x < ROCK_W; x++) shade(bg2, x, y, ROCK_W, 0, ROCK_W - 1);
    bg2.fillStyle = P.rEdge; bg2.fillRect(0, 0, 1, BODY_H); bg2.fillRect(ROCK_W - 1, 0, 1, BODY_H);
    return { cap, body };
  }

  function buildPearl() {
    const [c, g] = mk(PEARL, PEARL);
    const r = 4.05, m = PEARL / 2;
    for (let y = 0; y < PEARL; y++) for (let x = 0; x < PEARL; x++) {
      const d = Math.hypot(x + 0.5 - m, y + 0.5 - m);
      if (d > r) continue;
      g.fillStyle = d > r - 1 ? P.pearlEdge : P.pearl; g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = P.pearlHi; g.fillRect(2, 2, 2, 1); g.fillRect(2, 3, 1, 1);
    return c;
  }

  function buildSprites() {
    const rk = buildRock();
    sprites = { fish: [buildFish(0), buildFish(1)], cap: rk.cap, body: rk.body, pearl: buildPearl() };
  }

  let themeQueued = false;
  const queueTheme = () => { if (themeQueued) return; themeQueued = true; requestAnimationFrame(() => { themeQueued = false; readTheme(); }); };
  new MutationObserver(queueTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-theme"] });

  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(300, canvas.clientWidth || 560);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  window.addEventListener("resize", size);

  let state = "ready";
  let score = 0, speed = 2.4, tAll = 0, last = 0, raf = 0, overAt = 0, spawnIn = 0, holding = false, bestBeaten = false;
  let rocks = [], pearls = [], bubbles = [], pops = [], burst = [];
  const fish = { x: 82, y: H / 2, vy: 0 };
  const R = 9;
  const HIT_X = [-10, 2, 14];

  function reset() {
    score = 0; speed = 2.4; rocks = []; pearls = []; pops = []; burst = []; bubbles = []; spawnIn = 40; bestBeaten = false;
    fish.y = H / 2; fish.vy = 0;
  }
  function begin() {
    const now = performance.now();
    if (state === "over") { if (now - overAt < 450) return; reset(); state = "run"; return; }
    if (state === "ready") { reset(); state = "run"; }
  }
  function press(v) { holding = v; if (v) begin(); }

  function spawn() {
    const gap = Math.max(76, 106 - score * 0.9);
    const cy = 56 + Math.random() * (H - 112);
    const w = ROCK_W * S;
    const r = { x: W + 30, w, top: cy - gap / 2, bot: cy + gap / 2, passed: false };
    rocks.push(r);
    if (Math.random() < 0.7) pearls.push({ x: r.x + w / 2, y: cy + (Math.random() - 0.5) * (gap - 36), r: 8, got: false, ph: Math.random() * 6 });
    spawnIn = 150 + Math.random() * 40 + speed * 10;
  }

  function die() {
    state = "over"; overAt = performance.now();
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * 6.283, s = 0.8 + Math.random() * 2.6;
      burst.push({ x: fish.x, y: fish.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1 });
    }
    const s = Math.floor(score);
    if (s > best) { best = s; try { localStorage.setItem(BEST_KEY, String(best)); } catch {} }
  }

  function circleRect(cx, cy, r, x, y, w, h) {
    const nx = Math.max(x, Math.min(cx, x + w)), ny = Math.max(y, Math.min(cy, y + h));
    return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
  }
  const hitsRock = (hx, hw, r) => HIT_X.some((o) => circleRect(fish.x + o, fish.y, R, hx, -10, hw, r.top + 10) || circleRect(fish.x + o, fish.y, R, hx, r.bot, hw, H - r.bot + 10));

  function update(dt) {
    tAll += dt;
    for (const p of pops) { p.y -= 0.5 * dt; p.life -= 0.02 * dt; }
    pops = pops.filter((p) => p.life > 0);
    for (const p of burst) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 0.02 * dt; p.vx *= 0.985; p.life -= 0.022 * dt; }
    burst = burst.filter((p) => p.life > 0);
    for (const b of bubbles) { b.y -= b.v * dt; b.x -= speed * 0.4 * dt; b.tmp -= dt; }
    bubbles = bubbles.filter((b) => b.tmp > 0);
    if (state === "ready") { fish.y = H / 2 + Math.sin(tAll * 0.05) * 6; return; }
    if (state === "over") { fish.vy += 0.12 * dt; fish.y = Math.min(H - 16, fish.y + fish.vy * dt); return; }

    speed = Math.min(5.4, 2.4 + score / 38);
    score += 0.0015 * dt * speed;
    fish.vy += (holding ? -0.34 : 0.26) * dt;
    fish.vy = Math.max(-3.6, Math.min(3.8, fish.vy));
    fish.y += fish.vy * dt;
    if (fish.y < 14) { fish.y = 14; fish.vy = Math.max(0, fish.vy); }
    if (fish.y > H - 14) { fish.y = H - 14; fish.vy = Math.min(0, fish.vy); }
    if (Math.random() < 0.18 * dt) bubbles.push({ x: fish.x - 36, y: fish.y + (Math.random() - 0.5) * 8, v: 0.3 + Math.random() * 0.3, tmp: 50 });

    spawnIn -= speed * dt;
    if (spawnIn <= 0) spawn();
    for (const r of rocks) {
      r.x -= speed * dt;
      if (!r.passed && r.x + r.w < fish.x - 20) { r.passed = true; score += 1; pops.push({ x: fish.x + 30, y: fish.y - 24, t: "+1", life: 1 }); }
      if (hitsRock(r.x + 4, r.w - 8, r)) { die(); return; }
    }
    rocks = rocks.filter((r) => r.x + r.w > -20);
    for (const p of pearls) {
      p.x -= speed * dt;
      if (!p.got && (fish.x + 14 - p.x) ** 2 + (fish.y - p.y) ** 2 < (R + p.r + 4) ** 2) {
        p.got = true; score += 3; pops.push({ x: p.x, y: p.y - 10, t: "+3", life: 1, hot: true });
        for (let i = 0; i < 9; i++) { const a = Math.random() * 6.283; burst.push({ x: p.x, y: p.y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6, life: 0.8, gold: true }); }
      }
    }
    pearls = pearls.filter((p) => !p.got && p.x > -20);
    if (!bestBeaten && best && score > best) { bestBeaten = true; pops.push({ x: W / 2, y: 40, t: "★", life: 1.6, hot: true }); }
  }

  const snap = (v) => Math.round(v / S) * S;
  function drawRock(r) {
    const x = snap(r.x), w = ROCK_W * S, capH = CAP_H * S, bodyH = BODY_H * S;
    const bt = snap(r.bot);
    ctx.drawImage(sprites.cap, x, bt, w, capH);
    for (let y = bt + capH; y < H + bodyH; y += bodyH) ctx.drawImage(sprites.body, x, y, w, bodyH);
    const tt = snap(r.top);
    ctx.save();
    ctx.translate(0, tt); ctx.scale(1, -1);
    ctx.drawImage(sprites.cap, x, 0, w, capH);
    for (let y = capH; y < tt + bodyH + 10; y += bodyH) ctx.drawImage(sprites.body, x, y, w, bodyH);
    ctx.restore();
  }

  function draw() {
    if (!P) readTheme();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = P.bubble;
    for (const b of bubbles) ctx.fillRect(snap(b.x), snap(b.y), S, S);

    for (const r of rocks) drawRock(r);

    for (const p of pearls) {
      const y = snap(p.y + Math.sin(tAll * 0.05 + p.ph) * 2.5), x = snap(p.x);
      ctx.drawImage(sprites.pearl, x - PEARL * S / 2, y - PEARL * S / 2, PEARL * S, PEARL * S);
      if (Math.sin(tAll * 0.12 + p.ph) > 0.82) {
        ctx.fillStyle = P.pearlHi;
        ctx.fillRect(x + 8, y - 12, S, S * 3); ctx.fillRect(x + 8 - S, y - 12 + S, S * 3, S);
      }
    }
    for (const p of burst) { ctx.globalAlpha = Math.max(0, Math.min(1, p.life)) * (p.gold ? 1 : 0.7); ctx.fillStyle = p.gold ? P.pearl : P.ink; ctx.fillRect(snap(p.x), snap(p.y), S, S); }
    ctx.globalAlpha = 1;

    const frame = state === "run" ? (Math.floor(tAll / 7) % 2) : (Math.floor(tAll / 18) % 2);
    const fx = snap(fish.x - (FISH_W * S) / 2), fy = snap(fish.y - (FISH_H * S) / 2);
    ctx.save();
    if (state === "over") { ctx.translate(0, fish.y * 2); ctx.scale(1, -1); }
    ctx.drawImage(sprites.fish[frame], fx, fy, FISH_W * S, FISH_H * S);
    ctx.restore();

    const body = getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "center"; ctx.font = `700 13px ${body}`;
    for (const p of pops) { ctx.globalAlpha = Math.max(0, Math.min(1, p.life)) * (p.hot ? 1 : 0.85); ctx.fillStyle = p.hot ? P.ink : P.inkDim; ctx.fillText(p.t, p.x, p.y); }
    ctx.globalAlpha = 1;

    const mono = getComputedStyle(document.documentElement).getPropertyValue("--mono-font").trim() || "monospace";
    ctx.textAlign = "left"; ctx.font = `700 15px ${mono}`; ctx.fillStyle = P.ink;
    ctx.fillText(String(Math.floor(score)), 16, 26);
    if (best) { ctx.textAlign = "right"; ctx.font = `11.5px ${mono}`; ctx.fillStyle = P.inkDim; ctx.fillText("BEST " + best, W - 16, 24); }
    if (state !== "run") {
      ctx.textAlign = "center"; ctx.fillStyle = P.ink;
      ctx.font = `600 14px ${body}`;
      ctx.fillText(tr(state === "over" ? "retry" : "play"), W / 2, H / 2 + (state === "over" ? 4 : -40));
      if (state === "over") { ctx.font = `12px ${mono}`; ctx.fillStyle = P.inkDim; ctx.fillText(String(Math.floor(score)) + (best ? "  ·  BEST " + best : ""), W / 2, H / 2 + 26); }
    }
  }

  function frameLoop(now) {
    const dt = Math.min(2.5, (now - (last || now)) / 16.67);
    last = now;
    update(dt); draw();
    raf = requestAnimationFrame(frameLoop);
  }
  const wrap = () => document.getElementById("gameWrap");
  function start() { if (!raf) { last = 0; readTheme(); raf = requestAnimationFrame(frameLoop); } }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  window.addEventListener("murky-game-visible", () => { size(); start(); });
  if (!wrap().hidden) { size(); start(); }
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else if (!wrap().hidden) start(); });
  window.addEventListener("keydown", (e) => {
    if (wrap().hidden) return;
    if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); if (!e.repeat) press(true); }
  });
  window.addEventListener("keyup", (e) => { if (e.code === "Space" || e.code === "ArrowUp") press(false); });
  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch {} press(true); });
  canvas.addEventListener("pointerup", () => press(false));
  canvas.addEventListener("pointercancel", () => press(false));
  window.addEventListener("blur", () => press(false));
})();
