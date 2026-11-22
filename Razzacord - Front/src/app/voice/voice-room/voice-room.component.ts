import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { LucideAngularModule } from "lucide-angular";
import { ChannelService } from "../../services/channel.service";
import { UserService } from "../../services/user.service";
import { VoiceService } from "../../services/voice.service";
import { VoiceGridComponent } from "../voice-grid/voice-grid.component";
import { PermissionService } from "../../services/permission.service";
import { PERM } from "../../models/role.model";
import { ScreenPickerComponent } from "../screen-picker/screen-picker.component";

/**
 * Apenas a vista da chamada. Quem entra e sai da sala é o VoiceService (acompanha o canal de voz escolhido),
 * então navegar para um canal de texto não derruba a chamada.
 */
@Component({
  selector: "app-voice-room",
  standalone: true,
  imports: [CommonModule, LucideAngularModule, VoiceGridComponent, ScreenPickerComponent],
  templateUrl: "./voice-room.component.html",
})
export class VoiceRoomComponent {
  constructor(
    readonly channelService: ChannelService,
    readonly userService: UserService,
    readonly voiceService: VoiceService,
    readonly perm: PermissionService
  ) {}

  readonly PERM = PERM;

  toggleScreenShare(): void {
    void this.voiceService.toggleScreenShare();
  }

  toggleMute(): void {
    this.userService.toggleMute();
  }

  toggleDeafen(): void {
    this.userService.toggleDeafen();
  }

  toggleCamera(): void {
    this.userService.toggleCamera();
  }

  leaveCall(): void {
    this.channelService.leaveVoiceChannel();
  }
}
