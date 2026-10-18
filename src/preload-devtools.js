const {contextBridge,ipcRenderer}=require("electron");
const on=(c,cb)=>{const f=(_e,...a)=>cb(...a);ipcRenderer.on(c,f);return()=>ipcRenderer.removeListener(c,f)};
contextBridge.exposeInMainWorld("murkyDevTools",{
  close:()=>ipcRenderer.invoke("devtools:close"),
  evaluate:c=>ipcRenderer.invoke("devtools:eval",c),
  elements:(q,fp)=>ipcRenderer.invoke("devtools:elements",q||"",fp||null),
  storage:()=>ipcRenderer.invoke("devtools:storage"),
  storageClear:k=>ipcRenderer.invoke("devtools:storageClear",k),
  storageSet:(k,key,value)=>ipcRenderer.invoke("devtools:storageSet",k,key,value),
  performance:()=>ipcRenderer.invoke("devtools:performance"),
  resources:()=>ipcRenderer.invoke("devtools:resources"),
  resourceContent:u=>ipcRenderer.invoke("devtools:resourceContent",u),
  pageInfo:()=>ipcRenderer.invoke("devtools:pageInfo"),
  security:()=>ipcRenderer.invoke("devtools:security"),
  screenshot:()=>ipcRenderer.invoke("devtools:screenshot"),
  copyText:t=>ipcRenderer.invoke("devtools:copy",String(t??"")),
  elementGet:p=>ipcRenderer.invoke("devtools:elementGet",p),
  elementSet:p=>ipcRenderer.invoke("devtools:elementSet",p),
  inspectTarget:p=>ipcRenderer.invoke("devtools:inspect",p),
  getSettings:()=>ipcRenderer.invoke("settings:get"),
  onSettings:cb=>on("devtools:settings",cb),
  onTarget:cb=>on("devtools:target",cb),
  onConsole:cb=>on("devtools:console",cb),
  onNetwork:cb=>on("devtools:network",cb),
  onInspectTarget:cb=>on("devtools:inspectTarget",cb)
});
