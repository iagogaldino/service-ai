import { CommonModule, NgClass } from '@angular/common';
import { Component, ElementRef, ViewChild, computed, effect, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ChatService } from '../features/chat/chat.service';
import { ChatMessage } from '../features/chat/chat.types';

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [CommonModule, NgClass, ReactiveFormsModule],
  templateUrl: './chat-panel.component.html',
  styleUrl: './chat-panel.component.scss',
})
export class ChatPanelComponent {
  private readonly chat = inject(ChatService);
  @ViewChild('messagesList') private readonly messagesList?: ElementRef<HTMLDivElement>;

  protected readonly messages = this.chat.messages;
  protected readonly connectionStatus = this.chat.status;
  protected readonly isSending = this.chat.isSending;
  protected readonly isConnected = computed(() => this.connectionStatus() === 'connected');

  protected readonly messageControl = new FormControl('', { nonNullable: true });

  protected readonly statusLabel = computed(() => {
    const status = this.connectionStatus();
    switch (status) {
      case 'connected':
        return 'Conectado';
      case 'connecting':
        return 'Conectando...';
      default:
        return 'Desconectado';
    }
  });

  constructor() {
    effect(() => {
      this.messages();
      queueMicrotask(() => {
        const container = this.messagesList?.nativeElement;
        if (container) {
          container.scrollTo({ top: container.scrollHeight });
        }
      });
    });
  }

  protected sendMessage(): void {
    const value = this.messageControl.value.trim();
    if (!value || this.isSending() || !this.isConnected()) {
      return;
    }
    this.chat.sendMessage(value);
    this.messageControl.setValue('');
  }

  protected handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  protected clearConversation(): void {
    const shouldClear = window.confirm(
      'Tem certeza que deseja limpar a conversa? Esta ação não pode ser desfeita.',
    );
    if (shouldClear) {
      this.chat.clearConversation();
    }
  }

  protected trackByMessage(_index: number, message: ChatMessage): string {
    return message.id;
  }
}

