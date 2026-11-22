import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ServerService } from '../../services/server.service';

@Component({
  selector: 'app-invite-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invite-modal.component.html',
})
export class InviteModalComponent {
  readonly visible = signal(false);
  readonly loading = signal(false);
  readonly link = signal('');
  readonly error = signal<string | null>(null);
  readonly copied = signal(false);
  readonly serverName = signal('');

  private serverId = '';
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly serverService: ServerService) {}

  open(serverId: string): void {
    this.serverId = serverId;
    this.serverName.set(this.serverService.activeServer()?.name ?? '');
    this.link.set('');
    this.error.set(null);
    this.copied.set(false);
    this.visible.set(true);
    this.generate();
  }

  close(): void {
    this.visible.set(false);
    this.copied.set(false);
    if (this.copiedTimer) {
      clearTimeout(this.copiedTimer);
      this.copiedTimer = null;
    }
  }

  onBackdropClick(event: MouseEvent): void {
    this.close();
  }

  async generate(): Promise<void> {
    if (!this.serverId) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const invite = await this.serverService.createInvite(this.serverId);
      this.link.set(this.serverService.inviteUrl(invite.code));
    } catch (e: unknown) {
      this.error.set(typeof e === 'string' ? e : (e as Error)?.message ?? 'Erro ao criar convite');
    } finally {
      this.loading.set(false);
    }
  }

  async copy(): Promise<void> {
    if (!this.link()) return;
    try {
      await navigator.clipboard.writeText(this.link());
      this.copied.set(true);
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => {
        this.copied.set(false);
        this.copiedTimer = null;
      }, 2000);
    } catch {
      this.error.set('Não foi possível copiar o link');
    }
  }
}
