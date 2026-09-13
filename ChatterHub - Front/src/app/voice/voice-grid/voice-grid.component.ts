import { Component, computed, ElementRef, viewChild, effect } from "@angular/core";
import { CommonModule } from "@angular/common";
import { UserCardComponent } from "../user-card/user-card.component";
import { VoiceService } from "../../services/voice.service";
import { User } from "../../models/user.model";

@Component({
  selector: "app-voice-grid",
  standalone: true,
  imports: [CommonModule, UserCardComponent],
  templateUrl: "./voice-grid.component.html",
})
export class VoiceGridComponent {
  readonly screenVideoRef = viewChild<ElementRef<HTMLVideoElement>>("screenVideo");

  constructor(readonly voiceService: VoiceService) {
    effect(() => {
      const videoRef = this.screenVideoRef();
      const stream = this.voiceService.activeScreenStream();

      if (videoRef?.nativeElement) {
        const videoEl = videoRef.nativeElement;
        if (videoEl.srcObject !== stream) {
          videoEl.srcObject = stream;
        }

        if (stream) {
          // Mutamos o vídeo local para evitar eco/feedback para quem está transmitindo
          // Espectadores remotos mantêm áudio para ouvir o som da tela/aba transmitida
          const isLocal = this.voiceService.isLocalSharing();
          videoEl.muted = isLocal;

          videoEl.play().catch((err) => {
            console.warn("[VoiceGrid] Autoplay com som falhou, iniciando mutado:", err);
            videoEl.muted = true;
            videoEl.play().catch((e) => {
              console.error("[VoiceGrid] Erro ao reproduzir vídeo:", e);
            });
          });
        }
      }
    });
  }

  readonly featuredUser = computed<User | undefined>(() => {
    const sharingId = this.voiceService.sharingUserId();
    if (!sharingId) return undefined;
    return this.voiceService.participants().find((u) => u.id === sharingId);
  });

  readonly otherParticipants = computed<User[]>(() => {
    const featured = this.featuredUser();
    if (!featured) return this.voiceService.participants();
    return this.voiceService.participants().filter((u) => u.id !== featured.id);
  });
}