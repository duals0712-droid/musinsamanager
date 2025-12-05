import { app, BrowserWindow, shell, ipcMain, IpcMainEvent, Session, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as XLSX from 'xlsx-js-style';
import { autoUpdater } from 'electron-updater';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 백그라운드 창에서도 타이머/스크립트가 멈추지 않도록 렌더러 백그라운딩을 비활성화합니다.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

let mainWindow: BrowserWindow | null = null;
let musinsaWindow: BrowserWindow | null = null;
let musinsaReviewWindow: BrowserWindow | null = null;
let initialMusinsaLoginPrompted = false;
let musinsaSessionTimer: NodeJS.Timeout | null = null;
let updateDownloading = false;
const MUSINSA_ALERT_WORLD_ID = 99;
const MUSINSA_CONFIRM_CONCURRENCY = 3;
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];
const pickUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const isDevBuild = !!process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development';
const sendUpdateStatus = (payload: { status: string; version?: string; percent?: number; message?: string }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('app:updateStatus', payload);
};

const APP_TITLE = 'Musinsa Manager';

const applySessionHardening = (ses: Session) => {
  if ((ses as any).__mm_hardened) return;
  (ses as any).__mm_hardened = true;
  ses.setUserAgent(pickUserAgent());
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    headers['Accept-Language'] = headers['Accept-Language'] || 'ko-KR,ko;q=0.9,en-US;q=0.8';
    headers['Accept-Encoding'] = headers['Accept-Encoding'] || 'gzip, deflate, br';
    headers['Sec-Fetch-Dest'] = headers['Sec-Fetch-Dest'] || 'document';
    headers['Sec-Fetch-Mode'] = headers['Sec-Fetch-Mode'] || 'navigate';
    headers['Sec-Fetch-Site'] = headers['Sec-Fetch-Site'] || 'same-origin';
    headers['Sec-Ch-Ua'] = headers['Sec-Ch-Ua'] || '"Not_A Brand";v="8", "Chromium";v="120"';
    headers['Sec-Ch-Ua-Mobile'] = headers['Sec-Ch-Ua-Mobile'] || '?0';
    headers['Sec-Ch-Ua-Platform'] = headers['Sec-Ch-Ua-Platform'] || '"Windows"';
    callback({ requestHeaders: headers });
  });

  const blockList = ['google-analytics.com', 'googletagmanager.com', 'doubleclick.net', 'hotjar.com', 'facebook.net'];
  ses.webRequest.onBeforeRequest((details, callback) => {
    const cancel = blockList.some((d) => details.url.includes(d));
    callback({ cancel });
  });
};

const enableInspectOnRightClick = (win: BrowserWindow) => {
  win.webContents.on('context-menu', (event, params) => {
    event.preventDefault();
    // 우클릭 시 바로 DevTools로 포커싱
    win.webContents.inspectElement(params.x, params.y);
    if (!win.webContents.isDevToolsOpened()) {
      win.webContents.openDevTools({ mode: 'right' });
    } else {
      win.webContents.devToolsWebContents?.focus();
    }
  });
};

// __dirname은 CJS 환경에서만 정의되므로, 없을 경우 현재 작업 디렉터리로 대체
const baseDir = app.isPackaged ? app.getAppPath() : process.cwd();
const iconPath = path.join(baseDir, 'icon.ico');

const SUPABASE_URL = 'https://vkubhjkwllpqecgbcubl.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrdWJoamt3bGxwcWVjZ2JjdWJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMzYxNjQsImV4cCI6MjA3OTgxMjE2NH0.e0TrKw3ByyXv-rNGspKUcMVb42ZRFxRGBhuEgrC97xI';
const supabaseNode: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const createWindow = () => {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  const preloadPath = path.join(baseDir, 'preload.js');
  if (!isDevBuild) {
    autoUpdater.autoDownload = false;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#f3f4f6',
    show: false,
    resizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    icon: iconPath,
    title: APP_TITLE,
    webPreferences: {
      preload: isDev ? path.join(baseDir, 'preload.js') : path.join(baseDir, 'dist-electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  applySessionHardening(mainWindow.webContents.session);

  mainWindow.setAspectRatio(16 / 9);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  const devServerURL = process.env.VITE_DEV_SERVER_URL;
  if (devServerURL) {
    mainWindow.loadURL(devServerURL);
  } else {
    const indexPath = path.join(baseDir, 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', () => {
    // 메인 창이 닫힐 때 백그라운드 창도 함께 정리해 프로세스가 남지 않도록 함
    if (musinsaWindow && !musinsaWindow.isDestroyed()) {
      musinsaWindow.destroy();
      musinsaWindow = null;
    }
    if (musinsaReviewWindow && !musinsaReviewWindow.isDestroyed()) {
      musinsaReviewWindow.destroy();
      musinsaReviewWindow = null;
    }
    app.quit();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const createMusinsaWindow = () => {
  musinsaWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    backgroundColor: '#ffffff',
    show: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(baseDir, 'dist-electron', 'musinsa-preload.js'),
      disableDialogs: true,
      backgroundThrottling: false,
    },
  });

  applySessionHardening(musinsaWindow.webContents.session);

  const injectAlertHook = () => {
    if (!musinsaWindow || musinsaWindow.isDestroyed()) return;
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
    musinsaWindow.webContents
      .executeJavaScriptInIsolatedWorld(
        MUSINSA_ALERT_WORLD_ID,
        [{ code }],
        true,
      )
      .catch(() => undefined);
  };

  musinsaWindow.loadURL('https://www.musinsa.com/mypage');
  injectAlertHook();

  musinsaWindow.webContents.on('did-finish-load', () => {
    // 앱 최초 구동 시 한 번만 로그인 페이지로 진입하도록 클릭 트리거
    if (initialMusinsaLoginPrompted) {
      return;
    }
    initialMusinsaLoginPrompted = true;

    const script = `
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const randomDelay = (min = 300, max = 1500) => sleep(min + Math.random() * (max - min));
        const targetSelector = '#commonLayoutGnb > div > div:nth-child(2) > a._gnb__login_vuwmc_206';
        const started = Date.now();
        while (Date.now() - started < 5000) {
          const el = document.querySelector(targetSelector);
          if (el) {
            const text = (el.textContent || '').trim();
            if (/로그아웃/i.test(text)) return 'already_logged_in';
            if (typeof el.click === 'function') {
              el.click();
              return 'clicked';
            }
            return 'not_clickable';
          }
          await sleep(150);
        }
        await randomDelay();
        window.scrollTo({ top: 400, behavior: 'smooth' });
        await randomDelay();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return 'not_found';
      })();
    `;
    musinsaWindow?.webContents.executeJavaScript(script).catch((err) => {
      console.warn('[musinsa] auto-click failed', err);
    });
  });

  musinsaWindow.webContents.on('did-start-navigation', injectAlertHook);
  musinsaWindow.webContents.on('did-frame-navigate', injectAlertHook);

  musinsaWindow.on('closed', () => {
    musinsaWindow = null;
  });
};

const ensureReviewWindow = async () => {
  const reviewWindowVisible = process.env.MUSINSA_REVIEW_WINDOW_VISIBLE === '1';
  if (musinsaReviewWindow && !musinsaReviewWindow.isDestroyed()) {
    if (reviewWindowVisible) {
      musinsaReviewWindow.show();
    } else {
      try {
        musinsaReviewWindow.hide();
      } catch (e) {
        // ignore
      }
    }
    return musinsaReviewWindow;
  }

  musinsaReviewWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    backgroundColor: '#ffffff',
    show: reviewWindowVisible,
    skipTaskbar: !reviewWindowVisible,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(baseDir, 'dist-electron', 'musinsa-preload.js'),
      disableDialogs: true,
      backgroundThrottling: false,
    },
  });

  applySessionHardening(musinsaReviewWindow.webContents.session);

  musinsaReviewWindow.on('closed', () => {
    musinsaReviewWindow = null;
  });

  enableInspectOnRightClick(musinsaReviewWindow);

  await musinsaReviewWindow.loadURL('https://www.musinsa.com/mypage/myreview');
  if (!reviewWindowVisible) {
    try {
      musinsaReviewWindow.hide();
    } catch (e) {
      // ignore
    }
  }
  if (reviewWindowVisible && process.env.NODE_ENV === 'development') {
    musinsaReviewWindow.webContents.openDevTools({ mode: 'right' });
  }
  return musinsaReviewWindow;
};

const closeReviewWindow = () => {
  try {
    if (musinsaReviewWindow && !musinsaReviewWindow.isDestroyed()) {
      musinsaReviewWindow.close();
    }
  } catch (e) {
    // ignore
  }
};

const waitForRendererAlert = (timeoutMs = 5000): Promise<string | null> => {
  return new Promise((resolve) => {
    const handler = (event: IpcMainEvent, data: any) => {
      if (!musinsaWindow || musinsaWindow.isDestroyed()) {
        return;
      }
      if (event.sender.id !== musinsaWindow.webContents.id) {
        return;
      }
      cleanup();
      const text = data?.text ?? data;
      resolve(text === undefined || text === null ? null : String(text));
    };
    const cleanup = () => {
      clearTimeout(timer);
      ipcMain.removeListener('musinsa:alert', handler);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);
    ipcMain.on('musinsa:alert', handler);
  });
};

const sendLoginResult = (payload: { status: 'success' | 'alert' | 'error'; reason?: string }) => {
  if (mainWindow) {
    mainWindow.webContents.send('musinsa:loginResult', payload);
  }
};

type MusinsaSessionStatus = {
  status: 'online' | 'offline';
  checkedAt: number;
  reason?: string;
  source: 'ping' | 'dom' | 'error';
};

const sendSessionStatus = (payload: MusinsaSessionStatus) => {
  if (mainWindow) {
    mainWindow.webContents.send('musinsa:sessionStatus', payload);
  }
};

ipcMain.on('musinsa:debugLog', (_event, payload) => {
  const source = payload?.source || 'unknown';
  const message = payload?.message || '';
  const meta = payload?.meta;
  const ts = new Date().toISOString();
  try {
    console.log(`[musinsa:debug][${ts}] ${source}: ${message}`, meta ?? '');
  } catch (e) {
    console.log(`[musinsa:debug][${ts}] payload_log_failed`, payload);
  }
});

const buildReviewTargetsFetchScript = () => `
  (async () => {
    const fmt = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return \`\${y}-\${m}-\${dd}\`;
    };
    const now = new Date();
    const searchToYmd = fmt(now);
    const searchFromYmd = fmt(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));

    const size = 20;
    const maxConcurrency = 4;
    const results = [];
    const errors = [];
    let pagesFetched = 0;
    let nextPage = 1;
    let done = false;

    const fetchPage = async (page) => {
      const qs = new URLSearchParams({
        page: String(page),
        size: String(size),
        searchFromYmd,
        searchToYmd,
        timestamp: String(Date.now()),
      });
      const res = await fetch(\`https://goods.musinsa.com/api2/review/v1/mypage/orders?\${qs.toString()}\`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('status_' + res.status);
      }
      const json = await res.json();
      const list = json?.data?.list;
      return Array.isArray(list) ? list : [];
    };

    const worker = async () => {
      while (!done) {
        const page = nextPage++;
        try {
          const list = await fetchPage(page);
          pagesFetched += 1;
          results.push(...list);
          if (list.length < size) {
            done = true;
          }
        } catch (err) {
          errors.push({ page, message: err?.message ?? String(err) });
          done = true;
        }
      }
    };

    await Promise.all(Array.from({ length: maxConcurrency }, worker));

    const reviewTargets = [];
    const confirmTargets = [];
    for (const item of results) {
      const writeList = Array.isArray(item?.writeItemList) ? item.writeItemList : [];
      const general = writeList.find((w) => w?.reviewType === 'general');
      const style = writeList.find((w) => w?.reviewType === 'style');
      const generalPending = general && general.wrote === false;
      const stylePending = style && style.wrote === false;

      if (item?.confirmed === false) {
        confirmTargets.push(item);
        continue;
      }
      if (item?.confirmed === true && generalPending && stylePending) {
        reviewTargets.push(item);
      }
    }

    return {
      ok: true,
      reviewTargets,
      confirmTargets,
      totalFetched: results.length,
      pagesFetched,
      errors,
      searchFromYmd,
      searchToYmd,
    };
  })();
`;

const runReviewTargetsFetchInWindow = async (win: BrowserWindow | null) => {
  if (!win || win.isDestroyed()) {
    return { ok: false as const, reason: 'window_missing' };
  }
  const script = buildReviewTargetsFetchScript();
  try {
    const result = await win.webContents.executeJavaScript(script, true);
    return result;
  } catch (error) {
    console.warn('[musinsa] fetch review targets failed', error);
    return { ok: false as const, reason: 'exception' };
  }
};

const fetchReviewTargets = async () => {
  if (!musinsaWindow || musinsaWindow.isDestroyed()) {
    return { ok: false as const, reason: 'musinsa_window_missing' };
  }
  return runReviewTargetsFetchInWindow(musinsaWindow);
};

const fetchReviewTargetsInReviewWindow = async () => {
  const win = await ensureReviewWindow();
  return runReviewTargetsFetchInWindow(win);
};

const checkMusinsaSession = async (): Promise<MusinsaSessionStatus> => {
  if (!musinsaWindow || musinsaWindow.isDestroyed()) {
    return { status: 'offline', checkedAt: Date.now(), reason: 'musinsa_window_missing', source: 'error' };
  }

  const script = `
    (async () => {
      const checkLogoutDom = () => {
        const link = document.querySelector('a._gnb__login_vuwmc_206');
        if (!link) return false;
        const hasSpan = link.querySelector('._logout_vuwmc_232');
        const text = (link.textContent || '').trim();
        return Boolean(hasSpan) || /로그아웃/i.test(text);
      };

      let pingOk = false;
      try {
        const qs = new URLSearchParams({
          page: '1',
          size: '1',
          timestamp: String(Date.now()),
        });
        const res = await fetch(\`https://goods.musinsa.com/api2/review/v1/mypage/orders?\${qs}\`, {
          credentials: 'include',
        });
        pingOk = res.ok;
      } catch (e) {
        pingOk = false;
      }

      const domLoggedIn = checkLogoutDom();
      if (pingOk || domLoggedIn) {
        return { status: 'online', domLoggedIn, pingOk };
      }
      return { status: 'offline', domLoggedIn, pingOk };
    })();
  `;

  try {
    const result = await musinsaWindow.webContents.executeJavaScript(script, true);
    const online = result?.status === 'online';
    return {
      status: online ? 'online' : 'offline',
      checkedAt: Date.now(),
      reason: online
        ? undefined
        : `ping:${result?.pingOk ? 'ok' : 'fail'}, dom:${result?.domLoggedIn ? 'yes' : 'no'}`,
      source: result?.pingOk ? 'ping' : 'dom',
    };
  } catch (error) {
    return { status: 'offline', checkedAt: Date.now(), reason: 'exception', source: 'error' };
  }
};

const startMusinsaSessionWatch = () => {
  if (musinsaSessionTimer) {
    clearInterval(musinsaSessionTimer);
  }
  const run = async () => {
    const status = await checkMusinsaSession();
    sendSessionStatus(status);
  };
  run();
  musinsaSessionTimer = setInterval(run, 5 * 60 * 1000); // 5분마다 체크
};

const performMusinsaLogout = async () => {
  if (!musinsaWindow || musinsaWindow.isDestroyed()) {
    return { status: 'error' as const, reason: 'musinsa_window_missing' };
  }
  try {
    const logoutResult = await musinsaWindow.webContents.executeJavaScript(
      `
        (async () => {
          const tryClick = () => {
            const link = document.querySelector('a[href*="auth/logout"], a._gnb__login_vuwmc_206');
            if (link && typeof link.click === 'function') {
              link.click();
              return 'clicked';
            }
            return 'not_found';
          };
          const result = tryClick();
          return result;
        })();
      `,
      true,
    );

    // 추가로 fetch 로그아웃 시도
    try {
      await musinsaWindow.webContents.executeJavaScript(
        `
          fetch('https://www.musinsa.com/auth/logout', { credentials: 'include' }).catch(() => {});
        `,
        true,
      );
    } catch (e) {
      // ignore
    }

    // 쿠키 정리
    const ses = musinsaWindow.webContents.session;
    const cookies = await ses.cookies.get({ domain: '.musinsa.com' });
    await Promise.all(
      cookies.map((c) =>
        ses.cookies.remove(`https://${c.domain?.replace(/^\./, '')}${c.path}`, c.name).catch(() => undefined),
      ),
    );

    await musinsaWindow.loadURL('https://www.musinsa.com/mypage');
    initialMusinsaLoginPrompted = false; // 다시 로그인 화면으로 진입하도록 초기화
    try {
      await musinsaWindow.webContents.executeJavaScript(
        `
          (async () => {
            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const selector = '#commonLayoutGnb > div > div:nth-child(2) > a._gnb__login_vuwmc_206';
            const started = Date.now();
            while (Date.now() - started < 4000) {
              const el = document.querySelector(selector);
              if (el && typeof el.click === 'function') {
                el.click();
                return 'clicked';
              }
              await sleep(150);
            }
            return 'not_found';
          })();
        `,
        true,
      );
    } catch (e) {
      // ignore
    }
    return { status: 'success' as const, action: logoutResult };
  } catch (error) {
    return { status: 'error' as const, reason: 'exception' };
  }
};
const performMusinsaLogin = async (loginId: string, password: string) => {
  if (!musinsaWindow || musinsaWindow.isDestroyed()) {
    return { status: 'error' as const, reason: 'musinsa_window_missing' };
  }
  try {
    const rendererAlertPromise = waitForRendererAlert(5000);
    const script = `
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const waitFor = async (selector, timeout = 3000) => {
          const started = Date.now();
          while (Date.now() - started < timeout) {
            const el = document.querySelector(selector);
            if (el) return el;
            await sleep(50);
          }
          return null;
        };
        const timeoutGuard = (ms) =>
          new Promise((resolve) => setTimeout(() => resolve({ ok: true, alertMsg: null, reason: 'no_alert_timeout' }), ms));
        const ensureAlertHook = () => {
          try {
            if (typeof window.__mmAlertHooked === 'undefined' || !window.__mmAlertHooked) {
              const stash = [];
              Object.defineProperty(window, '__mmAlerts', {
                get() { return stash; },
                set(v) {
                  stash.length = 0;
                  if (Array.isArray(v)) stash.push(...v.map((x) => String(x)));
                },
              });
              window.alert = (msg) => {
                stash.push(String(msg));
              };
              window.__mmAlertHooked = true;
            }
          } catch (e) {
            // ignore
          }
        };
        const clearAlertLog = () => {
          try {
            if (Array.isArray(window.__mmAlerts)) {
              window.__mmAlerts.length = 0;
            } else {
              window.__mmAlerts = [];
            }
          } catch (e) {
            // ignore
          }
        };
        const waitForAlertMessage = async (timeout = 5000) => {
          const started = Date.now();
          while (Date.now() - started < timeout) {
            if (Array.isArray(window.__mmAlerts) && window.__mmAlerts.length > 0) {
              return window.__mmAlerts[0];
            }
            await sleep(100);
          }
          return null;
        };
        const waitForNavigation = () =>
          new Promise((resolve) => {
            const handler = () => {
              resolve({ ok: true, alertMsg: window.__mmAlerts?.[0] ?? null, reason: 'navigated' });
            };
            window.addEventListener('beforeunload', handler, { once: true });
          });

        return Promise.race([
          (async () => {
            ensureAlertHook();
            clearAlertLog();

            const idInput = await waitFor('input[placeholder="통합계정 또는 이메일"], input[placeholder*="아이디"], input[name="loginId"], input[name="id"], input[type="text"]');
            const pwInput = await waitFor('input[placeholder="비밀번호"], input[type="password"]');
            if (!idInput || !pwInput) {
              return { ok: false, reason: 'input_not_found' };
            }

            const typeText = async (el, text) => {
              el.focus();
              el.value = '';
              for (const ch of text) {
                el.value += ch;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                await sleep(30);
              }
              el.dispatchEvent(new Event('change', { bubbles: true }));
            };

            await typeText(idInput, ${JSON.stringify(loginId)});
            await typeText(pwInput, ${JSON.stringify(password)});

            const loginButton =
              document.querySelector('button[data-button-id="login_login"]') ||
              document.querySelector('#loginForm button[type="submit"]') ||
              document.querySelector('button.login-v2-button__item[type="submit"]') ||
              document.querySelector('button[type="submit"]');

            const loginForm =
              (loginButton && loginButton.closest('form')) ||
              document.querySelector('form#loginForm') ||
              document.querySelector('form[action*="/auth"]');

            const clickButton = () => {
              if (!loginButton) return false;
              const opts = { bubbles: true, cancelable: true, view: window };
              ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) => {
                loginButton.dispatchEvent(new MouseEvent(type, opts));
              });
              return true;
            };

            const submitForm = () => {
              if (!loginForm) return false;
              if (typeof loginForm.requestSubmit === 'function') {
                loginForm.requestSubmit(loginButton || undefined);
                return true;
              }
              const evt = new Event('submit', { bubbles: true, cancelable: true });
              const prevented = !loginForm.dispatchEvent(evt);
              if (!prevented && typeof loginForm.submit === 'function') {
                loginForm.submit();
              }
              return true;
            };

            const triggerEnter = () => {
              const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
              pwInput.dispatchEvent(new KeyboardEvent('keydown', opts));
              pwInput.dispatchEvent(new KeyboardEvent('keypress', opts));
              pwInput.dispatchEvent(new KeyboardEvent('keyup', opts));
              return true;
            };

            if (!clickButton()) {
              if (!submitForm()) {
                triggerEnter();
              }
            }

            const alertMsgPromise = waitForAlertMessage(2000);
            const navPromise = waitForNavigation();
            const alertResult = await Promise.race([alertMsgPromise.then((msg) => ({ alertMsg: msg })), navPromise]);
            const alertMsg = alertResult?.alertMsg ?? null;
            return { ok: true, alertMsg };
          })(),
          timeoutGuard(8000),
        ]);
      })();
    `;

    const result = await musinsaWindow.webContents.executeJavaScript(script, true).catch((err) => {
      const msg = err?.message || '';
      // 네비게이션/프레임 파괴 시도는 성공으로 간주(알림이 없으면 성공으로 취급)
      if (/was (destroyed|detached)|frame was removed/i.test(msg)) {
        return { ok: true, alertMsg: null, reason: 'frame_destroyed' };
      }
      throw err;
    });

    const rendererAlert = await rendererAlertPromise;
    const alertMsg = rendererAlert ?? result?.alertMsg ?? null;

    if (!result?.ok) {
      return { status: 'error' as const, reason: result?.reason ?? 'unknown' };
    }
    if (alertMsg) {
      return { status: 'alert' as const, reason: String(alertMsg) };
    }
    sendSessionStatus({
      status: 'online',
      checkedAt: Date.now(),
      source: 'dom',
    });
    console.log('[musinsa] login success (no alert)');
    return { status: 'success' as const };
  } catch (error) {
    console.warn('[musinsa] login automation failed', error);
    return { status: 'error' as const, reason: 'exception' };
  }
};

ipcMain.handle('musinsa:login', async (_event, payload: { loginId: string; password: string }) => {
  console.log('[musinsa] ipc login invoked');
  const res = await performMusinsaLogin(payload.loginId, payload.password);
  console.log('[musinsa] ipc login result', res);
  sendLoginResult(res);
  if (res.status === 'success') {
    startMusinsaSessionWatch();
  }
  return res;
});

ipcMain.handle('musinsa:fetchReviewTargets', async () => {
  return fetchReviewTargets();
});

ipcMain.handle(
  'musinsa:confirmOrders',
  async (
    _event,
    payload: { items: { orderNo: string; orderOptionNo: number }[] },
  ) => {
    if (!musinsaWindow || musinsaWindow.isDestroyed()) {
      return { ok: false as const, reason: 'musinsa_window_missing' };
    }
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (items.length === 0) {
      return { ok: false as const, reason: 'empty_payload' };
    }

    const script = `
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const queue = ${JSON.stringify(items)};
        const results = [];
        const maxConcurrency = ${MUSINSA_CONFIRM_CONCURRENCY};
        let active = 0;
        let idx = 0;

        const worker = async () => {
          while (idx < queue.length) {
            const current = queue[idx++];
            active += 1;
            try {
              const url = \`https://order.musinsa.com/api2/order/v1/orders/\${current.orderNo}/items/\${current.orderOptionNo}/confirm\`;
              const res = await fetch(url, {
                method: 'PUT',
                credentials: 'include',
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                  Origin: 'https://www.musinsa.com',
                  Referer: 'https://www.musinsa.com/',
                },
                body: JSON.stringify({ orderConfirmTrigger: 'mypage' }),
              });
              const json = await res.json().catch(() => ({}));
              if (!res.ok || json?.meta?.result !== 'SUCCESS') {
                throw new Error(json?.meta?.errorCode || ('status_' + res.status));
              }
              results.push({
                ok: true,
                orderNo: current.orderNo,
                orderOptionNo: current.orderOptionNo,
                confirmedAt: json?.data?.orderConfirmedDate ?? null,
              });
            } catch (e) {
              results.push({
                ok: false,
                orderNo: current.orderNo,
                orderOptionNo: current.orderOptionNo,
                reason: e?.message ?? String(e),
              });
            } finally {
              active -= 1;
              await sleep(50);
            }
          }
        };

        const workers = Array.from({ length: Math.min(maxConcurrency, queue.length) }, worker);
        await Promise.all(workers);
        return { ok: true, results };
      })();
    `;

    try {
      const res = await musinsaWindow.webContents.executeJavaScript(script, true);
      return res;
    } catch (error) {
      return { ok: false as const, reason: 'exception' };
    }
  },
);

type WriteReviewPayload = {
  items: Array<{
    orderNo: string;
    orderOptionNo: number;
    goodsNo: number;
    productKey: string;
    template: {
      product_type?: string | null;
      gender?: string | null;
      height?: string | null;
      weight?: string | null;
      general_content?: string | null;
      general_image_path?: string | null;
      style_content?: string | null;
      style_image_path?: string | null;
    };
  }>;
};

const buildCookieHeader = async () => {
  if (!musinsaWindow || musinsaWindow.isDestroyed()) return '';
  const ses = musinsaWindow.webContents.session;
  const cookies = await ses.cookies.get({});
  const pairs = cookies
    .filter((c) => c.domain && c.domain.includes('musinsa.com'))
    .map((c) => `${c.name}=${c.value}`);
  return pairs.join('; ');
};

const defaultSatisfaction = [
  { questionId: 1427, answerId: 7130 },
  { questionId: 1428, answerId: 7135 },
  { questionId: 1429, answerId: 7140 },
  { questionId: 1430, answerId: 7145 },
];

const fetchBeforeWrite = async (
  channelActivityId: number,
  reviewType: 'general' | 'style',
  cookieHeader: string,
) => {
  try {
    const res = await fetch(
      `https://goods.musinsa.com/api2/review/v1/mypage/reviews/before-write?channelActivityId=${channelActivityId}&channelSource=musinsa&reviewType=${reviewType}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Cookie: cookieHeader,
          Origin: 'https://www.musinsa.com',
          Referer: 'https://www.musinsa.com/',
          'Accept-Language': 'ko',
          'User-Agent': musinsaWindow?.webContents.getUserAgent() || '',
        },
      },
    );
    const json: any = await res.json().catch(() => ({} as any));
    if (!res.ok || (json as any)?.meta?.result !== 'SUCCESS') {
      return { ok: false, reason: (json as any)?.meta?.errorCode || ('status_' + res.status), body: JSON.stringify(json).slice(0, 400) };
    }
    return { ok: true, data: (json as any)?.data };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'before_write_failed' };
  }
};

const uploadImageWithPresign = async (
  goodsNo: number,
  filePath: string,
  cookieHeader: string,
): Promise<{ fileName: string; url: string; fileSize: number } | null> => {
  if (!fs.existsSync(filePath)) {
    throw new Error('image_not_found');
  }
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  if (fileSize > 6 * 1024 * 1024) {
    throw new Error('image_too_large');
  }
  const ext = path.extname(filePath) || '.jpg';
  const fileName = `${Date.now()}_${path.basename(filePath)}`;
  const presignRes = await fetch('https://goods.musinsa.com/api2/review/v1/review/pre-signed-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Cookie: cookieHeader,
      Origin: 'https://www.musinsa.com',
      Referer: 'https://www.musinsa.com/',
    },
    body: JSON.stringify({
      goodsNo,
      fileNameList: [fileName],
    }),
  });
  const presignJson: any = await presignRes.json().catch(() => ({} as any));
  if (!presignRes.ok || presignJson?.meta?.result !== 'SUCCESS') {
    throw new Error('presign_failed');
  }
  const entry = Array.isArray(presignJson?.data) ? presignJson.data[0] : null;
  if (!entry?.preSignedUrl || !entry?.fileName) {
    throw new Error('presign_invalid');
  }
  const contentType =
    ext.toLowerCase() === '.png'
      ? 'image/png'
      : ext.toLowerCase() === '.webp'
        ? 'image/webp'
        : ext.toLowerCase() === '.gif'
          ? 'image/gif'
          : 'image/jpeg';
  const buf = fs.readFileSync(filePath);
  const uploadRes = await fetch(entry.preSignedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: buf,
  });
  if (!uploadRes.ok) {
    throw new Error('upload_failed');
  }
  return { fileName: entry.fileName, url: entry.url ?? '', fileSize };
};

ipcMain.handle('musinsa:readFile', async (_event, payload: { path?: string }) => {
  const filePath = payload?.path;
  if (!filePath) return null;
  try {
    const buf = await fs.promises.readFile(filePath);
    return buf.toString('base64');
  } catch (e) {
    console.warn('[musinsa:readFile] failed', e);
    return null;
  }
});

const setFileInputFilesViaCDP = async (selector: string, files: string[]) => {
  const win = musinsaReviewWindow && !musinsaReviewWindow.isDestroyed() ? musinsaReviewWindow : musinsaWindow;
  if (!win) return { ok: false as const, reason: 'window_missing' };
  if (!Array.isArray(files) || files.length === 0) return { ok: false as const, reason: 'empty_files' };
  const dbg = win.webContents.debugger;
  const wasAttached = dbg.isAttached();
  const started = Date.now();
  const logResult = (result: any) => {
    console.log('[musinsa:setFileInputFilesViaCDP]', {
      selector,
      files,
      wasAttached,
      durationMs: Date.now() - started,
      result,
    });
  };
  try {
    if (!wasAttached) {
      dbg.attach('1.3');
    }
    const { root } = await dbg.sendCommand('DOM.getDocument', { depth: -1 });
    const { nodeId } = await dbg.sendCommand('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: selector || 'input[type="file"]',
    });
    if (!nodeId) {
      const result = { ok: false as const, reason: 'node_not_found' };
      logResult(result);
      return result;
    }
    await dbg.sendCommand('DOM.setFileInputFiles', {
      nodeId,
      files,
    });
    const result = { ok: true as const };
    logResult(result);
    return result;
  } catch (e: any) {
    const result = { ok: false as const, reason: e?.message || 'cdp_error' };
    logResult(result);
    return result;
  } finally {
    if (!wasAttached && dbg.isAttached()) {
      try {
        dbg.detach();
      } catch (e) {
        // ignore
      }
    }
  }
};

ipcMain.handle('musinsa:setFileInputFiles', async (_event, payload: { selector?: string; files?: string[] }) => {
  const selector = payload?.selector || 'input[type="file"]';
  const files = Array.isArray(payload?.files) ? payload!.files : [];
  return setFileInputFilesViaCDP(selector, files);
});

ipcMain.handle('musinsa:writeReviews', async (_event, payload: WriteReviewPayload) => {
  if (!musinsaWindow || musinsaWindow.isDestroyed()) {
    return { ok: false as const, reason: 'musinsa_window_missing' };
  }
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length === 0) {
    return { ok: false as const, reason: 'empty_payload' };
  }
  const cookieHeader = await buildCookieHeader();
  const results: any[] = [];
  const log = (...args: any[]) => console.log('[musinsa:writeReviews]', ...args);

  log('start', { count: items.length });

  for (const item of items) {
    const {
      orderNo,
      orderOptionNo,
      goodsNo,
      template: {
        product_type,
        gender,
        height,
        weight,
        general_content,
        general_image_path,
        style_content,
        style_image_path,
      },
    } = item;
    log('item start', { orderNo, orderOptionNo, goodsNo });
    const uploads: Record<'general' | 'style', { fileName: string; url: string; fileSize: number } | null> = {
      general: null,
      style: null,
    };
    try {
      if (general_image_path) {
        log('presign/upload general', { orderNo, orderOptionNo, path: general_image_path });
        uploads.general = await uploadImageWithPresign(goodsNo, general_image_path, cookieHeader);
        log('presign/upload general done', uploads.general);
      }
      if (style_image_path) {
        log('presign/upload style', { orderNo, orderOptionNo, path: style_image_path });
        uploads.style = await uploadImageWithPresign(goodsNo, style_image_path, cookieHeader);
        log('presign/upload style done', uploads.style);
      }
    } catch (e) {
      log('upload error', { orderNo, orderOptionNo, err: e instanceof Error ? e.message : String(e) });
      results.push({ ok: false, orderNo, orderOptionNo, reason: e instanceof Error ? e.message : 'upload_error' });
      continue;
    }

    const toPost = async (
      reviewType: 'general' | 'style',
      content?: string | null,
      upload?: { fileName: string; url: string; fileSize: number } | null,
    ) => {
      if (!content || content.trim().length === 0) {
        return { ok: false, reason: 'content_missing' };
      }
      log('before-write request', { orderNo, orderOptionNo, reviewType });
      const before = await fetchBeforeWrite(orderOptionNo, reviewType, cookieHeader);
      log('before-write response', {
        orderNo,
        orderOptionNo,
        reviewType,
        ok: before?.ok,
        reason: (before as any)?.reason,
        hasData: !!before?.data,
        body: (before as any)?.body,
        dataSample: before?.data ? JSON.stringify(before.data).slice(0, 1200) : undefined,
      });
      if (before && !before.ok) {
        return { ok: false, reason: before.reason, body: before.body };
      }
      const profile = before?.data?.reviewProfile || {};
      const satisfactionFromBefore = before?.data?.satisfaction;
      // orderOptionNo/experienceNo: before-write가 주는 값이 없으면 원본 옵션 번호, experienceNo는 없으면 null
      const orderOptionNoBody =
        typeof before?.data?.orderOptionNo === 'number' && before?.data?.orderOptionNo > 0
          ? before?.data?.orderOptionNo
          : orderOptionNo;
      const experienceNoBody =
        typeof before?.data?.experienceNo === 'number'
          ? before?.data?.experienceNo
          : null;
      const relatedNo = before?.data?.relatedNo;
      const body: any = {
        shareProfile: true,
        channelActivityId: String(orderOptionNo),
        channelSource: 'musinsa',
        experienceNo: experienceNoBody,
        orderOptionNo: orderOptionNoBody,
        reviewContent: content,
        reviewType,
        score: 5,
        satisfaction: Array.isArray(satisfactionFromBefore) ? satisfactionFromBefore : defaultSatisfaction,
        sex:
          product_type === '의류'
            ? gender === '남성'
              ? 'M'
              : gender === '여성'
                ? 'F'
                : undefined
            : undefined,
        height:
          product_type === '의류' && height && String(height).trim() !== ''
            ? Number(height)
            : undefined,
        weight:
          product_type === '의류' && weight && String(weight).trim() !== ''
            ? Number(weight)
            : undefined,
        updateMySize: false,
        skinWorry: [],
        images: upload
          ? [
              {
                fileName: upload.fileName,
                fileSize: upload.fileSize,
                url: upload.url,
              },
            ]
          : [],
      };
      if (relatedNo !== undefined && relatedNo !== null) {
        body.relatedNo = relatedNo;
      }
      const userAgent = musinsaWindow?.webContents.getUserAgent();
      log('post payload', {
        orderNo,
        orderOptionNo,
        reviewType,
        channelActivityId: body.channelActivityId,
        experienceNo: body.experienceNo,
        relatedNo: body.relatedNo,
        hasImage: body.images?.length > 0,
        contentLength: content.length,
        sex: body.sex,
        height: body.height,
        weight: body.weight,
        satisfaction: body.satisfaction,
        bodyJson: JSON.stringify(body).slice(0, 800),
      });
      const res = await fetch('https://goods.musinsa.com/api2/review/v1/mypage/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Cookie: cookieHeader,
          Origin: 'https://www.musinsa.com',
          Referer: 'https://www.musinsa.com/',
          'Accept-Language': 'ko,en;q=0.9,en-US;q=0.8,zh;q=0.7,zh-CN;q=0.6,zh-TW;q=0.5,zh-HK;q=0.4',
          'User-Agent': userAgent || '',
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      log('post response', { orderNo, orderOptionNo, reviewType, status: res.status, body: text?.slice(0, 800) });
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch (e) {
        // ignore parse error
      }
      if (!res.ok || json?.meta?.result !== 'SUCCESS') {
        // REVIEW-000-0001 같은 코드가 body에만 있을 수 있음
        const errorCodeFromBody = json?.meta?.errorCode || (json?.errorCode ?? null);
        const messageFromBody = json?.meta?.message || json?.message || null;
        return {
          ok: false,
          status: res.status,
          errorCode: errorCodeFromBody,
          message: messageFromBody,
          body: text?.slice(0, 500),
        };
      }
      return { ok: true, reviewId: json?.data };
    };

    try {
      const genResult = await toPost('general', general_content, uploads.general);
      const styleResult = await toPost('style', style_content, uploads.style);
      const allOk = genResult.ok && styleResult.ok;
      const reason = !genResult.ok
        ? genResult.errorCode || genResult.message || (genResult as any).reason || String(genResult.status || '') || 'general_failed'
        : !styleResult.ok
          ? styleResult.errorCode || styleResult.message || (styleResult as any).reason || String(styleResult.status || '') || 'style_failed'
          : undefined;
      results.push({
        ok: allOk,
        reason,
        orderNo,
        orderOptionNo,
        general: genResult,
        style: styleResult,
      });
      log('item done', { orderNo, orderOptionNo, ok: allOk, reason });
    } catch (e) {
      log('item exception', { orderNo, orderOptionNo, err: e instanceof Error ? e.message : String(e) });
      results.push({ ok: false, orderNo, orderOptionNo, reason: e instanceof Error ? e.message : 'submit_failed' });
    }
  }

  return { ok: true as const, results };
});

const buildReviewWriteUrl = (orderOptionNo: number, mode: 'general' | 'style') =>
  `https://www.musinsa.com/mypage/myreview/write/${mode === 'general' ? 'general' : 'style'}/${orderOptionNo}?doneToBack=true&channelSource=musinsa`;

const buildDomReviewScript = (item: any, mode: 'general' | 'style') => {
  return `
    (async () => {
      const target = ${JSON.stringify(item)};
      const template = target.template || {};
      const skipSubmit = Boolean(target.skipSubmit || template.skip_submit || template.skipSubmit);
      const skipCompleteClick = Boolean(
        target.skipCompleteClick ?? template.skip_complete_click ?? template.skipCompleteClick ?? true,
      );
      const mode = ${JSON.stringify(mode)};
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const normalize = (v) => (v || '').replace(/\s+/g, '').toLowerCase();

      const goList = async () => {
        const targetUrl = 'https://www.musinsa.com/mypage/myreview';
        if (location.href !== targetUrl) {
          history.replaceState(null, '', targetUrl);
          location.href = targetUrl;
        }
        for (let i = 0; i < 120; i++) {
          const list = document.querySelector("[data-testid='virtuoso-item-list']");
          if (list) return true;
          await sleep(200);
        }
        return false;
      };

      const extractInfo = (container) => {
        const info = { brand: '', product: '', option: '' };
        try {
          const brandSpan = container.querySelector("span[title][data-mds='Typography']");
          const productSpans = Array.from(container.querySelectorAll("span[title][data-mds='Typography']"));
          if (brandSpan) info.brand = (brandSpan.getAttribute('title') || brandSpan.textContent || '').trim();
          if (productSpans[1]) info.product = (productSpans[1].getAttribute('title') || productSpans[1].textContent || '').trim();
        } catch (e) {
          /* ignore */
        }
        try {
          const optSpan = container.querySelector("div[class*='PurchaseOption'] span[title], span[title][data-mds='Typography']");
          if (optSpan) info.option = (optSpan.getAttribute('title') || optSpan.textContent || '').trim();
        } catch (e) {
          /* ignore */
        }
        if (!info.brand || !info.product) {
          try {
            const anchor = container.querySelector('a[data-item-brand]');
            if (anchor) {
              if (!info.brand) info.brand = (anchor.getAttribute('data-item-brand') || '').trim();
              if (!info.product) info.product = (anchor.getAttribute('title') || anchor.textContent || '').trim();
            }
          } catch (e) {
            /* ignore */
          }
        }
        return info;
      };

      const matchContainer = (container) => {
        const info = extractInfo(container);
        const brandOk = normalize(info.brand) === normalize(target.brandName || target.brand || '');
        const productOk = normalize(info.product) === normalize(target.goodsName || '');
        const optionOk = normalize(info.option) === normalize(target.goodsOptionName || '');
        const optionNos = [
          container.getAttribute('data-order-option-no'),
          container.getAttribute('data-option-no'),
          container.getAttribute('data-channel-activity-id'),
        ]
          .map((v) => Number(v))
          .filter((v) => !Number.isNaN(v));
        const textAttrs = [
          container.getAttribute('data-item-index'),
          container.getAttribute('data-react-beacon-id'),
          container.innerHTML,
        ]
          .filter(Boolean)
          .map((v) => String(v));
        const optionNoMatch =
          optionNos.includes(Number(target.orderOptionNo)) ||
          textAttrs.some((v) => v.includes(String(target.orderOptionNo)));
        const hrefMatch = (() => {
          try {
            const link = container.querySelector('a[href*="myreview/write"],a[href*="channelActivityId"],a[href*="orderOptionNo"]');
            const href = link?.getAttribute('href') || '';
            return href.includes(String(target.orderOptionNo));
          } catch (e) {
            return false;
          }
        })();
        return optionNoMatch || hrefMatch || (brandOk && productOk && optionOk);
      };

      const findContainer = async () => {
        const selector = "div[data-item-index]";
        let tries = 0;
        while (tries < 60) {
          const containers = Array.from(document.querySelectorAll(selector)).map((c) => {
            const directCard = c.querySelector('.ReviewAbleItem__Container-sc-1mz74fe-0') || c;
            return directCard;
          });
          for (const c of containers) {
            if (matchContainer(c)) {
              return c;
            }
          }
          window.scrollBy(0, 800);
          await sleep(250);
          tries += 1;
        }
        return null;
      };

      const setInputValue = (el, value) => {
        if (!el) return;
        const proto = Object.getPrototypeOf(el);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) {
          setter.call(el, value ?? '');
        } else {
          el.value = value ?? '';
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      const debugLog = (message, meta = {}) => {
        try {
          if (window.musinsaBridge && typeof window.musinsaBridge.debugLog === 'function') {
            window.musinsaBridge.debugLog(message, meta);
          }
        } catch (e) {
          /* ignore */
        }
        try {
          console.log('[mm-upload]', message, meta);
        } catch (e) {
          /* ignore */
        }
      };

      const uploadFile = async (filePath) => {
        debugLog('upload:start', { filePath });
        if (!filePath) {
          debugLog('upload:skip_no_path');
          return false;
        }
        if (!window.musinsaBridge || typeof window.musinsaBridge.readFile !== 'function') {
          debugLog('upload:no_bridge');
          return false;
        }
        let base64 = null;
        try {
          base64 = await window.musinsaBridge.readFile(filePath);
        } catch (e) {
          debugLog('upload:read_error', { error: e?.message || String(e) });
          return false;
        }
        if (!base64) {
          debugLog('upload:empty_base64');
          return false;
        }
        debugLog('upload:read_success', { length: base64.length });
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes]);
        const name = filePath.split(/[\\\\/]/).pop() || 'upload.jpg';
        const file = new File([blob], name);
        const dt = new DataTransfer();
        dt.items.add(file);

        const pickInput = () => {
          const candidates = Array.from(
            document.querySelectorAll(
              'input.UploadingImageBox__Input-sc-1sm534o-1,input.UploadingImageBox__HiddenInput-sc-1sm534o-2,input[type="file"],.ReviewUploadImage__ImageGroup-sc-1nx69l8-2 input[type="file"]',
            ),
          );
          const empty = candidates.find((i) => !i.value);
          const picked = empty || candidates[candidates.length - 1] || null;
          debugLog('upload:pick_input', {
            candidates: candidates.length,
            pickedHasValue: Boolean(picked && picked.value),
          });
          return picked;
        };

        let input = pickInput();
        let tries = 0;
        while (!input && tries < 20) {
          try {
            const trigger = document.querySelector('.ReviewUploadImage__ImageGroup-sc-1nx69l8-2 .UploadingImageBox__Container-sc-1sm534o-0');
            if (trigger) {
              trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            }
          } catch (e) {
            /* ignore */
          }
          await sleep(200);
          input = pickInput();
          tries += 1;
          debugLog('upload:retry_pick', { tries, found: Boolean(input) });
        }
        if (input) {
          try {
            input.scrollIntoView({ block: 'center' });
          } catch (e) {
            /* ignore */
          }
          input.files = dt.files;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          try {
            const form = input.closest('form') || document.querySelector('form');
            if (form) form.dispatchEvent(new Event('change', { bubbles: true }));
          } catch (e) {
            /* ignore */
          }
          const fileCount = (input.files && input.files.length) || 0;
          debugLog('upload:set_input', { tries, fileCount, dtItems: dt.items?.length || 0 });
          return true;
        }

        // fallback: CDP setFileInputFiles
        if (window.musinsaBridge && typeof window.musinsaBridge.setFileInputFiles === 'function') {
          try {
            debugLog('upload:cdp_start', { selector: '.ReviewUploadImage__ImageGroup-sc-1nx69l8-2 input[type=\"file\"],input[type=\"file\"]' });
            const res = await window.musinsaBridge.setFileInputFiles(
              '.ReviewUploadImage__ImageGroup-sc-1nx69l8-2 input[type=\"file\"],input[type=\"file\"]',
              [filePath],
            );
            if (res && res.ok) {
              debugLog('upload:cdp_success', { reason: res?.reason });
              return true;
            }
            debugLog('upload:cdp_fail', { reason: res?.reason });
          } catch (e) {
            debugLog('upload:cdp_error', { error: e?.message || String(e) });
          }
        }
        debugLog('upload:failed');
        return false;
      };

      const clickSafe = (el) => {
        if (!el) return;
        try {
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        } catch (e) {
          try {
            el.click();
          } catch (err) {
            /* ignore */
          }
        }
      };

      const waitForForm = async () => {
        for (let i = 0; i < 120; i++) {
          const textarea =
            document.querySelector('textarea[name="reviewContent"]') ||
            document.querySelector('textarea[data-testid]') ||
            document.querySelector('textarea');
          if (textarea) return textarea;
          await sleep(200);
        }
        return null;
      };

      const waitForWritePage = async () => {
        for (let i = 0; i < 120; i++) {
          if (location.href.includes('/mypage/myreview/write')) return true;
          await sleep(150);
        }
        return false;
      };

      const needsBody = (template.product_type || '').trim() !== '신발' && (template.product_type || '').trim() !== '잡화';

      let textarea = null;

      // 작성 페이지에 이미 있다면 폼을 바로 기다립니다.
      if (location.href.includes('/mypage/myreview/write')) {
        textarea = await waitForForm();
      }

      // 리스트에서 버튼 클릭 후 이동하는 경로를 기본으로 사용
      if (!textarea) {
        if (!(await goList())) {
          return { ok: false, reason: 'list_timeout' };
        }

        const container = await findContainer();
        if (!container) {
          return { ok: false, reason: 'container_not_found' };
        }
        const buttons = Array.from(container.querySelectorAll('a button, button'));
        const targetBtn = buttons.find((btn) => {
          const txt = (btn.textContent || '').replace(/\s+/g, '');
          if (mode === 'general') {
            return txt.includes('후기작성') && !txt.includes('스타일') && !txt.includes('완료') && !txt.includes('기간만료');
          }
          return txt.includes('스타일후기작성') && !txt.includes('완료') && !txt.includes('기간만료');
        });
        if (!targetBtn) {
          return { ok: false, reason: 'button_not_found' };
        }
        targetBtn.scrollIntoView({ block: 'center' });
        clickSafe(targetBtn);
        await waitForWritePage();
        textarea = await waitForForm();
      }

      // 폼이 끝내 준비되지 않으면 실패 처리
      if (!textarea) {
        return { ok: false, reason: 'form_not_ready' };
      }

      try {
        const starExplicit =
          document.querySelector("button[aria-label*='5점']") ||
          document.querySelector("button[aria-label*='별점'][aria-label*='5']");
        if (starExplicit) {
          clickSafe(starExplicit);
        } else {
          const stars =
            Array.from(document.querySelectorAll('.StarScore__StarGroup-sc-udpksw-2.bQBXgW > div')) ||
            Array.from(document.querySelectorAll('div[class*="StarScore"] > div > div'));
          const star = stars[stars.length - 1] || stars[4] || stars[0];
          if (star) {
            clickSafe(star);
            const svg = star.querySelector('svg');
            if (svg) clickSafe(svg);
          }
        }
      } catch (e) {
        /* ignore */
      }

      try {
        const questions =
          Array.from(document.querySelectorAll('.SatisfactionQuestions__Container-sc-12q7sgr-0.iKgIHa > div')) ||
          Array.from(document.querySelectorAll('[class*="SatisfactionQuestions"] > div'));
        questions.forEach((q) => {
          const direct = q.querySelector('div.Answer__AnswerWrapper-sc-mvl9p5-2:nth-child(5) button, div.Answer__Wrapper-sc-mvl9p5-0.iabSQi > div > div:nth-child(5) button');
          if (direct) {
            clickSafe(direct);
            return;
          }
          const btns = Array.from(q.querySelectorAll('button'));
          if (btns.length > 0) {
            const pick = btns[Math.min(btns.length - 1, 4)] || btns[btns.length - 1];
            clickSafe(pick);
          }
        });
      } catch (e) {
        /* ignore */
      }

      const content = mode === 'general' ? template.general_content || '' : template.style_content || '';
      setInputValue(textarea, content);

      if (needsBody) {
        try {
          const genderText = template.gender;
          if (genderText) {
            const chips = Array.from(document.querySelectorAll('button[data-mds="Chip"]'));
            const targetChip = chips.find((c) => (c.textContent || '').trim() === genderText);
            if (targetChip) clickSafe(targetChip);
          }
        } catch (e) {
          /* ignore */
        }
        try {
          const numberInputs = Array.from(
            document.querySelectorAll('div.ReviewBody__ClearableTextField-sc-h2fdld-5.dvrynB input'),
          );
          if (numberInputs[0]) setInputValue(numberInputs[0], template.height || '');
          if (numberInputs[1]) setInputValue(numberInputs[1], template.weight || '');
        } catch (e) {
          /* ignore */
        }
      }

      const imagePath = mode === 'general' ? template.general_image_path : template.style_image_path;
      try {
        await uploadFile(imagePath);
      } catch (e) {
        /* ignore */
      }

      try {
        const allAgree = document.querySelector('.AllAgree__Container-sc-1ze1dl-0.eNTziq button');
        if (allAgree) clickSafe(allAgree);
      } catch (e) {
        /* ignore */
      }

      if (skipSubmit) {
        return { ok: true, skipped: 'submit' };
      }

      let submitBtn =
        document.querySelector("button[data-button-name='등록하기']") ||
        document.querySelector("button.gtm-click-button[data-button-id='check']") ||
        document.querySelector("button.gtm-click-button[data-button-name='등록하기']") ||
        document.querySelector('button[type="submit"]');
      if (!submitBtn) {
        return { ok: false, reason: 'submit_not_found' };
      }
      submitBtn.scrollIntoView({ block: 'center' });
      await sleep(200);
      clickSafe(submitBtn);

      for (let i = 0; i < 50; i++) {
        const dialogBtn = Array.from(document.querySelectorAll('button')).find((b) => {
          const txt = (b.textContent || '').trim();
          return /확인/.test(txt);
        });
        if (dialogBtn) {
          clickSafe(dialogBtn);
          break;
        }
        await sleep(200);
      }

      if (skipCompleteClick) {
        debugLog('complete_click:skipped', { mode });
        return { ok: true, skipped: 'complete_click' };
      }

      // 완료 페이지(확인) 처리
      for (let i = 0; i < 80; i++) {
        const completeBtn =
          document.querySelector('#__next > main > div.Footer__Container-sc-ncdyhi-0.iceuL > button') ||
          Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === '확인');
        if (completeBtn) {
          clickSafe(completeBtn);
          break;
        }
        await sleep(200);
      }

      for (let i = 0; i < 120; i++) {
        if (location.href.includes('/mypage/myreview') && document.querySelector("[data-testid='virtuoso-item-list']")) {
          return { ok: true };
        }
        await sleep(250);
      }

      return { ok: true };
    })();
  `;
};
const runDomReviewTask = async (item: any, mode: 'general' | 'style') => {
  try {
    const win = await ensureReviewWindow();
    if (item?.orderOptionNo) {
      const directUrl = buildReviewWriteUrl(item.orderOptionNo, mode);
      try {
        await win.loadURL(directUrl);
      } catch (e) {
        // fallback to list within script
        await win.loadURL('https://www.musinsa.com/mypage/myreview');
      }
    } else {
      await win.loadURL('https://www.musinsa.com/mypage/myreview');
    }
    const script = buildDomReviewScript(item, mode);
    const res = await win.webContents.executeJavaScript(script, true);
    return res;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'dom_exec_failed' };
  }
};

ipcMain.handle('musinsa:writeReviewsDom', async (_event, payload: any) => {
  if (!musinsaWindow || musinsaWindow.isDestroyed()) {
    return { ok: false as const, reason: 'musinsa_window_missing' };
  }
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length === 0) {
    return { ok: false as const, reason: 'empty_payload' };
  }
  const reviewWindowFetch = await fetchReviewTargetsInReviewWindow();
  if (!reviewWindowFetch?.ok) {
    return { ok: false as const, reason: reviewWindowFetch?.reason ?? 'review_window_fetch_failed' };
  }
  const reviewableList = Array.isArray(reviewWindowFetch?.reviewTargets) ? reviewWindowFetch.reviewTargets : [];
  const normalize = (v: any) => String(v ?? '').replace(/\s+/g, '').toLowerCase();
  const results: any[] = [];
  for (const item of items) {
    const { orderNo, orderOptionNo } = item;
    const matched =
      reviewableList.find((r: any) => r.orderOptionNo === orderOptionNo && r.orderNo === orderNo) ||
      reviewableList.find((r: any) => r.orderOptionNo === orderOptionNo) ||
      reviewableList.find(
        (r: any) =>
          r.goodsNo === item.goodsNo &&
          normalize(r.goodsOptionName) === normalize(item.goodsOptionName ?? item.template?.option_text ?? ''),
      ) ||
      reviewableList.find(
        (r: any) =>
          normalize(r.goodsName) === normalize(item.goodsName) &&
          normalize(r.brandName || r.brand) === normalize(item.brandName || item.brand) &&
          normalize(r.goodsOptionName) === normalize(item.goodsOptionName),
      );

    if (!matched) {
      results.push({ ok: false, orderNo, orderOptionNo, reason: 'not_found_in_review_window' });
      continue;
    }

    const mergedItem = {
      ...matched,
      ...item,
      orderNo: matched.orderNo ?? item.orderNo,
      orderOptionNo: matched.orderOptionNo ?? item.orderOptionNo,
      goodsNo: matched.goodsNo ?? item.goodsNo,
      goodsName: matched.goodsName ?? item.goodsName,
      goodsOptionName: matched.goodsOptionName ?? item.goodsOptionName,
      brandName: matched.brandName ?? matched.brand ?? item.brandName ?? item.brand ?? '',
      template: item.template,
    };

    const entry: any = { orderNo: mergedItem.orderNo, orderOptionNo: mergedItem.orderOptionNo };
    const generalNeeded = (mergedItem.template?.general_content || '').trim().length > 0;
    const styleNeeded = (mergedItem.template?.style_content || '').trim().length > 0;
    if (generalNeeded) {
      entry.general = await runDomReviewTask(mergedItem, 'general');
    }
    if (styleNeeded) {
      entry.style = await runDomReviewTask(mergedItem, 'style');
    }
    entry.ok = (!entry.general || entry.general.ok !== false) && (!entry.style || entry.style.ok !== false);
    results.push(entry);
  }
  return { ok: true as const, results };
});

ipcMain.handle('musinsa:closeReviewWindow', async () => {
  closeReviewWindow();
  return { ok: true as const };
});

ipcMain.handle('app:loginSupabase', async (_event, payload: { loginId: string; password: string }) => {
  const loginId = (payload?.loginId || '').trim();
  const password = payload?.password || '';
  if (!loginId || !password) {
    return { ok: false as const, message: '아이디와 비밀번호를 입력하세요.' };
  }
  const email = `${loginId}@local.fake`;
  try {
    const { data, error } = await supabaseNode.auth.signInWithPassword({ email, password });
    if (error || !data?.user) {
      return { ok: false as const, message: error?.message || '로그인에 실패했습니다.' };
    }
    const userId = data.user.id;
    const { data: profile, error: profileError } = await supabaseNode
      .from('profiles')
      .select('login_id, membership_tier')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) {
      console.warn('[auth] profile fetch error', profileError.message);
    }
    const membership = (profile?.membership_tier as string | null) ?? 'trial';
    const normalizedLoginId = profile?.login_id ?? loginId;
    return {
      ok: true as const,
      session: {
        userId,
        loginId: normalizedLoginId,
        membership,
      },
    };
  } catch (e: any) {
    console.warn('[auth] supabase login failed', e?.message || e);
    return { ok: false as const, message: e?.message || '로그인에 실패했습니다.' };
  }
});

ipcMain.handle('musinsa:syncOrdersRange', async (_event, payload: { startDate: string; endDate: string }) => {
  const win = musinsaWindow;
  if (!win || win.isDestroyed()) return { ok: false as const, reason: 'musinsa_window_missing' };
  const sendProgress = (done: number, total: number, reset = false) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('musinsa:syncProgress', { done, total, reset });
  };
  const startDate = payload?.startDate;
  const endDate = payload?.endDate;
  if (!startDate || !endDate) return { ok: false as const, reason: 'invalid_range' };

  const script = `
    (async () => {
      const toNumber = (v) => {
        const n = Number(String(v ?? '').replace(/,/g, ''));
        return Number.isFinite(n) ? n : 0;
      };
      const pickString = (...vals) => {
        for (const v of vals) {
          if (v === undefined || v === null) continue;
          const s = String(v).trim();
          if (s) return s;
        }
        return '';
      };
      const randomDelay = () => Promise.resolve();
      const startDate = ${JSON.stringify(startDate)};
      const endDate = ${JSON.stringify(endDate)};
      const size = 50;
      const list = [];
      let onlineOffset = null;
      let page = 1;
      let staleCount = 0;
      for (let i = 0; i < 400; i += 1) {
        const qs = new URLSearchParams({
          size: String(size),
          searchText: '',
          startDate,
          endDate,
          page: String(page),
        });
        if (onlineOffset) qs.set('onlineOffset', String(onlineOffset));
        const url = 'https://api.musinsa.com/api2/claim/store/mypage/integration/order?' + qs.toString();
        await randomDelay();
        const res = await fetch(url, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('list_status_' + res.status);
        const json = await res.json();
        const data = Array.isArray(json?.data) ? json.data : [];
        const before = list.length;
        list.push(...data);

        const nextOffset =
          json?.meta?.onlineOffset ??
          json?.meta?.online_offset ??
          json?.meta?.nextOffset ??
          json?.meta?.next_offset ??
          json?.meta?.offset ??
          null;
        onlineOffset = nextOffset && nextOffset !== '0' ? nextOffset : null;
        const added = list.length > before;
        staleCount = added ? 0 : staleCount + 1;
        page += 1;
        if ((!onlineOffset && staleCount >= 2) || data.length === 0) {
          break;
        }
      }
      const listMap = new Map();
      list.forEach((entry) => {
        if (entry?.orderNo) listMap.set(String(entry.orderNo), entry);
      });
      const orderNos = Array.from(new Set(list.map((o) => o?.orderNo).filter(Boolean)));
      const results = [];
      const concurrency = 2;
      let idx = 0;
      let done = 0;
      const total = orderNos.length;
      const report = () => {
        try {
          console.log('__sync_progress__:' + done + ':' + total);
        } catch (e) {}
      };
      report();
      const worker = async () => {
        while (idx < orderNos.length) {
          const current = orderNos[idx++];
          try {
            await randomDelay();
            const res = await fetch('https://www.musinsa.com/order-service/my/order/get_order_view/' + current, {
              credentials: 'include',
              headers: { Accept: 'application/json' },
            });
            if (!res.ok) throw new Error('detail_status_' + res.status);
            const json = await res.json();
            const orderInfo = json?.orderInfo || {};
            const optionList =
              (Array.isArray(json?.orderOptionList) && json.orderOptionList) ||
              (Array.isArray(json?.order_option_list) && json.order_option_list) ||
              (Array.isArray(json?.orderOptions) && json.orderOptions) ||
              (Array.isArray(json?.order_options) && json.order_options) ||
              (Array.isArray(json?.data?.orderOptionList) && json.data.orderOptionList) ||
              (Array.isArray(json?.data?.order_options) && json.data.order_options) ||
              (Array.isArray(json?.order?.orderOptionList) && json.order.orderOptionList) ||
              (Array.isArray(json?.order?.order_options) && json.order.order_options) ||
              [];
            const orderDate = String(orderInfo?.ord_date || '').split(' ')[0] || '';
            const recvAmt = toNumber(orderInfo?.recv_amt);
            const finalAmt = toNumber(orderInfo?.without_recv_amt_promotion_discount_amt);
            const gap = recvAmt - finalAmt;

            const payInfoSource = json?.pay_info || json?.payInfo || orderInfo?.pay_info || orderInfo?.payInfo || {};
            const payInfoValue =
              payInfoSource?.pay_info ||
              payInfoSource?.payInfo ||
              payInfoSource?.payName ||
              payInfoSource?.pay_name ||
              payInfoSource?.payMethod ||
              payInfoSource?.pay_method ||
              payInfoSource?.payNameKor ||
              payInfoSource?.payNameEng ||
              payInfoSource?.title ||
              payInfoSource;
            const payInfo =
              typeof payInfoValue === 'string'
                ? payInfoValue
                : pickString(payInfoValue?.name, JSON.stringify(payInfoValue || '')) || '';

            const buildItem = (opt) => {
              const qty = toNumber(opt?.quantity || opt?.qty || opt?.count || 0) || 1;
              let receiveAmount = toNumber(
                opt?.receiveAmount ||
                  opt?.recv_amt ||
                  opt?.paymentAmount ||
                  opt?.pay_amt ||
                  opt?.salePrice ||
                  opt?.sale_price ||
                  opt?.goodsPrice ||
                  opt?.goods_price ||
                  opt?.price ||
                  opt?.finalPrice ||
                  opt?.orderPrice ||
                  opt?.ord_price ||
                  opt?.discountedPrice ||
                  opt?.discounted_price ||
                  opt?.totalPaymentAmount ||
                  opt?.total_payment_amount ||
                  opt?.itemPaymentAmount ||
                  opt?.item_payment_amount ||
                  0,
              );
              const imageRaw = pickString(
                opt?.goodsImage,
                opt?.goods_image,
                opt?.goodsImg,
                opt?.imageUrl,
                opt?.image,
                opt?.imgUrl,
                opt?.img,
                opt?.goods?.imageUrl,
                opt?.goods?.image_url,
                opt?.goods?.img,
                opt?.thumb,
                opt?.thumbnail,
              );
              const normalizedImage = imageRaw ? (String(imageRaw).startsWith('//') ? 'https:' + imageRaw : imageRaw) : '';
              const brandName = pickString(
                opt?.brandName,
                opt?.brand,
                opt?.brandNm,
                opt?.brand_name,
                opt?.brand?.name,
                opt?.brand?.brandName,
              );
              const goodsName = pickString(
                opt?.goodsName,
                opt?.goodsNm,
                opt?.goods_name,
                opt?.name,
                opt?.goods?.name,
                opt?.goods?.goodsName,
              );
              const optionName = pickString(
                opt?.goodsOption,
                opt?.goodsOptionName,
                opt?.optionName,
                opt?.option_text,
                opt?.goodsOptionText,
                opt?.option?.name,
                opt?.optionValue,
                opt?.option_value,
                opt?.optionValueName,
                opt?.option_value_name,
                opt?.optionValueText,
                opt?.option_value_text,
                opt?.sizeName,
                opt?.size_text,
                opt?.size,
                opt?.option,
              );
              const stateText = pickString(
                opt?.orderStateText,
                opt?.order_state_text,
                opt?.orderStateName,
                opt?.order_state_name,
                opt?.orderState,
                opt?.statusText,
              );
              return {
                image: normalizedImage,
                brandName,
                goodsName,
                optionName,
                quantity: qty,
                receiveAmount: Math.round(receiveAmount),
                actualUnitCost: 0,
                stateText,
              };
            };

            const items = optionList.map((opt) => buildItem(opt));

            const listEntry = listMap.get(String(current));
            if (Array.isArray(listEntry?.orderOptionList) && items.length === 0) {
              listEntry.orderOptionList.forEach((opt) => items.push(buildItem(opt)));
            }
            if (items.length === 0 && listEntry) {
              const fallbackOptList =
                (Array.isArray(listEntry?.orderOptions) && listEntry.orderOptions) ||
                (Array.isArray(listEntry?.order_options) && listEntry.order_options) ||
                (Array.isArray(listEntry?.items) && listEntry.items) ||
                (Array.isArray(listEntry?.orderItemList) && listEntry.orderItemList) ||
                [];
              fallbackOptList.forEach((opt) => {
                items.push(buildItem(opt));
              });
            }

            if (items.length === 0) {
              items.push({
                image: '',
                brandName: listEntry?.brandName || listEntry?.brand || '',
                goodsName: listEntry?.goodsName || '',
                optionName: listEntry?.goodsOption || listEntry?.goodsOptionName || '',
                quantity: 1,
                receiveAmount: recvAmt || 0,
                actualUnitCost: 0,
                stateText: pickString(listEntry?.orderStateText, listEntry?.order_state_text, listEntry?.orderStateName, listEntry?.order_state_name),
              });
            }

            const totalQtyForGap =
              items.reduce((acc, item) => acc + (toNumber(item.quantity) || 0), 0) || items.length || 1;
            const gapPerUnitRaw = gap / totalQtyForGap;
            const gapPerUnitRounded =
              Number.isFinite(gapPerUnitRaw) && gapPerUnitRaw > 0 ? Math.floor(gapPerUnitRaw / 10) * 10 : 0;
            const normalizedItems = items.map((item) => {
              const qty = toNumber(item.quantity) || 1;
              const perUnit = qty > 0 ? item.receiveAmount / qty : item.receiveAmount;
              const actual = Math.max(0, Math.round(perUnit - gapPerUnitRounded));
              return {
                ...item,
                quantity: qty,
                actualUnitCost: actual,
              };
            });

            results.push({
              orderNo: current,
              orderDate: orderDate || new Date().toISOString().slice(0, 10),
              brandName:
                optionList?.[0]?.brandName || normalizedItems?.[0]?.brandName || listEntry?.brandName || listEntry?.brand || '',
              items: normalizedItems,
              totals: {
                normalPrice: toNumber(orderInfo?.normal_price),
                totalSaleTotalAmt: toNumber(orderInfo?.total_sale_total_amt),
                pointUsed: toNumber(orderInfo?.point_amt),
                usePoint: toNumber(orderInfo?.use_point_amt),
                prePoint: toNumber(orderInfo?.pre_point_amt),
                recvAmt,
                finalAmt,
                gap,
                payInfo,
              },
            });
            done += 1;
            report();
          } catch (e) {
            // skip failed order
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, orderNos.length) }, worker));
      results.sort((a, b) => (a.orderDate === b.orderDate ? (a.orderNo > b.orderNo ? -1 : 1) : a.orderDate > b.orderDate ? -1 : 1));
      return { ok: true, orders: results };
    })();
  `;

  const runWithRetry = async (attempt = 1, delay = 600): Promise<any> => {
    const progressListener = (_event2: Electron.Event, _level: number, message: string) => {
      if (typeof message !== 'string') return;
      if (!message.startsWith('__sync_progress__:')) return;
      const parts = message.split(':');
      if (parts.length < 3) return;
      const done = Number(parts[1]) || 0;
      const total = Number(parts[2]) || 0;
      sendProgress(done, total, false);
    };
    win.webContents.on('console-message', progressListener);
    try {
      const res = await win.webContents.executeJavaScript(script, true);
      if ((res as any)?.orders) {
        const total = Array.isArray((res as any)?.orders) ? (res as any).orders.length : 0;
        sendProgress(total, total, false);
      }
      return res;
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (attempt < 3 && (msg.includes('429') || msg.includes('detail_status_') || msg.includes('list_status_'))) {
        const nextDelay = delay * 1.6 + Math.random() * 200;
        await new Promise((resolve) => setTimeout(resolve, nextDelay));
        return runWithRetry(attempt + 1, nextDelay);
      }
      return { ok: false as const, reason: e?.message || 'sync_failed' };
    } finally {
      win.webContents.removeListener('console-message', progressListener);
      sendProgress(0, 0, true);
    }
  };
  return runWithRetry();
});

ipcMain.handle('app:startUpdate', async () => {
  if (isDevBuild) return { ok: false as const, reason: 'dev_mode' };
  try {
    if (updateDownloading) return { ok: true as const };
    updateDownloading = true;
    sendUpdateStatus({ status: 'downloading' });
    await autoUpdater.downloadUpdate();
    return { ok: true as const };
  } catch (e: any) {
    updateDownloading = false;
    sendUpdateStatus({ status: 'error', message: e?.message || 'update_failed' });
    return { ok: false as const, reason: e?.message || 'update_failed' };
  }
});

ipcMain.handle('musinsa:fetchSessionStatus', async () => {
  const status = await checkMusinsaSession();
  sendSessionStatus(status);
  return status;
});

ipcMain.handle('musinsa:logout', async () => {
  const res = await performMusinsaLogout();
  const status = await checkMusinsaSession();
  sendSessionStatus(status);
  return res;
});

ipcMain.handle(
  'app:saveOrderXlsxData',
  async (
    _event,
    payload: {
      orders: Array<{
        orderDate: string;
        orderNo: string;
        stateText?: string;
        brandName?: string;
        goodsName?: string;
        optionName?: string;
        quantity: number;
        receiveAmount: number;
        actualUnitCost: number;
        payInfo?: string;
      }>;
    },
  ): Promise<{ ok: boolean; path?: string; reason?: string }> => {
    try {
      const header = ['주문날짜', '구분', '주문번호', '브랜드', '상품명', '사이즈', '수량', '상품가격', '실제 개당 매입가', '결제수단'];
      const aoa = [header, ...payload.orders.map((o) => [
        o.orderDate,
        o.stateText || '',
        o.orderNo,
        o.brandName || '',
        o.goodsName || '',
        o.optionName || '',
        o.quantity ?? 0,
        o.receiveAmount ?? 0,
        o.actualUnitCost ?? 0,
        o.payInfo || '',
      ])];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const range = XLSX.utils.decode_range(ws['!ref'] as string);
      ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
      const freezePane = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
      (ws as any)['!freeze'] = freezePane;
      (ws as any)['!pane'] = freezePane;

      const isDanger = (v?: string) => !!(v && /(반품|오류|취소)/.test(v));
      const colMax = Array(header.length).fill(0) as number[];
      for (let C = 0; C < header.length; C += 1) {
        colMax[C] = Math.max(colMax[C], String(header[C]).length + 2);
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: C });
        const cell = ws[cellRef];
        if (cell) {
          cell.s = {
            ...(cell.s || {}),
            font: { ...(cell.s?.font || {}), bold: true },
            fill: { patternType: 'solid', fgColor: { rgb: 'D9D9D9' } },
            alignment: { ...(cell.s?.alignment || {}), horizontal: 'center', vertical: 'center' },
          };
        }
      }
      for (let R = 1; R <= range.e.r; R += 1) {
        const rowIdx = R - 1;
        const state = payload.orders[rowIdx]?.stateText || '';
        const danger = isDanger(state);
        for (let C = 0; C <= range.e.c; C += 1) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = ws[cellRef];
          if (!cell) continue;
          const valStr = String(cell.v ?? '');
          colMax[C] = Math.max(colMax[C], valStr.length + 2);
          if (!cell.s) cell.s = {};
          if (C === 8) {
            cell.s.font = { ...(cell.s.font || {}), bold: true, color: { rgb: '1E3A8A' } };
          }
          if (danger) {
            cell.s.fill = { patternType: 'solid', fgColor: { rgb: 'DC2626' } };
            cell.s.font = { ...(cell.s.font || {}), color: { rgb: 'FFFFFF' }, bold: true };
          }
          if (cell.s && !cell.s.alignment) {
            cell.s.alignment = { horizontal: 'center', vertical: 'center' };
          }
        }
      }
      ws['!cols'] = colMax.map((wch) => ({ wch: Math.max(wch + 2, 10) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '주문내역');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

      const kst = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
      const today = kst.format(new Date());
      const dir = app.getPath('documents');
      let counter = 1;
      const makeName = () => `musinsa_orderlist_${today}_${counter}.xlsx`;
      let defaultPath = path.join(dir, makeName());
      while (fs.existsSync(defaultPath)) {
        counter += 1;
        defaultPath = path.join(dir, makeName());
      }

      const { canceled, filePath } = await dialog.showSaveDialog({
        title: '주문내역 엑셀 저장',
        defaultPath,
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
      });
      if (canceled || !filePath) return { ok: false, reason: 'canceled' };

      await fs.promises.writeFile(filePath, wbout);

      return { ok: true, path: filePath };
    } catch (e: any) {
      console.error('[saveOrderXlsxData] error', e);
      return { ok: false, reason: e?.message || 'save_failed' };
    }
  },
);

ipcMain.handle('app:openPath', async (_event, payload: { path: string }) => {
  try {
    const res = await shell.openPath(payload.path);
    if (res) return { ok: false, reason: res };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'open_failed' };
  }
});

ipcMain.handle('app:showInFolder', async (_event, payload: { path: string }) => {
  try {
    shell.showItemInFolder(payload.path);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'show_failed' };
  }
});

app.whenReady().then(() => {
  createWindow();
  createMusinsaWindow();
  startMusinsaSessionWatch();
  if (!isDevBuild) {
    autoUpdater.autoDownload = false;
    autoUpdater.on('update-available', (info) => {
      sendUpdateStatus({ status: 'available', version: info?.version });
    });
    autoUpdater.on('download-progress', (p) => {
      sendUpdateStatus({ status: 'downloading', percent: p?.percent });
    });
    autoUpdater.on('update-downloaded', (info) => {
      sendUpdateStatus({ status: 'downloaded', version: info?.version });
      setTimeout(() => {
        autoUpdater.quitAndInstall();
      }, 500);
    });
    autoUpdater.on('error', (err) => {
      updateDownloading = false;
      if (err?.message && err.message.includes('No published versions')) {
        sendUpdateStatus({ status: 'idle' });
        return;
      }
      sendUpdateStatus({ status: 'error', message: err?.message || 'update_error' });
    });
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[autoUpdater] check failed', err);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      createMusinsaWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // 메인 창이 닫히면 보조 창도 함께 종료
  if (musinsaWindow && !musinsaWindow.isDestroyed()) {
    musinsaWindow.close();
  }
  if (musinsaReviewWindow && !musinsaReviewWindow.isDestroyed()) {
    musinsaReviewWindow.close();
  }
  app.quit();
});

// autoUpdater 상태 로그를 콘솔로 출력해 업데이트 이슈를 진단하기 쉽게 함
if (!isDevBuild) {
  autoUpdater.on('checking-for-update', () => {
    console.log('[autoUpdater] checking for update');
  });
  autoUpdater.on('update-not-available', (info) => {
    console.log('[autoUpdater] no update', info?.version);
  });
  autoUpdater.on('update-available', (info) => {
    console.log('[autoUpdater] update available', info?.version);
  });
  autoUpdater.on('download-progress', (p) => {
    console.log('[autoUpdater] download progress', p?.percent?.toFixed?.(1) ?? p?.percent);
  });
  autoUpdater.on('error', (err) => {
    console.warn('[autoUpdater] error', err);
  });
}
