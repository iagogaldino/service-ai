/**
 * Recurso de Runs (Execuções)
 * 
 * Gerencia execuções de agentes em threads
 * 
 * Nota: StackSpot não tem runs nativos como OpenAI.
 * Simulamos isso fazendo chamadas de chat e gerenciando o estado.
 */

import { StackSpotClient } from '../client';
import { Threads } from './threads';
import {
  Run,
  CreateRunParams,
  ChatParams,
  ChatResponse,
  ToolCall,
  Message,
} from '../types';

export class Runs {
  private runs: Map<string, Run> = new Map();

  constructor(
    private client: StackSpotClient,
    private threads: Threads
  ) {}

  /**
   * Cria e executa um run
   */
  async create(threadId: string, params: CreateRunParams): Promise<Run> {
    // Verifica se a thread existe
    await this.threads.retrieve(threadId);

    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Obtém as mensagens da thread
    const messages = this.threads.getThreadMessages(threadId);
    const userMessages = messages.filter((m) => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];

    if (!lastUserMessage) {
      throw new Error('Thread não possui mensagens do usuário');
    }

    // Cria o run
    const run: Run = {
      id: runId,
      object: 'thread.run',
      created_at: Math.floor(Date.now() / 1000),
      thread_id: threadId,
      assistant_id: params.assistant_id,
      status: 'queued',
      model: params.model,
      instructions: params.instructions,
      tools: params.tools,
      metadata: params.metadata,
    };

    this.runs.set(runId, run);

    // Executa o run (não bloqueia)
    this.executeRun(runId, threadId, params, lastUserMessage.content[0].text.value).catch(
      (error) => {
        console.error(`Erro ao executar run ${runId}:`, error);
        const run = this.runs.get(runId);
        if (run) {
          run.status = 'failed';
          run.last_error = {
            code: 'execution_error',
            message: error.message,
          };
          run.failed_at = Math.floor(Date.now() / 1000);
          this.runs.set(runId, run);
        }
      }
    );

    return run;
  }

  /**
   * Executa um run (método privado)
   */
  private async executeRun(
    runId: string,
    threadId: string,
    params: CreateRunParams,
    userPrompt: string
  ): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;

    try {
      // Atualiza status para in_progress
      run.status = 'in_progress';
      run.started_at = Math.floor(Date.now() / 1000);
      this.runs.set(runId, run);

      // Prepara histórico de mensagens para contexto
      // Pega apenas as últimas mensagens para não exceder limite de tokens
      const messages = this.threads.getThreadMessages(threadId);
      const recentMessages = messages.slice(-10); // Últimas 10 mensagens
      
      const conversationHistory = recentMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => {
          const content = m.content[0];
          if (content.type === 'text') {
            return `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${content.text.value}`;
          }
          return '';
        })
        .join('\n');

      // Constrói o prompt com contexto
      // Se houver histórico, inclui apenas a última mensagem do usuário no prompt
      const fullPrompt = conversationHistory
        ? `${conversationHistory}\n\nUsuário: ${userPrompt}\nAssistente:`
        : userPrompt;

      // Faz chamada para StackSpot Chat API
      const chatParams: ChatParams = {
        user_prompt: fullPrompt,
        streaming: params.stream || false,
        stackspot_knowledge: false,
        return_ks_in_response: true,
      };

      // Log da requisição
      console.log(`📤 Enviando requisição para agente StackSpot: ${params.assistant_id}`);
      console.log(`📝 URL: /v1/agent/${params.assistant_id}/chat`);

      let response: ChatResponse;

      if (params.stream) {
        // Para streaming, processa a resposta de forma diferente
        // Nota: StackSpot pode retornar SSE, mas por simplicidade tratamos como JSON
        response = await this.client.post<ChatResponse>(
          `/v1/agent/${params.assistant_id}/chat`,
          chatParams,
          { stream: false } // Por enquanto, não suportamos streaming real
        );
      } else {
        try {
          response = await this.client.post<ChatResponse>(
            `/v1/agent/${params.assistant_id}/chat`,
            chatParams
          );
        } catch (error: any) {
          if (error.message?.includes('403') || error.message?.includes('Forbidden')) {
            console.error(`❌ Erro 403: Acesso negado ao agente "${params.assistant_id}"`);
            console.error(`💡 Possíveis causas:`);
            console.error(`   1. O ID do agente está incorreto: "${params.assistant_id}"`);
            console.error(`   2. O agente não existe no seu workspace do StackSpot`);
            console.error(`   3. As credenciais não têm permissão para acessar este agente`);
            console.error(`   4. O token de acesso expirou ou é inválido`);
            console.error(`💡 Solução: Verifique o ID do agente no painel do StackSpot e adicione "stackspotAgentId" no agents.json`);
          }
          throw error;
        }
      }

      // Log básico da resposta (opcional - pode ser removido em produção)
      // console.log(`📥 Resposta recebida (${response.tokens?.input || 0} input, ${response.tokens?.output || 0} output tokens)`);

      // Extrai a resposta - StackSpot retorna no campo 'message'
      let responseText = 'Sem resposta';
      if (response) {
        if (typeof response === 'string') {
          responseText = response;
        } else if (response.message) {
          // Campo principal da API StackSpot
          responseText = response.message;
        } else if ((response as any).response) {
          // Fallback para compatibilidade
          responseText = (response as any).response;
        } else if ((response as any).content) {
          responseText = typeof (response as any).content === 'string' 
            ? (response as any).content 
            : JSON.stringify((response as any).content);
        } else {
          // Se não encontrou nenhum campo conhecido, tenta usar o objeto inteiro
          responseText = JSON.stringify(response);
        }
      }

      // Log básico do texto extraído (opcional - pode ser removido em produção)
      // console.log(`✅ Resposta extraída: ${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}\n`);

      // Cria mensagem do assistente
      const assistantMessage: Message = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        object: 'thread.message',
        created_at: Math.floor(Date.now() / 1000),
        thread_id: threadId,
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: {
              value: responseText,
            },
          },
        ],
        metadata: {
          run_id: runId,
          stop_reason: response.stop_reason,
          tokens: response.tokens,
          knowledge_source_id: response.knowledge_source_id,
          source: response.source,
          knowledge_sources: (response as any)?.knowledge_sources || response?.knowledge_source_id,
          raw_response: response, // Guarda a resposta bruta para debug
        },
      };

      // Adiciona mensagem à thread
      this.threads.addThreadMessage(threadId, assistantMessage);

      // Atualiza run para completed
      run.status = 'completed';
      run.completed_at = Math.floor(Date.now() / 1000);
      this.runs.set(runId, run);
    } catch (error: any) {
      run.status = 'failed';
      run.last_error = {
        code: 'execution_error',
        message: error.message || 'Erro desconhecido',
      };
      run.failed_at = Math.floor(Date.now() / 1000);
      this.runs.set(runId, run);
      throw error;
    }
  }

  /**
   * Obtém um run específico
   */
  async retrieve(threadId: string, runId: string): Promise<Run> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run ${runId} não encontrado`);
    }

    if (run.thread_id !== threadId) {
      throw new Error(`Run ${runId} não pertence à thread ${threadId}`);
    }

    return run;
  }

  /**
   * Lista runs de uma thread
   */
  async list(threadId: string, params?: { limit?: number; order?: 'asc' | 'desc' }): Promise<{
    object: 'list';
    data: Run[];
    has_more: boolean;
  }> {
    // Verifica se a thread existe
    await this.threads.retrieve(threadId);

    let runs = Array.from(this.runs.values()).filter((r) => r.thread_id === threadId);

    // Aplica ordenação
    const order = params?.order || 'desc';
    if (order === 'asc') {
      runs = runs.sort((a, b) => a.created_at - b.created_at);
    } else {
      runs = runs.sort((a, b) => b.created_at - a.created_at);
    }

    // Aplica limite
    const limit = params?.limit || 20;
    const limitedRuns = runs.slice(0, limit);

    return {
      object: 'list',
      data: limitedRuns,
      has_more: runs.length > limit,
    };
  }

  /**
   * Cancela um run
   */
  async cancel(threadId: string, runId: string): Promise<Run> {
    const run = await this.retrieve(threadId, runId);

    if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      throw new Error(`Run ${runId} não pode ser cancelado (status: ${run.status})`);
    }

    run.status = 'cancelling';
    this.runs.set(runId, run);

    // Simula cancelamento
    setTimeout(() => {
      const currentRun = this.runs.get(runId);
      if (currentRun && currentRun.status === 'cancelling') {
        currentRun.status = 'cancelled';
        currentRun.cancelled_at = Math.floor(Date.now() / 1000);
        this.runs.set(runId, currentRun);
      }
    }, 100);

    return run;
  }

  /**
   * Submete outputs de tools (para compatibilidade com OpenAI)
   */
  async submitToolOutputs(
    threadId: string,
    runId: string,
    params: { tool_outputs: Array<{ tool_call_id: string; output: string }> }
  ): Promise<Run> {
    const run = await this.retrieve(threadId, runId);

    if (run.status !== 'requires_action') {
      throw new Error(`Run ${runId} não requer ação (status: ${run.status})`);
    }

    // Processa os outputs das tools
    // Nota: StackSpot não suporta tools nativamente, então apenas atualizamos o status
    run.status = 'in_progress';
    this.runs.set(runId, run);

    // Continua a execução (simulado)
    // Na prática, você precisaria processar os outputs e continuar o run
    setTimeout(() => {
      const currentRun = this.runs.get(runId);
      if (currentRun) {
        currentRun.status = 'completed';
        currentRun.completed_at = Math.floor(Date.now() / 1000);
        this.runs.set(runId, currentRun);
      }
    }, 1000);

    return run;
  }
}
