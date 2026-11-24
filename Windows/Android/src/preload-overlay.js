const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("murkyOverlay", {
  onUpdate: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on("overlay:update", listener);
    return () => ipcRenderer.removeListener("overlay:update", listener);
  },
  onAnimateOut: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("overlay:animate-out", listener);
    return () => ipcRenderer.removeListener("overlay:animate-out", listener);
  },
  action: async (id, action) => {
    switch (action) {
      case "reload": return ipcRenderer.invoke("tabs:reload", id);
      case "duplicate": return ipcRenderer.invoke("tabs:duplicate", id);
      case "pin": return ipcRenderer.invoke("tabs:pin", id);
      case "mute": return ipcRenderer.invoke("tabs:mute", id);
      case "close": return ipcRenderer.invoke("tabs:close", id);
      default: return false;
    }
  },
  hide: () => ipcRenderer.invoke("ui:hideTabOverlay"),
  hover: (inside, mode) => ipcRenderer.send("ui:tabOverlayHover", { inside: !!inside, mode }),
});
