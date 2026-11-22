import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ChannelService } from '../../services/channel.service';
import { ToastService } from '../../services/toast.service';
import { ServerService } from '../../services/server.service';
import { Channel, ChannelType } from '../../models/channel.model';

@Component({
  selector: 'app-create-channel-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './create-channel-modal.component.html',
})
export class CreateChannelModalComponent {
  readonly visible = signal(false);
  readonly saving = signal(false);
  name = '';
  topic = '';
  category = '';
  channelType: ChannelType = 'text';
  editing?: Channel;
  private serverId = '';

  constructor(
    private readonly channelService: ChannelService,
    private readonly serverService: ServerService,
    private readonly toast: ToastService
  ) {}

  open(defaultType: ChannelType = 'text', channel?: Channel): void {
    this.serverId = channel?.serverId ?? this.serverService.activeServerId();
    this.editing = channel;
    this.name = channel?.name ?? '';
    this.topic = channel?.topic ?? '';
    this.category = channel?.category ?? '';
    this.channelType = channel?.type ?? defaultType;
    this.visible.set(true);
  }

  close(): void {
    if (!this.saving()) this.visible.set(false);
  }

  onBackdropClick(event: MouseEvent): void {
    this.close();
  }

  async submit(): Promise<void> {
    if (!this.serverId || !this.name.trim() || this.saving()) return;
    this.saving.set(true);
    try {
      await this.channelService.saveChannel(this.serverId, {
        name: this.name.trim(),
        type: this.channelType,
        topic: this.topic,
        category: this.category,
      }, this.editing?.id);
      this.visible.set(false);
    } catch (error: any) {
      this.toast.error(error?.error?.message || 'Erro ao salvar canal');
    } finally {
      this.saving.set(false);
    }
  }
}