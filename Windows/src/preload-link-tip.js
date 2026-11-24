const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("murkyLinkTip", {
  onShow: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on("linktip:show", listener);
    return () => ipcRenderer.removeListener("linktip:show", listener);
  },
  onHide: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("linktip:hide", listener);
    return () => ipcRenderer.removeListener("linktip:hide", listener);
  },
});
