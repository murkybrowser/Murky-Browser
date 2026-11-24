const { contextBridge, ipcRenderer } = require("electron");

const on = (channel, cb) => {
  const listener = (_e, ...args) => cb(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("murkySiteInfo", {
  getContext: () => ipcRenderer.invoke("siteinfo:context"),
  localizeText: (texts) => ipcRenderer.invoke("language:localizeText", texts),
  clearCookies: () => ipcRenderer.invoke("siteinfo:clear-cookies"),
  openSiteSettings: () => ipcRenderer.invoke("siteinfo:open-settings"),
  resize: (height) => ipcRenderer.invoke("siteinfo:resize", height),
  close: () => ipcRenderer.invoke("siteinfo:close"),
  onShow: (cb) => on("siteinfo:show", cb),
  onTheme: (cb) => on("siteinfo:theme", cb),
  onAnimate: (cb) => on("siteinfo:animate", cb),
});
