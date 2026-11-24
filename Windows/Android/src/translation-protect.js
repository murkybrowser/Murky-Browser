
const GLOBAL_NAMES = [
  "Murky", "Electron", "Chromium", "Chrome", "Chromecast", "Firefox", "Safari", "Vivaldi", "Tor", "Bergamot", "Whisper", "WebKit", "Gecko", "Blink", "V8", "Node.js", "NodeJS", "npm", "Deno", "Bun",
  "JavaScript", "TypeScript", "HTML", "HTML5", "CSS", "CSS3", "SVG", "JSON", "XML", "YAML", "SQL", "GraphQL", "WebAssembly", "WASM", "WebGL", "WebRTC", "WebSocket", "WebSockets", "PWA", "SDK", "CLI", "GUI", "UI", "UX",
  "Python", "Java", "Kotlin", "Swift", "Rust", "Golang", "Ruby", "PHP", "Perl", "Lua", "Haskell", "Scala", "Dart", "Flutter", "React", "Vue", "Angular", "Svelte", "jQuery", "Next.js", "Nuxt", "Django", "Flask", "Laravel", "Tailwind", "Bootstrap", "Webpack", "Vite", "Babel", "ESLint",
  "Docker", "Kubernetes", "Terraform", "Ansible", "Jenkins", "Git", "GitHub", "GitLab", "Bitbucket", "Stack Overflow", "StackOverflow", "npmjs", "PyPI", "Homebrew", "Gradle", "Maven", "CodePen", "Replit", "Vercel", "Netlify", "Heroku", "Cloudflare", "AWS", "Azure", "Firebase", "Supabase", "MongoDB", "PostgreSQL", "MySQL", "SQLite", "Redis", "Elasticsearch", "Kafka", "RabbitMQ", "OpenAI", "ChatGPT", "GPT", "Claude", "Gemini", "Copilot", "Midjourney", "Hugging Face", "HuggingFace", "TensorFlow", "PyTorch",
  "API", "URL", "URI", "HTTP", "HTTPS", "FTP", "SSH", "SSL", "TLS", "DNS", "VPN", "IP", "TCP", "UDP", "DOM", "DevTools", "CORS", "OAuth", "JWT", "CDN", "RSS", "PDF", "CSV", "ZIP", "RAR", "MP3", "MP4", "PNG", "JPG", "JPEG", "GIF", "WebP", "AVIF", "HEIC", "HDR", "GPU", "CPU", "RAM", "SSD", "HDD", "USB", "HDMI", "NFC", "QR", "OLED", "LED", "LCD", "4K", "8K", "FPS", "RGB", "BIOS", "UEFI", "ISO", "APK", "EXE", "MSI", "DMG",
  "Windows", "Linux", "macOS", "iOS", "iPadOS", "watchOS", "tvOS", "Android", "Ubuntu", "Debian", "Fedora", "Arch Linux", "Linux Mint", "openSUSE", "Chrome OS", "ChromeOS", "HarmonyOS", "Raspberry Pi", "Arduino",
  "iPhone", "iPad", "iPod", "MacBook", "iMac", "AirPods", "Apple Watch", "Apple TV", "Samsung", "Galaxy", "Xiaomi", "Huawei", "OnePlus", "Pixel", "Nokia", "Motorola", "Sony", "PlayStation", "PS4", "PS5", "Xbox", "Nintendo", "Switch", "Intel", "AMD", "NVIDIA", "GeForce", "Radeon", "Ryzen", "Qualcomm", "Snapdragon", "ARM", "Logitech", "Razer", "Corsair", "ASUS", "Acer", "Lenovo", "ThinkPad", "Dell", "HP", "Microsoft", "Oracle", "IBM", "Cisco", "Tesla", "SpaceX", "Toyota", "BMW", "Mercedes-Benz", "Volkswagen", "Honda", "Ford", "Nike", "Adidas", "IKEA", "Coca-Cola", "Pepsi", "McDonald's", "Starbucks", "Walmart", "Alibaba", "AliExpress", "Tencent", "Baidu", "ByteDance",
  "Vulkan", "OpenGL", "DirectX", "Wi-Fi", "WiFi", "Bluetooth", "NVMe", "PCIe", "Thunderbolt", "Lightning",
  "Discord", "Telegram", "WhatsApp", "Signal App", "Messenger", "Facebook", "Instagram", "Threads", "Twitter", "TikTok", "Snapchat", "Pinterest", "Reddit", "Tumblr", "LinkedIn", "Mastodon", "Bluesky", "Twitch", "YouTube", "Kick", "VK", "VKontakte", "Odnoklassniki", "Weibo", "WeChat", "QQ", "LINE", "KakaoTalk", "Viber", "Skype", "Microsoft Teams", "Zoom Meeting", "Google Meet", "Matrix", "Element", "Slack App", "Clubhouse", "Quora", "Medium", "Substack", "Patreon", "Ko-fi", "BuyMeACoffee", "OnlyFans", "Fiverr", "Upwork", "Etsy", "eBay", "Shopify", "PayPal", "Stripe", "Venmo", "CashApp", "Revolut", "Wise", "Payoneer", "Binance", "Coinbase", "Kraken", "MetaMask", "Ledger", "Trezor", "Bitcoin", "BTC", "Ethereum", "ETH", "Litecoin", "Dogecoin", "Solana", "Ripple", "XRP", "Monero", "Tether", "USDT", "USDC", "NFT", "DeFi", "Uniswap", "OpenSea",
  "Spotify", "Netflix", "Hulu", "Disney+", "HBO", "Prime Video", "Crunchyroll", "SoundCloud", "Bandcamp", "Deezer", "Tidal", "Shazam", "Vimeo", "Dailymotion", "IMDb", "Letterboxd", "Goodreads", "Wikipedia", "Wikimedia", "Wiktionary", "Wikidata", "Fandom", "Genius", "Steam Deck", "Epic Games", "Fortnite", "Minecraft", "Roblox", "Valorant", "League of Legends", "Dota", "Dota 2", "Counter-Strike", "CS2", "CSGO", "Overwatch", "Apex Legends", "Call of Duty", "Warzone", "GTA", "Pokémon", "Pokemon", "Zelda", "Mario", "Genshin Impact", "Hearthstone", "World of Warcraft", "Blizzard", "Battle.net", "Ubisoft", "Origin", "GOG", "itch.io", "Twitch Prime", "OBS", "OBS Studio", "VLC", "Audacity", "GIMP", "Blender", "Inkscape", "Krita", "Photoshop", "Illustrator", "Premiere Pro", "After Effects", "Lightroom", "Figma", "Canva", "Sketch", "Unity", "Unreal Engine", "Godot",
  "Google", "Gmail", "Google Drive", "Google Docs", "Google Sheets", "Google Maps", "Google Play", "Google Photos", "Google Chrome", "Google Translate", "Google Search", "Google Pay", "Google Calendar", "Google Cloud", "Google Workspace", "Android Auto", "Waze", "Bing", "DuckDuckGo", "Startpage", "Ecosia", "Brave Search", "Yandex", "Naver", "Qwant", "Yahoo", "AOL", "Baidu", "Outlook", "OneDrive", "OneNote", "SharePoint", "PowerPoint", "Excel", "Xbox Live", "Microsoft Edge", "Cortana", "LinkedIn Learning", "Skype for Business", "iCloud", "iTunes", "App Store", "Apple Music", "Apple Pay", "FaceTime", "iMessage", "Siri", "AirDrop", "Amazon", "Alexa", "Kindle", "Audible", "Twitch.tv", "Dropbox", "Box", "Mega", "WeTransfer", "Notion App", "Evernote", "Trello", "Asana", "Jira", "Confluence", "Airtable", "Zapier", "IFTTT", "Obsidian", "Todoist", "Bitwarden", "LastPass", "1Password", "KeePass", "Proton", "ProtonMail", "Tutanota", "Tuta", "NordVPN", "ExpressVPN", "Mullvad", "ProtonVPN", "Surfshark", "WireGuard", "OpenVPN", "uBlock", "uBlock Origin", "AdGuard", "Pi-hole", "Tampermonkey", "Greasemonkey", "Wayback Machine", "Internet Archive", "Archive.org", "Let's Encrypt", "Mozilla", "Thunderbird", "Tails", "Whonix", "Qubes",
  "Do Not Track", "Google Analytics", "Facebook Pixel",
  "OK", "AM", "PM", "FAQ", "FAQs", "ID", "PIN", "SMS", "MMS", "ATM", "VIP", "CEO", "CTO", "DIY", "ASAP", "FYI", "LOL", "OMG", "AI", "ML", "AR", "VR", "XR", "IoT", "SaaS", "B2B", "B2C", "SEO", "KPI", "ROI", "NASA", "ESA", "UN", "EU", "UNESCO", "WHO", "NATO", "COVID-19", "COVID", "DNA", "RNA", "pH",
];

const AMBIGUOUS_CASE_SENSITIVE = new Set(["OK", "AM", "PM", "ID", "IP", "UI", "UX", "AR", "VR", "XR", "AI", "ML", "UN", "EU", "WHO", "PIN", "GIF", "Tor", "Kick", "Element", "Matrix", "Origin", "Box", "Mega", "Wise", "Ledger", "Switch", "Pixel", "Galaxy", "Lightning", "Ford", "Genius", "Medium", "Threads", "Wiki", "Java", "Swift", "Rust", "Ruby", "Go", "Dart", "Flask", "Bun", "Deno", "Babel", "Claude", "Gemini", "React", "Angular", "Vue", "Dell", "HP", "ARM", "Blink", "Gecko", "Tidal", "Line", "LINE", "Signal", "QQ", "VK", "Tails", "Proton", "Whisper", "Honda", "Kraken", "Stripe", "Copilot", "Slack", "Matrix"]);

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BOUND_L = "(?<![\\p{L}\\p{N}_])";
const BOUND_R = "(?![\\p{L}\\p{N}_])";

function compileNames(names, flags) {
  const list = Array.from(new Set(names.filter(Boolean))).sort((a, b) => b.length - a.length);
  if (!list.length) return null;
  return new RegExp(`${BOUND_L}(?:${list.map(esc).join("|")})${BOUND_R}`, flags);
}

const NAME_CI = compileNames(GLOBAL_NAMES.filter((n) => !AMBIGUOUS_CASE_SENSITIVE.has(n)), "giu");
const NAME_CS = compileNames(GLOBAL_NAMES.filter((n) => AMBIGUOUS_CASE_SENSITIVE.has(n)), "gu");

const SPAN_PATTERNS = [
  /\bhttps?:\/\/[^\s<>"')\]]+/giu,
  /\bwww\.[^\s<>"')\]]+/giu,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/gu,
  /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|app|gg|tv|xyz|co|me|ai|gov|edu|info|ly|to|cc|us|uk|de|fr|tr|ru|jp|cn|br|it|es|nl|pl|ua|in|kr|ca|au)\b(?:\/[^\s]*)?/giu,
  /\bbc1[a-z0-9]{25,62}\b/gu,
  /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/gu,
  /\b(?:0x)?[a-fA-F0-9]{16,}\b/gu,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu,
  /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/gu,
  /\b[A-Za-z]:\\[^\s]+|(?:\/[\w.\-]+){2,}\/?/gu,
  /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gu,
  /\b[a-z]+(?:[A-Z][a-z0-9]+)+\b/gu,
  /\b(?:[A-Z][a-z0-9]+){2,}\b/gu,
  /[@#][\p{L}\p{N}_]{2,}/gu,
  /\bv?\d+(?:\.\d+){2,}\b/gu,
  /\{\{[^}]*\}\}|\{[A-Za-z_][\w.]*\}|%[sd]|\$\{[^}]*\}/gu,
];

function looksLikeSecretToken(tok) {
  if (tok.length < 20 || /\s/.test(tok)) return false;
  const hasDigit = /\d/.test(tok), hasLower = /[a-z]/.test(tok), hasUpper = /[A-Z]/.test(tok);
  if (/^[A-Za-z0-9+/_\-=]+$/.test(tok) && hasDigit && (hasLower || hasUpper)) return true;
  if (hasLower && hasUpper && /^[A-Za-z0-9+/_\-=]+$/.test(tok)) return true;
  return false;
}

function isGibberishToken(tok) {
  const t = String(tok);
  if (t.length < 7 || !/^[A-Za-z]+$/.test(t)) return false;
  const letters = t.toLowerCase();
  const vowels = (letters.match(/[aeiouy]/g) || []).length;
  const ratio = vowels / letters.length;
  if (ratio < 0.14 || ratio > 0.78) return true;
  if (/[^aeiouy]{6,}/.test(letters)) return true;
  return false;
}

const SENSITIVE_HINT = /pass(word|wd|code|phrase)?\b|secret|api[-_ ]?key|apikey|access[-_ ]?token|auth[-_ ]?token|\btoken\b|wallet|seed[-_ ]?phrase|mnemonic|private[-_ ]?key|recovery[-_ ]?(code|key)|\botp\b|2fa|cvv|cvc|\biban\b|card[-_ ]?number|\bssn\b|txid|tx[-_ ]?hash|\bhash\b|checksum|signature|license[-_ ]?key|serial[-_ ]?(key|number)/i;
function isSensitiveHint(s) { return SENSITIVE_HINT.test(String(s || "")); }

function keepWordsRegex(keepWords) {
  if (!keepWords || !keepWords.size) return null;
  const list = Array.from(keepWords).filter((w) => w && w.length >= 3 && w.length <= 40);
  return compileNames(list, "giu");
}

function collectSpans(text, extraRe) {
  const spans = [];
  const push = (m) => { if (m && m[0] && m[0].length) spans.push({ start: m.index, end: m.index + m[0].length, value: m[0] }); };
  const runs = [NAME_CI, NAME_CS, extraRe, ...SPAN_PATTERNS];
  for (const re of runs) {
    if (!re) continue;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) { push(m); if (m[0].length === 0) re.lastIndex++; }
  }
  const tokRe = /[^\s"'`<>()\[\]{},;]+/gu;
  let t;
  while ((t = tokRe.exec(text))) if (looksLikeSecretToken(t[0])) push(t);
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let end = -1;
  for (const s of spans) { if (s.start < end) continue; out.push(s); end = s.end; }
  return out;
}

function planText(text, opts = {}) {
  const src = String(text ?? "");
  const trimmed = src.trim();
  if (!trimmed || !/\p{L}/u.test(trimmed)) return null;
  const symbols = (trimmed.match(/[{}();=<>\[\]\\|$`]/g) || []).length;
  if (trimmed.length >= 6 && symbols / trimmed.length > 0.09) return null;
  if (/=>|===|!==|\);|\bfunction\s*\(|\b(?:const|let|var)\s+\w+\s*=/.test(trimmed)) return null;
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 1 && (looksLikeSecretToken(trimmed) || isGibberishToken(trimmed))) return null;
  if (tokens.length > 1 && tokens.length <= 12) {
    const bad = tokens.filter((x) => isGibberishToken(x.replace(/[^A-Za-z]/g, ""))).length;
    if (bad / tokens.length > 0.6) return null;
  }
  const spans = collectSpans(src, opts.keepRegex || null);
  if (!spans.length) return { keep: [], pieces: [{ type: "text", value: src }] };
  const pieces = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start > cursor) pieces.push({ type: "text", value: src.slice(cursor, s.start) });
    pieces.push({ type: "keep", value: s.value });
    cursor = s.end;
  }
  if (cursor < src.length) pieces.push({ type: "text", value: src.slice(cursor) });
  if (!pieces.some((p) => p.type === "text" && /\p{L}/u.test(p.value))) return null;
  return { keep: spans.map((s) => s.value), pieces };
}

module.exports = { SENSITIVE_HINT, GLOBAL_NAMES, planText, keepWordsRegex, isSensitiveHint, looksLikeSecretToken, isGibberishToken };
