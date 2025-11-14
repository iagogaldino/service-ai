import { Injectable, NgZone, computed, effect, inject, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { ChatMessage, ConnectionStatus } from './chat.types';

type RawMessage = {
  role: 'user' | 'assistant';
  content: string;
  agentName?: string;
  llmProvider?: string;
};

type ChatResponse = {
  message: string;
  agentName?: string;
  llmProvider?: string;
};

type AgentActionPayload = {
  action: string;
  success?: boolean;
  result?: string;
};

type AgentSelectionPayload = {
  agentName: string;
  description?: string;
  llmProvider?: string;
};

type ApiNotificationPayload = {
  message: string;
  details?: string;
  action?: string;
  errorMessage?: string;
};

const THREAD_STORAGE_KEY = 'delsucia_threadId';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly zone = inject(NgZone);
  private readonly socket: Socket;

  private readonly messagesSignal = signal<ChatMessage[]>([]);
  private readonly statusSignal = signal<ConnectionStatus>('connecting');
  private readonly sendingSignal = signal<boolean>(false);

  readonly messages = computed(() => this.messagesSignal());
  readonly status = computed(() => this.statusSignal());
  readonly isSending = computed(() => this.sendingSignal());

  constructor() {
    this.socket = io(this.getSocketUrl(), {
      transports: ['websocket'],
      autoConnect: false,
    });

    this.setupSocketListeners();
    this.socket.connect();

    effect(() => {
      if (this.statusSignal() === 'connected') {
        this.restoreThread();
      }
    });
  }

  sendMessage(raw: string): void {
    const content = raw.trim();
    if (!content) {
      return;
    }

    this.appendMessage({
      id: this.generateId(),
      role: 'user',
      sender: 'Você',
      content,
      timestamp: new Date(),
    });

    this.sendingSignal.set(true);
    this.socket.emit('message', { message: content });
  }

  clearConversation(): void {
    this.socket.emit('clear_conversation');
  }

  private setupSocketListeners(): void {
    this.socket.on('connect', () => {
      this.updateInZone(() => this.statusSignal.set('connected'));
    });

    this.socket.on('disconnect', () => {
      this.updateInZone(() => {
        this.statusSignal.set('disconnected');
        this.sendingSignal.set(false);
      });
    });

    this.socket.on('response', (data: ChatResponse) => {
      this.updateInZone(() => {
        this.sendingSignal.set(false);
        const senderLabel = this.resolveAgentLabel(data.agentName, data.llmProvider);
        this.appendMessage({
          id: this.generateId(),
          role: 'assistant',
          sender: senderLabel,
          content: data.message,
          timestamp: new Date(),
        });
      });
    });

    this.socket.on('error', (data: { message: string }) => {
      this.updateInZone(() => {
        this.sendingSignal.set(false);
        this.appendSystemMessage(`❌ ${data.message}`);
      });
    });

    this.socket.on('agent_action', (data: AgentActionPayload) => {
      this.updateInZone(() => {
        this.appendMessage({
          id: this.generateId(),
          role: 'action',
          sender: 'Ação do Agente',
          content: data.action,
          timestamp: new Date(),
        });
      });
    });

    this.socket.on('agent_action_complete', (data: AgentActionPayload) => {
      this.updateInZone(() => {
        const statusLabel = data.success ? '✅ concluída' : '⚠️ falhou';
        const resultText = data.result ? `\n${data.result}` : '';
        this.appendMessage({
          id: this.generateId(),
          role: 'action',
          sender: 'Ação concluída',
          content: `${statusLabel}${resultText}`,
          timestamp: new Date(),
        });
      });
    });

    this.socket.on('agent_selected', (data: AgentSelectionPayload) => {
      this.updateInZone(() => {
        const description = data.description ? ` — ${data.description}` : '';
        const provider = data.llmProvider ? ` [${data.llmProvider.toUpperCase()}]` : '';
        this.appendMessage({
          id: this.generateId(),
          role: 'system',
          sender: 'Agente selecionado',
          content: `${data.agentName}${provider}${description}`,
          timestamp: new Date(),
        });
      });
    });

    this.socket.on('config_required', (data: ApiNotificationPayload) => {
      this.updateInZone(() => {
        this.sendingSignal.set(false);
        this.appendSystemMessage(
          `⚠️ ${data.message}\n${data.details ?? ''}\n${data.action ?? ''}`.trim(),
        );
      });
    });

    this.socket.on('config_saved', (data: ApiNotificationPayload) => {
      this.updateInZone(() => {
        this.appendSystemMessage(`✅ ${data.message}\n${data.details ?? ''}`.trim());
      });
    });

    this.socket.on('api_key_invalid', (data: ApiNotificationPayload) => {
      this.updateInZone(() => {
        this.sendingSignal.set(false);
        const details = [data.details, data.action, data.errorMessage].filter(Boolean).join('\n');
        this.appendSystemMessage(`⚠️ ${data.message}\n${details}`.trim());
      });
    });

    this.socket.on('conversation_cleared', (data: { newThreadId?: string; message?: string }) => {
      this.updateInZone(() => {
        if (data.newThreadId) {
          localStorage.setItem(THREAD_STORAGE_KEY, data.newThreadId);
        } else {
          localStorage.removeItem(THREAD_STORAGE_KEY);
        }
        this.messagesSignal.set([]);
        if (data.message) {
          this.appendSystemMessage(`ℹ️ ${data.message}`);
        }
      });
    });

    this.socket.on('thread_created', (data: { threadId?: string }) => {
      this.updateInZone(() => {
        if (data.threadId) {
          localStorage.setItem(THREAD_STORAGE_KEY, data.threadId);
        }
      });
    });

    this.socket.on('thread_restored', (data: { threadId?: string }) => {
      this.updateInZone(() => {
        if (data.threadId) {
          localStorage.setItem(THREAD_STORAGE_KEY, data.threadId);
        }
      });
    });

    this.socket.on('load_conversation', (data: { messages?: RawMessage[]; llmProvider?: string }) => {
      this.updateInZone(() => {
        if (!data?.messages?.length) {
          return;
        }
        const restored = data.messages.map<ChatMessage>((message) => {
          const sender =
            message.role === 'assistant'
              ? this.resolveAgentLabel(message.agentName, message.llmProvider ?? data.llmProvider)
              : 'Você';
          return {
            id: this.generateId(),
            role: message.role === 'user' ? 'user' : 'assistant',
            sender,
            content: message.content,
            timestamp: new Date(),
          };
        });
        this.messagesSignal.set(restored);
      });
    });
  }

  private restoreThread(): void {
    const storedThread = localStorage.getItem(THREAD_STORAGE_KEY);
    if (storedThread) {
      this.socket.emit('restore_thread', { threadId: storedThread });
    }
  }

  private appendSystemMessage(content: string): void {
    this.appendMessage({
      id: this.generateId(),
      role: 'system',
      sender: 'Sistema',
      content,
      timestamp: new Date(),
    });
  }

  private appendMessage(message: ChatMessage): void {
    this.messagesSignal.update((previous) => [...previous, message]);
  }

  private updateInZone(fn: () => void): void {
    this.zone.run(fn);
  }

  private resolveAgentLabel(agentName?: string, llmProvider?: string): string {
    const base = agentName ? `IA (${agentName})` : 'IA';
    if (!llmProvider) {
      return base;
    }
    return `${base} [${llmProvider.toUpperCase()}]`;
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 11);
  }

  private getSocketUrl(): string {
    const { location } = window;
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    if (isLocalhost) {
      return 'http://localhost:3000';
    }

    return `${location.protocol}//${location.hostname}${location.port ? `:${location.port}` : ''}`;
  }

  registerEvent<T = any>(event: string, handler: (payload: T) => void): () => void {
    const wrapped = (...args: any[]) => {
      this.zone.run(() => {
        handler(args.length > 1 ? (args as unknown as T) : (args[0] as T));
      });
    };
    this.socket.on(event, wrapped);
    return () => {
      this.socket.off(event, wrapped);
    };
  }

  emit(event: string, payload?: any): void {
    this.socket.emit(event, payload);
  }

  get socketId(): string | undefined {
    return this.socket.id;
  }
}

