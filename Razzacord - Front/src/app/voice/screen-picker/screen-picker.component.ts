import { Component, computed, effect, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { LucideAngularModule } from "lucide-angular";
import { VoiceService, ScreenQualityId, ScreenContent } from "../../services/voice.service";
import { ShareSource } from "../desktop-bridge";

/**
 * Seletor de tela/janela do app desktop. Escolhe também de qual aplicativo sai o áudio da transmissão:
 * só esse processo é capturado, então Discord, a call e o resto do sistema não vão para a live.
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
  /** "" = sem áudio; senão o PID escolhido */
  readonly audioPid = signal<string>("");
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
    // Janela: sugere o áudio do próprio aplicativo. Tela inteira: sem áudio, a menos que o usuário escolha um app.
    if (!this.audioTouched) {
      const owner = source.pid && this.voiceService.pickerApps().some((a) => a.pid === source.pid) ? String(source.pid) : "";
      this.audioPid.set(owner);
    }
  }

  onAudioChange(value: string): void {
    this.audioTouched = true;
    this.audioPid.set(value);
  }

  confirm(): void {
    const source = this.selected();
    if (!source) return;
    this.voiceService.confirmPicker({
      sourceId: source.id,
      audioPid: this.audioPid() ? Number(this.audioPid()) : null,
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
