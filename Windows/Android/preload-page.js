const { contextBridge, ipcRenderer, webFrame } = require("electron");

try {
  const ownPageNames = ["newtab.html", "settings.html", "privacy.html", "terms.html", "extensions.html", "site-settings.html", "error.html"];
  let isOwnPage = false;
  try {
    isOwnPage = !!ipcRenderer.sendSync("page:isInternal");
  } catch {}
  if (!isOwnPage) {
    const pageHref = globalThis.location?.href || "";
    const pageUrl = pageHref ? new URL(pageHref) : null;
    const pagePath = pageUrl?.pathname || "";
    isOwnPage = pageUrl?.protocol === "file:" && ownPageNames.some((name) => pagePath.endsWith("/" + name));
  }

   
  if (isOwnPage) {
    contextBridge.exposeInMainWorld("murkyPage", {
      getSettings: () => ipcRenderer.invoke("settings:get"),
      translateText: (texts) => ipcRenderer.invoke("language:translateText", texts),
      localizeText: (texts, target) => ipcRenderer.invoke("language:localizeText", texts, target),
      getSupportedLanguages: () => ipcRenderer.invoke("language:getSupported"),
      addLanguage: (code) => ipcRenderer.invoke("language:add", code),
      removeLanguage: (code) => ipcRenderer.invoke("language:remove", code),
      reorderLanguages: (codes) => ipcRenderer.invoke("language:reorder", codes),
      errorRetry: () => ipcRenderer.invoke("errorpage:retry"),
      errorBack: () => ipcRenderer.invoke("errorpage:back"),
      errorProceed: () => ipcRenderer.invoke("errorpage:proceed"),
      getDefaultBrowser: () => ipcRenderer.invoke("defaultbrowser:status"),
      setDefaultBrowser: () => ipcRenderer.invoke("defaultbrowser:set"),
      getSiteSettings: (host) => ipcRenderer.invoke("sitesettings:get", host),
      setSitePermission: (host, key, value) => ipcRenderer.invoke("sitesettings:set-permission", host, key, value),
      clearSiteData: (host) => ipcRenderer.invoke("sitesettings:clear", host),
      getBookmarks: () => ipcRenderer.invoke("bookmarks:list"),
      setSettings: (partial) => ipcRenderer.invoke("settings:set", partial),
      previewToolbarScale: (value) => ipcRenderer.send("settings:preview-toolbar-scale", Number(value) || 1),
      commitToolbarScalePreview: () => ipcRenderer.send("settings:commit-toolbar-scale-preview"),
      resetSettings: (keys) => ipcRenderer.invoke("settings:reset", keys),
      openSettingsTab: () => ipcRenderer.invoke("settings:openTab"),
      openLegal: (which) => ipcRenderer.invoke("legal:open", which),
      openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
      resetOnboarding: () => ipcRenderer.invoke("onboarding:reset"),
      clearHistory: () => ipcRenderer.invoke("history:clear"),
      trustInfo: () => ipcRenderer.invoke("trust:info"),
      trustRequests: () => ipcRenderer.invoke("trust:requests"),
      exportRequestLog: () => ipcRenderer.invoke("trust:exportRequests"),
      exportHistory: () => ipcRenderer.invoke("trust:exportHistory"),
      exportLocalData: () => ipcRenderer.invoke("trust:exportLocalData"),
      purgeLocalData: () => ipcRenderer.invoke("privacy:purge"),
      checkForUpdates: () => ipcRenderer.invoke("trust:checkUpdates"),
      speechRecognize: (payload) => ipcRenderer.invoke("speech:recognize", payload),
      addSearch: (query) => ipcRenderer.invoke("history:addSearch", query),
      listHistory: () => ipcRenderer.invoke("history:list"),
      removeSearch: (query) => ipcRenderer.invoke("history:removeSearch", String(query || "")),
      getSearchSuggestions: (query, engine) => ipcRenderer.invoke("search:suggestions", { query, engine }),
      getTrendingSearches: (engine) => ipcRenderer.invoke("search:trending", { engine }),
      listExtensions: () => ipcRenderer.invoke("extensions:list"),
      chooseExtension: () => ipcRenderer.invoke("extensions:choose"),
      installExtensionPath: (sourcePath) => ipcRenderer.invoke("extensions:installPath", sourcePath),
      removeExtension: (id) => ipcRenderer.invoke("extensions:remove", id),
      pinExtension: (id, pinned) => ipcRenderer.invoke("extensions:pin", id, pinned),
      onExtensionsUpdate: (cb) => { const listener = (_e, data) => cb(data); ipcRenderer.on("extensions:update", listener); return () => ipcRenderer.removeListener("extensions:update", listener); },
      onSettingsUpdate: (cb) => {
        const listener = (_e, settings) => cb(settings);
        ipcRenderer.on("settings:update", listener);
        return () => ipcRenderer.removeListener("settings:update", listener);
      },
    });
  } else {
     
     
     
     
    contextBridge.exposeInMainWorld("__murkyBrowserDialogs", {
      show: (payload) => ipcRenderer.send("browser-dialog:show-request", {
        type: payload?.type || "alert",
        message: String(payload?.message || ""),
        defaultPrompt: String(payload?.defaultPrompt || ""),
      }),
    });

     
     
     
    webFrame.executeJavaScript(`(() => {
      if (window.__murkyDialogsInstalled) return;
      window.__murkyDialogsInstalled = true;
      const bridge = window.__murkyBrowserDialogs;
      if (!bridge) return;

      const send = (type, message, defaultPrompt = "") => {
        try {
          bridge.show({ type, message: String(message ?? ""), defaultPrompt: String(defaultPrompt ?? "") });
        } catch {}
      };

      Object.defineProperty(window, "alert", {
        configurable: true,
        writable: true,
        value(message) {
          send("alert", message);
        }
      });

      Object.defineProperty(window, "confirm", {
        configurable: true,
        writable: true,
        value(message) {
          send("confirm", message);
          return true;
        }
      });

      Object.defineProperty(window, "prompt", {
        configurable: true,
        writable: true,
        value(message, defaultValue = "") {
          send("prompt", message, defaultValue);
          return String(defaultValue ?? "");
        }
      });
    })()`).catch(() => {});
  }
} catch {
   
}
