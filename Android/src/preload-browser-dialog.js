const {contextBridge, ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('murkyBrowserDialog',{respond:(payload)=>ipcRenderer.invoke('browser-dialog:respond',payload),close:()=>ipcRenderer.invoke('browser-dialog:close')});
ipcRenderer.on('browser-dialog:show',(_e,payload)=>window.dispatchEvent(new CustomEvent('murky-browser-dialog-show',{detail:payload})));

ipcRenderer.on("browser-dialog:hide",()=>window.dispatchEvent(new Event("murky-browser-dialog-hide")));
