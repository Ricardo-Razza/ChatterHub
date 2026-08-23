import { Component, OnInit, OnDestroy } from "@angular/core";
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
  constructor(
    readonly channelService: ChannelService,
    readonly userService: UserService,
    readonly voiceService: VoiceService
  ) {}

  ngOnInit(): void {
    // Ao entrar na sala de voz, solicita permissão e inicia a captura de áudio real
    this.voiceService.startMedia();
  }

  ngOnDestroy(): void {
    // Ao sair da sala de voz, desliga o microfone e encerra o fluxo
    this.voiceService.stopMedia();
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
    this.channelService.leaveVoiceChannel();
  }
}