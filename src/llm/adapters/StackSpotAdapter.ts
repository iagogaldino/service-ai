/**
 * Adaptador para StackSpot SDK
 */

import { Socket } from 'socket.io';
import { AgentConfig } from '../../agents/config';
import { LLMAdapter, LLMThread, LLMMessage, LLMRun, TokenUsage } from './LLMAdapter';
import { executeTool } from '../../agents/agentManager';
import { emitToMonitors } from '../../services/monitoringService';
import path from 'path';
import { fileURLToPath } from 'url';

// Importação dinâmica do StackSpot SDK
// O SDK está na raiz do projeto: sdk-stackspot/
// __dirname aqui é: src/llm/adapters, então precisamos subir 3 níveis
let StackSpotClass: any;
try {
  // Caminho correto: de src/llm/adapters para raiz do projeto (3 níveis acima)
  const projectRoot = path.resolve(__dirname, '../../../');
  const sdkPath = path.join(projectRoot, 'sdk-stackspot', 'src', 'index');
  StackSpotClass = require(sdkPath).default;
  console.log(`✅ StackSpot SDK carregado de: ${sdkPath}`);
} catch (error: any) {
  console.error('❌ Erro ao carregar StackSpot SDK:', error.message);
  console.error('📁 Tentou carregar de:', path.resolve(__dirname, '../../../sdk-stackspot/src/index'));
  throw new Error('StackSpot SDK não encontrado. Certifique-se de que o SDK está na raiz do projeto em sdk-stackspot/');
}

export interface StackSpotConfig {
  clientId: string;
  clientSecret: string;
  realm?: string;
}

export class StackSpotAdapter implements LLMAdapter {
  readonly provider = 'stackspot';
  private stackspot: any;
  private agentCache: Map<string, string> = new Map();

  constructor(config: StackSpotConfig) {
    if (!config.clientId || !config.clientSecret) {
      throw new Error('StackSpot clientId e clientSecret são obrigatórios');
    }
    
    // Cria tool executor que conecta ao executeTool do servidor
    const toolExecutor = async (functionName: string, args: Record<string, any>): Promise<string> => {
      return await executeTool(functionName, args);
    };
    
    this.stackspot = new StackSpotClass({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      realm: config.realm || 'stackspot-freemium',
      toolExecutor: toolExecutor, // Passa o executor para o SDK
      enableFunctionCalling: true, // Habilita function calling automático
    });
  }

  isConfigured(): boolean {
    return !!this.stackspot;
  }

  async getOrCreateAgent(config: AgentConfig): Promise<string> {
    // StackSpot não permite criar agentes via API
    // O agente deve ser criado no painel e o ID deve estar na configuração
    const agentId = (config as any).stackspotAgentId || config.name;
    
    if (!(config as any).stackspotAgentId) {
      console.warn(`⚠️ Agente "${config.name}" não tem stackspotAgentId configurado. Usando nome como ID: "${agentId}"`);
      console.warn(`⚠️ Para usar o StackSpot corretamente, adicione "stackspotAgentId": "SEU_ID_AQUI" no agents.json para o agente "${config.name}"`);
    } else {
      console.log(`✅ Usando StackSpot Agent ID: ${agentId} para agente "${config.name}"`);
    }
    
    if (!this.agentCache.has(config.name)) {
      this.agentCache.set(config.name, agentId);
    }
    
    return agentId;
  }

  async createThread(metadata?: Record<string, any>): Promise<LLMThread> {
    const thread = await this.stackspot.beta.threads.create({ metadata });
    return {
      id: thread.id,
      created_at: thread.created_at,
      metadata: thread.metadata,
    };
  }

  async retrieveThread(threadId: string): Promise<LLMThread> {
    const thread = await this.stackspot.beta.threads.retrieve(threadId);
    return {
      id: thread.id,
      created_at: thread.created_at,
      metadata: thread.metadata,
    };
  }

  async addMessage(
    threadId: string,
    role: 'user' | 'assistant' | 'system',
    content: string
  ): Promise<LLMMessage> {
    // Verifica se há runs ativos antes de adicionar mensagem
    try {
      const activeRuns = await this.listRuns(threadId, 10);
      const runningRuns = activeRuns.filter(
        run => run.status === 'queued' || run.status === 'in_progress' || run.status === 'requires_action'
      );

      // Cancela runs ativos para permitir adicionar nova mensagem
      if (runningRuns.length > 0) {
        console.log(`⚠️ Encontrado(s) ${runningRuns.length} run(s) ativo(s) na thread ${threadId}. Cancelando...`);
        for (const run of runningRuns) {
          try {
            await this.cancelRun(threadId, run.id);
            console.log(`✅ Run ${run.id} cancelado`);
          } catch (error: any) {
            console.warn(`⚠️ Erro ao cancelar run ${run.id}:`, error.message);
          }
        }
        // Aguarda um pouco para garantir que o cancelamento foi processado
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error: any) {
      // Se não conseguir listar runs (pode não estar implementado no StackSpot), continua
      console.warn(`⚠️ Não foi possível verificar runs ativos: ${error.message}`);
    }

    const message = await this.stackspot.beta.threads.messages.create(threadId, {
      role,
      content,
    });

    return {
      id: message.id,
      role: message.role,
      content: message.content[0].text.value,
      created_at: message.created_at,
    };
  }

  async listMessages(threadId: string, limit: number = 20): Promise<LLMMessage[]> {
    const messages = await this.stackspot.beta.threads.messages.list(threadId, { limit });
    return messages.data.map((msg: any) => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content[0]?.text?.value || '',
      created_at: msg.created_at,
    }));
  }

  async createRun(threadId: string, assistantId: string, socket?: Socket): Promise<LLMRun> {
    const run = await this.stackspot.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
      stream: false,
    });

    return {
      id: run.id,
      thread_id: run.thread_id,
      assistant_id: run.assistant_id,
      status: run.status,
      created_at: run.created_at,
      started_at: run.started_at,
      completed_at: run.completed_at,
      failed_at: run.failed_at,
      last_error: run.last_error,
    };
  }

  async retrieveRun(threadId: string, runId: string): Promise<LLMRun> {
    const run = await this.stackspot.beta.threads.runs.retrieve(threadId, runId);
    return {
      id: run.id,
      thread_id: run.thread_id,
      assistant_id: run.assistant_id,
      status: run.status,
      created_at: run.created_at,
      started_at: run.started_at,
      completed_at: run.completed_at,
      failed_at: run.failed_at,
      last_error: run.last_error,
    };
  }

  async waitForRunCompletion(
    threadId: string,
    runId: string,
    socket?: Socket
  ): Promise<{ message: string; tokenUsage: TokenUsage }> {
    let iterationCount = 0;
    const MAX_ITERATIONS = 60; // Aumentado para 60 para dar tempo ao follow-up run
    const seenAssistantMessageIds = new Set<string>();

    const emitAssistantMessage = (message: {
      type: 'assistant';
      message: string;
      messageId: string;
      details: { threadId: string; role: string; createdAt?: number };
    }) => {
      if (!socket) return;
      socket.emit('agent_message', message);
      emitToMonitors(socket.id, 'agent_message', message);
    };

    const fetchAndEmitNewAssistantMessages = async (): Promise<any[] | null> => {
      if (!socket) {
        return null;
      }

      const messages = await this.stackspot.beta.threads.messages.list(threadId, {
        order: 'desc',
      });

      for (const msg of [...messages.data].reverse()) {
        if (msg.role !== 'assistant') {
          continue;
        }
        if (seenAssistantMessageIds.has(msg.id)) {
          continue;
        }

        const textValue = msg.content?.[0]?.text?.value;
        if (!textValue) {
          continue;
        }

        seenAssistantMessageIds.add(msg.id);
        emitAssistantMessage({
          type: 'assistant',
          message: textValue,
          messageId: msg.id,
          details: {
            threadId,
            role: 'assistant',
            createdAt: msg.created_at,
          },
        });
      }

      return messages.data;
    };

    if (socket) {
      const existingMessages = await this.stackspot.beta.threads.messages.list(threadId, {
        order: 'desc',
      });
      existingMessages.data.forEach((msg: any) => {
        if (msg.role === 'assistant') {
          seenAssistantMessageIds.add(msg.id);
        }
      });
    }

    while (iterationCount < MAX_ITERATIONS) {
      iterationCount++;
      const run = await this.stackspot.beta.threads.runs.retrieve(threadId, runId);

      if (socket) {
        await fetchAndEmitNewAssistantMessages();
      }

      if (run.status === 'completed') {
        let latestMessages: any[] | null = null;
        if (socket) {
          latestMessages = await fetchAndEmitNewAssistantMessages();
        }
        const messagesData =
          latestMessages
            ? [...latestMessages].reverse()
            : (await this.stackspot.beta.threads.messages.list(threadId, {
                order: 'asc',
              })).data;
        const lastMessage = messagesData[messagesData.length - 1];
        
        // Extrai tokens do metadata se disponível
        const tokens = (lastMessage.metadata as any)?.tokens || {};
        const tokenUsage: TokenUsage = {
          promptTokens: tokens.input || 0,
          completionTokens: tokens.output || 0,
          totalTokens: (tokens.input || 0) + (tokens.output || 0),
        };

        return {
          message: lastMessage.content[0].text.value,
          tokenUsage,
        };
      }

      if (run.status === 'failed') {
        const errorMsg = run.last_error?.message || 'Run falhou';
        console.error(`❌ Run falhou: ${errorMsg}`);
        console.error(`📋 Detalhes do erro:`, run.last_error);
        throw new Error(errorMsg);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Run não completou após ${MAX_ITERATIONS} iterações`);
  }

  async submitToolOutputs(
    threadId: string,
    runId: string,
    toolOutputs: Array<{ tool_call_id: string; output: string }>
  ): Promise<LLMRun> {
    await this.stackspot.beta.threads.runs.submitToolOutputs(threadId, runId, {
      tool_outputs: toolOutputs,
    });
    return this.retrieveRun(threadId, runId);
  }

  async listRuns(threadId: string, limit: number = 10): Promise<LLMRun[]> {
    try {
      // StackSpot pode ter API diferente, tenta usar a mesma interface
      const runs = await this.stackspot.beta.threads.runs.list(threadId, { limit });
      return runs.data.map((run: any) => ({
        id: run.id,
        thread_id: run.thread_id,
        assistant_id: run.assistant_id,
        status: run.status as any,
        created_at: run.created_at,
        started_at: run.started_at || undefined,
        completed_at: run.completed_at || undefined,
        failed_at: run.failed_at || undefined,
        last_error: run.last_error
          ? {
              code: run.last_error.code || 'unknown',
              message: run.last_error.message || 'Unknown error',
            }
          : undefined,
      }));
    } catch (error: any) {
      // Se não estiver implementado, retorna array vazio
      console.warn(`⚠️ listRuns não implementado no StackSpot: ${error.message}`);
      return [];
    }
  }

  async cancelRun(threadId: string, runId: string): Promise<LLMRun> {
    try {
      const run = await this.stackspot.beta.threads.runs.cancel(threadId, runId);
      return {
        id: run.id,
        thread_id: run.thread_id,
        assistant_id: run.assistant_id,
        status: run.status as any,
        created_at: run.created_at,
        started_at: run.started_at || undefined,
        completed_at: run.completed_at || undefined,
        failed_at: run.failed_at || undefined,
        last_error: run.last_error
          ? {
              code: run.last_error.code || 'unknown',
              message: run.last_error.message || 'Unknown error',
            }
          : undefined,
      };
    } catch (error: any) {
      // Se não estiver implementado, retorna o run atual
      console.warn(`⚠️ cancelRun não implementado no StackSpot: ${error.message}`);
      return this.retrieveRun(threadId, runId);
    }
  }
}
