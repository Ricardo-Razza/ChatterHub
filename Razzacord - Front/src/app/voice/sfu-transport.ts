import {
  ConnectionQuality,
  ConnectionState,
  Participant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  TrackPublishOptions,
} from 'livekit-client';

export type SfuSource = 'microphone' | 'camera' | 'screen' | 'screen_audio';
export type SfuQuality = 'good' | 'ok' | 'poor' | 'unknown';

export interface SfuHandlers {
  onTrack(userId: string, source: SfuSource, track: MediaStreamTrack): void;
  onTrackRemoved(userId: string, source: SfuSource): void;
  onQuality(userId: string, level: SfuQuality): void;
  onConnection(state: 'connected' | 'reconnecting' | 'disconnected'): void;
}

const SOURCE_MAP: Record<string, SfuSource | undefined> = {
  [Track.Source.Microphone]: 'microphone',
  [Track.Source.Camera]: 'camera',
  [Track.Source.ScreenShare]: 'screen',
  [Track.Source.ScreenShareAudio]: 'screen_audio',
};

const LK_SOURCE: Record<SfuSource, Track.Source> = {
  microphone: Track.Source.Microphone,
  camera: Track.Source.Camera,
  screen: Track.Source.ScreenShare,
  screen_audio: Track.Source.ScreenShareAudio,
};

/**
 * Mídia via SFU (LiveKit): cada participante envia UMA vez ao servidor, que redistribui.
 * Na malha P2P o upload de quem transmite a tela cresce com o número de espectadores.
 * A UI continua usando MediaStreams próprios; aqui só entregamos/recebemos MediaStreamTracks.
 */
export class SfuTransport {
  private readonly room = new Room({
    // Não usamos track.attach() (a UI monta os próprios MediaStreams), então o stream adaptativo ficaria cego.
    adaptiveStream: false,
    dynacast: true,
    stopLocalTrackOnUnpublish: false,
  });
  private published = new Map<SfuSource, MediaStreamTrack>();

  constructor(private readonly handlers: SfuHandlers) {
    this.room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        const source = SOURCE_MAP[pub.source];
        if (source) this.handlers.onTrack(participant.identity, source, track.mediaStreamTrack);
      })
      .on(RoomEvent.TrackUnsubscribed, (_track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        const source = SOURCE_MAP[pub.source];
        if (source) this.handlers.onTrackRemoved(participant.identity, source);
      })
      .on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, participant: Participant) => {
        this.handlers.onQuality(participant.identity, toLevel(quality));
      })
      .on(RoomEvent.Reconnecting, () => this.handlers.onConnection('reconnecting'))
      .on(RoomEvent.Reconnected, () => this.handlers.onConnection('connected'))
      .on(RoomEvent.Disconnected, () => this.handlers.onConnection('disconnected'));
  }

  get state(): ConnectionState {
    return this.room.state;
  }

  async connect(url: string, token: string): Promise<void> {
    await this.room.connect(url, token, { autoSubscribe: true });
    this.handlers.onConnection('connected');
  }

  async disconnect(): Promise<void> {
    this.published.clear();
    await this.room.disconnect();
  }

  async setMicrophone(track: MediaStreamTrack | null): Promise<void> {
    await this.swap('microphone', track, { name: 'mic', dtx: true, red: true });
  }

  async setCamera(track: MediaStreamTrack | null): Promise<void> {
    await this.swap('camera', track, {
      name: 'camera',
      simulcast: true,
      videoEncoding: { maxBitrate: 1_500_000, maxFramerate: 30 },
    });
  }

  async setScreen(
    video: MediaStreamTrack | null,
    audio: MediaStreamTrack | null,
    opts: { bitrate: number; fps: number; detail: boolean }
  ): Promise<void> {
    const encoding = { maxBitrate: opts.bitrate, maxFramerate: opts.fps };
    await this.swap('screen', video, {
      name: 'screen',
      simulcast: false,
      videoEncoding: encoding,
      screenShareEncoding: encoding,
      degradationPreference: opts.detail ? 'maintain-resolution' : 'maintain-framerate',
    });
    await this.swap('screen_audio', audio, { name: 'screen-audio', dtx: false, red: false, forceStereo: true });
  }

  private async swap(source: SfuSource, track: MediaStreamTrack | null, options: TrackPublishOptions): Promise<void> {
    const current = this.published.get(source);
    if (current === track) return;
    if (current) {
      this.published.delete(source);
      try {
        await this.room.localParticipant.unpublishTrack(current, false);
      } catch (e) {
        console.warn('[SFU] unpublish falhou:', e);
      }
    }
    if (track) {
      this.published.set(source, track);
      await this.room.localParticipant.publishTrack(track, { ...options, source: LK_SOURCE[source] });
    }
  }
}

function toLevel(q: ConnectionQuality): SfuQuality {
  switch (q) {
    case ConnectionQuality.Excellent:
    case ConnectionQuality.Good:
      return 'good';
    case ConnectionQuality.Poor:
      return 'poor';
    case ConnectionQuality.Lost:
      return 'poor';
    default:
      return 'unknown';
  }
}
