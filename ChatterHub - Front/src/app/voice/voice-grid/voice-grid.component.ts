import { Component, computed, ElementRef, ViewChild, AfterViewChecked } from "@angular/core";
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
export class VoiceGridComponent implements AfterViewChecked {
  @ViewChild("screenVideo") screenVideoRef?: ElementRef<HTMLVideoElement>;
  private boundStream: MediaStream | null = null;

  constructor(readonly voiceService: VoiceService) {}

  ngAfterViewChecked(): void {
    const stream = this.voiceService.screenStream();
    if (this.screenVideoRef && stream && this.boundStream !== stream) {
      this.boundStream = stream;
      const videoElement = this.screenVideoRef.nativeElement;
      videoElement.srcObject = stream;
      videoElement.muted = true; // Necessário para permitir autoplay sem bloqueio do navegador
      videoElement.play().catch((err) => {
        console.warn("[VoiceGrid] Autoplay video error:", err);
      });
    }
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