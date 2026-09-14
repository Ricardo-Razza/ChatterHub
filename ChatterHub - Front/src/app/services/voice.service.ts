import { Injectable, computed, signal, effect } from "@angular/core";
import { Subscription } from "rxjs";
import { ChannelService } from "./channel.service";
import { UserService } from "./user.service";
import { WebSocketService } from "./websocket.service";
import { User } from "../models/user.model";

interface PeerEntry {
  pc: RTCPeerConnection;
  remoteStream: MediaStream;
  audioElements?: Map<string, HTMLAudioElement>;
  pendingCandidates: RTCIceCandidateInit[];
  screenSenders: RTCRtpSender[];
}

interface PeerConnectionMap {
  [userId: string]: PeerEntry;
}

@Injectable({ providedIn: "root" })
export class VoiceService {
  private readonly _isSharingScreen = signal<boolean>(false);
  private readonly _sharingUserId = signal<string | null>(null);
  private readonly _localStream = signal<MediaStream | null>(null);
  private readonly _screenStream = signal<MediaStream | null>(null);
  private readonly _remoteStreams = signal<{ [userId: string]: MediaStream }>({});
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

  readonly isLocalSharing = computed<boolean>(() => {
    const sharingId = this._sharingUserId();
    const me = this.userService.currentUser();
    return Boolean(sharingId && me.id && sharingId === me.id);
  });

  readonly activeScreenStream = computed<MediaStream | null>(() => {
    const sharingId = this._sharingUserId();
    if (!sharingId) return null;

    const me = this.userService.currentUser();
    if (sharingId === me.id) {
      return this._screenStream();
    }

    const remotes = this._remoteStreams();
    const remote = remotes[sharingId];
    if (remote && remote.getVideoTracks().length > 0) {
      return remote;
    }

    const peer = this.peers[sharingId];
    if (peer && peer.remoteStream && peer.remoteStream.getVideoTracks().length > 0) {
      return peer.remoteStream;
    }

    return null;
  });

  constructor(
    private readonly channelService: ChannelService,
    private readonly userService: UserService,
    private readonly wsService: WebSocketService
  ) {
    // Sincroniza estado de microfone local (hardware) e envia 'state-change' para os outros participantes
    effect(() => {
      const me = this.userService.currentUser();
      const stream = this._localStream();
      if (stream) {
        stream.getAudioTracks().forEach((track) => {
          track.enabled = !me.isMuted && !me.isDeafened;
        });
      }

      // Aplica ensurdecimento aos elementos de áudio dos peers conectados
      Object.values(this.peers).forEach((peer) => {
        if (peer.audioElements) {
          peer.audioElements.forEach((audio) => {
            audio.muted = Boolean(me.isDeafened);
          });
        }
      });

      const channelId = this.channelService.activeChannelId();
      if (channelId && me.id) {
        this.sendSignal({
          channelId,
          senderId: me.id,
          type: "state-change",
          data: {
            isMuted: me.isMuted,
            isDeafened: me.isDeafened,
            isCameraOn: me.isCameraOn,
          },
        });
      }
    }, { allowSignalWrites: true });
  }

  readonly participants = computed<User[]>(() => {
    if (this.channelService.mainAreaMode() !== "voice" && !this.channelService.activeChannelId()) {
      return [];
    }

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

    // Subscreve ao tópico STOMP do canal de voz imediatamente
    this.subscribeToVoiceSignals(channelId);

    try {
      if (this._localStream()) {
        this._localStream()?.getTracks().forEach((t) => t.stop());
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
        const audioSender = senders.find((s) => s.track && s.track.kind === "audio");
        if (audioSender && audioTrack) {
          audioSender.replaceTrack(audioTrack);
        } else if (audioTrack) {
          this.peers[peerId].pc.addTrack(audioTrack, stream);
          this.createOffer(peerId);
        }
      });
    } catch (err) {
      console.warn("[VoiceService] Permissão de microfone negada ou indisponível:", err);
    }

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
        isSharingScreen: this._isSharingScreen(),
      },
    });
  }

  stopMedia(): void {
    const channelId = this.channelService.activeChannelId();
    const me = this.userService.currentUser();

    if (this._isSharingScreen()) {
      this.stopScreenShare();
    }

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
    this._remoteStreams.set({});
    this._sharingUserId.set(null);

    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
      this.wsSubscription = undefined;
    }

    const stream = this._localStream();
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      this._localStream.set(null);
    }

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
        this.closePeer(signal.senderId);
        this.addConnectedUser(signal.senderId, signal.senderName, signal.data);
        this.sendUserStateTo(signal.senderId);
        await this.createOffer(signal.senderId);
        break;

      case "user-state":
        this.addConnectedUser(signal.senderId, signal.senderName, signal.data);
        break;

      case "offer":
        this.addConnectedUser(signal.senderId, signal.senderName, signal.data?.userData);
        if (signal.data?.userData?.isSharingScreen) {
          this._sharingUserId.set(signal.senderId);
        }
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

  private sendUserStateTo(targetId: string): void {
    const channelId = this.channelService.activeChannelId();
    const me = this.userService.currentUser();
    if (!channelId || !me.id) return;

    this.sendSignal({
      channelId,
      senderId: me.id,
      senderName: me.username,
      targetId,
      type: "user-state",
      data: {
        avatarUrl: me.avatarUrl,
        isMuted: me.isMuted,
        isDeafened: me.isDeafened,
        isCameraOn: me.isCameraOn,
        isSharingScreen: this._isSharingScreen(),
      },
    });
  }

  private addConnectedUser(userId: string, username: string, extraData?: any): void {
    this._connectedVoiceUsers.update((list) => {
      if (list.some((u) => u.id === userId)) {
        return list.map((u) =>
          u.id === userId
            ? {
                ...u,
                username: username || u.username,
                isSharingScreen: extraData?.isSharingScreen ?? u.isSharingScreen,
                avatarUrl: extraData?.avatarUrl || u.avatarUrl,
                isMuted: extraData?.isMuted ?? u.isMuted,
                isDeafened: extraData?.isDeafened ?? u.isDeafened,
                isCameraOn: extraData?.isCameraOn ?? u.isCameraOn,
              }
            : u
        );
      }
      const newUser: User = {
        id: userId,
        username: username || "Usuário",
        avatarUrl:
          extraData?.avatarUrl ||
          `https://api.dicebear.com/7.x/thumbs/svg?seed=${userId}&backgroundColor=23a55a`,
        status: "online",
        isMuted: extraData?.isMuted ?? false,
        isDeafened: extraData?.isDeafened ?? false,
        isCameraOn: extraData?.isCameraOn ?? false,
        isSharingScreen: extraData?.isSharingScreen ?? false,
      };
      return [...list, newUser];
    });

    if (extraData?.isSharingScreen) {
      this._sharingUserId.set(userId);
    }
  }

  private removeConnectedUser(userId: string): void {
    this._connectedVoiceUsers.update((list) => list.filter((u) => u.id !== userId));
    if (this._sharingUserId() === userId) {
      this._sharingUserId.set(null);
    }
    this.refreshRemoteStreams();
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
        const peer = this.peers[userId];
        if (peer) {
          peer.remoteStream.getVideoTracks().forEach((track) => {
            track.stop();
            peer.remoteStream.removeTrack(track);
          });
        }
        this.refreshRemoteStreams();
      }
    }
  }

  private getOrCreatePeer(peerId: string): PeerEntry {
    if (this.peers[peerId]) {
      const existing = this.peers[peerId];
      if (
        existing.pc.connectionState !== "closed" &&
        existing.pc.connectionState !== "failed" &&
        existing.pc.signalingState !== "closed"
      ) {
        return existing;
      }
      this.closePeer(peerId);
    }

    const pc = new RTCPeerConnection(this.iceServers);
    const remoteStream = new MediaStream();
    const entry: PeerEntry = {
      pc,
      remoteStream,
      audioElements: new Map<string, HTMLAudioElement>(),
      pendingCandidates: [],
      screenSenders: [],
    };

    const localStream = this._localStream();
    if (localStream && localStream.getAudioTracks().length > 0) {
      localStream.getAudioTracks().forEach((track) => pc.addTrack(track, localStream));
    } else {
      // Se não temos microfone ativo, adicionamos um transceiver para receber áudio de outros participantes
      try {
        pc.addTransceiver("audio", { direction: "recvonly" });
      } catch (e) {
        console.warn("[VoiceService] Erro ao adicionar transceiver de áudio:", e);
      }
    }

    const screenStream = this._screenStream();
    if (screenStream && this._isSharingScreen()) {
      screenStream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, screenStream);
        entry.screenSenders.push(sender);
      });
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
      const track = event.track;

      if (!entry.remoteStream.getTracks().some((t) => t.id === track.id)) {
        entry.remoteStream.addTrack(track);
      }

      if (track.kind === "audio") {
        if (!entry.audioElements) {
          entry.audioElements = new Map<string, HTMLAudioElement>();
        }

        if (!entry.audioElements.has(track.id)) {
          const audio = new Audio();
          audio.autoplay = true;
          const me = this.userService.currentUser();
          audio.muted = Boolean(me.isDeafened);
          audio.srcObject = new MediaStream([track]);
          audio
            .play()
            .catch((e) => console.warn("[VoiceService] Autoplay áudio remoto:", e));

          entry.audioElements.set(track.id, audio);

          track.onended = () => {
            audio.pause();
            audio.srcObject = null;
            entry.audioElements?.delete(track.id);
          };
        }
      }

      if (track.kind === "video") {
        track.onended = () => {
          entry.remoteStream.removeTrack(track);
          this.refreshRemoteStreams();
        };
        this.refreshRemoteStreams();
      }
    };

    this.peers[peerId] = entry;
    this.refreshRemoteStreams();
    return entry;
  }

  private refreshRemoteStreams(): void {
    const updated: { [userId: string]: MediaStream } = {};
    for (const [id, peer] of Object.entries(this.peers)) {
      if (peer.remoteStream) {
        updated[id] = peer.remoteStream;
      }
    }
    this._remoteStreams.set(updated);
  }

  private async createOffer(peerId: string): Promise<void> {
    const peer = this.getOrCreatePeer(peerId);

    if (peer.pc.signalingState !== "stable") {
      console.warn("[VoiceService] createOffer ignorado pois signalingState é:", peer.pc.signalingState);
      return;
    }

    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);

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
          isSharingScreen: this._isSharingScreen(),
        },
      },
    });
  }

  private async handleOffer(peerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.getOrCreatePeer(peerId);

    if (peer.pc.signalingState !== "stable") {
      try {
        await Promise.all([
          peer.pc.setLocalDescription({ type: "rollback" }),
        ]);
      } catch (e) {
        console.warn("[VoiceService] Rollback no handleOffer:", e);
      }
    }

    await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await this.flushPendingCandidates(peer);

    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);

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
    if (peer && peer.pc.signalingState === "have-local-offer") {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.flushPendingCandidates(peer);
    }
  }

  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    if (!candidate) return;
    const peer = this.getOrCreatePeer(peerId);

    if (!peer.pc.remoteDescription || !peer.pc.remoteDescription.type) {
      peer.pendingCandidates.push(candidate);
    } else {
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn("[VoiceService] Erro ao adicionar ICE candidate:", e);
      }
    }
  }

  private async flushPendingCandidates(peer: PeerEntry): Promise<void> {
    if (peer.pendingCandidates.length > 0) {
      for (const cand of peer.pendingCandidates) {
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn("[VoiceService] Erro ao descarregar ICE candidate pendente:", e);
        }
      }
      peer.pendingCandidates = [];
    }
  }

  private closePeer(peerId: string): void {
    const peer = this.peers[peerId];
    if (peer) {
      if (peer.audioElements) {
        peer.audioElements.forEach((audio) => {
          audio.pause();
          audio.srcObject = null;
        });
        peer.audioElements.clear();
      }
      peer.remoteStream.getTracks().forEach((track) => track.stop());
      peer.pc.close();
      delete this.peers[peerId];
      this.refreshRemoteStreams();
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
      await this.stopScreenShare();
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });

        this._screenStream.set(stream);
        this._isSharingScreen.set(true);
        const me = this.userService.currentUser();
        this._sharingUserId.set(me.id);

        const videoTrack = stream.getVideoTracks()[0];
        const audioTracks = stream.getAudioTracks();

        if (audioTracks.length === 0) {
          console.warn("[VoiceService] Compartilhamento sem áudio: certifique-se de marcar 'Compartilhar áudio' na janela do navegador.");
        } else {
          console.log("[VoiceService] Áudio de tela capturado com sucesso!");
        }

        for (const peerId of Object.keys(this.peers)) {
          const peer = this.peers[peerId];
          peer.screenSenders = [];

          const vSender = peer.pc.addTrack(videoTrack, stream);
          peer.screenSenders.push(vSender);

          if (audioTracks.length > 0) {
            const aSender = peer.pc.addTrack(audioTracks[0], stream);
            peer.screenSenders.push(aSender);
          }

          await this.createOffer(peerId);
        }

        const channelId = this.channelService.activeChannelId();
        if (channelId && me.id) {
          this.sendSignal({
            channelId,
            senderId: me.id,
            type: "state-change",
            data: { isSharingScreen: true },
          });
        }

        videoTrack.onended = () => {
          this.stopScreenShare();
        };
      } catch (err) {
        console.warn("[VoiceService] Compartilhamento cancelado ou erro:", err);
      }
    }
  }

  async stopScreenShare(): Promise<void> {
    const screenStream = this._screenStream();
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      this._screenStream.set(null);
    }
    this._isSharingScreen.set(false);

    const me = this.userService.currentUser();
    if (this._sharingUserId() === me.id) {
      this._sharingUserId.set(null);
    }

    for (const peerId of Object.keys(this.peers)) {
      const peer = this.peers[peerId];
      if (peer) {
        if (peer.screenSenders && peer.screenSenders.length > 0) {
          peer.screenSenders.forEach((sender) => {
            try {
              peer.pc.removeTrack(sender);
            } catch (e) {
              console.warn("[VoiceService] Erro ao remover sender de tela:", e);
            }
          });
          peer.screenSenders = [];
        } else {
          peer.pc.getSenders().forEach((sender) => {
            if (sender.track && sender.track.kind === "video") {
              try {
                peer.pc.removeTrack(sender);
              } catch (e) {
                console.warn("[VoiceService] Erro ao remover sender de vídeo:", e);
              }
            }
          });
        }

        try {
          await this.createOffer(peerId);
        } catch (e) {
          console.warn("[VoiceService] Erro ao renegociar após parar tela:", e);
        }
      }
    }

    const channelId = this.channelService.activeChannelId();
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