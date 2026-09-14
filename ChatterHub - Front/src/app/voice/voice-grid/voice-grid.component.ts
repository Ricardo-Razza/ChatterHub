import { Component, computed, ElementRef, viewChild, effect } from "@angular/core";
import { CommonModule } from "@angular/common";
import { LucideAngularModule } from "lucide-angular";
import { UserCardComponent } from "../user-card/user-card.component";
import { VoiceService } from "../../services/voice.service";
import { User } from "../../models/user.model";

@Component({
  selector: "app-voice-grid",
  standalone: true,
  imports: [CommonModule, UserCardComponent, LucideAngularModule],
  templateUrl: "./voice-grid.component.html",
})
export class VoiceGridComponent {
  readonly screenVideoRef = viewChild<ElementRef<HTMLVideoElement>>("screenVideo");
  private previousScreenVolume = 100;

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
          // Mantido muted no elemento de vídeo pois o áudio do stream de tela
          // é reproduzido com volume ajustável via WebRTC pelo VoiceService
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

  onScreenVolumeChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const val = Number(target.value);
    this.voiceService.setScreenShareVolume(val);
  }

  toggleMuteScreen(): void {
    const current = this.voiceService.screenShareVolume();
    if (current > 0) {
      this.previousScreenVolume = current;
      this.voiceService.setScreenShareVolume(0);
    } else {
      this.voiceService.setScreenShareVolume(this.previousScreenVolume || 100);
    }
  }
}