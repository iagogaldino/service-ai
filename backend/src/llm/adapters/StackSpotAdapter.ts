/**
 * Adaptador para StackSpot SDK
 */

import { Socket } from 'socket.io';
import { AgentConfig } from '../../agents/config';
import { LLMAdapter, LLMThread, LLMMessage, LLMRun, TokenUsage } from './LLMAdapter';
import { executeTool } from '../../agents/agentManager';
import { emitToMonitors } from '../../services/monitoringService';
import StackSpotSDK from 'stackspotdelsuc-sdk';

// Importação do StackSpot SDK via pacote npm
const StackSpotClass: any = (StackSpotSDK as any)?.default ?? StackSpotSDK;

if (!StackSpotClass) {
  throw new Error(
    'StackSpot SDK não encontrado. Certifique-se de que o pacote stackspotdelsuc-sdk está instalado nas dependências.'
  );
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
    try {
      console.log(`🔵 [StackSpot] Criando run para thread ${threadId} com assistant ${assistantId}...`);
      const run = await this.stackspot.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
        stream: false,
      });
      console.log(`✅ [StackSpot] Run criado: ${run.id} (Status: ${run.status})`);

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
    } catch (error: any) {
      console.error(`❌ [StackSpot] Erro ao criar run:`, error);
      console.error(`   ThreadId: ${threadId}`);
      console.error(`   AssistantId: ${assistantId}`);
      console.error(`   Erro: ${error.message || JSON.stringify(error)}`);
      // Captura erros HTTP 403 ao criar run
      if (error?.message?.includes('403') || error?.status === 403 || error?.message?.includes('Forbidden')) {
        const errorMsg = error?.message || 'HTTP 403: Forbidden';
        console.error(`❌ Erro 403 ao criar run com agente "${assistantId}": ${errorMsg}`);
        console.error(`💡 Possíveis causas:`);
        console.error(`   1. O agente "${assistantId}" não existe no StackSpot`);
        console.error(`   2. As credenciais não têm permissão para acessar este agente`);
        console.error(`   3. O stackspotAgentId não está configurado corretamente no agents.json`);
        console.error(`   4. Verifique se o agente foi criado no painel do StackSpot`);
        throw new Error(`HTTP 403: Acesso negado ao agente "${assistantId}". Verifique se o agente existe no StackSpot e se o stackspotAgentId está configurado corretamente. Detalhes: ${errorMsg}`);
      }
      // Re-lança outros erros
      throw error;
    }
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
      let run;
      try {
        run = await this.stackspot.beta.threads.runs.retrieve(threadId, runId);
      } catch (error: any) {
        // Captura erros HTTP 403 (Forbidden)
        if (error?.message?.includes('403') || error?.status === 403 || error?.message?.includes('Forbidden')) {
          const errorMsg = error?.message || 'HTTP 403: Forbidden';
          console.error(`❌ Erro 403 ao acessar run: ${errorMsg}`);
          console.error(`📋 Possíveis causas:`);
          console.error(`   1. O agente não existe no StackSpot`);
          console.error(`   2. As credenciais não têm permissão para acessar este agente`);
          console.error(`   3. O stackspotAgentId não está configurado corretamente no agents.json`);
          console.error(`   4. O realm pode estar incorreto`);
          throw new Error(`HTTP 403: Acesso negado. Verifique se o agente existe no StackSpot e se as credenciais têm permissão. Detalhes: ${errorMsg}`);
        }
        // Re-lança outros erros
        throw error;
      }

      if (socket) {
        try {
          await fetchAndEmitNewAssistantMessages();
        } catch (error: any) {
          // Loga mas não interrompe o loop se houver erro ao buscar mensagens
          if (error?.message?.includes('403') || error?.status === 403) {
            console.warn(`⚠️ Erro 403 ao buscar mensagens (continuando...):`, error.message);
          }
        }
      }

      if (run.status === 'completed') {
        let latestMessages: any[] | null = null;
        if (socket) {
          try {
            latestMessages = await fetchAndEmitNewAssistantMessages();
          } catch (error: any) {
            console.warn(`⚠️ Erro ao buscar mensagens finais:`, error.message);
          }
        }
        
        let messagesData;
        try {
          messagesData = latestMessages
            ? [...latestMessages].reverse()
            : (await this.stackspot.beta.threads.messages.list(threadId, {
                order: 'asc',
              })).data;
        } catch (error: any) {
          if (error?.message?.includes('403') || error?.status === 403) {
            throw new Error(`HTTP 403: Acesso negado ao listar mensagens. Verifique as credenciais e permissões do StackSpot.`);
          }
          throw error;
        }
        
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
        const errorCode = run.last_error?.code || '';
        
        // Melhora mensagem de erro para 403
        if (errorMsg.includes('403') || errorMsg.includes('Forbidden') || errorCode === '403') {
          console.error(`❌ Run falhou com erro 403: ${errorMsg}`);
          console.error(`📋 Detalhes do erro:`, run.last_error);
          console.error(`💡 Solução:`);
          console.error(`   1. Verifique se o agente existe no StackSpot`);
          console.error(`   2. Configure o stackspotAgentId correto no agents.json`);
          console.error(`   3. Verifique se as credenciais têm permissão para acessar este agente`);
          throw new Error(`HTTP 403: Acesso negado ao agente. Verifique se o agente existe no StackSpot e se o stackspotAgentId está configurado corretamente. Detalhes: ${errorMsg}`);
        }
        
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
