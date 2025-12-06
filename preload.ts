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
  onUpdateStatus: (callback: (data: { status: string; version?: string; percent?: number; message?: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('app:updateStatus', listener);
    return () => ipcRenderer.removeListener('app:updateStatus', listener);
  },
  checkInventory: (payload: { goodsUrl: string }) => ipcRenderer.invoke('app:checkInventory', payload),
  startUpdate: () => ipcRenderer.invoke('app:startUpdate'),
  loginSupabase: (payload: { loginId: string; password: string }) => ipcRenderer.invoke('app:loginSupabase', payload),
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
  fetchGoodsDetail: (payload: { goodsNo: string }) => ipcRenderer.invoke('musinsa:fetchGoodsDetail', payload),
  fetchProductPageState: (payload: { goodsNo: string }) => ipcRenderer.invoke('musinsa:fetchProductPageState', payload),
  fetchPointSummary: () => ipcRenderer.invoke('musinsa:fetchPointSummary'),
  fetchCoupons: (payload: { goodsNo: string; brand?: string; comId?: string; salePrice?: number }) =>
    ipcRenderer.invoke('musinsa:fetchCoupons', payload),
  saveOrderXlsxData: (orders: any[]) => ipcRenderer.invoke('app:saveOrderXlsxData', { orders }),
  openPath: (path: string) => ipcRenderer.invoke('app:openPath', { path }),
  showInFolder: (path: string) => ipcRenderer.invoke('app:showInFolder', { path }),
  closeReviewWindow: () => ipcRenderer.invoke('musinsa:closeReviewWindow'),
});

contextBridge.exposeInMainWorld('telegramHelper', {
  getChatId: (payload: { token: string }) => ipcRenderer.invoke('telegram:getChatId', payload),
  sendTestMessage: (payload: { token: string; chatId: string; text?: string }) =>
    ipcRenderer.invoke('telegram:testSend', payload),
});
