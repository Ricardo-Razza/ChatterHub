/**
 * Worklets de áudio carregados via Blob URL. Rodam na thread de áudio, então continuam
 * funcionando com a janela minimizada ou em segundo plano (requestAnimationFrame/timers
 * são limitados nesses casos, o que silenciava o microfone com o gate antigo).
 */

/** Noise gate + detector de voz. Mensagens: {thresholdDb, gateEnabled, micOpen}. Emite {level, speaking}. */
export const GATE_WORKLET_SOURCE = `
class GateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.thresholdLin = Math.pow(10, -42 / 20);
    this.gateEnabled = true;
    this.micOpen = true;
    this.gain = 0;
    this.hold = 0;
    this.speaking = false;
    this.holdSamples = Math.round(sampleRate * 0.3);
    this.attack = 1 - Math.exp(-1 / (0.005 * sampleRate));
    this.release = 1 - Math.exp(-1 / (0.06 * sampleRate));
    this.sinceReport = 0;
    this.windowPeak = 0;
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (typeof d.thresholdDb === 'number') this.thresholdLin = Math.pow(10, d.thresholdDb / 20);
      if (typeof d.gateEnabled === 'boolean') this.gateEnabled = d.gateEnabled;
      if (typeof d.micOpen === 'boolean') this.micOpen = d.micOpen;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const frames = output[0].length;

    if (!input || input.length === 0) {
      for (const ch of output) ch.fill(0);
      return true;
    }

    const src = input[0];
    let sum = 0;
    for (let i = 0; i < frames; i++) sum += src[i] * src[i];
    const rms = Math.sqrt(sum / frames);
    if (rms > this.windowPeak) this.windowPeak = rms;

    if (rms > this.thresholdLin) {
      this.hold = this.holdSamples;
    } else if (this.hold > 0) {
      this.hold -= frames;
    }
    const voice = this.hold > 0;
    if (voice !== this.speaking) {
      this.speaking = voice;
      this.port.postMessage({ speaking: voice, level: this.windowPeak });
    }

    const target = this.micOpen && (voice || !this.gateEnabled) ? 1 : 0;
    for (let i = 0; i < frames; i++) {
      this.gain += (target - this.gain) * (target > this.gain ? this.attack : this.release);
      const v = src[i] * this.gain;
      for (let c = 0; c < output.length; c++) output[c][i] = v;
    }

    this.sinceReport += frames;
    if (this.sinceReport >= sampleRate * 0.05) {
      this.port.postMessage({ speaking: this.speaking, level: this.windowPeak });
      this.sinceReport = 0;
      this.windowPeak = 0;
    }
    return true;
  }
}
registerProcessor('razzacord-gate', GateProcessor);
`;

/**
 * Reproduz PCM s16 estéreo recebido da captura nativa por aplicativo (IPC do Electron).
 * Mensagens: {rate, pcm: ArrayBuffer(Int16 intercalado)}. Faz resample linear e controla a latência.
 */
export const PCM_PLAYER_WORKLET_SOURCE = `
class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.srcRate = 48000;
    this.capacity = 48000 * 2;
    this.left = new Float32Array(this.capacity);
    this.right = new Float32Array(this.capacity);
    this.readPos = 0;
    this.writePos = 0;
    this.count = 0;
    this.frac = 0;
    this.primed = false;
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (typeof d.rate === 'number' && d.rate > 0) this.srcRate = d.rate;
      if (d.pcm) this.push(new Int16Array(d.pcm));
    };
  }

  push(samples) {
    const frames = samples.length >> 1;
    for (let i = 0; i < frames; i++) {
      if (this.count >= this.capacity) {
        this.readPos = (this.readPos + 1) % this.capacity;
        this.count--;
      }
      this.left[this.writePos] = samples[2 * i] / 32768;
      this.right[this.writePos] = samples[2 * i + 1] / 32768;
      this.writePos = (this.writePos + 1) % this.capacity;
      this.count++;
    }
    // Latência alta demais (acúmulo): descarta o excedente mantendo ~100 ms.
    const maxBuffered = Math.round(this.srcRate * 0.25);
    if (this.count > maxBuffered) {
      const keep = Math.round(this.srcRate * 0.1);
      const drop = this.count - keep;
      this.readPos = (this.readPos + drop) % this.capacity;
      this.count = keep;
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const outL = out[0];
    const outR = out[1] || out[0];
    const step = this.srcRate / sampleRate;
    const prime = Math.round(this.srcRate * 0.06);

    for (let i = 0; i < outL.length; i++) {
      if (!this.primed) {
        if (this.count >= prime) this.primed = true;
      }
      if (!this.primed || this.count < 2) {
        this.primed = this.primed && this.count >= 2;
        outL[i] = 0;
        outR[i] = 0;
        continue;
      }
      const a = this.readPos;
      const b = (this.readPos + 1) % this.capacity;
      outL[i] = this.left[a] + (this.left[b] - this.left[a]) * this.frac;
      outR[i] = this.right[a] + (this.right[b] - this.right[a]) * this.frac;
      this.frac += step;
      while (this.frac >= 1 && this.count > 1) {
        this.frac -= 1;
        this.readPos = (this.readPos + 1) % this.capacity;
        this.count--;
      }
    }
    return true;
  }
}
registerProcessor('razzacord-pcm-player', PcmPlayer);
`;

const loaded = new WeakMap<BaseAudioContext, Set<string>>();

export async function loadWorklet(ctx: AudioContext, name: string, source: string): Promise<void> {
  let set = loaded.get(ctx);
  if (!set) {
    set = new Set();
    loaded.set(ctx, set);
  }
  if (set.has(name)) return;
  const url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
  try {
    await ctx.audioWorklet.addModule(url);
    set.add(name);
  } finally {
    URL.revokeObjectURL(url);
  }
}
