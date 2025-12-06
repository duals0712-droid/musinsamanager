// @ts-nocheck
import { contextBridge, ipcRenderer } from 'electron';

// 로그인 실패 alert를 메인 월드에서 가로채기 위해 초기 로딩 시 훅을 주입합니다.
// contextIsolation이 켜져 있으므로 script 태그로 메인 월드에 삽입합니다.
try {
  const injectAlertHook = () => {
    const code = `
      (() => {
        try {
          // Anti-detection basics
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
          delete (navigator as any).__proto__?.webdriver;
          if (!window.chrome) {
            window.chrome = { runtime: {}, app: {} };
          }
          Object.defineProperty(navigator, 'plugins', {
            get: () => [
              { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', length: 1 },
              { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', length: 1 },
              { name: 'Native Client', filename: 'internal-nacl-plugin', length: 2 },
            ],
          });
          Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
          Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
          Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
          Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
          Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
          Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.' });
          (navigator as any).connection = (navigator as any).connection || { effectiveType: '4g', rtt: 50, downlink: 10 };
          const origQuery = navigator.permissions?.query;
          if (origQuery) {
            navigator.permissions.query = (p) => {
              if (p && (p as any).name === 'notifications') {
                return Promise.resolve({ state: Notification.permission });
              }
              return origQuery.call(navigator.permissions, p);
            };
          }
          Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
          Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight });
          // simple canvas noise
          const proto = CanvasRenderingContext2D.prototype as any;
          if (proto && proto.getImageData && !proto.__mm_noised) {
            const orig = proto.getImageData;
            proto.getImageData = function (...args: any[]) {
              const imageData = orig.apply(this, args);
              for (let i = 0; i < imageData.data.length; i += 4) {
                const noise = Math.floor(Math.random() * 3) - 1;
                imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
              }
              return imageData;
            };
            proto.__mm_noised = true;
          }
          // WebGL vendor/renderer mask
          const glProto = WebGLRenderingContext && WebGLRenderingContext.prototype;
          if (glProto && !glProto.__mm_glmasked) {
            const origGetParameter = glProto.getParameter;
            glProto.getParameter = function (param) {
              if (param === 37445) return 'Intel Open Source Technology Center';
              if (param === 37446) return 'Mesa DRI Intel(R) UHD Graphics 620';
              return origGetParameter.apply(this, arguments as any);
            };
            glProto.__mm_glmasked = true;
          }
          // AudioContext fingerprint noise
          const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (AC && !AC.__mm_patched) {
            const origCreateAnalyser = AC.prototype.createAnalyser;
            AC.prototype.createAnalyser = function () {
              const analyser = origCreateAnalyser.apply(this, arguments as any);
              const origGetByteFreqData = analyser.getByteFrequencyData;
              analyser.getByteFrequencyData = function (array: Uint8Array) {
                const res = origGetByteFreqData.apply(this, arguments as any);
                for (let i = 0; i < array.length; i += 50) {
                  array[i] = Math.max(0, Math.min(255, array[i] ^ 1));
                }
                return res;
              };
              return analyser;
            };
            AC.__mm_patched = true;
          }
          if (typeof (window as any).process !== 'undefined') {
            delete (window as any).process;
            delete (window as any).require;
            delete (window as any).module;
            delete (window as any).exports;
          }

          if (window.__mmAlertHooked) return;
          const messages = [];
          Object.defineProperty(window, '__mmAlerts', {
            get() { return messages; },
            set(v) {
              messages.length = 0;
              if (Array.isArray(v)) {
                messages.push(...v.map((x) => String(x)));
              }
            },
          });
          window.alert = (msg) => {
            messages.push(String(msg));
          };
          window.__mmAlertHooked = true;
        } catch (e) {
          // ignore
        }
      })();
    `;
    try {
      const script = document.createElement('script');
      script.textContent = code;
      (document.documentElement || document.head || document).appendChild(script);
      script.remove();
    } catch (e) {
      // ignore
    }
  };

  injectAlertHook();
  window.addEventListener('DOMContentLoaded', injectAlertHook);
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data as any;
    if (data && data.type === 'mm-alert') {
      ipcRenderer.send('musinsa:alert', { text: data.text ?? '' });
    }
  });
} catch (e) {
  // ignore
}

contextBridge.exposeInMainWorld('musinsaBridge', {
  login: (payload: { loginId: string; password: string }) => ipcRenderer.invoke('musinsa:login', payload),
  onLoginResult: (callback: (result: { status: 'success' | 'alert' | 'error'; reason?: string }) => void) =>
    ipcRenderer.on('musinsa:loginResult', (_event, data) => callback(data)),
  logEvent: (message: string, meta?: any) =>
    ipcRenderer.send('musinsa:debugLog', {
      source: 'musinsa-preload',
      message,
      meta,
    }),
  readFile: (path: string) => ipcRenderer.invoke('musinsa:readFile', { path }),
  setFileInputFiles: (selector: string, files: string[]) =>
    ipcRenderer.invoke('musinsa:setFileInputFiles', { selector, files }),
  fetchGoodsDetail: (payload: { goodsNo: string }) => ipcRenderer.invoke('musinsa:fetchGoodsDetail', payload),
  fetchProductPageState: (payload: { goodsNo: string }) => ipcRenderer.invoke('musinsa:fetchProductPageState', payload),
  fetchPointSummary: () => ipcRenderer.invoke('musinsa:fetchPointSummary'),
  fetchCoupons: (payload: { goodsNo: string; brand?: string; comId?: string; salePrice?: number }) =>
    ipcRenderer.invoke('musinsa:fetchCoupons', payload),
  debugLog: (message: string, meta?: any) =>
    ipcRenderer.send('musinsa:debugLog', {
      source: 'musinsa-preload',
      message,
      meta,
    }),
});

contextBridge.exposeInMainWorld('telegramHelper', {
  getChatId: (payload: { token: string }) => ipcRenderer.invoke('telegram:getChatId', payload),
  sendTestMessage: (payload: { token: string; chatId: string; text?: string }) =>
    ipcRenderer.invoke('telegram:testSend', payload),
});
