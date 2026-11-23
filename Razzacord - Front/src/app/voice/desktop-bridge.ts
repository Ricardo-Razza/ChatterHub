/** Ponte exposta pelo preload do Electron (window.electronAPI). Ausente no navegador. */

export interface ShareSource {
  id: string;
  name: string;
  thumbnail: string;
  isScreen: boolean;
  /** PID do processo dono da janela (só para janelas), usado como áudio padrão. */
  pid: number | null;
}

export interface AudioApp {
  pid: number;
  title: string;
}

export interface ShareSelection {
  sourceId: string;
  /** PID cujo áudio será transmitido; null = transmitir sem áudio. */
  audioPid: number | null;
}

export interface DesktopBridge {
  isDesktop: true;
  platform: string;
  /** Captura de áudio por aplicativo disponível (Windows 10 2004+). */
  supportsAppAudio: boolean;
  listShareSources(): Promise<ShareSource[]>;
  listAudioApps(): Promise<AudioApp[]>;
  /** Arma a próxima chamada de getDisplayMedia e inicia a captura de áudio do processo. */
  startShare(selection: ShareSelection): Promise<void>;
  stopShare(): Promise<void>;
  onAppAudio(cb: (pcm: ArrayBuffer) => void): () => void;
  /** Push-to-talk global (funciona com o jogo em foco). */
  setPushToTalk(key: string | null): Promise<boolean>;
  onPushToTalk(cb: (active: boolean) => void): () => void;
  checkForUpdate(): Promise<boolean>;
  downloadUpdate(): Promise<boolean>;
  installUpdate(): Promise<boolean>;
  onUpdateState(cb: (state: { state: string; version?: string; percent?: number; message?: string }) => void): () => void;
}

export function getDesktopBridge(): DesktopBridge | null {
  const api = (window as any).electronAPI;
  return api && api.isDesktop && typeof api.listShareSources === 'function' ? (api as DesktopBridge) : null;
}

/** Formato do PCM entregue pela captura nativa. */
export const APP_AUDIO_SAMPLE_RATE = 48000;
