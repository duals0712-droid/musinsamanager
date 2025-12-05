(function () {
  const { contextBridge, ipcRenderer } = require('electron');

  contextBridge.exposeInMainWorld('electronEnv', {
    platform: process.platform,
    isDev: process.env.NODE_ENV === 'development',
  });

  contextBridge.exposeInMainWorld('musinsaLogin', {
    onResult: (callback) => ipcRenderer.on('musinsa:loginResult', (_event, data) => callback(data)),
    sendLogin: (payload) => ipcRenderer.invoke('musinsa:login', payload),
    fetchReviewTargets: () => ipcRenderer.invoke('musinsa:fetchReviewTargets'),
  fetchSessionStatus: () => ipcRenderer.invoke('musinsa:fetchSessionStatus'),
  onSessionStatus: (callback) => ipcRenderer.on('musinsa:sessionStatus', (_event, data) => callback(data)),
  onSyncProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('musinsa:syncProgress', listener);
    return () => ipcRenderer.removeListener('musinsa:syncProgress', listener);
  },
  logout: () => ipcRenderer.invoke('musinsa:logout'),
    confirmOrders: (items) => ipcRenderer.invoke('musinsa:confirmOrders', { items }),
    writeReviews: (items) => ipcRenderer.invoke('musinsa:writeReviews', { items }),
    writeReviewsDom: (items) => ipcRenderer.invoke('musinsa:writeReviewsDom', { items }),
    syncOrdersRange: (payload) => ipcRenderer.invoke('musinsa:syncOrdersRange', payload),
    saveOrderXlsxData: (orders) => ipcRenderer.invoke('app:saveOrderXlsxData', { orders }),
    openPath: (path) => ipcRenderer.invoke('app:openPath', { path }),
    showInFolder: (path) => ipcRenderer.invoke('app:showInFolder', { path }),
    closeReviewWindow: () => ipcRenderer.invoke('musinsa:closeReviewWindow'),
  });
})();
