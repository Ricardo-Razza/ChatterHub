import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild, ElementRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';

export interface SendMessagePayload {
  content: string;
  attachment?: {
    url: string;
    type: 'image' | 'file';
    name: string;
  };
}

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './chat-input.component.html',
})
export class ChatInputComponent implements OnChanges {
  @Input({ required: true }) channelName!: string;
  /** Quando preenchido, indica que está editando uma mensagem */
  @Input() editingContent: string | null = null;
  @Output() send = new EventEmitter<SendMessagePayload>();

  @ViewChild('inputEl') inputEl?: ElementRef<HTMLInputElement>;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  draft = '';
  attachment = signal<{ url: string; type: 'image' | 'file'; name: string } | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['editingContent'] && this.editingContent !== null) {
      this.draft = this.editingContent;
      setTimeout(() => this.inputEl?.nativeElement.focus(), 50);
    }
  }

  submit(): void {
    const text = this.draft.trim();
    const att = this.attachment();

    if (!text && !att) return;

    this.send.emit({
      content: text,
      attachment: att ?? undefined,
    });

    this.draft = '';
    this.attachment.set(null);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
    if (event.key === 'Escape') {
      this.draft = '';
      this.attachment.set(null);
    }
  }

  triggerFileInput(): void {
    this.fileInput?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const reader = new FileReader();

    reader.onload = () => {
      this.attachment.set({
        url: reader.result as string,
        type: isImage ? 'image' : 'file',
        name: file.name,
      });
      // reset file input
      target.value = '';
    };

    reader.readAsDataURL(file);
  }

  removeAttachment(): void {
    this.attachment.set(null);
  }
}
