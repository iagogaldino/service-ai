/**
 * Adaptador para Ollama API
 * 
 * Ollama fornece uma API REST local para interagir com modelos LLM.
 * API base: http://localhost:11434/api
 */

import { Socket } from 'socket.io';
import { AgentConfig } from '../../agents/config';
import { LLMAdapter, LLMThread, LLMMessage, LLMRun, TokenUsage } from './LLMAdapter';
import { executeTool } from '../../agents/agentManager';
import { emitToMonitors } from '../../services/monitoringService';
import { formatActionMessage } from '../../utils/functionDescriptions';

export interface OllamaConfig {
  baseUrl?: string; // URL base do Ollama (padrão: http://localhost:11434)
  defaultModel?: string; // Modelo padrão (padrão: llama2)
}

interface CachedAgent {
  id: string;
  instructions: string;
  tools: any[];
  model: string;
}

interface OllamaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
  };
}

interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

// Armazena threads em memória (Ollama não tem conceito de threads)
const threadStore: Map<string, { messages: LLMMessage[]; created_at: number }> = new Map();
const agentStore: Map<string, CachedAgent> = new Map();
const runStore: Map<string, LLMRun> = new Map();

export class OllamaAdapter implements LLMAdapter {
  readonly provider = 'ollama';
  private baseUrl: string;
  private defaultModel: string;

  constructor(config?: OllamaConfig) {
    this.baseUrl = config?.baseUrl || 'http://localhost:11434';
    this.defaultModel = config?.defaultModel || 'llama2';
  }

  isConfigured(): boolean {
    // Ollama não precisa de credenciais, mas verifica se está acessível
    // Nota: Esta verificação é síncrona, então retorna true
    // A validação real será feita quando tentar usar o adapter
    return true;
  }

  /**
   * Verifica se o Ollama está rodando e acessível
   */
  private async checkOllamaRunning(): Promise<{ isRunning: boolean; error?: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // Timeout de 5 segundos
      
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return {
          isRunning: false,
          error: `Ollama retornou status ${response.status}. Verifique se o servidor está rodando corretamente.`
        };
      }
      
      return { isRunning: true };
    } catch (error: any) {
      let errorMessage = 'Erro desconhecido ao conectar ao Ollama';
      
      if (error.name === 'AbortError') {
        errorMessage = 'Timeout ao conectar ao Ollama. O servidor pode estar lento ou não estar respondendo.';
      } else if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
        errorMessage = `Não foi possível conectar ao Ollama em ${this.baseUrl}. Certifique-se de que o Ollama está rodando.`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      console.warn(`⚠️ Ollama não está acessível em ${this.baseUrl}:`, error);
      return { isRunning: false, error: errorMessage };
    }
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
    if (agentStore.has(config.name)) {
      const cached = agentStore.get(config.name)!;
      
      const instructionsChanged = cached.instructions !== config.instructions;
      const toolsChanged = !this.toolsEqual(cached.tools || [], config.tools || []);
      const modelChanged = cached.model !== (config.model || this.defaultModel);
      
      if (instructionsChanged || toolsChanged || modelChanged) {
        // Atualiza cache
        agentStore.set(config.name, {
          id: cached.id,
          instructions: config.instructions,
          tools: config.tools || [],
          model: config.model || this.defaultModel,
        });
        console.log(`🔄 Agente "${config.name}" atualizado no cache`);
      }
      
      return cached.id;
    }

    // Cria novo agente no cache
    const agentId = `ollama_agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    agentStore.set(config.name, {
      id: agentId,
      instructions: config.instructions,
      tools: config.tools || [],
      model: config.model || this.defaultModel,
    });

    console.log(`✅ Agente "${config.name}" criado (ID: ${agentId})`);
    return agentId;
  }

  async createThread(metadata?: Record<string, any>): Promise<LLMThread> {
    const threadId = `ollama_thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    threadStore.set(threadId, {
      messages: [],
      created_at: Date.now(),
    });

    return {
      id: threadId,
      created_at: Date.now(),
      metadata,
    };
  }

  async retrieveThread(threadId: string): Promise<LLMThread> {
    const thread = threadStore.get(threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} não encontrada`);
    }

    return {
      id: threadId,
      created_at: thread.created_at,
    };
  }

  async addMessage(
    threadId: string,
    role: 'user' | 'assistant' | 'system',
    content: string
  ): Promise<LLMMessage> {
    const thread = threadStore.get(threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} não encontrada`);
    }

    const message: LLMMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      created_at: Date.now(),
    };

    thread.messages.push(message);
    return message;
  }

  async listMessages(threadId: string, limit?: number): Promise<LLMMessage[]> {
    const thread = threadStore.get(threadId);
    if (!thread) {
      return [];
    }

    const messages = thread.messages;
    return limit ? messages.slice(-limit) : messages;
  }

  async createRun(threadId: string, assistantId: string, socket?: Socket): Promise<LLMRun> {
    const thread = threadStore.get(threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} não encontrada`);
    }

    const agent = Array.from(agentStore.values()).find(a => a.id === assistantId);
    if (!agent) {
      throw new Error(`Agente ${assistantId} não encontrado`);
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const run: LLMRun = {
      id: runId,
      thread_id: threadId,
      assistant_id: assistantId,
      status: 'queued',
      created_at: Date.now(),
    };

    // Armazena o run
    runStore.set(runId, run);

    // Processa o run de forma assíncrona
    this.processRun(run, thread, agent, socket).catch(error => {
      console.error(`❌ Erro ao processar run ${runId}:`, error);
    });

    return run;
  }

  private async processRun(
    run: LLMRun,
    thread: { messages: LLMMessage[] },
    agent: CachedAgent,
    socket?: Socket
  ): Promise<void> {
    try {
      run.status = 'in_progress';
      run.started_at = Date.now();

      // Prepara mensagens para o Ollama
      const ollamaMessages: OllamaMessage[] = [];
      
      // Adiciona instruções do sistema se houver
      if (agent.instructions) {
        ollamaMessages.push({
          role: 'system',
          content: agent.instructions,
        });
      }

      // Adiciona histórico de mensagens
      for (const msg of thread.messages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          ollamaMessages.push({
            role: msg.role,
            content: msg.content,
          });
        }
      }

      // Verifica se o Ollama está rodando antes de fazer a chamada
      const checkResult = await this.checkOllamaRunning();
      if (!checkResult.isRunning) {
        const errorMsg = checkResult.error || `Ollama não está acessível em ${this.baseUrl}`;
        const fullMessage = `${errorMsg}\n\n` +
          `Para resolver este problema:\n` +
          `1. Certifique-se de que o Ollama está instalado e rodando\n` +
          `2. Verifique se o Ollama está acessível em ${this.baseUrl}\n` +
          `3. Tente executar: ollama serve (se estiver usando linha de comando)\n` +
          `4. Verifique se a porta 11434 não está sendo usada por outro processo\n` +
          `5. Se estiver usando uma URL diferente, configure-a nas configurações do sistema`;
        throw new Error(fullMessage);
      }

      // Determina qual modelo usar
      // Se o modelo do agente for um modelo da OpenAI, usa o modelo padrão do Ollama
      let modelToUse = agent.model;
      const openaiModels = ['gpt-4', 'gpt-4-turbo', 'gpt-4-turbo-preview', 'gpt-3.5-turbo', 'gpt-3.5'];
      if (openaiModels.some(openaiModel => agent.model.toLowerCase().includes(openaiModel.toLowerCase()))) {
        modelToUse = this.defaultModel;
        console.log(`⚠️ Modelo do agente "${agent.model}" não é compatível com Ollama. Usando modelo padrão: ${this.defaultModel}`);
      }

      // Chama API do Ollama
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelToUse,
          messages: ollamaMessages,
          stream: false,
        } as OllamaChatRequest),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        let errorMessage = `Ollama API error (${response.status}): ${errorText}`;
        
        // Melhora mensagem de erro para modelo não encontrado
        if (response.status === 404 && errorText.includes('not found')) {
          errorMessage = `Modelo "${modelToUse}" não encontrado no Ollama.\n\n` +
            `Para resolver:\n` +
            `1. Verifique se o modelo está instalado: ollama list\n` +
            `2. Baixe o modelo: ollama pull ${modelToUse}\n` +
            `3. Ou configure um modelo diferente nas configurações do sistema\n` +
            `4. Modelos disponíveis: llama2, llama3, mistral, codellama, etc.`;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json() as OllamaChatResponse;
      
      // Adiciona resposta à thread
      const assistantMessage: LLMMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: data.message.content,
        created_at: Date.now(),
      };

      thread.messages.push(assistantMessage);
      
      // Armazena informações de tokens se disponíveis (para uso posterior)
      if (data.prompt_eval_count !== undefined && data.eval_count !== undefined) {
        (assistantMessage as any).tokenInfo = {
          promptTokens: data.prompt_eval_count,
          completionTokens: data.eval_count,
          totalTokens: data.prompt_eval_count + data.eval_count,
        };
      }

      // Emite para socket se disponível
      if (socket) {
        socket.emit('agent_response_chunk', {
          content: data.message.content,
          done: true,
        });
      }

      run.status = 'completed';
      run.completed_at = Date.now();
      
      // Atualiza o run no store
      runStore.set(run.id, run);
    } catch (error: any) {
      run.status = 'failed';
      run.failed_at = Date.now();
      run.last_error = {
        code: 'ollama_error',
        message: error.message || 'Erro ao processar run',
      };
      // Atualiza o run no store mesmo em caso de erro
      runStore.set(run.id, run);
      throw error;
    }
  }

  async retrieveRun(threadId: string, runId: string): Promise<LLMRun> {
    const run = runStore.get(runId);
    if (run) {
      return run;
    }
    // Se não encontrado, retorna um run genérico
    return {
      id: runId,
      thread_id: threadId,
      assistant_id: '',
      status: 'completed',
    };
  }

  async waitForRunCompletion(
    threadId: string,
    runId: string,
    socket?: Socket
  ): Promise<{ message: string; tokenUsage: TokenUsage }> {
    const thread = threadStore.get(threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} não encontrada`);
    }

    // Aguarda o run ser processado (polling)
    const maxWaitTime = 60000; // 60 segundos máximo
    const startTime = Date.now();
    const pollInterval = 200; // Verifica a cada 200ms

    while (Date.now() - startTime < maxWaitTime) {
      const run = runStore.get(runId);
      
      if (run && (run.status === 'completed' || run.status === 'failed')) {
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Busca a última mensagem do assistente
    const messages = thread.messages.filter(m => m.role === 'assistant');
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage) {
      const run = runStore.get(runId);
      if (run?.status === 'failed' && run.last_error) {
        throw new Error(run.last_error.message);
      }
      throw new Error('Nenhuma resposta do assistente encontrada');
    }

    // Usa informações de tokens se disponíveis, senão estima
    const tokenInfo = (lastMessage as any).tokenInfo;
    let tokenUsage: TokenUsage;
    
    if (tokenInfo) {
      tokenUsage = {
        promptTokens: tokenInfo.promptTokens,
        completionTokens: tokenInfo.completionTokens,
        totalTokens: tokenInfo.totalTokens,
      };
    } else {
      // Fallback: estima baseado no tamanho do texto
      const estimatedTokens = Math.ceil(lastMessage.content.length / 4);
      tokenUsage = {
        promptTokens: estimatedTokens,
        completionTokens: estimatedTokens,
        totalTokens: estimatedTokens * 2,
      };
    }
    
    return {
      message: lastMessage.content,
      tokenUsage,
    };
  }

  async submitToolOutputs(
    threadId: string,
    runId: string,
    toolOutputs: Array<{ tool_call_id: string; output: string }>
  ): Promise<LLMRun> {
    // Ollama não suporta tool calling nativamente, mas podemos simular
    const thread = threadStore.get(threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} não encontrada`);
    }

    // Adiciona outputs como mensagens do sistema
    for (const output of toolOutputs) {
      await this.addMessage(threadId, 'system', `Tool output: ${output.output}`);
    }

    return {
      id: runId,
      thread_id: threadId,
      assistant_id: '',
      status: 'completed',
    };
  }

  async listRuns(threadId: string, limit?: number): Promise<LLMRun[]> {
    // Ollama não mantém histórico de runs
    return [];
  }

  async cancelRun(threadId: string, runId: string): Promise<LLMRun> {
    return {
      id: runId,
      thread_id: threadId,
      assistant_id: '',
      status: 'cancelled',
    };
  }
}

