import { Component, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { LucideAngularModule } from "lucide-angular";
import { UserService } from "../../services/user.service";
import { VoiceService } from "../../services/voice.service";
import { PresenceStatus, UserRole } from "../../models/user.model";

@Component({
  selector: "app-settings-modal",
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: "./settings-modal.component.html",
})
export class SettingsModalComponent {
  readonly visible = signal(false);
  activeTab: "account" | "security" | "voice" | "admin" = "account";

  showEmail = false;
  showPhone = false;
  editModalVisible = false;
  editTarget: "all" | "username" | "email" | "phone" | "birthDate" | "password" = "all";
  savingProfile = false;
  profileError = "";

  editForm = {
    username: "",
    email: "",
    phone: "",
    birthDate: "",
    currentPassword: "",
    newPassword: "",
  };

  constructor(
    readonly userService: UserService,
    readonly voiceService: VoiceService
  ) {}

  open(): void {
    this.activeTab = "account";
    this.visible.set(true);
  }

  close(): void {
    this.visible.set(false);
    this.editModalVisible = false;
  }

  onBackdropClick(event: MouseEvent): void {
    this.close();
  }

  getTabTitle(): string {
    switch (this.activeTab) {
      case "account": return "Minha Conta";
      case "security": return "Senha e Segurança";
      case "voice": return "Voz e Vídeo";
      case "admin": return "Painel de Administração";
      default: return "Configurações";
    }
  }

  maskEmail(email?: string): string {
    if (!email) return "************@outlook.com";
    const parts = email.split("@");
    if (parts.length < 2) return email;
    const name = parts[0];
    const maskedName = name.length > 2 ? name[0] + "*".repeat(name.length - 2) + name[name.length - 1] : "*".repeat(name.length);
    return maskedName + "@" + parts[1];
  }

  maskPhone(phone?: string): string {
    if (!phone) return "*********0269";
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 4) return "*********";
    return "*".repeat(clean.length - 4) + clean.slice(-4);
  }

  openEditModal(target: "all" | "username" | "email" | "phone" | "birthDate" | "password"): void {
    const cur = this.userService.currentUser();
    this.editTarget = target;
    this.editForm = {
      username: cur.username || "",
      email: cur.email || "",
      phone: cur.phone || "",
      birthDate: cur.birthDate || "",
      currentPassword: "",
      newPassword: "",
    };
    this.profileError = "";
    this.editModalVisible = true;
  }

  async saveProfile(): Promise<void> {
    this.savingProfile = true;
    this.profileError = "";
    try {
      await this.userService.updateProfile({
        username: this.editForm.username || undefined,
        email: this.editForm.email || undefined,
        phone: this.editForm.phone || undefined,
        birthDate: this.editForm.birthDate || undefined,
        currentPassword: this.editForm.currentPassword || undefined,
        newPassword: this.editForm.newPassword || undefined,
      });
      this.editModalVisible = false;
    } catch (e: any) {
      this.profileError = e?.toString() || "Erro ao atualizar dados";
    } finally {
      this.savingProfile = false;
    }
  }

  toggleNoiseSuppression(event: any): void {
    const checked = event.target.checked;
    this.voiceService.setNoiseSuppression(checked);
  }

  onSensitivityChange(event: any): void {
    const val = Number(event.target.value);
    this.voiceService.setInputSensitivity(val);
  }

  changeRole(userId: string, role: UserRole): void {
    this.userService.updateUserRole(userId, role);
  }

  deleteUser(userId: string): void {
    if (confirm("Tem certeza que deseja remover este usuário?")) {
      this.userService.deleteUser(userId);
    }
  }

  logout(): void {
    this.userService.logout();
  }
}