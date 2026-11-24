const { contextBridge, ipcRenderer } = require("electron");

const on = (channel, callback) => {
  const listener = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("murky", {
   
  createTab: (url) => ipcRenderer.invoke("tabs:create", url),
  closeTab: (id) => ipcRenderer.invoke("tabs:close", id),
  activateTab: (id) => ipcRenderer.invoke("tabs:activate", id),
  listTabs: () => ipcRenderer.invoke("tabs:list"),
  reloadTab: (id) => ipcRenderer.invoke("tabs:reload", id),
  duplicateTab: (id) => ipcRenderer.invoke("tabs:duplicate", id),
  pinTab: (id) => ipcRenderer.invoke("tabs:pin", id),
  muteTab: (id) => ipcRenderer.invoke("tabs:mute", id),
  reorderTabs: (ids) => ipcRenderer.invoke("tabs:reorder", ids),
  getTabDetails: (id, opts) => ipcRenderer.invoke("tabs:details", id, opts),

   
  go: (id, target) => ipcRenderer.invoke("nav:go", { id, target }),
  back: (id) => ipcRenderer.invoke("nav:back", id),
  forward: (id) => ipcRenderer.invoke("nav:forward", id),
  reload: (id) => ipcRenderer.invoke("nav:reload", id),
  stop: (id) => ipcRenderer.invoke("nav:stop", id),

   
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (partial) => ipcRenderer.invoke("settings:set", partial),
  previewToolbarScale: (value) => ipcRenderer.send("settings:preview-toolbar-scale", Number(value) || 1),
  commitToolbarScalePreview: () => ipcRenderer.send("settings:commit-toolbar-scale-preview"),
  resetSettings: (keys) => ipcRenderer.invoke("settings:reset", keys),
  openSettingsTab: () => ipcRenderer.invoke("settings:openTab"),
  openLegal: (which) => ipcRenderer.invoke("legal:open", which),

   
  listBookmarks: () => ipcRenderer.invoke("bookmarks:list"),
  addBookmark: (bm) => ipcRenderer.invoke("bookmarks:add", bm),
  removeBookmark: (id) => ipcRenderer.invoke("bookmarks:remove", id),
  listHistory: () => ipcRenderer.invoke("history:list"),
  addSearch: (query) => ipcRenderer.invoke("history:addSearch", query),
  clearHistory: () => ipcRenderer.invoke("history:clear"),

   
  minimize: () => ipcRenderer.invoke("win:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("win:toggleMaximize"),
  closeWindow: () => ipcRenderer.invoke("win:close"),
  isMaximized: () => ipcRenderer.invoke("win:isMaximized"),

  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  openAppMenu: (pos) => ipcRenderer.invoke("ui:openAppMenu", pos),
  openMurkyMenu: (pos) => ipcRenderer.invoke("ui:openMurkyMenu", pos),
  openExtensionsMenu: (pos) => ipcRenderer.invoke("ui:openExtensionsMenu", pos),

   
  listExtensions: () => ipcRenderer.invoke("extensions:list"),
  chooseExtension: () => ipcRenderer.invoke("extensions:choose"),
  installExtensionPath: (sourcePath) => ipcRenderer.invoke("extensions:installPath", sourcePath),
  pinExtension: (id, pinned) => ipcRenderer.invoke("extensions:pin", id, pinned),
  removeExtension: (id) => ipcRenderer.invoke("extensions:remove", id),
  openExtensions: () => ipcRenderer.invoke("extensions:openManage"),
  toggleExtensionPopup: () => ipcRenderer.invoke("extensions:togglePopup"),
  closeExtensionPopup: () => ipcRenderer.invoke("extensions:closePopup"),
  setSidebarFlyout: (isOpen) => ipcRenderer.invoke("ui:setSidebarFlyout", isOpen),
  showTabOverlay: (payload) => ipcRenderer.invoke("ui:showTabOverlay", payload),
   showTabContextMenu: (pos) => ipcRenderer.invoke("ui:showTabContextMenu", pos),
  hideTabOverlay: () => ipcRenderer.invoke("ui:hideTabOverlay"),
  toggleSiteInfo: (point) => ipcRenderer.invoke("siteinfo:toggle", point),
  closeSiteInfo: () => ipcRenderer.invoke("siteinfo:close"),
  onSiteInfoState: (cb) => on("siteinfo:state", cb),

   
  onTabsUpdate: (cb) => on("tabs:update", cb),
  onNavUrl: (cb) => on("nav:url", cb),
  onSettingsUpdate: (cb) => on("settings:update", cb),
  onToolbarPreviewScale: (cb) => on("toolbar:preview-scale", cb),
  onWinState: (cb) => on("win:state", cb),
  onDownloadsUpdate: (cb) => on("downloads:update", cb),
  cancelDownload: (id) => ipcRenderer.invoke("downloads:cancel", id),
  scheduleDownloadOpen: (id) => ipcRenderer.invoke("downloads:scheduleOpen", id),
  openDownloadPath: (filePath) => ipcRenderer.invoke("downloads:openPath", filePath),
  onFocusAddress: (cb) => on("ui:focus-address", cb),
  onToggleSidebar: (cb) => on("ui:toggle-sidebar", cb),
  onOpenSidebarPanel: (cb) => on("ui:open-sidebar-panel", cb),
  onTabOverlayHover: (cb) => on("tab-overlay:hover", cb),
  onTabOverlayBlur: (cb) => on("tab-overlay:blur", cb),
  respondBrowserDialog: (payload) => ipcRenderer.invoke("browser-dialog:respond", payload),
  onBrowserDialogShow: (cb) => on("browser-dialog:show", cb),
  onBrowserDialogHide: (cb) => on("browser-dialog:hide", cb),
  onExtensionsUpdate: (cb) => on("extensions:update", cb),
  getSupportedLanguages: () => ipcRenderer.invoke("language:getSupported"),
  translateText: (texts) => ipcRenderer.invoke("language:translateText", texts),
  addLanguage: (code) => ipcRenderer.invoke("language:add", code),
  removeLanguage: (code) => ipcRenderer.invoke("language:remove", code),
  reorderLanguages: (codes) => ipcRenderer.invoke("language:reorder", codes),
  onTranslationOffer: (cb) => on("translate:offer", cb),
});
