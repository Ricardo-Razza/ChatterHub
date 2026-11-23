const { contextBridge, ipcRenderer } = require('electron');

/** Registra um listener de canal IPC e devolve a função que o remove. */
function listen(channel, handler) {
  const wrapped = (_event, ...args) => handler(...args);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

// Captura de áudio por processo: Windows 10 2004 (build 19041) ou superior, x64.
const windowsBuild = Number(String(process.getSystemVersion ? process.getSystemVersion() : '').split('.')[2]);
const supportsAppAudio = process.platform === 'win32' && process.arch === 'x64' && windowsBuild >= 19041;

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isDesktop: true,

  supportsAppAudio,
  // Áudio do PC inteiro sem a chamada (mesmo requisito do áudio por aplicativo).
  supportsSystemAudio: supportsAppAudio,

  // Controles de janela e notificações
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  sendNotification: (title, body) => ipcRenderer.send('notify', { title, body }),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('app:auto-launch', enabled),
  checkForUpdate: () => ipcRenderer.invoke('app:update-check'),
  downloadUpdate: () => ipcRenderer.invoke('app:update-download'),
  installUpdate: () => ipcRenderer.invoke('app:update-install'),
  onUpdateState: (cb) => listen('app:update-state', cb),

  // Compartilhamento de tela com áudio só do aplicativo escolhido
  listShareSources: () => ipcRenderer.invoke('share:list-sources'),
  listAudioApps: () => ipcRenderer.invoke('share:list-audio-apps'),
  startShare: (selection) => ipcRenderer.invoke('share:start', selection),
  stopShare: () => ipcRenderer.invoke('share:stop'),
  onAppAudio: (cb) => listen('share:audio', cb),
  onAppAudioEnded: (cb) => listen('share:audio-ended', cb),

  // Push-to-talk global
  setPushToTalk: (code) => ipcRenderer.invoke('ptt:set', code),
  onPushToTalk: (cb) => listen('ptt:state', cb),
});
