(function() {
  const { contextBridge, ipcRenderer } = require('electron');

  try {
    const injectAlertHook = () => {
      const code = `
        (() => {
          try {
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
              const text = String(msg ?? '');
              messages.push(text);
              try {
                window.postMessage({ type: 'mm-alert', text }, '*');
              } catch (e) {
                // ignore
              }
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
      const data = event.data;
      if (data && data.type === 'mm-alert') {
        ipcRenderer.send('musinsa:alert', { text: data.text ?? '' });
      }
    });
  } catch (e) {
    // ignore
  }

  contextBridge.exposeInMainWorld('musinsaBridge', {
    login: (payload) => ipcRenderer.invoke('musinsa:login', payload),
    onLoginResult: (callback) => ipcRenderer.on('musinsa:loginResult', (_event, data) => callback(data)),
    readFile: (path) => ipcRenderer.invoke('musinsa:readFile', { path }),
    setFileInputFiles: (selector, files) =>
      ipcRenderer.invoke('musinsa:setFileInputFiles', { selector, files }),
    debugLog: (message, meta) =>
      ipcRenderer.send('musinsa:debugLog', {
        source: 'musinsa-preload',
        message,
        meta,
      }),
  });
})();
