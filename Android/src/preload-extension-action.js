const { contextBridge, ipcRenderer, webFrame } = require("electron");

const arg = process.argv.find(v => v.startsWith("--murky-extension-id="));
const extensionId = decodeURIComponent((arg || "").slice("--murky-extension-id=".length));

const api = {
  tabs: {
    query: (queryInfo = {}) => ipcRenderer.invoke("extension-api:tabs-query", extensionId, queryInfo),
    create: (props = {}) => ipcRenderer.invoke("extension-api:tabs-create", extensionId, props),
    reload: (tabId) => ipcRenderer.invoke("extension-api:tabs-reload", extensionId, tabId),
    update: (tabId, props = {}) => ipcRenderer.invoke("extension-api:tabs-update", extensionId, tabId, props),
    remove: (tabId) => ipcRenderer.invoke("extension-api:tabs-remove", extensionId, tabId),
  },
  storage: {
    local: {
      get: (keys) => ipcRenderer.invoke("extension-api:storage-get", extensionId, keys),
      set: (items) => ipcRenderer.invoke("extension-api:storage-set", extensionId, items),
      remove: (keys) => ipcRenderer.invoke("extension-api:storage-remove", extensionId, keys),
      clear: () => ipcRenderer.invoke("extension-api:storage-clear", extensionId),
    },
  },
  runtime: {
    id: extensionId,
    getURL: (path = "") => `chrome-extension://${extensionId}/${String(path).replace(/^\/+/, "")}`,
    sendMessage: (message) => ipcRenderer.invoke("extension-api:runtime-send", extensionId, message),
  },
  windows: {
    getCurrent: () => Promise.resolve({ id: 1, focused: true, type: "normal" }),
  },
  scripting: {
    executeScript: (details = {}) => ipcRenderer.invoke("extension-api:scripting-execute", extensionId, details),
  },
  clipboard: {
    writeText: (text) => ipcRenderer.invoke("extension-api:clipboard-write", extensionId, text),
  }
};

contextBridge.exposeInMainWorld("murkyExtensionBridge", api);

try {
  webFrame.executeJavaScript(`
    (() => {
      const b = window.murkyExtensionBridge;
      if (!b) return;
      const c = window.chrome || (window.chrome = {});
      c.tabs = c.tabs || {};
      c.tabs.query = b.tabs.query;
      c.tabs.create = b.tabs.create;
      c.tabs.reload = b.tabs.reload;
      c.tabs.update = b.tabs.update;
      c.tabs.remove = b.tabs.remove;
      c.storage = c.storage || {};
      c.storage.local = b.storage.local;
      c.runtime = c.runtime || {};
      if (!c.runtime.id) c.runtime.id = b.runtime.id;
      if (!c.runtime.getURL) c.runtime.getURL = b.runtime.getURL;
      if (!c.runtime.sendMessage) c.runtime.sendMessage = b.runtime.sendMessage;
      c.windows = c.windows || {};
      if (!c.windows.getCurrent) c.windows.getCurrent = b.windows.getCurrent;
      c.scripting = c.scripting || {};
      if (!c.scripting.executeScript) c.scripting.executeScript = b.scripting.executeScript;
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        const clip = navigator.clipboard || {};
        clip.writeText = b.clipboard.writeText;
        Object.defineProperty(navigator, "clipboard", { value: clip, configurable: true });
      }
    })();
  `).catch(() => {});
} catch {}
