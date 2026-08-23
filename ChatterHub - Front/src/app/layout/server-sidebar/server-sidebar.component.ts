import { Component, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { LucideAngularModule } from "lucide-angular";
import { ServerIconComponent } from "../server-icon/server-icon.component";
import { ServerService } from "../../services/server.service";
import { UserService } from "../../services/user.service";
import { CreateServerModalComponent } from "../create-server-modal/create-server-modal.component";

@Component({
  selector: "app-server-sidebar",
  standalone: true,
  imports: [CommonModule, LucideAngularModule, ServerIconComponent, CreateServerModalComponent],
  templateUrl: "./server-sidebar.component.html",
})
export class ServerSidebarComponent {
  @ViewChild(CreateServerModalComponent) createServerModal!: CreateServerModalComponent;

  constructor(
    readonly serverService: ServerService,
    readonly userService: UserService
  ) {}

  canCreateServer(): boolean {
    const role = this.userService.currentUser().role;
    return role === "ADMIN" || role === "MODERATOR";
  }

  selectServer(serverId: string): void {
    this.serverService.setActiveServer(serverId);
  }

  addServer(): void {
    if (!this.canCreateServer()) {
      alert("Apenas administradores e moderadores podem criar servidores.");
      return;
    }
    this.createServerModal.open();
  }
}