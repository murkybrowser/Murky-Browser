const { contextBridge, ipcRenderer } = require('electron');
const on = (channel, cb) => {
  const listener = (_e, ...args) => cb(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('murkyExtensions', {
  onData: (cb) => on('extensions:data', cb),
  onSettings: (cb) => on('extensions:settings', cb),
  pin: (id, pinned) => ipcRenderer.invoke('extensions:pin', id, pinned),
  activate: (id) => ipcRenderer.invoke('extensions:activate', id),
  manage: () => ipcRenderer.invoke('extensions:openManage'),
  showList: () => ipcRenderer.invoke('extensions:showList'),
  showMenu: () => ipcRenderer.invoke('extensions:showMenu'),
  onView: (cb) => on('extensions:view', cb),
  onAnimation: (cb) => on('extensions:animate', cb),
  getState: () => ipcRenderer.invoke('extensions:getState'),
  localizeText: (texts) => ipcRenderer.invoke('language:localizeText', texts),
});
