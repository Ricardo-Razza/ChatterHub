import { Component, Input, ElementRef, effect, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { User } from '../../models/user.model';
import { VoiceService } from '../../services/voice.service';
import { PermissionService } from '../../services/permission.service';
import { RoleService } from '../../services/role.service';
import { ChannelService } from '../../services/channel.service';
import { WebSocketService } from '../../services/websocket.service';
import { PERM } from '../../models/role.model';

@Component({
  selector: 'app-user-card',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './user-card.component.html',
  host: {
    class: 'flex items-center justify-center w-full h-full min-h-0 min-w-0',
  },
})
export class UserCardComponent {
  @Input({ required: true }) user!: User;
  /** Card em destaque (usado no layout de compartilhamento de tela) */
  @Input() featured = false;

  readonly cameraVideo = viewChild<ElementRef<HTMLVideoElement>>('cameraVideo');

  constructor(
    readonly voiceService: VoiceService,
    private readonly perm: PermissionService,
    private readonly roleService: RoleService,
    private readonly channelService: ChannelService,
    private readonly ws: WebSocketService
  ) {
    // viewChild como signal: o efeito roda de novo quando o <video> passa a existir (câmera ligada depois do card).
    effect(() => {
      const ref = this.cameraVideo();
      if (!this.user?.id || !ref) return;
      const stream = this.voiceService.getUserVideoStream(this.user.id);
      const el = ref.nativeElement;
      if (el.srcObject !== stream) {
        el.srcObject = stream;
        if (stream) {
          el.play().catch(() => {});
        }
      }
    });
  }

  private topOf(userId: string): number {
    const member = this.roleService.members().find((m) => m.id === userId);
    if (!member) return 0;
    return this.roleService.roles()
      .filter((r) => member.roleIds.includes(r.id))
      .reduce((max, r) => Math.max(max, r.position), 0);
  }

  /** Moderar: tem MUTE_MEMBERS, alvo não é o dono nem eu, e (se não sou dono) está abaixo de mim na hierarquia. */
  canModerate(): boolean {
    if (!this.perm.can(PERM.MUTE_MEMBERS)) return false;
    if (this.user.id === this.voiceService.currentUserId()) return false;
    const member = this.roleService.members().find((m) => m.id === this.user.id);
    if (member?.owner) return false;
    return this.perm.isOwner() || this.topOf(this.user.id) < this.perm.topPosition();
  }

  moderate(action: 'mute' | 'disconnect'): void {
    const channelId = this.channelService.voiceChannelId();
    if (!channelId) return;
    this.ws.send('/app/voice.moderate', { channelId, targetId: this.user.id, action });
  }

  stats() {
    return this.voiceService.peerStats()[this.user.id];
  }

  qualityTitle(): string {
    const st = this.stats();
    if (!st) return '';
    const parts = [st.rttMs !== null ? `${st.rttMs} ms` : 'sem medição'];
    if (st.lossPct !== null) parts.push(`${st.lossPct}% de perda`);
    if (st.relayed) parts.push('via servidor TURN');
    return parts.join(' · ');
  }

  onVolume(value: string): void {
    this.voiceService.setUserVolume(this.user.id, Number(value));
  }
}
