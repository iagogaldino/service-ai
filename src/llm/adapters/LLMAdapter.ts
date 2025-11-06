/**
 * Interface base para adaptadores de LLM
 * 
 * Define o contrato que todos os adaptadores de LLM devem implementar
 * para permitir troca entre diferentes provedores (OpenAI, StackSpot, etc.)
 */

import { AgentConfig } from '../../agents/config';
import { Socket } from 'socket.io';

/**
 * Interface para uso de tokens
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Interface para mensagem
 */
export interface LLMMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: number;
}

/**
 * Interface para thread
 */
export interface LLMThread {
  id: string;
  created_at?: number;
  metadata?: Record<string, any>;
}

/**
 * Interface para run
 */
export interface LLMRun {
  id: string;
  thread_id: string;
  assistant_id: string;
  status: 'queued' | 'in_progress' | 'requires_action' | 'cancelling' | 'cancelled' | 'failed' | 'completed';
  created_at?: number;
  started_at?: number;
  completed_at?: number;
  failed_at?: number;
  last_error?: {
    code: string;
    message: string;
  };
}

/**
 * Interface base para adaptadores de LLM
 */
export interface LLMAdapter {
  /**
   * Nome do provedor (ex: 'openai', 'stackspot')
   */
  readonly provider: string;

  /**
   * Verifica se o adaptador está configurado corretamente
   */
  isConfigured(): boolean;

  /**
   * Cria ou obtém um agente (assistant)
   */
  getOrCreateAgent(config: AgentConfig): Promise<string>;

  /**
   * Cria uma nova thread
   */
  createThread(metadata?: Record<string, any>): Promise<LLMThread>;

  /**
   * Obtém uma thread existente
   */
  retrieveThread(threadId: string): Promise<LLMThread>;

  /**
   * Adiciona uma mensagem a uma thread
   */
  addMessage(threadId: string, role: 'user' | 'assistant' | 'system', content: string): Promise<LLMMessage>;

  /**
   * Lista mensagens de uma thread
   */
  listMessages(threadId: string, limit?: number): Promise<LLMMessage[]>;

  /**
   * Cria e executa um run
   */
  createRun(threadId: string, assistantId: string, socket?: Socket): Promise<LLMRun>;

  /**
   * Obtém o status de um run
   */
  retrieveRun(threadId: string, runId: string): Promise<LLMRun>;

  /**
   * Aguarda a conclusão de um run e retorna a resposta
   */
  waitForRunCompletion(
    threadId: string,
    runId: string,
    socket?: Socket
  ): Promise<{ message: string; tokenUsage: TokenUsage }>;

  /**
   * Submete outputs de tools durante um run
   */
  submitToolOutputs(
    threadId: string,
    runId: string,
    toolOutputs: Array<{ tool_call_id: string; output: string }>
  ): Promise<LLMRun>;

  /**
   * Lista runs de uma thread
   */
  listRuns(threadId: string, limit?: number): Promise<LLMRun[]>;

  /**
   * Cancela um run ativo
   */
  cancelRun(threadId: string, runId: string): Promise<LLMRun>;
}
