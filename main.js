
function getUpdatePlatform() {
    return process.platform === "win32" ? "Windows" : process.platform === "linux" ? "Linux" : null;
}

function isPlatformRelease(tag) {
    const platform = getUpdatePlatform();
    if (!platform) return false;
    return new RegExp(`^\\d+(?:\\.\\d+){2}-${platform}$`).test(String(tag || "").trim());
}

const {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  session,
  shell,
  globalShortcut,
  Menu,
  dialog,
  clipboard,
} = require("electron");

for (const k of ["log", "info", "warn", "error", "debug", "trace"]) console[k] = () => {};
try {
  app.commandLine.appendSwitch("log-level", "3");
  app.commandLine.appendSwitch("disable-logging");
} catch {}
try { app.setName("Murky"); } catch {}
if (process.platform === "win32") { try { app.setAppUserModelId("com.murky.browser"); } catch {} }
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Store = require("electron-store");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");
const { Readable } = require("stream");
const https = require("https");
const http = require("http");
const { pipeline } = require("stream/promises");
const { autoUpdater } = require("electron-updater");


const DEFAULT_SETTINGS = {
  theme: "murky-deep",  
  accent: "#E3A857",
  background: "#0A1412",
  surface: "#10201D",
  toolbarScale: 1.0,
  showSidebar: true,
  sidebarSide: "left",
  fontFamily: "system",
  uiFontScale: 1.0,
  pageZoom: 1.0,
  searchEngine: "duckduckgo",  
  adBlockEnabled: true,
  trackerBlockEnabled: true,
  doNotTrack: true,
  askWhereToSave: false,
  tabOpenBehavior: "dynamic",  
  startupBehavior: "newtab",  
  preferredLanguages: ["en"],
};

const store = new Store({
  name: "murky-settings",
  defaults: {
    settings: { ...DEFAULT_SETTINGS },
    bookmarks: [],
    history: [],
    lastSession: [],
    onboardingCompleted: false,
    extensions: [],
    extensionPinned: [],
  },
});

const storedSettings = store.get("settings") || {};
if ("forceDarkMode" in storedSettings || "localOnlyMode" in storedSettings) {
  delete storedSettings.forceDarkMode;
  delete storedSettings.localOnlyMode;
  store.set("settings", storedSettings);
}

 
 
const AD_DOMAINS = [
  "doubleclick.net", "googlesyndication.com", "googleadservices.com",
  "adservice.google.com", "adnxs.com", "advertising.com", "adsafeprotected.com",
  "taboola.com", "outbrain.com", "criteo.com", "pubmatic.com", "rubiconproject.com",
  "moatads.com", "media.net", "zedo.com", "bidswitch.net", "openx.net",
];
const TRACKER_DOMAINS = [
  "google-analytics.com", "googletagmanager.com", "facebook.net",
  "connect.facebook.net", "hotjar.com", "mixpanel.com", "segment.io",
  "amplitude.com", "scorecardresearch.com", "quantserve.com", "chartbeat.com",
  "newrelic.com", "sentry-cdn.com",
];

let mainWindow = null;
const tabs = new Map();  
let activeTabId = null;
let tabCounter = 0;
let sidebarFlyoutOpen = false;  
let isQuitting = false;
let tabOverlayWindow = null;
let linkTipWindow = null;
let tabOverlayHideTimer = null;
let onboardingWindow = null;
let updateWindow = null;
let updateInfo = null;
let updateDownloaded = false;
let updateDownloadStarted = false;
let devtoolsView = null;
let devtoolsOpen = false;
let pendingDevToolsInspect = null;
let browserDialogView = null;
let browserDialogClosing = false;
let browserDialogOpen = false;
let toolbarScalePreview = null;
let browserDialogType = "alert";
const pendingJavaScriptDialogs = new Map();
let siteInfoView = null;
let siteInfoOpen = false;
let siteInfoPoint = null;
let siteInfoHeight = 190;
const SITE_INFO_WIDTH = 292;
let extensionPopupView = null;
let extensionPopupOpen = false;
let extensionPopupPoint = null;
let extensionActionView = null;
let translationPopupView = null;
let translationPopupOpen = false;
let translationOffer = null;
let translationPopupDismissedUrl = null;
let translationEnginePromise = null;
let translationEngineWindow = null;
let translationEngineServer = null;
let translationEngineServerPort = null;
const murkyTranslationRuns = new WeakMap();
const murkyTranslationPageState = new Map();
const murkyTranslationTasks = new Map();
const murkyTranslationChecks = new Map();
const murkyAutoTranslate = { on: false };
const murkyPageScrollbarCssKeys = new WeakMap();
let translationPopupTabId = null;
const murkyTranslationStateKey = (wc) => { try { return `${wc.id}:${wc.getURL()}`; } catch (_) { return String(wc?.id || 'unknown'); } };
const outboundRequestLog = [];
const MAX_OUTBOUND_REQUEST_LOG = 2000;
const pendingOutboundRequests = new Map();
let lastUpdateCheckStatus = "Not checked yet";

function recordOutboundRequest(entry) {
  const url = String(entry?.url || "");
  if (!url || url.startsWith("file:") || url.startsWith("devtools:")) return;
  const requestId = String(entry?.id ?? "");
  const existingIndex = requestId ? outboundRequestLog.findIndex((r) => r.requestId === requestId && !r.finished) : -1;
  const safe = {
    requestId: requestId || null,
    time: existingIndex >= 0 ? outboundRequestLog[existingIndex].time : new Date().toISOString(),
    method: String(entry.method || "GET"),
    url,
    resourceType: String(entry.resourceType || "other"),
    status: Number.isFinite(entry.statusCode) ? entry.statusCode : (Number.isFinite(entry.status) ? entry.status : null),
    error: entry.error ? String(entry.error) : null,
    blocked: !!entry.blocked,
    finished: !!entry.statusCode || !!entry.error || !!entry.finished,
  };
  if (existingIndex >= 0) outboundRequestLog[existingIndex] = { ...outboundRequestLog[existingIndex], ...safe };
  else outboundRequestLog.push(safe);
  if (outboundRequestLog.length > MAX_OUTBOUND_REQUEST_LOG) outboundRequestLog.splice(0, outboundRequestLog.length - MAX_OUTBOUND_REQUEST_LOG);
}


function trustSnapshot() {
  return {
    version: app.getVersion(),
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    updateStatus: lastUpdateCheckStatus,
    updateAvailable: !!updateInfo,
    updateVersion: updateInfo?.version || null,
    outboundRequestCount: outboundRequestLog.length,
  };
}
let extensionActionOpen = false;
const EXTENSION_POPUP_WIDTH = 360;
const EXTENSION_POPUP_MAX_HEIGHT = 520;
const EXTENSIONS_DIR = path.join(app.getPath("userData"), "extensions");
const loadedExtensions = new Map();
const DEVTOOLS_WIDTH = 420;
const DEVTOOLS_INTERNAL_URL = "murky://devtools";

 
 
 
let whisperModule = null;
let whisperContext = null;
let whisperModelPath = null;
let whisperInitPromise = null;
const WHISPER_MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin";
const WHISPER_MODEL_NAME = "ggml-base-q5_1.bin";

const TITLEBAR_HEIGHT = 44;
const TOOLBAR_HEIGHT = 44;  
const SIDEBAR_RAIL_WIDTH = 56;  
const SIDEBAR_FLYOUT_WIDTH = 280;  

const MURKY_LANGUAGES = [
  ["ar", "العربية"], ["bg", "Български"], ["bs", "Bosanski"], ["ca", "Català"],
  ["zh", "中文（简体）"], ["hr", "Hrvatski"], ["cs", "Čeština"], ["da", "Dansk"],
  ["nl", "Nederlands"], ["en", "English"], ["et", "Eesti"], ["fi", "Suomi"],
  ["fr", "Français"], ["de", "Deutsch"], ["el", "Ελληνικά"], ["hu", "Magyar"],
  ["is", "Íslenska"], ["id", "Bahasa Indonesia"], ["it", "Italiano"], ["ja", "日本語"],
  ["ko", "한국어"], ["lv", "Latviešu"], ["lt", "Lietuvių"], ["mt", "Malti"],
  ["nb", "Norsk bokmål"], ["nn", "Norsk nynorsk"], ["fa", "فارسی"], ["pl", "Polski"],
  ["pt", "Português"], ["ro", "Română"], ["ru", "Русский"], ["sr", "Српски"],
  ["sk", "Slovenčina"], ["sl", "Slovenščina"], ["es", "Español"], ["sv", "Svenska"],
  ["tr", "Türkçe"], ["uk", "Українська"], ["vi", "Tiếng Việt"],
];
const MURKY_LANG_MAP = Object.fromEntries(MURKY_LANGUAGES.map(([code,name]) => [code,{code,name}]));
const MURKY_ISO3 = {ara:"ar",bul:"bg",bos:"bs",cat:"ca",zho:"zh",hrv:"hr",ces:"cs",dan:"da",nld:"nl",eng:"en",est:"et",fin:"fi",fra:"fr",deu:"de",ell:"el",hun:"hu",isl:"is",ind:"id",ita:"it",jpn:"ja",kor:"ko",lav:"lv",lit:"lt",mlt:"mt",nob:"nb",nno:"nn",fas:"fa",pol:"pl",por:"pt",ron:"ro",rus:"ru",srp:"sr",slk:"sk",slv:"sl",spa:"es",swe:"sv",tur:"tr",ukr:"uk",vie:"vi",fil:"tl"};
const TRANSLATABLE_EN_TARGETS = new Set(["ar","bg","bs","ca","zh","hr","cs","da","nl","et","fi","fr","de","el","hu","is","id","it","ja","ko","lv","lt","mt","nb","nn","fa","pl","pt","ro","ru","sr","sk","sl","es","sv","tr","uk","vi"]);
const BERGAMOT_SOURCE_TO_EN = new Set(["ar","bg","bs","ca","zh","hr","cs","da","nl","et","fi","fr","de","el","hu","is","id","it","ja","ko","lv","lt","mt","nb","nn","fa","pl","pt","ro","ru","sr","sk","sl","es","sv","tr","uk","vi"]);
const BERGAMOT_EN_TO_TARGET = new Set(["ar","bg","ca","cs","da","de","el","es","et","fa","fi","fr","hr","hu","id","it","ja","ko","lt","lv","nl","pl","pt","ro","ru","sk","sl","sv","tr","uk","vi","az","bn","gu","he","hi","kn","ml","ms","sq","ta","te","zh"]);
function canBergamotTranslate(source, target){
  const s=normalizeLanguage(source), t=normalizeLanguage(target);
  if(!s||!t) return false;
  if(s===t) return true;
  if(s==="en") return BERGAMOT_EN_TO_TARGET.has(t);
  if(t==="en") return BERGAMOT_SOURCE_TO_EN.has(s);
  return BERGAMOT_SOURCE_TO_EN.has(s) && BERGAMOT_EN_TO_TARGET.has(t);
}
const UNIVERSAL_TERMS = ["Murky","Electron","Chromium","Node.js","JavaScript","TypeScript","HTML","CSS","WebAssembly","WASM","Bergamot","GitHub","Windows","Linux","macOS","Android","iOS","USB","URL","HTTP","HTTPS","JSON","API","DOM","DevTools","Whisper","Vulkan","OpenGL","DirectX","Wi-Fi","Bluetooth","Google","Bing","DuckDuckGo","Startpage","Ecosia","Do Not Track"];
const BUILTIN_TRANSLATIONS = {"tr":{"New tab":"Yeni sekme","Close tab":"Sekmeyi kapat","Zoom out":"Uzaklaştır","Reset zoom":"Yakınlaştırmayı sıfırla","Zoom in":"Yakınlaştır","Toggle sidebar":"Kenar çubuğunu aç/kapat","Murky Settings":"Murky Ayarları","Privacy Policy":"Gizlilik Politikası","Terms of Service":"Hizmet Şartları","Downloads":"İndirmeler","Recent Activity":"Son Etkinlik","Bookmarks":"Yer İmleri","Extensions":"Uzantılar","Manage Extensions":"Uzantıları Yönet","Appearance":"Görünüm","Typography":"Tipografi","Browsing":"Gezinme","Privacy":"Gizlilik","Language":"Dil","System":"Sistem","About":"Hakkında","Reset":"Sıfırla","Accent color":"Vurgu rengi","Background color":"Arka plan rengi","Toolbar size":"Araç çubuğu boyutu","Sidebar position":"Kenar çubuğu konumu","Interface font":"Arayüz yazı tipi","UI text scale":"Arayüz metin ölçeği","Search engine":"Arama motoru","New tab behavior":"Yeni sekme davranışı","Startup behavior":"Başlangıç davranışı","Page zoom":"Sayfa yakınlaştırması","Block known ad networks":"Bilinen reklam ağlarını engelle","Block known trackers and analytics":"Bilinen izleyicileri ve analizleri engelle","Send \"Do Not Track\" requests":"\"Do Not Track\" istekleri gönder","Ask where to save each download":"Her indirmede kaydedilecek yeri sor","Clear browsing history":"Tarama geçmişini temizle","Preferred Languages":"Tercih Edilen Diller","Let websites know the languages you speak.":"Web sitelerine konuştuğunuz dilleri bildirin.","Maximum 5 languages can be selected at a time!":"Aynı anda en fazla 5 dil seçilebilir!","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Bu dile Murky menülerini, açılır pencerelerini, ayarlarını ve diğer metinlerini çevirmede öncelik verilir.","Murky version":"Murky sürümü","Update status":"Güncelleme durumu","Outbound requests":"Giden istekler","Export request log":"İstek günlüğünü dışa aktar","Before clearing history":"Geçmişi temizlemeden önce","Crash recovery":"Çökme kurtarma","Website permissions":"Web sitesi izinleri","Local-only mode":"Yalnızca yerel mod","Export local data":"Yerel verileri dışa aktar","Purge local data":"Yerel verileri temizle","Check for updates":"Güncellemeleri kontrol et","Export":"Dışa aktar","Export history":"Geçmişi dışa aktar","Purge":"Temizle","Reset all settings":"Tüm ayarları sıfırla","Reset all":"Tümünü sıfırla","Warning":"Uyarı","Where to, today?":"Bugün nereye?","Good morning. Where to?":"Günaydın. Nereye?","Morning. What are we finding today?":"Günaydın. Bugün ne arıyoruz?","Rise and search.":"Uyan ve ara.","Good afternoon. Where to?":"İyi günler. Nereye?","Afternoon. What's next?":"İyi günler. Sırada ne var?","Where to, this afternoon?":"Bu öğleden sonra nereye?","Good evening. Where to?":"İyi akşamlar. Nereye?","Evening. What can we find?":"İyi akşamlar. Ne bulabiliriz?","Where to, tonight?":"Bu gece nereye?","Still up? Where to?":"Hâlâ ayakta mısın? Nereye?","Good night, one more search?":"İyi geceler, bir arama daha mı?","Quiet hours. Where to?":"Sessiz saatler. Nereye?","Downloaded":"İndirildi","Cancelled":"İptal edildi","Download complete":"İndirme tamamlandı","Download cancelled":"İndirme iptal edildi","Search":"Ara","No bookmarks yet, tap the star in the address bar to save a page.":"Henüz yer imi yok. Bir sayfayı kaydetmek için adres çubuğundaki yıldıza dokunun.","Translate":"Çevir"},"de":{"New tab":"Neuer Tab","Close tab":"Tab schließen","Zoom out":"Verkleinern","Reset zoom":"Zoom zurücksetzen","Zoom in":"Vergrößern","Toggle sidebar":"Seitenleiste umschalten","Murky Settings":"Murky-Einstellungen","Privacy Policy":"Datenschutzerklärung","Terms of Service":"Nutzungsbedingungen","Downloads":"Downloads","Recent Activity":"Letzte Aktivitäten","Bookmarks":"Lesezeichen","Extensions":"Erweiterungen","Manage Extensions":"Erweiterungen verwalten","Appearance":"Darstellung","Typography":"Typografie","Browsing":"Surfen","Privacy":"Datenschutz","Language":"Sprache","System":"System","About":"Über","Reset":"Zurücksetzen","Accent color":"Akzentfarbe","Background color":"Hintergrundfarbe","Toolbar size":"Symbolleistengröße","Sidebar position":"Position der Seitenleiste","Interface font":"Oberflächenschrift","UI text scale":"UI-Textgröße","Search engine":"Suchmaschine","New tab behavior":"Verhalten neuer Tabs","Startup behavior":"Startverhalten","Page zoom":"Seitenzoom","Block known ad networks":"Bekannte Werbenetzwerke blockieren","Block known trackers and analytics":"Bekannte Tracker und Analysen blockieren","Send \"Do Not Track\" requests":"\"Do Not Track\\“-Anfragen senden","Ask where to save each download":"Vor jedem Download nach Speicherort fragen","Clear browsing history":"Browserverlauf löschen","Preferred Languages":"Bevorzugte Sprachen","Let websites know the languages you speak.":"Websites über die von dir gesprochenen Sprachen informieren.","Maximum 5 languages can be selected at a time!":"Es können höchstens 5 Sprachen gleichzeitig ausgewählt werden!","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Diese Sprache hat Vorrang bei der Übersetzung von Menüs, Popups, Einstellungen und anderen Murky-Texten.","Murky version":"Murky-Version","Update status":"Update-Status","Outbound requests":"Ausgehende Anfragen","Export request log":"Anfrageprotokoll exportieren","Before clearing history":"Vor dem Löschen des Verlaufs","Crash recovery":"Absturz-Wiederherstellung","Website permissions":"Website-Berechtigungen","Local-only mode":"Nur-lokal-Modus","Export local data":"Lokale Daten exportieren","Purge local data":"Lokale Daten löschen","Check for updates":"Nach Updates suchen","Export":"Exportieren","Export history":"Verlauf exportieren","Purge":"Löschen","Reset all settings":"Alle Einstellungen zurücksetzen","Reset all":"Alle zurücksetzen","Warning":"Warnung","Where to, today?":"Wohin heute?","Good morning. Where to?":"Guten Morgen. Wohin?","Morning. What are we finding today?":"Guten Morgen. Was suchen wir heute?","Rise and search.":"Aufstehen und suchen.","Good afternoon. Where to?":"Guten Tag. Wohin?","Afternoon. What's next?":"Guten Tag. Was kommt als Nächstes?","Where to, this afternoon?":"Wohin heute Nachmittag?","Good evening. Where to?":"Guten Abend. Wohin?","Evening. What can we find?":"Guten Abend. Was können wir finden?","Where to, tonight?":"Wohin heute Abend?","Still up? Where to?":"Noch wach? Wohin?","Good night, one more search?":"Gute Nacht, noch eine Suche?","Quiet hours. Where to?":"Ruhige Stunden. Wohin?","Downloaded":"Heruntergeladen","Cancelled":"Abgebrochen","Download complete":"Download abgeschlossen","Download cancelled":"Download abgebrochen","Search":"Suche","No bookmarks yet, tap the star in the address bar to save a page.":"Noch keine Lesezeichen. Klicke auf den Stern in der Adressleiste, um eine Seite zu speichern.","Translate":"Übersetzen"},"fr":{"New tab":"Nouvel onglet","Close tab":"Fermer l’onglet","Zoom out":"Dézoomer","Reset zoom":"Réinitialiser le zoom","Zoom in":"Zoomer","Toggle sidebar":"Afficher/masquer la barre latérale","Murky Settings":"Paramètres de Murky","Privacy Policy":"Politique de confidentialité","Terms of Service":"Conditions d’utilisation","Downloads":"Téléchargements","Recent Activity":"Activité récente","Bookmarks":"Favoris","Extensions":"Extensions","Manage Extensions":"Gérer les extensions","Appearance":"Apparence","Typography":"Typographie","Browsing":"Navigation","Privacy":"Confidentialité","Language":"Langue","System":"Système","About":"À propos","Reset":"Réinitialiser","Accent color":"Couleur d’accentuation","Background color":"Couleur d’arrière-plan","Toolbar size":"Taille de la barre d’outils","Sidebar position":"Position de la barre latérale","Interface font":"Police de l’interface","UI text scale":"Échelle du texte de l’interface","Search engine":"Moteur de recherche","New tab behavior":"Comportement des nouveaux onglets","Startup behavior":"Comportement au démarrage","Page zoom":"Zoom des pages","Block known ad networks":"Bloquer les réseaux publicitaires connus","Block known trackers and analytics":"Bloquer les traqueurs et analyses connus","Send \"Do Not Track\" requests":"Envoyer les requêtes « Do Not Track »","Ask where to save each download":"Demander où enregistrer chaque téléchargement","Clear browsing history":"Effacer l’historique de navigation","Preferred Languages":"Langues préférées","Let websites know the languages you speak.":"Indiquer aux sites les langues que vous parlez.","Maximum 5 languages can be selected at a time!":"Vous pouvez sélectionner au maximum 5 langues à la fois !","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Cette langue est prioritaire pour traduire les menus, fenêtres contextuelles, paramètres et autres textes de Murky.","Murky version":"Version de Murky","Update status":"État des mises à jour","Outbound requests":"Requêtes sortantes","Export request log":"Exporter le journal des requêtes","Before clearing history":"Avant d’effacer l’historique","Crash recovery":"Récupération après plantage","Website permissions":"Autorisations des sites","Local-only mode":"Mode local uniquement","Export local data":"Exporter les données locales","Purge local data":"Effacer les données locales","Check for updates":"Rechercher des mises à jour","Export":"Exporter","Export history":"Exporter l’historique","Purge":"Effacer","Reset all settings":"Réinitialiser tous les paramètres","Reset all":"Tout réinitialiser","Warning":"Avertissement","Where to, today?":"Où aller aujourd’hui ?","Good morning. Where to?":"Bonjour. Où aller ?","Morning. What are we finding today?":"Bonjour. Que cherchons-nous aujourd’hui ?","Rise and search.":"Debout et recherchez.","Good afternoon. Where to?":"Bon après-midi. Où aller ?","Afternoon. What's next?":"Bon après-midi. Quelle est la suite ?","Where to, this afternoon?":"Où aller cet après-midi ?","Good evening. Where to?":"Bonsoir. Où aller ?","Evening. What can we find?":"Bonsoir. Que pouvons-nous trouver ?","Where to, tonight?":"Où aller ce soir ?","Still up? Where to?":"Encore debout ? Où aller ?","Good night, one more search?":"Bonne nuit, encore une recherche ?","Quiet hours. Where to?":"Heures calmes. Où aller ?","Downloaded":"Téléchargé","Cancelled":"Annulé","Download complete":"Téléchargement terminé","Download cancelled":"Téléchargement annulé","Search":"Rechercher","No bookmarks yet, tap the star in the address bar to save a page.":"Aucun favori. Appuyez sur l’étoile de la barre d’adresse pour enregistrer une page.","Translate":"Traduire"},"es":{"New tab":"Nueva pestaña","Close tab":"Cerrar pestaña","Zoom out":"Alejar","Reset zoom":"Restablecer zoom","Zoom in":"Acercar","Toggle sidebar":"Alternar barra lateral","Murky Settings":"Configuración de Murky","Privacy Policy":"Política de privacidad","Terms of Service":"Términos de servicio","Downloads":"Descargas","Recent Activity":"Actividad reciente","Bookmarks":"Marcadores","Extensions":"Extensiones","Manage Extensions":"Administrar extensiones","Appearance":"Apariencia","Typography":"Tipografía","Browsing":"Navegación","Privacy":"Privacidad","Language":"Idioma","System":"Sistema","About":"Acerca de","Reset":"Restablecer","Accent color":"Color de acento","Background color":"Color de fondo","Toolbar size":"Tamaño de la barra de herramientas","Sidebar position":"Posición de la barra lateral","Interface font":"Fuente de la interfaz","UI text scale":"Escala del texto de la interfaz","Search engine":"Motor de búsqueda","New tab behavior":"Comportamiento de nuevas pestañas","Startup behavior":"Comportamiento al iniciar","Page zoom":"Zoom de página","Block known ad networks":"Bloquear redes publicitarias conocidas","Block known trackers and analytics":"Bloquear rastreadores y analíticas conocidas","Send \"Do Not Track\" requests":"Enviar solicitudes \"Do Not Track\"","Ask where to save each download":"Preguntar dónde guardar cada descarga","Clear browsing history":"Borrar historial de navegación","Preferred Languages":"Idiomas preferidos","Let websites know the languages you speak.":"Permite que los sitios sepan los idiomas que hablas.","Maximum 5 languages can be selected at a time!":"Se pueden seleccionar como máximo 5 idiomas a la vez.","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Este idioma tiene prioridad para traducir menús, ventanas emergentes, ajustes y otros textos de Murky.","Murky version":"Versión de Murky","Update status":"Estado de actualización","Outbound requests":"Solicitudes salientes","Export request log":"Exportar registro de solicitudes","Before clearing history":"Antes de borrar el historial","Crash recovery":"Recuperación ante fallos","Website permissions":"Permisos de sitios web","Local-only mode":"Modo solo local","Export local data":"Exportar datos locales","Purge local data":"Borrar datos locales","Check for updates":"Buscar actualizaciones","Export":"Exportar","Export history":"Exportar historial","Purge":"Borrar","Reset all settings":"Restablecer todos los ajustes","Reset all":"Restablecer todo","Warning":"Advertencia","Where to, today?":"¿Adónde hoy?","Good morning. Where to?":"Buenos días. ¿Adónde?","Morning. What are we finding today?":"Buenos días. ¿Qué buscamos hoy?","Rise and search.":"Levántate y busca.","Good afternoon. Where to?":"Buenas tardes. ¿Adónde?","Afternoon. What's next?":"Buenas tardes. ¿Qué sigue?","Where to, this afternoon?":"¿Adónde esta tarde?","Good evening. Where to?":"Buenas noches. ¿Adónde?","Evening. What can we find?":"Buenas noches. ¿Qué podemos encontrar?","Where to, tonight?":"¿Adónde esta noche?","Still up? Where to?":"¿Sigues despierto? ¿Adónde?","Good night, one more search?":"Buenas noches, ¿una búsqueda más?","Quiet hours. Where to?":"Horas tranquilas. ¿Adónde?","Downloaded":"Descargado","Cancelled":"Cancelado","Download complete":"Descarga completada","Download cancelled":"Descarga cancelada","Search":"Buscar","No bookmarks yet, tap the star in the address bar to save a page.":"Aún no hay marcadores. Pulsa la estrella de la barra de direcciones para guardar una página.","Translate":"Traducir"},"it":{"New tab":"Nuova scheda","Close tab":"Chiudi scheda","Zoom out":"Riduci zoom","Reset zoom":"Reimposta zoom","Zoom in":"Aumenta zoom","Toggle sidebar":"Attiva/disattiva barra laterale","Murky Settings":"Impostazioni di Murky","Privacy Policy":"Informativa sulla privacy","Terms of Service":"Termini di servizio","Downloads":"Download","Recent Activity":"Attività recenti","Bookmarks":"Segnalibri","Extensions":"Estensioni","Manage Extensions":"Gestisci estensioni","Appearance":"Aspetto","Typography":"Tipografia","Browsing":"Navigazione","Privacy":"Privacy","Language":"Lingua","System":"Sistema","About":"Informazioni","Reset":"Reimposta","Accent color":"Colore principale","Background color":"Colore di sfondo","Toolbar size":"Dimensione barra degli strumenti","Sidebar position":"Posizione barra laterale","Interface font":"Carattere interfaccia","UI text scale":"Scala testo interfaccia","Search engine":"Motore di ricerca","New tab behavior":"Comportamento nuove schede","Startup behavior":"Comportamento all'avvio","Page zoom":"Zoom pagina","Block known ad networks":"Blocca reti pubblicitarie note","Block known trackers and analytics":"Blocca tracker e analisi note","Send \"Do Not Track\" requests":"Invia richieste \"Do Not Track\"","Ask where to save each download":"Chiedi dove salvare ogni download","Clear browsing history":"Cancella cronologia di navigazione","Preferred Languages":"Lingue preferite","Let websites know the languages you speak.":"Fai sapere ai siti quali lingue parli.","Maximum 5 languages can be selected at a time!":"Puoi selezionare al massimo 5 lingue alla volta!","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Questa lingua ha la priorità per tradurre menu, popup, impostazioni e altri testi di Murky.","Murky version":"Versione di Murky","Update status":"Stato aggiornamento","Outbound requests":"Richieste in uscita","Export request log":"Esporta registro richieste","Before clearing history":"Prima di cancellare la cronologia","Crash recovery":"Ripristino dopo un arresto anomalo","Website permissions":"Permessi dei siti","Local-only mode":"Modalità solo locale","Export local data":"Esporta dati locali","Purge local data":"Cancella dati locali","Check for updates":"Controlla aggiornamenti","Export":"Esporta","Export history":"Esporta cronologia","Purge":"Cancella","Reset all settings":"Reimposta tutte le impostazioni","Reset all":"Reimposta tutto","Warning":"Avviso","Where to, today?":"Dove andiamo oggi?","Good morning. Where to?":"Buongiorno. Dove andiamo?","Morning. What are we finding today?":"Buongiorno. Cosa cerchiamo oggi?","Rise and search.":"Alzati e cerca.","Good afternoon. Where to?":"Buon pomeriggio. Dove andiamo?","Afternoon. What's next?":"Buon pomeriggio. Cosa c'è dopo?","Where to, this afternoon?":"Dove andiamo questo pomeriggio?","Good evening. Where to?":"Buonasera. Dove andiamo?","Evening. What can we find?":"Buonasera. Cosa possiamo trovare?","Where to, tonight?":"Dove andiamo stasera?","Still up? Where to?":"Ancora sveglio? Dove andiamo?","Good night, one more search?":"Buonanotte, un'altra ricerca?","Quiet hours. Where to?":"Ore tranquille. Dove andiamo?","Downloaded":"Scaricato","Cancelled":"Annullato","Download complete":"Download completato","Download cancelled":"Download annullato","Search":"Cerca","No bookmarks yet, tap the star in the address bar to save a page.":"Nessun segnalibro. Tocca la stella nella barra degli indirizzi per salvare una pagina.","Translate":"Traduci"},"pt":{"New tab":"Nova aba","Close tab":"Fechar aba","Zoom out":"Diminuir zoom","Reset zoom":"Redefinir zoom","Zoom in":"Aumentar zoom","Toggle sidebar":"Alternar barra lateral","Murky Settings":"Configurações do Murky","Privacy Policy":"Política de privacidade","Terms of Service":"Termos de serviço","Downloads":"Downloads","Recent Activity":"Atividade recente","Bookmarks":"Favoritos","Extensions":"Extensões","Manage Extensions":"Gerenciar extensões","Appearance":"Aparência","Typography":"Tipografia","Browsing":"Navegação","Privacy":"Privacidade","Language":"Idioma","System":"Sistema","About":"Sobre","Reset":"Redefinir","Accent color":"Cor de destaque","Background color":"Cor de fundo","Toolbar size":"Tamanho da barra de ferramentas","Sidebar position":"Posição da barra lateral","Interface font":"Fonte da interface","UI text scale":"Escala do texto da interface","Search engine":"Mecanismo de pesquisa","New tab behavior":"Comportamento de novas abas","Startup behavior":"Comportamento de inicialização","Page zoom":"Zoom da página","Block known ad networks":"Bloquear redes de anúncios conhecidas","Block known trackers and analytics":"Bloquear rastreadores e análises conhecidos","Send \"Do Not Track\" requests":"Enviar solicitações \"Do Not Track\"","Ask where to save each download":"Perguntar onde salvar cada download","Clear browsing history":"Limpar histórico de navegação","Preferred Languages":"Idiomas preferidos","Let websites know the languages you speak.":"Permita que os sites saibam quais idiomas você fala.","Maximum 5 languages can be selected at a time!":"No máximo 5 idiomas podem ser selecionados ao mesmo tempo!","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Este idioma tem prioridade para traduzir menus, pop-ups, configurações e outros textos do Murky.","Murky version":"Versão do Murky","Update status":"Status da atualização","Outbound requests":"Solicitações de saída","Export request log":"Exportar registro de solicitações","Before clearing history":"Antes de limpar o histórico","Crash recovery":"Recuperação de falhas","Website permissions":"Permissões de sites","Local-only mode":"Modo somente local","Export local data":"Exportar dados locais","Purge local data":"Apagar dados locais","Check for updates":"Verificar atualizações","Export":"Exportar","Export history":"Exportar histórico","Purge":"Apagar","Reset all settings":"Redefinir todas as configurações","Reset all":"Redefinir tudo","Warning":"Aviso","Where to, today?":"Para onde hoje?","Good morning. Where to?":"Bom dia. Para onde?","Morning. What are we finding today?":"Bom dia. O que vamos encontrar hoje?","Rise and search.":"Levante-se e pesquise.","Good afternoon. Where to?":"Boa tarde. Para onde?","Afternoon. What's next?":"Boa tarde. O que vem agora?","Where to, this afternoon?":"Para onde esta tarde?","Good evening. Where to?":"Boa noite. Para onde?","Evening. What can we find?":"Boa noite. O que podemos encontrar?","Where to, tonight?":"Para onde esta noite?","Still up? Where to?":"Ainda acordado? Para onde?","Good night, one more search?":"Boa noite, mais uma pesquisa?","Quiet hours. Where to?":"Horas tranquilas. Para onde?","Downloaded":"Baixado","Cancelled":"Cancelado","Download complete":"Download concluído","Download cancelled":"Download cancelado","Search":"Pesquisar","No bookmarks yet, tap the star in the address bar to save a page.":"Ainda não há favoritos. Toque na estrela da barra de endereço para salvar uma página.","Translate":"Traduzir"},"nl":{"New tab":"Nieuw tabblad","Close tab":"Tabblad sluiten","Zoom out":"Uitzoomen","Reset zoom":"Zoom resetten","Zoom in":"Inzoomen","Toggle sidebar":"Zijbalk in-/uitschakelen","Murky Settings":"Murky-instellingen","Privacy Policy":"Privacybeleid","Terms of Service":"Servicevoorwaarden","Downloads":"Downloads","Recent Activity":"Recente activiteit","Bookmarks":"Bladwijzers","Extensions":"Extensies","Manage Extensions":"Extensies beheren","Appearance":"Uiterlijk","Typography":"Typografie","Browsing":"Browsen","Privacy":"Privacy","Language":"Taal","System":"Systeem","About":"Over","Reset":"Resetten","Accent color":"Accentkleur","Background color":"Achtergrondkleur","Toolbar size":"Werkbalkgrootte","Sidebar position":"Positie van zijbalk","Interface font":"Interfacelettertype","UI text scale":"Schaal van UI-tekst","Search engine":"Zoekmachine","New tab behavior":"Gedrag van nieuwe tabbladen","Startup behavior":"Opstartgedrag","Page zoom":"Paginazoom","Block known ad networks":"Bekende advertentienetwerken blokkeren","Block known trackers and analytics":"Bekende trackers en analyses blokkeren","Send \"Do Not Track\" requests":"\"Do Not Track\"-verzoeken verzenden","Ask where to save each download":"Vragen waar elke download moet worden opgeslagen","Clear browsing history":"Browsegeschiedenis wissen","Preferred Languages":"Voorkeurstalen","Let websites know the languages you speak.":"Laat websites weten welke talen je spreekt.","Maximum 5 languages can be selected at a time!":"Er kunnen maximaal 5 talen tegelijk worden geselecteerd!","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Deze taal krijgt voorrang bij het vertalen van menu's, pop-ups, instellingen en andere tekst in Murky.","Murky version":"Murky-versie","Update status":"Updatestatus","Outbound requests":"Uitgaande verzoeken","Export request log":"Verzoekenlogboek exporteren","Before clearing history":"Voor het wissen van geschiedenis","Crash recovery":"Herstel na crash","Website permissions":"Website-machtigingen","Local-only mode":"Alleen-lokale modus","Export local data":"Lokale gegevens exporteren","Purge local data":"Lokale gegevens wissen","Check for updates":"Controleren op updates","Export":"Exporteren","Export history":"Geschiedenis exporteren","Purge":"Wissen","Reset all settings":"Alle instellingen resetten","Reset all":"Alles resetten","Warning":"Waarschuwing","Where to, today?":"Waar gaan we vandaag heen?","Good morning. Where to?":"Goedemorgen. Waarheen?","Morning. What are we finding today?":"Goedemorgen. Wat zoeken we vandaag?","Rise and search.":"Sta op en zoek.","Good afternoon. Where to?":"Goedemiddag. Waarheen?","Afternoon. What's next?":"Goedemiddag. Wat is de volgende stap?","Where to, this afternoon?":"Waarheen vanmiddag?","Good evening. Where to?":"Goedenavond. Waarheen?","Evening. What can we find?":"Goedenavond. Wat kunnen we vinden?","Where to, tonight?":"Waarheen vanavond?","Still up? Where to?":"Nog wakker? Waarheen?","Good night, one more search?":"Goedenacht, nog één zoekopdracht?","Quiet hours. Where to?":"Rustige uren. Waarheen?","Downloaded":"Gedownload","Cancelled":"Geannuleerd","Download complete":"Download voltooid","Download cancelled":"Download geannuleerd","Search":"Zoeken","No bookmarks yet, tap the star in the address bar to save a page.":"Nog geen bladwijzers. Tik op de ster in de adresbalk om een pagina op te slaan.","Translate":"Vertalen"},"ru":{"New tab":"Новая вкладка","Close tab":"Закрыть вкладку","Zoom out":"Уменьшить масштаб","Reset zoom":"Сбросить масштаб","Zoom in":"Увеличить масштаб","Toggle sidebar":"Переключить боковую панель","Murky Settings":"Настройки Murky","Privacy Policy":"Политика конфиденциальности","Terms of Service":"Условия использования","Downloads":"Загрузки","Recent Activity":"Недавняя активность","Bookmarks":"Закладки","Extensions":"Расширения","Manage Extensions":"Управление расширениями","Appearance":"Внешний вид","Typography":"Типографика","Browsing":"Браузинг","Privacy":"Конфиденциальность","Language":"Язык","System":"Система","About":"О программе","Reset":"Сбросить","Accent color":"Цвет акцента","Background color":"Цвет фона","Toolbar size":"Размер панели инструментов","Sidebar position":"Положение боковой панели","Interface font":"Шрифт интерфейса","UI text scale":"Масштаб текста интерфейса","Search engine":"Поисковая система","New tab behavior":"Поведение новых вкладок","Startup behavior":"Поведение при запуске","Page zoom":"Масштаб страницы","Block known ad networks":"Блокировать известные рекламные сети","Block known trackers and analytics":"Блокировать известные трекеры и аналитику","Send \"Do Not Track\" requests":"Отправлять запросы «Do Not Track»","Ask where to save each download":"Спрашивать, куда сохранять каждую загрузку","Clear browsing history":"Очистить историю браузера","Preferred Languages":"Предпочтительные языки","Let websites know the languages you speak.":"Сообщать сайтам, на каких языках вы говорите.","Maximum 5 languages can be selected at a time!":"Одновременно можно выбрать не более 5 языков!","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Этот язык имеет приоритет для перевода меню, всплывающих окон, настроек и других текстов Murky.","Murky version":"Версия Murky","Update status":"Состояние обновления","Outbound requests":"Исходящие запросы","Export request log":"Экспорт журнала запросов","Before clearing history":"Перед очисткой истории","Crash recovery":"Восстановление после сбоя","Website permissions":"Разрешения сайтов","Local-only mode":"Только локальный режим","Export local data":"Экспорт локальных данных","Purge local data":"Удалить локальные данные","Check for updates":"Проверить обновления","Export":"Экспорт","Export history":"Экспорт истории","Purge":"Удалить","Reset all settings":"Сбросить все настройки","Reset all":"Сбросить все","Warning":"Предупреждение","Where to, today?":"Куда сегодня?","Good morning. Where to?":"Доброе утро. Куда?","Morning. What are we finding today?":"Доброе утро. Что будем искать сегодня?","Rise and search.":"Вставайте и ищите.","Good afternoon. Where to?":"Добрый день. Куда?","Afternoon. What's next?":"Добрый день. Что дальше?","Where to, this afternoon?":"Куда сегодня днём?","Good evening. Where to?":"Добрый вечер. Куда?","Evening. What can we find?":"Добрый вечер. Что найдём?","Where to, tonight?":"Куда сегодня вечером?","Still up? Where to?":"Ещё не спишь? Куда?","Good night, one more search?":"Спокойной ночи, ещё один поиск?","Quiet hours. Where to?":"Тихие часы. Куда?","Downloaded":"Загружено","Cancelled":"Отменено","Download complete":"Загрузка завершена","Download cancelled":"Загрузка отменена","Search":"Поиск","No bookmarks yet, tap the star in the address bar to save a page.":"Закладок пока нет. Нажмите на звезду в адресной строке, чтобы сохранить страницу.","Translate":"Перевести"},"pl":{"New tab":"Nowa karta","Close tab":"Zamknij kartę","Zoom out":"Pomniejsz","Reset zoom":"Resetuj powiększenie","Zoom in":"Powiększ","Toggle sidebar":"Przełącz pasek boczny","Murky Settings":"Ustawienia Murky","Privacy Policy":"Polityka prywatności","Terms of Service":"Warunki korzystania","Downloads":"Pobrane","Recent Activity":"Ostatnia aktywność","Bookmarks":"Zakładki","Extensions":"Rozszerzenia","Manage Extensions":"Zarządzaj rozszerzeniami","Appearance":"Wygląd","Typography":"Typografia","Browsing":"Przeglądanie","Privacy":"Prywatność","Language":"Język","System":"System","About":"Informacje","Reset":"Resetuj","Accent color":"Kolor akcentu","Background color":"Kolor tła","Toolbar size":"Rozmiar paska narzędzi","Sidebar position":"Położenie paska bocznego","Interface font":"Czcionka interfejsu","UI text scale":"Skala tekstu interfejsu","Search engine":"Wyszukiwarka","New tab behavior":"Zachowanie nowych kart","Startup behavior":"Zachowanie podczas uruchamiania","Page zoom":"Powiększenie strony","Block known ad networks":"Blokuj znane sieci reklamowe","Block known trackers and analytics":"Blokuj znane moduły śledzące i analitykę","Send \"Do Not Track\" requests":"Wysyłaj żądania \"Do Not Track\"","Ask where to save each download":"Pytaj, gdzie zapisać każdy plik","Clear browsing history":"Wyczyść historię przeglądania","Preferred Languages":"Preferowane języki","Let websites know the languages you speak.":"Informuj strony, jakimi językami się posługujesz.","Maximum 5 languages can be selected at a time!":"Jednocześnie można wybrać maksymalnie 5 języków!","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Ten język ma pierwszeństwo przy tłumaczeniu menu, wyskakujących okien, ustawień i innych tekstów Murky.","Murky version":"Wersja Murky","Update status":"Stan aktualizacji","Outbound requests":"Żądania wychodzące","Export request log":"Eksportuj dziennik żądań","Before clearing history":"Przed wyczyszczeniem historii","Crash recovery":"Odzyskiwanie po awarii","Website permissions":"Uprawnienia witryn","Local-only mode":"Tryb tylko lokalny","Export local data":"Eksportuj dane lokalne","Purge local data":"Usuń dane lokalne","Check for updates":"Sprawdź aktualizacje","Export":"Eksportuj","Export history":"Eksportuj historię","Purge":"Usuń","Reset all settings":"Resetuj wszystkie ustawienia","Reset all":"Resetuj wszystko","Warning":"Ostrzeżenie","Where to, today?":"Dokąd dziś?","Good morning. Where to?":"Dzień dobry. Dokąd?","Morning. What are we finding today?":"Dzień dobry. Czego dziś szukamy?","Rise and search.":"Wstań i szukaj.","Good afternoon. Where to?":"Dzień dobry. Dokąd?","Afternoon. What's next?":"Dzień dobry. Co dalej?","Where to, this afternoon?":"Dokąd dziś po południu?","Good evening. Where to?":"Dobry wieczór. Dokąd?","Evening. What can we find?":"Dobry wieczór. Co możemy znaleźć?","Where to, tonight?":"Dokąd dziś wieczorem?","Still up? Where to?":"Jeszcze nie śpisz? Dokąd?","Good night, one more search?":"Dobranoc, jeszcze jedno wyszukiwanie?","Quiet hours. Where to?":"Ciche godziny. Dokąd?","Downloaded":"Pobrano","Cancelled":"Anulowano","Download complete":"Pobieranie zakończone","Download cancelled":"Pobieranie anulowane","Search":"Szukaj","No bookmarks yet, tap the star in the address bar to save a page.":"Brak zakładek. Kliknij gwiazdkę na pasku adresu, aby zapisać stronę.","Translate":"Tłumacz"},"ja":{"New tab":"新しいタブ","Close tab":"タブを閉じる","Zoom out":"縮小","Reset zoom":"ズームをリセット","Zoom in":"拡大","Toggle sidebar":"サイドバーを切り替え","Murky Settings":"Murky 設定","Privacy Policy":"プライバシーポリシー","Terms of Service":"利用規約","Downloads":"ダウンロード","Recent Activity":"最近のアクティビティ","Bookmarks":"ブックマーク","Extensions":"拡張機能","Manage Extensions":"拡張機能を管理","Appearance":"外観","Typography":"タイポグラフィ","Browsing":"ブラウジング","Privacy":"プライバシー","Language":"言語","System":"システム","About":"Murky について","Reset":"リセット","Accent color":"アクセントカラー","Background color":"背景色","Toolbar size":"ツールバーのサイズ","Sidebar position":"サイドバーの位置","Interface font":"インターフェースフォント","UI text scale":"UI テキストサイズ","Search engine":"検索エンジン","New tab behavior":"新しいタブの動作","Startup behavior":"起動時の動作","Page zoom":"ページズーム","Block known ad networks":"既知の広告ネットワークをブロック","Block known trackers and analytics":"既知のトラッカーと分析をブロック","Send \"Do Not Track\" requests":"「Do Not Track」リクエストを送信","Ask where to save each download":"ダウンロードごとに保存先を確認","Clear browsing history":"閲覧履歴を消去","Preferred Languages":"優先言語","Let websites know the languages you speak.":"使用する言語をウェブサイトに知らせます。","Maximum 5 languages can be selected at a time!":"同時に選択できる言語は最大5つです。","This language is given priority to translate display menus, popups, settings and other text on Murky.":"この言語を優先して Murky のメニュー、ポップアップ、設定などを翻訳します。","Murky version":"Murky バージョン","Update status":"更新状態","Outbound requests":"外部へのリクエスト","Export request log":"リクエストログをエクスポート","Before clearing history":"履歴を消去する前に","Crash recovery":"クラッシュ復旧","Website permissions":"ウェブサイトの権限","Local-only mode":"ローカルのみモード","Export local data":"ローカルデータをエクスポート","Purge local data":"ローカルデータを消去","Check for updates":"更新を確認","Export":"エクスポート","Export history":"履歴をエクスポート","Purge":"消去","Reset all settings":"すべての設定をリセット","Reset all":"すべてリセット","Warning":"警告","Where to, today?":"今日はどこへ？","Good morning. Where to?":"おはようございます。どこへ？","Morning. What are we finding today?":"おはようございます。今日は何を探しますか？","Rise and search.":"起きて検索しましょう。","Good afternoon. Where to?":"こんにちは。どこへ？","Afternoon. What's next?":"こんにちは。次は何をしますか？","Where to, this afternoon?":"今日の午後はどこへ？","Good evening. Where to?":"こんばんは。どこへ？","Evening. What can we find?":"こんばんは。何を見つけましょう？","Where to, tonight?":"今夜はどこへ？","Still up? Where to?":"まだ起きていますか？どこへ？","Good night, one more search?":"おやすみなさい。もう一度検索しますか？","Quiet hours. Where to?":"静かな時間です。どこへ？","Downloaded":"ダウンロード済み","Cancelled":"キャンセル済み","Download complete":"ダウンロード完了","Download cancelled":"ダウンロードをキャンセルしました","Search":"検索","No bookmarks yet, tap the star in the address bar to save a page.":"ブックマークはまだありません。アドレスバーの星を押してページを保存してください。","Translate":"翻訳"},"ko":{"New tab":"새 탭","Close tab":"탭 닫기","Zoom out":"축소","Reset zoom":"확대/축소 초기화","Zoom in":"확대","Toggle sidebar":"사이드바 전환","Murky Settings":"Murky 설정","Privacy Policy":"개인정보 처리방침","Terms of Service":"서비스 약관","Downloads":"다운로드","Recent Activity":"최근 활동","Bookmarks":"북마크","Extensions":"확장 프로그램","Manage Extensions":"확장 프로그램 관리","Appearance":"모양","Typography":"타이포그래피","Browsing":"탐색","Privacy":"개인정보 보호","Language":"언어","System":"시스템","About":"정보","Reset":"초기화","Accent color":"강조 색상","Background color":"배경색","Toolbar size":"도구 모음 크기","Sidebar position":"사이드바 위치","Interface font":"인터페이스 글꼴","UI text scale":"UI 텍스트 크기","Search engine":"검색 엔진","New tab behavior":"새 탭 동작","Startup behavior":"시작 동작","Page zoom":"페이지 확대/축소","Block known ad networks":"알려진 광고 네트워크 차단","Block known trackers and analytics":"알려진 추적기 및 분석 차단","Send \"Do Not Track\" requests":"Do Not Track 요청 보내기","Ask where to save each download":"다운로드할 때마다 저장 위치 묻기","Clear browsing history":"인터넷 사용 기록 삭제","Preferred Languages":"선호 언어","Let websites know the languages you speak.":"사용하는 언어를 웹사이트에 알립니다.","Maximum 5 languages can be selected at a time!":"한 번에 최대 5개 언어를 선택할 수 있습니다.","This language is given priority to translate display menus, popups, settings and other text on Murky.":"이 언어를 우선하여 Murky 메뉴, 팝업, 설정 및 기타 텍스트를 번역합니다.","Murky version":"Murky 버전","Update status":"업데이트 상태","Outbound requests":"외부 요청","Export request log":"요청 로그 내보내기","Before clearing history":"기록 삭제 전","Crash recovery":"충돌 복구","Website permissions":"웹사이트 권한","Local-only mode":"로컬 전용 모드","Export local data":"로컬 데이터 내보내기","Purge local data":"로컬 데이터 삭제","Check for updates":"업데이트 확인","Export":"내보내기","Export history":"기록 내보내기","Purge":"삭제","Reset all settings":"모든 설정 초기화","Reset all":"모두 초기화","Warning":"경고","Where to, today?":"오늘은 어디로 갈까요?","Good morning. Where to?":"좋은 아침이에요. 어디로 갈까요?","Morning. What are we finding today?":"좋은 아침이에요. 오늘은 무엇을 찾을까요?","Rise and search.":"일어나서 검색해 보세요.","Good afternoon. Where to?":"좋은 오후예요. 어디로 갈까요?","Afternoon. What's next?":"좋은 오후예요. 다음은 무엇일까요?","Where to, this afternoon?":"오늘 오후에는 어디로 갈까요?","Good evening. Where to?":"좋은 저녁이에요. 어디로 갈까요?","Evening. What can we find?":"좋은 저녁이에요. 무엇을 찾아볼까요?","Where to, tonight?":"오늘 밤에는 어디로 갈까요?","Still up? Where to?":"아직 깨어 있나요? 어디로 갈까요?","Good night, one more search?":"잘 자요. 한 번 더 검색할까요?","Quiet hours. Where to?":"조용한 시간이에요. 어디로 갈까요?","Downloaded":"다운로드됨","Cancelled":"취소됨","Download complete":"다운로드 완료","Download cancelled":"다운로드 취소됨","Search":"검색","No bookmarks yet, tap the star in the address bar to save a page.":"아직 북마크가 없습니다. 주소 표시줄의 별표를 눌러 페이지를 저장하세요.","Translate":"번역"},"zh":{"New tab":"新标签页","Close tab":"关闭标签页","Zoom out":"缩小","Reset zoom":"重置缩放","Zoom in":"放大","Toggle sidebar":"切换侧边栏","Murky Settings":"Murky 设置","Privacy Policy":"隐私政策","Terms of Service":"服务条款","Downloads":"下载","Recent Activity":"最近活动","Bookmarks":"书签","Extensions":"扩展程序","Manage Extensions":"管理扩展程序","Appearance":"外观","Typography":"排版","Browsing":"浏览","Privacy":"隐私","Language":"语言","System":"系统","About":"关于","Reset":"重置","Accent color":"强调色","Background color":"背景颜色","Toolbar size":"工具栏大小","Sidebar position":"侧边栏位置","Interface font":"界面字体","UI text scale":"界面文字缩放","Search engine":"搜索引擎","New tab behavior":"新标签页行为","Startup behavior":"启动行为","Page zoom":"页面缩放","Block known ad networks":"阻止已知广告网络","Block known trackers and analytics":"阻止已知跟踪器和分析服务","Send \"Do Not Track\" requests":"发送“Do Not Track”请求","Ask where to save each download":"每次下载时询问保存位置","Clear browsing history":"清除浏览历史","Preferred Languages":"首选语言","Let websites know the languages you speak.":"让网站知道您使用的语言。","Maximum 5 languages can be selected at a time!":"一次最多可以选择 5 种语言！","This language is given priority to translate display menus, popups, settings and other text on Murky.":"此语言优先用于翻译 Murky 的菜单、弹窗、设置和其他文本。","Murky version":"Murky 版本","Update status":"更新状态","Outbound requests":"外发请求","Export request log":"导出请求日志","Before clearing history":"清除历史记录前","Crash recovery":"崩溃恢复","Website permissions":"网站权限","Local-only mode":"仅本地模式","Export local data":"导出本地数据","Purge local data":"清除本地数据","Check for updates":"检查更新","Export":"导出","Export history":"导出历史记录","Purge":"清除","Reset all settings":"重置所有设置","Reset all":"全部重置","Warning":"警告","Where to, today?":"今天去哪？","Good morning. Where to?":"早上好。去哪？","Morning. What are we finding today?":"早上好。今天找点什么？","Rise and search.":"起来搜索吧。","Good afternoon. Where to?":"下午好。去哪？","Afternoon. What's next?":"下午好。接下来做什么？","Where to, this afternoon?":"今天下午去哪？","Good evening. Where to?":"晚上好。去哪？","Evening. What can we find?":"晚上好。能找到什么？","Where to, tonight?":"今晚去哪？","Still up? Where to?":"还没睡？去哪？","Good night, one more search?":"晚安，再搜索一次？","Quiet hours. Where to?":"安静时间。去哪？","Downloaded":"已下载","Cancelled":"已取消","Download complete":"下载完成","Download cancelled":"下载已取消","Search":"搜索","No bookmarks yet, tap the star in the address bar to save a page.":"还没有书签。点击地址栏中的星标即可保存页面。","Translate":"翻译"}};
function builtinTranslate(target, text){ const map=BUILTIN_TRANSLATIONS[normalizeLanguage(target)] || null; if(!map) return null; return Object.prototype.hasOwnProperty.call(map, text) ? map[text] : null; }
const BUILTIN_COMMON = {
  tr:{"System default":"Sistem varsayılanı","Serif":"Serif","Monospace everywhere":"Her yerde monospace","Rounded sans":"Yuvarlatılmış sans","Left":"Sol","Right":"Sağ","Open based on context":"Bağlama göre aç","Always activate new tabs":"Yeni sekmeleri her zaman etkinleştir","Open new tabs in background":"Yeni sekmeleri arka planda aç","Open New Tab":"Yeni Sekme Aç","Continue previous session":"Önceki oturuma devam et"},
  de:{"System default":"Systemstandard","Serif":"Serif","Monospace everywhere":"Überall Monospace","Rounded sans":"Abgerundete Sans","Left":"Links","Right":"Rechts","Open based on context":"Je nach Kontext öffnen","Always activate new tabs":"Neue Tabs immer aktivieren","Open new tabs in background":"Neue Tabs im Hintergrund öffnen","Open New Tab":"Neuen Tab öffnen","Continue previous session":"Vorherige Sitzung fortsetzen"},
  fr:{"System default":"Valeur système","Serif":"Serif","Monospace everywhere":"Monospace partout","Rounded sans":"Sans arrondie","Left":"Gauche","Right":"Droite","Open based on context":"Ouvrir selon le contexte","Always activate new tabs":"Toujours activer les nouveaux onglets","Open new tabs in background":"Ouvrir les nouveaux onglets en arrière-plan","Open New Tab":"Ouvrir un nouvel onglet","Continue previous session":"Continuer la session précédente"},
  es:{"System default":"Predeterminado del sistema","Serif":"Serif","Monospace everywhere":"Monoespaciada en todas partes","Rounded sans":"Sans redondeada","Left":"Izquierda","Right":"Derecha","Open based on context":"Abrir según el contexto","Always activate new tabs":"Activar siempre las nuevas pestañas","Open new tabs in background":"Abrir nuevas pestañas en segundo plano","Open New Tab":"Abrir nueva pestaña","Continue previous session":"Continuar sesión anterior"},
  it:{"System default":"Predefinito di sistema","Serif":"Serif","Monospace everywhere":"Monospace ovunque","Rounded sans":"Sans arrotondato","Left":"Sinistra","Right":"Destra","Open based on context":"Apri in base al contesto","Always activate new tabs":"Attiva sempre le nuove schede","Open new tabs in background":"Apri le nuove schede in background","Open New Tab":"Apri nuova scheda","Continue previous session":"Continua sessione precedente"},
  pt:{"System default":"Padrão do sistema","Serif":"Serif","Monospace everywhere":"Monoespaçada em todo lugar","Rounded sans":"Sans arredondada","Left":"Esquerda","Right":"Direita","Open based on context":"Abrir conforme o contexto","Always activate new tabs":"Sempre ativar novas abas","Open new tabs in background":"Abrir novas abas em segundo plano","Open New Tab":"Abrir nova aba","Continue previous session":"Continuar sessão anterior"},
  nl:{"System default":"Systeemstandaard","Serif":"Serif","Monospace everywhere":"Overal monospace","Rounded sans":"Ronde sans","Left":"Links","Right":"Rechts","Open based on context":"Openen op basis van context","Always activate new tabs":"Nieuwe tabbladen altijd activeren","Open new tabs in background":"Nieuwe tabbladen op de achtergrond openen","Open New Tab":"Nieuw tabblad openen","Continue previous session":"Vorige sessie voortzetten"},
  ru:{"System default":"Системный по умолчанию","Serif":"Serif","Monospace everywhere":"Моноширинный везде","Rounded sans":"Скруглённый sans","Left":"Слева","Right":"Справа","Open based on context":"Открывать по контексту","Always activate new tabs":"Всегда активировать новые вкладки","Open new tabs in background":"Открывать новые вкладки в фоне","Open New Tab":"Открыть новую вкладку","Continue previous session":"Продолжить предыдущий сеанс"},
  pl:{"System default":"Domyślne systemowe","Serif":"Serif","Monospace everywhere":"Monospace wszędzie","Rounded sans":"Zaokrąglony sans","Left":"Lewa","Right":"Prawa","Open based on context":"Otwieraj zależnie od kontekstu","Always activate new tabs":"Zawsze aktywuj nowe karty","Open new tabs in background":"Otwieraj nowe karty w tle","Open New Tab":"Otwórz nową kartę","Continue previous session":"Kontynuuj poprzednią sesję"},
  ja:{"System default":"システムの既定","Serif":"セリフ","Monospace everywhere":"すべてモノスペース","Rounded sans":"丸みのあるサンセリフ","Left":"左","Right":"右","Open based on context":"状況に応じて開く","Always activate new tabs":"新しいタブを常にアクティブにする","Open new tabs in background":"新しいタブをバックグラウンドで開く","Open New Tab":"新しいタブを開く","Continue previous session":"前回のセッションを続行"},
  ko:{"System default":"시스템 기본값","Serif":"세리프","Monospace everywhere":"모든 곳에 고정폭","Rounded sans":"둥근 산세리프","Left":"왼쪽","Right":"오른쪽","Open based on context":"상황에 따라 열기","Always activate new tabs":"새 탭을 항상 활성화","Open new tabs in background":"새 탭을 백그라운드에서 열기","Open New Tab":"새 탭 열기","Continue previous session":"이전 세션 계속"},
  zh:{"System default":"系统默认","Serif":"衬线","Monospace everywhere":"全局等宽","Rounded sans":"圆角无衬线","Left":"左侧","Right":"右侧","Open based on context":"根据上下文打开","Always activate new tabs":"始终激活新标签页","Open new tabs in background":"在后台打开新标签页","Open New Tab":"打开新标签页","Continue previous session":"继续上次会话"}
};
for (const [lang,map] of Object.entries(BUILTIN_COMMON)) Object.assign(BUILTIN_TRANSLATIONS[lang] || (BUILTIN_TRANSLATIONS[lang]={}), map);

 
 
 
const LOCAL_UI_TRANSLATIONS = {
  tr: {
    "About":"Hakkında","Accent color":"Vurgu rengi","Always activate new tabs":"Yeni sekmeleri her zaman etkinleştir","Appearance":"Görünüm","Ask where to save each download":"Her indirmede kaydedilecek yeri sor","Background color":"Arka plan rengi","Before clearing history":"Geçmişi temizlemeden önce","Bing":"Bing","Block known ad networks":"Bilinen reklam ağlarını engelle","Block known trackers and analytics":"Bilinen izleyicileri ve analizleri engelle","Blocks network requests from external websites. Murky internal pages and local features continue to work.":"Harici web sitelerinden gelen ağ isteklerini engeller. Murky'nin dahili sayfaları ve yerel özellikleri çalışmaya devam eder.","Browse files":"Dosyalara göz at","Browsing":"Gezinme","Check for updates":"Güncellemeleri kontrol et","Clear":"Temizle","Clear browsing history":"Tarama geçmişini temizle","Clears browsing history, bookmarks, cookies, local storage, service workers and cached web data in one action.":"Tarama geçmişini, yer imlerini, çerezleri, yerel depolamayı, service worker'ları ve önbelleğe alınmış web verilerini tek işlemde temizler.","Continue previous session":"Önceki oturuma devam et","Crash recovery":"Çökme kurtarma","Drop file":"Dosyayı bırak","DuckDuckGo":"DuckDuckGo","Ecosia":"Ecosia","Enabled":"Etkin","Export":"Dışa aktar","Export a backup first if you want to keep a copy.":"Bir kopyasını saklamak istiyorsanız önce yedek dışa aktarın.","Export history":"Geçmişi dışa aktar","Export local data":"Yerel verileri dışa aktar","Export request log":"İstek günlüğünü dışa aktar","Exports the current local request log as JSON. URLs may contain query parameters.":"Geçerli yerel istek günlüğünü JSON olarak dışa aktarır. URL'ler sorgu parametreleri içerebilir.","Google":"Google","If a tab renderer crashes, Murky automatically restores that tab instead of leaving it blank.":"Bir sekmenin işleyicisi çökerse Murky sekmeyi boş bırakmak yerine otomatik olarak geri yükler.","Interface font":"Arayüz yazı tipi","Language":"Dil","Left":"Sol","Let websites know the languages you speak.":"Web sitelerine konuştuğunuz dilleri bildirin.","Loading…":"Yükleniyor…","Local-only mode":"Yalnızca yerel mod","Maximum 5 languages can be selected at a time!":"Aynı anda en fazla 5 dil seçilebilir!","Microphone/camera access is denied to external websites. Murky's own voice features retain access.":"Harici web sitelerinin mikrofon/kamera erişimi reddedilir. Murky'nin kendi ses özellikleri erişimini korur.","Monospace everywhere":"Her yerde monospace","Murky":"Murky","Murky keeps a rolling local log of browser network requests so you can inspect what leaves the browser.":"Murky, tarayıcıdan hangi isteklerin çıktığını inceleyebilmeniz için dönen bir yerel ağ isteği günlüğü tutar.","Murky looks like this":"Murky böyle görünüyor","Murky version":"Murky sürümü","New tab behavior":"Yeni sekme davranışı","No image selected":"Resim seçilmedi","Not checked yet":"Henüz kontrol edilmedi","Open New Tab":"Yeni Sekme Aç","Open based on context":"Bağlama göre aç","Open new tabs in background":"Yeni sekmeleri arka planda aç","Outbound requests":"Giden istekler","Page zoom":"Sayfa yakınlaştırması","Preferred Languages":"Tercih Edilen Diller","Preview":"Önizleme","Privacy":"Gizlilik","Privacy Policy":"Gizlilik Politikası","Purge":"Temizle","Purge local data":"Yerel verileri temizle","Removes your saved history. Bookmarks are not affected.":"Kayıtlı geçmişinizi kaldırır. Yer imleri etkilenmez.","Reset":"Sıfırla","Reset all":"Tümünü sıfırla","Reset all settings":"Tüm ayarları sıfırla","Restores every Murky setting to its default value":"Tüm Murky ayarlarını varsayılan değerlerine döndürür","Restricted":"Kısıtlı","Right":"Sağ","Rounded sans":"Yuvarlatılmış sans","Saves a local backup of your settings, history and bookmarks before a purge.":"Temizleme işleminden önce ayarlarınızın, geçmişinizin ve yer imlerinizin yerel yedeğini kaydeder.","Search engine":"Arama motoru","Send \"Do Not Track\" requests":"\"Do Not Track\" istekleri gönder","Serif":"Serif","Set Background Photo":"Arka Plan Fotoğrafını Ayarla","Set background":"Arka planı ayarla","Sidebar position":"Kenar çubuğu konumu","Startpage":"Startpage","Startup behavior":"Başlangıç davranışı","Stretch to Fit":"Sığdırmak için esnet","System":"Sistem","System default":"Sistem varsayılanı","Terms of Service":"Hizmet Şartları","The only official Murky websites are":"Murky'nin yalnızca şu resmi web siteleri vardır:","The quick brown fox jumps over the lazy dog, 1234567890.":"Pijamalı hasta yağız şoföre çabucak güvendi, 1234567890.","Toolbar size":"Araç çubuğu boyutu","Typography":"Tipografi","UI text scale":"Arayüz metin ölçeği","Update status":"Güncelleme durumu","Use an image as Murky's background.":"Bir resmi Murky'nin arka planı olarak kullanın.","Version …":"Sürüm …","Warning":"Uyarı","Website permissions":"Web sitesi izinleri","Zoom to Fit":"Sığdırmak için yakınlaştır","and":"ve","or":"veya",
    "Add a Language":"Dil Ekle","Add an extension":"Uzantı ekle","Add extension":"Uzantı ekle","Choose extension":"Uzantı seç",
    "Drop an extension package or unpacked extension folder here, or choose one from your files.":"Bir uzantı paketi veya açılmış uzantı klasörünü buraya bırakın ya da dosyalarınızdan birini seçin.",
    "No extensions installed yet.":"Henüz yüklü uzantı yok.","Use Upload to add a local extension.":"Yerel bir uzantı eklemek için Yükle'yi kullanın.","Delete":"Sil","Extension deleted":"Uzantı silindi","Upload":"Yükle","Version":"Sürüm","Loaded":"Yüklendi","Not loaded":"Yüklenmedi","No description provided.":"Açıklama sağlanmadı.",
    "Checking…":"Kontrol ediliyor…","Not checked yet":"Henüz kontrol edilmedi","Enabled":"Etkin","Restricted":"Kısıtlı","Loading…":"Yükleniyor…",
    "Preview":"Önizleme","The quick brown fox jumps over the lazy dog, 1234567890.":"Pijamalı hasta yağız şoföre çabucak güvendi, 1234567890.",
    "Use an image as Murky's background.":"Bir resmi Murky'nin arka planı olarak kullanın.","Drop file or Browse files":"Dosyayı bırakın veya Dosyalara göz atın","No image selected":"Resim seçilmedi","Stretch to Fit":"Sığdırmak için esnet","Zoom to Fit":"Sığdırmak için yakınlaştır","Set background":"Arka planı ayarla",
    "Microphone/camera access is denied to external websites. Murky's own voice features retain access.":"Harici web sitelerinin mikrofon/kamera erişimi reddedilir. Murky'nin kendi ses özellikleri erişimini korur.",
    "Blocks network requests from external websites. Murky internal pages and local features continue to work.":"Harici web sitelerinden gelen ağ isteklerini engeller. Murky'nin dahili sayfaları ve yerel özellikleri çalışmaya devam eder.",
    "Removes your saved history. Bookmarks are not affected.":"Kayıtlı geçmişinizi kaldırır. Yer imleri etkilenmez.",
    "Clears browsing history, bookmarks, cookies, local storage, service workers and cached web data in one action.":"Tarama geçmişini, yer imlerini, çerezleri, yerel depolamayı, service worker'ları ve önbelleğe alınmış web verilerini tek işlemde temizler.",
    "Saves a local backup of your settings, history and bookmarks before a purge.":"Temizleme işleminden önce ayarlarınızın, geçmişinizin ve yer imlerinizin yerel yedeğini kaydeder.",
    "Exports the current local request log as JSON. URLs may contain query parameters.":"Geçerli yerel istek günlüğünü JSON olarak dışa aktarır. URL'ler sorgu parametreleri içerebilir.",
    "If a tab renderer crashes, Murky automatically restores that tab instead of leaving it blank.":"Bir sekmenin işleyicisi çökerse Murky sekmeyi boş bırakmak yerine otomatik olarak geri yükler.",
    "Murky keeps a rolling local log of browser network requests so you can inspect what leaves the browser.":"Murky, tarayıcıdan hangi isteklerin çıktığını inceleyebilmeniz için dönen bir yerel ağ isteği günlüğü tutar.",
    "Restores every Murky setting to its default value":"Tüm Murky ayarlarını varsayılan değerlerine döndürür","Export a backup first if you want to keep a copy.":"Bir kopyasını saklamak istiyorsanız önce yedek dışa aktarın.",
    "The only official Murky websites are ":"Murky'nin yalnızca şu resmi web siteleri vardır: ",". Be careful with websites claiming to be Murky.":". Murky olduğunu iddia eden web sitelerine dikkat edin.",
    "Move language":"Dili taşı","Remove language":"Dili kaldır","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Bu dil, Murky'nin menülerini, açılır pencerelerini, ayarlarını ve diğer metinlerini çevirmede önceliklidir."
  },
  de: {"Add a Language":"Sprache hinzufügen","Add an extension":"Erweiterung hinzufügen","Add extension":"Erweiterung hinzufügen","Choose extension":"Erweiterung auswählen","Delete":"Löschen","Upload":"Hochladen","Loaded":"Geladen","Not loaded":"Nicht geladen","No description provided.":"Keine Beschreibung vorhanden.","Checking…":"Wird geprüft…","Not checked yet":"Noch nicht geprüft","Enabled":"Aktiviert","Restricted":"Eingeschränkt","Loading…":"Wird geladen…","Preview":"Vorschau","No image selected":"Kein Bild ausgewählt","Set background":"Hintergrund festlegen","Reset":"Zurücksetzen","Export":"Exportieren","Purge":"Löschen"},
  fr: {"Add a Language":"Ajouter une langue","Add an extension":"Ajouter une extension","Add extension":"Ajouter une extension","Choose extension":"Choisir une extension","Delete":"Supprimer","Upload":"Importer","Loaded":"Chargée","Not loaded":"Non chargée","No description provided.":"Aucune description fournie.","Checking…":"Vérification…","Not checked yet":"Pas encore vérifié","Enabled":"Activé","Restricted":"Restreint","Loading…":"Chargement…","Preview":"Aperçu","No image selected":"Aucune image sélectionnée","Set background":"Définir l’arrière-plan","Reset":"Réinitialiser","Export":"Exporter","Purge":"Effacer"},
  es: {"Add a Language":"Añadir un idioma","Add an extension":"Añadir una extensión","Add extension":"Añadir extensión","Choose extension":"Elegir extensión","Delete":"Eliminar","Upload":"Subir","Loaded":"Cargada","Not loaded":"No cargada","No description provided.":"No se proporcionó ninguna descripción.","Checking…":"Comprobando…","Not checked yet":"Aún no comprobado","Enabled":"Activado","Restricted":"Restringido","Loading…":"Cargando…","Preview":"Vista previa","No image selected":"No se ha seleccionado ninguna imagen","Set background":"Establecer fondo","Reset":"Restablecer","Export":"Exportar","Purge":"Borrar"},
  it: {"Add a Language":"Aggiungi una lingua","Add an extension":"Aggiungi un'estensione","Add extension":"Aggiungi estensione","Choose extension":"Scegli estensione","Delete":"Elimina","Upload":"Carica","Loaded":"Caricata","Not loaded":"Non caricata","No description provided.":"Nessuna descrizione fornita.","Checking…":"Controllo…","Not checked yet":"Non ancora controllato","Enabled":"Attivato","Restricted":"Limitato","Loading…":"Caricamento…","Preview":"Anteprima","No image selected":"Nessuna immagine selezionata","Set background":"Imposta sfondo","Reset":"Ripristina","Export":"Esporta","Purge":"Cancella"},
  pt: {"Add a Language":"Adicionar um idioma","Add an extension":"Adicionar uma extensão","Add extension":"Adicionar extensão","Choose extension":"Escolher extensão","Delete":"Excluir","Upload":"Carregar","Loaded":"Carregada","Not loaded":"Não carregada","No description provided.":"Nenhuma descrição fornecida.","Checking…":"Verificando…","Not checked yet":"Ainda não verificado","Enabled":"Ativado","Restricted":"Restrito","Loading…":"Carregando…","Preview":"Pré-visualização","No image selected":"Nenhuma imagem selecionada","Set background":"Definir plano de fundo","Reset":"Redefinir","Export":"Exportar","Purge":"Limpar"},
  nl: {"Add a Language":"Taal toevoegen","Add an extension":"Extensie toevoegen","Add extension":"Extensie toevoegen","Choose extension":"Extensie kiezen","Delete":"Verwijderen","Upload":"Uploaden","Loaded":"Geladen","Not loaded":"Niet geladen","No description provided.":"Geen beschrijving opgegeven.","Checking…":"Controleren…","Not checked yet":"Nog niet gecontroleerd","Enabled":"Ingeschakeld","Restricted":"Beperkt","Loading…":"Laden…","Preview":"Voorbeeld","No image selected":"Geen afbeelding geselecteerd","Set background":"Achtergrond instellen","Reset":"Resetten","Export":"Exporteren","Purge":"Wissen"},
  ru: {"Add a Language":"Добавить язык","Add an extension":"Добавить расширение","Add extension":"Добавить расширение","Choose extension":"Выбрать расширение","Delete":"Удалить","Upload":"Загрузить","Loaded":"Загружено","Not loaded":"Не загружено","No description provided.":"Описание не предоставлено.","Checking…":"Проверка…","Not checked yet":"Ещё не проверено","Enabled":"Включено","Restricted":"Ограничено","Loading…":"Загрузка…","Preview":"Предпросмотр","No image selected":"Изображение не выбрано","Set background":"Установить фон","Reset":"Сбросить","Export":"Экспортировать","Purge":"Очистить"},
  pl: {"Add a Language":"Dodaj język","Add an extension":"Dodaj rozszerzenie","Add extension":"Dodaj rozszerzenie","Choose extension":"Wybierz rozszerzenie","Delete":"Usuń","Upload":"Prześlij","Loaded":"Załadowano","Not loaded":"Nie załadowano","No description provided.":"Brak opisu.","Checking…":"Sprawdzanie…","Not checked yet":"Jeszcze nie sprawdzono","Enabled":"Włączone","Restricted":"Ograniczone","Loading…":"Ładowanie…","Preview":"Podgląd","No image selected":"Nie wybrano obrazu","Set background":"Ustaw tło","Reset":"Resetuj","Export":"Eksportuj","Purge":"Wyczyść"},
  ja: {"Add a Language":"言語を追加","Add an extension":"拡張機能を追加","Add extension":"拡張機能を追加","Choose extension":"拡張機能を選択","Delete":"削除","Upload":"アップロード","Loaded":"読み込み済み","Not loaded":"未読み込み","No description provided.":"説明はありません。","Checking…":"確認中…","Not checked yet":"未確認","Enabled":"有効","Restricted":"制限あり","Loading…":"読み込み中…","Preview":"プレビュー","No image selected":"画像が選択されていません","Set background":"背景を設定","Reset":"リセット","Export":"エクスポート","Purge":"消去"},
  ko: {"Add a Language":"언어 추가","Add an extension":"확장 프로그램 추가","Add extension":"확장 프로그램 추가","Choose extension":"확장 프로그램 선택","Delete":"삭제","Upload":"업로드","Loaded":"로드됨","Not loaded":"로드되지 않음","No description provided.":"설명이 없습니다.","Checking…":"확인 중…","Not checked yet":"아직 확인하지 않음","Enabled":"사용","Restricted":"제한됨","Loading…":"로드 중…","Preview":"미리보기","No image selected":"선택한 이미지 없음","Set background":"배경 설정","Reset":"초기화","Export":"내보내기","Purge":"삭제"},
  zh: {"Add a Language":"添加语言","Add an extension":"添加扩展程序","Add extension":"添加扩展程序","Choose extension":"选择扩展程序","Delete":"删除","Upload":"上传","Loaded":"已加载","Not loaded":"未加载","No description provided.":"未提供描述。","Checking…":"正在检查…","Not checked yet":"尚未检查","Enabled":"已启用","Restricted":"受限","Loading…":"加载中…","Preview":"预览","No image selected":"未选择图片","Set background":"设置背景","Reset":"重置","Export":"导出","Purge":"清除"}
};
for (const [lang,map] of Object.entries(LOCAL_UI_TRANSLATIONS)) Object.assign(BUILTIN_TRANSLATIONS[lang] || (BUILTIN_TRANSLATIONS[lang]={}), map);
const EXTRA_LOCAL_UI_TRANSLATIONS = {"de":{"Apply Size":"Größe anwenden","Set Background Photo":"Hintergrundfoto festlegen","Use an image as Murky's background.":"Ein Bild als Murky-Hintergrund verwenden.","Drop file":"Datei hier ablegen","Browse files":"Dateien durchsuchen","or":"oder","No image selected":"Kein Bild ausgewählt","Stretch to Fit":"Auf Fenstergröße strecken","Zoom to Fit":"Auf Fenstergröße zoomen","Set background":"Hintergrund festlegen","Murky looks like this":"So sieht Murky aus","The quick brown fox jumps over the lazy dog, 1234567890.":"Franz jagt im komplett verwahrlosten Taxi quer durch Bayern, 1234567890.","Preview":"Vorschau","Clear":"Löschen","Removes your saved history. Bookmarks are not affected.":"Entfernt den gespeicherten Verlauf. Lesezeichen bleiben erhalten.","Blocks network requests from external websites. Murky internal pages and local features continue to work.":"Blockiert Netzwerkanfragen externer Websites. Interne Murky-Seiten und lokale Funktionen funktionieren weiterhin.","Clears browsing history, bookmarks, cookies, local storage, service workers and cached web data in one action.":"Löscht Browserverlauf, Lesezeichen, Cookies, lokalen Speicher, Service Worker und zwischengespeicherte Webdaten in einem Schritt.","Saves a local backup of your settings, history and bookmarks before a purge.":"Speichert vor dem Löschen eine lokale Sicherung deiner Einstellungen, deines Verlaufs und deiner Lesezeichen.","Exports the current local request log as JSON. URLs may contain query parameters.":"Exportiert das aktuelle lokale Anfrageprotokoll als JSON. URLs können Abfrageparameter enthalten.","If a tab renderer crashes, Murky automatically restores that tab instead of leaving it blank.":"Wenn der Renderer eines Tabs abstürzt, stellt Murky den Tab automatisch wieder her, anstatt ihn leer zu lassen.","Murky keeps a rolling local log of browser network requests so you can inspect what leaves the browser.":"Murky führt ein fortlaufendes lokales Protokoll der Browser-Netzwerkanfragen, damit du sehen kannst, was den Browser verlässt.","Restores every Murky setting to its default value":"Setzt alle Murky-Einstellungen auf ihre Standardwerte zurück","Export a backup first if you want to keep a copy.":"Exportiere zuerst eine Sicherung, wenn du eine Kopie behalten möchtest.","The only official Murky websites are":"Die einzigen offiziellen Murky-Websites sind","and":"und",". Be careful with websites claiming to be Murky.":". Sei vorsichtig bei Websites, die behaupten, Murky zu sein.","Warning":"Warnung","Search engine":"Suchmaschine","New tab behavior":"Verhalten neuer Tabs","Startup behavior":"Startverhalten","Page zoom":"Seitenzoom","Open based on context":"Kontextabhängig öffnen","Always activate new tabs":"Neue Tabs immer aktivieren","Open new tabs in background":"Neue Tabs im Hintergrund öffnen","Open New Tab":"Neuen Tab öffnen","Continue previous session":"Vorherige Sitzung fortsetzen","System default":"Systemstandard","Serif":"Serif","Monospace everywhere":"Überall Monospace","Rounded sans":"Abgerundete Sans-Serif","Left":"Links","Right":"Rechts","Move language":"Sprache verschieben","Remove language":"Sprache entfernen","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Diese Sprache wird bevorzugt für Menüs, Popups, Einstellungen und andere Murky-Texte verwendet.","Add a Language":"Sprache hinzufügen","Add an extension":"Erweiterung hinzufügen","Add extension":"Erweiterung hinzufügen","Choose extension":"Erweiterung auswählen","Delete":"Löschen","Upload":"Hochladen","Loaded":"Geladen","Not loaded":"Nicht geladen","No description provided.":"Keine Beschreibung vorhanden.","Checking…":"Wird geprüft…","Enabled":"Aktiviert","Restricted":"Eingeschränkt","Loading…":"Wird geladen…","Version":"Version","Extension deleted":"Erweiterung gelöscht","No extensions installed yet.":"Noch keine Erweiterungen installiert.","Use Upload to add a local extension.":"Verwende Hochladen, um eine lokale Erweiterung hinzuzufügen.","Drop an extension package or unpacked extension folder here, or choose one from your files.":"Lege hier ein Erweiterungspaket oder einen entpackten Erweiterungsordner ab oder wähle eine Datei aus."},"fr":{"Apply Size":"Appliquer la taille","Set Background Photo":"Définir la photo d’arrière-plan","Use an image as Murky's background.":"Utiliser une image comme arrière-plan de Murky.","Drop file":"Déposer le fichier","Browse files":"Parcourir les fichiers","or":"ou","No image selected":"Aucune image sélectionnée","Stretch to Fit":"Étirer pour ajuster","Zoom to Fit":"Zoomer pour ajuster","Set background":"Définir l’arrière-plan","Murky looks like this":"Voici à quoi ressemble Murky","The quick brown fox jumps over the lazy dog, 1234567890.":"Buvez de ce whisky que le patron juge fameux, 1234567890.","Preview":"Aperçu","Clear":"Effacer","Removes your saved history. Bookmarks are not affected.":"Supprime votre historique enregistré. Les favoris ne sont pas affectés.","Blocks network requests from external websites. Murky internal pages and local features continue to work.":"Bloque les requêtes réseau des sites externes. Les pages internes de Murky et les fonctions locales continuent de fonctionner.","Clears browsing history, bookmarks, cookies, local storage, service workers and cached web data in one action.":"Efface en une seule action l’historique, les favoris, les cookies, le stockage local, les service workers et les données Web mises en cache.","Saves a local backup of your settings, history and bookmarks before a purge.":"Enregistre une sauvegarde locale de vos paramètres, de votre historique et de vos favoris avant une purge.","Exports the current local request log as JSON. URLs may contain query parameters.":"Exporte le journal local actuel des requêtes au format JSON. Les URL peuvent contenir des paramètres de requête.","If a tab renderer crashes, Murky automatically restores that tab instead of leaving it blank.":"Si le moteur de rendu d’un onglet plante, Murky restaure automatiquement cet onglet au lieu de le laisser vide.","Murky keeps a rolling local log of browser network requests so you can inspect what leaves the browser.":"Murky conserve un journal local glissant des requêtes réseau du navigateur afin que vous puissiez voir ce qui quitte le navigateur.","Restores every Murky setting to its default value":"Restaure tous les paramètres de Murky à leur valeur par défaut","Export a backup first if you want to keep a copy.":"Exportez d’abord une sauvegarde si vous souhaitez en conserver une copie.","The only official Murky websites are":"Les seuls sites officiels de Murky sont","and":"et",". Be careful with websites claiming to be Murky.":". Méfiez-vous des sites qui prétendent être Murky.","Warning":"Avertissement","Open based on context":"Ouvrir selon le contexte","Always activate new tabs":"Toujours activer les nouveaux onglets","Open new tabs in background":"Ouvrir les nouveaux onglets en arrière-plan","Open New Tab":"Ouvrir un nouvel onglet","Continue previous session":"Continuer la session précédente","System default":"Par défaut du système","Serif":"Serif","Monospace everywhere":"Monospace partout","Rounded sans":"Sans arrondie","Left":"Gauche","Right":"Droite","Move language":"Déplacer la langue","Remove language":"Supprimer la langue","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Cette langue est prioritaire pour traduire les menus, fenêtres contextuelles, paramètres et autres textes de Murky.","Add a Language":"Ajouter une langue","Add an extension":"Ajouter une extension","Add extension":"Ajouter une extension","Choose extension":"Choisir une extension","Delete":"Supprimer","Upload":"Importer","Loaded":"Chargée","Not loaded":"Non chargée","No description provided.":"Aucune description fournie.","Checking…":"Vérification…","Enabled":"Activé","Restricted":"Restreint","Loading…":"Chargement…","Version":"Version","Extension deleted":"Extension supprimée","No extensions installed yet.":"Aucune extension installée.","Use Upload to add a local extension.":"Utilisez Importer pour ajouter une extension locale.","Drop an extension package or unpacked extension folder here, or choose one from your files.":"Déposez ici un paquet d’extension ou un dossier d’extension décompressé, ou choisissez-en un dans vos fichiers."},"es":{"Apply Size":"Aplicar tamaño","Set Background Photo":"Establecer foto de fondo","Use an image as Murky's background.":"Usar una imagen como fondo de Murky.","Drop file":"Suelta el archivo","Browse files":"Explorar archivos","or":"o","No image selected":"No se ha seleccionado ninguna imagen","Stretch to Fit":"Estirar para ajustar","Zoom to Fit":"Zoom para ajustar","Set background":"Establecer fondo","Murky looks like this":"Así se ve Murky","The quick brown fox jumps over the lazy dog, 1234567890.":"El veloz murciélago hindú comía feliz cardillo y kiwi, 1234567890.","Preview":"Vista previa","Clear":"Borrar","Removes your saved history. Bookmarks are not affected.":"Elimina tu historial guardado. Los marcadores no se ven afectados.","Blocks network requests from external websites. Murky internal pages and local features continue to work.":"Bloquea las solicitudes de red de sitios externos. Las páginas internas y funciones locales de Murky siguen funcionando.","Clears browsing history, bookmarks, cookies, local storage, service workers and cached web data in one action.":"Borra en una sola acción el historial, marcadores, cookies, almacenamiento local, service workers y datos web en caché.","Saves a local backup of your settings, history and bookmarks before a purge.":"Guarda una copia de seguridad local de tus ajustes, historial y marcadores antes de borrar los datos.","Exports the current local request log as JSON. URLs may contain query parameters.":"Exporta el registro local actual de solicitudes como JSON. Las URL pueden contener parámetros de consulta.","If a tab renderer crashes, Murky automatically restores that tab instead of leaving it blank.":"Si el renderizador de una pestaña falla, Murky restaura automáticamente esa pestaña en lugar de dejarla en blanco.","Murky keeps a rolling local log of browser network requests so you can inspect what leaves the browser.":"Murky mantiene un registro local continuo de las solicitudes de red del navegador para que puedas ver qué sale del navegador.","Restores every Murky setting to its default value":"Restaura todos los ajustes de Murky a sus valores predeterminados","Export a backup first if you want to keep a copy.":"Exporta primero una copia de seguridad si quieres conservar una copia.","The only official Murky websites are":"Los únicos sitios web oficiales de Murky son","and":"y",". Be careful with websites claiming to be Murky.":". Ten cuidado con los sitios web que afirman ser Murky.","Warning":"Advertencia","Open based on context":"Abrir según el contexto","Always activate new tabs":"Activar siempre las pestañas nuevas","Open new tabs in background":"Abrir pestañas nuevas en segundo plano","Open New Tab":"Abrir nueva pestaña","Continue previous session":"Continuar sesión anterior","System default":"Predeterminado del sistema","Serif":"Serif","Monospace everywhere":"Monoespaciado en todas partes","Rounded sans":"Sans redondeada","Left":"Izquierda","Right":"Derecha","Move language":"Mover idioma","Remove language":"Eliminar idioma","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Este idioma tiene prioridad para traducir menús, ventanas emergentes, ajustes y otros textos de Murky.","Add a Language":"Añadir un idioma","Add an extension":"Añadir una extensión","Add extension":"Añadir extensión","Choose extension":"Elegir extensión","Delete":"Eliminar","Upload":"Subir","Loaded":"Cargada","Not loaded":"No cargada","No description provided.":"No se proporcionó ninguna descripción.","Checking…":"Comprobando…","Enabled":"Activado","Restricted":"Restringido","Loading…":"Cargando…","Version":"Versión","Extension deleted":"Extensión eliminada","No extensions installed yet.":"No hay extensiones instaladas todavía.","Use Upload to add a local extension.":"Usa Subir para añadir una extensión local.","Drop an extension package or unpacked extension folder here, or choose one from your files.":"Suelta aquí un paquete de extensión o una carpeta de extensión descomprimida, o elige una de tus archivos."},"it":{"Apply Size":"Applica dimensione","Set Background Photo":"Imposta foto di sfondo","Use an image as Murky's background.":"Usa un’immagine come sfondo di Murky.","Drop file":"Trascina il file","Browse files":"Sfoglia file","or":"oppure","No image selected":"Nessuna immagine selezionata","Stretch to Fit":"Allunga per adattare","Zoom to Fit":"Zoom per adattare","Set background":"Imposta sfondo","Murky looks like this":"Ecco come appare Murky","The quick brown fox jumps over the lazy dog, 1234567890.":"Quel fezzo sghembo sul taxi volò, 1234567890.","Preview":"Anteprima","Clear":"Cancella","Removes your saved history. Bookmarks are not affected.":"Rimuove la cronologia salvata. I segnalibri non vengono modificati.","Blocks network requests from external websites. Murky internal pages and local features continue to work.":"Blocca le richieste di rete dei siti esterni. Le pagine interne e le funzioni locali di Murky continuano a funzionare.","Clears browsing history, bookmarks, cookies, local storage, service workers and cached web data in one action.":"Cancella in un’unica operazione cronologia, segnalibri, cookie, archiviazione locale, service worker e dati web memorizzati nella cache.","Saves a local backup of your settings, history and bookmarks before a purge.":"Salva un backup locale delle impostazioni, della cronologia e dei segnalibri prima della cancellazione.","Exports the current local request log as JSON. URLs may contain query parameters.":"Esporta il registro locale corrente delle richieste in JSON. Gli URL possono contenere parametri di query.","If a tab renderer crashes, Murky automatically restores that tab instead of leaving it blank.":"Se il renderer di una scheda si arresta, Murky ripristina automaticamente la scheda invece di lasciarla vuota.","Murky keeps a rolling local log of browser network requests so you can inspect what leaves the browser.":"Murky mantiene un registro locale continuo delle richieste di rete del browser per permetterti di vedere cosa lascia il browser.","Restores every Murky setting to its default value":"Ripristina tutte le impostazioni di Murky ai valori predefiniti","Export a backup first if you want to keep a copy.":"Esporta prima un backup se vuoi conservarne una copia.","The only official Murky websites are":"Gli unici siti web ufficiali di Murky sono","and":"e",". Be careful with websites claiming to be Murky.":". Fai attenzione ai siti che dichiarano di essere Murky.","Warning":"Avviso","Open based on context":"Apri in base al contesto","Always activate new tabs":"Attiva sempre le nuove schede","Open new tabs in background":"Apri le nuove schede in background","Open New Tab":"Apri nuova scheda","Continue previous session":"Continua la sessione precedente","System default":"Predefinito di sistema","Serif":"Serif","Monospace everywhere":"Monospace ovunque","Rounded sans":"Sans arrotondato","Left":"Sinistra","Right":"Destra","Move language":"Sposta lingua","Remove language":"Rimuovi lingua","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Questa lingua ha la priorità per tradurre menu, popup, impostazioni e altri testi di Murky.","Add a Language":"Aggiungi una lingua","Add an extension":"Aggiungi un’estensione","Add extension":"Aggiungi estensione","Choose extension":"Scegli estensione","Delete":"Elimina","Upload":"Carica","Loaded":"Caricata","Not loaded":"Non caricata","No description provided.":"Nessuna descrizione fornita.","Checking…":"Controllo…","Enabled":"Attivato","Restricted":"Limitato","Loading…":"Caricamento…","Version":"Versione","Extension deleted":"Estensione eliminata","No extensions installed yet.":"Nessuna estensione installata.","Use Upload to add a local extension.":"Usa Carica per aggiungere un’estensione locale.","Drop an extension package or unpacked extension folder here, or choose one from your files.":"Trascina qui un pacchetto di estensione o una cartella di estensione estratta, oppure scegline una dai file."},"pt":{"Apply Size":"Aplicar tamanho","Set Background Photo":"Definir foto de fundo","Use an image as Murky's background.":"Usar uma imagem como fundo do Murky.","Drop file":"Solte o ficheiro","Browse files":"Procurar ficheiros","or":"ou","No image selected":"Nenhuma imagem selecionada","Stretch to Fit":"Esticar para ajustar","Zoom to Fit":"Ampliar para ajustar","Set background":"Definir fundo","Murky looks like this":"É assim que o Murky fica","The quick brown fox jumps over the lazy dog, 1234567890.":"Um pequeno jabuti xereta viu dez cegonhas felizes, 1234567890.","Preview":"Pré-visualização","Clear":"Limpar","Removes your saved history. Bookmarks are not affected.":"Remove o histórico guardado. Os marcadores não são afetados.","Blocks network requests from external websites. Murky internal pages and local features continue to work.":"Bloqueia pedidos de rede de sites externos. As páginas internas e funções locais do Murky continuam a funcionar.","Clears browsing history, bookmarks, cookies, local storage, service workers and cached web data in one action.":"Limpa o histórico, marcadores, cookies, armazenamento local, service workers e dados web em cache numa só ação.","Saves a local backup of your settings, history and bookmarks before a purge.":"Guarda uma cópia de segurança local das definições, histórico e marcadores antes de uma limpeza.","Exports the current local request log as JSON. URLs may contain query parameters.":"Exporta o registo local atual de pedidos como JSON. Os URLs podem conter parâmetros de consulta.","If a tab renderer crashes, Murky automatically restores that tab instead of leaving it blank.":"Se o renderizador de um separador falhar, o Murky restaura-o automaticamente em vez de o deixar em branco.","Murky keeps a rolling local log of browser network requests so you can inspect what leaves the browser.":"O Murky mantém um registo local contínuo dos pedidos de rede do navegador para que possa ver o que sai do navegador.","Restores every Murky setting to its default value":"Repõe todas as definições do Murky nos valores predefinidos","Export a backup first if you want to keep a copy.":"Exporte primeiro uma cópia de segurança se quiser guardar uma cópia.","The only official Murky websites are":"Os únicos sites oficiais do Murky são","and":"e",". Be careful with websites claiming to be Murky.":". Tenha cuidado com sites que afirmem ser o Murky.","Warning":"Aviso","Open based on context":"Abrir com base no contexto","Always activate new tabs":"Ativar sempre novos separadores","Open new tabs in background":"Abrir novos separadores em segundo plano","Open New Tab":"Abrir novo separador","Continue previous session":"Continuar sessão anterior","System default":"Predefinição do sistema","Serif":"Serif","Monospace everywhere":"Monoespaçado em todo o lado","Rounded sans":"Sans arredondada","Left":"Esquerda","Right":"Direita","Move language":"Mover idioma","Remove language":"Remover idioma","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Este idioma tem prioridade para traduzir menus, popups, definições e outros textos do Murky.","Add a Language":"Adicionar um idioma","Add an extension":"Adicionar uma extensão","Add extension":"Adicionar extensão","Choose extension":"Escolher extensão","Delete":"Eliminar","Upload":"Carregar","Loaded":"Carregada","Not loaded":"Não carregada","No description provided.":"Nenhuma descrição fornecida.","Checking…":"A verificar…","Enabled":"Ativado","Restricted":"Restrito","Loading…":"A carregar…","Version":"Versão","Extension deleted":"Extensão eliminada","No extensions installed yet.":"Ainda não existem extensões instaladas.","Use Upload to add a local extension.":"Use Carregar para adicionar uma extensão local.","Drop an extension package or unpacked extension folder here, or choose one from your files.":"Largue aqui um pacote de extensão ou uma pasta de extensão descompactada, ou escolha uma nos seus ficheiros."},"nl":{"Apply Size":"Grootte toepassen","Set Background Photo":"Achtergrondfoto instellen","Use an image as Murky's background.":"Een afbeelding als Murky-achtergrond gebruiken.","Drop file":"Bestand hier neerzetten","Browse files":"Bestanden bladeren","or":"of","No image selected":"Geen afbeelding geselecteerd","Stretch to Fit":"Uitrekken om te passen","Zoom to Fit":"Zoomen om te passen","Set background":"Achtergrond instellen","Murky looks like this":"Zo ziet Murky eruit","The quick brown fox jumps over the lazy dog, 1234567890.":"Pa’s wijze lynx bezag vroom het fikse aquaduct, 1234567890.","Preview":"Voorbeeld","Clear":"Wissen","Removes your saved history. Bookmarks are not affected.":"Verwijdert je opgeslagen geschiedenis. Bladwijzers worden niet beïnvloed.","Blocks network requests from external websites. Murky internal pages and local features continue to work.":"Blokkeert netwerkverzoeken van externe websites. Interne Murky-pagina’s en lokale functies blijven werken.","Clears browsing history, bookmarks, cookies, local storage, service workers and cached web data in one action.":"Wist browsegeschiedenis, bladwijzers, cookies, lokale opslag, serviceworkers en gecachte webgegevens in één handeling.","Saves a local backup of your settings, history and bookmarks before a purge.":"Slaat vóór het wissen een lokale back-up van je instellingen, geschiedenis en bladwijzers op.","Exports the current local request log as JSON. URLs may contain query parameters.":"Exporteert het huidige lokale verzoekenlogboek als JSON. URL’s kunnen queryparameters bevatten.","If a tab renderer crashes, Murky automatically restores that tab instead of leaving it blank.":"Als de renderer van een tabblad crasht, herstelt Murky dat tabblad automatisch in plaats van het leeg te laten.","Murky keeps a rolling local log of browser network requests so you can inspect what leaves the browser.":"Murky houdt een doorlopend lokaal logboek van browsernetwerkverzoeken bij zodat je kunt zien wat de browser verlaat.","Restores every Murky setting to its default value":"Herstelt alle Murky-instellingen naar hun standaardwaarden","Export a backup first if you want to keep a copy.":"Exporteer eerst een back-up als je een kopie wilt bewaren.","The only official Murky websites are":"De enige officiële Murky-websites zijn","and":"en",". Be careful with websites claiming to be Murky.":". Wees voorzichtig met websites die beweren Murky te zijn.","Warning":"Waarschuwing","Open based on context":"Openen op basis van context","Always activate new tabs":"Nieuwe tabbladen altijd activeren","Open new tabs in background":"Nieuwe tabbladen op de achtergrond openen","Open New Tab":"Nieuw tabblad openen","Continue previous session":"Vorige sessie voortzetten","System default":"Systeemstandaard","Serif":"Serif","Monospace everywhere":"Overal monospace","Rounded sans":"Afgeronde sans","Left":"Links","Right":"Rechts","Move language":"Taal verplaatsen","Remove language":"Taal verwijderen","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Deze taal krijgt voorrang voor het vertalen van menu’s, pop-ups, instellingen en andere Murky-tekst.","Add a Language":"Taal toevoegen","Add an extension":"Extensie toevoegen","Add extension":"Extensie toevoegen","Choose extension":"Extensie kiezen","Delete":"Verwijderen","Upload":"Uploaden","Loaded":"Geladen","Not loaded":"Niet geladen","No description provided.":"Geen beschrijving opgegeven.","Checking…":"Controleren…","Enabled":"Ingeschakeld","Restricted":"Beperkt","Loading…":"Laden…","Version":"Versie","Extension deleted":"Extensie verwijderd","No extensions installed yet.":"Nog geen extensies geïnstalleerd.","Use Upload to add a local extension.":"Gebruik Uploaden om een lokale extensie toe te voegen.","Drop an extension package or unpacked extension folder here, or choose one from your files.":"Zet hier een extensiepakket of uitgepakte extensiemap neer, of kies er een uit je bestanden."},"ru":{"Apply Size":"Применить размер","Set Background Photo":"Установить фоновое фото","Use an image as Murky's background.":"Использовать изображение как фон Murky.","Drop file":"Перетащите файл","Browse files":"Обзор файлов","or":"или","No image selected":"Изображение не выбрано","Stretch to Fit":"Растянуть по размеру","Zoom to Fit":"Увеличить по размеру","Set background":"Установить фон","Murky looks like this":"Так выглядит Murky","The quick brown fox jumps over the lazy dog, 1234567890.":"Съешь ещё этих мягких французских булок, да выпей чаю, 1234567890.","Preview":"Предпросмотр","Clear":"Очистить","Removes your saved history. Bookmarks are not affected.":"Удаляет сохранённую историю. Закладки не затрагиваются.","Blocks network requests from external websites. Murky internal pages and local features continue to work.":"Блокирует сетевые запросы внешних сайтов. Внутренние страницы Murky и локальные функции продолжают работать.","Clears browsing history, bookmarks, cookies, local storage, service workers and cached web data in one action.":"Одним действием очищает историю браузера, закладки, cookies, локальное хранилище, service worker и кэшированные веб-данные.","Saves a local backup of your settings, history and bookmarks before a purge.":"Перед очисткой сохраняет локальную резервную копию настроек, истории и закладок.","Exports the current local request log as JSON. URLs may contain query parameters.":"Экспортирует текущий локальный журнал запросов в JSON. URL могут содержать параметры запроса.","If a tab renderer crashes, Murky automatically restores that tab instead of leaving it blank.":"Если процесс отрисовки вкладки завершится с ошибкой, Murky автоматически восстановит вкладку, а не оставит её пустой.","Murky keeps a rolling local log of browser network requests so you can inspect what leaves the browser.":"Murky ведёт непрерывный локальный журнал сетевых запросов браузера, чтобы вы могли видеть, что покидает браузер.","Restores every Murky setting to its default value":"Восстанавливает все настройки Murky по умолчанию","Export a backup first if you want to keep a copy.":"Сначала экспортируйте резервную копию, если хотите сохранить её.","The only official Murky websites are":"Единственные официальные сайты Murky —","and":"и",". Be careful with websites claiming to be Murky.":". Остерегайтесь сайтов, выдающих себя за Murky.","Warning":"Предупреждение","Open based on context":"Открывать по контексту","Always activate new tabs":"Всегда активировать новые вкладки","Open new tabs in background":"Открывать новые вкладки в фоне","Open New Tab":"Открыть новую вкладку","Continue previous session":"Продолжить предыдущий сеанс","System default":"Системный по умолчанию","Serif":"Serif","Monospace everywhere":"Моноширинный везде","Rounded sans":"Скруглённый гротеск","Left":"Слева","Right":"Справа","Move language":"Переместить язык","Remove language":"Удалить язык","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Этот язык имеет приоритет для перевода меню, всплывающих окон, настроек и других текстов Murky.","Add a Language":"Добавить язык","Add an extension":"Добавить расширение","Add extension":"Добавить расширение","Choose extension":"Выбрать расширение","Delete":"Удалить","Upload":"Загрузить","Loaded":"Загружено","Not loaded":"Не загружено","No description provided.":"Описание не предоставлено.","Checking…":"Проверка…","Enabled":"Включено","Restricted":"Ограничено","Loading…":"Загрузка…","Version":"Версия","Extension deleted":"Расширение удалено","No extensions installed yet.":"Расширения ещё не установлены.","Use Upload to add a local extension.":"Используйте Загрузить, чтобы добавить локальное расширение.","Drop an extension package or unpacked extension folder here, or choose one from your files.":"Перетащите сюда пакет расширения или распакованную папку расширения либо выберите её из файлов."},"pl":{"Apply Size":"Zastosuj rozmiar","Set Background Photo":"Ustaw zdjęcie tła","Use an image as Murky's background.":"Użyj obrazu jako tła Murky.","Drop file":"Upuść plik","Browse files":"Przeglądaj pliki","or":"lub","No image selected":"Nie wybrano obrazu","Stretch to Fit":"Rozciągnij, aby dopasować","Zoom to Fit":"Powiększ, aby dopasować","Set background":"Ustaw tło","Murky looks like this":"Tak wygląda Murky","The quick brown fox jumps over the lazy dog, 1234567890.":"Pchnąć w tę łódź jeża lub ośm skrzyń fig, 1234567890.","Preview":"Podgląd","Clear":"Wyczyść","Removes your saved history. Bookmarks are not affected.":"Usuwa zapisaną historię. Zakładki nie są zmieniane.","Blocks network requests from external websites. Murky internal pages and local features continue to work.":"Blokuje żądania sieciowe z zewnętrznych stron. Wewnętrzne strony Murky i funkcje lokalne nadal działają.","Clears browsing history, bookmarks, cookies, local storage, service workers and cached web data in one action.":"Jednym działaniem usuwa historię przeglądania, zakładki, pliki cookie, pamięć lokalną, service workery i dane internetowe z pamięci podręcznej.","Saves a local backup of your settings, history and bookmarks before a purge.":"Przed czyszczeniem zapisuje lokalną kopię ustawień, historii i zakładek.","Exports the current local request log as JSON. URLs may contain query parameters.":"Eksportuje bieżący lokalny dziennik żądań jako JSON. Adresy URL mogą zawierać parametry zapytania.","If a tab renderer crashes, Murky automatically restores that tab instead of leaving it blank.":"Jeśli proces renderowania karty ulegnie awarii, Murky automatycznie ją przywróci zamiast pozostawić pustą.","Murky keeps a rolling local log of browser network requests so you can inspect what leaves the browser.":"Murky prowadzi ciągły lokalny dziennik żądań sieciowych przeglądarki, aby można było sprawdzić, co opuszcza przeglądarkę.","Restores every Murky setting to its default value":"Przywraca wszystkie ustawienia Murky do wartości domyślnych","Export a backup first if you want to keep a copy.":"Najpierw wyeksportuj kopię zapasową, jeśli chcesz ją zachować.","The only official Murky websites are":"Jedyne oficjalne strony Murky to","and":"i",". Be careful with websites claiming to be Murky.":". Uważaj na strony podające się za Murky.","Warning":"Ostrzeżenie","Open based on context":"Otwieraj zależnie od kontekstu","Always activate new tabs":"Zawsze aktywuj nowe karty","Open new tabs in background":"Otwieraj nowe karty w tle","Open New Tab":"Otwórz nową kartę","Continue previous session":"Kontynuuj poprzednią sesję","System default":"Domyślne systemu","Serif":"Szeryfowa","Monospace everywhere":"Monospace wszędzie","Rounded sans":"Zaokrąglona bezszeryfowa","Left":"Lewo","Right":"Prawo","Move language":"Przenieś język","Remove language":"Usuń język","This language is given priority to translate display menus, popups, settings and other text on Murky.":"Ten język ma pierwszeństwo w tłumaczeniu menu, wyskakujących okien, ustawień i innych tekstów Murky.","Add a Language":"Dodaj język","Add an extension":"Dodaj rozszerzenie","Add extension":"Dodaj rozszerzenie","Choose extension":"Wybierz rozszerzenie","Delete":"Usuń","Upload":"Prześlij","Loaded":"Załadowano","Not loaded":"Nie załadowano","No description provided.":"Brak opisu.","Checking…":"Sprawdzanie…","Enabled":"Włączone","Restricted":"Ograniczone","Loading…":"Ładowanie…","Version":"Wersja","Extension deleted":"Usunięto rozszerzenie","No extensions installed yet.":"Nie zainstalowano jeszcze żadnych rozszerzeń.","Use Upload to add a local extension.":"Użyj Prześlij, aby dodać lokalne rozszerzenie.","Drop an extension package or unpacked extension folder here, or choose one from your files.":"Upuść tutaj pakiet rozszerzenia lub rozpakowany folder rozszerzenia albo wybierz go z plików."},"ja":{"Apply Size":"サイズを適用","Set Background Photo":"背景写真を設定","Use an image as Murky's background.":"画像をMurkyの背景として使用します。","Drop file":"ファイルをドロップ","Browse files":"ファイルを参照","or":"または","No image selected":"画像が選択されていません","Stretch to Fit":"引き伸ばして合わせる","Zoom to Fit":"ズームして合わせる","Set background":"背景を設定","Murky looks like this":"Murky はこのように表示されます","The quick brown fox jumps over the lazy dog, 1234567890.":"いろはにほへと ちりぬるを、1234567890。","Preview":"プレビュー","Clear":"消去","Removes your saved history. Bookmarks are not affected.":"保存した履歴を削除します。ブックマークには影響しません。","Blocks network requests from external websites. Murky internal pages and local features continue to work.":"外部サイトからのネットワーク要求をブロックします。Murky の内部ページとローカル機能は引き続き動作します。","Clears browsing history, bookmarks, cookies, local storage, service workers and cached web data in one action.":"閲覧履歴、ブックマーク、Cookie、ローカルストレージ、service worker、キャッシュされたWebデータを一度に消去します。","Saves a local backup of your settings, history and bookmarks before a purge.":"消去する前に設定、履歴、ブックマークのローカルバックアップを保存します。","Exports the current local request log as JSON. URLs may contain query parameters.":"現在のローカルリクエストログをJSONとしてエクスポートします。URLにはクエリパラメータが含まれる場合があります。","If a tab renderer crashes, Murky automatically restores that tab instead of leaving it blank.":"タブのレンダラーがクラッシュした場合、Murky は空白のままにせず自動的にタブを復元します。","Murky keeps a rolling local log of browser network requests so you can inspect what leaves the browser.":"Murky はブラウザーから外部へ送信されたものを確認できるよう、ネットワーク要求のローカルログを継続的に保存します。","Restores every Murky setting to its default value":"すべての Murky 設定を既定値に戻します","Export a backup first if you want to keep a copy.":"コピーを残したい場合は、先にバックアップをエクスポートしてください。","The only official Murky websites are":"Murky の公式Webサイトは次の2つだけです","and":"と",". Be careful with websites claiming to be Murky.":". Murky を名乗るWebサイトには注意してください。","Warning":"警告","Open based on context":"状況に応じて開く","Always activate new tabs":"新しいタブを常にアクティブにする","Open new tabs in background":"新しいタブをバックグラウンドで開く","Open New Tab":"新しいタブを開く","Continue previous session":"前回のセッションを続行","System default":"システム標準","Serif":"セリフ","Monospace everywhere":"すべてモノスペース","Rounded sans":"丸ゴシック","Left":"左","Right":"右","Move language":"言語を移動","Remove language":"言語を削除","This language is given priority to translate display menus, popups, settings and other text on Murky.":"この言語を優先して Murky のメニュー、ポップアップ、設定、その他のテキストを翻訳します。","Add a Language":"言語を追加","Add an extension":"拡張機能を追加","Add extension":"拡張機能を追加","Choose extension":"拡張機能を選択","Delete":"削除","Upload":"アップロード","Loaded":"読み込み済み","Not loaded":"未読み込み","No description provided.":"説明はありません。","Checking…":"確認中…","Enabled":"有効","Restricted":"制限あり","Loading…":"読み込み中…","Version":"バージョン","Extension deleted":"拡張機能を削除しました","No extensions installed yet.":"拡張機能はまだインストールされていません。","Use Upload to add a local extension.":"アップロードを使用してローカル拡張機能を追加します。","Drop an extension package or unpacked extension folder here, or choose one from your files.":"拡張機能パッケージまたは展開済みの拡張機能フォルダーをここにドロップするか、ファイルから選択してください。"},"ko":{"Apply Size":"크기 적용","Set Background Photo":"배경 사진 설정","Use an image as Murky's background.":"이미지를 Murky 배경으로 사용합니다.","Drop file":"파일을 놓으세요","Browse files":"파일 찾아보기","or":"또는","No image selected":"선택한 이미지 없음","Stretch to Fit":"늘려서 맞추기","Zoom to Fit":"확대하여 맞추기","Set background":"배경 설정","Murky looks like this":"Murky는 이렇게 보입니다","The quick brown fox jumps over the lazy dog, 1234567890.":"다람쥐 헌 쳇바퀴에 타고파, 1234567890.","Preview":"미리보기","Clear":"지우기","Removes your saved history. Bookmarks are not affected.":"저장된 기록을 삭제합니다. 북마크에는 영향을 주지 않습니다.","Blocks network requests from external websites. Murky internal pages and local features continue to work.":"외부 웹사이트의 네트워크 요청을 차단합니다. Murky 내부 페이지와 로컬 기능은 계속 작동합니다.","Clears browsing history, bookmarks, cookies, local storage, service workers and cached web data in one action.":"인터넷 사용 기록, 북마크, 쿠키, 로컬 저장소, service worker 및 캐시된 웹 데이터를 한 번에 삭제합니다.","Saves a local backup of your settings, history and bookmarks before a purge.":"삭제 전에 설정, 기록 및 북마크의 로컬 백업을 저장합니다.","Exports the current local request log as JSON. URLs may contain query parameters.":"현재 로컬 요청 로그를 JSON으로 내보냅니다. URL에는 쿼리 매개변수가 포함될 수 있습니다.","If a tab renderer crashes, Murky automatically restores that tab instead of leaving it blank.":"탭 렌더러가 충돌하면 Murky는 탭을 빈 상태로 두지 않고 자동으로 복원합니다.","Murky keeps a rolling local log of browser network requests so you can inspect what leaves the browser.":"Murky는 브라우저에서 무엇이 나가는지 확인할 수 있도록 네트워크 요청의 로컬 로그를 계속 기록합니다.","Restores every Murky setting to its default value":"모든 Murky 설정을 기본값으로 복원합니다","Export a backup first if you want to keep a copy.":"복사본을 보관하려면 먼저 백업을 내보내세요.","The only official Murky websites are":"Murky의 공식 웹사이트는 다음 두 곳뿐입니다","and":"및",". Be careful with websites claiming to be Murky.":". Murky라고 주장하는 웹사이트에 주의하세요.","Warning":"경고","Open based on context":"상황에 따라 열기","Always activate new tabs":"새 탭 항상 활성화","Open new tabs in background":"새 탭을 백그라운드에서 열기","Open New Tab":"새 탭 열기","Continue previous session":"이전 세션 계속","System default":"시스템 기본값","Serif":"세리프","Monospace everywhere":"모든 곳에서 고정폭","Rounded sans":"둥근 산세리프","Left":"왼쪽","Right":"오른쪽","Move language":"언어 이동","Remove language":"언어 제거","This language is given priority to translate display menus, popups, settings and other text on Murky.":"이 언어를 우선하여 Murky 메뉴, 팝업, 설정 및 기타 텍스트를 번역합니다.","Add a Language":"언어 추가","Add an extension":"확장 프로그램 추가","Add extension":"확장 프로그램 추가","Choose extension":"확장 프로그램 선택","Delete":"삭제","Upload":"업로드","Loaded":"로드됨","Not loaded":"로드되지 않음","No description provided.":"설명이 없습니다.","Checking…":"확인 중…","Enabled":"사용","Restricted":"제한됨","Loading…":"로드 중…","Version":"버전","Extension deleted":"확장 프로그램 삭제됨","No extensions installed yet.":"아직 설치된 확장 프로그램이 없습니다.","Use Upload to add a local extension.":"업로드를 사용하여 로컬 확장 프로그램을 추가하세요.","Drop an extension package or unpacked extension folder here, or choose one from your files.":"확장 프로그램 패키지 또는 압축 해제된 확장 프로그램 폴더를 여기에 놓거나 파일에서 선택하세요."},"zh":{"Apply Size":"应用大小","Set Background Photo":"设置背景照片","Use an image as Murky's background.":"使用图片作为 Murky 背景。","Drop file":"拖放文件","Browse files":"浏览文件","or":"或","No image selected":"未选择图片","Stretch to Fit":"拉伸适配","Zoom to Fit":"缩放适配","Set background":"设置背景","Murky looks like this":"Murky 看起来是这样的","The quick brown fox jumps over the lazy dog, 1234567890.":"天地玄黄，宇宙洪荒，1234567890。","Preview":"预览","Clear":"清除","Removes your saved history. Bookmarks are not affected.":"删除已保存的历史记录。不会影响书签。","Blocks network requests from external websites. Murky internal pages and local features continue to work.":"阻止外部网站的网络请求。Murky 内部页面和本地功能仍可正常工作。","Clears browsing history, bookmarks, cookies, local storage, service workers and cached web data in one action.":"一次性清除浏览历史、书签、Cookie、本地存储、service worker 和缓存的网页数据。","Saves a local backup of your settings, history and bookmarks before a purge.":"清除前保存设置、历史记录和书签的本地备份。","Exports the current local request log as JSON. URLs may contain query parameters.":"将当前本地请求日志导出为 JSON。URL 可能包含查询参数。","If a tab renderer crashes, Murky automatically restores that tab instead of leaving it blank.":"如果标签页渲染器崩溃，Murky 会自动恢复该标签页，而不会让它保持空白。","Murky keeps a rolling local log of browser network requests so you can inspect what leaves the browser.":"Murky 持续保存浏览器网络请求的本地日志，方便你查看浏览器发出的内容。","Restores every Murky setting to its default value":"将所有 Murky 设置恢复为默认值","Export a backup first if you want to keep a copy.":"如果想保留副本，请先导出备份。","The only official Murky websites are":"Murky 唯一的官方网站是","and":"和",". Be careful with websites claiming to be Murky.":". 请警惕声称是 Murky 的网站。","Warning":"警告","Open based on context":"根据上下文打开","Always activate new tabs":"始终激活新标签页","Open new tabs in background":"在后台打开新标签页","Open New Tab":"打开新标签页","Continue previous session":"继续上次会话","System default":"系统默认","Serif":"衬线","Monospace everywhere":"全局等宽字体","Rounded sans":"圆体无衬线","Left":"左侧","Right":"右侧","Move language":"移动语言","Remove language":"移除语言","This language is given priority to translate display menus, popups, settings and other text on Murky.":"此语言优先用于翻译 Murky 的菜单、弹窗、设置和其他文本。","Add a Language":"添加语言","Add an extension":"添加扩展程序","Add extension":"添加扩展程序","Choose extension":"选择扩展程序","Delete":"删除","Upload":"上传","Loaded":"已加载","Not loaded":"未加载","No description provided.":"未提供描述。","Checking…":"正在检查…","Enabled":"已启用","Restricted":"受限","Loading…":"加载中…","Version":"版本","Extension deleted":"扩展程序已删除","No extensions installed yet.":"尚未安装扩展程序。","Use Upload to add a local extension.":"使用上传来添加本地扩展程序。","Drop an extension package or unpacked extension folder here, or choose one from your files.":"将扩展程序包或解压后的扩展程序文件夹拖到这里，或从文件中选择。"},"tr":{"Apply Size":"Boyutu Uygula","The only official Murky websites are":"Murky'nin yalnızca şu resmi web siteleri vardır:","and":"ve",". Be careful with websites claiming to be Murky.":". Murky olduğunu iddia eden web sitelerine dikkat edin."}};
for (const [lang,map] of Object.entries(EXTRA_LOCAL_UI_TRANSLATIONS)) Object.assign(BUILTIN_TRANSLATIONS[lang] || (BUILTIN_TRANSLATIONS[lang]={}), map);
const ADDITIONAL_LOCAL_UI_TRANSLATIONS = require(path.join(__dirname, "src", "local-ui-translations.js"));
for (const [lang,map] of Object.entries(ADDITIONAL_LOCAL_UI_TRANSLATIONS)) Object.assign(BUILTIN_TRANSLATIONS[lang] || (BUILTIN_TRANSLATIONS[lang]={}), map);
const SITE_LOCAL_UI_TRANSLATIONS = require(path.join(__dirname, "src", "local-ui-translations-sites.js"));
for (const [lang,map] of Object.entries(SITE_LOCAL_UI_TRANSLATIONS)) Object.assign(BUILTIN_TRANSLATIONS[lang] || (BUILTIN_TRANSLATIONS[lang]={}), map);

const LEGAL_LOCAL_TRANSLATIONS = { tr: {
  "Terms of Service": "Hizmet Şartları",
  "Privacy Policy": "Gizlilik Politikası",
  "1. Using Murky": "1. Murky'yi Kullanma",
  "2. Third-party websites and services": "2. Üçüncü taraf web siteleri ve hizmetleri",
  "3. Responsible use": "3. Sorumlu kullanım",
  "4. Software changes": "4. Yazılım değişiklikleri",
  "5. Downloads and content": "5. İndirmeler ve içerik",
  "6. No warranty": "6. Garanti yoktur",
  "7. Limitation of liability": "7. Sorumluluğun sınırlandırılması",
  "8. Changes to these terms": "8. Bu şartlarda yapılan değişiklikler",
  "9. Acceptance": "9. Kabul",
  "These Terms of Service govern your use of Murky Browser. By using Murky, you agree to use the software responsibly and in accordance with applicable laws and the rules of the websites you access.": "Bu Hizmet Şartları, Murky Browser kullanımınızı düzenler. Murky'yi kullanarak yazılımı sorumlu bir şekilde, yürürlükteki yasalara ve eriştiğiniz web sitelerinin kurallarına uygun kullanmayı kabul etmiş olursunuz.",
  "Murky is browser software provided for general web browsing and related productivity features. You are responsible for your use of the browser and for the content you access through it.": "Murky, genel web gezintisi ve ilgili üretkenlik özellikleri için sunulan bir tarayıcı yazılımıdır. Tarayıcıyı nasıl kullandığınızdan ve onun üzerinden eriştiğiniz içerikten siz sorumlusunuz.",
  "Murky can access websites, search engines, downloads, and other third-party services. Those services have their own terms, policies, and requirements. Your use of them is governed by their respective terms.": "Murky web sitelerine, arama motorlarına, indirmelere ve diğer üçüncü taraf hizmetlerine erişebilir. Bu hizmetlerin kendi şartları, politikaları ve gereksinimleri vardır. Bunları kullanımınız ilgili şartlara tabidir.",
  "You must not use Murky to violate applicable law, interfere with networks or services, distribute malware, infringe intellectual property rights, or attempt to gain unauthorized access to systems or accounts.": "Murky'yi yürürlükteki yasaları ihlal etmek, ağlara veya hizmetlere müdahale etmek, kötü amaçlı yazılım dağıtmak, fikri mülkiyet haklarını ihlal etmek ya da sistemlere veya hesaplara yetkisiz erişim sağlamaya çalışmak için kullanmamalısınız.",
  "Murky may be updated, modified, or discontinued. Features may change over time, including privacy controls, supported websites, and browser functionality.": "Murky güncellenebilir, değiştirilebilir veya sonlandırılabilir. Gizlilik kontrolleri, desteklenen web siteleri ve tarayıcı işlevleri dahil olmak üzere özellikler zaman içinde değişebilir.",
  "You are responsible for deciding which files and content to download or open. Murky does not guarantee that third-party content is safe, accurate, available, or free of harmful material.": "Hangi dosya ve içerikleri indireceğinize veya açacağınıza karar vermekten siz sorumlusunuz. Murky, üçüncü taraf içeriğinin güvenli, doğru, erişilebilir veya zararlı materyallerden arınmış olduğunu garanti etmez.",
  "Murky is provided on an “as available” basis to the maximum extent permitted by law. We do not promise that the browser will always be uninterrupted, error-free, or compatible with every website or device.": "Murky, yasaların izin verdiği azami ölçüde “mevcut olduğu haliyle” sunulur. Tarayıcının her zaman kesintisiz, hatasız veya her web sitesi ya da cihazla uyumlu olacağını garanti etmiyoruz.",
  "To the maximum extent permitted by applicable law, the Murky project and its contributors are not responsible for indirect, incidental, special, or consequential losses arising from your use of the software or third-party websites.": "Yürürlükteki yasaların izin verdiği azami ölçüde Murky projesi ve katkıda bulunanları, yazılımı veya üçüncü taraf web sitelerini kullanımınızdan kaynaklanan dolaylı, arızi, özel veya sonuç olarak ortaya çıkan zararlardan sorumlu değildir.",
  "These terms may be updated as the software evolves. Continuing to use a newer version of Murky after an update means you accept the revised terms to the extent permitted by law.": "Yazılım geliştikçe bu şartlar güncellenebilir. Bir güncellemeden sonra Murky'nin daha yeni bir sürümünü kullanmaya devam etmeniz, yasaların izin verdiği ölçüde revize edilmiş şartları kabul ettiğiniz anlamına gelir.",
  "If you do not agree with these terms, do not use Murky. If local law requires a different treatment of any provision, that provision will apply only to the extent permitted by law.": "Bu şartları kabul etmiyorsanız Murky'yi kullanmayın. Yerel hukuk herhangi bir hükmün farklı şekilde uygulanmasını gerektiriyorsa, ilgili hüküm yalnızca yasaların izin verdiği ölçüde uygulanır.",
  "1. Information stored locally": "1. Yerel olarak saklanan bilgiler",
  "2. Websites you visit": "2. Ziyaret ettiğiniz web siteleri",
  "3. Search and voice features": "3. Arama ve ses özellikleri",
  "4. Blocking and Do Not Track": "4. Engelleme ve Do Not Track",
  "5. Downloads": "5. İndirmeler",
  "6. Security": "6. Güvenlik",
  "7. Changes": "7. Değişiklikler",
  "8. Contact": "8. İletişim",
  "This Privacy Policy explains what Murky Browser stores and how information is handled when you use the browser. Murky is designed so that ordinary browsing data stays on your device unless a feature or website you visit requires network communication.": "Bu Gizlilik Politikası, Murky Browser'ın neleri sakladığını ve tarayıcıyı kullandığınızda bilgilerin nasıl işlendiğini açıklar. Murky, bir özellik veya ziyaret ettiğiniz bir web sitesi ağ iletişimi gerektirmedikçe normal gezinme verilerinin cihazınızda kalması için tasarlanmıştır.",
  "Murky may store settings, bookmarks, browsing history, recent searches, session information, and download preferences in your device's local application data. These records are used to provide browser features and are not intentionally uploaded to Murky servers.": "Murky; ayarları, yer imlerini, gezinme geçmişini, son aramaları, oturum bilgilerini ve indirme tercihlerini cihazınızın yerel uygulama verilerinde saklayabilir. Bu kayıtlar tarayıcı özelliklerini sağlamak için kullanılır ve kasıtlı olarak Murky sunucularına yüklenmez.",
  "When you browse the web, your requests go to the websites and services you choose to visit. Those websites may collect information according to their own privacy policies. Murky does not control the privacy practices of third-party websites.": "Web'de gezinirken istekleriniz ziyaret etmeyi seçtiğiniz web sitelerine ve hizmetlere gönderilir. Bu web siteleri kendi gizlilik politikalarına göre bilgi toplayabilir. Murky, üçüncü taraf web sitelerinin gizlilik uygulamalarını kontrol etmez.",
  "Your selected search engine receives searches when you submit them. Murky's voice-search feature processes supported speech locally on your device when its local speech model is available. Network services used by a website you visit remain subject to that website's policies.": "Seçtiğiniz arama motoru, aramaları gönderdiğinizde bunları alır. Murky'nin sesli arama özelliği, yerel konuşma modeli mevcut olduğunda desteklenen konuşmayı cihazınızda yerel olarak işler. Ziyaret ettiğiniz bir web sitesinin kullandığı ağ hizmetleri o sitenin politikalarına tabidir.",
  "Murky can block requests to a built-in list of known advertising and tracking domains. You can also enable Do Not Track requests. Blocking is best-effort and does not guarantee that every advertisement or tracker will be prevented.": "Murky, bilinen reklam ve izleme alan adlarından oluşan yerleşik bir listeye yönelik istekleri engelleyebilir. Ayrıca Do Not Track isteklerini etkinleştirebilirsiniz. Engelleme en iyi çaba esasına dayanır ve her reklamın veya izleyicinin engelleneceğini garanti etmez.",
  "Files you download are saved according to your browser settings and your operating system. Murky does not inspect the contents of downloaded files for advertising or analytics purposes.": "İndirdiğiniz dosyalar tarayıcı ayarlarınıza ve işletim sisteminize göre kaydedilir. Murky, reklamcılık veya analiz amacıyla indirilen dosyaların içeriğini incelemez.",
  "Murky uses Chromium's web isolation features for regular websites. No software can guarantee absolute security, so keep Murky and your operating system updated and use care when visiting unfamiliar sites or downloading files.": "Murky, normal web siteleri için Chromium'un web izolasyonu özelliklerini kullanır. Hiçbir yazılım mutlak güvenliği garanti edemez; bu nedenle Murky'yi ve işletim sisteminizi güncel tutun, tanımadığınız siteleri ziyaret ederken veya dosya indirirken dikkatli olun.",
  "We may update this policy when Murky's features or data practices change. This section describes the current version of Murky.": "Murky'nin özellikleri veya veri uygulamaları değiştiğinde bu politikayı güncelleyebiliriz. Bu bölüm Murky'nin mevcut sürümünü açıklar.",
  "For privacy questions about a particular Murky distribution, use the support or contact channel provided with that distribution.": "Belirli bir Murky dağıtımıyla ilgili gizlilik sorularınız için, ilgili dağıtımla birlikte sağlanan destek veya iletişim kanalını kullanın."
} };
for (const [lang,map] of Object.entries(LEGAL_LOCAL_TRANSLATIONS)) Object.assign(BUILTIN_TRANSLATIONS[lang] || (BUILTIN_TRANSLATIONS[lang]={}), map);
function localizeMurkyText(target, text) {
  const t=normalizeLanguage(target)||"en";
  if (t === "en") return text;
  return builtinTranslate(t, text) ?? text;
}

function languageName(code){ return MURKY_LANG_MAP[code]?.name || code; }
function normalizeLanguage(code){
  const c=String(code||"").toLowerCase().split(/[-_]/)[0];
  return MURKY_LANG_MAP[c] ? c : null;
}

const INTERNAL_PAGES = {
  "murky://newtab": "newtab.html",
  "murky://settings": "settings.html",
  "murky://privacy": "privacy.html",
  "murky://terms": "terms.html",
  "murky://extensions": "extensions.html",
  "murky://site-settings": "site-settings.html",
};

function internalBase(u) {
  return String(u || "").split(/[?#]/)[0];
}
function isInternalPageUrl(u) {
  return Object.prototype.hasOwnProperty.call(INTERNAL_PAGES, internalBase(u));
}

const ERROR_PAGE_FILE = path.join(__dirname, "src", "error.html");
const allowedCertHosts = new Set();

function isErrorPageUrl(u) {
  return /^file:/i.test(String(u || "")) && /\/src\/error\.html(?:[?#]|$)/.test(String(u || ""));
}


function netErrorName(code) {
  const n = Number(code);
  const map = {
    [-2]: "ERR_FAILED", [-6]: "ERR_FILE_NOT_FOUND", [-7]: "ERR_TIMED_OUT", [-10]: "ERR_ACCESS_DENIED", [-20]: "ERR_BLOCKED_BY_CLIENT",
    [-21]: "ERR_NETWORK_CHANGED", [-100]: "ERR_CONNECTION_CLOSED", [-101]: "ERR_CONNECTION_RESET", [-102]: "ERR_CONNECTION_REFUSED",
    [-104]: "ERR_CONNECTION_FAILED", [-105]: "ERR_NAME_NOT_RESOLVED", [-106]: "ERR_INTERNET_DISCONNECTED", [-107]: "ERR_SSL_PROTOCOL_ERROR",
    [-109]: "ERR_ADDRESS_UNREACHABLE", [-113]: "ERR_SSL_VERSION_OR_CIPHER_MISMATCH", [-118]: "ERR_CONNECTION_TIMED_OUT",
    [-130]: "ERR_PROXY_CONNECTION_FAILED", [-310]: "ERR_TOO_MANY_REDIRECTS", [-300]: "ERR_INVALID_URL", [-200]: "ERR_CERT_COMMON_NAME_INVALID",
    [-201]: "ERR_CERT_DATE_INVALID", [-202]: "ERR_CERT_AUTHORITY_INVALID", [-207]: "ERR_CERT_REVOKED", [-208]: "ERR_CERT_INVALID",
  };
  if (map[n]) return map[n];
  if (n <= -200 && n >= -219) return "ERR_CERT_INVALID";
  return "ERR_FAILED";
}

async function errorPageIsRendered(wc) {
  try {
    if (wc.isDestroyed() || !isErrorPageUrl(wc.getURL())) return false;
    return !!(await wc.executeJavaScript(
      "(function(){var t=document.getElementById('title');return !!(t&&t.textContent&&t.textContent.trim());})()",
      true
    ));
  } catch { return false; }
}

function inlineErrorFallback(wc, query) {
  try {
    if (wc.isDestroyed()) return;
    const offline = /INTERNET_DISCONNECTED|NETWORK_CHANGED/.test(query.name);
    const title = query.kind === "http" ? `${query.code} ${query.text || "Couldn't open this page"}`.trim()
      : offline ? "You're offline" : "Can't open this page";
    const lead = offline ? "Murky can't reach the internet. Check your connection and try again."
      : "Murky couldn't load this page. Try again in a moment.";
    const data = JSON.stringify({ title, lead, url: query.url, tech: query.name ? `${query.name} (${query.code})` : "", bg: query.bg, ac: query.ac });
    wc.executeJavaScript(`(function(d){
      document.title = d.title;
      var root = document.documentElement;
      while (root.firstChild) root.removeChild(root.firstChild);
      var head = document.createElement('head'), body = document.createElement('body');
      root.append(head, body);
      body.style.cssText = 'margin:0 auto;height:100vh;background:'+d.bg+';color:#fff;font:13.5px "Segoe UI",system-ui,sans-serif;display:flex;flex-direction:column;padding:64px 28px;box-sizing:border-box;max-width:560px';
      root.style.background = d.bg;
      var h = document.createElement('h1'); h.textContent = d.title; h.style.cssText = 'font-size:22px;font-weight:600;margin:0 0 8px';
      var p = document.createElement('p'); p.textContent = d.lead; p.style.cssText = 'margin:0;color:#A8A8A8;line-height:1.6';
      var a = document.createElement('p'); a.textContent = d.url; a.style.cssText = 'margin:10px 0 0;font-size:12px;color:#A8A8A8;opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      var b = document.createElement('button'); b.textContent = 'Try again'; b.style.cssText = 'margin-top:24px;align-self:flex-start;background:none;border:0;padding:0;font:inherit;color:'+d.ac+';cursor:pointer';
      b.onclick = function(){ if (d.url) location.href = d.url; };
      body.append(h, p); if (d.url) body.append(a); body.append(b);
      if (d.tech) { var t = document.createElement('p'); t.textContent = d.tech; t.style.cssText = 'margin-top:26px;font-size:11.5px;color:#A8A8A8;font-family:Consolas,monospace'; body.append(t); }
    })(${data});`, true).catch(() => {});
  } catch {}
}

function isOfflineNow() {
  try { return !require("electron").net.isOnline(); } catch { return false; }
}

function showOfflineErrorPage(id, url) {
  const t = tabs.get(id);
  if (!t || !t.view || t.view.webContents.isDestroyed()) return;
  try { if (t.view.webContents.isLoading()) t.view.webContents.stop(); } catch {}
  t.errorShownFor = null;
  t.lastFail = { kind: "net", code: -106, name: "ERR_INTERNET_DISCONNECTED", url, at: Date.now() };
  showErrorPage(id, t.lastFail);
}

function showErrorPage(id, info, attempt = 0) {
  const t = tabs.get(id);
  if (!t || !t.view || t.view.webContents.isDestroyed()) return;
  const wc = t.view.webContents;
  if (attempt === 0 && t.errorShownFor === info.url && Date.now() - (t.errorShownAt || 0) < 1500) return;
  t.errorShownFor = info.url;
  t.errorShownAt = Date.now();
  t.errorPage = true;
  t.errorUrl = info.url;
  t.url = info.url;
  t.isLoading = false;
  t.previewCache = null;
  const token = (t.errorToken = (t.errorToken || 0) + 1);
  const query = {
    kind: info.kind || "net",
    code: String(info.code ?? 0),
    name: String(info.name || ""),
    text: String(info.text || ""),
    url: String(info.url || ""),
  };
  const theme = getSettings();
  query.bg = String(theme.background || "#0A1412");
  query.sf = String(theme.surface || "#10201D");
  query.ac = String(theme.accent || "#E3A857");
  try { t.view.setBackgroundColor(query.bg); } catch {}

  if (attempt === 0) {
    const onFinish = () => {
      try {
        if (wc.isDestroyed() || !isErrorPageUrl(wc.getURL())) return;
        wc.removeListener("did-finish-load", onFinish);
        const nh = wc.navigationHistory;
        const entries = nh.getAllEntries();
        const idx = nh.getActiveIndex();
        if (idx > 0 && entries[idx - 1] && entries[idx - 1].url === info.url) nh.removeEntryAtIndex(idx - 1);
        t.canGoBack = wc.canGoBack();
        t.canGoForward = wc.canGoForward();
        broadcastTabs();
      } catch {}
    };
    wc.on("did-finish-load", onFinish);
    setTimeout(() => { try { if (!wc.isDestroyed()) wc.removeListener("did-finish-load", onFinish); } catch {} }, 10000);
  }

  const load = () => {
    const cur = tabs.get(id);
    if (!cur || cur.errorToken !== token || !cur.view || cur.view.webContents.isDestroyed()) return;
    try { if (wc.isLoading()) wc.stop(); } catch {}
    let p;
    try { p = wc.loadFile(ERROR_PAGE_FILE, { query }); } catch {}
    if (p && typeof p.catch === "function") p.catch(() => {});
  };
  setTimeout(load, attempt === 0 ? 40 : 150);
  setTimeout(async () => {
    const cur = tabs.get(id);
    if (!cur || cur.errorToken !== token || !cur.errorPage || cur.view.webContents.isDestroyed()) return;
    if (await errorPageIsRendered(cur.view.webContents)) return;
    const again = tabs.get(id);
    if (!again || again.errorToken !== token || !again.errorPage) return;
    if (attempt < 3) showErrorPage(id, info, attempt + 1);
    else inlineErrorFallback(again.view.webContents, query);
  }, 650 + attempt * 350);
  broadcastTabs();
  if (id === activeTabId) send("nav:url", { id, url: t.url });
}

function tabForSender(sender) {
  for (const [id, t] of tabs) if (t.view && t.view.webContents === sender) return [id, t];
  return [null, null];
}

function reloadWc(wc) {
  for (const [id, t] of tabs) {
    if (t.view && t.view.webContents === wc) {
      if (t.errorPage && t.errorUrl) { navigateView(id, t.errorUrl); return; }
      break;
    }
  }
  wc.reload();
}

function getSettings() {
  const saved = store.get("settings");
  const current = saved && typeof saved === "object" ? saved : {};
  const merged = { ...DEFAULT_SETTINGS, ...current };
  if (JSON.stringify(merged) !== JSON.stringify(current)) store.set("settings", merged);
  return merged;
}

function getChromeHeight() {
  const settings = getSettings();
  const toolbarScale = toolbarScalePreview == null
    ? (Number(settings.toolbarScale) || 1)
    : toolbarScalePreview;
  return TITLEBAR_HEIGHT + TOOLBAR_HEIGHT * toolbarScale;
}

function send(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

 
 
function broadcastToTabs(channel, ...args) {
  for (const t of tabs.values()) {
    if (t.view && !t.view.webContents.isDestroyed()) {
      t.view.webContents.send(channel, ...args);
    }
  }
}

function serializeTab(id) {
  const t = tabs.get(id);
  if (!t) return null;
  return {
    id,
    title: t.title || "New Tab",
    url: t.url || "murky://newtab",
    isLoading: !!t.isLoading,
    canGoBack: !!t.canGoBack,
    canGoForward: !!t.canGoForward,
    favicon: INTERNAL_PAGES[internalBase(t.url)]
      ? pathToFileURL(path.join(__dirname, "assets", "logo_amber.png")).href
      : (t.favicon || null),
    isPinned: !!t.isPinned,
    isMuted: !!t.isMuted,
    isActive: id === activeTabId,
  };
}

function broadcastTabs() {
  const list = Array.from(tabs.keys()).map(serializeTab);
  send("tabs:update", { tabs: list, activeTabId });
   
   
  const urls = list.map((t) => t.url).filter((u) => !!u);
  store.set("lastSession", urls);
}

function computeViewBounds() {
  const settings = getSettings();
  const [winW, winH] = mainWindow.getContentSize();
  const railW = settings.showSidebar ? SIDEBAR_RAIL_WIDTH : 0;
  const flyoutW = sidebarFlyoutOpen ? SIDEBAR_FLYOUT_WIDTH : 0;
  const sidebarW = railW + flyoutW;
  const onLeft = settings.sidebarSide !== "right";
  const x = onLeft ? sidebarW : 0;
  const chromeHeight = getChromeHeight();
  const y = chromeHeight;
  const devW = devtoolsOpen ? Math.min(DEVTOOLS_WIDTH, Math.floor(winW * 0.48)) : 0;
  const width = Math.max(0, winW - sidebarW - devW);
  const bounds = { x, y, width, height: Math.max(0, winH - chromeHeight) };
  if (devtoolsOpen && devtoolsView && !devtoolsView.webContents.isDestroyed()) {
    devtoolsView.setBounds({
      x: Math.max(x, winW - devW),
      y,
      width: devW,
      height: bounds.height,
    });
  }
  if (extensionPopupOpen && extensionPopupView && !extensionPopupView.webContents.isDestroyed()) {
    const popupW = Math.min(EXTENSION_POPUP_WIDTH, Math.max(300, winW - 24));
    const popupH = Math.min(EXTENSION_POPUP_MAX_HEIGHT, Math.max(260, winH - chromeHeight - 16));
    const px = extensionPopupPoint ? Math.max(8, Math.min(Math.round(extensionPopupPoint.x), winW - popupW - 8)) : Math.max(8, winW - popupW - 10);
    const py = extensionPopupPoint ? Math.max(chromeHeight + 4, Math.round(extensionPopupPoint.y)) : chromeHeight + 8;
    extensionPopupView.setBounds({
      x: px,
      y: py,
      width: popupW,
      height: popupH,
    });
  }
  if (siteInfoOpen && siteInfoView && !siteInfoView.webContents.isDestroyed()) {
    const popupW = Math.min(SITE_INFO_WIDTH, Math.max(240, winW - 16));
    const px = siteInfoPoint ? Math.max(8, Math.min(Math.round(siteInfoPoint.x), winW - popupW - 8)) : 12;
    const py = siteInfoPoint ? Math.max(chromeHeight - 6, Math.round(siteInfoPoint.y)) : chromeHeight + 4;
    siteInfoView.setBounds({
      x: px,
      y: py,
      width: popupW,
      height: Math.min(siteInfoHeight, Math.max(120, winH - py - 12)),
    });
  }
  if (browserDialogOpen && browserDialogView && !browserDialogView.webContents.isDestroyed()) {
    const dialogW = Math.min(430, Math.max(300, winW - sidebarW - 32));
    const dialogH = browserDialogType === "prompt" ? 154 : 132;
    const contentX = x;
    const contentW = Math.max(0, winW - sidebarW - devW);
    browserDialogView.setBounds({
      x: Math.round(contentX + Math.max(16, (contentW - dialogW) / 2)),
      y: y + 22,
      width: Math.min(dialogW, contentW - 32),
      height: dialogH,
    });
  }
  return bounds;
}

function layoutActiveView() {
  if (!mainWindow) return;
  const active = tabs.get(activeTabId);
  if (!active) return;
  active.view.setBounds(computeViewBounds());
}

 
 
 
 
function internalUrlFor(realUrl) {
  if (!realUrl) return null;
  for (const [internal, file] of Object.entries(INTERNAL_PAGES)) {
    const re = new RegExp(`/src/${file.replace(".", "\\.")}(?:(\\?[^#]*))?(?:#.*)?$`);
    const m = re.exec(realUrl);
    if (m) return internal === "murky://site-settings" && m[1] ? internal + m[1] : internal;
  }
  return null;
}

function titleForInternal(internal) {
  switch (internalBase(internal)) {
    case "murky://settings": return "Murky Settings";
    case "murky://privacy": return "Privacy Policy";
    case "murky://terms": return "Terms of Service";
    case "murky://extensions": return "Murky Extensions";
    case "murky://site-settings": return "Site Settings";
    default: return null;
  }
}

function startTranslationEngineServer() {
  if (translationEngineServer) return Promise.resolve(translationEngineServerPort);
  return new Promise((resolve, reject) => {
    const root = __dirname;
    translationEngineServer = http.createServer(async (req, res) => {
      try {
        const raw = decodeURIComponent((req.url || "/").split("?")[0]);
        let file;
        if (raw === "/translation-engine.html") {
          file = path.join(root, "src", "translation-engine.html");
        } else if (raw.startsWith("/models/meta/")) {
          const pair = raw.slice("/models/meta/".length).replace(/[^a-z]/g, "");
          if (!/^[a-z]{4}$/.test(pair)) { res.writeHead(400); res.end("Bad pair"); return; }
          const remote = `https://raw.githubusercontent.com/mozilla/firefox-translations-models/main/models/tiny/${pair}/metadata.json`;
          try {
            const response = await fetch(remote);
            if (!response.ok) { res.writeHead(response.status); res.end(`Metadata unavailable: ${response.status}`); return; }
            res.writeHead(200, {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"public, max-age=86400"});
            res.end(await response.text());
          } catch (error) { res.writeHead(502); res.end(String(error)); }
          return;
        } else if (raw.startsWith("/models/files/")) {
          const pair = raw.slice("/models/files/".length).replace(/[^a-z]/g, "");
          if (!/^[a-z]{4}$/.test(pair)) { res.writeHead(400); res.end("Bad pair"); return; }
          const remote = `https://api.github.com/repos/mozilla/firefox-translations-models/contents/models/tiny/${pair}`;
          try {
            const response = await fetch(remote, {headers: {"Accept":"application/vnd.github+json", "User-Agent":"Murky-Browser"}});
            if (!response.ok) { res.writeHead(response.status); res.end(`File list unavailable: ${response.status}`); return; }
            res.writeHead(200, {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"public, max-age=86400"});
            res.end(await response.text());
          } catch (error) { res.writeHead(502); res.end(String(error)); }
          return;
        } else if (raw.startsWith("/models/entr/")) {
          const name = raw.slice("/models/entr/".length);
          const allowed = new Set([
            "model.entr.intgemm.alphas.bin.gz",
            "lex.50.50.entr.s2t.bin.gz",
            "vocab.entr.spm.gz"
          ]);
          if (!allowed.has(name)) { res.writeHead(404); res.end("Not found"); return; }
          const remote = `https://huggingface.co/TiberiuCristianLeon/Bergamot/resolve/main/tiny/entr/${name}`;
          try {
            const response = await fetch(remote);
            if (!response.ok) { res.writeHead(response.status); res.end(`Model download failed: ${response.status}`); return; }
            res.writeHead(200, {"Content-Type":"application/octet-stream","Cache-Control":"public, max-age=31536000"});
            const body = response.body;
            if (body && typeof body.pipeTo === "function") {
              await body.pipeTo(new WritableStream({ write(chunk) { res.write(Buffer.from(chunk)); }, close() { res.end(); }, abort() { try { res.destroy(); } catch {} } }));
            } else {
              res.end(Buffer.from(await response.arrayBuffer()));
            }
          } catch (error) { res.writeHead(502); res.end(String(error)); }
          return;
        } else if (raw.startsWith("/bergamot/")) {
          const rel = raw.slice("/bergamot/".length);
          const safeRoot = path.resolve(path.join(root, "node_modules", "@browsermt", "bergamot-translator"));
          file = path.resolve(path.join(safeRoot, rel));
          if (!file.startsWith(safeRoot + path.sep)) {
            res.writeHead(403); res.end(); return;
          }
        } else {
          res.writeHead(404); res.end("Not found"); return;
        }
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.writeHead(404); res.end("Not found"); return;
        }
        const ext = path.extname(file).toLowerCase();
        const types = {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".mjs": "text/javascript; charset=utf-8",
          ".json": "application/json; charset=utf-8",
          ".wasm": "application/wasm",
        };
        res.setHeader("Content-Type", types[ext] || "application/octet-stream");
        res.setHeader("Cache-Control", "no-store");
        fs.createReadStream(file).pipe(res);
      } catch (error) {
        res.writeHead(500); res.end(String(error));
      }
    });
    translationEngineServer.once("error", reject);
    translationEngineServer.listen(0, "127.0.0.1", () => {
      translationEngineServer.removeListener("error", reject);
      translationEngineServerPort = translationEngineServer.address().port;
      console.log(`Murky translation engine server ready on http://127.0.0.1:${translationEngineServerPort}`);
      resolve(translationEngineServerPort);
    });
  });
}

async function getTranslationEngine() {
  if (translationEnginePromise) return translationEnginePromise;
  translationEnginePromise = (async () => {
    const port = await startTranslationEngineServer();
    if (!translationEngineWindow || translationEngineWindow.isDestroyed()) {
      translationEngineWindow = new BrowserWindow({
        show: false,
        width: 1,
        height: 1,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
        },
      });
      translationEngineWindow.webContents.on("console-message", (_event, _level, message) => {
        if (message && /bergamot|translation/i.test(message)) console.log(`Murky translation engine: ${message}`);
      });
      translationEngineWindow.on("closed", () => { translationEngineWindow = null; });
      await translationEngineWindow.loadURL(`http://127.0.0.1:${port}/translation-engine.html`);
    }
    let ready = false;
    for (let i = 0; i < 1800; i++) {
      ready = await translationEngineWindow.webContents
        .executeJavaScript(`window.__murkyTranslationEngineReady === true`, true)
        .catch(() => false);
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error("Bergamot translation engine did not initialize");
    return {
      translate: async (texts, from, to) => {
        const payload = await translationEngineWindow.webContents.executeJavaScript(
          `window.__murkyTranslate(${JSON.stringify(texts)}, ${JSON.stringify(from)}, ${JSON.stringify(to)})`,
          true
        );
        if (!Array.isArray(payload) || payload.length !== texts.length) {
          throw new Error("Bergamot returned an invalid translation result");
        }
        return payload.map(String);
      },
    };
  })().catch(error => {
    translationEnginePromise = null;
    throw error;
  });
  return translationEnginePromise;
}

function cleanTranslation(original, translated) {
  const raw = String(original ?? "");
  let out = String(translated ?? "");
  const rawLead = (raw.match(/^\s*/) || [""])[0];
  const rawTail = (raw.match(/\s*$/) || [""])[0];
  const body = raw.trim();
  if (!/^[-•*]\s/.test(body)) out = out.replace(/^(?:[-•*]\s*)+/, "");
  const allowed = new Map();
  for (const ch of Array.from(raw)) {
    if (/\p{P}/u.test(ch)) allowed.set(ch, (allowed.get(ch) || 0) + 1);
  }
  out = Array.from(out).filter(ch => {
    if (!/\p{P}/u.test(ch)) return true;
    const n = allowed.get(ch) || 0;
    if (n <= 0) return false;
    allowed.set(ch, n - 1);
    return true;
  }).join("");
  return rawLead + out.trim() + rawTail;
}

function universalTermMatches(text) {
  const source = String(text);
  const matches = [];
  for (const term of UNIVERSAL_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "gi");
    let m;
    while ((m = re.exec(source))) matches.push({ start:m.index, end:m.index + m[0].length, value:m[0] });
  }
  matches.sort((a,b) => a.start - b.start || b.end - a.end);
  const out=[];
  let end=0;
  for (const m of matches) {
    if (m.start < end) continue;
    out.push(m);
    end=m.end;
  }
  return out;
}

const translationProtect = require(path.join(__dirname, "src", "translation-protect.js"));
const keepRegexCache = new Map();
function keepRegexFor(target) {
  const t = normalizeLanguage(target) || "en";
  if (keepRegexCache.has(t)) return keepRegexCache.get(t);
  const words = new Set();
  const map = BUILTIN_TRANSLATIONS[t] || {};
  for (const [k, v] of Object.entries(map)) {
    const a = String(k).trim(), b = String(v).trim();
    if (a.length >= 3 && a.length <= 40 && a.toLowerCase() === b.toLowerCase() && a.split(/\s+/).length <= 3 && /\p{L}/u.test(a)) words.add(a);
  }
  const re = translationProtect.keepWordsRegex(words);
  keepRegexCache.set(t, re);
  return re;
}

async function translateStrings(strings, from, to) {
  if (!strings.length || from === to) return strings;
  const result = new Array(strings.length);
  const keepRegex = keepRegexFor(to);
  const jobs = new Map();
  strings.forEach((original, i) => {
    const source = String(original);
    const builtIn = from === "en" ? builtinTranslate(to, source) : null;
    if (builtIn != null) { result[i] = cleanTranslation(source, builtIn); return; }
    let job = jobs.get(source);
    if (!job) { job = { plan: translationProtect.planText(source, { keepRegex }), idx: [], out: source }; jobs.set(source, job); }
    job.idx.push(i);
  });
  const work = [];
  for (const [source, job] of jobs) { if (job.plan) work.push([source, job]); else job.idx.forEach((i) => { result[i] = source; }); }
  if (work.length) {
    const engine = await getTranslationEngine();
    const CH = 32;
    for (let start = 0; start < work.length; start += CH) {
      const chunk = work.slice(start, start + CH);
      const outs = await engine.translate(chunk.map(([s]) => s), from, to);
      const redo = [];
      chunk.forEach(([source, job], k) => {
        const o = cleanTranslation(source, outs[k]);
        if (job.plan.keep.every((v) => o.includes(v))) job.out = o; else redo.push([source, job]);
      });
      if (redo.length) {
        const isText = (p) => p.type === "text" && p.value.trim() && /\p{L}/u.test(p.value);
        const flat = [];
        redo.forEach(([, job]) => job.plan.pieces.forEach((p) => { if (isText(p)) flat.push(p.value); }));
        const tr = flat.length ? await engine.translate(flat, from, to) : [];
        let ti = 0;
        redo.forEach(([source, job]) => {
          job.out = cleanTranslation(source, job.plan.pieces.map((p) => (p.type === "keep" ? p.value : isText(p) ? tr[ti++] : p.value)).join(""));
        });
      }
    }
    for (const [, job] of work) job.idx.forEach((i) => { result[i] = job.out; });
  }
  return result;
}

async function translateWithFallback(texts, source, preferred) {
  const targets = Array.from(new Set((preferred || []).map(normalizeLanguage).filter(Boolean)));
  for (const target of targets) {
    if (target === source) return { target, texts };
    try {
      return { target, texts: await translateStrings(texts, source, target) };
    } catch (error) {
      console.error(`Bergamot translation unavailable (${source} -> ${target}): ${error.message}`);
    }
  }
  return null;
}

async function detectPageLanguage(webContents) {
  try {
    const info = await webContents.executeJavaScript(`(() => {
      const html = document.documentElement;
      const meta = document.querySelector('meta[http-equiv="content-language"],meta[name="language"],meta[name="content-language"]');
      const og = document.querySelector('meta[property="og:locale"]');
      const declared = [];
      if (html?.lang) declared.push(html.lang);
      if (document.body?.lang) declared.push(document.body.lang);
      if (meta?.content) declared.push(meta.content);
      if (og?.content) declared.push(og.content.replace(/_/g,"-"));
      const langNodes = Array.from(document.querySelectorAll('[lang]')).slice(0, 80).map(e => e.lang).filter(Boolean);
      declared.push(...langNodes);
      const text = Array.from(document.body?.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,button,a,label,span,td,th') || [])
        .map(e => (e.innerText || e.textContent || '').trim()).filter(Boolean).slice(0, 160).join(' ');
      return { lang: declared.find(Boolean) || '', langs: declared, text: text.slice(0, 16000) };
    })()`, true);
    let lang = normalizeLanguage(info?.lang);
    if (lang) return lang;
    if (info?.text) {
      const { franc } = await getTranslationEngine();
      const detected = franc(info.text);
      lang = MURKY_ISO3[detected] || null;
    }
    return lang;
  } catch { return null; }
}

function cancelTranslationForTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab?.view?.webContents) return;
  const wc = tab.view.webContents;
  murkyTranslationRuns.set(wc, (murkyTranslationRuns.get(wc) || 0) + 1);
}

function murkyPageCollect(args) {
  const TARGET = args.target, HINT = new RegExp(args.hintSource, args.hintFlags);
  const SKIP_TAGS = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TEXTAREA|INPUT|SELECT|CODE|PRE|KBD|SAMP|VAR|SVG|CANVAS|IFRAME|OBJECT|EMBED|MATH|HEAD|TITLE|META|LINK)$/i;
  const SKIP_SEL = '[translate="no"],.notranslate,[contenteditable=""],[contenteditable="true"],[data-murky-no-translate],[data-murky-critical],.about-warning,.language-list,.language-menu,.language-picker,.tab,.address-wrap,.side-item .side-title,.side-item .side-url,#greeting';
  const BLOCK = "h1,h2,h3,h4,h5,h6,p,li,button,a,label,td,th,option,figcaption,blockquote,summary,dt,dd,caption,legend";
  const cache = new WeakMap();
  const okElement = (el) => {
    if (!el) return false;
    if (cache.has(el)) return cache.get(el);
    let ok = true;
    for (let e = el; e && ok; e = e.parentElement) {
      if (SKIP_TAGS.test(e.tagName)) ok = false;
      else if (e.matches && e.matches(SKIP_SEL)) ok = false;
    }
    if (ok) {
      let e = el;
      for (let i = 0; e && i < 4 && ok; i++, e = e.parentElement) {
        const s = [e.id, typeof e.className === "string" ? e.className : "", e.getAttribute("name"), e.getAttribute("autocomplete"), e.getAttribute("aria-label"), e.getAttribute("data-sensitive"), e.getAttribute("type")].filter(Boolean).join(" ");
        if (HINT.test(s)) ok = false;
      }
    }
    cache.set(el, ok);
    return ok;
  };
  const vh = window.innerHeight || 800, vw = window.innerWidth || 1200;
  const inView = (el) => {
    try {
      if (!el.getClientRects().length) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") return false;
      return r.bottom > -vh * 0.25 && r.top < vh * 1.5 && r.right > 0 && r.left < vw;
    } catch { return false; }
  };
  const root = document.body || document.documentElement;
  const seen = new Set(), units = [];
  const freshText = (n) => {
    const val = n.nodeValue || "";
    if (n.__murkyTranslatedFor === TARGET && val === n.__murkyTranslatedText) return null;
    if (val.trim().length <= 1) return null;
    n.__murkyOriginalText = val;
    return val;
  };
  const gather = (el) => {
    if (!el || !okElement(el)) return;
    if (Array.from(el.children).some((c) => c.matches(BLOCK))) return;
    const nodes = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (seen.has(n) || !okElement(n.parentElement)) continue;
      if (freshText(n) == null) continue;
      nodes.push(n); seen.add(n);
    }
    if (!nodes.length) return;
    const text = nodes.map((x) => x.__murkyOriginalText.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
    if (text) units.push({ nodes, text, vis: inView(el), top: el.getBoundingClientRect().top });
  };
  for (const el of Array.from(root.querySelectorAll(BLOCK))) gather(el);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    if (seen.has(n)) continue;
    const p = n.parentElement;
    if (!p || !okElement(p)) continue;
    const val = freshText(n);
    if (val == null) continue;
    seen.add(n);
    units.push({ nodes: [n], text: val.trim(), vis: inView(p), top: p.getBoundingClientRect().top });
  }
  const ordered = units.map((u, i) => ({ u, i })).sort((a, b) => (b.u.vis - a.u.vis) || (a.u.vis ? Math.abs(a.u.top) - Math.abs(b.u.top) : a.i - b.i)).map((x) => x.u);
  const onlyVisible = args.visibleOnly ? ordered.filter((u) => u.vis) : ordered;
  window.__murkyQueue = onlyVisible;
  if (!window.__murkyMO) {
    window.__murkyDirty = false;
    window.__murkyMO = new MutationObserver(() => { window.__murkyDirty = true; });
    window.__murkyMO.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    window.addEventListener("scroll", () => { window.__murkyScrolled = true; }, { passive: true, capture: true });
    window.addEventListener("resize", () => { window.__murkyScrolled = true; }, { passive: true });
  }
  window.__murkyDirty = false;
  window.__murkyScrolled = false;
  return { lens: onlyVisible.map((u) => u.text.length), visCount: onlyVisible.filter((u) => u.vis).length };
}
function murkyPageTexts(args) { return (window.__murkyQueue || []).slice(args.from, args.to).map((u) => u.text); }
function murkyPageApply(args) {
  const queue = window.__murkyQueue || [];
  args.translated.forEach((text, i) => {
    const unit = queue[args.from + i];
    if (!unit || !unit.nodes.length) return;
    const nodes = unit.nodes, first = nodes[0];
    const rawFirst = first.__murkyOriginalText != null ? first.__murkyOriginalText : (first.nodeValue || "");
    const lead = (rawFirst.match(/^\s*/) || [""])[0];
    const lastRaw = nodes[nodes.length - 1].__murkyOriginalText != null ? nodes[nodes.length - 1].__murkyOriginalText : (nodes[nodes.length - 1].nodeValue || "");
    const tail = (lastRaw.match(/\s*$/) || [""])[0];
    const val = lead + String(text).trim() + tail;
    first.nodeValue = val;
    first.__murkyTranslatedText = val;
    for (let j = 1; j < nodes.length; j++) { nodes[j].nodeValue = ""; nodes[j].__murkyTranslatedText = ""; }
    nodes.forEach((n) => { n.__murkyTranslatedFor = args.target; });
  });
  if (window.__murkyMO) window.__murkyMO.takeRecords();
  return true;
}
function murkyPageFlags() {
  const f = { dirty: !!window.__murkyDirty, scrolled: !!window.__murkyScrolled };
  return f;
}

async function translateWebContents(webContents, source, preferred, opts = {}) {
  const targetList = (preferred || []).map(normalizeLanguage).filter(Boolean);
  if (!targetList.length || !source || !webContents || webContents.isDestroyed()) return false;

  const runId = (murkyTranslationRuns.get(webContents) || 0) + 1;
  murkyTranslationRuns.set(webContents, runId);
  const isCurrentRun = () => murkyTranslationRuns.get(webContents) === runId && !webContents.isDestroyed();
  const target = targetList[0];
  if (target === source) return true;

  const watch = opts.watch !== false;
  const DEFER_SECONDS = 30, DEFAULT_CPS = 300, BATCH = 30;
  const call = (fn, args) => webContents.executeJavaScript(`(${fn.toString()})(${JSON.stringify(args)})`, true);
  const collect = (visibleOnly) => call(murkyPageCollect, { target, visibleOnly: !!visibleOnly, hintSource: translationProtect.SENSITIVE_HINT.source, hintFlags: translationProtect.SENSITIVE_HINT.flags });

  let cps = 0, timedBatches = 0, failed = false, translatedAny = false;

  const processRange = async (info, start, end, stopOnScroll) => {
    for (let i = start; i < end && isCurrentRun(); i += BATCH) {
      const to = Math.min(i + BATCH, end);
      const texts = await call(murkyPageTexts, { from: i, to });
      if (!texts.length) break;
      const chars = texts.reduce((a, t) => a + t.length, 0);
      const t0 = Date.now();
      const result = await translateWithFallback(texts, source, targetList);
      if (!result || !isCurrentRun()) { if (!result) failed = true; return false; }
      const dt = (Date.now() - t0) / 1000;
      timedBatches++;
      if (timedBatches > 1 && dt > 0.05) { const r = chars / dt; cps = cps ? cps * 0.6 + r * 0.4 : r; }
      await call(murkyPageApply, { from: i, translated: result.texts, target });
      translatedAny = true;
      await new Promise((r) => setTimeout(r, 10));
      if (stopOnScroll) { const f = await call(murkyPageFlags, {}); if (f.scrolled) return "rescan"; }
    }
    return true;
  };

  const info = await collect(false);
  if (!isCurrentRun()) return false;
  const total = info.lens.length;
  let cursor = 0;
  const firstEnd = Math.min(total, Math.max(info.visCount, Math.min(total, BATCH)));
  if (total) {
    const ok = await processRange(info, 0, firstEnd, false);
    if (ok === false) return translatedAny;
    cursor = firstEnd;
  }
  const remainingChars = () => info.lens.slice(cursor).reduce((a, n) => a + n, 0);
  let deferred = false;
  if (cursor < total) {
    const est = remainingChars() / (cps || DEFAULT_CPS);
    if (est <= DEFER_SECONDS) {
      const ok = await processRange(info, cursor, total, false);
      if (ok === false) return translatedAny;
      cursor = total;
    } else deferred = true;
  }

  if (watch && !failed) {
    (async () => {
      let first = deferred ? { info, cursor } : null;
      while (isCurrentRun() && !failed) {
        try {
          if (!first) {
            const f = await call(murkyPageFlags, {});
            if (!f.dirty && !f.scrolled) { await new Promise((r) => setTimeout(r, 900)); continue; }
            await new Promise((r) => setTimeout(r, 250));
          }
          const cur = first ? (await collect(false)) : await collect(false);
          first = null;
          if (!isCurrentRun()) return;
          if (cur.lens.length) {
            const res = await processRange(cur, 0, cur.lens.length, true);
            if (res === false) return;
          }
        } catch { await new Promise((r) => setTimeout(r, 1500)); }
      }
    })();
  }
  return translatedAny;
}

let murkyInternalTranslationQueue = Promise.resolve();
let murkyInternalTranslationGeneration = 0;

async function translateMurkySurface(webContents, target) {
  if (!webContents || webContents.isDestroyed()) return;
  const payload = await webContents.executeJavaScript(`(() => {
    const all = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    let originalNode;
    while (originalNode = all.nextNode()) {
      if (originalNode.__murkyOriginalText != null) originalNode.nodeValue = originalNode.__murkyOriginalText;
    }
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const groups=[]; const byParent=new Map(); let n;
    while(n=walker.nextNode()){
      const p=n.parentElement;
      if(!p||/^(SCRIPT|STYLE|NOSCRIPT|INPUT|TEXTAREA|OPTION)$/i.test(p.tagName)) continue;
      if(p.closest?.('.language-list,.language-menu,.language-picker,.tab,.address-wrap,.side-item .side-title,.side-item .side-url,.about-warning,#greeting,[data-murky-no-translate],[data-murky-built-in],[data-murky-critical]')) continue;
      if(n.__murkyOriginalText==null) n.__murkyOriginalText=n.nodeValue||'';
      const raw=n.__murkyOriginalText||'';
      if(raw.trim().length<=1) continue;
      if(!byParent.has(p)) byParent.set(p,[]);
      byParent.get(p).push({raw});
    }
    if(${JSON.stringify(target)}==='en'){
      walker.currentNode=document.body;
      while(n=walker.nextNode()) if(n.__murkyOriginalText!=null) n.nodeValue=n.__murkyOriginalText;
      return {groups:[],restore:true};
    }
    for(const items of byParent.values()){
      const text=items.map(x=>x.raw.trim()).filter(Boolean).join(' ');
      if(text) groups.push({text});
    }
    return {groups};
  })()`, true).catch(() => null);
  if (!payload?.groups?.length) return;
  const translated = payload.groups.map(x => localizeMurkyText(target, x.text));
  if (!Array.isArray(translated)) return;
  await webContents.executeJavaScript(`((values) => {
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const byParent=new Map(); let n;
    while(n=walker.nextNode()){
      const p=n.parentElement;
      if(!p||/^(SCRIPT|STYLE|NOSCRIPT|INPUT|TEXTAREA|OPTION)$/i.test(p.tagName)) continue;
      if(p.closest?.('.language-list,.language-menu,.language-picker,.tab,.address-wrap,.side-item .side-title,.side-item .side-url,.about-warning,#greeting,[data-murky-no-translate],[data-murky-built-in],[data-murky-critical]')) continue;
      if(n.__murkyOriginalText==null) n.__murkyOriginalText=n.nodeValue||'';
      const raw=n.__murkyOriginalText||'';
      if(raw.trim().length<=1) continue;
      if(!byParent.has(p)) byParent.set(p,[]);
      byParent.get(p).push({n,raw});
    }
    let i=0;
    for(const items of byParent.values()){
      const text=items.map(x=>x.raw.trim()).filter(Boolean).join(' ');
      if(!text) continue;
      const value=values[i++]; if(value==null) continue;
      const first=items[0], raw=first.raw;
      const lead=(raw.match(/^\\s*/)||[''])[0], tail=(raw.match(/\\s*$/)||[''])[0];
      first.n.nodeValue=lead+String(value).trim()+tail;
      for(let j=1;j<items.length;j++) items[j].n.nodeValue='';
    }
  })(${JSON.stringify(translated)})`, true).catch(() => {});
}

async function translateMurkyChromeSurfaces(target) {
  const surfaces = [mainWindow, onboardingWindow, updateWindow, browserDialogView, extensionPopupView, extensionActionView, devtoolsView, translationPopupView]
    .map(x => x?.webContents).filter(Boolean);
  for (const wc of surfaces) {
    try { await translateMurkySurface(wc, target); } catch {}
  }
}

function translateInternalPages() {
  const generation = ++murkyInternalTranslationGeneration;
  murkyInternalTranslationQueue = murkyInternalTranslationQueue.then(async () => {
    if (generation !== murkyInternalTranslationGeneration) return;
    const settings = getSettings();
    const target = normalizeLanguage(settings.preferredLanguages?.[0] || "en") || "en";

     
     
     
    try { await translateMurkyChromeSurfaces(target); } catch {}

    const jobs = [];
    for (const t of tabs.values()) {
      if (!isMurkyInternalWebContents(t.view.webContents)) continue;
      const wc = t.view.webContents;
      if (wc.isDestroyed()) continue;
      const url = t.url || wc.getURL() || "";
       
       
       
      if (url === "murky://settings" || url === "murky://extensions") continue;
      jobs.push((async () => {
        try {
          await translateWebContents(wc, "en", [target], { watch: false });
        } catch (error) {
          console.error("Murky internal translation failed:", error.message);
        }
      })());
    }
    await Promise.all(jobs);
  }).catch(error => {
    console.error("Murky internal translation run failed:", error.message);
  });
  return murkyInternalTranslationQueue;
}
function ensureTranslationPopupView() {
  if (translationPopupView && !translationPopupView.webContents.isDestroyed()) return translationPopupView;
  translationPopupView = new BrowserView({ webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, "src", "preload-translation-popup.js") } });
  translationPopupView.webContents.loadFile(path.join(__dirname, "src", "translation-popup.html"));
  translationPopupView.webContents.on("before-input-event", (event,input)=>{ if(input?.type==="keyDown"&&input.key==="Escape"){ event.preventDefault(); closeTranslationPopup(); }});
  return translationPopupView;
}
function openTranslationPopup(data, { animate = true, tabId = activeTabId } = {}) {
  if (!mainWindow || !data) return;
  const view=ensureTranslationPopupView();
  const alreadyVisibleForTab = translationPopupOpen && translationPopupTabId === tabId;
  translationOffer=data; translationPopupOpen=true; translationPopupTabId=tabId;
  try { mainWindow.removeBrowserView(view); } catch {}
  mainWindow.addBrowserView(view);
  layoutActiveView();
  const [w,h]=mainWindow.getContentSize(); const chrome=getChromeHeight(); const width=Math.min(340,w-16); const height=104;
  view.setBounds({x:8,y:chrome+10,width,height:Math.min(height,Math.max(96,h-chrome-18))});
  try { mainWindow.addBrowserView(view); } catch {}
  view.setAutoResize({width:false,height:false,horizontal:false,vertical:false});
  const sendReady=()=>{ try{ view.webContents.send("translate:offer",data); view.webContents.send("translate:theme", getSettings()); if (animate && !alreadyVisibleForTab) view.webContents.send("translate:animate","open"); }catch{} };
  if(view.webContents.isLoading()) view.webContents.once("did-finish-load",sendReady); else sendReady();
}
function closeTranslationPopup(markDismissed=false){
  if(markDismissed && translationOffer){ translationPopupDismissedUrl = tabs.get(activeTabId)?.view?.webContents?.getURL?.() || tabs.get(activeTabId)?.url || null; }
  if(!translationPopupOpen) return; translationPopupOpen=false; translationOffer=null; translationPopupTabId=null;
  const view=translationPopupView;
  if(mainWindow&&view&&!view.webContents.isDestroyed()) { try{view.webContents.send("translate:animate","close"); setTimeout(()=>{if(!translationPopupOpen&&mainWindow&&translationPopupView){try{mainWindow.removeBrowserView(translationPopupView)}catch{} layoutActiveView();}},170); return;}catch{} }
  try{mainWindow?.removeBrowserView(view)}catch{}; layoutActiveView();
}
function isSearchEngineResultUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ""));
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const hasQuery = !!(u.searchParams.get("q") || u.searchParams.get("query"));
    if (host === "duckduckgo.com") return u.pathname === "/" && hasQuery;
    if (host === "google.com") return u.pathname === "/search" && hasQuery;
    if (host === "bing.com") return u.pathname === "/search" && hasQuery;
    if (host === "startpage.com") return u.pathname === "/sp/search" && hasQuery;
    if (host === "ecosia.org") return u.pathname === "/search" && hasQuery;
  } catch {}
  return false;
}

async function autoTranslateIfSession(id) {
  if (!murkyAutoTranslate.on) return false;
  const t = tabs.get(id);
  if (!t || !t.view || t.view.webContents.isDestroyed()) return false;
  const wc = t.view.webContents;
  const url = wc.getURL() || t.url || "";
  if (isMurkyInternalWebContents(wc)) { translateInternalPages().catch(() => {}); return false; }
  if (!url || url === "about:blank" || url.startsWith("devtools:") || isErrorPageUrl(url)) return false;
  const preferred = getSettings().preferredLanguages || ["en"];
  const target = normalizeLanguage(preferred[0]);
  if (!target) return false;
  const key = murkyTranslationStateKey(wc);
  if (murkyTranslationPageState.get(key)?.translated) return true;
  if (t.autoBusy === url) return true;
  t.autoBusy = url;
  try {
    let detected = null;
    for (let a = 0; a < 3 && !detected; a++) {
      detected = await detectPageLanguage(wc);
      if (!detected) await new Promise((r) => setTimeout(r, 350));
      if (!murkyAutoTranslate.on || !tabs.has(id) || tabs.get(id).view.webContents !== wc || wc.isDestroyed()) return false;
    }
    if (!detected || detected === target || !canBergamotTranslate(detected, target)) return false;
    const offer = { detectedCode: detected, detectedName: languageName(detected), targetCode: target, targetName: languageName(target) };
    murkyTranslationTasks.set(id, { status: "translating", offer: { ...offer, translated: false, translating: true } });
    if (id === activeTabId) openTranslationPopup({ ...offer, translated: false, translating: true }, { tabId: id });
    const ok = await translateWebContents(wc, detected, preferred);
    if (ok) murkyTranslationPageState.set(key, { translated: true, detectedCode: detected, targetCode: target });
    murkyTranslationTasks.set(id, { status: ok ? "done" : "failed", offer: { ...offer, translated: !!ok, translating: false } });
    if (id === activeTabId && tabs.has(id) && !wc.isDestroyed()) openTranslationPopup({ ...offer, translated: !!ok, translating: false }, { tabId: id });
    return !!ok;
  } finally { if (tabs.get(id)) tabs.get(id).autoBusy = null; }
}

async function checkTranslationForTab(id, { force = false } = {}) {
  const t=tabs.get(id); if(!t||id!==activeTabId) return false;
  const url=t.view.webContents.getURL()||t.url||"";
  if (murkyAutoTranslate.on && !url.startsWith("devtools:")) { try { if (await autoTranslateIfSession(id)) return true; } catch {} }
  if(isMurkyInternalWebContents(t.view.webContents)||url.startsWith("file:")||url.startsWith("devtools:")||isSearchEngineResultUrl(url)){ closeTranslationPopup(); return false; }
  if(!force && translationPopupDismissedUrl && translationPopupDismissedUrl === url) return false;

  const checkToken = (murkyTranslationChecks.get(id) || 0) + 1;
  murkyTranslationChecks.set(id, checkToken);
  const isLatestCheck = () => murkyTranslationChecks.get(id) === checkToken && activeTabId === id && tabs.has(id);

  const preferred=getSettings().preferredLanguages||["en"];
  const primary=normalizeLanguage(preferred[0]); if(!primary) return false;
  const task = murkyTranslationTasks.get(id);
  if (task?.status === "translating") {
    if (isLatestCheck()) openTranslationPopup({ ...task.offer, translating: true, translated: false }, { tabId: id });
    return true;
  }
  if (task?.status === "done") {
    const pageState = murkyTranslationPageState.get(murkyTranslationStateKey(t.view.webContents));
    if (pageState?.translated && isLatestCheck()) {
      openTranslationPopup({ ...task.offer, translating: false, translated: true }, { tabId: id });
      return true;
    }
  }

  let detected=null;
  for(let attempt=0;attempt<3 && !detected;attempt++){
    detected=await detectPageLanguage(t.view.webContents);
    if(!detected) await new Promise(r=>setTimeout(r,350));
    if (!isLatestCheck()) return false;
  }
  if(!isLatestCheck()) return false;
  if(!detected||detected===primary||!canBergamotTranslate(detected,primary)){ closeTranslationPopup(); return false; }
  translationPopupDismissedUrl = null;
  const pageState = murkyTranslationPageState.get(murkyTranslationStateKey(t.view.webContents));
  openTranslationPopup({detectedCode:detected,detectedName:languageName(detected),targetCode:primary,targetName:languageName(primary),translated: !!pageState?.translated}, { tabId: id });
  return true;
}

function reopenTranslationPopup(){
  const t=tabs.get(activeTabId); if(!t) return false;
  const url=t.view.webContents.getURL()||t.url||"";
  if(isMurkyInternalWebContents(t.view.webContents)||url.startsWith("file:")||url.startsWith("devtools:")||isSearchEngineResultUrl(url)) return false;
  return checkTranslationForTab(activeTabId,{force:true});
}

function applyPageTweaks(webContents, id) {
  webContents.on("did-finish-load", () => {
    const settings = getSettings();
    const t = tabs.get(id);
    webContents.setZoomFactor(settings.pageZoom || 1.0);
  });
}

function localInputToFileUrl(raw) {
  let s = String(raw || "").trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  if (!s) return null;
  if (/^file:/i.test(s)) {
    try { return new URL(s).href; } catch { return null; }
  }
  try {
    if (s === "~" || /^~[\\/]/.test(s)) s = path.join(app.getPath("home"), s.slice(1));
    const isWinPath = /^[a-zA-Z]:[\\/]/.test(s) || /^\\\\[^\\/]+[\\/]/.test(s);
    if (isWinPath) return process.platform === "win32" ? pathToFileURL(path.win32.resolve(s)).href : null;
    if (process.platform !== "win32" && s.startsWith("/") && !/\s{2,}/.test(s)) return pathToFileURL(path.resolve(s)).href;
  } catch {}
  return null;
}

function resolveNavInput(input) {
  const raw = (typeof input === "string" ? input : String(input ?? "")).trim();
  if (!raw) return "murky://newtab";
  if (raw.startsWith("murky://")) return raw;
  const localFileUrl = localInputToFileUrl(raw);
  if (localFileUrl) return localFileUrl;

  const looksLikeUrl =
    /^https?:\/\//i.test(raw) ||
    /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(raw) ||
    /^localhost(:\d+)?(\/.*)?$/i.test(raw);

  if (looksLikeUrl) {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      new URL(candidate);
      return candidate;
    } catch {
    }
  }

  const settings = getSettings() || {};
  const engines = {
    duckduckgo: "https://duckduckgo.com/?q=",
    google: "https://www.google.com/search?q=",
    bing: "https://www.bing.com/search?q=",
    startpage: "https://www.startpage.com/sp/search?query=",
    ecosia: "https://www.ecosia.org/search?q=",
  };
  const base = engines[settings.searchEngine] || engines.duckduckgo;
  return base + encodeURIComponent(raw);
}

function navigateView(id, target) {
  const t = tabs.get(id);
  if (!t) return;
  if (!t.view || t.view.webContents.isDestroyed()) {
    return;
  }
  const dest = resolveNavInput(target);
  t.errorPage = false;
  t.errorToken = (t.errorToken || 0) + 1;
  t.errorShownFor = null;
  t.url = dest;
  t.previewCache = null;
  t.previewCacheAt = 0;
  t.pendingNav = true;
  try {
    const file = INTERNAL_PAGES[internalBase(dest)];
    if (file) {
      const qs = dest.includes("?") ? dest.slice(dest.indexOf("?") + 1).split("#")[0] : "";
      const query = qs ? Object.fromEntries(new URLSearchParams(qs)) : undefined;
      t.view.webContents.loadFile(path.join(__dirname, "src", file), query ? { query } : undefined);
    } else if (/^https?:/i.test(dest) && isOfflineNow()) {
      showOfflineErrorPage(id, dest);
    } else {
      t.view.webContents.loadURL(dest);
    }
  } catch (err) {
    console.error("[murky] navigateView failed, recovering to newtab:", err);
    t.pendingNav = false;
    try {
      t.url = "murky://newtab";
      t.view.webContents.loadFile(path.join(__dirname, "src", INTERNAL_PAGES["murky://newtab"]));
    } catch {}
  }
}

function addToHistory(entry) {
  if (!entry?.url || INTERNAL_PAGES[internalBase(entry.url)]) return;
  const history = Array.isArray(store.get("history")) ? store.get("history") : [];
   
  const filtered = history.filter((h) => !(h?.type !== "search" && h?.url === entry.url));
  filtered.unshift({ ...entry, type: "page", ts: Date.now() });
  store.set("history", filtered.slice(0, 2000));
}

function updateHistoryPage(entry) {
  if (!entry?.url || INTERNAL_PAGES[internalBase(entry.url)]) return;
  const history = Array.isArray(store.get("history")) ? store.get("history") : [];
  const index = history.findIndex((h) => h?.type === "page" && h?.url === entry.url);
  if (index < 0) return;
  const current = history[index] || {};
  history[index] = {
    ...current,
    title: entry.title || current.title || entry.url,
    favicon: entry.favicon || current.favicon || null,
  };
  store.set("history", history);
}



function isMurkyInternalWebContents(webContents) {
  const currentUrl = webContents?.getURL?.() || "";
  return !!internalUrlFor(currentUrl) || currentUrl.startsWith("murky://") ||
    isInternalPageUrl(currentUrl);
}

ipcMain.on("page:isInternal", (event) => {
  const url = event.sender?.getURL?.() || "";
  try {
    const [, tab] = tabForSender(event.sender);
    if (tab && tab.errorPage && !/^https?:/i.test(url)) { event.returnValue = true; return; }
  } catch {}
  if (isErrorPageUrl(url)) { event.returnValue = true; return; }
  try {
    const parsed = new URL(url);
    const file = parsed.protocol === "file:" ? path.basename(parsed.pathname) : "";
    event.returnValue = parsed.protocol === "file:" && Object.values(INTERNAL_PAGES).includes(file);
  } catch {
    event.returnValue = false;
  }
});

function ensureBrowserDialogView() {
  if (browserDialogView && !browserDialogView.webContents.isDestroyed()) return browserDialogView;
  browserDialogView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "src", "preload-browser-dialog.js"),
    },
  });
  browserDialogView.webContents.loadFile(path.join(__dirname, "src", "browser-dialog.html"));
  return browserDialogView;
}

function closeBrowserDialog() {
  if (browserDialogClosing) return;
  browserDialogOpen = false;
  browserDialogClosing = true;
  const view = browserDialogView;
  try { view?.webContents?.send("browser-dialog:hide"); } catch {}
  setTimeout(() => {
    if (mainWindow && view && typeof mainWindow.removeBrowserView === "function") {
      try { mainWindow.removeBrowserView(view); } catch {}
    }
    browserDialogClosing = false;
    browserDialogType = "alert";
    layoutActiveView();
  }, 270);
}

function showBrowserDialog(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const view = ensureBrowserDialogView();
  browserDialogType = payload?.type || "alert";
  browserDialogOpen = true;
  if (typeof mainWindow.addBrowserView === "function") mainWindow.addBrowserView(view);
  layoutActiveView();
  view.webContents.send("browser-dialog:show", { ...payload, settings: getSettings() });
}

function attachBrowserDialogHandler(t) {
   
   
   
  return t;
}

async function respondToBrowserDialog(tabId, accept, promptText = "") {
  pendingJavaScriptDialogs.delete(tabId);
  closeBrowserDialog();
}

function activeDevToolsTarget() {
  const t = tabs.get(activeTabId);
  if (!t || !t.view || t.view.webContents.isDestroyed()) return null;
  const current = t.view.webContents.getURL() || t.url || "";
  if (current.startsWith("file:") || current.startsWith("murky://") || internalUrlFor(current)) return null;
  return t;
}

function sendDevTools(channel, ...args) {
  if (devtoolsView && !devtoolsView.webContents.isDestroyed()) {
    devtoolsView.webContents.send(channel, ...args);
  }
}

function attachDevToolsListeners(t) {
  if (!t || !t.view || t._devtoolsListenersAttached) return;
  t._devtoolsListenersAttached = true;
  t.view.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (t.id !== activeTabId || !devtoolsOpen) return;
    sendDevTools("devtools:console", { level, message, line, sourceId });
  });
  t.view.webContents.on("did-start-loading", () => {
    if (t.id === activeTabId && devtoolsOpen) sendDevTools("devtools:network", { type: "loading", url: t.view.webContents.getURL() });
  });
  t.view.webContents.on("did-stop-loading", () => {
    if (t.id === activeTabId && devtoolsOpen) sendDevTools("devtools:network", { type: "loaded", url: t.view.webContents.getURL() });
  });
}

function ensureDevToolsView() {
  if (devtoolsView && !devtoolsView.webContents.isDestroyed()) return devtoolsView;
  devtoolsView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "src", "preload-devtools.js"),
    },
  });
  devtoolsView.webContents.loadFile(path.join(__dirname, "src", "devtools.html"));
  return devtoolsView;
}

async function resolveDevToolsInspectTarget(target, request) {
  const x = Number(request?.x || 0), y = Number(request?.y || 0);
  const selectionText = String(request?.selectionText || "");
  const payload = JSON.stringify({x,y,selectionText});
  return await target.view.webContents.executeJavaScript(`(() => {
    const p=${payload};
    let el=null;
    try {
      const sel=window.getSelection?.();
      if(p.selectionText && sel && sel.rangeCount) {
        const node=sel.anchorNode || sel.getRangeAt(0).commonAncestorContainer;
        el=node?.nodeType===1?node:node?.parentElement;
      }
    } catch {}
    if(!el) el=document.elementFromPoint(p.x,p.y);
    if(!el) return null;
    const pathFor=(node)=>{const out=[];let n=node;while(n&&n.nodeType===1){const parent=n.parentElement;if(!parent){out.unshift(0);break;}out.unshift(Array.prototype.indexOf.call(parent.children,n));n=parent;}return out;};
    const r=el.getBoundingClientRect();
    return {path:pathFor(el),tag:el.tagName.toLowerCase(),attrs:Array.from(el.attributes||[]).map(a=>({name:a.name,value:a.value})),text:Array.from(el.childNodes||[]).filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).filter(Boolean).join(' ').slice(0,180),match:false,selectionText:p.selectionText||'',box:{x:r.x,y:r.y,width:r.width,height:r.height}};
  })()`, true);
}

async function toggleMurkyDevTools() {
  if (devtoolsOpen) {
    closeMurkyDevTools();
    return;
  }
  const target = activeDevToolsTarget();
  if (!target || !mainWindow) return;
  attachDevToolsListeners(target);
  ensureDevToolsView();
  devtoolsOpen = true;
  if (typeof mainWindow.addBrowserView === "function") {
    mainWindow.addBrowserView(devtoolsView);
  }
  layoutActiveView();
  sendDevTools("devtools:target", {
    id: target.id,
    url: target.view.webContents.getURL(),
    title: target.title || target.view.webContents.getTitle() || "",
  });
  sendDevTools("devtools:settings", getSettings());
  if (pendingDevToolsInspect && pendingDevToolsInspect.tabId === target.id) {
    try {
      const inspect = await resolveDevToolsInspectTarget(target, pendingDevToolsInspect);
      if (inspect) sendDevTools("devtools:inspectTarget", inspect);
    } catch (e) { console.warn("Murky DevTools inspect target failed", e); }
    pendingDevToolsInspect = null;
  }
}

function closeMurkyDevTools() {
  if (!devtoolsOpen) return;
  devtoolsOpen = false;
  if (mainWindow && devtoolsView && typeof mainWindow.removeBrowserView === "function") {
    try { mainWindow.removeBrowserView(devtoolsView); } catch {}
  }
  layoutActiveView();
}

function switchDevToolsTarget() {
  if (!devtoolsOpen) return;
  const target = activeDevToolsTarget();
  if (!target) {
    closeMurkyDevTools();
    return;
  }
  attachDevToolsListeners(target);
  sendDevTools("devtools:target", {
    id: target.id,
    url: target.view.webContents.getURL(),
    title: target.title || target.view.webContents.getTitle() || "",
  });
  sendDevTools("devtools:settings", getSettings());
  layoutActiveView();
}

function extensionDataUrl(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === ".svg" ? "image/svg+xml" : ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".gif" ? "image/gif" : "application/octet-stream";
    return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
  } catch { return null; }
}

function readExtensionIcon(dir, manifest) {
  const icons = manifest?.icons || {};
  const candidates = Object.keys(icons).sort((a, b) => Number(b) - Number(a));
  for (const key of candidates) {
    const rel = icons[key];
    if (!rel) continue;
    const file = path.resolve(dir, rel);
    const root = path.resolve(dir);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) continue;
    const data = extensionDataUrl(file);
    if (data) return data;
  }
  for (const rel of ["icon128.png", "icon64.png", "icon48.png", "icon32.png", "icon16.png"]) {
    const data = extensionDataUrl(path.join(dir, rel));
    if (data) return data;
  }
  return extensionDataUrl(path.join(__dirname, "assets", "logo_light.png"));
}

function extensionPublic(record) {
  return {
    id: record.id,
    name: record.name || "Unnamed extension",
    version: record.version || "",
    description: record.description || "",
    icon: record.icon || extensionDataUrl(path.join(__dirname, "assets", "logo_light.png")),
    pinned: !!record.pinned,
    manifestVersion: Number(record.manifest?.manifest_version || 2),
    loaded: !!loadedExtensions.get(record.id),
  };
}

function getStoredExtensions() {
  return Array.isArray(store.get("extensions")) ? store.get("extensions") : [];
}
function saveStoredExtensions(list) { store.set("extensions", list); }
function sortExtensionRecords(list) {
  const pinned = Array.isArray(store.get("extensionPinned")) ? store.get("extensionPinned") : [];
  const rank = new Map(pinned.map((id, i) => [String(id), i]));
  for (const record of list) if (record.pinned && !rank.has(String(record.id))) rank.set(String(record.id), rank.size);
  return [...list].sort((a, b) => {
    const ar = rank.has(String(a.id)) ? rank.get(String(a.id)) : Infinity;
    const br = rank.has(String(b.id)) ? rank.get(String(b.id)) : Infinity;
    if (ar !== br) return ar - br;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}
function getExtensionRecords() { return sortExtensionRecords(getStoredExtensions()).map(extensionPublic); }
function extensionPathSafe(dir) {
  const root = path.resolve(EXTENSIONS_DIR), target = path.resolve(dir);
  return target === root || target.startsWith(root + path.sep);
}
function findManifest(dir) {
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error("This extension does not contain a manifest.json file.");
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { throw new Error("The extension manifest.json is invalid JSON."); }
  if (!manifest || !manifest.name) throw new Error("The extension manifest is missing a name.");
  if (![2, 3].includes(Number(manifest.manifest_version))) throw new Error("Murky supports Chrome Manifest V2 and V3 extensions.");
  return manifest;
}
function shellQuotePowerShell(value) { return "'" + String(value).replace(/'/g, "''") + "'"; }
function extractExtensionArchive(archivePath, destination) {
  fs.mkdirSync(destination, { recursive: true });
  let zipPath = archivePath;
  if (archivePath.toLowerCase().endsWith(".crx")) {
    const buf = fs.readFileSync(archivePath);
    if (buf.slice(0, 4).toString("ascii") !== "Cr24") throw new Error("Invalid CRX extension package.");
    const version = buf.readUInt32LE(4);
    let zipOffset;
    if (version === 2) zipOffset = 16 + buf.readUInt32LE(8) + buf.readUInt32LE(12);
    else if (version === 3) zipOffset = 12 + buf.readUInt32LE(8);
    else throw new Error("Unsupported CRX package version.");
    if (!zipOffset || zipOffset >= buf.length) throw new Error("Invalid CRX package data.");
    zipPath = path.join(destination, "package.zip");
    fs.writeFileSync(zipPath, buf.subarray(zipOffset));
  }
  const ps = `Expand-Archive -LiteralPath ${shellQuotePowerShell(zipPath)} -DestinationPath ${shellQuotePowerShell(destination)} -Force`;
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", code => {
      try { if (zipPath !== archivePath && fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true }); } catch {}
      if (code === 0) resolve(); else reject(new Error(stderr.trim() || `Could not extract extension (exit code ${code}).`));
    });
  });
}
async function installExtensionFromPath(sourcePath) {
  if (!sourcePath || typeof sourcePath !== "string") throw new Error("No extension file was selected.");
  fs.mkdirSync(EXTENSIONS_DIR, { recursive: true });
  const stat = fs.statSync(sourcePath);
  const staging = path.join(EXTENSIONS_DIR, `.staging-${crypto.randomBytes(8).toString("hex")}`);
  fs.mkdirSync(staging, { recursive: true });
  try {
    if (stat.isDirectory()) fs.cpSync(sourcePath, staging, { recursive: true });
    else {
      const ext = path.extname(sourcePath).toLowerCase();
      if (![".zip", ".crx"].includes(ext)) throw new Error("Choose an extension folder, .zip, or .crx package.");
      await extractExtensionArchive(sourcePath, staging);
    }
    let dir = staging;
    if (!fs.existsSync(path.join(dir, "manifest.json"))) {
      const entries = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory());
      if (entries.length === 1 && fs.existsSync(path.join(dir, entries[0].name, "manifest.json"))) dir = path.join(dir, entries[0].name);
    }
    const manifest = findManifest(dir);
    const key = crypto.createHash("sha256").update(`${manifest.name}|${manifest.version || ""}|${sourcePath}`).digest("hex").slice(0, 20);
    const finalDir = path.join(EXTENSIONS_DIR, key);
    if (fs.existsSync(finalDir)) {
      const existing = getStoredExtensions().find(e => e.dir === finalDir);
      if (existing?.id) { try { session.defaultSession.removeExtension(existing.id); } catch {} loadedExtensions.delete(existing.id); }
      fs.rmSync(finalDir, { recursive: true, force: true });
      saveStoredExtensions(getStoredExtensions().filter(e => e.dir !== finalDir));
    }
    fs.renameSync(staging, finalDir);
    if (!fs.existsSync(path.join(finalDir, "manifest.json"))) {
      const dirs = fs.readdirSync(finalDir, { withFileTypes: true }).filter(e => e.isDirectory());
      if (dirs.length === 1 && fs.existsSync(path.join(finalDir, dirs[0].name, "manifest.json"))) {
        const nested = path.join(finalDir, dirs[0].name);
        for (const entry of fs.readdirSync(nested)) fs.renameSync(path.join(nested, entry), path.join(finalDir, entry));
        fs.rmSync(nested, { recursive: true, force: true });
      }
    }
    const loaded = await session.defaultSession.loadExtension(finalDir, { allowFileAccess: true });
    const record = { id: loaded.id, dir: finalDir, name: loaded.name || manifest.name, version: loaded.version || manifest.version || "", description: manifest.description || "", manifest, icon: readExtensionIcon(finalDir, manifest), pinned: false };
    const records = getStoredExtensions().filter(e => e.dir !== finalDir && e.id !== loaded.id);
    records.push(record); saveStoredExtensions(records); loadedExtensions.set(loaded.id, record);
    send("extensions:update", getExtensionRecords()); sendExtensionPopupUpdate();
    return extensionPublic(record);
  } catch (error) {
    try { fs.rmSync(staging, { recursive: true, force: true }); } catch {}
    throw error;
  }
}
async function loadStoredExtensions() {
  fs.mkdirSync(EXTENSIONS_DIR, { recursive: true });
  const valid = [];
  for (const record of getStoredExtensions()) {
    try {
      if (!record?.dir || !extensionPathSafe(record.dir) || !fs.existsSync(record.dir)) continue;
      const manifest = findManifest(record.dir);
      const extApi = session.defaultSession.extensions;
      const loaded = extApi?.loadExtension ? await extApi.loadExtension(record.dir, { allowFileAccess: true }) : await session.defaultSession.loadExtension(record.dir, { allowFileAccess: true });
      const next = { ...record, id: loaded.id, name: loaded.name || manifest.name, version: loaded.version || manifest.version || "", description: manifest.description || record.description || "", manifest, icon: readExtensionIcon(record.dir, manifest) };
      const oldId = String(record.id || "");
      if (oldId && oldId !== String(loaded.id)) {
        const order = Array.isArray(store.get("extensionPinned")) ? store.get("extensionPinned").map(String) : [];
        const idx = order.indexOf(oldId); if (idx >= 0) order[idx] = String(loaded.id); store.set("extensionPinned", [...new Set(order)]);
      }
      valid.push(next); loadedExtensions.set(loaded.id, next);
    } catch (error) { console.warn(`Murky: could not load extension ${record?.name || record?.dir}: ${error.message}`); }
  }
  saveStoredExtensions(valid);
}
function getExtensionActionPath(record) {
  const m = record?.manifest || {};
  const action = m.action || m.browser_action || m.page_action;
  const popup = action?.default_popup;
  if (!popup || typeof popup !== "string") return null;
  const clean = popup.replace(/^\/+/, "");
  const target = path.resolve(record.dir, clean);
  const root = path.resolve(record.dir);
  if (!target.startsWith(root + path.sep) && target !== root) return null;
  if (!fs.existsSync(target)) return null;
  return target;
}
function closeExtensionAction({ animate = true } = {}) {
  if (!extensionActionOpen && !extensionActionView) return;
  extensionActionOpen = false;
  const view = extensionActionView;
  if (view && !view.webContents.isDestroyed()) {
    if (animate) {
      try {
        view.webContents.executeJavaScript(`document.body.classList.remove("murky-extension-menu-open","murky-extension-menu-close");document.body.offsetWidth;document.body.classList.add("murky-extension-menu-close");`, true).catch(() => {});
      } catch {}
    }
    setTimeout(() => {
      if (mainWindow && view) {
        try { mainWindow.removeBrowserView(view); } catch {}
      }
      if (extensionActionView === view) extensionActionView = null;
      layoutActiveView();
    }, animate ? 150 : 0);
    return;
  }
  if (mainWindow && view) { try { mainWindow.removeBrowserView(view); } catch {} }
  if (extensionActionView === view) extensionActionView = null;
  layoutActiveView();
}

function getActiveExtensionTab() {
  const t = activeTabId ? tabs.get(activeTabId) : null;
  if (!t || !t.view || t.view.webContents.isDestroyed()) return null;
  return {
    id: t.id,
    index: 0,
    windowId: mainWindow && !mainWindow.isDestroyed() ? 1 : 0,
    active: true,
    pinned: !!t.isPinned,
    mutedInfo: { muted: !!t.isMuted },
    audible: false,
    title: t.title || "",
    url: t.view.webContents.getURL() || t.url || "",
    favIconUrl: t.favicon || undefined,
    status: t.isLoading ? "loading" : "complete",
  };
}

function extensionHasPermission(record, permission) {
  const permissions = Array.isArray(record?.manifest?.permissions) ? record.manifest.permissions : [];
  const hosts = Array.isArray(record?.manifest?.host_permissions) ? record.manifest.host_permissions : [];
  return permissions.includes(permission) || hosts.includes("<all_urls>") || hosts.includes("*://*/*") || hosts.includes("http://*/*") || hosts.includes("https://*/*");
}

function getExtensionStorage(record) {
  const all = store.get("extensionStorage") || {};
  return all[String(record.id)] || {};
}

function setExtensionStorage(record, value) {
  const all = store.get("extensionStorage") || {};
  all[String(record.id)] = value || {};
  store.set("extensionStorage", all);
}

function extensionTabsQuery(record, queryInfo = {}) {
  const active = getActiveExtensionTab();
  if (!active) return [];
  const wantsActive = queryInfo.active;
  const wantsCurrent = queryInfo.currentWindow;
  if (wantsActive === false) return [];
  if (wantsCurrent === false && wantsCurrent !== undefined) return [];
  return [active];
}

async function extensionTabsCreate(record, createProperties = {}) {
  let url = createProperties.url || "murky://newtab";
  if (typeof url !== "string") url = "murky://newtab";
  if (url.startsWith("chrome-extension://") && !url.startsWith(`chrome-extension://${record.id}/`)) {
    url = "murky://newtab";
  }
  const id = await createTab(url, { activate: createProperties.active !== false });
  return getActiveExtensionTab() || { id, windowId: 1, active: true, url };
}

async function extensionTabsReload(record, tabId) {
  const target = tabs.get(String(tabId));
  if (!target) return false;
  if (!extensionHasPermission(record, "tabs") && String(tabId) !== String(activeTabId) && !extensionHasPermission(record, "activeTab")) {
    throw new Error("The extension does not have permission to reload this tab.");
  }
  try { reloadWc(target.view.webContents); } catch {}
  return true;
}

async function extensionTabsUpdate(record, tabId, props = {}) {
  const target = tabs.get(String(tabId));
  if (!target) throw new Error("No such tab.");
  if (props.url) {
    if (!extensionHasPermission(record, "tabs") && String(tabId) !== String(activeTabId) && !extensionHasPermission(record, "activeTab")) {
      throw new Error("The extension does not have permission to navigate this tab.");
    }
    target.view.webContents.loadURL(String(props.url));
  }
  if (typeof props.muted === "boolean") target.view.webContents.setAudioMuted(props.muted);
  if (props.active) activeTabId = target.id;
  return serializeTab(target.id);
}

async function extensionTabsRemove(tabId) {
  const id = String(tabId);
  if (!tabs.has(id)) return;
  await closeTab(id);
  return true;
}

async function extensionExecuteScript(record, details = {}) {
  const target = getActiveExtensionTab();
  if (!target) return [];
  if (!extensionHasPermission(record, "scripting") && !extensionHasPermission(record, "activeTab")) {
    throw new Error("The extension does not have scripting or activeTab permission.");
  }
  const targetTab = tabs.get(String(target.id));
  if (!targetTab) return [];
  let code = "";
  if (Array.isArray(details.func)) code = details.func.join("\n");
  else if (typeof details.func === "string") code = `(${details.func})()`;
  else if (Array.isArray(details.files)) {
    code = details.files.map(file => {
      const p = path.resolve(record.dir, String(file).replace(/^\/+/, ""));
      const root = path.resolve(record.dir);
      if (!p.startsWith(root + path.sep) || !fs.existsSync(p)) return "";
      return fs.readFileSync(p, "utf8");
    }).join("\n");
  }
  if (!code) return [];
  const result = await targetTab.view.webContents.executeJavaScript(code, true);
  return [{ result }];
}

ipcMain.handle("extension-api:tabs-query", (_e, extensionId, queryInfo) => {
  const record = getStoredExtensions().find(r => String(r.id) === String(extensionId));
  if (!record) return [];
  return extensionTabsQuery(record, queryInfo || {});
});
ipcMain.handle("extension-api:tabs-create", async (_e, extensionId, props) => {
  const record = getStoredExtensions().find(r => String(r.id) === String(extensionId));
  if (!record) throw new Error("Unknown extension.");
  return extensionTabsCreate(record, props || {});
});
ipcMain.handle("extension-api:tabs-reload", async (_e, extensionId, tabId) => {
  const record = getStoredExtensions().find(r => String(r.id) === String(extensionId));
  if (!record) throw new Error("Unknown extension.");
  return extensionTabsReload(record, tabId);
});
ipcMain.handle("extension-api:tabs-update", async (_e, extensionId, tabId, props) => {
  const record = getStoredExtensions().find(r => String(r.id) === String(extensionId));
  if (!record) throw new Error("Unknown extension.");
  return extensionTabsUpdate(record, tabId, props || {});
});
ipcMain.handle("extension-api:tabs-remove", async (_e, extensionId, tabId) => {
  const record = getStoredExtensions().find(r => String(r.id) === String(extensionId));
  if (!record) throw new Error("Unknown extension.");
  return extensionTabsRemove(tabId);
});
ipcMain.handle("extension-api:storage-get", (_e, extensionId, keys) => {
  const record = getStoredExtensions().find(r => String(r.id) === String(extensionId));
  if (!record) return {};
  const data = getExtensionStorage(record);
  if (keys == null) return data;
  if (typeof keys === "string") return { [keys]: data[keys] };
  if (Array.isArray(keys)) return Object.fromEntries(keys.map(k => [k, data[k]]));
  if (typeof keys === "object") return Object.fromEntries(Object.keys(keys).map(k => [k, data[k] === undefined ? keys[k] : data[k]]));
  return {};
});
ipcMain.handle("extension-api:storage-set", (_e, extensionId, items) => {
  const record = getStoredExtensions().find(r => String(r.id) === String(extensionId));
  if (!record) return;
  const data = getExtensionStorage(record);
  Object.assign(data, items || {});
  setExtensionStorage(record, data);
});
ipcMain.handle("extension-api:storage-remove", (_e, extensionId, keys) => {
  const record = getStoredExtensions().find(r => String(r.id) === String(extensionId));
  if (!record) return;
  const data = getExtensionStorage(record);
  for (const k of (Array.isArray(keys) ? keys : [keys])) delete data[k];
  setExtensionStorage(record, data);
});
ipcMain.handle("extension-api:storage-clear", (_e, extensionId) => {
  const record = getStoredExtensions().find(r => String(r.id) === String(extensionId));
  if (!record) return;
  setExtensionStorage(record, {});
});
ipcMain.handle("extension-api:clipboard-write", (_e, extensionId, text) => {
  const { clipboard } = require("electron");
  clipboard.writeText(String(text ?? ""));
  return true;
});
ipcMain.handle("extension-api:scripting-execute", async (_e, extensionId, details) => {
  const record = getStoredExtensions().find(r => String(r.id) === String(extensionId));
  if (!record) throw new Error("Unknown extension.");
  return extensionExecuteScript(record, details || {});
});
ipcMain.handle("extension-api:runtime-send", (_e, extensionId, message) => {
  send(`extension:message:${extensionId}`, message);
  return undefined;
});

async function activateExtension(id) {
  const record = getStoredExtensions().find(r => String(r.id) === String(id));
  if (!record || !loadedExtensions.has(record.id)) return { ok: false, reason: "not-loaded" };
  const popupPath = getExtensionActionPath(record);
  if (!popupPath || !mainWindow) return { ok: true, running: true, popup: false };

  closeExtensionAction({ animate: false });
  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "src", "preload-extension-action.js"),
      additionalArguments: [`--murky-extension-id=${encodeURIComponent(record.id)}`],
    }
  });
  extensionActionView = view;
  extensionActionOpen = true;
  mainWindow.addBrowserView(view);
  const bounds = mainWindow.getBounds();
  const chromeHeight = getChromeHeight ? getChromeHeight() : 0;
  const w = 360;
  const h = 480;
  const x = Math.max(8, bounds.width - w - 16);
  const y = Math.max(chromeHeight + 4, chromeHeight + 8);
  view.setBounds({ x, y, width: Math.min(w, bounds.width - 16), height: Math.min(h, bounds.height - y - 12) });
  view.setAutoResize({ width: false, height: false, horizontal: false, vertical: false });
  view.webContents.on("before-input-event", (event, input) => {
    if (input?.type === "keyDown" && input.key === "Escape") {
      event.preventDefault();
      closeExtensionAction();
    }
  });
  view.webContents.on("did-finish-load", async () => {
    if (extensionActionView !== view || !extensionActionOpen) return;
    try {
      await view.webContents.insertCSS(`
        html,body{margin:0!important;overflow:auto!important;}*{box-sizing:border-box;}
        @keyframes murkyExtensionMenuIn{from{opacity:0;transform:translateY(-7px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes murkyExtensionMenuOut{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(-5px) scale(.99)}}
        body.murky-extension-menu-open{transform-origin:50% 0;animation:murkyExtensionMenuIn .18s cubic-bezier(.2,.8,.2,1) both!important;}
        body.murky-extension-menu-close{transform-origin:50% 0;animation:murkyExtensionMenuOut .15s cubic-bezier(.4,0,1,1) both!important;pointer-events:none!important;}
      `);
      await view.webContents.executeJavaScript(`document.body.classList.remove("murky-extension-menu-close","murky-extension-menu-open");document.body.offsetWidth;document.body.classList.add("murky-extension-menu-open");`, true);
    } catch {}
  });
  view.webContents.on("will-navigate", (_e, url) => {
    if (!url.startsWith(`chrome-extension://${record.id}/`)) closeExtensionAction();
  });
  view.webContents.on("destroyed", () => {
    if (extensionActionView === view) closeExtensionAction();
  });
  try {
    await view.webContents.loadURL(`chrome-extension://${record.id}/${path.relative(record.dir, popupPath).replace(/\\/g, "/")}`);
    return { ok: true, running: true, popup: true };
  } catch (error) {
    closeExtensionAction();
    return { ok: false, reason: error.message || String(error) };
  }
}

function ensureExtensionPopupView() {
  if (extensionPopupView && !extensionPopupView.webContents.isDestroyed()) return extensionPopupView;
  extensionPopupView = new BrowserView({ webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, "src", "preload-extension-popup.js") } });
  extensionPopupView.webContents.loadFile(path.join(__dirname, "src", "extension-popup.html"));
  extensionPopupView.webContents.on("before-input-event", (event, input) => { if (input?.type === "keyDown" && input.key === "Escape") { event.preventDefault(); closeExtensionPopup(); } });
  return extensionPopupView;
}
function sendExtensionPopupUpdate() {
  if (extensionPopupView && !extensionPopupView.webContents.isDestroyed()) extensionPopupView.webContents.send("extensions:data", { extensions: getExtensionRecords(), settings: getSettings() });
}
function openExtensionPopup(viewName = "list", point = null) {
  if (!mainWindow) return;
  closeExtensionAction();
  extensionPopupPoint = point || extensionPopupPoint;
  const view = ensureExtensionPopupView();
  extensionPopupOpen = true;
  mainWindow.addBrowserView(view);
  layoutActiveView();

  const sendReady = () => {
    try {
      view.webContents.send("extensions:data", { extensions: getExtensionRecords(), settings: getSettings() });
      view.webContents.send("extensions:view", viewName);
      view.webContents.send("extensions:animate", "open");
    } catch {}
  };

   
   
   
  sendReady();
  if (view.webContents.isLoading()) view.webContents.once("did-finish-load", sendReady);
}
function closeExtensionPopup() {
  if (!extensionPopupOpen) return;
  extensionPopupOpen = false;
  if (mainWindow && extensionPopupView && !extensionPopupView.webContents.isDestroyed()) {
    try {
      extensionPopupView.webContents.send("extensions:animate", "close");
      setTimeout(() => {
        if (!extensionPopupOpen && mainWindow && extensionPopupView) {
          try { mainWindow.removeBrowserView(extensionPopupView); } catch {}
          layoutActiveView();
        }
      }, 170);
      return;
    } catch {}
  }
  if (mainWindow && extensionPopupView) { try { mainWindow.removeBrowserView(extensionPopupView); } catch {} }
  layoutActiveView();
}
async function toggleExtensionPopup() { if (extensionPopupOpen) closeExtensionPopup(); else openExtensionPopup(); }

const SITE_PERMISSIONS = [
  { key: "camera", label: "Camera" },
  { key: "microphone", label: "Microphone" },
  { key: "location", label: "Location" },
  { key: "notifications", label: "Notifications" },
  { key: "clipboard", label: "Clipboard" },
];
const SITE_PERMISSION_VALUES = ["block", "ask", "allow"];

function apexOf(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!h || h === "localhost" || h.includes(":") || /^\d+(\.\d+){3}$/.test(h)) return h;
  const parts = h.split(".");
  if (parts.length <= 2) return h;
  const second = parts[parts.length - 2];
  const last = parts[parts.length - 1];
  const sld = new Set(["co", "com", "org", "net", "gov", "edu", "ac", "or", "ne", "go", "gen", "k12"]);
  if (last.length === 2 && sld.has(second)) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

function siteFromUrl(u) {
  try {
    const x = new URL(String(u || ""));
    if (x.protocol !== "https:" && x.protocol !== "http:") return null;
    return { host: x.hostname, apex: apexOf(x.hostname), secure: x.protocol === "https:", origin: x.origin };
  } catch { return null; }
}

function validSiteHost(h) {
  return typeof h === "string" && h.length > 0 && h.length <= 253 && /^[a-z0-9.\-]+$/i.test(h);
}

function getSitePermissions(apex) {
  const all = store.get("sitePermissions") || {};
  const rec = all[apex] || {};
  const out = {};
  for (const p of SITE_PERMISSIONS) out[p.key] = SITE_PERMISSION_VALUES.includes(rec[p.key]) ? rec[p.key] : "ask";
  return out;
}

function setSitePermission(apex, key, value) {
  if (!SITE_PERMISSIONS.some((p) => p.key === key) || !SITE_PERMISSION_VALUES.includes(value)) return false;
  const all = { ...(store.get("sitePermissions") || {}) };
  const rec = { ...(all[apex] || {}) };
  if (value === "ask") delete rec[key]; else rec[key] = value;
  if (Object.keys(rec).length) all[apex] = rec; else delete all[apex];
  store.set("sitePermissions", all);
  return true;
}

function permissionKeysFor(permission, mediaTypes) {
  switch (permission) {
    case "media": {
      const types = Array.isArray(mediaTypes) ? mediaTypes : [];
      const keys = [];
      if (types.includes("video")) keys.push("camera");
      if (types.includes("audio")) keys.push("microphone");
      return keys.length ? keys : ["camera", "microphone"];
    }
    case "geolocation": return ["location"];
    case "notifications": return ["notifications"];
    case "clipboard-read": return ["clipboard"];
    default: return null;
  }
}

async function resolveSitePermission(site, keys) {
  const perms = getSitePermissions(site.apex);
  if (keys.some((k) => perms[k] === "block")) return false;
  const needAsk = keys.filter((k) => perms[k] === "ask");
  if (!needAsk.length) return true;
  const labels = needAsk.map((k) => SITE_PERMISSIONS.find((p) => p.key === k).label.toLowerCase());
  const what = labels.length > 1 ? labels.slice(0, -1).join(", ") + " and " + labels[labels.length - 1] : labels[0];
  const options = {
    type: "question",
    buttons: ["Allow", "Block"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: "Permission request",
    message: `${site.apex} wants to use your ${what}`,
    detail: "You can change this any time from Site settings in the address bar.",
    checkboxLabel: "Remember my choice for this site",
    checkboxChecked: false,
  };
  let res;
  try {
    res = mainWindow && !mainWindow.isDestroyed() ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
  } catch { return false; }
  const allowed = res.response === 0;
  if (res.checkboxChecked) for (const k of needAsk) setSitePermission(site.apex, k, allowed ? "allow" : "block");
  return allowed;
}

async function getSiteCookies(apex) {
  if (!apex) return [];
  try {
    const all = await session.defaultSession.cookies.get({});
    return all.filter((c) => {
      const d = String(c.domain || "").replace(/^\./, "").toLowerCase();
      return d === apex || d.endsWith("." + apex);
    });
  } catch { return []; }
}

async function clearSiteCookies(apex) {
  const ses = session.defaultSession;
  const cookies = await getSiteCookies(apex);
  for (const c of cookies) {
    const d = String(c.domain || "").replace(/^\./, "");
    try { await ses.cookies.remove(`${c.secure ? "https" : "http"}://${d}${c.path || "/"}`, c.name); } catch {}
  }
}

async function clearSiteData(apex) {
  const ses = session.defaultSession;
  const cookies = await getSiteCookies(apex);
  const origins = new Set([`https://${apex}`, `http://${apex}`, `https://www.${apex}`, `http://www.${apex}`]);
  for (const c of cookies) {
    const d = String(c.domain || "").replace(/^\./, "");
    origins.add(`${c.secure ? "https" : "http"}://${d}`);
  }
  for (const [, t] of tabs) {
    const si = siteFromUrl(t.url);
    if (si && si.apex === apex) origins.add(si.origin);
  }
  await clearSiteCookies(apex);
  for (const origin of origins) {
    try {
      await ses.clearStorageData({ origin, storages: ["localstorage", "indexdb", "filesystem", "websql", "serviceworkers", "cachestorage", "appcache"] });
    } catch {}
  }
}

async function getSiteUsage(apex) {
  const seen = new Set();
  let total = 0;
  let measured = false;
  for (const [, t] of tabs) {
    const si = siteFromUrl(t.url);
    if (!si || si.apex !== apex || seen.has(si.origin)) continue;
    seen.add(si.origin);
    const wc = t.view?.webContents;
    if (!wc || wc.isDestroyed()) continue;
    try {
      const bytes = await Promise.race([
        wc.executeJavaScript("(navigator.storage && navigator.storage.estimate) ? navigator.storage.estimate().then(function(e){return e.usage||0}) : null"),
        new Promise((resolve) => setTimeout(() => resolve(null), 900)),
      ]);
      if (typeof bytes === "number") { total += bytes; measured = true; }
    } catch {}
  }
  return measured ? total : null;
}

async function getSiteSettingsPayload(host) {
  if (!validSiteHost(host)) return null;
  const apex = apexOf(host);
  const [cookies, usage] = await Promise.all([getSiteCookies(apex), getSiteUsage(apex)]);
  return {
    apex,
    cookieCount: cookies.length,
    usageBytes: usage,
    permissions: getSitePermissions(apex),
    permissionList: SITE_PERMISSIONS,
  };
}

function ensureSiteInfoView() {
  if (siteInfoView && !siteInfoView.webContents.isDestroyed()) return siteInfoView;
  siteInfoView = new BrowserView({ webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, "src", "preload-site-info.js") } });
  try { siteInfoView.setBackgroundColor("#00000000"); } catch {}
  siteInfoView.webContents.loadFile(path.join(__dirname, "src", "site-info.html"));
  siteInfoView.webContents.on("before-input-event", (event, input) => {
    if (input?.type === "keyDown" && input.key === "Escape") { event.preventDefault(); closeSiteInfo(); }
  });
  return siteInfoView;
}

function sendSiteInfoTheme() {
  if (siteInfoView && !siteInfoView.webContents.isDestroyed()) siteInfoView.webContents.send("siteinfo:theme", getSettings());
}

function openSiteInfo(point = null) {
  if (!mainWindow) return false;
  const t = tabs.get(activeTabId);
  if (!t || !siteFromUrl(t.url)) return false;
  closeExtensionPopup();
  closeExtensionAction();
  siteInfoPoint = point || siteInfoPoint;
  siteInfoHeight = 190;
  const view = ensureSiteInfoView();
  siteInfoOpen = true;
  mainWindow.addBrowserView(view);
  layoutActiveView();
  const ready = () => {
    try { view.webContents.send("siteinfo:show", { settings: getSettings() }); } catch {}
  };
  ready();
  if (view.webContents.isLoading()) view.webContents.once("did-finish-load", ready);
  try { view.webContents.focus(); } catch {}
  send("siteinfo:state", { open: true });
  return true;
}

function closeSiteInfo(immediate = false) {
  if (!siteInfoOpen) return;
  siteInfoOpen = false;
  send("siteinfo:state", { open: false });
  const remove = () => {
    if (siteInfoOpen) return;
    if (mainWindow && siteInfoView) { try { mainWindow.removeBrowserView(siteInfoView); } catch {} }
    layoutActiveView();
  };
  if (!immediate && siteInfoView && !siteInfoView.webContents.isDestroyed()) {
    try { siteInfoView.webContents.send("siteinfo:animate", "close"); setTimeout(remove, 150); return; } catch {}
  }
  remove();
}

function isContextMenuAllowedForTab(tab){const url=tab?.view?.webContents?.getURL?.()||tab?.url||"";return !!url&&!isMurkyInternalWebContents(tab.view.webContents)&&!url.startsWith("file:")&&!url.startsWith("devtools:")&&!internalUrlFor(url);}
function buildWebContextMenu(tab, params){const wc=tab?.view?.webContents;if(!wc)return null;return Menu.buildFromTemplate([
 {label:menuLabel("Back"),enabled:wc.navigationHistory?.canGoBack?.() ?? wc.canGoBack(),click:()=>wc.navigationHistory?.goBack?.() ?? wc.goBack()},
 {label:menuLabel("Forward"),enabled:wc.navigationHistory?.canGoForward?.() ?? wc.canGoForward(),click:()=>wc.navigationHistory?.goForward?.() ?? wc.goForward()},
 {label:menuLabel("Reload"),click:()=>reloadWc(wc)},
 {type:"separator"},
 {label:menuLabel("Save As..."),click:async()=>{const r=await dialog.showSaveDialog(mainWindow,{defaultPath:(wc.getTitle()||"page").replace(/[\\/:*?"<>|]/g,"_")+".html",filters:[{name:"Web page",extensions:["html"]},{name:"All files",extensions:["*"]}]});if(!r.canceled&&r.filePath){try{await wc.savePage(r.filePath,"HTMLComplete")}catch(e){console.warn("Murky Save As failed",e)}}}},
 {label:menuLabel("Print..."),click:()=>wc.print({silent:false,printBackground:true})},
 {label:menuLabel("Cast..."),click:async()=>{try{const supported=await wc.executeJavaScript(`!!(navigator.presentation&&typeof navigator.presentation.defaultRequest!=="undefined")`,true);await dialog.showMessageBox(mainWindow,{type:supported?"info":"warning",title:"Cast",message:supported?"This page supports the Presentation API. Use the page's presentation/media controls to choose a receiver.":"This page does not expose a Presentation API, so casting is not available here."})}catch{await dialog.showMessageBox(mainWindow,{type:"warning",title:"Cast",message:"Casting is not available for this page."})}}},
 {type:"separator"},
 {label:menuLabel("View Page Source"),click:()=>{const u=wc.getURL();if(u)createTab("view-source:"+u,{activate:true})}},
 {label:menuLabel("Inspect"),click:()=>{
   if(activeTabId!==tab.id)activateTab(tab.id);
   pendingDevToolsInspect={tabId:tab.id,x:Number(params?.x||0),y:Number(params?.y||0),selectionText:String(params?.selectionText||"")};
   if(devtoolsOpen)closeMurkyDevTools();
   toggleMurkyDevTools();
 }},
 ]);}
function showWebContextMenu(tab,params){if(!isContextMenuAllowedForTab(tab))return;const b=tab.view.getBounds();const menu=buildWebContextMenu(tab, params);if(menu)menu.popup({window:mainWindow,x:Math.round((params?.x||0)+b.x),y:Math.round((params?.y||0)+b.y)});}

async function applyPageScrollbarTheme(webContents) {
  if (!webContents || webContents.isDestroyed()) return;
  const oldKey = murkyPageScrollbarCssKeys.get(webContents);
  if (oldKey) { try { await webContents.removeInsertedCSS(oldKey); } catch {} }
  const s = getSettings();
  const css = `
    html, body { scrollbar-color: ${s.accent} ${s.surface} !important; }
    * { scrollbar-color: ${s.accent} ${s.surface} !important; }
    *::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
    *::-webkit-scrollbar-track { background: ${s.surface} !important; }
    *::-webkit-scrollbar-thumb { background: ${s.accent} !important; border: 2px solid ${s.surface} !important; border-radius: 999px !important; min-height: 28px !important; }
    *::-webkit-scrollbar-thumb:hover { background: ${s.text || s.accent} !important; }
    *::-webkit-scrollbar-corner { background: ${s.surface} !important; }
  `;
  try {
    const key = await webContents.insertCSS(css);
    murkyPageScrollbarCssKeys.set(webContents, key);
  } catch {}
}

function applyPageScrollbarThemeToAllTabs() {
  for (const t of tabs.values()) applyPageScrollbarTheme(t.view?.webContents);
}

function applyBaseBackground(view) {
  try {
    if (!view || view.webContents.isDestroyed() || typeof view.setBackgroundColor !== "function") return;
    const u = view.webContents.getURL() || "";
    let color = "#FFFFFF";
    if (isErrorPageUrl(u)) color = String(getSettings().background || "#0A1412");
    else if (u.startsWith("murky://") || u === "" || u === "about:blank") color = "#00000000";
    else if (/^file:/i.test(u)) {
      let name = "";
      try { name = path.basename(new URL(u).pathname); } catch {}
      if (Object.values(INTERNAL_PAGES).includes(name)) color = "#00000000";
    }
    view.setBackgroundColor(color);
  } catch {}
}

function createTab(url = "murky://newtab", { activate = true } = {}) {
  const id = `t${++tabCounter}`;
  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
       
       
      disableDialogs: true,
      preload: path.join(__dirname, "preload-page.js"),
    },
  });
   
   
  if (typeof view.setBackgroundColor === "function") {
    view.setBackgroundColor(url === "murky://newtab" ? "#00000000" : "#00000000");
  }

  tabs.set(id, {
    id,
    view,
    title: "New Tab",
    url,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    favicon: null,
    isPinned: false,
    isMuted: false,
    darkCssKey: null,
    pendingNav: false,
    loaded: false,
    previewCache: null,
    previewCacheAt: 0,
    previewCacheUrl: null,
    thumbPending: null,
    thumbTimer: null,
  });

  const wc = view.webContents;
  wc.on("context-menu", (_event, params) => { hideLinkTipNow(); showWebContextMenu(tabs.get(id), params); });
  wc.on("update-target-url", (_event, targetUrl) => onLinkHover(id, targetUrl));
  attachBrowserDialogHandler(tabs.get(id));

   
   
  wc.on("before-input-event", (event, input) => {
    if (input?.type !== "keyDown" || input.key !== "F12") return;
    const currentUrl = wc.getURL() || url || "";
    const isMurkyPage = !!internalUrlFor(currentUrl) ||
      currentUrl.startsWith("murky://") ||
      Object.prototype.hasOwnProperty.call(INTERNAL_PAGES, currentUrl);
    if (isMurkyPage) {
      closeMurkyDevTools();
      return;
    }
    event.preventDefault();
    toggleMurkyDevTools();
  });

  wc.on("input-event", (_event, input) => {
    if (input?.type === "mouseDown" && input.button !== 2) {
      hideLinkTipNow();
      if (extensionActionOpen) closeExtensionAction();
      if (extensionPopupOpen) closeExtensionPopup();
      if (siteInfoOpen) closeSiteInfo();
      if (tabOverlayWindow && !tabOverlayWindow.isDestroyed() && tabOverlayWindow.isVisible()) {
        hideTabOverlayNow();
        mainWindow?.webContents.send("tab-overlay:blur");
      }
    }
  });
   
   
  wc.setBackgroundThrottling(false);

  wc.on("did-start-loading", () => {
    if (id === activeTabId) { closeTranslationPopup(); hideLinkTipNow(); }
    const t = tabs.get(id);
    if (!t) return;
    t.isLoading = true;
    broadcastTabs();
  });

  wc.on("did-finish-load", () => {
    const t = tabs.get(id);
    if (t) t.loaded = true;
    applyBaseBackground(view);
    applyPageScrollbarTheme(wc);
  });

  wc.on("did-first-visually-non-empty-paint", () => applyBaseBackground(view));

  wc.on("did-stop-loading", () => {
    const t = tabs.get(id);
    if (!t) return;
    t.loaded = true;
    t.isLoading = false;
    t.canGoBack = wc.canGoBack();
    t.canGoForward = wc.canGoForward();
    broadcastTabs();
    if (id === activeTabId) scheduleTabThumb(id, 800);
    if (isMurkyInternalWebContents(wc)) translateInternalPages().catch(() => {});
    if (id === activeTabId && !isMurkyInternalWebContents(wc)) { setTimeout(() => checkTranslationForTab(id).catch(() => {}), 250); }

  });

  wc.on("render-process-gone", (_event, details) => {
    const t = tabs.get(id);
    if (!t) return;
    t.isLoading = false;
    t.crashed = true;
    t.crashReason = details?.reason || "crashed";
    broadcastTabs();
    const recoverUrl = t.url || "murky://newtab";
    setTimeout(() => {
      const current = tabs.get(id);
      if (!current || current.view.webContents.isDestroyed()) return;
      current.crashed = false;
      try {
        if (recoverUrl.startsWith("murky://")) navigateView(id, recoverUrl);
        else reloadWc(current.view.webContents);
      } catch {}
      broadcastTabs();
    }, 250);
  });

  wc.on("did-finish-load", () => {

  });

  wc.on("page-title-updated", (_e, title) => {
    const t = tabs.get(id);
    if (!t) return;
    const internal = internalUrlFor(t.url);
    const forcedTitle = titleForInternal(internal);
    t.title = forcedTitle || title || t.title;
    broadcastTabs();
  });

  wc.on("page-favicon-updated", (_e, favicons) => {
    const t = tabs.get(id);
    if (!t) return;
    t.favicon = favicons && favicons[0] ? favicons[0] : null;
    updateHistoryPage({ url: t.url, title: t.title, favicon: t.favicon });
    broadcastTabs();
  });

  wc.on("did-start-navigation", (details) => {
    if (details && (details.isMainFrame === false || details.isSameDocument === true)) return;
    cancelTranslationForTab(id);
    murkyTranslationTasks.delete(id);
    murkyTranslationChecks.set(id, (murkyTranslationChecks.get(id) || 0) + 1);
    if (id === activeTabId) closeTranslationPopup();
  });

  wc.on("did-navigate", (_e, url, httpResponseCode, httpStatusText) => {
    const t = tabs.get(id);
    if (!t) return;
    if (isErrorPageUrl(url)) {
      t.url = t.errorUrl || t.url;
      broadcastTabs();
      if (id === activeTabId) send("nav:url", { id, url: t.url });
      return;
    }
    if (/^chrome-error:/i.test(url)) {
      const f = t.lastFail && Date.now() - t.lastFail.at < 5000 ? t.lastFail : { kind: "net", code: -2, name: "ERR_FAILED", url: t.url };
      showErrorPage(id, f);
      return;
    }
    t.errorPage = false;
    t.pendingHttpError = (httpResponseCode >= 400 && /^https?:/i.test(url)) ? { code: httpResponseCode, text: httpStatusText || "", url } : null;
    const internal = internalUrlFor(url);
    if ((internal || url) !== t.previewCacheUrl) { t.previewCache = null; t.previewCacheAt = 0; }
    t.url = internal || url;
    if (id === activeTabId) {
      if (siteInfoOpen) closeSiteInfo();
      if (internal || url.startsWith("file:") || url.startsWith("murky://")) closeMurkyDevTools();
      else switchDevToolsTarget();
    }
    const forcedTitle = titleForInternal(internal);
    if (forcedTitle) t.title = forcedTitle;
    broadcastTabs();
    if (id === activeTabId) send("nav:url", { id, url: t.url });
    addToHistory({ title: t.title, url: t.url, favicon: t.favicon || null });
    if (id === activeTabId) { translationPopupDismissedUrl = null; setTimeout(() => checkTranslationForTab(id).catch(() => {}), 250); }
  
  });

  wc.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (errorCode === -3 || errorCode === -302) return;
    if (isErrorPageUrl(validatedURL)) return;
    const t = tabs.get(id);
    if (!t) return;
    const failedUrl = validatedURL || t.url;
    const name = String(errorDescription || "").replace(/^net::/, "") || netErrorName(errorCode);
    t.lastFail = { kind: "net", code: errorCode, name, url: failedUrl, at: Date.now() };
    showErrorPage(id, t.lastFail);
  });

  wc.on("did-finish-load", async () => {
    const t = tabs.get(id);
    if (!t || !t.pendingHttpError) return;
    const err = t.pendingHttpError;
    t.pendingHttpError = null;
    if (isErrorPageUrl(wc.getURL())) return;
    try {
      const bare = await wc.executeJavaScript("(function(){var b=document.body;if(!b)return true;var t=(b.innerText||'').trim();var m=document.querySelectorAll('img,video,canvas,iframe,picture').length;return t.length<400&&m<2;})()");
      if (bare && tabs.get(id) === t && !t.errorPage) showErrorPage(id, { kind: "http", code: err.code, text: err.text, url: err.url });
    } catch {}
  });

  wc.on("will-navigate", (e, url) => {
    if (/^https?:/i.test(String(url || "")) && isOfflineNow()) {
      e.preventDefault();
      const t = tabs.get(id);
      if (t) { t.pendingNav = false; showOfflineErrorPage(id, url); }
    }
  });

  wc.on("did-navigate-in-page", (_e, url) => {
    const t = tabs.get(id);
    if (!t) return;
    if (isErrorPageUrl(url)) return;
    const internal = internalUrlFor(url);
    t.url = internal || url;
    if (id === activeTabId) {
      if (internal || url.startsWith("file:") || url.startsWith("murky://")) closeMurkyDevTools();
      else switchDevToolsTarget();
    }
    broadcastTabs();
    if (id === activeTabId) { send("nav:url", { id, url: t.url }); translationPopupDismissedUrl = null; setTimeout(() => checkTranslationForTab(id).catch(() => {}), 250); }
  });

   
   
   
   
   
   
   
   
   
   
   
  wc.setWindowOpenHandler(({ url, disposition }) => {
    const settings = getSettings();
    const mode = settings.tabOpenBehavior || "dynamic";
    if (mode === "never") {
      navigateView(id, url);
      return { action: "deny" };
    }
    if (mode === "dynamic" && disposition === "background-tab") {
      createTab(url, { activate: false });
      return { action: "deny" };
    }
    createTab(url, { activate: true });
    return { action: "deny" };
  });

  applyPageTweaks(wc, id);
  navigateView(id, url);

  if (activate) activateTab(id);
  broadcastTabs();
  return id;
}

function activateTab(id) {
  if (activeTabId && activeTabId !== id) {
    closeTranslationPopup();
  }
  const t = tabs.get(id);
  if (!t || !mainWindow) return;
  if (activeTabId && activeTabId !== id && tabs.has(activeTabId)) {
    captureTabThumb(activeTabId, { force: true }).catch(() => {});
  }
  activeTabId = id;
  hideLinkTipNow();
  closeBrowserDialog();
  closeExtensionPopup();
  closeSiteInfo(true);
  mainWindow.setBrowserView(t.view);
  scheduleTabThumb(id, 900);
  layoutActiveView();
  switchDevToolsTarget();
  broadcastTabs();
  send("nav:url", { id, url: t.url });
  if (!isMurkyInternalWebContents(t.view.webContents)) {
    const task = murkyTranslationTasks.get(id);
    if (task?.status === "translating") {
      translationOffer = { ...task.offer, translated: false, translating: true };
      translationPopupOpen = false;
      translationPopupTabId = null;
      openTranslationPopup(translationOffer, { tabId: id });
    } else if (task?.status === "done") {
      const state = murkyTranslationPageState.get(murkyTranslationStateKey(t.view.webContents));
      if (state?.translated) openTranslationPopup({ ...task.offer, translated: true, translating: false }, { tabId: id });
      else setTimeout(() => checkTranslationForTab(id).catch(() => {}), 180);
    } else {
      setTimeout(() => checkTranslationForTab(id).catch(() => {}), 180);
    }
  } else if (murkyAutoTranslate.on) {
    translateInternalPages().catch(() => {});
  }
}

function closeTab(id) {
  const t = tabs.get(id);
  if (!t) return;
  const wasActive = id === activeTabId;
  cancelTranslationForTab(id);
  murkyTranslationTasks.delete(id);
  murkyTranslationChecks.delete(id);
  if (wasActive) closeTranslationPopup();
  clearTimeout(t.thumbTimer);
  mainWindow.removeBrowserView(t.view);
  pendingJavaScriptDialogs.delete(id);
  try { if (t.view.webContents.debugger.isAttached()) t.view.webContents.debugger.detach(); } catch {}
  t.view.webContents.destroy();
  tabs.delete(id);

  if (wasActive) {
    closeMurkyDevTools();
    const remaining = Array.from(tabs.keys());
    if (remaining.length > 0) {
      activateTab(remaining[remaining.length - 1]);
    } else {
      activeTabId = null;
      try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close(); else app.quit(); } catch { app.quit(); }
      return;
    }
  }
  broadcastTabs();
}

 
 
 
function openInternalTab(internalUrl) {
  for (const [id, t] of tabs.entries()) {
    if (t.url === internalUrl) {
      activateTab(id);
      return id;
    }
  }
  return createTab(internalUrl);
}

function setupAdBlock(ses) {
  const filter = { urls: ["*://*/*"] };
  ses.webRequest.onBeforeRequest(filter, (details, callback) => {
    const settings = getSettings();
    let blocked = false;
    try {
      const requestUrl = new URL(details.url);
      const host = requestUrl.hostname;
      const blockedAd = settings.adBlockEnabled && AD_DOMAINS.some((d) => host.endsWith(d));
      const blockedTracker = settings.trackerBlockEnabled && TRACKER_DOMAINS.some((d) => host.endsWith(d));
      blocked = !!(blockedAd || blockedTracker);
    } catch {}
    recordOutboundRequest({ ...details, status: blocked ? 0 : null, blocked });
    if (!settings.adBlockEnabled && !settings.trackerBlockEnabled) return callback({ cancel: false });
    callback({ cancel: blocked });
  });

  ses.webRequest.onCompleted(filter, (details) => {
    recordOutboundRequest(details);
  });
  ses.webRequest.onErrorOccurred(filter, (details) => {
    recordOutboundRequest(details);
  });

  ses.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const settings = getSettings();
    const headers = { ...details.requestHeaders };
    if (settings.doNotTrack) headers["DNT"] = "1";
    callback({ requestHeaders: headers });
  });
}

app.on("certificate-error", (event, _webContents, url, _error, _certificate, callback) => {
  let host = "";
  try { host = new URL(url).hostname; } catch {}
  if (host && allowedCertHosts.has(host)) { event.preventDefault(); callback(true); return; }
  callback(false);
});

const activeDownloads = new Map();

function setupDownloads(ses) {
  ses.on("will-download", (event, item) => {
    const settings = getSettings();
    const downloadsDir = app.getPath("downloads");
    const defaultPath = path.join(downloadsDir, item.getFilename());

    const startTracking = (savePath) => {
      const id = `dl${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const record = {
        id,
        item,
        savePath,
        filename: item.getFilename(),
        startedAt: Date.now(),
        openWhenDone: false,
      };
      activeDownloads.set(id, record);

      const publish = (extra = {}) => {
        const receivedBytes = item.getReceivedBytes();
        const totalBytes = item.getTotalBytes();
        const elapsed = Math.max(0.001, (Date.now() - record.startedAt) / 1000);
        const rate = receivedBytes / elapsed;
        const remainingSeconds =
          totalBytes > 0 && rate > 0
            ? Math.max(0, (totalBytes - receivedBytes) / rate)
            : null;

        send("downloads:update", {
          id,
          filename: record.filename,
          state: item.isPaused() ? "paused" : "progressing",
          receivedBytes,
          totalBytes,
          remainingSeconds,
          savePath: record.savePath,
          ...extra,
        });
      };

      publish({ isNew: true });

      item.on("updated", (_e, state) => publish({ state }));

      item.once("done", (_e, state) => {
        const finalPath = item.getSavePath() || record.savePath;
        record.savePath = finalPath;

        publish({
          state,
          receivedBytes: item.getReceivedBytes(),
          totalBytes: item.getTotalBytes(),
          remainingSeconds: 0,
          savePath: finalPath,
        });

        activeDownloads.delete(id);

        if (state === "completed" && record.openWhenDone) {
          openDownloadedFile(record);
        }
      });

      item.once("destroyed", () => activeDownloads.delete(id));
    };

    if (settings.askWhereToSave) {
      event.preventDefault();
      dialog
        .showSaveDialog(mainWindow, {
          defaultPath,
          title: "Save download",
        })
        .then(({ canceled, filePath }) => {
          if (canceled || !filePath) return;
          item.setSavePath(filePath);
          startTracking(filePath);
        })
        .catch(() => {});
    } else {
      item.setSavePath(defaultPath);
      startTracking(defaultPath);
    }
  });
}

function openDownloadedFile(record) {
  if (!record || !record.savePath || !fs.existsSync(record.savePath)) return;
  const target = record.savePath;
  const ext = path.extname(target).toLowerCase();
  const executable =
    process.platform === "win32"
      ? [".exe", ".com", ".bat", ".cmd"].includes(ext)
      : [".app", ".sh", ".run"].includes(ext);

  if (executable) {
    try {
      let child;
      if (process.platform === "win32" && [".bat", ".cmd"].includes(ext)) {
        child = spawn("cmd.exe", ["/c", target], {
          detached: false,
          windowsHide: true,
        });
      } else {
        child = spawn(target, [], { detached: false, windowsHide: true });
      }
      child.once("close", () => {
        try { fs.unlinkSync(target); } catch {}
      });
      child.once("error", () => {});
      return;
    } catch {}
  }

  shell.openPath(target).then(() => {
     
     
    setTimeout(() => {
      try {
        if (fs.existsSync(target)) fs.unlinkSync(target);
      } catch {}
    }, 1500);
  }).catch(() => {});
}


function getUpdateConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "update-config.json"), "utf8"));
    if (!cfg?.owner || !cfg?.repo || cfg.owner.startsWith("YOUR_") || cfg.repo.startsWith("YOUR_")) return null;
    return { provider: "github", owner: cfg.owner, repo: cfg.repo, private: !!cfg.private };
  } catch { return null; }
}

function createUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) return updateWindow;
  updateWindow = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    parent: mainWindow,
    modal: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "src", "preload-update.js"),
    },
  });
  updateWindow.loadFile(path.join(__dirname, "src", "update.html"));
  updateWindow.on("close", (e) => e.preventDefault());
  updateWindow.on("closed", () => { updateWindow = null; });
  return updateWindow;
}

function positionUpdateWindow() {
  if (!mainWindow || mainWindow.isDestroyed() || !updateWindow || updateWindow.isDestroyed()) return;
  const b = mainWindow.getBounds();
  updateWindow.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: Math.max(1, Math.round(b.width)), height: Math.max(1, Math.round(b.height)) }, false);
}

function sendUpdateState(extra = {}) {
  if (!updateWindow || updateWindow.isDestroyed()) return;
  updateWindow.webContents.send("update:state", {
    currentVersion: app.getVersion(),
    newVersion: updateInfo?.version || "—",
    ...extra,
  });
}

async function showUpdateWindow(info) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  updateInfo = info;
  updateDownloaded = false;
  updateDownloadStarted = false;
  const win = createUpdateWindow();
  positionUpdateWindow();
  const init = () => {
    if (!win || win.isDestroyed()) return;
    win.webContents.send("update:init", {
      settings: getSettings(),
      currentVersion: app.getVersion(),
      newVersion: info?.version || "—",
      status: "A newer version of Murky is ready.",
      button: "Update",
      disabled: false,
    });
    if (!win.isVisible()) win.show();
    positionUpdateWindow();
    win.focus();
  };
  if (win.webContents.isLoading()) win.webContents.once("did-finish-load", init);
  else init();
}

function hideUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) updateWindow.hide();
}

function getLatestGithubRelease() {
  return new Promise((resolve, reject) => {
    const req = https.get("https://api.github.com/repos/murkybrowser/Murky-Browser/releases?per_page=100", {
      headers: {
        "User-Agent": "Murky-Browser",
        "Accept": "application/vnd.github+json",
      },
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`GitHub returned ${res.statusCode}`));
          return;
        }
        try {
          const releases = JSON.parse(data);
          const platform = getUpdatePlatform();
          if (!platform || !Array.isArray(releases)) {
            reject(new Error("Unsupported update platform"));
            return;
          }

          const matches = releases
            .filter((release) => !release?.draft && !release?.prerelease)
            .map((release) => {
              const tag = String(release?.tag_name || "").trim();
              const match = tag.match(new RegExp("^(\\d+(?:\\.\\d+){2})-" + platform + "$"));
              return match ? { release, tag, version: match[1] } : null;
            })
            .filter(Boolean)
            .sort((a, b) => compareVersions(b.version, a.version));

          if (!matches.length) {
            reject(new Error(`No ${platform} releases found`));
            return;
          }

          const latest = matches[0];
          resolve({
            tag: latest.tag,
            version: latest.version,
            release: latest.release,
            assets: Array.isArray(latest.release.assets) ? latest.release.assets : [],
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.setTimeout(10000, () => req.destroy(new Error("GitHub release check timed out")));
    req.on("error", reject);
  });
}

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

async function checkForMurkyUpdate() {
  if (!app.isPackaged) return false;
  if (updateInfo) return true;

  const provider = getUpdateConfig();
  if (!provider) return false;

  try {
    const latest = await getLatestGithubRelease();
    const current = app.getVersion();

    if (latest.version === current || compareVersions(latest.version, current) <= 0) {
      lastUpdateCheckStatus = `Up to date (${current})`;
      return false;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.setFeedURL(provider);

    autoUpdater.removeAllListeners("update-available");
    autoUpdater.removeAllListeners("update-not-available");
    autoUpdater.removeAllListeners("error");
    autoUpdater.removeAllListeners("download-progress");
    autoUpdater.removeAllListeners("update-downloaded");

    autoUpdater.on("update-available", async (info) => {
      await showUpdateWindow({ ...info, version: latest.version });
    });
    autoUpdater.on("error", (error) => {
      console.warn("Murky updater:", error?.message || error);
    });
    autoUpdater.on("download-progress", (progress) => {
      const percent = Math.max(0, Math.min(100, Math.round(progress.percent || 0)));
      sendUpdateState({ status: `Downloading update… ${percent}%`, button: percent >= 100 ? "Installing…" : "Downloading…", disabled: true });
    });
    autoUpdater.on("update-downloaded", () => {
      updateDownloaded = true;
      sendUpdateState({ status: "Update downloaded. Restarting Murky…", button: "Updating…", disabled: true });
      setTimeout(() => { isQuitting = true; autoUpdater.quitAndInstall(false, true); }, 350);
    });

    updateInfo = { version: latest.version, tag: latest.tag, release: latest.release, assets: latest.assets };
    lastUpdateCheckStatus = `Update available: ${latest.version}`;
    await showUpdateWindow({ version: latest.version });

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      console.warn("Murky updater metadata check failed:", error?.message || error);
    }

    return true;
  } catch (error) {
    lastUpdateCheckStatus = `Update check failed: ${error?.message || "unknown error"}`;
    console.warn("Murky GitHub update check failed:", error?.message || error);
    return false;
  }
}

function showOnboardingIfNeeded() {
  if (!updateWindow || updateWindow.isDestroyed() || !updateWindow.isVisible()) showOnboardingWindow();
}

function createOnboardingWindow() {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) return onboardingWindow;

  onboardingWindow = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    parent: mainWindow,
    modal: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "src", "preload-onboarding.js"),
    },
  });

  onboardingWindow.loadFile(path.join(__dirname, "src", "onboarding.html"));
  onboardingWindow.on("close", (e) => {
     
     
    e.preventDefault();
  });
  onboardingWindow.on("closed", () => { onboardingWindow = null; });
  return onboardingWindow;
}

function positionOnboardingWindow() {
  if (!mainWindow || mainWindow.isDestroyed() || !onboardingWindow || onboardingWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  onboardingWindow.setBounds({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
  }, false);
}

async function showOnboardingWindow(force = false) {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible() || mainWindow.isMinimized()) return;
  if (!force && store.get("onboardingCompleted")) return;

  const win = createOnboardingWindow();
  positionOnboardingWindow();
  const init = () => {
    if (win.isDestroyed() || !mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible() || mainWindow.isMinimized()) return;
    win.webContents.send("onboarding:init", getSettings());
    if (!win.isVisible()) win.show();
    positionOnboardingWindow();
    win.focus();
  };
  if (win.webContents.isLoading()) win.webContents.once("did-finish-load", init);
  else init();
}

function hideOnboardingWindow() {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.hide();
  }
}

const TAB_OVERLAY_W = 310;
const TAB_OVERLAY_H = 240;
const TAB_OVERLAY_EXIT_MS = 95;
const TAB_OVERLAY_SLIDE_MS = 210;

let tabOverlayAnim = null;
let tabOverlayPos = null;
let tabOverlayShown = false;
let tabOverlayMode = null;

function stopTabOverlayAnim() {
  if (tabOverlayAnim) { clearInterval(tabOverlayAnim); tabOverlayAnim = null; }
}

function createTabOverlayWindow() {
  if (tabOverlayWindow && !tabOverlayWindow.isDestroyed()) return tabOverlayWindow;

  tabOverlayWindow = new BrowserWindow({
    width: TAB_OVERLAY_W,
    height: TAB_OVERLAY_H,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    parent: mainWindow,
    modal: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "src", "preload-overlay.js"),
    },
  });

  tabOverlayWindow.loadFile(path.join(__dirname, "src", "tab-overlay.html"));
  tabOverlayWindow.on("closed", () => {
    stopTabOverlayAnim();
    tabOverlayWindow = null;
    tabOverlayShown = false;
    tabOverlayPos = null;
  });
  return tabOverlayWindow;
}

function notifyTabOverlayClosed() {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("tab-overlay:hover", { inside: false, mode: "closed" });
    }
  } catch {}
}

function hideTabOverlayNow() {
  clearTimeout(tabOverlayHideTimer);
  stopTabOverlayAnim();
  tabOverlayShown = false;
  tabOverlayMode = null;
  if (tabOverlayWindow && !tabOverlayWindow.isDestroyed() && tabOverlayWindow.isVisible()) {
    tabOverlayWindow.hide();
  }
  notifyTabOverlayClosed();
}

function hideTabOverlay() {
  if (!tabOverlayWindow || tabOverlayWindow.isDestroyed()) return;
  if (!tabOverlayShown && !tabOverlayWindow.isVisible()) return;
  clearTimeout(tabOverlayHideTimer);
  tabOverlayShown = false;
  try { tabOverlayWindow.webContents.send("overlay:animate-out"); } catch {}
  tabOverlayHideTimer = setTimeout(() => {
    stopTabOverlayAnim();
    tabOverlayMode = null;
    if (tabOverlayWindow && !tabOverlayWindow.isDestroyed()) tabOverlayWindow.hide();
    notifyTabOverlayClosed();
  }, TAB_OVERLAY_EXIT_MS);
}

function syncTabOverlayVisibility() {
  if (!tabOverlayWindow || tabOverlayWindow.isDestroyed()) return;
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || !mainWindow.isVisible()) {
    hideTabOverlayNow();
  }
}

function moveTabOverlay(overlay, x, y, animate) {
  stopTabOverlayAnim();
  const from = tabOverlayPos;
  if (!animate || !from || (Math.abs(from.x - x) < 1 && Math.abs(from.y - y) < 1)) {
    overlay.setPosition(x, y, false);
    tabOverlayPos = { x, y };
    return;
  }
  const start = Date.now();
  tabOverlayAnim = setInterval(() => {
    if (overlay.isDestroyed()) { stopTabOverlayAnim(); return; }
    const p = Math.min(1, (Date.now() - start) / TAB_OVERLAY_SLIDE_MS);
    const e = 1 - Math.pow(1 - p, 3);
    const cx = Math.round(from.x + (x - from.x) * e);
    const cy = Math.round(from.y + (y - from.y) * e);
    try { overlay.setPosition(cx, cy, false); } catch {}
    tabOverlayPos = { x: cx, y: cy };
    if (p >= 1) stopTabOverlayAnim();
  }, 12);
}

function buildTabOverlayTheme() {
  const settings = getSettings();
  return {
    background: settings.background || "#0A1412",
    surface: settings.surface || "#10201D",
    accent: settings.accent || "#E3A857",
    text: "#E4EDE9",
    textDim: "#8FA69E",
    danger: "#E0654F",
    font: settings.fontFamily === "serif"
      ? '"Iowan Old Style", "Georgia", serif'
      : settings.fontFamily === "mono"
        ? '"Cascadia Mono", "Consolas", monospace'
        : '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
    uiScale: settings.uiFontScale || 1,
  };
}

const LINK_TIP_H = 44;
const LINK_TIP_MAX_W = 640;
const LINK_TIP_DELAY_MS = 200;
const LINK_TIP_LEAVE_MS = 70;
const LINK_TIP_FADE_MS = 190;
let linkTipTimer = null;
let linkTipHideTimer = null;
let linkTipShown = false;

function createLinkTipWindow() {
  if (linkTipWindow && !linkTipWindow.isDestroyed()) return linkTipWindow;
  linkTipWindow = new BrowserWindow({
    width: LINK_TIP_MAX_W,
    height: LINK_TIP_H,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    parent: mainWindow,
    modal: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "src", "preload-link-tip.js"),
    },
  });
  linkTipWindow.setIgnoreMouseEvents(true);
  linkTipWindow.loadFile(path.join(__dirname, "src", "link-tip.html"));
  linkTipWindow.on("closed", () => { clearTimeout(linkTipTimer); clearTimeout(linkTipHideTimer); linkTipWindow = null; linkTipShown = false; });
  return linkTipWindow;
}

function placeLinkTip(win) {
  const vb = computeViewBounds();
  const cb = mainWindow.getContentBounds();
  const width = Math.max(120, Math.min(LINK_TIP_MAX_W, vb.width));
  win.setBounds({
    x: Math.round(cb.x + vb.x),
    y: Math.round(cb.y + vb.y + vb.height - LINK_TIP_H),
    width: Math.round(width),
    height: LINK_TIP_H,
  }, false);
}

function showLinkTip(url) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || !mainWindow.isVisible()) return;
  const win = createLinkTipWindow();
  clearTimeout(linkTipHideTimer);
  linkTipShown = true;
  placeLinkTip(win);
  const payload = { url, theme: buildTabOverlayTheme() };
  const go = () => {
    if (win.isDestroyed() || !linkTipShown) return;
    win.webContents.send("linktip:show", payload);
    if (!win.isVisible()) win.showInactive();
  };
  if (win.webContents.isLoading()) win.webContents.once("did-finish-load", go); else go();
}

function hideLinkTip() {
  clearTimeout(linkTipTimer);
  if (!linkTipShown) return;
  linkTipShown = false;
  const win = linkTipWindow;
  if (!win || win.isDestroyed()) return;
  try { win.webContents.send("linktip:hide"); } catch {}
  clearTimeout(linkTipHideTimer);
  linkTipHideTimer = setTimeout(() => {
    if (!linkTipShown && linkTipWindow && !linkTipWindow.isDestroyed()) linkTipWindow.hide();
  }, LINK_TIP_FADE_MS);
}

function hideLinkTipNow() {
  clearTimeout(linkTipTimer);
  clearTimeout(linkTipHideTimer);
  linkTipShown = false;
  if (linkTipWindow && !linkTipWindow.isDestroyed() && linkTipWindow.isVisible()) {
    try { linkTipWindow.webContents.send("linktip:hide"); } catch {}
    linkTipWindow.hide();
  }
}

function onLinkHover(tabId, rawUrl) {
  if (tabId !== activeTabId) return;
  const url = String(rawUrl || "");
  clearTimeout(linkTipTimer);
  if (!url || /^javascript:/i.test(url)) {
    if (linkTipShown) linkTipTimer = setTimeout(hideLinkTip, LINK_TIP_LEAVE_MS);
    return;
  }
  if (linkTipShown) { showLinkTip(url); return; }
  linkTipTimer = setTimeout(() => showLinkTip(url), LINK_TIP_DELAY_MS);
}

function showTabOverlay(payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
  const overlay = createTabOverlayWindow();
  const mode = payload.mode === "context" ? "context" : "preview";
  clearTimeout(tabOverlayHideTimer);

  const contentBounds = mainWindow.getContentBounds();
  const winW = contentBounds.width;
  const winH = contentBounds.height;
  const panelW = mode === "context" ? 158 : 270;
  const panelH = mode === "context" ? 171 : 190;
  const x = Math.max(6, Math.min(Number(payload.x) || 0, Math.max(0, winW - panelW - 6)));
  const y = Math.max(6, Math.min(Number(payload.y) || 0, Math.max(0, winH - panelH - 6)));
  const hostX = Math.max(0, Math.min(x, winW - TAB_OVERLAY_W));
  const hostY = Math.max(0, Math.min(y, winH - TAB_OVERLAY_H));
  const targetX = Math.round(contentBounds.x + hostX);
  const targetY = Math.round(contentBounds.y + hostY);

  const alreadyUp = overlay.isVisible() && tabOverlayShown && tabOverlayMode === "preview";
  const slide = alreadyUp && mode === "preview";
  const fromX = tabOverlayPos ? tabOverlayPos.x : targetX;
  const slideDir = slide ? Math.sign(targetX - fromX) : 0;

  moveTabOverlay(overlay, targetX, targetY, slide);
  if (!overlay.isVisible()) {
    overlay.setAlwaysOnTop(true, "floating");
    overlay.setFocusable(false);
    if (typeof overlay.setSkipTaskbar === "function") overlay.setSkipTaskbar(true);
    overlay.setIgnoreMouseEvents(false);
  }

  const out = {
    mode,
    id: payload.id ?? null,
    title: typeof payload.title === "string" ? payload.title : "",
    memory: typeof payload.memory === "string" ? payload.memory : "",
    favicon: typeof payload.favicon === "string" ? payload.favicon : null,
    actions: Array.isArray(payload.actions) ? payload.actions : undefined,
    animate: slide,
    slideDir,
    theme: buildTabOverlayTheme(),
  };
  if (Object.prototype.hasOwnProperty.call(payload, "preview")) {
    out.preview = typeof payload.preview === "string" && payload.preview.startsWith("data:image/")
      ? payload.preview
      : null;
  }

  tabOverlayShown = true;
  tabOverlayMode = mode;

  const sendPayload = () => {
    if (overlay.isDestroyed() || !tabOverlayShown) return;
    overlay.webContents.send("overlay:update", out);
    if (!overlay.isVisible()) overlay.showInactive();
  };

  if (overlay.webContents.isLoading()) overlay.webContents.once("did-finish-load", sendPayload);
  else sendPayload();
}

async function ensureWhisperContext() {
  if (whisperContext) return whisperContext;
  if (whisperInitPromise) return whisperInitPromise;

  whisperInitPromise = (async () => {
    try {
      if (!whisperModule) {
        whisperModule = require("@fugood/whisper.node");
      }
      const modelDir = path.join(app.getPath("userData"), "models");
      fs.mkdirSync(modelDir, { recursive: true });
      whisperModelPath = path.join(modelDir, WHISPER_MODEL_NAME);

      if (!fs.existsSync(whisperModelPath)) {
        send("speech:status", { status: "downloading-model", message: "Downloading voice model…" });
        const response = await fetch(WHISPER_MODEL_URL);
        if (!response.ok || !response.body) throw new Error(`Model download failed (HTTP ${response.status})`);
        const tmpPath = `${whisperModelPath}.download`;
        await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(tmpPath));
        fs.renameSync(tmpPath, whisperModelPath);
      }

      if (!fs.existsSync(whisperModelPath)) throw new Error(`Voice model was not found at ${whisperModelPath}`);
      const modelSize = fs.statSync(whisperModelPath).size;
      if (modelSize < 1024 * 1024) throw new Error(`Voice model download is incomplete (${modelSize} bytes)`);
      send("speech:status", { status: "loading-model", message: "Loading voice model…" });
      try {
        whisperContext = await whisperModule.initWhisper({ filePath: whisperModelPath, model: whisperModelPath, useGpu: false });
      } catch (cpuError) {
         
         
        whisperContext = await whisperModule.initWhisper({ filePath: whisperModelPath, model: whisperModelPath, useGpu: false }, "default");
      }
      send("speech:status", { status: "ready", message: "Voice recognition ready" });
      return whisperContext;
    } catch (error) {
      whisperContext = null;
      throw error;
    } finally {
      whisperInitPromise = null;
    }
  })();

  return whisperInitPromise;
}

function createMainWindow() {
   
   
   
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const url = details?.requestingUrl || webContents?.getURL?.() || "";
    const ownPage = url.startsWith("file:") || url.startsWith("murky://");
    if (ownPage) return callback(permission === "media");
    const keys = permissionKeysFor(permission, details?.mediaTypes);
    const site = siteFromUrl(url);
    if (!keys || !site) return callback(false);
    resolveSitePermission(site, keys).then(callback).catch(() => callback(false));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const url = details?.requestingUrl || requestingOrigin || webContents?.getURL?.() || "";
    const ownPage = url.startsWith("file:") || url.startsWith("murky://");
    if (ownPage) return permission === "media";
    const mt = details?.mediaType;
    const keys = permissionKeysFor(permission, mt === "video" ? ["video"] : mt === "audio" ? ["audio"] : null);
    const site = siteFromUrl(url);
    if (!keys || !site) return false;
    const perms = getSitePermissions(site.apex);
    return keys.every((k) => perms[k] === "allow");
  });

  const settings = getSettings();

   
   
   
  if (!session.defaultSession.__murkyDevToolsNetworkHook) {
    session.defaultSession.__murkyDevToolsNetworkHook = true;
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      if (devtoolsOpen) {
        const target = activeDevToolsTarget();
        if (target && details.webContentsId === target.view.webContents.id) {
          sendDevTools("devtools:network", {
            type: "request", requestId: details.id, url: details.url, method: details.method, resourceType: details.resourceType, status: 0, uploadData: details.uploadData || []
          });
        }
      }
      callback({});
    });
    session.defaultSession.webRequest.onCompleted((details) => {
      if (!devtoolsOpen) return;
      const target = activeDevToolsTarget();
      if (target && details.webContentsId === target.view.webContents.id) {
        sendDevTools("devtools:network", { type: "response", requestId: details.id, url: details.url, method: details.method, resourceType: details.resourceType, status: details.statusCode, responseHeaders: details.responseHeaders || {} });
      }
    });
    session.defaultSession.webRequest.onErrorOccurred((details) => {
      if (!devtoolsOpen) return;
      const target = activeDevToolsTarget();
      if (target && details.webContentsId === target.view.webContents.id) {
        sendDevTools("devtools:network", { type: "response", requestId: details.id, url: details.url, method: details.method, resourceType: details.resourceType, status: 0, error: details.error });
      }
    });
  }

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 760,
    minHeight: 480,
    backgroundColor: settings.background || "#0A1412",
    frame: false,
    titleBarStyle: "hidden",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));

  mainWindow.webContents.once("did-finish-load", () => { checkForMurkyUpdate(); });
  mainWindow.webContents.once("did-finish-load", () => {
    setTimeout(() => { try { if (mainWindow && !mainWindow.isDestroyed()) createTabOverlayWindow(); } catch {} }, 1200);
    setTimeout(() => { try { if (mainWindow && !mainWindow.isDestroyed()) createLinkTipWindow(); } catch {} }, 1800);
  });

  mainWindow.webContents.on("input-event", (_event, input) => {
    if (input?.type === "mouseDown" && input.button !== 2) {
      if (extensionActionOpen) closeExtensionAction();
    }
  });

  mainWindow.on("resize", () => { hideTabOverlayNow(); hideLinkTipNow(); layoutActiveView(); positionOnboardingWindow(); positionUpdateWindow(); });
  mainWindow.on("blur", () => { hideTabOverlay(); hideLinkTipNow(); });

  mainWindow.on("maximize", () => send("win:state", { maximized: true }));
  mainWindow.on("unmaximize", () => send("win:state", { maximized: false }));
  mainWindow.on("minimize", () => { hideTabOverlayNow(); hideLinkTipNow(); hideOnboardingWindow(); hideUpdateWindow(); });
  mainWindow.on("restore", () => {
    if (!store.get("onboardingCompleted")) showOnboardingWindow(true);
  });
  mainWindow.on("hide", () => { hideTabOverlayNow(); hideLinkTipNow(); hideOnboardingWindow(); hideUpdateWindow(); });
  mainWindow.on("show", () => {
    if (updateInfo && updateWindow && !updateWindow.isDestroyed()) { positionUpdateWindow(); updateWindow.show(); updateWindow.focus(); return; }
    if (!store.get("onboardingCompleted")) showOnboardingWindow(true);
  });

  mainWindow.on("move", () => {
    hideTabOverlayNow();
    hideLinkTipNow();
    positionOnboardingWindow();
    positionUpdateWindow();
     
     
  });

  mainWindow.on("close", () => {
    if (isQuitting) return;
    isQuitting = true;
  });

  setupAdBlock(session.defaultSession);
  setupDownloads(session.defaultSession);

  let firstRunOnboardingOpened = false;
  const openFirstRunOnboarding = () => {
    if (firstRunOnboardingOpened || store.get("onboardingCompleted")) return;
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) firstRunOnboardingOpened = true;
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) { try { mainWindow.show(); } catch {} }
    showOnboardingWindow(true);
  };
  if (!store.get("onboardingCompleted")) { try { createOnboardingWindow(); } catch {} }
  mainWindow.once("ready-to-show", openFirstRunOnboarding);
  mainWindow.webContents.once("did-finish-load", openFirstRunOnboarding);

  mainWindow.webContents.on("did-finish-load", () => {
    if (settings.startupBehavior === "continue") {
      const last = store.get("lastSession") || [];
      const restorable = last.filter((u) => u && u !== "murky://settings" && !String(u).startsWith("murky://site-settings"));
      if (restorable.length) {
        restorable.forEach((u, i) => createTab(u, { activate: i === restorable.length - 1 }));
        return;
      }
    }
    createTab("murky://newtab");
  });

  registerShortcuts();
}

function registerShortcuts() {
  const map = {
    "CommandOrControl+T": () => createTab("murky://newtab"),
    "CommandOrControl+W": () => activeTabId && closeTab(activeTabId),
    "CommandOrControl+L": () => send("ui:focus-address"),
    "CommandOrControl+,": () => openInternalTab("murky://settings"),
    "CommandOrControl+R": () => {
      const t = tabs.get(activeTabId);
      if (t) reloadWc(t.view.webContents);
    },
    "CommandOrControl+Shift+B": () => send("ui:toggle-sidebar"),
    "CommandOrControl+Tab": () => cycleTab(1),
    "CommandOrControl+Shift+Tab": () => cycleTab(-1),
    F11: () => mainWindow.setFullScreen(!mainWindow.isFullScreen()),
    "CommandOrControl+Plus": () => zoom(0.1),
    "CommandOrControl+=": () => zoom(0.1),
    "CommandOrControl+-": () => zoom(-0.1),
    "CommandOrControl+0": () => zoom(0, true),
  };
  for (const [accel, fn] of Object.entries(map)) {
    try {
      globalShortcut.register(accel, fn);
    } catch {
    }
  }
}

function cycleTab(dir) {
  const ids = Array.from(tabs.keys());
  if (ids.length < 2) return;
  const idx = ids.indexOf(activeTabId);
  const next = (idx + dir + ids.length) % ids.length;
  activateTab(ids[next]);
}

function zoom(delta, reset = false) {
  const t = tabs.get(activeTabId);
  if (!t) return;
  const settings = getSettings();
  const current = reset ? 1.0 : (settings.pageZoom || 1.0) + delta;
  const clamped = Math.min(2.5, Math.max(0.5, current));
  settings.pageZoom = clamped;
  store.set("settings", settings);
  t.view.webContents.setZoomFactor(clamped);
  send("settings:update", settings);
}

 
 
 
 
 
 
 
function menuLabel(text) { const target = normalizeLanguage(getSettings().preferredLanguages?.[0] || "en") || "en"; return builtinTranslate(target, text) || text; }
function buildMurkyMenu() {
  return Menu.buildFromTemplate([
    { label: menuLabel("New tab"), click: () => createTab("murky://newtab") },
    { label: menuLabel("Downloads"), click: () => send("ui:open-sidebar-panel", "downloads") },
    { label: menuLabel("Recent Activity"), click: () => send("ui:open-sidebar-panel", "history") },
    { label: menuLabel("Bookmarks"), click: () => send("ui:open-sidebar-panel", "bookmarks") },
  ]);
}

function buildExtensionsMenu() {
  return Menu.buildFromTemplate([
    { label: menuLabel("Extensions"), click: () => openExtensionPopup("list") },
    { label: menuLabel("Manage Extensions"), click: () => { closeExtensionPopup(); openInternalTab("murky://extensions"); } },
  ]);
}

function buildTabContextMenu(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return null;
  return Menu.buildFromTemplate([
    { label: menuLabel("Reload tab"), click: () => tab.view?.webContents && reloadWc(tab.view.webContents) },
    { label: menuLabel("Duplicate tab"), click: () => createTab(tab.url, { activate: true }) },
    { label: menuLabel(tab.isPinned ? "Unpin tab" : "Pin tab"), click: () => {
      tab.isPinned = !tab.isPinned;
      const entries = Array.from(tabs.entries());
      const pinned = entries.filter(([, value]) => value.isPinned);
      const unpinned = entries.filter(([, value]) => !value.isPinned);
      tabs.clear();
      for (const pair of [...pinned, ...unpinned]) tabs.set(pair[0], pair[1]);
      broadcastTabs();
    } },
    { label: menuLabel(tab.isMuted ? "Unmute tab" : "Mute tab"), click: () => {
      tab.isMuted = !tab.isMuted;
      try { tab.view?.webContents.setAudioMuted(tab.isMuted); } catch {}
      broadcastTabs();
    } },
    { type: "separator" },
    { label: menuLabel("Close tab"), click: () => closeTab(tabId) },
  ]);
}

function buildAppMenu() {
  return Menu.buildFromTemplate([
    { label: menuLabel("New tab"), accelerator: "CommandOrControl+T", click: () => createTab("murky://newtab") },
    { label: menuLabel("Close tab"), accelerator: "CommandOrControl+W", click: () => activeTabId && closeTab(activeTabId) },
    { type: "separator" },
    { label: menuLabel("Translate"), enabled: !!activeTabId && !isMurkyInternalWebContents(tabs.get(activeTabId)?.view?.webContents) && !((tabs.get(activeTabId)?.view?.webContents?.getURL?.() || tabs.get(activeTabId)?.url || "").startsWith("file:")) && !isSearchEngineResultUrl(tabs.get(activeTabId)?.view?.webContents?.getURL?.() || tabs.get(activeTabId)?.url || ""), click: () => { reopenTranslationPopup(); } },
    { type: "separator" },
    { label: menuLabel("Zoom out"), accelerator: "CommandOrControl+-", click: () => zoom(-0.1) },
    { label: menuLabel("Reset zoom"), accelerator: "CommandOrControl+0", click: () => zoom(0, true) },
    { label: menuLabel("Zoom in"), accelerator: "CommandOrControl+=", click: () => zoom(0.1) },
    { type: "separator" },
    { label: menuLabel("Toggle sidebar"), accelerator: "CommandOrControl+Shift+B", click: () => send("ui:toggle-sidebar") },
    { label: menuLabel("Murky Settings"), accelerator: "CommandOrControl+,", click: () => openInternalTab("murky://settings") },
    { type: "separator" },
    { label: menuLabel("Privacy Policy"), click: () => openInternalTab("murky://privacy") },
    { label: menuLabel("Terms of Service"), click: () => openInternalTab("murky://terms") },
  ]);
}


const { execFile } = require("child_process");
const HTML_FILE_EXT = new Set([".htm", ".html", ".xhtml", ".shtml"]);
function externalUrlsFromArgv(argv) {
  const out = [];
  const start = app.isPackaged ? 1 : 2;
  for (const raw of (argv || []).slice(start)) {
    const a = String(raw || "").replace(/^"|"$/g, "");
    if (!a || a.startsWith("-")) continue;
    if (/^https?:\/\//i.test(a)) out.push(a);
    else {
      try {
        if (fs.existsSync(a) && HTML_FILE_EXT.has(path.extname(a).toLowerCase())) out.push(pathToFileURL(a).href);
      } catch {}
    }
  }
  return out;
}
let pendingExternalUrls = [];
function openExternalUrl(url) {
  if (!mainWindow || mainWindow.isDestroyed() || !tabs || !tabs.size) { pendingExternalUrls.push(url); return; }
  try { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } catch {}
  createTab(url, { activate: true });
}
function flushExternalUrls() {
  const list = pendingExternalUrls; pendingExternalUrls = [];
  for (const u of list) openExternalUrl(u);
}

function regAdd(key, name, value) {
  return new Promise((resolve) => {
    const args = ["add", key, name ? "/v" : "/ve"];
    if (name) args.push(name);
    args.push("/d", value, "/f");
    execFile("reg", args, { windowsHide: true }, () => resolve());
  });
}
async function registerWindowsBrowserCapabilities() {
  if (process.platform !== "win32") return;
  const exe = process.execPath;
  const cmd = app.isPackaged ? `"${exe}" "%1"` : `"${exe}" "${app.getAppPath()}" "%1"`;
  const base = "HKCU\\Software\\Clients\\StartMenuInternet\\Murky";
  const cap = base + "\\Capabilities";
  const prog = "HKCU\\Software\\Classes\\MurkyHTML";
  await regAdd(prog, null, "Murky HTML Document");
  await regAdd(prog + "\\DefaultIcon", null, `${exe},0`);
  await regAdd(prog + "\\shell\\open\\command", null, cmd);
  await regAdd(base, null, "Murky");
  await regAdd(base + "\\DefaultIcon", null, `${exe},0`);
  await regAdd(base + "\\shell\\open\\command", null, `"${exe}"`);
  await regAdd(cap, "ApplicationName", "Murky");
  await regAdd(cap, "ApplicationDescription", "Murky Browser");
  await regAdd(cap, "ApplicationIcon", `${exe},0`);
  await regAdd(cap + "\\Startmenu", "StartMenuInternet", "Murky");
  await regAdd(cap + "\\URLAssociations", "http", "MurkyHTML");
  await regAdd(cap + "\\URLAssociations", "https", "MurkyHTML");
  await regAdd(cap + "\\FileAssociations", ".htm", "MurkyHTML");
  await regAdd(cap + "\\FileAssociations", ".html", "MurkyHTML");
  await regAdd(cap + "\\FileAssociations", ".xhtml", "MurkyHTML");
  await regAdd("HKCU\\Software\\RegisteredApplications", "Murky", "Software\\Clients\\StartMenuInternet\\Murky\\Capabilities");
}

function regQuery(key, name) {
  return new Promise((resolve) => {
    execFile("reg", ["query", key, "/v", name], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve("");
      const m = String(stdout || "").match(new RegExp(name + "\\s+REG_\\w+\\s+(.+)", "i"));
      resolve(m ? m[1].trim() : "");
    });
  });
}
async function isDefaultBrowser() {
  try {
    if (process.platform === "win32") {
      const base = "HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\";
      const [h, s2] = await Promise.all([regQuery(base + "http\\UserChoice", "ProgId"), regQuery(base + "https\\UserChoice", "ProgId")]);
      return /^MurkyHTML$/i.test(h) && /^MurkyHTML$/i.test(s2);
    }
    return app.isDefaultProtocolClient("https") && app.isDefaultProtocolClient("http");
  } catch { return false; }
}
ipcMain.handle("defaultbrowser:status", () => isDefaultBrowser());
ipcMain.handle("defaultbrowser:set", async () => {
  try {
    if (process.platform === "win32") {
      await registerWindowsBrowserCapabilities();
      try { app.setAsDefaultProtocolClient("http"); app.setAsDefaultProtocolClient("https"); } catch {}
      if (!(await isDefaultBrowser())) {
        try { await shell.openExternal("ms-settings:defaultapps?registeredAppUser=Murky"); }
        catch { try { await shell.openExternal("ms-settings:defaultapps"); } catch {} }
      }
    } else {
      app.setAsDefaultProtocolClient("http");
      app.setAsDefaultProtocolClient("https");
    }
  } catch {}
  return isDefaultBrowser();
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const urls = externalUrlsFromArgv(argv);
    if (!urls.length) { try { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } } catch {} return; }
    urls.forEach(openExternalUrl);
  });
}
app.on("open-url", (event, url) => { event.preventDefault(); openExternalUrl(url); });

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  try { await loadStoredExtensions(); } catch (error) { console.warn("Murky: extension startup failed", error); }
  createMainWindow();
  pendingExternalUrls.push(...externalUrlsFromArgv(process.argv));
  setTimeout(flushExternalUrls, 900);
  registerWindowsBrowserCapabilities().catch(() => {});
});

app.on("window-all-closed", () => {
  globalShortcut.unregisterAll();
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  if (translationEngineServer) { try { translationEngineServer.close(); } catch {} translationEngineServer = null; }
  if (translationEngineWindow && !translationEngineWindow.isDestroyed()) { try { translationEngineWindow.destroy(); } catch {} }
  globalShortcut.unregisterAll();
});

 

const MAX_TABS = 200;
ipcMain.handle("tabs:create", (_e, url) => {
  try {
    const target = typeof url === "string" && url.trim() ? url : "murky://newtab";
    if (tabs.size >= MAX_TABS) {
      const active = tabs.get(activeTabId);
      if (active) return serializeTab(activeTabId);
      throw new Error(`tab limit reached (${MAX_TABS})`);
    }
    return createTab(target);
  } catch (err) {
    console.error("[murky] tabs:create failed:", err);
    throw err;
  }
});

ipcMain.handle("tabs:close", (_e, id) => closeTab(id));
ipcMain.handle("tabs:activate", (_e, id) => activateTab(id));
ipcMain.handle("tabs:list", () => Array.from(tabs.keys()).map(serializeTab));

ipcMain.handle("tabs:reload", (_e, id) => { const t = tabs.get(id); if (t) reloadWc(t.view.webContents); });
ipcMain.on("browser-dialog:show-request", (event, payload) => {
  const sender = event.sender;
  const tab = [...tabs.values()].find((candidate) => candidate.view?.webContents === sender);
  if (!tab || isMurkyInternalWebContents(sender)) return;

  pendingJavaScriptDialogs.set(tab.id, {
    type: payload?.type || "alert",
    resolve: () => {},
  });

  showBrowserDialog({
    tabId: tab.id,
    type: payload?.type || "alert",
    message: String(payload?.message || ""),
    defaultPrompt: String(payload?.defaultPrompt || ""),
    title: tab.title || sender.getTitle() || "",
  });
});

ipcMain.handle("browser-dialog:respond", (_e, payload) => respondToBrowserDialog(payload?.tabId, payload?.accept, payload?.promptText));
ipcMain.handle("browser-dialog:close", () => closeBrowserDialog());
ipcMain.handle("tabs:duplicate", (_e, id) => {
  const t = tabs.get(id);
  return t ? createTab(t.url, { activate: true }) : null;
});
ipcMain.handle("tabs:pin", (_e, id) => {
  const t = tabs.get(id);
  if (!t) return false;
  t.isPinned = !t.isPinned;

   
   
  const entries = Array.from(tabs.entries());
  const pinned = entries.filter(([, value]) => value.isPinned);
  const unpinned = entries.filter(([, value]) => !value.isPinned);
  tabs.clear();
  for (const pair of [...pinned, ...unpinned]) tabs.set(pair[0], pair[1]);

  broadcastTabs();
  return t.isPinned;
});
ipcMain.handle("tabs:mute", (_e, id) => {
  const t = tabs.get(id);
  if (!t) return false;
  t.isMuted = !t.isMuted;
  t.view.webContents.setAudioMuted(t.isMuted);
  broadcastTabs();
  return t.isMuted;
});
ipcMain.handle("tabs:reorder", (_e, ids) => {
  if (!Array.isArray(ids)) return false;
  const current = new Set(tabs.keys());
  if (ids.length !== current.size || ids.some((id) => !current.has(id))) return false;

  const ordered = ids.map((id) => [id, tabs.get(id)]);
  tabs.clear();
  for (const [id, value] of ordered) tabs.set(id, value);
  broadcastTabs();
  return true;
});
const THUMB_WIDTH = 360;
const THUMB_REFRESH_MS = 2500;

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).catch(() => null),
    new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function captureTabThumb(id, { force = false } = {}) {
  const t = tabs.get(id);
  if (!t || !t.view || t.view.webContents.isDestroyed()) return Promise.resolve(false);
  if (!force && id !== activeTabId) return Promise.resolve(false);
  if (t.thumbPending) return t.thumbPending;

  const wc = t.view.webContents;
  t.thumbPending = (async () => {
    try {
      const image = await withTimeout(wc.capturePage(), 900);
      if (!image || image.isEmpty()) return false;
      const size = image.getSize();
      if (size.width < 8 || size.height < 8) return false;
      if (tabs.get(id) !== t) return false;
      t.previewCache = image.resize({ width: THUMB_WIDTH, quality: "good" }).toDataURL();
      t.previewCacheAt = Date.now();
      t.previewCacheUrl = t.url;
      return true;
    } catch {
      return false;
    } finally {
      t.thumbPending = null;
    }
  })();
  return t.thumbPending;
}

function scheduleTabThumb(id, delay = 700) {
  const t = tabs.get(id);
  if (!t) return;
  clearTimeout(t.thumbTimer);
  t.thumbTimer = setTimeout(() => { captureTabThumb(id).catch(() => {}); }, delay);
}

function getTabMemoryBytes(t) {
  try {
    const wc = t?.view?.webContents;
    if (!wc || wc.isDestroyed()) return null;
    const pid = wc.getOSProcessId();
    if (!pid) return null;
    const entry = app.getAppMetrics().find((m) => m.pid === pid);
    const mem = entry?.memory;
    if (!mem) return null;
    const kb = mem.privateBytes || mem.workingSetSize || 0;
    return kb > 0 ? kb * 1024 : null;
  } catch {
    return null;
  }
}

ipcMain.handle("tabs:details", async (_e, id, opts = {}) => {
  const t = tabs.get(id);
  if (!t) return null;

  const light = !!(opts && opts.light);
  if (!light && id === activeTabId && (!t.previewCache || Date.now() - t.previewCacheAt > THUMB_REFRESH_MS)) {
    await captureTabThumb(id);
  }

  const result = {
    id,
    title: t.title || "New Tab",
    url: t.url || "",
    favicon: t.favicon || null,
    memoryBytes: getTabMemoryBytes(t),
    isMuted: !!t.isMuted,
    isPinned: !!t.isPinned,
  };
  if (!light) result.preview = t.previewCache || null;
  return result;
});

ipcMain.handle("nav:go", (_e, { id, target }) => navigateView(id, target));
ipcMain.handle("nav:back", (_e, id) => tabs.get(id)?.view.webContents.goBack());
ipcMain.handle("nav:forward", (_e, id) => tabs.get(id)?.view.webContents.goForward());
ipcMain.handle("nav:reload", (_e, id) => { const t = tabs.get(id); if (t) reloadWc(t.view.webContents); });
ipcMain.handle("nav:stop", (_e, id) => tabs.get(id)?.view.webContents.stop());

ipcMain.handle("downloads:cancel", (_e, id) => {
  const record = activeDownloads.get(id);
  if (!record) return false;
  try {
    record.item.cancel();
    return true;
  } catch {
    return false;
  }
});
ipcMain.handle("downloads:scheduleOpen", (_e, id) => {
  const record = activeDownloads.get(id);
  if (!record) return false;
  record.openWhenDone = true;
  return true;
});
ipcMain.handle("downloads:openPath", (_e, filePath) => {
  if (!filePath || typeof filePath !== "string" || !path.isAbsolute(filePath)) return false;
  try {
    openDownloadedFile({ savePath: filePath });
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("settings:get", () => ({ ...getSettings(), currentVersion: app.getVersion() }));
ipcMain.handle("trust:info", () => trustSnapshot());
ipcMain.handle("trust:requests", () => outboundRequestLog.slice(-MAX_OUTBOUND_REQUEST_LOG));
ipcMain.handle("trust:exportRequests", async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Export outbound request log",
    defaultPath: `Murky-request-log-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, JSON.stringify({ exportedAt: new Date().toISOString(), browser: trustSnapshot(), requests: outboundRequestLog }, null, 2), "utf8");
  return true;
});
ipcMain.handle("trust:exportLocalData", async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Export local data",
    defaultPath: `Murky-local-data-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, JSON.stringify({ exportedAt: new Date().toISOString(), browser: trustSnapshot(), settings: getSettings(), history: store.get("history") || [], bookmarks: store.get("bookmarks") || [] }, null, 2), "utf8");
  return true;
});
ipcMain.handle("trust:exportHistory", async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Export browsing history",
    defaultPath: `Murky-history-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, JSON.stringify(store.get("history") || [], null, 2), "utf8");
  return true;
});
ipcMain.handle("trust:checkUpdates", async () => {
  await checkForMurkyUpdate();
  return trustSnapshot();
});
ipcMain.handle("settings:openTab", () => {
  return openInternalTab("murky://settings");
});
ipcMain.handle("legal:open", (_e, which) => {
  const target = which === "terms" ? "murky://terms" : which === "privacy" ? "murky://privacy" : null;
  return target ? openInternalTab(target) : null;
});
let browserMigration = null;
function getBrowserMigration() {
  if (!browserMigration) browserMigration = require(path.join(__dirname, "src", "browser-migration.js"));
  return browserMigration;
}
let migrationRunning = false;
ipcMain.handle("onboarding:migrationSource", async () => {
  try { return await getBrowserMigration().getSource(); }
  catch { return { available: false, id: null, name: "", isDefault: false }; }
});
ipcMain.handle("onboarding:migrate", async (event, id) => {
  if (migrationRunning) return { ok: false, error: "busy" };
  migrationRunning = true;
  const sender = event.sender;
  const push = (payload) => { try { if (!sender.isDestroyed()) sender.send("onboarding:migrate-progress", payload); } catch {} };
  try {
    return await getBrowserMigration().migrate(String(id || ""), {
      progress: (percent, phase, detail) => push({ percent, phase, ...detail }),
      importBookmarks: (list) => {
        const current = (Array.isArray(store.get("bookmarks")) ? store.get("bookmarks") : []).map(normalizeBookmark);
        const seen = new Set(current.map((b) => b.url));
        const add = [];
        for (const b of list) {
          if (!b || !b.url || seen.has(b.url)) continue;
          seen.add(b.url);
          add.push(normalizeBookmark({ title: b.title, url: b.url, createdAt: b.createdAt }));
        }
        const merged = [...current, ...add].slice(0, 2000);
        store.set("bookmarks", merged);
        try { broadcastToTabs("bookmarks:update", merged); } catch {}
      },
      importHistory: (list) => {
        const current = Array.isArray(store.get("history")) ? store.get("history") : [];
        const keyOf = (h) => (h && h.type === "search" ? "s:" + h.query : "p:" + (h && h.url));
        const seen = new Set(current.filter(Boolean).map(keyOf));
        const add = [];
        for (const h of list) {
          if (!h || (h.type === "search" ? !h.query : !h.url)) continue;
          const k = keyOf(h);
          if (seen.has(k)) continue;
          seen.add(k);
          add.push(h.type === "search" ? { type: "search", query: h.query, title: h.query, url: "", ts: h.ts } : { type: "page", url: h.url, title: h.title || h.url, favicon: null, ts: h.ts });
        }
        store.set("history", [...current, ...add].sort((a, b) => (b?.ts || 0) - (a?.ts || 0)).slice(0, 2000));
      },
      setCookie: (details) => session.defaultSession.cookies.set(details),
    });
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  } finally {
    migrationRunning = false;
  }
});
ipcMain.handle("onboarding:get", () => !!store.get("onboardingCompleted"));
ipcMain.handle("onboarding:complete", () => {
  store.set("onboardingCompleted", true);
  hideOnboardingWindow();
  return true;
});
ipcMain.handle("onboarding:reset", () => {
  store.set("onboardingCompleted", false);
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.webContents.send("onboarding:reset", getSettings());
  }
  showOnboardingWindow(true);
  return true;
});
ipcMain.handle("update:getSettings", () => ({ ...getSettings(), currentVersion: app.getVersion(), newVersion: updateInfo?.version || null }));
ipcMain.handle("update:start", async () => {
  if (!updateInfo || !updateInfo.release) return false;
  if (updateDownloadStarted) return true;
  updateDownloadStarted = true;

  const release = updateInfo.release;
  const asset = Array.isArray(release.assets)
    ? release.assets.find((a) => /\.exe$/i.test(String(a.name || "")) && /setup|installer|win/i.test(String(a.name || "")))
      || release.assets.find((a) => /\.exe$/i.test(String(a.name || "")))
    : null;

  if (!asset?.browser_download_url) {
    updateDownloadStarted = false;
    sendUpdateState({
      status: "The update installer could not be found.",
      button: "Update",
      disabled: false,
    });
    return false;
  }

  const target = path.join(app.getPath("temp"), `Murky-${updateInfo.version}-Windows-Setup.exe`);
  sendUpdateState({ status: "Downloading update…", button: "Downloading…", disabled: true });

  try {
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(target);
      const request = https.get(asset.browser_download_url, {
        headers: { "User-Agent": "Murky-Browser", "Accept": "application/octet-stream" },
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          try { fs.unlinkSync(target); } catch {}
          https.get(res.headers.location, {
            headers: { "User-Agent": "Murky-Browser", "Accept": "application/octet-stream" },
          }, (r2) => {
            if (r2.statusCode !== 200) {
              reject(new Error(`Download returned ${r2.statusCode}`));
              return;
            }
            const out = fs.createWriteStream(target);
            r2.pipe(out);
            out.on("finish", () => out.close(resolve));
            out.on("error", reject);
          }).on("error", reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download returned ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", reject);
      });
      request.on("error", reject);
      request.setTimeout(30000, () => request.destroy(new Error("Download timed out")));
    });

    sendUpdateState({ status: "Installing update…", button: "Updating…", disabled: true });
    setTimeout(() => {
      try {
        isQuitting = true;
        const child = spawn(target, ["/S"], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        child.unref();
      } finally {
        app.quit();
      }
    }, 250);

    return true;
  } catch (error) {
    updateDownloadStarted = false;
    try { fs.unlinkSync(target); } catch {}
    sendUpdateState({
      status: "The update could not be downloaded. Try again.",
      button: "Update",
      disabled: false,
    });
    console.warn("Murky update download failed:", error?.message || error);
    return false;
  }
});

ipcMain.handle("onboarding:legal", (_e, which) => {
  const target = which === "terms" ? "murky://terms" : which === "privacy" ? "murky://privacy" : null;
  if (!target) return false;
  openInternalTab(target);
  if (onboardingWindow && !onboardingWindow.isDestroyed()) onboardingWindow.focus();
  return true;
});
ipcMain.handle("onboarding:theme", (_e, key) => {
  const themes = {
    "murky-deep": { background: "#0A1412", surface: "#10201D", accent: "#E3A857" },
    "murky-tide": { background: "#081A1E", surface: "#0E323B", accent: "#6FCF97" },
    "murky-ink": { background: "#0B0B10", surface: "#1B1B24", accent: "#8E8CD8" },
    "midnight-amber": { background: "#120A05", surface: "#241207", accent: "#F2A65A" },
    "murky-storm": { background: "#0A0E14", surface: "#151E2A", accent: "#7EA8D8" },
    "murky-moss": { background: "#0B120A", surface: "#182417", accent: "#9BC46B" },
    "murky-rose": { background: "#150A0F", surface: "#2A121C", accent: "#E38FA6" },
    "murky-slate": { background: "#0E1012", surface: "#1C2024", accent: "#B7BEC7" },
  };
  if (!Object.prototype.hasOwnProperty.call(themes, key)) return false;
  const t = themes[key];
  const previous = getSettings();
  const merged = { ...previous, theme: key, background: t.background, surface: t.surface, accent: t.accent };
  store.set("settings", merged);
  layoutActiveView();
  send("settings:update", merged);
  broadcastToTabs("settings:update", merged);
  applyPageScrollbarThemeToAllTabs();
  if (onboardingWindow && !onboardingWindow.isDestroyed()) onboardingWindow.webContents.send("onboarding:settings", merged);
  sendDevTools("devtools:settings", merged);
  if (translationPopupView && !translationPopupView.webContents.isDestroyed()) translationPopupView.webContents.send("translate:theme", merged);
  if (extensionPopupView && !extensionPopupView.webContents.isDestroyed()) extensionPopupView.webContents.send("extensions:settings", merged);
  sendSiteInfoTheme();
  if (updateWindow && !updateWindow.isDestroyed()) updateWindow.webContents.send("update:settings", merged);
  return merged;
});
ipcMain.handle("language:getSupported", () => MURKY_LANGUAGES.filter(([code]) => code === "en" || TRANSLATABLE_EN_TARGETS.has(code)).map(([code,name]) => ({ code, name })));
ipcMain.handle("language:translateText", (_e, texts) => {
  const target=normalizeLanguage(getSettings().preferredLanguages?.[0] || "en") || "en";
  const list=Array.isArray(texts)?texts:[];
  return list.map(text=>localizeMurkyText(target,String(text??"")));
});
ipcMain.handle("language:add", async (_e, code) => {
  const lang=normalizeLanguage(code); if(!lang) return getSettings().preferredLanguages || ["en"];
  const current=(getSettings().preferredLanguages||[]).map(normalizeLanguage).filter(Boolean);
  if(current.includes(lang)) return current;
  if(current.length>=5) return current;
  const next=[...current,lang];
  return (await (async()=>{ const previous=getSettings(); const merged={...previous,preferredLanguages:next}; store.set("settings",merged); layoutActiveView(); send("settings:update",merged); broadcastToTabs("settings:update",merged); applyPageScrollbarThemeToAllTabs(); if(onboardingWindow&&!onboardingWindow.isDestroyed()) onboardingWindow.webContents.send("onboarding:settings",merged); translateInternalPages().catch(()=>{}); return next; })());
});
ipcMain.handle("language:remove", async (_e, code) => {
  const lang=normalizeLanguage(code); const current=(getSettings().preferredLanguages||[]).map(normalizeLanguage).filter(x=>x&&x!==lang); if(!current.length) return getSettings().preferredLanguages||["en"];
  const previous=getSettings(); const merged={...previous,preferredLanguages:current}; store.set("settings",merged); layoutActiveView(); send("settings:update",merged); broadcastToTabs("settings:update",merged); applyPageScrollbarThemeToAllTabs(); translateInternalPages().catch(()=>{}); return current;
});
ipcMain.handle("language:reorder", (_e, codes) => {
  const current=(getSettings().preferredLanguages||[]).map(normalizeLanguage).filter(Boolean); const next=Array.isArray(codes)?codes.map(normalizeLanguage).filter(c=>c&&current.includes(c)).slice(0,5):current;
  if(next.length!==current.length) return current; const merged={...getSettings(),preferredLanguages:next}; store.set("settings",merged); layoutActiveView(); send("settings:update",merged); broadcastToTabs("settings:update",merged); applyPageScrollbarThemeToAllTabs(); translateInternalPages().catch(()=>{}); return next;
});
ipcMain.on("language:popup-close", () => closeTranslationPopup(true));
ipcMain.handle("language:restore", async () => {
  const tabId = activeTabId;
  const t = tabs.get(tabId);
  if (!t || !t.view || t.view.webContents.isDestroyed()) return false;
  const key = murkyTranslationStateKey(t.view.webContents);
  murkyAutoTranslate.on = false;
  murkyTranslationPageState.delete(key);
  try {
    reloadWc(t.view.webContents);
    return true;
  } catch (_) { return false; }
});
ipcMain.handle("language:translate", async () => {
  if(!translationOffer) return false;
  const tabId = activeTabId;
  const offer = translationOffer;
  const t = tabs.get(tabId); if(!t) return false;
  const preferred=getSettings().preferredLanguages||["en"];
  if(!canBergamotTranslate(offer.detectedCode, preferred[0])) return false;

  murkyTranslationTasks.set(tabId, {
    status: "translating",
    offer: { ...offer, translated: false, translating: true },
  });
  translationOffer = { ...offer, translated: false, translating: true };
  if (translationPopupView && !translationPopupView.webContents.isDestroyed()) {
    translationPopupView.webContents.send("translate:offer", translationOffer);
  }

  const ok = await translateWebContents(t.view.webContents, offer.detectedCode, preferred);
  if (ok) murkyAutoTranslate.on = true;
  if (ok && tabs.has(tabId)) {
    murkyTranslationPageState.set(murkyTranslationStateKey(t.view.webContents), { translated:true, detectedCode:offer.detectedCode, targetCode:preferred[0] });
  }

  murkyTranslationTasks.set(tabId, {
    status: ok ? "done" : "failed",
    offer: { ...offer, translated: !!ok, translating: false },
  });

  if (activeTabId === tabId && tabs.has(tabId) && translationPopupView && !translationPopupView.webContents.isDestroyed()) {
    const currentOffer = {...offer, translated: !!ok, translating: false};
    translationOffer = currentOffer;
    translationPopupView.webContents.send("translate:offer", currentOffer);
  }
  return ok;
});
ipcMain.handle("onboarding:language", (_e, code) => {
  const lang=normalizeLanguage(code)||"en"; const merged={...getSettings(),preferredLanguages:[lang]}; store.set("settings",merged); layoutActiveView(); send("settings:update",merged); broadcastToTabs("settings:update",merged); applyPageScrollbarThemeToAllTabs(); if(onboardingWindow&&!onboardingWindow.isDestroyed()) onboardingWindow.webContents.send("onboarding:settings",merged); return merged;
});
ipcMain.on("settings:preview-toolbar-scale", (_event, value) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const scale = Math.max(0.8, Math.min(1.2, Number(value) || 1));
  toolbarScalePreview = scale;
  if (mainWindow && !mainWindow.isDestroyed()) {
    const js = `(() => {
      const v=${JSON.stringify(scale)};
      document.documentElement.style.setProperty("--toolbar-scale", String(v));
      document.documentElement.style.setProperty("--toolbar-h", (44*v)+"px");
      const t=document.getElementById("toolbar");
      if(t){t.style.height=(44*v)+"px";t.style.minHeight=(44*v)+"px";}
      if(typeof window.__murkyApplyToolbarScale === "function") window.__murkyApplyToolbarScale(v);
    })()`;
    mainWindow.webContents.executeJavaScript(js).catch(() => {});
  }
  send("toolbar:preview-scale", scale);
  layoutActiveView();
});

ipcMain.on("settings:commit-toolbar-scale-preview", () => {
  toolbarScalePreview = null;
  layoutActiveView();
});

const COLOR_ONLY_SETTING_KEYS = new Set(["accent", "background", "surface", "theme", "backgroundImage", "backgroundFit"]);
let scrollbarThemeTimer = null;
function applyPageScrollbarThemeSoon() {
  clearTimeout(scrollbarThemeTimer);
  scrollbarThemeTimer = setTimeout(() => applyPageScrollbarThemeToAllTabs(), 180);
}
ipcMain.handle("settings:set", (_e, partial) => {
  const colorOnly = !!partial && Object.keys(partial).length > 0 && Object.keys(partial).every((k) => COLOR_ONLY_SETTING_KEYS.has(k));
  if (!colorOnly) toolbarScalePreview = null;
  const previous = getSettings();
  const merged = { ...previous, ...partial };
  if (merged.fontFamily === "rounded") merged.fontFamily = "system";
  store.set("settings", merged);
  if (!colorOnly) layoutActiveView();
  send("settings:update", merged);
  broadcastToTabs("settings:update", merged);
  if (colorOnly) applyPageScrollbarThemeSoon(); else applyPageScrollbarThemeToAllTabs();
  if (onboardingWindow && !onboardingWindow.isDestroyed()) onboardingWindow.webContents.send("onboarding:settings", merged);
  sendDevTools("devtools:settings", merged);
  if (extensionPopupView && !extensionPopupView.webContents.isDestroyed()) extensionPopupView.webContents.send("extensions:settings", merged);
  sendSiteInfoTheme();
  if (updateWindow && !updateWindow.isDestroyed()) updateWindow.webContents.send("update:settings", merged);

   
   
  if ("preferredLanguages" in partial) {
    closeTranslationPopup();
     
     
     
    murkyInternalTranslationGeneration++;
    translateInternalPages().catch(() => {});
  }

  if ("pageZoom" in partial) {
    for (const t of tabs.values()) {
      if (!t.view.webContents.isDestroyed()) t.view.webContents.setZoomFactor(merged.pageZoom || 1.0);
    }
  }

  return merged;
});
ipcMain.handle("settings:reset", (_e, keys) => {
  const previous = getSettings();
  const merged = { ...previous };
  const source = Array.isArray(keys) && keys.length ? keys : Object.keys(DEFAULT_SETTINGS);
  for (const key of source) {
    if (key in DEFAULT_SETTINGS) merged[key] = DEFAULT_SETTINGS[key];
  }
  store.set("settings", merged);
  layoutActiveView();
  send("settings:update", merged);
  broadcastToTabs("settings:update", merged);
  applyPageScrollbarThemeToAllTabs();
  sendDevTools("devtools:settings", merged);
  if (extensionPopupView && !extensionPopupView.webContents.isDestroyed()) extensionPopupView.webContents.send("extensions:settings", merged);
  sendSiteInfoTheme();
  for (const t of tabs.values()) {
    if (!t.view.webContents.isDestroyed()) t.view.webContents.setZoomFactor(merged.pageZoom || 1.0);
  }
  return merged;
});

ipcMain.handle("speech:recognize", async (_e, payload = {}) => {
  const pcm = payload.pcm;
  const languageCode = String(payload.languageCode || "en-US");
  if (!pcm) return { ok: false, error: "missing-audio" };

  try {
    const context = await ensureWhisperContext();
    const input = pcm instanceof ArrayBuffer
      ? pcm
      : (ArrayBuffer.isView(pcm) ? pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) : null);
    if (!input) return { ok: false, error: "invalid-audio" };

    const language = languageCode.toLowerCase().startsWith("tr") ? "tr" : "en";
    const { promise } = context.transcribeData(input, {
      language,
      temperature: 0,
      maxThreads: Math.min(8, Math.max(2, require("os").cpus().length || 4)),
      translate: false,
    });
    const result = await promise;
    const rawTranscript = typeof result === "string"
      ? result
      : String(result?.result || result?.text || result?.transcription || "");
    let transcript = rawTranscript.trim();
    transcript = transcript
      .replace(/\[(?:blank\s*audio|music|applause|laughter|laughing|silence|inaudible|noise|sound effect|sfx)[^\]]*\]/gi, " ")
      .replace(/<\|(?:nospeech|endoftext)\|>/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (/^(?:\[[^\]]+\]|(?:blank audio|music|applause|laughter|silence|inaudible|noise))$/i.test(transcript)) transcript = "";
    return { ok: true, transcript };
  } catch (error) {
    return { ok: false, error: error?.message || "Local Whisper recognition failed" };
  }
});

 
function normalizeBookmark(bookmark) {
  const bm = bookmark && typeof bookmark === "object" ? bookmark : {};
  return {
    id: String(bm.id || `bm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`),
    title: String(bm.title || bm.url || "Bookmark"),
    url: String(bm.url || ""),
    favicon: bm.favicon ? String(bm.favicon) : null,
    createdAt: Number.isFinite(bm.createdAt) ? bm.createdAt : Date.now(),
  };
}

ipcMain.handle("bookmarks:list", () => {
  const bookmarks = Array.isArray(store.get("bookmarks")) ? store.get("bookmarks") : [];
  const normalized = bookmarks
    .map(normalizeBookmark)
    .filter((bm) => bm.url);
   
  if (JSON.stringify(normalized) !== JSON.stringify(bookmarks)) {
    store.set("bookmarks", normalized);
  }
  return normalized;
});

ipcMain.handle("bookmarks:add", (_e, bookmark) => {
  const bm = normalizeBookmark(bookmark);
  if (!bm.url) return store.get("bookmarks");

  const bookmarks = Array.isArray(store.get("bookmarks")) ? store.get("bookmarks") : [];
  const existing = bookmarks.findIndex((item) => item?.url === bm.url);
  if (existing >= 0) {
     
    bm.id = String(bookmarks[existing]?.id || bm.id);
    bookmarks.splice(existing, 1);
  }
  bookmarks.unshift(bm);
  const result = bookmarks.slice(0, 2000);
  store.set("bookmarks", result);
  return result;
});

ipcMain.handle("bookmarks:remove", (_e, id) => {
  const target = String(id || "");
  const bookmarks = Array.isArray(store.get("bookmarks")) ? store.get("bookmarks") : [];
  const result = bookmarks.filter((bm) => String(bm?.id || "") !== target);
  store.set("bookmarks", result);
  return result;
});

ipcMain.handle("history:list", () => {
  const history = Array.isArray(store.get("history")) ? store.get("history") : [];
  return history
    .filter((h) => h && (h.type === "search" ? h.query : h.url))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
});

ipcMain.handle("history:addSearch", (_e, query) => {
  const q = String(query || "").trim();
  if (!q) return store.get("history");
  const history = store.get("history").filter((h) => !(h.type === "search" && h.query === q));
  history.unshift({ type: "search", query: q, title: q, url: "", ts: Date.now() });
  store.set("history", history.slice(0, 2000));
  return history;
});

ipcMain.handle("history:removeSearch", (_e, query) => {
  const q = String(query || "").trim();
  if (!q) return store.get("history");
  const history = (Array.isArray(store.get("history")) ? store.get("history") : [])
    .filter((h) => !(h?.type === "search" && String(h?.query || "").trim() === q));
  store.set("history", history.slice(0, 2000));
  return history;
});
const mainTrendingCache = new Map();
ipcMain.handle("search:trending", async (_e, payload = {}) => {
  const engine = String(payload?.engine || getSettings().searchEngine || "duckduckgo").toLowerCase();
  const lang = String(getSettings().preferredLanguages?.[0] || "en").toLowerCase().split("-")[0];
  const geo = lang === "tr" ? "TR" : lang === "de" ? "DE" : lang === "fr" ? "FR" : "US";
  const cacheKey = `${engine}:${geo}`;
  const cached = mainTrendingCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000 && cached.values?.length) return cached.values;
  const urls = {
    google: `https://trends.google.com/trending/rss?geo=${geo}`,
    bing: `https://www.bing.com/news/trendingtopics?format=rss&cc=${geo}`,
    duckduckgo: `https://trends.google.com/trending/rss?geo=${geo}`,
    startpage: `https://trends.google.com/trending/rss?geo=${geo}`,
    ecosia: `https://trends.google.com/trending/rss?geo=${geo}`,
  };
  const url = urls[engine] || urls.google;
  try {
    const response = await fetch(url, { headers: { "Accept": "application/rss+xml, application/xml, text/xml, */*", "Accept-Language": `${lang},en;q=0.8` } });
    if (!response.ok) return [];
    const text = await response.text();
    const values = [];
    const re = /<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>[\s\S]*?<\/item>/gi;
    let m;
    while ((m = re.exec(text)) && values.length < 12) {
      const v = String(m[1] || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
      if (v && !/^daily search trends$/i.test(v) && !values.includes(v)) values.push(v);
    }
    const result = values.slice(0, 8);
    if (result.length) mainTrendingCache.set(cacheKey, { values: result, at: Date.now() });
    return result.length ? result : (cached?.values || []);
  } catch { return cached?.values || []; }
});

ipcMain.handle("search:suggestions", async (_e, payload = {}) => {
  const query = String(payload?.query || "").trim();
  const settings = getSettings();
  const engine = String(payload?.engine || settings.searchEngine || "duckduckgo");
  if (!query) return [];

  const preferred = String(settings.preferredLanguages?.[0] || "en").toLowerCase();
  const lang2 = preferred.split("-")[0];
  const tr = lang2 === "tr";
  const endpoints = {
    duckduckgo: `https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&kl=${tr ? "tr-tr" : "wt-wt"}`,
    google: `https://suggestqueries.google.com/complete/search?client=firefox&hl=${encodeURIComponent(lang2)}&q=${encodeURIComponent(query)}`,
    bing: `https://www.bing.com/osjson.aspx?query=${encodeURIComponent(query)}&cc=${encodeURIComponent(lang2)}`,
    ecosia: `https://ac.ecosia.org/autocomplete?q=${encodeURIComponent(query)}&country=${encodeURIComponent(lang2)}`,
  };
  const url = endpoints[engine] || endpoints.duckduckgo;
  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Accept-Charset": "utf-8",
        "Accept-Language": tr ? "tr-TR,tr;q=0.9,en;q=0.7" : `${lang2},en;q=0.7`,
      }
    });
    if (!response.ok) return [];
    const bytes = new Uint8Array(await response.arrayBuffer());

     
     
    let text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (text.includes("\uFFFD") && tr) {
      const legacy = new TextDecoder("windows-1254", { fatal: false }).decode(bytes);
      if (legacy.split("\uFFFD").length < text.split("\uFFFD").length) text = legacy;
    }
    const data = JSON.parse(text);
    let values = [];
    if (engine === "duckduckgo") values = Array.isArray(data) ? data.map(x => x?.phrase || x).filter(Boolean) : [];
    else if (engine === "ecosia") values = Array.isArray(data) ? data : (Array.isArray(data?.suggestions) ? data.suggestions : []);
    else values = Array.isArray(data?.[1]) ? data[1] : [];
    values = [...new Set(values.map(v => String(v).trim()).filter(Boolean))];

     
     
     
     
    if (tr && values.some(v => v.includes("\uFFFD") || v.includes("<?>"))) {
      try {
        const fallbackUrl = `https://suggestqueries.google.com/complete/search?client=firefox&hl=tr&q=${encodeURIComponent(query)}`;
        const fallbackResponse = await fetch(fallbackUrl, { headers: { "Accept": "application/json", "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.7" } });
        if (fallbackResponse.ok) {
          const fallbackData = JSON.parse(await fallbackResponse.text());
          if (Array.isArray(fallbackData?.[1])) values = fallbackData[1].map(v => String(v).trim()).filter(Boolean);
        }
      } catch {}
    }
    return [...new Set(values)].slice(0, 8);
  } catch {
    return [];
  }
});

ipcMain.handle("history:clear", () => {
  store.set("history", []);
  return [];
});
ipcMain.handle("privacy:purge", async () => {
  store.set("history", []);
  store.set("bookmarks", []);
  store.set("lastSession", []);
  outboundRequestLog.splice(0, outboundRequestLog.length);
  pendingOutboundRequests.clear();
  try { await session.defaultSession.clearStorageData({ storages: ["appcache", "cookies", "filesystem", "indexdb", "localstorage", "shadercache", "serviceworkers", "cachestorage", "websql"], quotas: ["temporary", "persistent", "syncable"] }); } catch {}
  try { await session.defaultSession.clearCache(); } catch {}
  return true;
});

ipcMain.handle("win:minimize", () => mainWindow.minimize());
ipcMain.handle("win:toggleMaximize", () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle("win:close", () => mainWindow.close());
ipcMain.handle("win:isMaximized", () => mainWindow.isMaximized());

ipcMain.handle("shell:openExternal", (_e, url) => shell.openExternal(url));

 

ipcMain.handle("devtools:close", () => {
  closeMurkyDevTools();
  return true;
});

ipcMain.handle("devtools:eval", async (_event, code) => {
  const target = activeDevToolsTarget();
  if (!target) throw new Error("Developer Tools are unavailable on this page.");
  return await target.view.webContents.executeJavaScript(String(code || ""), true);
});

ipcMain.handle("devtools:elements", async (_event, query = "", focusPath = null) => {
  const target = activeDevToolsTarget();
  if (!target) return { root: null, count: 0 };
  const q = JSON.stringify(String(query || ""));
  const fpJson = JSON.stringify(Array.isArray(focusPath) ? focusPath.map(Number) : null);
  return await target.view.webContents.executeJavaScript(`(() => {
    const q = ${q}.trim().toLowerCase();
    const fp = ${fpJson};
    let count = 0; const MAX_NODES = 1600; const MAX_DEPTH = 24;
    const pathFor = (el) => { const out=[]; let n=el; while(n && n.nodeType===1){ const p=n.parentElement; if(!p){out.unshift(0);break;} out.unshift(Array.prototype.indexOf.call(p.children,n)); n=p; } return out; };
    const matches = (el) => { if (!q) return false; const attrs = el.attributes ? Array.from(el.attributes).map(a => a.name + '=' + a.value).join(' ') : ''; return ('<' + el.tagName.toLowerCase() + ' ' + attrs + ' ' + (el.textContent||'') + '>').toLowerCase().includes(q); };
    const build = (el, depth=0, onPath=!!fp && fp[0]===0) => { if (!el) return null; if (!onPath && (depth > MAX_DEPTH || count >= MAX_NODES)) return null; count++; const attrs=el.attributes?Array.from(el.attributes).map(a=>({name:a.name,value:a.value})):[]; const children=[]; const kids=el.children||[]; for(let i=0;i<kids.length;i++){const cp=onPath && fp.length>depth+1 && fp[depth+1]===i; const item=build(kids[i],depth+1,cp);if(item)children.push(item);if(count>=MAX_NODES && !(onPath && fp.length>depth+1 && fp[depth+1]>i))break;} const text=Array.from(el.childNodes||[]).filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent.trim()).filter(Boolean).join(' '); return {tag:el.tagName.toLowerCase(),attrs,text:text.slice(0,180),children,match:matches(el),depth,path:pathFor(el)}; };
    return {root:build(document.documentElement),count,truncated:count>=MAX_NODES};
  })()`, true);
});

ipcMain.handle("devtools:copy", async (_event, text = "") => {
  clipboard.writeText(String(text ?? ""));
  return true;
});

ipcMain.handle("devtools:inspect", async (_event, request = {}) => {
  const target = activeDevToolsTarget();
  if (!target) return null;
  return await resolveDevToolsInspectTarget(target, request);
});

ipcMain.handle("devtools:elementGet", async (_event, pathValue) => {
  const target=activeDevToolsTarget(); if(!target) return null; const path=Array.isArray(pathValue)?pathValue.map(Number):[];
  return await target.view.webContents.executeJavaScript(`(() => { const path=${JSON.stringify(path)}; let e=document.documentElement; for(let i=1;i<path.length;i++){e=e?.children?.[path[i]];if(!e)return null;} if(!e)return null; const r=e.getBoundingClientRect(),s=getComputedStyle(e); return {tag:e.tagName.toLowerCase(),selector:e.id?('#'+CSS.escape(e.id)):'',outerHTML:e.outerHTML,textContent:e.textContent||'',attrs:Array.from(e.attributes).map(a=>({name:a.name,value:a.value})),box:{x:r.x,y:r.y,width:r.width,height:r.height},style:{display:s.display,position:s.position,width:s.width,height:s.height,color:s.color,backgroundColor:s.backgroundColor,fontSize:s.fontSize,fontWeight:s.fontWeight,margin:s.margin,padding:s.padding}}; })()`, true);
});

ipcMain.handle("devtools:elementSet", async (_event, payload = {}) => {
  const target=activeDevToolsTarget(); if(!target) throw new Error("No active page."); const path=Array.isArray(payload.path)?payload.path.map(Number):[]; const action=String(payload.action||""); if(!path.length) throw new Error("Invalid element path."); const safe=JSON.stringify({path,action,name:String(payload.name||""),value:String(payload.value??"")});
  return await target.view.webContents.executeJavaScript(`(() => { const p=${safe}; let e=document.documentElement; for(let i=1;i<p.path.length;i++){e=e?.children?.[p.path[i]];if(!e)throw new Error('Element no longer exists.');} if(p.action==='textContent')e.textContent=p.value; else if(p.action==='outerHTML')e.outerHTML=p.value; else if(p.action==='setAttribute'){if(!p.name)throw new Error('Attribute name required.');e.setAttribute(p.name,p.value);} else if(p.action==='removeAttribute')e.removeAttribute(p.name); else if(p.action==='setStyle'){if(!p.name)throw new Error('Style property required.');e.style[p.name]=p.value;} else if(p.action==='removeStyle'){if(!p.name)throw new Error('Style property required.');e.style[p.name]='';} else throw new Error('Unknown element edit.'); return true; })()`, true);
});

ipcMain.handle("devtools:storage", async () => {
  const target = activeDevToolsTarget();
  if (!target) return { localStorage: {}, sessionStorage: {}, cookies: "" };
  return await target.view.webContents.executeJavaScript(`(() => {
    const dump = (s) => Object.fromEntries(Object.keys(s).map(k => [k, s.getItem(k)]));
    return { localStorage: dump(localStorage), sessionStorage: dump(sessionStorage), cookies: document.cookie || "" };
  })()`, true);
});

ipcMain.handle("devtools:performance", async () => {
  const target = activeDevToolsTarget();
  if (!target) return {};
  return await target.view.webContents.executeJavaScript(`(() => {
    const n = performance.getEntriesByType("navigation")[0];
    const out = {
      "URL": location.href,
      "DOM ready": n ? Math.round(n.domContentLoadedEventEnd) + " ms" : "n/a",
      "Load": n ? Math.round(n.loadEventEnd) + " ms" : "n/a",
      "DNS": n ? Math.round(n.domainLookupEnd - n.domainLookupStart) + " ms" : "n/a",
      "TCP": n ? Math.round(n.connectEnd - n.connectStart) + " ms" : "n/a",
      "Response": n ? Math.round(n.responseEnd - n.responseStart) + " ms" : "n/a",
      "Resources": performance.getEntriesByType("resource").length
    };
    if (performance.memory) out["JS heap"] = Math.round(performance.memory.usedJSHeapSize/1048576*10)/10 + " MB / " + Math.round(performance.memory.jsHeapSizeLimit/1048576) + " MB";
    return out;
  })()`, true);
});

async function devToolsDebuggerCommand(target, method, params = {}) {
  if (!target?.view?.webContents || target.view.webContents.isDestroyed()) throw new Error("Developer Tools target is unavailable.");
  const dbg = target.view.webContents.debugger;
  try {
    if (!dbg.isAttached()) dbg.attach("1.3");
  } catch (e) {
    if (!dbg.isAttached()) throw e;
  }
  return await dbg.sendCommand(method, params);
}

ipcMain.handle("devtools:resources", async () => {
  const target = activeDevToolsTarget();
  if (!target) return { resources: [] };
  try {
    const tree = await devToolsDebuggerCommand(target, "Page.getResourceTree");
    const flat = [];
    const walk = (frame) => {
      for (const r of (frame?.resources || [])) flat.push({ url:r.url, type:r.type, mimeType:r.mimeType || "" });
      for (const f of (frame?.childFrames || [])) walk(f);
    };
    walk(tree.frameTree);
    return { resources: flat };
  } catch {
    const resources = await target.view.webContents.executeJavaScript(`performance.getEntriesByType("resource").map(r=>({url:r.name,type:r.initiatorType||"other",mimeType:""}))`, true);
    return { resources };
  }
});

ipcMain.handle("devtools:resourceContent", async (_event, url) => {
  const target = activeDevToolsTarget();
  if (!target) throw new Error("No active page.");
  try {
    const r = await devToolsDebuggerCommand(target, "Page.getResourceContent", { frameId: (await devToolsDebuggerCommand(target,"Page.getResourceTree")).frameTree.frame.id, url:String(url||"") });
    return { content:r.content || "", base64Encoded:!!r.base64Encoded };
  } catch {
    return await target.view.webContents.executeJavaScript(`fetch(${JSON.stringify(String(url||""))}).then(r=>r.text())`, true).then(content=>({content,base64Encoded:false}));
  }
});

ipcMain.handle("devtools:pageInfo", async () => {
  const target = activeDevToolsTarget();
  if (!target) return {};
  return await target.view.webContents.executeJavaScript(`(() => ({
    url:location.href,title:document.title,origin:location.origin,protocol:location.protocol,
    readyState:document.readyState,visibility:document.visibilityState,charset:document.characterSet,
    viewport:{width:innerWidth,height:innerHeight,devicePixelRatio:devicePixelRatio},
    document:{nodes:document.getElementsByTagName('*').length,images:document.images.length,links:document.links.length,forms:document.forms.length},
    timing:performance.getEntriesByType('navigation')[0]?.toJSON?.()||null,
    online:navigator.onLine,userAgent:navigator.userAgent
  }))()`, true);
});

ipcMain.handle("devtools:security", async () => {
  const target = activeDevToolsTarget();
  if (!target) return {};
  const info = await target.view.webContents.executeJavaScript(`(() => ({
    url:location.href,protocol:location.protocol,secure:location.protocol==='https:',
    mixedContent:[...document.querySelectorAll('img[src],script[src],link[href],iframe[src]')].filter(e=>{try{return new URL(e.src||e.href,location.href).protocol==='http:'}catch{return false}}).length,
    cookiesEnabled:navigator.cookieEnabled,online:navigator.onLine,referrer:document.referrer||''
  }))()`, true);
  try { await devToolsDebuggerCommand(target,"Security.enable"); const s=await devToolsDebuggerCommand(target,"Security.getSecurityState"); Object.assign(info,s); } catch {}
  return info;
});

ipcMain.handle("devtools:screenshot", async () => {
  const target = activeDevToolsTarget();
  if (!target) throw new Error("No active page.");
  const image = await target.view.webContents.capturePage();
  return image.toDataURL();
});

ipcMain.handle("devtools:storageClear", async (_event, kind) => {
  const target=activeDevToolsTarget(); if(!target) return false;
  const k=String(kind||"");
  if(k==="local"||k==="session") await target.view.webContents.executeJavaScript(`${k==='local'?'localStorage':'sessionStorage'}.clear()`,true);
  else if(k==="cookies") await target.view.webContents.session.cookies.get({url:target.view.webContents.getURL()}).then(cs=>Promise.all(cs.map(c=>target.view.webContents.session.cookies.remove(target.view.webContents.getURL(),c.name))));
  return true;
});

ipcMain.handle("devtools:storageSet", async (_event, kind, key, value) => {
  const target=activeDevToolsTarget(); if(!target) throw new Error("No active page.");
  if(!["local","session"].includes(String(kind))) throw new Error("Unsupported storage type.");
  const storeName=kind==='local'?'localStorage':'sessionStorage';
  await target.view.webContents.executeJavaScript(`${storeName}.setItem(${JSON.stringify(String(key))},${JSON.stringify(String(value))})`,true);
  return true;
});


ipcMain.handle("extensions:list", () => getExtensionRecords());
ipcMain.handle("extensions:choose", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: "Add a Murky extension", properties: ["openFile", "openDirectory"], filters: [{ name: "Chrome extensions", extensions: ["zip", "crx"] }, { name: "All files", extensions: ["*"] }] });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  try { return { canceled: false, extension: await installExtensionFromPath(result.filePaths[0]) }; } catch (error) { return { canceled: false, error: error.message || String(error) }; }
});
ipcMain.handle("extensions:installPath", async (_e, sourcePath) => {
  try { return { ok: true, extension: await installExtensionFromPath(sourcePath) }; } catch (error) { return { ok: false, error: error.message || String(error) }; }
});
ipcMain.handle("extensions:activate", (_e, id) => activateExtension(id));
ipcMain.handle("extensions:pin", (_e, id, pinned) => {
  const records = getStoredExtensions(); const target = records.find(r => String(r.id) === String(id)); if (!target) return getExtensionRecords();
  const order = Array.isArray(store.get("extensionPinned")) ? store.get("extensionPinned").map(String) : []; const key = String(target.id); const index = order.indexOf(key);
  if (pinned && index < 0) order.push(key); if (!pinned && index >= 0) order.splice(index, 1);
  target.pinned = !!pinned; store.set("extensionPinned", order); saveStoredExtensions(records); send("extensions:update", getExtensionRecords()); sendExtensionPopupUpdate(); return getExtensionRecords();
});
ipcMain.handle("extensions:remove", async (_e, id) => {
  const records = getStoredExtensions(); const target = records.find(r => String(r.id) === String(id)); if (!target) return getExtensionRecords();
  try { session.defaultSession.removeExtension(target.id); } catch {} loadedExtensions.delete(target.id);
  if (target.dir && extensionPathSafe(target.dir)) { try { fs.rmSync(target.dir, { recursive: true, force: true }); } catch {} }
  saveStoredExtensions(records.filter(r => String(r.id) !== String(id)));
  store.set("extensionPinned", (Array.isArray(store.get("extensionPinned")) ? store.get("extensionPinned") : []).map(String).filter(v => v !== String(id)));
  send("extensions:update", getExtensionRecords()); sendExtensionPopupUpdate(); return getExtensionRecords();
});
ipcMain.handle("extensions:openManage", () => { closeExtensionPopup(); return openInternalTab("murky://extensions"); });
ipcMain.handle("extensions:showList", () => { if (extensionPopupView && !extensionPopupView.webContents.isDestroyed()) extensionPopupView.webContents.send("extensions:view", "list"); });
ipcMain.handle("extensions:showMenu", () => { if (extensionPopupView && !extensionPopupView.webContents.isDestroyed()) extensionPopupView.webContents.send("extensions:view", "menu"); });
ipcMain.handle("extensions:togglePopup", () => toggleExtensionPopup());
ipcMain.handle("extensions:getState", () => ({ extensions: getExtensionRecords(), settings: getSettings() }));
ipcMain.handle("extensions:closePopup", () => closeExtensionPopup());


ipcMain.handle("extension-api:bookmarks-get", (_e, extensionId) => {
  const record = getStoredExtensions().find(r => String(r.id) === String(extensionId));
  if (!record) return [];
  return (store.get("bookmarks") || []).map(b => ({
    id: String(b.id || ""),
    title: b.title || "",
    url: b.url || "",
    dateAdded: b.createdAt || Date.now(),
  }));
});
ipcMain.handle("extension-api:bookmarks-create", (_e, extensionId, details) => {
  const record = getStoredExtensions().find(r => String(r.id) === String(extensionId));
  if (!record) throw new Error("Unknown extension.");
  const bm = details || {};
  const bookmarks = Array.isArray(store.get("bookmarks")) ? store.get("bookmarks") : [];
  const item = { id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, title: String(bm.title || ""), url: String(bm.url || ""), createdAt: Date.now() };
  bookmarks.push(item); store.set("bookmarks", bookmarks);
  broadcastToTabs("bookmarks:update", bookmarks);
  return { id: item.id, title: item.title, url: item.url, dateAdded: item.createdAt };
});
ipcMain.handle("extension-api:bookmarks-remove", (_e, extensionId, id) => {
  const record = getStoredExtensions().find(r => String(r.id) === String(extensionId));
  if (!record) throw new Error("Unknown extension.");
  const bookmarks = (store.get("bookmarks") || []).filter(b => String(b.id) !== String(id));
  store.set("bookmarks", bookmarks); broadcastToTabs("bookmarks:update", bookmarks); return true;
});
ipcMain.handle("extension-api:history-search", (_e, extensionId, query) => {
  const record = getStoredExtensions().find(r => String(r.id) === String(extensionId));
  if (!record) return [];
  const q = String(query || "").toLowerCase();
  return (store.get("history") || []).filter(h => {
    const text = String(h.title || h.query || h.url || "").toLowerCase();
    return !q || text.includes(q);
  }).slice(0, 100);
});

ipcMain.handle("ui:openAppMenu", (_e, { x, y } = {}) => {
  const menu = buildAppMenu();
  menu.popup({ window: mainWindow, x: Math.round(x || 0), y: Math.round(y || 0) });
});

ipcMain.handle("ui:openExtensionsMenu", (_e, { x, y } = {}) => {
  const px = Math.round(x || 0), py = Math.round(y || 0);
  const menu = buildExtensionsMenu();
  menu.popup({ window: mainWindow, x: px, y: py });
  extensionPopupPoint = { x: px, y: py };
});

ipcMain.handle("ui:openMurkyMenu", (_e, { x, y } = {}) => {
  const menu = buildMurkyMenu();
  menu.popup({ window: mainWindow, x: Math.round(x || 0), y: Math.round(y || 0) });
});

ipcMain.handle("ui:showTabContextMenu", (_e, { id, x, y } = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const menu = buildTabContextMenu(id);
  if (!menu) return false;
  menu.popup({
    window: mainWindow,
    x: Math.round(x || 0),
    y: Math.round(y || 0),
  });
  return true;
});
ipcMain.handle("ui:showTabOverlay", (_e, payload) => {
  showTabOverlay(payload);
});
ipcMain.handle("ui:hideTabOverlay", () => {
  hideTabOverlay();
});
ipcMain.on("ui:tabOverlayHover", (_e, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("tab-overlay:hover", payload || {});
});
 
 
 
ipcMain.handle("ui:setSidebarFlyout", (_e, isOpen) => {
  sidebarFlyoutOpen = !!isOpen;
  layoutActiveView();
});ipcMain.handle("language:localizeText", (_e, texts=[], target) => {
  const list=Array.isArray(texts)?texts:[];
  const lang=normalizeLanguage(target)||normalizeLanguage(getSettings().preferredLanguages?.[0])||"en";
  return list.map(text=>localizeMurkyText(lang,String(text??"")));
});



ipcMain.handle("siteinfo:toggle", (_e, point) => {
  if (siteInfoOpen) { closeSiteInfo(); return false; }
  return openSiteInfo(point && Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : null);
});
ipcMain.handle("siteinfo:close", () => { closeSiteInfo(); return true; });
ipcMain.handle("siteinfo:resize", (_e, h) => {
  const height = Math.round(Number(h));
  if (!Number.isFinite(height)) return false;
  siteInfoHeight = Math.max(120, Math.min(height, 420));
  if (siteInfoOpen) layoutActiveView();
  return true;
});
ipcMain.handle("siteinfo:context", async () => {
  const t = tabs.get(activeTabId);
  const site = t ? siteFromUrl(t.url) : null;
  if (!site) return null;
  const cookies = await getSiteCookies(site.apex);
  return { host: site.host, apex: site.apex, secure: site.secure, cookieCount: cookies.length };
});
ipcMain.handle("siteinfo:clear-cookies", async () => {
  const t = tabs.get(activeTabId);
  const site = t ? siteFromUrl(t.url) : null;
  if (!site) return { cookieCount: 0 };
  await clearSiteCookies(site.apex);
  const left = await getSiteCookies(site.apex);
  return { cookieCount: left.length };
});
ipcMain.handle("siteinfo:open-settings", () => {
  const t = tabs.get(activeTabId);
  const site = t ? siteFromUrl(t.url) : null;
  closeSiteInfo(true);
  if (!site) return false;
  openInternalTab(`murky://site-settings?host=${encodeURIComponent(site.apex)}`);
  return true;
});
ipcMain.handle("sitesettings:get", (_e, host) => getSiteSettingsPayload(host));
ipcMain.handle("sitesettings:set-permission", async (_e, host, key, value) => {
  if (!validSiteHost(host)) return null;
  setSitePermission(apexOf(host), key, value);
  return getSitePermissions(apexOf(host));
});
ipcMain.handle("sitesettings:clear", async (_e, host) => {
  if (!validSiteHost(host)) return null;
  await clearSiteData(apexOf(host));
  return getSiteSettingsPayload(host);
});


ipcMain.handle("errorpage:retry", (e) => {
  const [id, t] = tabForSender(e.sender);
  if (!t || !t.errorUrl) return false;
  navigateView(id, t.errorUrl);
  return true;
});
ipcMain.handle("errorpage:back", (e) => {
  const [id, t] = tabForSender(e.sender);
  if (!t) return false;
  const wc = t.view.webContents;
  if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  else navigateView(id, "murky://newtab");
  return true;
});
ipcMain.handle("errorpage:proceed", (e) => {
  const [id, t] = tabForSender(e.sender);
  if (!t || !t.errorUrl) return false;
  const site = siteFromUrl(t.errorUrl);
  if (!site || !site.secure) return false;
  allowedCertHosts.add(site.host);
  navigateView(id, t.errorUrl);
  return true;
});
