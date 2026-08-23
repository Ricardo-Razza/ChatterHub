import { Injectable, computed, signal } from "@angular/core";
import { Subscription } from "rxjs";
import { ChannelService } from "./channel.service";
import { UserService } from "./user.service";
import { WebSocketService } from "./websocket.service";
import { User } from "../models/user.model";

interface PeerConnectionMap {
  [userId: string]: {
    pc: RTCPeerConnection;
    remoteStream: MediaStream;
  };
}

@Injectable({ providedIn: "root" })
export class VoiceService {
  private readonly _isSharingScreen = signal<boolean>(false);
  private readonly _sharingUserId = signal<string | null>(null);
  private readonly _localStream = signal<MediaStream | null>(null);
  private readonly _screenStream = signal<MediaStream | null>(null);
  private readonly _isSpeaking = signal<boolean>(false);
  private readonly _connectedVoiceUsers = signal<User[]>([]);
  private readonly _noiseSuppressionEnabled = signal<boolean>(true);
  private readonly _inputSensitivity = signal<number>(15); // Threshold do microfone

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private biquadFilter: BiquadFilterNode | null = null;
  private animationFrameId: number | null = null;
  private wsSubscription?: Subscription;

  private peers: PeerConnectionMap = {};

  private readonly iceServers: RTCConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
  };

  readonly isSharingScreen = this._isSharingScreen.asReadonly();
  readonly sharingUserId = this._sharingUserId.asReadonly();
  readonly localStream = this._localStream.asReadonly();
  readonly screenStream = this._screenStream.asReadonly();
  readonly noiseSuppressionEnabled = this._noiseSuppressionEnabled.asReadonly();
  readonly inputSensitivity = this._inputSensitivity.asReadonly();

  constructor(
    private readonly channelService: ChannelService,
    private readonly userService: UserService,
    private readonly wsService: WebSocketService
  ) {}

  readonly participants = computed<User[]>(() => {
    const channel = this.channelService.activeChannel();
    if (!channel || channel.type !== "voice") return [];

    const currentUser = this.userService.currentUser();
    const isSpeaking = this._isSpeaking();
    const isSharingScreen = this._isSharingScreen();

    const selfUser: User = {
      ...currentUser,
      isSpeaking: !currentUser.isMuted && isSpeaking,
      isSharingScreen,
    };

    const others = this._connectedVoiceUsers().filter((u) => u.id !== selfUser.id);
    return [selfUser, ...others];
  });

  setNoiseSuppression(enabled: boolean): void {
    this._noiseSuppressionEnabled.set(enabled);
    // Se o microfone já estiver ativo, reinicia para aplicar a nova restrição de áudio
    if (this._localStream()) {
      this.startMedia();
    }
  }

  setInputSensitivity(threshold: number): void {
    this._inputSensitivity.set(threshold);
  }

  async startMedia(): Promise<void> {
    const channelId = this.channelService.activeChannelId();
    if (!channelId) return;

    try {
      if (this._localStream()) {
        this._localStream()?.getTracks().forEach(t => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: this._noiseSuppressionEnabled(),
          autoGainControl: true,
        },
        video: false,
      });

      this._localStream.set(stream);
      this.setupVoiceActivityDetection(stream);

      // Atualiza os tracks em todos os peers já conectados
      const audioTrack = stream.getAudioTracks()[0];
      Object.keys(this.peers).forEach((peerId) => {
        const senders = this.peers[peerId].pc.getSenders();
        const audioSender = senders.find(s => s.track && s.track.kind === "audio");
        if (audioSender && audioTrack) {
          audioSender.replaceTrack(audioTrack);
        }
      });

    } catch (err) {
      console.warn("[VoiceService] Permissão de microfone negada ou indisponível:", err);
    }

    this.subscribeToVoiceSignals(channelId);

    const me = this.userService.currentUser();
    this.sendSignal({
      channelId,
      senderId: me.id,
      senderName: me.username,
      type: "join",
      data: {
        avatarUrl: me.avatarUrl,
        isMuted: me.isMuted,
        isDeafened: me.isDeafened,
        isCameraOn: me.isCameraOn,
      },
    });
  }

  stopMedia(): void {
    const channelId = this.channelService.activeChannelId();
    const me = this.userService.currentUser();

    if (channelId && me.id) {
      this.sendSignal({
        channelId,
        senderId: me.id,
        senderName: me.username,
        type: "leave",
        data: null,
      });
    }

    Object.keys(this.peers).forEach((peerId) => {
      this.closePeer(peerId);
    });
    this.peers = {};
    this._connectedVoiceUsers.set([]);

    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
      this.wsSubscription = undefined;
    }

    const stream = this._localStream();
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      this._localStream.set(null);
    }

    this.stopScreenShare();
    this.cleanupVoiceDetection();
  }

  private subscribeToVoiceSignals(channelId: string): void {
    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
    }

    this.wsSubscription = this.wsService
      .subscribe<any>(`/topic/voice/${channelId}`)
      .subscribe({
        next: (signal) => {
          this.handleIncomingSignal(signal);
        },
        error: (err) => console.error("[VoiceService] Erro no sinal de voz:", err),
      });
  }

  private async handleIncomingSignal(signal: any): Promise<void> {
    const me = this.userService.currentUser();
    if (!signal || signal.senderId === me.id) return;

    if (signal.targetId && signal.targetId !== me.id) return;

    switch (signal.type) {
      case "join":
        this.addConnectedUser(signal.senderId, signal.senderName, signal.data);
        await this.createOffer(signal.senderId);
        break;

      case "offer":
        this.addConnectedUser(signal.senderId, signal.senderName, signal.data?.userData);
        await this.handleOffer(signal.senderId, signal.data?.sdp);
        break;

      case "answer":
        await this.handleAnswer(signal.senderId, signal.data?.sdp);
        break;

      case "ice-candidate":
        await this.handleIceCandidate(signal.senderId, signal.data?.candidate);
        break;

      case "state-change":
        this.updatePeerState(signal.senderId, signal.data);
        break;

      case "leave":
        this.removeConnectedUser(signal.senderId);
        this.closePeer(signal.senderId);
        break;
    }
  }

  private addConnectedUser(userId: string, username: string, extraData?: any): void {
    this._connectedVoiceUsers.update((list) => {
      if (list.some((u) => u.id === userId)) return list;
      const newUser: User = {
        id: userId,
        username: username || "Usuário",
        avatarUrl: extraData?.avatarUrl || `https://api.dicebear.com/7.x/thumbs/svg?seed=${userId}&backgroundColor=23a55a`,
        status: "online",
        isMuted: extraData?.isMuted ?? false,
        isDeafened: extraData?.isDeafened ?? false,
        isCameraOn: extraData?.isCameraOn ?? false,
        isSharingScreen: extraData?.isSharingScreen ?? false,
      };
      return [...list, newUser];
    });
  }

  private removeConnectedUser(userId: string): void {
    this._connectedVoiceUsers.update((list) => list.filter((u) => u.id !== userId));
    if (this._sharingUserId() === userId) {
      this._sharingUserId.set(null);
    }
  }

  private updatePeerState(userId: string, data: any): void {
    if (!data) return;
    this._connectedVoiceUsers.update((list) =>
      list.map((u) => {
        if (u.id === userId) {
          return {
            ...u,
            isMuted: data.isMuted ?? u.isMuted,
            isSpeaking: data.isSpeaking ?? u.isSpeaking,
            isCameraOn: data.isCameraOn ?? u.isCameraOn,
            isSharingScreen: data.isSharingScreen ?? u.isSharingScreen,
          };
        }
        return u;
      })
    );

    if (data.isSharingScreen !== undefined) {
      if (data.isSharingScreen) {
        this._sharingUserId.set(userId);
      } else if (this._sharingUserId() === userId) {
        this._sharingUserId.set(null);
      }
    }
  }

  private getOrCreatePeer(peerId: string): { pc: RTCPeerConnection; remoteStream: MediaStream } {
    if (this.peers[peerId]) {
      return this.peers[peerId];
    }

    const pc = new RTCPeerConnection(this.iceServers);
    const remoteStream = new MediaStream();

    const localStream = this._localStream();
    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }

    const screenStream = this._screenStream();
    if (screenStream) {
      screenStream.getTracks().forEach((track) => pc.addTrack(track, screenStream));
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const channelId = this.channelService.activeChannelId();
        const me = this.userService.currentUser();
        this.sendSignal({
          channelId,
          senderId: me.id,
          targetId: peerId,
          type: "ice-candidate",
          data: { candidate: event.candidate },
        });
      }
    };

    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });

      const remoteAudio = new Audio();
      remoteAudio.srcObject = remoteStream;
      remoteAudio.autoplay = true;
      remoteAudio.play().catch((e) => console.warn("[VoiceService] Autoplay áudio remoto:", e));
    };

    this.peers[peerId] = { pc, remoteStream };
    return this.peers[peerId];
  }

  private async createOffer(peerId: string): Promise<void> {
    const { pc } = this.getOrCreatePeer(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const channelId = this.channelService.activeChannelId();
    const me = this.userService.currentUser();

    this.sendSignal({
      channelId,
      senderId: me.id,
      senderName: me.username,
      targetId: peerId,
      type: "offer",
      data: {
        sdp: offer,
        userData: {
          avatarUrl: me.avatarUrl,
          isMuted: me.isMuted,
          isCameraOn: me.isCameraOn,
        },
      },
    });
  }

  private async handleOffer(peerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const { pc } = this.getOrCreatePeer(peerId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    const channelId = this.channelService.activeChannelId();
    const me = this.userService.currentUser();

    this.sendSignal({
      channelId,
      senderId: me.id,
      senderName: me.username,
      targetId: peerId,
      type: "answer",
      data: { sdp: answer },
    });
  }

  private async handleAnswer(peerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.peers[peerId];
    if (peer) {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }

  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peer = this.peers[peerId];
    if (peer && candidate) {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  private closePeer(peerId: string): void {
    const peer = this.peers[peerId];
    if (peer) {
      peer.pc.close();
      delete this.peers[peerId];
    }
  }

  private sendSignal(signal: any): void {
    this.wsService.send("/app/voice.signal", signal);
  }

  private setupVoiceActivityDetection(stream: MediaStream): void {
    try {
      this.cleanupVoiceDetection();

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;

      this.micSource = this.audioContext.createMediaStreamSource(stream);

      // Filtro passa-baixa/passa-alta inteligente para supressão de ruído adicional em tempo real
      if (this._noiseSuppressionEnabled()) {
        this.biquadFilter = this.audioContext.createBiquadFilter();
        this.biquadFilter.type = "bandpass";
        this.biquadFilter.frequency.value = 1700; // Frequência da voz humana
        this.biquadFilter.Q.value = 1.0;

        this.micSource.connect(this.biquadFilter);
        this.biquadFilter.connect(this.analyser);
      } else {
        this.micSource.connect(this.analyser);
      }

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const threshold = this._inputSensitivity();
        const speaking = average > threshold;

        if (this._isSpeaking() !== speaking) {
          this._isSpeaking.set(speaking);

          const channelId = this.channelService.activeChannelId();
          const me = this.userService.currentUser();
          if (channelId && me.id) {
            this.sendSignal({
              channelId,
              senderId: me.id,
              type: "state-change",
              data: { isSpeaking: speaking },
            });
          }
        }

        this.animationFrameId = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      console.error("[VoiceService] Erro na detecção de voz:", e);
    }
  }

  private cleanupVoiceDetection(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.biquadFilter) {
      this.biquadFilter.disconnect();
      this.biquadFilter = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close();
      this.audioContext = null;
    }
    this._isSpeaking.set(false);
  }

  async toggleScreenShare(): Promise<void> {
    if (this._isSharingScreen()) {
      this.stopScreenShare();
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        this._screenStream.set(stream);
        this._isSharingScreen.set(true);
        this._sharingUserId.set(this.userService.currentUser().id);

        const videoTrack = stream.getVideoTracks()[0];
        Object.keys(this.peers).forEach((peerId) => {
          const pc = this.peers[peerId].pc;
          pc.addTrack(videoTrack, stream);
          this.createOffer(peerId);
        });

        const channelId = this.channelService.activeChannelId();
        const me = this.userService.currentUser();
        this.sendSignal({
          channelId,
          senderId: me.id,
          type: "state-change",
          data: { isSharingScreen: true },
        });

        videoTrack.onended = () => {
          this.stopScreenShare();
        };
      } catch (err) {
        console.warn("[VoiceService] Compartilhamento cancelado:", err);
      }
    }
  }

  private stopScreenShare(): void {
    const screenStream = this._screenStream();
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      this._screenStream.set(null);
    }
    this._isSharingScreen.set(false);
    this._sharingUserId.set(null);

    const channelId = this.channelService.activeChannelId();
    const me = this.userService.currentUser();
    if (channelId && me.id) {
      this.sendSignal({
        channelId,
        senderId: me.id,
        type: "state-change",
        data: { isSharingScreen: false },
      });
    }
  }
}