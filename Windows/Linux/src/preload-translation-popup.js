const{contextBridge,ipcRenderer}=require("electron");
const on=(c,cb)=>{const l=(_e,...a)=>cb(...a);ipcRenderer.on(c,l);return()=>ipcRenderer.removeListener(c,l)};
contextBridge.exposeInMainWorld("murkyTranslate",{
  translate:()=>ipcRenderer.invoke("language:translate"),
  restore:()=>ipcRenderer.invoke("language:restore"),
  close:()=>ipcRenderer.send("language:popup-close"),
  onOffer:cb=>on("translate:offer",cb),
  onTheme:cb=>on("translate:theme",cb),
  onAnimate:cb=>on("translate:animate",cb)
});
