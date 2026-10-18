import { PCM_PLAYER_WORKLET_SOURCE, loadWorklet } from './audio-worklets';
import { APP_AUDIO_SAMPLE_RATE, DesktopBridge } from './desktop-bridge';

/**
 * Converte o PCM da captura por processo (Electron) em uma MediaStreamTrack para enviar junto da tela.
 * Só o áudio do aplicativo escolhido entra: a call (Discord, ChatterHub...) fica de fora.
 */
export class AppAudioCapture {
  private node?: AudioWorkletNode;
  private destination?: MediaStreamAudioDestinationNode;
  private unsubscribe?: () => void;

  async start(ctx: AudioContext, bridge: DesktopBridge): Promise<MediaStreamTrack> {
    await loadWorklet(ctx, 'chatterhub-pcm-player', PCM_PLAYER_WORKLET_SOURCE);
    this.node = new AudioWorkletNode(ctx, 'chatterhub-pcm-player', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node.port.postMessage({ rate: APP_AUDIO_SAMPLE_RATE });
    this.destination = ctx.createMediaStreamDestination();
    this.node.connect(this.destination);

    const node = this.node;
    this.unsubscribe = bridge.onAppAudio((pcm) => node.port.postMessage({ pcm }, [pcm]));
    return this.destination.stream.getAudioTracks()[0];
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    try { this.node?.disconnect(); } catch (_) {}
    this.destination?.stream.getTracks().forEach((t) => t.stop());
    this.node = undefined;
    this.destination = undefined;
  }
}
