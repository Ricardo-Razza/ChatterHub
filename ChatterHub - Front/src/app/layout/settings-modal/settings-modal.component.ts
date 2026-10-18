import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { VoiceService } from '../../services/voice.service';
import { UserRole } from '../../models/user.model';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './settings-modal.component.html',
})
export class SettingsModalComponent {
  readonly visible = signal(false);
  activeTab: 'account' | 'security' | 'voice' | 'admin' = 'account';

  editModalVisible = false;
  editTarget: 'username' | 'password' = 'username';
  savingProfile = false;
  profileError = '';

  editForm = {
    username: '',
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  };

  constructor(
    readonly authService: AuthService,
    readonly userService: UserService,
    readonly voiceService: VoiceService,
    private readonly toast: ToastService
  ) {}

  open(): void {
    this.activeTab = 'account';
    this.visible.set(true);
    this.voiceService.loadAudioDevices();
  }

  close(): void {
    this.visible.set(false);
    this.editModalVisible = false;
  }

  onBackdropClick(): void {
    this.close();
  }

  getTabTitle(): string {
    switch (this.activeTab) {
      case 'account': return 'Minha Conta';
      case 'security': return 'Senha e Segurança';
      case 'voice': return 'Voz e Vídeo';
      case 'admin': return 'Painel de Administração';
      default: return 'Configurações';
    }
  }

  openEditModal(target: 'username' | 'password'): void {
    const cur = this.authService.currentUser();
    this.editTarget = target;
    this.editForm = {
      username: cur.username || '',
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    };
    this.profileError = '';
    this.editModalVisible = true;
  }

  async saveProfile(): Promise<void> {
    this.savingProfile = true;
    this.profileError = '';

    try {
      if (this.editTarget === 'password') {
        if (!this.editForm.currentPassword) {
          this.profileError = 'Digite sua senha atual.';
          this.savingProfile = false;
          return;
        }
        if (!this.editForm.newPassword || this.editForm.newPassword.length < 8) {
          this.profileError = 'A nova senha deve ter pelo menos 8 caracteres.';
          this.savingProfile = false;
          return;
        }
        if (this.editForm.newPassword !== this.editForm.confirmNewPassword) {
          this.profileError = 'As senhas não coincidem.';
          this.savingProfile = false;
          return;
        }
        await this.userService.updateProfile({
          currentPassword: this.editForm.currentPassword,
          newPassword: this.editForm.newPassword,
        });
      } else {
        if (!this.editForm.username.trim() || this.editForm.username.trim().length < 3) {
          this.profileError = 'O nome de usuário deve ter pelo menos 3 caracteres.';
          this.savingProfile = false;
          return;
        }
        await this.userService.updateProfile({ username: this.editForm.username.trim() });
      }
      this.editModalVisible = false;
      this.toast.success('Perfil atualizado com sucesso!');
    } catch (e: any) {
      this.profileError = e?.toString() || 'Erro ao atualizar dados';
    } finally {
      this.savingProfile = false;
    }
  }

  onMicrophoneChange(event: any): void {
    this.voiceService.setMicrophoneDevice(event.target.value);
  }

  onOutputDeviceChange(event: any): void {
    this.voiceService.setAudioOutputDevice(event.target.value);
  }

  toggleNoiseSuppression(event: any): void {
    this.voiceService.setNoiseSuppression(event.target.checked);
  }

  onPttToggle(event: any): void {
    this.voiceService.setPushToTalk(event.target.checked);
  }

  capturingPtt = false;

  capturePttKey(): void {
    this.capturingPtt = true;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') {
        this.voiceService.setPushToTalkKey(e.code);
      }
      this.capturingPtt = false;
      window.removeEventListener('keydown', handler, true);
    };
    window.addEventListener('keydown', handler, true);
  }

  onScreenQuality(event: any): void {
    this.voiceService.setScreenQuality(event.target.value);
  }

  onScreenContent(event: any): void {
    this.voiceService.setScreenContent(event.target.value);
  }

  onSensitivityChange(event: any): void {
    this.voiceService.setInputSensitivity(Number(event.target.value));
  }

  changeRole(userId: string, role: UserRole): void {
    this.userService.updateUserRole(userId, role);
  }

  deleteUser(userId: string): void {
    if (confirm('Tem certeza que deseja remover este usuário?')) {
      this.userService.deleteUser(userId);
    }
  }

  logout(): void {
    this.authService.logout();
  }
}