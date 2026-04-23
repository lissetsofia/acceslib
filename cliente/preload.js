const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getInfo: () => ipcRenderer.invoke("client:getInfo"),
  setServer: (url) => ipcRenderer.invoke("client:setServer", url),
  status: () => ipcRenderer.invoke("client:status"),

  pairRequest: () => ipcRenderer.invoke("client:pairRequest"),
  login: (codigo, password) => ipcRenderer.invoke("client:login", { codigo, password }),
  heartbeat: () => ipcRenderer.invoke("client:heartbeat"),
  logout: (reason) => ipcRenderer.invoke("client:logout", reason),

  getLockStatus: () => ipcRenderer.invoke("client:getLockStatus"),
  enableLock: () => ipcRenderer.invoke("client:enableLock"),
  disableLock: () => ipcRenderer.invoke("client:disableLock"),

  enterSessionMode: () => ipcRenderer.invoke("window:enterSessionMode"),
  leaveSessionMode: () => ipcRenderer.invoke("window:leaveSessionMode"),
});

contextBridge.exposeInMainWorld("systemEvents", {
  onForcedLogout: (callback) => {
    ipcRenderer.removeAllListeners("system-forced-logout");
    ipcRenderer.on("system-forced-logout", (_event, data) => callback(data));
  },
});
