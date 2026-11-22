import { GATE_WORKLET_SOURCE, loadWorklet } from './audio-worklets';

export interface MicPipelineOptions {
  deviceId: string;
  noiseSuppression: boolean;
  onLevel: (dbfs: number) => void;
  onSpeaking: (speaking: boolean) => void;
}

/**
 * Microfone -> noise gate (na thread de áudio) -> trilha enviada. O gate, o mute e o push-to-talk
 * agem no ganho do worklet, então a trilha nunca é desligada e não é preciso renegociar nada.
 */
export class MicPipeline {
  readonly outputTrack: MediaStreamTrack;

  private constructor(
    private readonly rawStream: MediaStream,
    private readonly node: AudioWorkletNode,
    private readonly source: MediaStreamAudioSourceNode,
    private readonly destination: MediaStreamAudioDestinationNode
  ) {
    this.outputTrack = destination.stream.getAudioTracks()[0];
  }

  static async create(ctx: AudioContext, opts: MicPipelineOptions): Promise<MicPipeline> {
    const constraints = (exact: boolean): MediaStreamConstraints => ({
      audio: {
        deviceId: exact && opts.deviceId ? { exact: opts.deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: opts.noiseSuppression,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });

    let raw: MediaStream;
    try {
      raw = await navigator.mediaDevices.getUserMedia(constraints(true));
    } catch (err) {
      if ((err as DOMException)?.name === 'NotAllowedError') throw err;
      // Dispositivo salvo não existe mais: cai no padrão do sistema.
      raw = await navigator.mediaDevices.getUserMedia(constraints(false));
    }

    await loadWorklet(ctx, 'razzacord-gate', GATE_WORKLET_SOURCE);
    const source = ctx.createMediaStreamSource(raw);
    const node = new AudioWorkletNode(ctx, 'razzacord-gate', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    const destination = ctx.createMediaStreamDestination();
    source.connect(node);
    node.connect(destination);

    const pipeline = new MicPipeline(raw, node, source, destination);
    let wasSpeaking = false;
    node.port.onmessage = (e: MessageEvent) => {
      const { level, speaking } = e.data || {};
      if (typeof level === 'number') {
        opts.onLevel(level > 0 ? 20 * Math.log10(level) : -100);
      }
      if (typeof speaking === 'boolean' && speaking !== wasSpeaking) {
        wasSpeaking = speaking;
        opts.onSpeaking(speaking);
      }
    };

    // Se o dispositivo for desconectado, a captura bruta termina; quem usa decide o que fazer.
    raw.getAudioTracks()[0]?.addEventListener('ended', () => opts.onSpeaking(false));
    return pipeline;
  }

  get hardwareTrack(): MediaStreamTrack | undefined {
    return this.rawStream.getAudioTracks()[0];
  }

  configure(settings: { thresholdDb?: number; gateEnabled?: boolean; micOpen?: boolean }): void {
    this.node.port.postMessage(settings);
  }

  dispose(): void {
    try { this.node.port.onmessage = null; } catch (_) {}
    try { this.source.disconnect(); } catch (_) {}
    try { this.node.disconnect(); } catch (_) {}
    this.rawStream.getTracks().forEach((t) => t.stop());
    this.destination.stream.getTracks().forEach((t) => t.stop());
  }
}
