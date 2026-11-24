const { contextBridge, ipcRenderer } = require("electron");
const on = (channel, cb) => { const fn = (_e, ...args) => cb(...args); ipcRenderer.on(channel, fn); return () => ipcRenderer.removeListener(channel, fn); };
contextBridge.exposeInMainWorld("murkyUpdate", {
  getSettings: () => ipcRenderer.invoke("update:getSettings"),
  start: () => ipcRenderer.invoke("update:start"),
  closeApp: () => ipcRenderer.invoke("win:close"),
  onInit: (cb) => on("update:init", cb),
  onSettings: (cb) => on("update:settings", cb),
  onState: (cb) => on("update:state", cb),
});
