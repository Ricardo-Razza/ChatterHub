import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ChannelService } from '../../services/channel.service';
import { ChannelType } from '../../models/channel.model';

@Component({
  selector: 'app-create-channel-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './create-channel-modal.component.html',
})
export class CreateChannelModalComponent {
  readonly visible = signal(false);
  name = '';
  channelType: ChannelType = 'text';

  constructor(private readonly channelService: ChannelService) {}

  open(defaultType: ChannelType = 'text'): void {
    this.name = '';
    this.channelType = defaultType;
    this.visible.set(true);
  }

  close(): void {
    this.visible.set(false);
  }

  onBackdropClick(event: MouseEvent): void {
    this.close();
  }

  submit(): void {
    if (!this.name.trim()) return;
    this.channelService.createChannel(this.name.trim(), this.channelType);
    this.close();
  }
}