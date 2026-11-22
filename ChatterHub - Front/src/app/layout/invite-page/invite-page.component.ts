import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ServerService } from '../../services/server.service';

interface InvitePreview {
  serverId: string;
  serverName: string;
  iconUrl?: string;
  initials: string;
  memberCount: number;
}

@Component({
  selector: 'app-invite-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invite-page.component.html',
})
export class InvitePageComponent implements OnInit {
  readonly preview = signal<InvitePreview | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly accepting = signal(false);

  private code = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly serverService: ServerService
  ) {}

  async ngOnInit(): Promise<void> {
    this.code = this.route.snapshot.paramMap.get('code') ?? '';
    try {
      this.preview.set(await this.serverService.previewInvite(this.code));
    } catch {
      this.error.set('Este convite é inválido ou expirou.');
    } finally {
      this.loading.set(false);
    }
  }

  async accept(): Promise<void> {
    if (this.accepting()) return;
    this.accepting.set(true);
    try {
      await this.serverService.acceptInvite(this.code);
      this.router.navigate(['/']);
    } catch {
      this.error.set('Este convite é inválido ou expirou.');
      this.preview.set(null);
    } finally {
      this.accepting.set(false);
    }
  }

  back(): void {
    this.router.navigate(['/']);
  }
}
