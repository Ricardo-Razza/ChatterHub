import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AudioDeviceService {
  readonly inputDevices = signal<MediaDeviceInfo[]>([]);
  readonly outputDevices = signal<MediaDeviceInfo[]>([]);
  readonly selectedMicrophoneId = signal<string>(localStorage.getItem('ch_mic_id') || '');
  readonly selectedAudioOutputId = signal<string>(localStorage.getItem('ch_output_id') || '');
  readonly noiseSuppressionEnabled = signal<boolean>(localStorage.getItem('ch_noise_suppression') !== 'false');
  readonly inputSensitivity = signal<number>(Number(localStorage.getItem('ch_input_sensitivity')) || 15);
  readonly screenShareVolume = signal<number>(Number(localStorage.getItem('ch_screen_volume')) || 100);
  readonly antiEchoEnabled = signal<boolean>(localStorage.getItem('ch_anti_echo') !== 'false');

  constructor() {
    this.loadAudioDevices();
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', () => {
        this.loadAudioDevices();
      });
    }
  }

  async loadAudioDevices(): Promise<void> {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === 'audioinput');
      const outputs = devices.filter((d) => d.kind === 'audiooutput');

      this.inputDevices.set(inputs);
      this.outputDevices.set(outputs);

      if (inputs.length > 0 && !inputs.some((d) => d.deviceId === this.selectedMicrophoneId())) {
        this.selectedMicrophoneId.set(inputs[0].deviceId);
      }
    } catch (err) {
      console.warn('[AudioDeviceService] Falha ao enumerar dispositivos:', err);
    }
  }

  setMicrophoneDevice(deviceId: string): void {
    this.selectedMicrophoneId.set(deviceId);
    localStorage.setItem('ch_mic_id', deviceId);
  }

  setAudioOutputDevice(deviceId: string): void {
    this.selectedAudioOutputId.set(deviceId);
    localStorage.setItem('ch_output_id', deviceId);
  }

  setNoiseSuppression(enabled: boolean): void {
    this.noiseSuppressionEnabled.set(enabled);
    localStorage.setItem('ch_noise_suppression', String(enabled));
  }

  setInputSensitivity(threshold: number): void {
    this.inputSensitivity.set(threshold);
    localStorage.setItem('ch_input_sensitivity', String(threshold));
  }

  setScreenShareVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(100, volume));
    this.screenShareVolume.set(clamped);
    localStorage.setItem('ch_screen_volume', String(clamped));
  }

  setAntiEcho(enabled: boolean): void {
    this.antiEchoEnabled.set(enabled);
    localStorage.setItem('ch_anti_echo', String(enabled));
  }
}
