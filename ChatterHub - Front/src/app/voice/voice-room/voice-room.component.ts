import { Component, OnInit, OnDestroy, HostListener, effect } from "@angular/core";
import { CommonModule } from "@angular/common";
import { LucideAngularModule } from "lucide-angular";
import { ChannelService } from "../../services/channel.service";
import { UserService } from "../../services/user.service";
import { VoiceService } from "../../services/voice.service";
import { VoiceGridComponent } from "../voice-grid/voice-grid.component";

@Component({
  selector: "app-voice-room",
  standalone: true,
  imports: [CommonModule, LucideAngularModule, VoiceGridComponent],
  templateUrl: "./voice-room.component.html",
})
export class VoiceRoomComponent implements OnInit, OnDestroy {
  private currentActiveChannelId: string | null = null;

  constructor(
    readonly channelService: ChannelService,
    readonly userService: UserService,
    readonly voiceService: VoiceService
  ) {
    // Reage dinamicamente a mudanças de canal de voz sem depender de recriação do componente
    effect(() => {
      const activeId = this.channelService.activeChannelId();
      const mode = this.channelService.mainAreaMode();

      if (mode === "voice" && activeId) {
        if (this.currentActiveChannelId !== activeId) {
          if (this.currentActiveChannelId) {
            console.log(`[VoiceRoom] Mudando do canal ${this.currentActiveChannelId} para ${activeId}`);
            this.voiceService.stopMedia();
          }
          this.currentActiveChannelId = activeId;
          this.voiceService.startMedia();
        }
      } else {
        if (this.currentActiveChannelId) {
          this.voiceService.stopMedia();
          this.currentActiveChannelId = null;
        }
      }
    }, { allowSignalWrites: true });
  }

  @HostListener("window:beforeunload")
  onBeforeUnload(): void {
    this.voiceService.stopMedia();
  }

  ngOnInit(): void {
    // A inicialização é tratada de forma reativa pelo effect
  }

  ngOnDestroy(): void {
    this.voiceService.stopMedia();
    this.currentActiveChannelId = null;
  }

  toggleScreenShare(): void {
    this.voiceService.toggleScreenShare();
  }

  toggleMute(): void {
    this.userService.toggleMute();
  }

  toggleCamera(): void {
    this.userService.toggleCamera();
  }

  leaveCall(): void {
    this.voiceService.stopMedia();
    this.currentActiveChannelId = null;
    this.channelService.leaveVoiceChannel();
  }
}