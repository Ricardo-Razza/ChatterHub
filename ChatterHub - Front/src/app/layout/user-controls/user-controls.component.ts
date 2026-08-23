import { Component, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { LucideAngularModule } from "lucide-angular";
import { UserService } from "../../services/user.service";
import { SettingsModalComponent } from "../settings-modal/settings-modal.component";

@Component({
  selector: "app-user-controls",
  standalone: true,
  imports: [CommonModule, LucideAngularModule, SettingsModalComponent],
  templateUrl: "./user-controls.component.html",
})
export class UserControlsComponent {
  @ViewChild(SettingsModalComponent) settingsModal!: SettingsModalComponent;

  constructor(readonly userService: UserService) {}

  toggleMute(): void {
    this.userService.toggleMute();
  }

  toggleDeafen(): void {
    this.userService.toggleDeafen();
  }

  openSettings(): void {
    this.settingsModal.open();
  }
}