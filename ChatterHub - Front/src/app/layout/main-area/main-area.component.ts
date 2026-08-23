import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { LucideAngularModule } from "lucide-angular";
import { TextChatComponent } from "../../chat/text-chat/text-chat.component";
import { VoiceRoomComponent } from "../../voice/voice-room/voice-room.component";
import { ServerService } from "../../services/server.service";
import { ChannelService } from "../../services/channel.service";

@Component({
  selector: "app-main-area",
  standalone: true,
  imports: [CommonModule, LucideAngularModule, TextChatComponent, VoiceRoomComponent],
  templateUrl: "./main-area.component.html",
})
export class MainAreaComponent {
  constructor(
    readonly serverService: ServerService,
    readonly channelService: ChannelService
  ) {}
}