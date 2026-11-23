import { Component, computed, effect, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { LucideAngularModule } from "lucide-angular";
import { VoiceService, ScreenQualityId, ScreenContent } from "../../services/voice.service";
import { ShareSource } from "../desktop-bridge";

/** Valor do seletor de áudio para "todo o áudio do PC, menos o Razzacord". */
const SYSTEM_AUDIO = "system";

/**
 * Seletor de tela/janela do app desktop. Escolhe também o áudio da transmissão:
 * - tela inteira: todo o áudio do PC, menos o Razzacord (as vozes da chamada não vão para a live);
 * - janela: só o áudio daquele aplicativo.
 */
@Component({
  selector: "app-screen-picker",
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: "./screen-picker.component.html",
})
export class ScreenPickerComponent {
  readonly tab = signal<"screen" | "window">("window");
  readonly selectedId = signal<string | null>(null);
  /** "" = sem áudio; "system" = áudio do PC sem a chamada; senão o PID escolhido */
  readonly audioPid = signal<string>("");
  readonly systemAudioValue = SYSTEM_AUDIO;
  private audioTouched = false;

  readonly visibleSources = computed<ShareSource[]>(() =>
    this.voiceService.pickerSources().filter((s) => s.isScreen === (this.tab() === "screen"))
  );

  readonly selected = computed<ShareSource | undefined>(() =>
    this.voiceService.pickerSources().find((s) => s.id === this.selectedId())
  );

  constructor(readonly voiceService: VoiceService) {
    // Cada abertura começa do zero.
    effect(() => {
      if (this.voiceService.pickerOpen()) {
        this.selectedId.set(null);
        this.audioPid.set("");
        this.audioTouched = false;
        const hasWindows = this.voiceService.pickerSources().some((s) => !s.isScreen);
        this.tab.set(hasWindows ? "window" : "screen");
      }
    }, { allowSignalWrites: true });
  }

  setTab(tab: "screen" | "window"): void {
    this.tab.set(tab);
    this.selectedId.set(null);
  }

  select(source: ShareSource): void {
    this.selectedId.set(source.id);
    // Como no Discord: tela inteira leva o áudio do PC (sem a chamada); janela leva o áudio do próprio aplicativo.
    if (!this.audioTouched) {
      if (source.isScreen) {
        this.audioPid.set(this.voiceService.supportsSystemAudio ? SYSTEM_AUDIO : "");
      } else {
        const owner = source.pid && this.voiceService.pickerApps().some((a) => a.pid === source.pid) ? String(source.pid) : "";
        this.audioPid.set(owner);
      }
    }
  }

  onAudioChange(value: string): void {
    this.audioTouched = true;
    this.audioPid.set(value);
  }

  confirm(): void {
    const source = this.selected();
    if (!source) return;
    const audio = this.audioPid();
    const systemAudio = audio === SYSTEM_AUDIO;
    this.voiceService.confirmPicker({
      sourceId: source.id,
      audioPid: audio && !systemAudio ? Number(audio) : null,
      systemAudio,
    });
  }

  cancel(): void {
    this.voiceService.cancelPicker();
  }

  onQuality(value: string): void {
    this.voiceService.setScreenQuality(value as ScreenQualityId);
  }

  onContent(value: string): void {
    this.voiceService.setScreenContent(value as ScreenContent);
  }
}
