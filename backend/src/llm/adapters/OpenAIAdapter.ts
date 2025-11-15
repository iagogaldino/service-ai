/**
 * Adaptador para OpenAI SDK
 */

import OpenAI from 'openai';
import { Socket } from 'socket.io';
import { AgentConfig } from '../../agents/config';
import { LLMAdapter, LLMThread, LLMMessage, LLMRun, TokenUsage } from './LLMAdapter';
import { executeTool } from '../../agents/agentManager';
import { emitToMonitors } from '../../services/monitoringService';
import { formatActionMessage } from '../../utils/functionDescriptions';

interface CachedAgent {
  id: string;
  instructions: string;
  tools: any[];
  model: string;
}

export class OpenAIAdapter implements LLMAdapter {
  readonly provider = 'openai';
  private openai: OpenAI;
  private agentCache: Map<string, CachedAgent> = new Map();

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('OpenAI API key é obrigatória');
    }
    this.openai = new OpenAI({ apiKey });
  }

  isConfigured(): boolean {
    return !!this.openai;
  }

  /**
   * Compara se duas configurações de tools são iguais
   */
  private toolsEqual(tools1: any[], tools2: any[]): boolean {
    if (tools1.length !== tools2.length) return false;
    const tools1Str = JSON.stringify(tools1.sort((a, b) => (a.type || '').localeCompare(b.type || '')));
    const tools2Str = JSON.stringify(tools2.sort((a, b) => (a.type || '').localeCompare(b.type || '')));
    return tools1Str === tools2Str;
  }

  async getOrCreateAgent(config: AgentConfig): Promise<string> {
    // Verifica cache
    if (this.agentCache.has(config.name)) {
      const cached = this.agentCache.get(config.name)!;
      
      // Compara instruções, tools e model antes de atualizar
      const instructionsChanged = cached.instructions !== config.instructions;
      const toolsChanged = !this.toolsEqual(cached.tools || [], config.tools || []);
      const modelChanged = cached.model !== config.model;
      
      // Só atualiza se algo realmente mudou
      if (instructionsChanged || toolsChanged || modelChanged) {
        try {
          await this.openai.beta.assistants.update(cached.id, {
            tools: config.tools,
            instructions: config.instructions,
            model: config.model,
          });
          // Atualiza cache com novos valores
          this.agentCache.set(config.name, {
            id: cached.id,
            instructions: config.instructions,
            tools: config.tools || [],
            model: config.model,
          });
          console.log(`🔄 Agente "${config.name}" atualizado (${instructionsChanged ? 'instruções' : ''} ${toolsChanged ? 'tools' : ''} ${modelChanged ? 'model' : ''} mudaram)`);
        } catch (error) {
          console.error(`❌ Erro ao atualizar agente "${config.name}":`, error);
          this.agentCache.delete(config.name);
        }
      } else {
        // Nada mudou, retorna do cache sem fazer chamada à API
        console.log(`✅ Agente "${config.name}" encontrado em cache (sem mudanças)`);
        return cached.id;
      }
      
      return cached.id;
    }

    // Busca na API
    try {
      const assistants = await this.openai.beta.assistants.list({ limit: 20 });
      const existing = assistants.data.find((a) => a.name === config.name);

      if (existing) {
        // Compara antes de atualizar (existing vem da API, pode ter formato diferente)
        const existingTools = (existing.tools || []).map((t: any) => ({
          type: t.type,
          function: t.function ? { name: t.function.name, description: t.function.description } : undefined
        }));
        const configTools = (config.tools || []).map((t: any) => ({
          type: t.type,
          function: t.function ? { name: t.function.name, description: t.function.description } : undefined
        }));
        
        const needsUpdate = 
          existing.instructions !== config.instructions ||
          !this.toolsEqual(existingTools, configTools) ||
          existing.model !== config.model;
        
        if (needsUpdate) {
          await this.openai.beta.assistants.update(existing.id, {
            tools: config.tools,
            instructions: config.instructions,
            model: config.model,
          });
          console.log(`🔄 Agente "${config.name}" atualizado na API`);
        } else {
          console.log(`✅ Agente "${config.name}" encontrado na API (sem mudanças necessárias)`);
        }
        
        this.agentCache.set(config.name, {
          id: existing.id,
          instructions: config.instructions,
          tools: config.tools || [],
          model: config.model,
        });
        return existing.id;
      }
    } catch (error) {
      console.error('Erro ao buscar agentes:', error);
    }

    // Cria novo
    const assistant = await this.openai.beta.assistants.create({
      name: config.name,
      instructions: config.instructions,
      model: config.model,
      tools: config.tools,
    });

    this.agentCache.set(config.name, {
      id: assistant.id,
      instructions: config.instructions,
      tools: config.tools || [],
      model: config.model,
    });
    console.log(`✅ Novo agente "${config.name}" criado (ID: ${assistant.id})`);
    return assistant.id;
  }

  async createThread(metadata?: Record<string, any>): Promise<LLMThread> {
    const thread = await this.openai.beta.threads.create({ metadata });
    return {
      id: thread.id,
      created_at: thread.created_at,
      metadata: thread.metadata as Record<string, any>,
    };
  }

  async retrieveThread(threadId: string): Promise<LLMThread> {
    const thread = await this.openai.beta.threads.retrieve(threadId);
    return {
      id: thread.id,
      created_at: thread.created_at,
      metadata: thread.metadata as Record<string, any>,
    };
  }

  async addMessage(
    threadId: string,
    role: 'user' | 'assistant' | 'system',
    content: string
  ): Promise<LLMMessage> {
    // Removida verificação de runs ativos - a API da OpenAI gerencia isso automaticamente
    // Isso elimina uma requisição HTTP desnecessária na maioria dos casos

    // OpenAI não aceita 'system' em mensagens de thread, apenas 'user' e 'assistant'
    const openaiRole = role === 'system' ? 'user' : role;
    const message = await this.openai.beta.threads.messages.create(threadId, {
      role: openaiRole,
      content,
    });

    const textContent = message.content.find((c: any) => c.type === 'text');
    return {
      id: message.id,
      role: message.role as 'user' | 'assistant',
      content: textContent ? (textContent as any).text.value : content,
      created_at: message.created_at,
    };
  }

  async listMessages(threadId: string, limit: number = 20): Promise<LLMMessage[]> {
    const messages = await this.openai.beta.threads.messages.list(threadId, { limit });
    return messages.data.map((msg) => {
      const textContent = msg.content.find((c: any) => c.type === 'text');
      return {
        id: msg.id,
        role: msg.role as 'user' | 'assistant' | 'system',
        content: textContent ? (textContent as any).text.value : '',
        created_at: msg.created_at,
      };
    });
  }

  async createRun(threadId: string, assistantId: string, socket?: Socket): Promise<LLMRun> {
    try {
      const startTime = Date.now();
      console.log(`🔵 [OpenAI] Criando run para thread ${threadId} com assistant ${assistantId}...`);
      
      // Log de tempo antes da chamada HTTP
      const beforeHttpTime = Date.now();
      const timeSinceStart = beforeHttpTime - startTime;
      if (timeSinceStart > 10) {
        console.warn(`⚠️ [OpenAI] Tempo antes da chamada HTTP: ${timeSinceStart}ms`);
      }
      
      // Faz a chamada HTTP para criar o run
      const httpStartTime = Date.now();
      const run = await this.openai.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
      });
      const httpDuration = Date.now() - httpStartTime;
      const totalDuration = Date.now() - startTime;
      
      console.log(`✅ [OpenAI] Run criado: ${run.id} (Status: ${run.status})`);
      console.log(`⏱️ [OpenAI] Tempos: HTTP: ${httpDuration}ms, Total: ${totalDuration}ms`);
      
      if (httpDuration > 2000) {
        console.warn(`⚠️ [OpenAI] Chamada HTTP levou ${httpDuration}ms (acima do esperado)`);
      }

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
      console.error(`❌ [OpenAI] Erro ao criar run:`, error);
      console.error(`   ThreadId: ${threadId}`);
      console.error(`   AssistantId: ${assistantId}`);
      console.error(`   Erro: ${error.message || JSON.stringify(error)}`);
      throw error;
    }
  }

  async retrieveRun(threadId: string, runId: string): Promise<LLMRun> {
    const run = await this.openai.beta.threads.runs.retrieve(threadId, runId);
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
  }

  async waitForRunCompletion(
    threadId: string,
    runId: string,
    socket?: Socket
  ): Promise<{ message: string; tokenUsage: TokenUsage }> {
    let iterationCount = 0;
    const MAX_ITERATIONS = 100;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;

    const seenAssistantMessageIds = new Set<string>();

    const emitEvent = (event: string, data: any) => {
      if (!socket) return;
      socket.emit(event, data);
      emitToMonitors(socket.id, event, data);
    };

    const emitAssistantMessage = (message: {
      type: 'assistant';
      message: string;
      messageId: string;
      details: { threadId: string; role: string; createdAt?: number };
    }) => {
      emitEvent('agent_message', message);
    };

    const fetchAndEmitNewAssistantMessages = async (): Promise<any[] | null> => {
      if (!socket) {
        return null;
      }

      const messages = await this.openai.beta.threads.messages.list(threadId, {
        order: 'desc',
        limit: 50,
      });

      for (const msg of [...messages.data].reverse()) {
        if (msg.role !== 'assistant') {
          continue;
        }
        if (seenAssistantMessageIds.has(msg.id)) {
          continue;
        }
        const textContent = msg.content.find((c: any) => c.type === 'text') as any;
        if (!textContent?.text?.value) {
          continue;
        }

        seenAssistantMessageIds.add(msg.id);
        emitAssistantMessage({
          type: 'assistant',
          message: textContent.text.value,
          messageId: msg.id,
          details: {
            threadId,
            role: 'assistant',
            createdAt: msg.created_at
          }
        });
      }

      return messages.data;
    };

    if (socket) {
      const existingMessages = await this.openai.beta.threads.messages.list(threadId, {
        order: 'desc',
        limit: 50
      });
      existingMessages.data.forEach((msg: any) => {
        if (msg.role === 'assistant') {
          seenAssistantMessageIds.add(msg.id);
        }
      });
    }

    // Polling adaptativo: começa rápido (200ms) e aumenta gradualmente até 1000ms
    const getPollingDelay = (iteration: number): number => {
      if (iteration <= 3) return 200; // Primeiras 3 iterações: 200ms
      if (iteration <= 10) return 300; // Próximas 7: 300ms
      if (iteration <= 20) return 500; // Próximas 10: 500ms
      return 1000; // Depois: 1000ms
    };

    while (iterationCount < MAX_ITERATIONS) {
      iterationCount++;
      const run = await this.openai.beta.threads.runs.retrieve(threadId, runId);

      if (run.usage) {
        totalPromptTokens += run.usage.prompt_tokens || 0;
        totalCompletionTokens += run.usage.completion_tokens || 0;
        totalTokens += run.usage.total_tokens || 0;
      }

      // Só busca mensagens se houver socket e não estiver em status terminal
      if (socket && run.status !== 'completed' && run.status !== 'failed' && run.status !== 'cancelled') {
        await fetchAndEmitNewAssistantMessages();
      }

      if (run.status === 'completed') {
        let latestMessages: any[] | null = null;
        if (socket) {
          latestMessages = await fetchAndEmitNewAssistantMessages();
        }
        // A API da OpenAI retorna mensagens em ordem decrescente (mais recentes primeiro)
        // Quando um run completa, a mensagem do assistente é adicionada à thread
        // Então a primeira mensagem do assistente na lista é a resposta mais recente
        const messages =
          latestMessages ??
          (await this.openai.beta.threads.messages.list(threadId, { limit: 20 })).data;
        
        // Procura a primeira mensagem do assistente (role === 'assistant') na lista
        // Como a lista está em ordem decrescente, a primeira mensagem do assistente é a mais recente
        const assistantMessage = messages.find((msg: any) => msg.role === 'assistant');
        
        if (assistantMessage) {
          // Procura conteúdo de texto na mensagem
          const textContent = assistantMessage.content.find((c: any) => c.type === 'text') as any;
          if (textContent?.text?.value) {
            return {
              message: textContent.text.value,
              tokenUsage: {
                promptTokens: totalPromptTokens,
                completionTokens: totalCompletionTokens,
                totalTokens: totalTokens,
              },
            };
          }
        }
        
        // Fallback: se não encontrou mensagem do assistente, tenta pegar a primeira mensagem
        const firstMessage = messages[0];
        if (firstMessage) {
          const textContent = firstMessage.content.find((c: any) => c.type === 'text') as any;
          if (textContent?.text?.value) {
            return {
              message: textContent.text.value,
              tokenUsage: {
                promptTokens: totalPromptTokens,
                completionTokens: totalCompletionTokens,
                totalTokens: totalTokens,
              },
            };
          }
        }
        
        return {
          message: 'Resposta não disponível.',
          tokenUsage: {
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            totalTokens: totalTokens,
          },
        };
      }

      if (run.status === 'failed') {
        throw new Error(run.last_error?.message || 'Run falhou');
      }

      if (run.status === 'requires_action') {
        const toolCalls = run.required_action?.submit_tool_outputs?.tool_calls || [];

        const toolCallsInfo = toolCalls
          .map((toolCall) => {
            if (toolCall.type !== 'function') return null;
            let parsedArgs: any = {};
            try {
              parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
            } catch (error) {
              parsedArgs = { raw: toolCall.function.arguments };
            }
            return {
              toolCallId: toolCall.id,
              functionName: toolCall.function.name,
              arguments: parsedArgs,
              rawArguments: toolCall.function.arguments,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        if (toolCallsInfo.length > 0) {
          emitEvent('agent_message', {
            type: 'function_calls',
            toolCalls: toolCallsInfo,
            details: {
              runId,
              toolCallsCount: toolCalls.length,
            },
          });
        }

        const toolOutputs = await Promise.all(
          toolCalls.map(async (toolCall) => {
            if (toolCall.type !== 'function') return null;

            const functionName = toolCall.function.name;
            let args: any = {};

            try {
              args = JSON.parse(toolCall.function.arguments || '{}');
            } catch (error) {
              args = { raw: toolCall.function.arguments };
            }

            const actionMessage = formatActionMessage(functionName, args);
            emitEvent('agent_action', {
              action: actionMessage,
              functionName,
              args,
            });

            const startTime = Date.now();
            const rawResult = await executeTool(functionName, args, socket);
            const result =
              typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2);
            const executionTime = Date.now() - startTime;
            const success = !result.startsWith('Erro:');

            emitEvent('agent_message', {
              type: 'function_result',
              functionName,
              arguments: args,
              result,
              executionTime,
              details: {
                toolCallId: toolCall.id,
                success,
              },
            });

            emitEvent('agent_action_complete', {
              action: actionMessage,
              success,
              result: result.substring(0, 500),
            });

            return {
              tool_call_id: toolCall.id,
              output: result,
            };
          })
        );

        const validOutputs = toolOutputs.filter((o): o is NonNullable<typeof o> => o !== null);

        emitEvent('agent_action', {
          action: '⚙️ Processando resultados...',
          functionName: 'processing',
        });

        emitEvent('agent_message', {
          type: 'function_outputs',
          outputs: validOutputs.map((output) => ({
            toolCallId: output.tool_call_id,
            output: output.output.substring(0, 1000) + (output.output.length > 1000 ? '...' : ''),
            outputLength: output.output.length,
          })),
          details: {
            runId,
            outputsCount: validOutputs.length,
          },
        });

        await this.openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
          tool_outputs: validOutputs,
        });
        // Após submit tool outputs, volta ao início do loop imediatamente
        continue;
      }

      // Polling adaptativo baseado no número de iterações
      const delay = getPollingDelay(iterationCount);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    throw new Error(`Run não completou após ${MAX_ITERATIONS} iterações`);
  }

  async submitToolOutputs(
    threadId: string,
    runId: string,
    toolOutputs: Array<{ tool_call_id: string; output: string }>
  ): Promise<LLMRun> {
    await this.openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
      tool_outputs: toolOutputs,
    });
    return this.retrieveRun(threadId, runId);
  }

  async listRuns(threadId: string, limit: number = 10): Promise<LLMRun[]> {
    const runs = await this.openai.beta.threads.runs.list(threadId, { limit });
    return runs.data.map((run) => ({
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
  }

  async cancelRun(threadId: string, runId: string): Promise<LLMRun> {
    const run = await this.openai.beta.threads.runs.cancel(threadId, runId);
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
  }
}
