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
          // O elemento <video> é mantido mutado pois todo áudio (microfone e som da tela)
          // é reproduzido com alta fidelidade e sem duplicidade pelo VoiceService (via WebRTC AudioElements).
          videoEl.muted = true;

          videoEl.play().catch((err) => {
            console.error("[VoiceGrid] Erro ao reproduzir vídeo:", err);
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