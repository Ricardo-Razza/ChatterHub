import { Injectable, computed, signal, effect, untracked } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Subscription } from "rxjs";
import { ChannelService } from "./channel.service";
import { AuthService } from "./auth.service";
import { WebSocketService } from "./websocket.service";
import { User } from "../models/user.model";
import { environment } from "../../environments/environment";
import { MicPipeline } from "../voice/mic-pipeline";
import { AppAudioCapture } from "../voice/app-audio";
import { AudioApp, ShareSelection, ShareSource, getDesktopBridge } from "../voice/desktop-bridge";
import { SfuQuality, SfuSource, SfuTransport } from "../voice/sfu-transport";

/** Estado de cada participante, mantido pelo servidor (VoiceRoomRegistry) e publicado em /topic/voice/{canal}. */
export interface VoiceState {
  isMuted?: boolean;
  isDeafened?: boolean;
  isCameraOn?: boolean;
  isSharingScreen?: boolean;
  isSpeaking?: boolean;
  micStreamId?: string | null;
  cameraStreamId?: string | null;
  screenStreamId?: string | null;
}

interface RosterEntry {
  userId: string;
  username: string;
  avatarUrl: string;
  state: VoiceState;
}

export type ConnectionPhase = "idle" | "connecting" | "connected" | "reconnecting";
export type ScreenQualityId = "720p30" | "1080p30" | "1080p60";
export type ScreenContent = "motion" | "detail";

export interface ScreenQualityPreset {
  id: ScreenQualityId;
  label: string;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}

export const SCREEN_PRESETS: ScreenQualityPreset[] = [
  { id: "720p30", label: "720p · 30 fps", width: 1280, height: 720, fps: 30, bitrate: 2_500_000 },
  { id: "1080p30", label: "1080p · 30 fps", width: 1920, height: 1080, fps: 30, bitrate: 5_000_000 },
  { id: "1080p60", label: "1080p · 60 fps", width: 1920, height: 1080, fps: 60, bitrate: 8_000_000 },
];

export interface PeerStats {
  rttMs: number | null;
  lossPct: number | null;
  relayed: boolean;
  level: "good" | "ok" | "poor" | "unknown";
}

interface PeerEntry {
  userId: string;
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  /** Criados por quem oferece; o outro lado os adota da oferta (o Chrome não reaproveita transceivers de addTransceiver). */
  micTx?: RTCRtpTransceiver;
  camTx?: RTCRtpTransceiver;
  screenVideoTx?: RTCRtpTransceiver;
  screenAudioTx?: RTCRtpTransceiver;
  streams: Map<string, MediaStream>;
  audio: Map<string, HTMLAudioElement>;
  queue: Promise<void>;
  restartTimer: any;
  iceRestarts: number;
  prevLoss?: { received: number; lost: number };
}

const FALLBACK_ICE: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const MIC_MAX_BITRATE = 64_000;
const SCREEN_AUDIO_MAX_BITRATE = 128_000;

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function readString(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* modo privado / storage cheio: a preferência só não persiste */
  }
}

@Injectable({ providedIn: "root" })
export class VoiceService {
  // ---- Estado da sala ----
  private readonly _roster = signal<RosterEntry[]>([]);
  private readonly _streamVersion = signal(0);
  private readonly _phase = signal<ConnectionPhase>("idle");
  private readonly _voiceError = signal<string | null>(null);
  private readonly _peerStats = signal<Record<string, PeerStats>>({});
  private readonly _focusedSharerId = signal<string | null>(null);

  // ---- Mídia local ----
  private readonly _isSharingScreen = signal(false);
  private readonly _screenPreview = signal<MediaStream | null>(null);
  private readonly _localCameraStream = signal<MediaStream | null>(null);
  private readonly _isSpeaking = signal(false);
  private readonly _micDb = signal(-100);
  private readonly _hasMic = signal(false);
  private readonly _pttActive = signal(false);

  // ---- Seleção de fonte de tela (somente Electron) ----
  private readonly _pickerOpen = signal(false);
  private readonly _pickerSources = signal<ShareSource[]>([]);
  private readonly _pickerApps = signal<AudioApp[]>([]);
  private pickerResolver?: (value: ShareSelection | null) => void;

  // ---- Preferências ----
  private readonly _inputDevices = signal<MediaDeviceInfo[]>([]);
  private readonly _outputDevices = signal<MediaDeviceInfo[]>([]);
  private readonly _selectedMicrophoneId = signal(readString("ch_mic_id", ""));
  private readonly _selectedAudioOutputId = signal(readString("ch_output_id", ""));
  private readonly _noiseSuppressionEnabled = signal(readString("ch_noise_suppression", "true") !== "false");
  private readonly _inputSensitivity = signal(readNumber("ch_input_sensitivity", 20));
  private readonly _screenShareVolume = signal(readNumber("ch_screen_volume", 100));
  private readonly _pttEnabled = signal(readString("ch_ptt_enabled", "false") === "true");
  private readonly _pttKey = signal(readString("ch_ptt_key", "Backquote"));
  private readonly _screenQuality = signal<ScreenQualityId>(readString("ch_screen_quality", "1080p30") as ScreenQualityId);
  private readonly _screenContent = signal<ScreenContent>(readString("ch_screen_content", "motion") as ScreenContent);
  private readonly _userVolumes = signal<Record<string, number>>(this.loadUserVolumes());

  // ---- Internos ----
  private joinedChannelId: string | null = null;
  private session = 0;
  private lastJoinSentAt = 0;
  private iceServers: RTCIceServer[] = FALLBACK_ICE;
  private audioCtx: AudioContext | null = null;
  private mic: MicPipeline | null = null;
  private micTrack: MediaStreamTrack | null = null;
  private screenVideoTrack: MediaStreamTrack | null = null;
  private screenAudioTrack: MediaStreamTrack | null = null;
  private displayStream: MediaStream | null = null;
  private appAudio: AppAudioCapture | null = null;
  private cameraTrack: MediaStreamTrack | null = null;
  private stoppingScreen = false;
  private peers: Record<string, PeerEntry> = {};
  private earlySignals: Record<string, any[]> = {};
  private subscriptions: Subscription[] = [];
  private statsTimer: any = null;
  private cameraStarting = false;
  private unsubscribePtt?: () => void;

  // ---- SFU (LiveKit). Sem SFU configurado a mídia segue pela malha P2P. ----
  private sfu: SfuTransport | null = null;
  private sfuTracks: Record<string, Partial<Record<SfuSource, MediaStreamTrack>>> = {};
  private sfuStreams = new Map<string, MediaStream>();
  private sfuAudio = new Map<string, HTMLAudioElement>();
  private sfuQuality: Record<string, SfuQuality> = {};
  private readonly _usingSfu = signal(false);
  /** true quando a mídia passa pelo SFU em vez da malha P2P */
  readonly usingSfu = this._usingSfu.asReadonly();

  /** Streams de saída com id estável: o id vai no estado do participante e permite ao receptor saber o que é cada stream. */
  private readonly outMic = new MediaStream();
  private readonly outCamera = new MediaStream();
  private readonly outScreen = new MediaStream();

  // ---- API pública (somente leitura) ----
  readonly isSharingScreen = this._isSharingScreen.asReadonly();
  readonly localCameraStream = this._localCameraStream.asReadonly();
  readonly screenStream = this._screenPreview.asReadonly();
  readonly connectionPhase = this._phase.asReadonly();
  readonly voiceError = this._voiceError.asReadonly();
  readonly peerStats = this._peerStats.asReadonly();
  readonly hasMicrophone = this._hasMic.asReadonly();
  readonly inputDevices = this._inputDevices.asReadonly();
  readonly outputDevices = this._outputDevices.asReadonly();
  readonly selectedMicrophoneId = this._selectedMicrophoneId.asReadonly();
  readonly selectedAudioOutputId = this._selectedAudioOutputId.asReadonly();
  readonly noiseSuppressionEnabled = this._noiseSuppressionEnabled.asReadonly();
  readonly inputSensitivity = this._inputSensitivity.asReadonly();
  readonly screenShareVolume = this._screenShareVolume.asReadonly();
  readonly pushToTalkEnabled = this._pttEnabled.asReadonly();
  readonly pushToTalkKey = this._pttKey.asReadonly();
  readonly pushToTalkActive = this._pttActive.asReadonly();
  readonly screenQuality = this._screenQuality.asReadonly();
  readonly screenContent = this._screenContent.asReadonly();
  readonly pickerOpen = this._pickerOpen.asReadonly();
  readonly pickerSources = this._pickerSources.asReadonly();
  readonly pickerApps = this._pickerApps.asReadonly();
  readonly screenPresets = SCREEN_PRESETS;
  readonly isDesktop = !!getDesktopBridge();
  readonly supportsAppAudio = !!getDesktopBridge()?.supportsAppAudio;

  readonly currentUserId = computed(() => this.auth.currentUser().id);
  readonly isConnected = computed(() => this._phase() !== "idle");

  /** Nível 0-100 do medidor de microfone (-70 dBFS .. 0 dBFS). */
  readonly micVolumeLevel = computed(() => Math.max(0, Math.min(100, Math.round(((this._micDb() + 70) / 70) * 100))));

  /** O microfone só transmite se não estiver mutado/surdo e, com push-to-talk, a tecla estiver pressionada. */
  readonly micOpen = computed(() => {
    const me = this.auth.currentUser();
    if (me.isMuted || me.isDeafened) return false;
    return !this._pttEnabled() || this._pttActive();
  });

  readonly sharingUserId = computed<string | null>(() => {
    const me = this.auth.currentUser();
    if (this._isSharingScreen()) return me.id;
    const sharers = this._roster().filter((p) => p.userId !== me.id && p.state.isSharingScreen);
    if (sharers.length === 0) return null;
    const focused = this._focusedSharerId();
    return (sharers.find((p) => p.userId === focused) ?? sharers[0]).userId;
  });

  readonly isLocalSharing = computed<boolean>(() => {
    const me = this.auth.currentUser();
    return Boolean(me.id && this.sharingUserId() === me.id);
  });

  readonly activeScreenStream = computed<MediaStream | null>(() => {
    this._streamVersion();
    const sharingId = this.sharingUserId();
    if (!sharingId) return null;
    if (sharingId === this.auth.currentUser().id) return this._screenPreview();
    return this.remoteStream(sharingId, "screen");
  });

  readonly participants = computed<User[]>(() => {
    const me = this.auth.currentUser();
    const roster = this._roster();
    if (!this.isConnected()) return [];

    const self: User = {
      ...me,
      isSpeaking: this._isSpeaking() && this.micOpen(),
      isSharingScreen: this._isSharingScreen(),
      isCameraOn: !!me.isCameraOn,
    };

    const others: User[] = roster
      .filter((p) => p.userId !== me.id)
      .map((p) => ({
        id: p.userId,
        username: p.username,
        avatarUrl: p.avatarUrl || `https://api.dicebear.com/7.x/thumbs/svg?seed=${p.username}&backgroundColor=5865f2`,
        status: "online" as const,
        isMuted: !!p.state.isMuted,
        isDeafened: !!p.state.isDeafened,
        isSpeaking: !!p.state.isSpeaking && !p.state.isMuted,
        isCameraOn: !!p.state.isCameraOn,
        isSharingScreen: !!p.state.isSharingScreen,
      }));
    return [self, ...others];
  });

  constructor(
    private readonly channelService: ChannelService,
    private readonly auth: AuthService,
    private readonly wsService: WebSocketService,
    private readonly http: HttpClient
  ) {
    this.loadAudioDevices();
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", () => this.loadAudioDevices());
    }

    // A chamada acompanha o canal de voz escolhido, e não a tela exibida: dá para navegar nos canais de texto sem cair da call.
    effect(() => {
      const voiceChannelId = this.channelService.voiceChannelId();
      untracked(() => {
        if (voiceChannelId) {
          void this.startMedia(voiceChannelId);
        } else {
          this.stopMedia();
        }
      });
    }, { allowSignalWrites: true });

    // Mute / surdez / push-to-talk / sensibilidade agem no gate do microfone e são publicados aos outros.
    effect(() => {
      const open = this.micOpen();
      const sensitivity = this._inputSensitivity();
      const gate = this._noiseSuppressionEnabled() && !this._pttEnabled();
      const deaf = !!this.auth.currentUser().isDeafened;
      untracked(() => {
        this.mic?.configure({ micOpen: open, thresholdDb: this.sensitivityToDb(sensitivity), gateEnabled: gate });
        this.reconcileAudio(deaf);
        this.publishState();
      });
    });

    // Câmera acompanha a escolha do usuário.
    effect(() => {
      const wantCamera = !!this.auth.currentUser().isCameraOn;
      untracked(() => {
        if (wantCamera) {
          void this.startCamera();
        } else {
          this.stopCamera();
        }
      });
    }, { allowSignalWrites: true });

    // Push-to-talk global (Electron) ou por tecla com a janela em foco.
    effect(() => {
      const enabled = this._pttEnabled();
      const key = this._pttKey();
      untracked(() => this.configurePushToTalk(enabled, key));
    });

    this.wsService.onReconnected$.subscribe(() => {
      if (this.joinedChannelId) {
        this._phase.set("connected");
        this.sendJoin(true);
      }
    });
    this.wsService.onConnected$.subscribe((connected) => {
      if (!connected && this.joinedChannelId) this._phase.set("reconnecting");
    });

    window.addEventListener("beforeunload", () => this.stopMedia());
  }

  // =====================================================================
  // Dispositivos e preferências
  // =====================================================================

  async loadAudioDevices(): Promise<void> {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === "audioinput");
      const outputs = devices.filter((d) => d.kind === "audiooutput");
      this._inputDevices.set(inputs);
      this._outputDevices.set(outputs);

      if (inputs.length > 0 && !inputs.some((d) => d.deviceId === this._selectedMicrophoneId())) {
        this._selectedMicrophoneId.set(inputs[0].deviceId);
      }
      if (outputs.length > 0 && !outputs.some((d) => d.deviceId === this._selectedAudioOutputId())) {
        this._selectedAudioOutputId.set(outputs[0].deviceId);
      }
    } catch (e) {
      console.warn("[VoiceService] Erro ao enumerar dispositivos:", e);
    }
  }

  async setMicrophoneDevice(deviceId: string): Promise<void> {
    this._selectedMicrophoneId.set(deviceId);
    write("ch_mic_id", deviceId);
    if (this.joinedChannelId) await this.restartMic();
  }

  async setAudioOutputDevice(deviceId: string): Promise<void> {
    this._selectedAudioOutputId.set(deviceId);
    write("ch_output_id", deviceId);
    for (const peer of Object.values(this.peers)) {
      peer.audio.forEach((el) => this.applySink(el));
    }
  }

  setNoiseSuppression(enabled: boolean): void {
    this._noiseSuppressionEnabled.set(enabled);
    write("ch_noise_suppression", String(enabled));
    if (this.joinedChannelId) void this.restartMic();
  }

  setInputSensitivity(threshold: number): void {
    this._inputSensitivity.set(threshold);
    write("ch_input_sensitivity", String(threshold));
  }

  setScreenShareVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(100, volume));
    this._screenShareVolume.set(clamped);
    write("ch_screen_volume", String(clamped));
    this.reconcileAudio();
  }

  setPushToTalk(enabled: boolean): void {
    this._pttEnabled.set(enabled);
    write("ch_ptt_enabled", String(enabled));
  }

  setPushToTalkKey(code: string): void {
    this._pttKey.set(code);
    write("ch_ptt_key", code);
  }

  setScreenQuality(id: ScreenQualityId): void {
    this._screenQuality.set(id);
    write("ch_screen_quality", id);
  }

  setScreenContent(content: ScreenContent): void {
    this._screenContent.set(content);
    write("ch_screen_content", content);
  }

  getUserVolume(userId: string): number {
    return this._userVolumes()[userId] ?? 100;
  }

  userVolume(userId: string): number {
    return this.getUserVolume(userId);
  }

  setUserVolume(userId: string, volume: number): void {
    const clamped = Math.max(0, Math.min(100, Math.round(volume)));
    this._userVolumes.update((v) => ({ ...v, [userId]: clamped }));
    write("ch_user_volumes", JSON.stringify(this._userVolumes()));
    this.reconcileAudio();
  }

  watchScreenOf(userId: string): void {
    this._focusedSharerId.set(userId);
  }

  private loadUserVolumes(): Record<string, number> {
    try {
      return JSON.parse(readString("ch_user_volumes", "{}")) || {};
    } catch {
      return {};
    }
  }

  private sensitivityToDb(sensitivity: number): number {
    // 5..45 na UI equivale a 10%..90% da escala do medidor (-70..0 dBFS).
    return -70 + ((sensitivity * 2) / 100) * 70;
  }

  // =====================================================================
  // Ciclo de vida da chamada
  // =====================================================================

  async startMedia(channelId?: string): Promise<void> {
    const target = channelId ?? this.channelService.voiceChannelId();
    if (!target) return;
    if (this.joinedChannelId === target) return;
    if (this.joinedChannelId) this.stopMedia();

    this.joinedChannelId = target;
    const session = ++this.session;
    this._phase.set("connecting");
    this._voiceError.set(null);
    this._roster.set([]);

    await this.loadIceServers();
    if (session !== this.session) return;

    await this.connectSfu(target, session);
    if (session !== this.session) return;

    this.subscribe(target);
    await this.startMic(session);
    if (session !== this.session) return;

    this.sendJoin(true);
    this.startStatsPolling();
  }

  stopMedia(): void {
    const channelId = this.joinedChannelId;
    if (!channelId && Object.keys(this.peers).length === 0 && !this.mic) return;

    this.session++;
    if (this._isSharingScreen()) void this.stopScreenShare();

    if (channelId) {
      this.wsService.send("/app/voice.leave", { channelId });
    }
    this.joinedChannelId = null;

    for (const id of Object.keys(this.peers)) this.closePeer(id);
    this.peers = {};
    this.earlySignals = {};
    this.teardownSfu();
    this.subscriptions.forEach((s) => s.unsubscribe());
    this.subscriptions = [];
    clearInterval(this.statsTimer);
    this.statsTimer = null;

    this.stopCamera();
    this.disposeMic();
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      void this.audioCtx.close();
    }
    this.audioCtx = null;

    this._roster.set([]);
    this._peerStats.set({});
    this._isSpeaking.set(false);
    this._micDb.set(-100);
    this._focusedSharerId.set(null);
    this._phase.set("idle");
    this.bump();
  }

  private async loadIceServers(): Promise<void> {
    try {
      const res = await new Promise<{ iceServers: RTCIceServer[] }>((resolve, reject) => {
        this.http.get<{ iceServers: RTCIceServer[] }>(`${environment.apiUrl}/voice/ice-servers`).subscribe({
          next: resolve,
          error: reject,
        });
      });
      this.iceServers = res.iceServers?.length ? res.iceServers : FALLBACK_ICE;
    } catch (e) {
      console.warn("[VoiceService] Sem configuração ICE do servidor, usando STUN público:", e);
      this.iceServers = FALLBACK_ICE;
    }
  }

  private async connectSfu(channelId: string, session: number): Promise<void> {
    try {
      const res = await new Promise<{ url: string; token: string } | null>((resolve, reject) => {
        this.http
          .get<{ url: string; token: string }>(`${environment.apiUrl}/voice/sfu`, { params: { channelId } })
          .subscribe({
            next: resolve,
            error: (err) => (err?.status === 404 ? resolve(null) : reject(err)),
          });
      });
      if (!res || session !== this.session) return;

      const transport = new SfuTransport({
        onTrack: (userId, source, track) => {
          (this.sfuTracks[userId] ??= {})[source] = track;
          if (source === "camera" || source === "screen") {
            this.sfuStreams.set(`${userId}:${source}`, new MediaStream([track]));
          }
          this.reconcileAudio();
          this.bump();
        },
        onTrackRemoved: (userId, source) => {
          delete this.sfuTracks[userId]?.[source];
          this.sfuStreams.delete(`${userId}:${source}`);
          const key = `${userId}:${source}`;
          const el = this.sfuAudio.get(key);
          if (el) {
            this.destroyAudio(el);
            this.sfuAudio.delete(key);
          }
          this.bump();
        },
        onQuality: (userId, level) => {
          this.sfuQuality[userId] = level;
          this.publishSfuStats();
        },
        onConnection: (state) => {
          if (!this.joinedChannelId) return;
          if (state === "reconnecting") this._phase.set("reconnecting");
          else if (state === "connected") this._phase.set("connected");
          else this._voiceError.set("A conexão de mídia com o servidor foi encerrada. Saia e entre na sala novamente.");
        },
      });
      await transport.connect(res.url, res.token);
      if (session !== this.session) {
        void transport.disconnect();
        return;
      }
      this.sfu = transport;
      this._usingSfu.set(true);
    } catch (err) {
      // SFU fora do ar ou mal configurado: não deixa a pessoa sem voz, cai na malha P2P.
      console.warn("[VoiceService] SFU indisponível, usando P2P:", err);
      this.sfu = null;
      this._usingSfu.set(false);
    }
  }

  private teardownSfu(): void {
    const sfu = this.sfu;
    this.sfu = null;
    this._usingSfu.set(false);
    if (sfu) void sfu.disconnect().catch(() => {});
    this.sfuAudio.forEach((el) => this.destroyAudio(el));
    this.sfuAudio.clear();
    this.sfuTracks = {};
    this.sfuStreams.clear();
    this.sfuQuality = {};
  }

  private publishSfuStats(): void {
    const stats: Record<string, PeerStats> = {};
    for (const [userId, level] of Object.entries(this.sfuQuality)) {
      stats[userId] = { rttMs: null, lossPct: null, relayed: false, level };
    }
    this._peerStats.set(stats);
  }

  private reconcileSfuAudio(deaf: boolean): void {
    for (const [userId, tracks] of Object.entries(this.sfuTracks)) {
      for (const [source, role] of [["microphone", "voice"], ["screen_audio", "screen"]] as const) {
        const track = tracks[source];
        if (!track) continue;
        const key = `${userId}:${source}`;
        let el = this.sfuAudio.get(key);
        if (!el) {
          el = this.createAudio(new MediaStream([track]), userId, role);
          this.sfuAudio.set(key, el);
        }
        el.muted = deaf;
        el.volume = this.volumeFor(userId, role);
      }
    }
  }

  private subscribe(channelId: string): void {
    this.subscriptions.forEach((s) => s.unsubscribe());
    this.subscriptions = [
      this.wsService.subscribe<any>(`/topic/voice/${channelId}`).subscribe({
        next: (msg) => this.onRoster(msg),
        error: (err) => console.error("[VoiceService] Erro no tópico de voz:", err),
      }),
      this.wsService.subscribe<any>("/user/queue/voice").subscribe({
        next: (msg) => this.onSignal(msg),
        error: (err) => console.error("[VoiceService] Erro na fila de sinais:", err),
      }),
    ];
  }

  private sendJoin(force = false): void {
    const channelId = this.joinedChannelId;
    if (!channelId) return;
    const now = Date.now();
    if (!force && now - this.lastJoinSentAt < 1500) return;
    this.lastJoinSentAt = now;
    this.wsService.send("/app/voice.join", { channelId, state: this.buildState() });
  }

  private buildState(): VoiceState {
    const me = this.auth.currentUser();
    return {
      isMuted: !!me.isMuted,
      isDeafened: !!me.isDeafened,
      isCameraOn: !!this._localCameraStream(),
      isSharingScreen: this._isSharingScreen(),
      isSpeaking: this._isSpeaking() && this.micOpen(),
      micStreamId: this.outMic.id,
      cameraStreamId: this.outCamera.id,
      screenStreamId: this.outScreen.id,
    };
  }

  private publishState(): void {
    const channelId = this.joinedChannelId;
    if (!channelId || this._phase() === "idle") return;
    this.wsService.send("/app/voice.state", { channelId, state: this.buildState() });
  }

  // =====================================================================
  // Presença (roster vindo do servidor)
  // =====================================================================

  private onRoster(msg: any): void {
    if (!msg || msg.type !== "roster" || msg.channelId !== this.joinedChannelId) return;
    const list: RosterEntry[] = (msg.participants ?? []).map((p: any) => ({
      userId: p.userId,
      username: p.username,
      avatarUrl: p.avatarUrl,
      state: p.state ?? {},
    }));

    const myId = this.auth.currentUser().id;
    this._roster.set(list);

    // O servidor perdeu a minha entrada (ex.: queda do WebSocket): entra de novo.
    if (!list.some((p) => p.userId === myId)) {
      this.sendJoin();
      return;
    }
    this._phase.set("connected");

    if (!this.sfu) {
      const others = list.filter((p) => p.userId !== myId);
      const present = new Set(others.map((p) => p.userId));
      for (const id of Object.keys(this.peers)) {
        if (!present.has(id)) this.closePeer(id);
      }
      for (const p of others) {
        if (!this.peers[p.userId]) this.createPeer(p.userId);
      }
    }

    this.reconcileAudio();
    void this.updateScreenSenderParams();
    this.bump();
  }

  private stateOf(userId: string): VoiceState | undefined {
    return this._roster().find((p) => p.userId === userId)?.state;
  }

  private remoteStream(userId: string, kind: "screen" | "camera"): MediaStream | null {
    const state = this.stateOf(userId);
    if (this.sfu) {
      const live = kind === "screen" ? state?.isSharingScreen : state?.isCameraOn;
      return live ? this.sfuStreams.get(`${userId}:${kind}`) ?? null : null;
    }
    const peer = this.peers[userId];
    if (!peer || !state) return null;
    const id = kind === "screen" ? state.screenStreamId : state.cameraStreamId;
    const live = kind === "screen" ? state.isSharingScreen : state.isCameraOn;
    if (!id || !live) return null;
    const stream = peer.streams.get(id);
    return stream && stream.getVideoTracks().length > 0 ? stream : null;
  }

  getUserVideoStream(userId: string): MediaStream | null {
    this._streamVersion();
    if (userId === this.auth.currentUser().id) return this._localCameraStream();
    return this.remoteStream(userId, "camera");
  }

  private bump(): void {
    this._streamVersion.update((v) => v + 1);
  }

  // =====================================================================
  // WebRTC (perfect negotiation)
  // =====================================================================

  private createPeer(userId: string): PeerEntry {
    const myId = this.auth.currentUser().id;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: "max-bundle" });

    const peer: PeerEntry = {
      userId,
      pc,
      polite: myId < userId,
      makingOffer: false,
      ignoreOffer: false,
      streams: new Map(),
      audio: new Map(),
      queue: Promise.resolve(),
      restartTimer: null,
      iceRestarts: 0,
    };
    this.peers[userId] = peer;

    // Negociação inicial determinística: só o lado "impolite" cria os transceivers (e portanto oferece).
    // O lado "polite" adota os transceivers da oferta recebida. Transceivers de addTransceiver dos dois lados
    // não casam entre si no Chrome e acabavam em 8 m-lines, com a oferta do lado polite perdida no glare.
    if (!peer.polite) {
      this.bindTransceivers(peer, [
        pc.addTransceiver("audio", { direction: "sendrecv", streams: [this.outMic] }),
        pc.addTransceiver("video", { direction: "sendrecv", streams: [this.outCamera] }),
        pc.addTransceiver("video", { direction: "sendrecv", streams: [this.outScreen] }),
        pc.addTransceiver("audio", { direction: "sendrecv", streams: [this.outScreen] }),
      ]);
    }

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.sendSignal(userId, "offer", { description: pc.localDescription });
      } catch (err) {
        console.warn("[VoiceService] Falha ao negociar:", err);
      } finally {
        peer.makingOffer = false;
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.sendSignal(userId, "ice-candidate", { candidate });
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      if (!peer.streams.has(stream.id)) {
        peer.streams.set(stream.id, stream);
        stream.addEventListener("addtrack", () => {
          this.reconcileAudio();
          this.bump();
        });
      }
      this.reconcileAudio();
      this.bump();
    };

    pc.onconnectionstatechange = () => this.onPeerConnectionState(peer);

    const early = this.earlySignals[userId];
    if (early) {
      delete this.earlySignals[userId];
      early.forEach((msg) => this.enqueueSignal(peer, msg));
    }
    return peer;
  }

  private bindTransceivers(peer: PeerEntry, txs: RTCRtpTransceiver[]): void {
    [peer.micTx, peer.camTx, peer.screenVideoTx, peer.screenAudioTx] = txs;
    void peer.micTx!.sender.replaceTrack(this.micTrack).catch(() => {});
    void peer.camTx!.sender.replaceTrack(this.cameraTrack).catch(() => {});
    void peer.screenVideoTx!.sender.replaceTrack(this.screenVideoTrack).catch(() => {});
    void peer.screenAudioTx!.sender.replaceTrack(this.screenAudioTrack).catch(() => {});
    void this.tuneSender(peer.micTx!.sender, { maxBitrate: MIC_MAX_BITRATE, priority: "high", networkPriority: "high" });
    void this.tuneSender(peer.screenAudioTx!.sender, { maxBitrate: SCREEN_AUDIO_MAX_BITRATE });
  }

  /** Lado polite: depois de aplicar a primeira oferta, os 4 transceivers recém-criados viram os nossos (sendrecv). */
  private adoptTransceivers(peer: PeerEntry): boolean {
    const txs = peer.pc.getTransceivers().filter((t) => t.mid !== null);
    const kinds = txs.map((t) => t.receiver.track.kind).join(",");
    if (txs.length < 4 || kinds !== "audio,video,video,audio") {
      console.warn("[VoiceService] Oferta com formato inesperado:", kinds);
      return false;
    }
    const streams = [this.outMic, this.outCamera, this.outScreen, this.outScreen];
    txs.slice(0, 4).forEach((tx, i) => {
      tx.direction = "sendrecv";
      tx.sender.setStreams(streams[i]);
    });
    this.bindTransceivers(peer, txs.slice(0, 4));
    return true;
  }

  private onPeerConnectionState(peer: PeerEntry): void {
    const state = peer.pc.connectionState;
    clearTimeout(peer.restartTimer);

    if (state === "connected") {
      peer.iceRestarts = 0;
      void this.updateScreenSenderParams();
    } else if (state === "disconnected") {
      // Costuma se recuperar sozinho; se não, reinicia o ICE.
      peer.restartTimer = setTimeout(() => {
        if (this.peers[peer.userId] === peer && peer.pc.connectionState !== "connected") this.restartIce(peer);
      }, 4000);
    } else if (state === "failed") {
      this.restartIce(peer);
    }
  }

  private restartIce(peer: PeerEntry): void {
    if (peer.iceRestarts >= 4) {
      this._voiceError.set("A conexão de voz com um participante falhou. Saia e entre na sala novamente.");
      return;
    }
    peer.iceRestarts++;
    try {
      peer.pc.restartIce();
    } catch (e) {
      console.warn("[VoiceService] restartIce falhou:", e);
    }
  }

  private onSignal(msg: any): void {
    if (!msg || msg.channelId !== this.joinedChannelId || !msg.senderId) return;
    const peer = this.peers[msg.senderId];
    if (peer) {
      this.enqueueSignal(peer, msg);
      return;
    }
    // O sinal chegou antes do roster que apresenta esse participante: guarda para quando o par for criado.
    const buf = (this.earlySignals[msg.senderId] ??= []);
    if (buf.length < 64) buf.push(msg);
  }

  /** Sinais de um par são tratados em série; a ordem offer -> candidates precisa ser preservada. */
  private enqueueSignal(peer: PeerEntry, msg: any): void {
    peer.queue = peer.queue.then(() => this.processSignal(peer, msg)).catch((e) => {
      console.warn("[VoiceService] Erro ao processar sinal:", e);
    });
  }

  private async processSignal(peer: PeerEntry, msg: any): Promise<void> {
    const { pc } = peer;
    if (pc.signalingState === "closed") return;

    if (msg.type === "offer" || msg.type === "answer") {
      const description: RTCSessionDescriptionInit | undefined = msg.data?.description;
      if (!description) return;

      const collision = description.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
      peer.ignoreOffer = !peer.polite && collision;
      if (peer.ignoreOffer) return;

      await pc.setRemoteDescription(description);
      if (description.type === "offer") {
        if (!peer.micTx) this.adoptTransceivers(peer);
        await pc.setLocalDescription();
        this.sendSignal(peer.userId, "answer", { description: pc.localDescription });
      }
    } else if (msg.type === "ice-candidate") {
      try {
        await pc.addIceCandidate(msg.data?.candidate);
      } catch (e) {
        if (!peer.ignoreOffer) throw e;
      }
    }
  }

  private sendSignal(targetId: string, type: string, data: any): void {
    const channelId = this.joinedChannelId;
    if (!channelId) return;
    this.wsService.send("/app/voice.signal", { channelId, targetId, type, data });
  }

  private closePeer(userId: string): void {
    const peer = this.peers[userId];
    if (!peer) return;
    clearTimeout(peer.restartTimer);
    peer.audio.forEach((el) => this.destroyAudio(el));
    peer.audio.clear();
    peer.pc.onnegotiationneeded = null;
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    try {
      peer.pc.close();
    } catch (_) {}
    delete this.peers[userId];
    delete this.earlySignals[userId];

    this._peerStats.update((s) => {
      const { [userId]: _removed, ...rest } = s;
      return rest;
    });
    this.bump();
  }

  private async tuneSender(sender: RTCRtpSender, patch: Record<string, unknown>): Promise<void> {
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      Object.assign(params.encodings[0], patch);
      await sender.setParameters(params);
    } catch (e) {
      console.debug("[VoiceService] setParameters ignorado:", e);
    }
  }

  // =====================================================================
  // Áudio recebido
  // =====================================================================

  /** Cria/atualiza os <audio> de cada par conforme o papel do stream (voz ou áudio da tela). */
  private reconcileAudio(deafOverride?: boolean): void {
    const deaf = deafOverride ?? !!this.auth.currentUser().isDeafened;
    if (this.sfu) this.reconcileSfuAudio(deaf);
    for (const peer of Object.values(this.peers)) {
      const state = this.stateOf(peer.userId);
      if (!state) continue;

      for (const [streamId, stream] of peer.streams) {
        if (stream.getAudioTracks().length === 0) continue;
        const role = streamId === state.screenStreamId ? "screen" : streamId === state.micStreamId ? "voice" : null;
        if (!role) continue;

        let el = peer.audio.get(streamId);
        if (!el) {
          el = this.createAudio(stream, peer.userId, role);
          peer.audio.set(streamId, el);
        }
        el.muted = deaf;
        el.volume = this.volumeFor(peer.userId, role);
      }
    }
  }

  private volumeFor(userId: string, role: "voice" | "screen"): number {
    return role === "screen" ? this._screenShareVolume() / 100 : this.getUserVolume(userId) / 100;
  }

  private createAudio(stream: MediaStream, userId: string, role: "voice" | "screen"): HTMLAudioElement {
    const el = document.createElement("audio");
    el.id = `remote-audio-${userId}-${role}`;
    el.autoplay = true;
    el.style.display = "none";
    el.srcObject = stream;
    document.body.appendChild(el);
    this.applySink(el);

    const tryPlay = () => {
      el.play().catch(() => {
        // Autoplay bloqueado até haver interação com a página.
        const resume = () => {
          void el.play().catch(() => {});
          void this.audioCtx?.resume();
        };
        window.addEventListener("click", resume, { once: true });
        window.addEventListener("keydown", resume, { once: true });
      });
    };
    tryPlay();
    return el;
  }

  private applySink(el: HTMLAudioElement): void {
    const id = this._selectedAudioOutputId();
    if (id && typeof (el as any).setSinkId === "function") {
      (el as any).setSinkId(id).catch((e: any) => console.warn("[VoiceService] setSinkId falhou:", e));
    }
  }

  private destroyAudio(el: HTMLAudioElement): void {
    el.pause();
    el.srcObject = null;
    el.remove();
  }

  // =====================================================================
  // Microfone
  // =====================================================================

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === "closed") {
      this.audioCtx = new AudioContext({ latencyHint: "interactive" });
    }
    if (this.audioCtx.state === "suspended") {
      void this.audioCtx.resume().catch(() => {});
      const resume = () => void this.audioCtx?.resume().catch(() => {});
      window.addEventListener("click", resume, { once: true });
      window.addEventListener("keydown", resume, { once: true });
    }
    return this.audioCtx;
  }

  private async startMic(session: number): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this._voiceError.set("Seu navegador não permite acessar o microfone (use HTTPS ou localhost).");
      return;
    }
    try {
      const ctx = this.ensureAudioContext();
      const pipeline = await MicPipeline.create(ctx, {
        deviceId: this._selectedMicrophoneId(),
        noiseSuppression: this._noiseSuppressionEnabled(),
        onLevel: (db) => this._micDb.set(db),
        onSpeaking: (speaking) => {
          this._isSpeaking.set(speaking);
          this.publishState();
        },
      });
      if (session !== this.session) {
        pipeline.dispose();
        return;
      }
      this.mic = pipeline;
      this.micTrack = pipeline.outputTrack;
      this._hasMic.set(true);
      pipeline.configure({
        thresholdDb: this.sensitivityToDb(this._inputSensitivity()),
        gateEnabled: this._noiseSuppressionEnabled() && !this._pttEnabled(),
        micOpen: this.micOpen(),
      });
      for (const peer of Object.values(this.peers)) {
        void peer.micTx?.sender.replaceTrack(this.micTrack);
      }
      void this.sfu?.setMicrophone(this.micTrack).catch((e) => console.warn("[SFU] mic:", e));
      // Rótulos dos dispositivos só aparecem depois da permissão.
      void this.loadAudioDevices();
    } catch (err) {
      this._hasMic.set(false);
      const name = (err as DOMException)?.name;
      this._voiceError.set(
        name === "NotAllowedError"
          ? "Permissão do microfone negada. Você ouve a sala, mas ninguém ouve você."
          : "Não foi possível acessar o microfone. Você ouve a sala, mas ninguém ouve você."
      );
      console.warn("[VoiceService] Microfone indisponível:", err);
    }
  }

  private async restartMic(): Promise<void> {
    const session = this.session;
    this.disposeMic();
    await this.startMic(session);
  }

  private disposeMic(): void {
    this.mic?.dispose();
    this.mic = null;
    this.micTrack = null;
    this._hasMic.set(false);
    for (const peer of Object.values(this.peers)) {
      void peer.micTx?.sender.replaceTrack(null).catch(() => {});
    }
    void this.sfu?.setMicrophone(null).catch(() => {});
  }

  // =====================================================================
  // Câmera
  // =====================================================================

  private async startCamera(): Promise<void> {
    if (!this.joinedChannelId || this._localCameraStream() || this.cameraStarting) return;
    this.cameraStarting = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      if (!this.joinedChannelId || !this.auth.currentUser().isCameraOn) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const track = stream.getVideoTracks()[0];
      track.contentHint = "motion";
      track.onended = () => this.auth.updateCurrentUser({ isCameraOn: false });
      this.cameraTrack = track;
      this._localCameraStream.set(stream);
      for (const peer of Object.values(this.peers)) {
        void peer.camTx?.sender.replaceTrack(track);
        if (peer.camTx) void this.tuneSender(peer.camTx.sender, { maxBitrate: 1_500_000 });
      }
      void this.sfu?.setCamera(track).catch((e) => console.warn("[SFU] câmera:", e));
      this.publishState();
    } catch (err) {
      console.warn("[VoiceService] Erro ao acessar câmera:", err);
      this._voiceError.set("Não foi possível acessar a câmera.");
      this.auth.updateCurrentUser({ isCameraOn: false });
    } finally {
      this.cameraStarting = false;
    }
  }

  private stopCamera(): void {
    const stream = this._localCameraStream();
    if (!stream && !this.cameraTrack) return;
    stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.cameraTrack = null;
    this._localCameraStream.set(null);
    for (const peer of Object.values(this.peers)) {
      void peer.camTx?.sender.replaceTrack(null).catch(() => {});
    }
    void this.sfu?.setCamera(null).catch(() => {});
    this.publishState();
  }

  // =====================================================================
  // Compartilhamento de tela
  // =====================================================================

  async toggleScreenShare(): Promise<void> {
    if (this._isSharingScreen()) {
      await this.stopScreenShare();
      return;
    }
    if (!this.joinedChannelId) return;

    const bridge = getDesktopBridge();
    try {
      if (bridge) {
        const selection = await this.openSourcePicker(bridge);
        if (!selection) return;
        await this.startDesktopShare(bridge, selection);
      } else {
        await this.startBrowserShare();
      }
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name !== "NotAllowedError" && name !== "AbortError") {
        console.warn("[VoiceService] Compartilhamento falhou:", err);
        this._voiceError.set("Não foi possível iniciar o compartilhamento de tela.");
      }
      await this.releaseScreen();
    }
  }

  private captureConstraints(): MediaTrackConstraints {
    const p = this.preset();
    return {
      width: { ideal: p.width, max: p.width },
      height: { ideal: p.height, max: p.height },
      frameRate: { ideal: p.fps, max: p.fps },
    };
  }

  /** No navegador: o áudio vem só da aba/janela escolhida; o áudio geral do sistema (e a call) fica de fora. */
  private async startBrowserShare(): Promise<void> {
    const options: any = {
      video: this.captureConstraints(),
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        suppressLocalAudioPlayback: true,
      },
      systemAudio: "exclude",
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
    };
    const stream = await navigator.mediaDevices.getDisplayMedia(options);
    this.displayStream = stream;
    await this.attachScreen(stream.getVideoTracks()[0], stream.getAudioTracks()[0] ?? null, stream);
  }

  private async startDesktopShare(bridge: NonNullable<ReturnType<typeof getDesktopBridge>>, selection: ShareSelection): Promise<void> {
    await bridge.startShare(selection);
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: this.captureConstraints(), audio: false });
    this.displayStream = stream;

    let audioTrack: MediaStreamTrack | null = null;
    if (selection.audioPid) {
      try {
        this.appAudio = new AppAudioCapture();
        audioTrack = await this.appAudio.start(this.ensureAudioContext(), bridge);
      } catch (e) {
        console.warn("[VoiceService] Áudio do aplicativo indisponível, transmitindo sem áudio:", e);
        this._voiceError.set("Não foi possível capturar o áudio do aplicativo. A tela será transmitida sem áudio.");
        this.appAudio?.stop();
        this.appAudio = null;
      }
    }
    await this.attachScreen(stream.getVideoTracks()[0], audioTrack, stream);
  }

  private async attachScreen(video: MediaStreamTrack, audio: MediaStreamTrack | null, source: MediaStream): Promise<void> {
    video.contentHint = this._screenContent() === "detail" ? "detail" : "motion";
    video.onended = () => void this.stopScreenShare();

    this.screenVideoTrack = video;
    this.screenAudioTrack = audio;
    this._screenPreview.set(new MediaStream([video]));
    this._isSharingScreen.set(true);

    for (const peer of Object.values(this.peers)) {
      await peer.screenVideoTx?.sender.replaceTrack(video);
      await peer.screenAudioTx?.sender.replaceTrack(audio);
    }
    await this.updateScreenSenderParams();
    await this.sfu?.setScreen(video, audio, this.sfuScreenOptions());
    this.publishState();
    // O stream bruto só interessa pelas trilhas; evita referência solta.
    void source;
  }

  private preset(): ScreenQualityPreset {
    return SCREEN_PRESETS.find((p) => p.id === this._screenQuality()) ?? SCREEN_PRESETS[1];
  }

  /** Na malha cada espectador custa um upload completo; reparte o orçamento entre os pares. */
  private sfuScreenOptions(): { bitrate: number; fps: number; detail: boolean } {
    const preset = this.preset();
    return { bitrate: preset.bitrate, fps: preset.fps, detail: this._screenContent() === "detail" };
  }

  private async updateScreenSenderParams(): Promise<void> {
    if (!this._isSharingScreen() || this.sfu) return;
    const peers = Object.values(this.peers);
    if (peers.length === 0) return;
    const preset = this.preset();
    const perPeer = Math.min(preset.bitrate, Math.round((preset.bitrate * 1.5) / peers.length));
    const detail = this._screenContent() === "detail";

    await Promise.all(
      peers.map(async (peer) => {
        try {
          const sender = peer.screenVideoTx?.sender;
          if (!sender) return;
          const params: any = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
          params.encodings[0].maxBitrate = perPeer;
          params.encodings[0].maxFramerate = preset.fps;
          params.degradationPreference = detail ? "maintain-resolution" : "maintain-framerate";
          await sender.setParameters(params);
        } catch (e) {
          console.debug("[VoiceService] Ajuste de bitrate da tela ignorado:", e);
        }
      })
    );
  }

  async stopScreenShare(): Promise<void> {
    if (this.stoppingScreen || !this._isSharingScreen()) return;
    this.stoppingScreen = true;
    try {
      await this.releaseScreen();
      this.publishState();
    } finally {
      this.stoppingScreen = false;
    }
  }

  private async releaseScreen(): Promise<void> {
    this.screenVideoTrack?.stop();
    this.screenAudioTrack?.stop();
    this.displayStream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.appAudio?.stop();
    this.appAudio = null;
    this.displayStream = null;
    this.screenVideoTrack = null;
    this.screenAudioTrack = null;
    this._screenPreview.set(null);
    this._isSharingScreen.set(false);

    for (const peer of Object.values(this.peers)) {
      await peer.screenVideoTx?.sender.replaceTrack(null).catch(() => {});
      await peer.screenAudioTx?.sender.replaceTrack(null).catch(() => {});
    }
    await this.sfu?.setScreen(null, null, this.sfuScreenOptions()).catch(() => {});
    await getDesktopBridge()?.stopShare().catch(() => {});
  }

  // ---- Seletor de fonte (Electron) ----

  private async openSourcePicker(bridge: NonNullable<ReturnType<typeof getDesktopBridge>>): Promise<ShareSelection | null> {
    const [sources, apps] = await Promise.all([bridge.listShareSources(), bridge.supportsAppAudio ? bridge.listAudioApps() : Promise.resolve([])]);
    this._pickerSources.set(sources);
    this._pickerApps.set(apps);
    this._pickerOpen.set(true);
    return new Promise((resolve) => {
      this.pickerResolver = resolve;
    });
  }

  confirmPicker(selection: ShareSelection): void {
    this._pickerOpen.set(false);
    this.pickerResolver?.(selection);
    this.pickerResolver = undefined;
  }

  cancelPicker(): void {
    this._pickerOpen.set(false);
    this.pickerResolver?.(null);
    this.pickerResolver = undefined;
  }

  // =====================================================================
  // Push-to-talk
  // =====================================================================

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.code === this._pttKey() && !e.repeat && !this.isTyping(e.target)) this._pttActive.set(true);
  };
  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (e.code === this._pttKey()) this._pttActive.set(false);
  };
  private readonly onBlur = () => this._pttActive.set(false);

  private isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  }

  private configurePushToTalk(enabled: boolean, key: string): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.unsubscribePtt?.();
    this.unsubscribePtt = undefined;
    this._pttActive.set(false);

    const bridge = getDesktopBridge();
    if (!enabled) {
      void bridge?.setPushToTalk(null);
      return;
    }

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);

    if (bridge) {
      void bridge.setPushToTalk(key);
      this.unsubscribePtt = bridge.onPushToTalk((active) => this._pttActive.set(active));
    }
  }

  // =====================================================================
  // Qualidade da conexão
  // =====================================================================

  private startStatsPolling(): void {
    clearInterval(this.statsTimer);
    this.statsTimer = setInterval(() => void this.pollStats(), 2000);
  }

  private async pollStats(): Promise<void> {
    if (this.sfu) return; // qualidade vem dos eventos do SFU
    const result: Record<string, PeerStats> = {};
    await Promise.all(
      Object.values(this.peers).map(async (peer) => {
        try {
          const report = await peer.pc.getStats();
          let rtt: number | null = null;
          let relayed = false;
          let received = 0;
          let lost = 0;
          const candidates = new Map<string, any>();
          report.forEach((s: any) => {
            if (s.type === "local-candidate") candidates.set(s.id, s);
          });
          report.forEach((s: any) => {
            if (s.type === "candidate-pair" && s.nominated && s.state === "succeeded") {
              if (typeof s.currentRoundTripTime === "number") rtt = Math.round(s.currentRoundTripTime * 1000);
              relayed = candidates.get(s.localCandidateId)?.candidateType === "relay";
            }
            if (s.type === "inbound-rtp" && s.kind === "audio") {
              received += s.packetsReceived ?? 0;
              lost += s.packetsLost ?? 0;
            }
          });

          let lossPct: number | null = null;
          if (peer.prevLoss) {
            const dRecv = received - peer.prevLoss.received;
            const dLost = lost - peer.prevLoss.lost;
            if (dRecv + dLost > 0) lossPct = Math.round((Math.max(0, dLost) / (dRecv + dLost)) * 100);
          }
          peer.prevLoss = { received, lost };

          let level: PeerStats["level"] = "unknown";
          if (peer.pc.connectionState === "connected" && rtt !== null) {
            level = rtt > 300 || (lossPct ?? 0) > 10 ? "poor" : rtt > 150 || (lossPct ?? 0) > 3 ? "ok" : "good";
          } else if (peer.pc.connectionState === "failed") {
            level = "poor";
          }
          result[peer.userId] = { rttMs: rtt, lossPct, relayed, level };
        } catch {
          /* par fechado durante a coleta */
        }
      })
    );
    this._peerStats.set(result);
  }
}
