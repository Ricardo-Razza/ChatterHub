import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../services/auth.service';
import { ChatService } from '../../services/chat.service';
import { PermissionService } from '../../services/permission.service';
import { RoleService } from '../../services/role.service';
import { PERM } from '../../models/role.model';

@Component({
  selector: 'app-message',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './message.component.html',
})
export class MessageComponent {
  @Input({ required: true }) id!: string;
  @Input({ required: true }) avatarUrl!: string;
  @Input({ required: true }) authorId!: string;
  @Input({ required: true }) authorName!: string;
  @Input({ required: true }) createdAt!: Date;
  @Input({ required: true }) content!: string;
  @Input() grouped = false;
  @Input() edited = false;
  @Input() deleted = false;
  @Input() attachmentUrl?: string;
  @Input() attachmentType?: 'image' | 'file';
  @Input() attachmentName?: string;
  @Output() editRequested = new EventEmitter<{ id: string; content: string }>();

  showActions = false;
  confirmingDelete = false;

  constructor(
    readonly authService: AuthService,
    private readonly chatService: ChatService,
    private readonly perm: PermissionService,
    private readonly roleService: RoleService
  ) {}

  get isOwn(): boolean {
    return this.authService.currentUser().id === this.authorId;
  }

  get canDelete(): boolean {
    return this.isOwn || this.perm.can(PERM.MANAGE_MESSAGES);
  }

  get authorColor(): string | null {
    return this.roleService.colorFor(this.authorId);
  }

  get formattedTime(): string {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
      this.createdAt
    );
  }

  get formattedDate(): string {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(this.createdAt);
  }

  startEdit(): void {
    if (!this.deleted) {
      this.editRequested.emit({ id: this.id, content: this.content });
    }
  }

  requestDelete(): void {
    this.confirmingDelete = true;
  }

  confirmDelete(): void {
    this.chatService.deleteMessage(this.id);
    this.confirmingDelete = false;
  }

  cancelDelete(): void {
    this.confirmingDelete = false;
  }
}
