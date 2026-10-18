const path = require("path");
const fs = require("fs");

async function main() {
  if (process.platform !== "win32") return;
  let exe;
  try {
    const dist = path.join(path.dirname(require.resolve("electron/package.json")), "dist");
    exe = path.join(dist, "electron.exe");
  } catch { return; }
  if (!fs.existsSync(exe)) return;
  const icon = path.join(__dirname, "..", "build", "icon.ico");
  const marker = path.join(path.dirname(exe), ".murky-branded");
  const stamp = String(fs.existsSync(icon) ? fs.statSync(icon).mtimeMs : 0);
  try { if (fs.readFileSync(marker, "utf8") === stamp) return; } catch {}
  let rcedit;
  try { const m = require("rcedit"); rcedit = m.rcedit || m.default || m; } catch { return; }
  const opts = {
    "version-string": {
      FileDescription: "Murky",
      ProductName: "Murky",
      InternalName: "Murky",
      OriginalFilename: "Murky.exe",
      CompanyName: "Murky",
    },
  };
  if (fs.existsSync(icon)) opts.icon = icon;
  try {
    await rcedit(exe, opts);
    fs.writeFileSync(marker, stamp);
  } catch {}
}
main();
