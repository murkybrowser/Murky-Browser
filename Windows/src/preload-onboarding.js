const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("murkyOnboarding", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  complete: () => ipcRenderer.invoke("onboarding:complete"),
  openLegal: (which) => ipcRenderer.invoke("onboarding:legal", which),
  setTheme: (partial) => ipcRenderer.invoke("settings:set", partial),
  setLanguage: (code) => ipcRenderer.invoke("onboarding:language", code),
  getSupportedLanguages: () => ipcRenderer.invoke("language:getSupported"),
  translateText: (texts) => ipcRenderer.invoke("language:translateText", texts),
  setDefaultBrowser: () => ipcRenderer.invoke("defaultbrowser:set"),
  getMigrationSource: () => ipcRenderer.invoke("onboarding:migrationSource"),
  migrate: (id) => ipcRenderer.invoke("onboarding:migrate", id),
  onMigrateProgress: (cb) => { const l = (_e, p) => cb(p); ipcRenderer.on("onboarding:migrate-progress", l); return () => ipcRenderer.removeListener("onboarding:migrate-progress", l); },
  closeApp: () => ipcRenderer.invoke("win:close"),
  onInit: (cb) => ipcRenderer.on("onboarding:init", (_e, settings) => cb(settings)),
  onSettings: (cb) => ipcRenderer.on("onboarding:settings", (_e, settings) => cb(settings)),
  onReset: (cb) => ipcRenderer.on("onboarding:reset", (_e, settings) => cb(settings)),
});