/**
 * Adaptador para OpenAI SDK
 */

import OpenAI from 'openai';
import { Socket } from 'socket.io';
import { AgentConfig } from '../../agents/config';
import { LLMAdapter, LLMThread, LLMMessage, LLMRun, TokenUsage } from './LLMAdapter';
import { executeTool } from '../../agents/agentManager';

export class OpenAIAdapter implements LLMAdapter {
  readonly provider = 'openai';
  private openai: OpenAI;
  private agentCache: Map<string, string> = new Map();

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('OpenAI API key é obrigatória');
    }
    this.openai = new OpenAI({ apiKey });
  }

  isConfigured(): boolean {
    return !!this.openai;
  }

  async getOrCreateAgent(config: AgentConfig): Promise<string> {
    // Verifica cache
    if (this.agentCache.has(config.name)) {
      const cachedId = this.agentCache.get(config.name)!;
      try {
        await this.openai.beta.assistants.update(cachedId, {
          tools: config.tools,
          instructions: config.instructions,
        });
        return cachedId;
      } catch (error) {
        this.agentCache.delete(config.name);
      }
    }

    // Busca na API
    try {
      const assistants = await this.openai.beta.assistants.list({ limit: 20 });
      const existing = assistants.data.find((a) => a.name === config.name);

      if (existing) {
        await this.openai.beta.assistants.update(existing.id, {
          tools: config.tools,
          instructions: config.instructions,
        });
        this.agentCache.set(config.name, existing.id);
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

    this.agentCache.set(config.name, assistant.id);
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
    // Verifica se há runs ativos antes de adicionar mensagem
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
    const run = await this.openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });

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

    while (iterationCount < MAX_ITERATIONS) {
      iterationCount++;
      const run = await this.openai.beta.threads.runs.retrieve(threadId, runId);

      if (run.usage) {
        totalPromptTokens += run.usage.prompt_tokens || 0;
        totalCompletionTokens += run.usage.completion_tokens || 0;
        totalTokens += run.usage.total_tokens || 0;
      }

      if (run.status === 'completed') {
        // A API da OpenAI retorna mensagens em ordem decrescente (mais recentes primeiro)
        // Quando um run completa, a mensagem do assistente é adicionada à thread
        // Então a primeira mensagem do assistente na lista é a resposta mais recente
        const messages = await this.openai.beta.threads.messages.list(threadId, { limit: 20 });
        
        // Procura a primeira mensagem do assistente (role === 'assistant') na lista
        // Como a lista está em ordem decrescente, a primeira mensagem do assistente é a mais recente
        const assistantMessage = messages.data.find(msg => msg.role === 'assistant');
        
        if (assistantMessage) {
          // Procura conteúdo de texto na mensagem
          const textContent = assistantMessage.content.find((c: any) => c.type === 'text');
          if (textContent && 'text' in textContent) {
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
        const firstMessage = messages.data[0];
        if (firstMessage) {
          const textContent = firstMessage.content.find((c: any) => c.type === 'text');
          if (textContent && 'text' in textContent) {
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
        const toolOutputs = await Promise.all(
          toolCalls.map(async (toolCall) => {
            if (toolCall.type !== 'function') return null;
            const functionName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);
            const result = await executeTool(functionName, args, socket);
            return {
              tool_call_id: toolCall.id,
              output: result,
            };
          })
        );

        const validOutputs = toolOutputs.filter((o): o is NonNullable<typeof o> => o !== null);
        await this.openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
          tool_outputs: validOutputs,
        });
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
