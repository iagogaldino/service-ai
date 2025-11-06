/**
 * Recurso de Threads (Conversas)
 * 
 * Gerencia criação e gerenciamento de threads/conversas
 * 
 * Nota: StackSpot não tem threads nativas, então simulamos isso
 * mantendo o histórico de mensagens no lado do cliente.
 */

import { StackSpotClient } from '../client';
import {
  Thread,
  CreateThreadParams,
  Message,
  CreateMessageParams,
  CreateRunParams,
  Run,
} from '../types';
import { Messages } from './messages';
import { Runs } from './runs';

export class Threads {
  public messages: Messages;
  public runs: Runs;

  // Armazena threads em memória (em produção, use um banco de dados)
  private threads: Map<string, Thread> = new Map();
  private threadMessages: Map<string, Message[]> = new Map();

  constructor(private client: StackSpotClient) {
    this.messages = new Messages(client, this);
    this.runs = new Runs(client, this);
  }

  /**
   * Cria uma nova thread
   */
  async create(params?: CreateThreadParams): Promise<Thread> {
    const threadId = `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const thread: Thread = {
      id: threadId,
      object: 'thread',
      created_at: Math.floor(Date.now() / 1000),
      metadata: params?.metadata,
    };

    this.threads.set(threadId, thread);
    this.threadMessages.set(threadId, []);

    // Se houver mensagens iniciais, adiciona elas
    if (params?.messages && params.messages.length > 0) {
      for (const msgParams of params.messages) {
        await this.messages.create(threadId, msgParams);
      }
    }

    return thread;
  }

  /**
   * Obtém uma thread específica
   */
  async retrieve(threadId: string): Promise<Thread> {
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} não encontrada`);
    }
    return thread;
  }

  /**
   * Atualiza uma thread
   */
  async update(threadId: string, metadata?: Record<string, any>): Promise<Thread> {
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} não encontrada`);
    }

    thread.metadata = { ...thread.metadata, ...metadata };
    this.threads.set(threadId, thread);

    return thread;
  }

  /**
   * Deleta uma thread
   */
  async del(threadId: string): Promise<{ id: string; object: string; deleted: boolean }> {
    this.threads.delete(threadId);
    this.threadMessages.delete(threadId);

    return {
      id: threadId,
      object: 'thread.deleted',
      deleted: true,
    };
  }

  /**
   * Obtém mensagens de uma thread (método interno)
   */
  getThreadMessages(threadId: string): Message[] {
    return this.threadMessages.get(threadId) || [];
  }

  /**
   * Adiciona mensagem a uma thread (método interno)
   */
  addThreadMessage(threadId: string, message: Message): void {
    const messages = this.threadMessages.get(threadId) || [];
    messages.push(message);
    this.threadMessages.set(threadId, messages);
  }
}
