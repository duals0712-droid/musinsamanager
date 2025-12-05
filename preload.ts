import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electronEnv', {
  platform: process.platform,
  isDev: process.env.NODE_ENV === 'development',
});

// 메인 브라우저(대시보드)에서 musinsa 로그인 결과 수신을 위해 IPC 채널을 연결합니다.
import { ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('musinsaLogin', {
  onResult: (callback: (result: { status: string; reason?: string }) => void) =>
    ipcRenderer.on('musinsa:loginResult', (_event, data) => callback(data)),
  sendLogin: (payload: { loginId: string; password: string }) => ipcRenderer.invoke('musinsa:login', payload),
  fetchReviewTargets: () => ipcRenderer.invoke('musinsa:fetchReviewTargets'),
  fetchSessionStatus: () => ipcRenderer.invoke('musinsa:fetchSessionStatus'),
  onSessionStatus: (callback: (result: { status: 'online' | 'offline'; checkedAt: number; reason?: string }) => void) =>
    ipcRenderer.on('musinsa:sessionStatus', (_event, data) => callback(data)),
  onSyncProgress: (callback: (data: { done: number; total: number; reset?: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('musinsa:syncProgress', listener);
    return () => ipcRenderer.removeListener('musinsa:syncProgress', listener);
  },
  logout: () => ipcRenderer.invoke('musinsa:logout'),
  confirmOrders: (items: { orderNo: string; orderOptionNo: number }[]) =>
    ipcRenderer.invoke('musinsa:confirmOrders', { items }),
  writeReviews: (items: any[]) => ipcRenderer.invoke('musinsa:writeReviews', { items }),
  writeReviewsDom: (items: any[]) => ipcRenderer.invoke('musinsa:writeReviewsDom', { items }),
  syncOrdersRange: (payload: { startDate: string; endDate: string }) =>
    ipcRenderer.invoke('musinsa:syncOrdersRange', payload),
  saveOrderXlsxData: (orders: any[]) => ipcRenderer.invoke('app:saveOrderXlsxData', { orders }),
  openPath: (path: string) => ipcRenderer.invoke('app:openPath', { path }),
  showInFolder: (path: string) => ipcRenderer.invoke('app:showInFolder', { path }),
  closeReviewWindow: () => ipcRenderer.invoke('musinsa:closeReviewWindow'),
});
