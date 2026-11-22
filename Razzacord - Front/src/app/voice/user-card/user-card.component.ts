import { Component, Input, ElementRef, effect, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { User } from '../../models/user.model';
import { VoiceService } from '../../services/voice.service';

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

  constructor(readonly voiceService: VoiceService) {
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
