import { Component, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { LucideAngularModule } from "lucide-angular";
import { TextChatComponent } from "../../chat/text-chat/text-chat.component";
import { VoiceRoomComponent } from "../../voice/voice-room/voice-room.component";
import { ServerService } from "../../services/server.service";
import { ChannelService } from "../../services/channel.service";
import { CreateServerModalComponent } from "../create-server-modal/create-server-modal.component";

@Component({
  selector: "app-main-area",
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    TextChatComponent,
    VoiceRoomComponent,
    CreateServerModalComponent,
  ],
  templateUrl: "./main-area.component.html",
  host: { class: 'block h-full' },
})
export class MainAreaComponent {
  @ViewChild(CreateServerModalComponent) createServerModal!: CreateServerModalComponent;

  constructor(
    readonly serverService: ServerService,
    readonly channelService: ChannelService
  ) {}

  openCreateServer(): void {
    this.createServerModal.open();
  }
}