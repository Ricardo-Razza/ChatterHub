const { app, BrowserWindow, session, desktopCapturer, shell, Tray, Menu, ipcMain, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const appAudio = require('./app-audio');
const pushToTalk = require('./push-to-talk');

const IS_DEV = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

/**
 * URL da aplicação. Ordem: variável RAZZACORD_URL > config.json (em %APPDATA%/Razzacord) > padrão.
 * Em desenvolvimento (--dev) usa o servidor do Angular.
 */
function resolveAppUrl() {
  if (process.env.RAZZACORD_URL) return process.env.RAZZACORD_URL;
  if (IS_DEV) return 'http://localhost:4200';
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8'));
    if (typeof cfg.appUrl === 'string' && cfg.appUrl) return cfg.appUrl;
  } catch (_) {
    /* sem config: usa o padrão */
  }
  return 'https://razzacord.razzadev.io';
}

let APP_URL;
let APP_ORIGIN;

// Áudio e WebRTC não podem engasgar com um jogo em tela cheia ou com a janela minimizada.
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let tray = null;
let isQuitting = false;

/** Fonte de captura liberada pelo usuário no seletor; consumida pelo próximo getDisplayMedia. */
let armedSourceId = null;
let knownSourceIds = new Set();

function isTrustedUrl(url) {
  try {
    return new URL(url).origin === APP_ORIGIN || url.startsWith('file://');
  } catch (_) {
    return false;
  }
}

function isTrustedSender(event) {
  const url = event.senderFrame && event.senderFrame.url;
  return !!url && isTrustedUrl(url);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 560,
    title: 'Razzacord',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    backgroundColor: '#0f1117',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Só o nosso próprio site recebe câmera, microfone e captura de tela; qualquer outra permissão é negada.
  const allowed = new Set(['media', 'display-capture', 'notifications', 'clipboard-sanitized-write', 'fullscreen']);
  const ses = mainWindow.webContents.session;
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(allowed.has(permission) && isTrustedUrl(details.requestingUrl || ''));
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    return allowed.has(permission) && isTrustedUrl(requestingOrigin || '');
  });

  // Captura de tela: usa a fonte escolhida no seletor da própria aplicação (sem áudio do sistema).
  ses.setDisplayMediaRequestHandler(async (_request, callback) => {
    const wanted = armedSourceId;
    armedSourceId = null;
    if (!wanted) return callback({});
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const source = sources.find((s) => s.id === wanted);
      // O áudio de sistema (loopback) fica de fora de propósito: ele carregaria a call e tudo o que toca no PC.
      callback(source ? { video: source } : {});
    } catch (err) {
      console.error('[Razzacord Desktop] Erro ao obter fonte de captura:', err);
      callback({});
    }
  }, { useSystemPicker: false });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _desc, _url, isMainFrame) => {
    // -3 = navegação abortada de propósito
    if (isMainFrame && errorCode !== -3) {
      console.warn(`[Razzacord Desktop] Falha ao carregar ${APP_URL} (código ${errorCode}).`);
      mainWindow.loadFile(path.join(__dirname, 'offline.html'));
    }
  });

  mainWindow.loadURL(APP_URL);
  if (IS_DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });

  // Fechar a janela minimiza para a bandeja (a call continua).
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Razzacord');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Razzacord', click: showWindow },
      { label: 'Recarregar', click: () => mainWindow && mainWindow.loadURL(APP_URL) },
      { type: 'separator' },
      {
        label: 'Fechar Razzacord',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('double-click', showWindow);
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

app.on('second-instance', showWindow);

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

ipcMain.on('window-minimize', (e) => isTrustedSender(e) && mainWindow && mainWindow.minimize());
ipcMain.on('window-maximize', (e) => {
  if (!isTrustedSender(e) || !mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window-close', (e) => isTrustedSender(e) && mainWindow && mainWindow.close());
ipcMain.on('notify', (e, { title, body } = {}) => {
  if (!isTrustedSender(e) || !Notification.isSupported()) return;
  new Notification({ title: String(title || 'Razzacord').slice(0, 100), body: String(body || '').slice(0, 300) }).show();
});

ipcMain.handle('share:capabilities', (e) => {
  if (!isTrustedSender(e)) return { appAudio: false };
  return { appAudio: appAudio.isSupported() };
});

ipcMain.handle('share:list-sources', async (e) => {
  if (!isTrustedSender(e)) return [];
  const [sources, windows] = await Promise.all([
    desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: false,
    }),
    appAudio.listWindows(),
  ]);

  knownSourceIds = new Set(sources.map((s) => s.id));
  const ownPids = new Set(app.getAppMetrics().map((m) => m.pid));

  return sources
    .filter((s) => !s.thumbnail.isEmpty())
    .map((s) => {
      const isScreen = s.id.startsWith('screen:');
      let pid = null;
      if (!isScreen) {
        // id da janela: "window:<HWND>:0"
        const hwnd = s.id.split(':')[1];
        const win = windows.find((w) => w.hwnd === hwnd);
        if (win && !ownPids.has(win.pid)) pid = win.pid;
      }
      return { id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL(), isScreen, pid };
    });
});

ipcMain.handle('share:list-audio-apps', async (e) => {
  if (!isTrustedSender(e)) return [];
  const windows = await appAudio.listWindows();
  const ownPids = new Set(app.getAppMetrics().map((m) => m.pid));
  const seen = new Map();
  for (const w of windows) {
    if (ownPids.has(w.pid) || !w.title || seen.has(w.pid)) continue;
    seen.set(w.pid, { pid: w.pid, title: w.title });
  }
  return [...seen.values()].sort((a, b) => a.title.localeCompare(b.title));
});

ipcMain.handle('share:start', async (e, selection = {}) => {
  if (!isTrustedSender(e)) throw new Error('remetente não confiável');
  const { sourceId, audioPid } = selection;
  if (typeof sourceId !== 'string' || !knownSourceIds.has(sourceId)) {
    throw new Error('Fonte de captura inválida');
  }
  armedSourceId = sourceId;

  appAudio.stop();
  if (Number.isInteger(audioPid) && audioPid > 0) {
    const sender = e.sender;
    appAudio.start(audioPid, {
      onData: (buf) => {
        if (!sender.isDestroyed()) sender.send('share:audio', buf);
      },
      onEnd: () => {
        if (!sender.isDestroyed()) sender.send('share:audio-ended');
      },
    });
  }
});

ipcMain.handle('share:stop', (e) => {
  if (!isTrustedSender(e)) return;
  armedSourceId = null;
  appAudio.stop();
});

ipcMain.handle('ptt:set', (e, code) => {
  if (!isTrustedSender(e)) return false;
  return pushToTalk.setKey(code, (active) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('ptt:state', active);
  });
});

// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  APP_URL = resolveAppUrl();
  APP_ORIGIN = new URL(APP_URL).origin;
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  appAudio.stop();
  pushToTalk.dispose();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) app.quit();
});
