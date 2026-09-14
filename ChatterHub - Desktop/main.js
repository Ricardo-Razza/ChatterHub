const { app, BrowserWindow, session, desktopCapturer, shell, Tray, Menu, ipcMain } = require('electron');
const path = require('path');

// URL padrão da aplicação (VPS)
const APP_URL = process.env.CHATTERHUB_URL || 'https://chatterhub.razzadev.io';

// Otimizações para Gamers e performance em segundo plano
// Garante que o áudio/WebRTC não engasgue quando um jogo estiver em tela cheia
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Garante apenas uma instância do aplicativo aberta
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 560,
    title: 'ChatterHub',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false, // Não pausar áudio/timers em segundo plano
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Remove a barra de menu padrão para um visual limpo estilo Discord
  mainWindow.setMenuBarVisibility(false);

  // Exibe a janela assim que estiver pronta, evitando tela branca
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Configura permissões automáticas para áudio, microfone, câmera e tela
  const allowedPermissions = ['media', 'microphone', 'camera', 'display-capture', 'notifications', 'mediaKeySystem'];
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(allowedPermissions.includes(permission) || true);
  });
  mainWindow.webContents.session.setPermissionCheckHandler(() => true);

  // Configura captura de tela e áudio do sistema (loopback)
  mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      if (sources && sources.length > 0) {
        // Concede acesso à fonte com áudio loopback do sistema
        callback({ video: sources[0], audio: 'loopback' });
      } else {
        callback({});
      }
    }).catch((err) => {
      console.error('[ChatterHub Desktop] Erro ao selecionar tela:', err);
      callback({});
    });
  }, { useSystemPicker: true });

  // Abre links externos (YouTube, sites) no navegador padrão do usuário (Chrome/Edge/Firefox)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      if (!url.startsWith(APP_URL)) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL) && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Tratamento de falha de conexão (ex: VPS reiniciando ou sem internet)
  mainWindow.webContents.on('did-fail-load', (event, errorCode) => {
    // Código -3 é ABORTED (navegação cancelada propositalmente), ignoramos
    if (errorCode !== -3) {
      console.warn(`[ChatterHub Desktop] Falha ao carregar ${APP_URL} (código ${errorCode}). Abrindo tela offline.`);
      mainWindow.loadFile(path.join(__dirname, 'offline.html'));
    }
  });

  // Carrega a aplicação
  mainWindow.loadURL(APP_URL);

  // Minimiza para a bandeja ao fechar (comportamento clássico do Discord)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });
}

// Cria ícone na Área de Notificação (Bandeja / Tray do Windows)
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('ChatterHub');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir ChatterHub',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Recarregar (F5)',
      click: () => {
        if (mainWindow) {
          mainWindow.loadURL(APP_URL);
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Fechar ChatterHub',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
}

// Quando o usuário tenta abrir uma segunda instância, foca na janela já aberta
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
