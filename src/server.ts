/**
 * Servidor principal da aplicação
 * 
 * Este módulo gerencia:
 * - Configuração do Express e Socket.IO
 * - Integração com OpenAI Assistants API
 * - Gerenciamento de threads e mensagens
 * - Execução de tools/funções dos agentes
 * - Comunicação em tempo real com clientes
 */

import express from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import OpenAI from 'openai';
import path from 'path';
import fs from 'fs';
import { AgentManager, executeTool } from './agents/agentManager';
import { loadEnvironmentVariables, validateRequiredEnvVars, getEnvAsNumber, logEnvironmentInfo, loadConfigFromJson, saveConfigToJson, AppConfig } from './config/env';
import { formatActionMessage } from './utils/functionDescriptions';
import { isRunningUnderNodemon, getShutdownConfig, gracefulShutdown as performGracefulShutdown } from './utils/serverHelpers';
import { initializeAgents, getAgentsConfig } from './agents/config';
import { getGroupsInfo, getMainSelector, getFallbackAgent } from './agents/agentLoader';
import { fileSystemFunctions } from './tools/fileSystemTools';
import { createLLMAdapter } from './llm/LLMFactory';
import { LLMAdapter } from './llm/adapters/LLMAdapter';

// ============================================================================
// CONFIGURAÇÃO DE AMBIENTE
// ============================================================================

loadEnvironmentVariables();
validateRequiredEnvVars(['OPENAI_API_KEY']);
logEnvironmentInfo(['OPENAI_API_KEY']);

// ============================================================================
// INICIALIZAÇÃO DE SERVIÇOS
// ============================================================================

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Inicializa o cliente OpenAI (será atualizado quando a API key for configurada)
let openai: OpenAI | undefined;

// Função para inicializar/atualizar o cliente OpenAI
function initializeOpenAIClient(): void {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    openai = new OpenAI({
      apiKey: apiKey,
    });
    console.log('✅ Cliente OpenAI inicializado');
  } else {
    openai = undefined;
    console.warn('⚠️  Cliente OpenAI não inicializado - API key não configurada');
  }
}

// Inicializa na primeira vez
initializeOpenAIClient();

const PORT = getEnvAsNumber('PORT', 3000);
let llmAdapter: LLMAdapter | undefined;
let agentManager: AgentManager | undefined;

/**
 * Inicializa o adaptador de LLM baseado na configuração
 */
function initializeLLMAdapter(): void {
  const config = loadConfigFromJson();
  const provider = config?.llmProvider || 'openai'; // Default para OpenAI para compatibilidade

  try {
    const llmConfig = {
      provider: provider as 'openai' | 'stackspot',
      openai: config?.openaiApiKey ? { apiKey: config.openaiApiKey } : undefined,
      stackspot: config?.stackspotClientId && config?.stackspotClientSecret
        ? {
            clientId: config.stackspotClientId,
            clientSecret: config.stackspotClientSecret,
            realm: config.stackspotRealm || 'stackspot-freemium',
          }
        : undefined,
    };

    llmAdapter = createLLMAdapter(llmConfig);
    console.log(`✅ Adaptador ${provider} inicializado`);
  } catch (error: any) {
    console.error(`❌ Erro ao inicializar adaptador ${provider}:`, error.message);
    llmAdapter = undefined;
  }
}

// Inicializa o adaptador de LLM
initializeLLMAdapter();

// Inicializa AgentManager se llmAdapter estiver disponível
if (llmAdapter) {
  agentManager = new AgentManager(llmAdapter);
} else {
  console.warn('⚠️ AgentManager não inicializado - LLM adapter não configurado');
}

// Inicializa agentes (carrega do JSON e faz cache na inicialização)
// Só inicializa se tiver llmAdapter configurado
if (llmAdapter) {
  initializeAgents().catch((err: any) => {
    console.error('❌ Erro ao inicializar agentes:', err);
    // Não faz exit(1) para permitir configuração via frontend
  });
}

// Armazena threads por socket ID (mapeia socket.id -> thread.id)
const threadMap = new Map<string, string>();

// Armazena informações sobre conexões ativas para monitoramento
interface ConnectionInfo {
  socketId: string;
  threadId: string;
  connectedAt: Date;
  lastActivity: Date;
  messageCount: number;
  userAgent?: string;
  ipAddress?: string;
}

const connectionsMap = new Map<string, ConnectionInfo>();
const monitoringSockets = new Map<string, string>(); // Map: monitorSocketId -> targetSocketId

// Armazena tokens acumulados por thread (para mostrar total acumulado)
const threadTokensMap = new Map<string, TokenUsage>();

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Interface para informações de uso de tokens
 */
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Interface para custo em dólares
 */
interface TokenCost {
  promptCost: number;
  completionCost: number;
  totalCost: number;
}

/**
 * Preços por modelo (por 1000 tokens) - atualizado em 2024
 */
const MODEL_PRICING: Record<string, { prompt: number; completion: number }> = {
  'gpt-4-turbo-preview': { prompt: 0.01, completion: 0.03 }, // $0.01 input, $0.03 output
  'gpt-4': { prompt: 0.03, completion: 0.06 }, // $0.03 input, $0.06 output (8k context)
  'gpt-4-32k': { prompt: 0.06, completion: 0.12 }, // $0.06 input, $0.12 output (32k context)
  'gpt-4-0125-preview': { prompt: 0.01, completion: 0.03 }, // $0.01 input, $0.03 output
  'gpt-4-1106-preview': { prompt: 0.01, completion: 0.03 }, // $0.01 input, $0.03 output
  'gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 }, // $0.0005 input, $0.0015 output
  'gpt-3.5-turbo-16k': { prompt: 0.003, completion: 0.004 }, // $0.003 input, $0.004 output
};

/**
 * Calcula o custo em dólares baseado nos tokens e modelo usado
 * 
 * @param tokenUsage - Uso de tokens
 * @param model - Modelo usado (padrão: gpt-4-turbo-preview)
 * @returns Custo em dólares
 */
function calculateTokenCost(tokenUsage: TokenUsage, model: string = 'gpt-4-turbo-preview'): TokenCost {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4-turbo-preview'];
  
  // Calcula custo: (tokens / 1000) * preço por 1000 tokens
  const promptCost = (tokenUsage.promptTokens / 1000) * pricing.prompt;
  const completionCost = (tokenUsage.completionTokens / 1000) * pricing.completion;
  const totalCost = promptCost + completionCost;
  
  return {
    promptCost: Math.round(promptCost * 10000) / 10000, // Arredonda para 4 casas decimais
    completionCost: Math.round(completionCost * 10000) / 10000,
    totalCost: Math.round(totalCost * 10000) / 10000
  };
}

/**
 * Interface para entrada de histórico de tokens no JSON
 */
interface TokenHistoryEntry {
  threadId: string;
  timestamp: string;
  agentName: string;
  message: string;
  tokenUsage: TokenUsage;
  accumulatedTokenUsage: TokenUsage;
  cost?: TokenCost;
  accumulatedCost?: TokenCost;
  model?: string;
}

/**
 * Interface para o formato completo do arquivo JSON de tokens
 */
interface TokensJsonFile {
  totalTokens: TokenUsage;
  totalCost: TokenCost;
  entries: TokenHistoryEntry[];
  lastUpdated: string;
}

/**
 * Tipos de logs disponíveis
 */
type LogType = 
  | 'connection' 
  | 'disconnection' 
  | 'agent_selection' 
  | 'message_sent' 
  | 'message_received' 
  | 'tool_execution' 
  | 'tool_result' 
  | 'run_status' 
  | 'error' 
  | 'response' 
  | 'token_usage'
  | 'monitoring';

/**
 * Interface para entrada de log
 */
interface LogEntry {
  id: string;
  type: LogType;
  timestamp: string;
  socketId?: string;
  threadId?: string;
  runId?: string;
  agentName?: string;
  agentId?: string;
  message?: string;
  response?: string;
  toolName?: string;
  toolArgs?: any;
  toolResult?: string;
  toolExecutionTime?: number;
  error?: string;
  errorStack?: string;
  status?: string;
  tokenUsage?: TokenUsage;
  accumulatedTokenUsage?: TokenUsage;
  tokenCost?: TokenCost;
  accumulatedTokenCost?: TokenCost;
  metadata?: Record<string, any>;
}

/**
 * Interface para o formato completo do arquivo JSON de logs
 */
interface LogsJsonFile {
  totalEntries: number;
  entries: LogEntry[];
  lastUpdated: string;
  statistics: {
    totalConnections: number;
    totalMessages: number;
    totalToolExecutions: number;
    totalErrors: number;
    totalTokens: number;
    totalCost: number;
  };
}

/**
 * Interface para uma mensagem de conversa
 */
interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  agentName?: string;
  tokenUsage?: TokenUsage;
}

/**
 * Interface para uma conversa (thread)
 */
interface Conversation {
  threadId: string;
  socketId: string;
  createdAt: string;
  lastUpdated: string;
  messages: ConversationMessage[];
}

/**
 * Interface para o formato completo do arquivo JSON de conversas
 */
interface ConversationsJsonFile {
  conversations: Conversation[];
  lastUpdated: string;
}

/**
 * Salva uma entrada de log em um arquivo JSON
 * 
 * @param logEntry - Entrada de log a ser salva
 */
function saveLogToJson(logEntry: Omit<LogEntry, 'id' | 'timestamp'>): void {
  try {
    const logsFilePath = path.join(process.cwd(), 'logs.json');
    
    // Gera ID único para o log
    const id = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullLogEntry: LogEntry = {
      ...logEntry,
      id,
      timestamp: new Date().toISOString()
    };
    
    // Lê o arquivo existente ou cria estrutura vazia
    let logsData: LogsJsonFile;
    if (fs.existsSync(logsFilePath)) {
      const fileContent = fs.readFileSync(logsFilePath, 'utf-8');
      // Verifica se o arquivo está vazio ou contém apenas espaços em branco
      if (fileContent.trim() === '') {
        // Arquivo vazio, cria estrutura inicial
        logsData = {
          totalEntries: 0,
          entries: [],
          lastUpdated: new Date().toISOString(),
          statistics: {
            totalConnections: 0,
            totalMessages: 0,
            totalToolExecutions: 0,
            totalErrors: 0,
            totalTokens: 0,
            totalCost: 0
          }
        };
      } else {
        logsData = JSON.parse(fileContent);
        // Garante compatibilidade com versões antigas
        if (!logsData.statistics.totalCost) {
          logsData.statistics.totalCost = 0;
        }
      }
    } else {
      logsData = {
        totalEntries: 0,
        entries: [],
        lastUpdated: new Date().toISOString(),
        statistics: {
          totalConnections: 0,
          totalMessages: 0,
          totalToolExecutions: 0,
          totalErrors: 0,
          totalTokens: 0,
          totalCost: 0
        }
      };
    }

    // Adiciona nova entrada
    logsData.entries.push(fullLogEntry);
    logsData.totalEntries = logsData.entries.length;
    logsData.lastUpdated = new Date().toISOString();

    // Atualiza estatísticas
    switch (fullLogEntry.type) {
      case 'connection':
        logsData.statistics.totalConnections++;
        break;
      case 'message_sent':
      case 'message_received':
        logsData.statistics.totalMessages++;
        break;
      case 'tool_execution':
        logsData.statistics.totalToolExecutions++;
        break;
      case 'error':
        logsData.statistics.totalErrors++;
        break;
      case 'token_usage':
        if (fullLogEntry.tokenUsage) {
          logsData.statistics.totalTokens += fullLogEntry.tokenUsage.totalTokens;
        }
        if (fullLogEntry.tokenCost) {
          logsData.statistics.totalCost += fullLogEntry.tokenCost.totalCost;
          logsData.statistics.totalCost = Math.round(logsData.statistics.totalCost * 10000) / 10000;
        }
        break;
    }

    // Mantém apenas as últimas 10000 entradas para evitar arquivo muito grande
    const MAX_ENTRIES = 10000;
    if (logsData.entries.length > MAX_ENTRIES) {
      logsData.entries = logsData.entries.slice(-MAX_ENTRIES);
      logsData.totalEntries = logsData.entries.length;
    }

    // Salva o arquivo
    fs.writeFileSync(logsFilePath, JSON.stringify(logsData, null, 2), 'utf-8');
  } catch (error) {
    console.error('❌ Erro ao salvar log no JSON:', error);
  }
}

/**
 * Salva informações de tokens em um arquivo JSON
 * 
 * @param threadId - ID da thread
 * @param agentName - Nome do agente usado
 * @param message - Mensagem do usuário
 * @param tokenUsage - Tokens utilizados nesta mensagem
 * @param accumulatedTokenUsage - Tokens acumulados na thread
 * @param model - Modelo usado (padrão: gpt-4-turbo-preview)
 */
function saveTokensToJson(
  threadId: string,
  agentName: string,
  message: string,
  tokenUsage: TokenUsage,
  accumulatedTokenUsage: TokenUsage,
  model: string = 'gpt-4-turbo-preview'
): void {
  try {
    const tokensFilePath = path.join(process.cwd(), 'tokens.json');
    
    // Calcula custos
    const cost = calculateTokenCost(tokenUsage, model);
    const accumulatedCost = calculateTokenCost(accumulatedTokenUsage, model);
    
    // Lê o arquivo existente ou cria estrutura vazia
    let tokensData: TokensJsonFile;
    if (fs.existsSync(tokensFilePath)) {
      const fileContent = fs.readFileSync(tokensFilePath, 'utf-8');
      const parsed = JSON.parse(fileContent);
      // Garante que totalCost existe (compatibilidade com versões antigas)
      if (!parsed.totalCost) {
        parsed.totalCost = { promptCost: 0, completionCost: 0, totalCost: 0 };
      }
      tokensData = parsed;
    } else {
      tokensData = {
        totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        totalCost: { promptCost: 0, completionCost: 0, totalCost: 0 },
        entries: [],
        lastUpdated: new Date().toISOString()
      };
    }

    // Adiciona nova entrada
    const newEntry: TokenHistoryEntry = {
      threadId,
      timestamp: new Date().toISOString(),
      agentName,
      message,
      tokenUsage,
      accumulatedTokenUsage,
      cost,
      accumulatedCost,
      model
    };
    tokensData.entries.push(newEntry);

    // Atualiza total acumulado (soma todos os tokens de todas as interações)
    tokensData.totalTokens.promptTokens += tokenUsage.promptTokens;
    tokensData.totalTokens.completionTokens += tokenUsage.completionTokens;
    tokensData.totalTokens.totalTokens += tokenUsage.totalTokens;

    // Atualiza custo total acumulado
    tokensData.totalCost.promptCost += cost.promptCost;
    tokensData.totalCost.completionCost += cost.completionCost;
    tokensData.totalCost.totalCost += cost.totalCost;
    
    // Arredonda para evitar problemas de ponto flutuante
    tokensData.totalCost.promptCost = Math.round(tokensData.totalCost.promptCost * 10000) / 10000;
    tokensData.totalCost.completionCost = Math.round(tokensData.totalCost.completionCost * 10000) / 10000;
    tokensData.totalCost.totalCost = Math.round(tokensData.totalCost.totalCost * 10000) / 10000;

    tokensData.lastUpdated = new Date().toISOString();

    // Salva o arquivo
    fs.writeFileSync(tokensFilePath, JSON.stringify(tokensData, null, 2), 'utf-8');
    console.log(`💾 Tokens salvos em tokens.json (Total: ${tokensData.totalTokens.totalTokens} tokens, Custo: $${tokensData.totalCost.totalCost.toFixed(4)})`);
  } catch (error) {
    console.error('❌ Erro ao salvar tokens no JSON:', error);
  }
}

/**
 * Salva uma mensagem na conversa
 * 
 * @param threadId - ID da thread
 * @param socketId - ID do socket
 * @param role - Role da mensagem (user, assistant, system)
 * @param content - Conteúdo da mensagem
 * @param agentName - Nome do agente (opcional)
 * @param tokenUsage - Uso de tokens (opcional)
 */
function saveConversationMessage(
  threadId: string,
  socketId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  agentName?: string,
  tokenUsage?: TokenUsage
): void {
  try {
    const conversationsFilePath = path.join(process.cwd(), 'conversations.json');
    
    // Lê o arquivo existente ou cria estrutura vazia
    let conversationsData: ConversationsJsonFile;
    if (fs.existsSync(conversationsFilePath)) {
      try {
        const fileContent = fs.readFileSync(conversationsFilePath, 'utf-8').trim();
        
        // Verifica se o arquivo está vazio
        if (!fileContent || fileContent.length === 0) {
          conversationsData = {
            conversations: [],
            lastUpdated: new Date().toISOString()
          };
        } else {
          conversationsData = JSON.parse(fileContent);
          
          // Verifica se a estrutura está correta
          if (!conversationsData || !Array.isArray(conversationsData.conversations)) {
            console.log('⚠️ Estrutura do conversations.json inválida, recriando...');
            conversationsData = {
              conversations: [],
              lastUpdated: new Date().toISOString()
            };
          }
        }
      } catch (parseError) {
        console.error('❌ Erro ao fazer parse do conversations.json, recriando...', parseError);
        conversationsData = {
          conversations: [],
          lastUpdated: new Date().toISOString()
        };
      }
    } else {
      conversationsData = {
        conversations: [],
        lastUpdated: new Date().toISOString()
      };
    }

    // Procura se já existe uma conversa para esta thread
    let conversation = conversationsData.conversations.find(conv => conv.threadId === threadId);
    
    if (!conversation) {
      // Cria nova conversa
      conversation = {
        threadId,
        socketId,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        messages: []
      };
      conversationsData.conversations.push(conversation);
    } else {
      // Atualiza socketId e lastUpdated se necessário
      conversation.socketId = socketId;
      conversation.lastUpdated = new Date().toISOString();
    }

    // Adiciona nova mensagem
    const newMessage: ConversationMessage = {
      id: `${threadId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: new Date().toISOString(),
      agentName,
      tokenUsage
    };

    conversation.messages.push(newMessage);

    // Mantém apenas as últimas 1000 mensagens por conversa para evitar arquivo muito grande
    const MAX_MESSAGES_PER_CONVERSATION = 1000;
    if (conversation.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
      conversation.messages = conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
    }

    // Mantém apenas as últimas 100 conversas para evitar arquivo muito grande
    const MAX_CONVERSATIONS = 100;
    if (conversationsData.conversations.length > MAX_CONVERSATIONS) {
      conversationsData.conversations = conversationsData.conversations.slice(-MAX_CONVERSATIONS);
    }

    conversationsData.lastUpdated = new Date().toISOString();

    // Salva o arquivo
    fs.writeFileSync(conversationsFilePath, JSON.stringify(conversationsData, null, 2), 'utf-8');
  } catch (error) {
    console.error('❌ Erro ao salvar mensagem na conversa:', error);
  }
}

/**
 * Carrega conversa de uma thread
 * 
 * @param threadId - ID da thread
 * @returns Conversa ou null se não encontrada
 */
function loadConversation(threadId: string): Conversation | null {
  try {
    const conversationsFilePath = path.join(process.cwd(), 'conversations.json');
    
    if (!fs.existsSync(conversationsFilePath)) {
      return null;
    }

    const fileContent = fs.readFileSync(conversationsFilePath, 'utf-8').trim();
    
    // Verifica se o arquivo está vazio ou tem apenas espaços
    if (!fileContent || fileContent.length === 0) {
      console.log('⚠️ Arquivo conversations.json está vazio, criando estrutura inicial...');
      // Cria estrutura inicial válida
      const initialData: ConversationsJsonFile = {
        conversations: [],
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(conversationsFilePath, JSON.stringify(initialData, null, 2), 'utf-8');
      return null;
    }

    // Tenta fazer o parse do JSON
    let conversationsData: ConversationsJsonFile;
    try {
      conversationsData = JSON.parse(fileContent);
    } catch (parseError) {
      console.error('❌ Erro ao fazer parse do JSON do conversations.json:', parseError);
      console.log('⚠️ Recriando arquivo conversations.json com estrutura válida...');
      // Recria o arquivo com estrutura válida
      const initialData: ConversationsJsonFile = {
        conversations: [],
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(conversationsFilePath, JSON.stringify(initialData, null, 2), 'utf-8');
      return null;
    }
    
    // Verifica se a estrutura está correta
    if (!conversationsData || !Array.isArray(conversationsData.conversations)) {
      console.log('⚠️ Estrutura do conversations.json inválida, recriando...');
      const initialData: ConversationsJsonFile = {
        conversations: [],
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(conversationsFilePath, JSON.stringify(initialData, null, 2), 'utf-8');
      return null;
    }
    
    const conversation = conversationsData.conversations.find(conv => conv.threadId === threadId);
    return conversation || null;
  } catch (error) {
    console.error('❌ Erro ao carregar conversa:', error);
    return null;
  }
}

/**
 * Limpa conversa de uma thread
 * 
 * @param threadId - ID da thread
 * @param socketId - ID do socket (opcional, usado como fallback)
 */
function clearConversation(threadId: string, socketId?: string): void {
  try {
    const conversationsFilePath = path.join(process.cwd(), 'conversations.json');
    
    if (!fs.existsSync(conversationsFilePath)) {
      console.log('⚠️ Arquivo conversations.json não existe, nada para limpar');
      return;
    }

    const fileContent = fs.readFileSync(conversationsFilePath, 'utf-8').trim();
    
    // Verifica se o arquivo está vazio
    if (!fileContent || fileContent.length === 0) {
      console.log('⚠️ Arquivo conversations.json está vazio, nada para limpar');
      return;
    }

    let conversationsData: ConversationsJsonFile;
    try {
      conversationsData = JSON.parse(fileContent);
    } catch (parseError) {
      console.error('❌ Erro ao fazer parse do conversations.json:', parseError);
      return;
    }
    
    // Verifica se a estrutura está correta
    if (!conversationsData || !Array.isArray(conversationsData.conversations)) {
      console.log('⚠️ Estrutura do conversations.json inválida');
      return;
    }

    // Conta quantas conversas existiam antes
    const beforeCount = conversationsData.conversations.length;
    
    let removedCount = 0;
    
    // Remove a conversa da lista por threadId (se threadId não for vazio)
    if (threadId) {
      const beforeFilter = conversationsData.conversations.length;
      conversationsData.conversations = conversationsData.conversations.filter(
        conv => conv.threadId !== threadId
      );
      removedCount = beforeFilter - conversationsData.conversations.length;
      
      // Se não encontrou por threadId e temos socketId, tenta por socketId como fallback
      if (removedCount === 0 && socketId) {
        console.log(`⚠️ Conversa não encontrada por threadId ${threadId}, tentando por socketId ${socketId}`);
        const beforeSocketFilter = conversationsData.conversations.length;
        conversationsData.conversations = conversationsData.conversations.filter(
          conv => conv.socketId !== socketId
        );
        removedCount = beforeSocketFilter - conversationsData.conversations.length;
      }
    } else if (socketId) {
      // Se não temos threadId, tenta apenas por socketId
      const beforeSocketFilter = conversationsData.conversations.length;
      conversationsData.conversations = conversationsData.conversations.filter(
        conv => conv.socketId !== socketId
      );
      removedCount = beforeSocketFilter - conversationsData.conversations.length;
    }
    
    const afterCount = conversationsData.conversations.length;
    
    if (removedCount > 0) {
      console.log(`✅ Removida(s) ${removedCount} conversa(s) do JSON (threadId: ${threadId || 'N/A'}, socketId: ${socketId || 'N/A'})`);
    } else {
      console.log(`⚠️ Nenhuma conversa encontrada para remover (threadId: ${threadId || 'N/A'}, socketId: ${socketId || 'N/A'})`);
    }
    
    conversationsData.lastUpdated = new Date().toISOString();

    // Salva o arquivo
    fs.writeFileSync(conversationsFilePath, JSON.stringify(conversationsData, null, 2), 'utf-8');
    console.log(`💾 Arquivo conversations.json atualizado (${afterCount} conversa(s) restante(s))`);
  } catch (error) {
    console.error('❌ Erro ao limpar conversa:', error);
  }
}

/**
 * Aguarda a conclusão de um run do Assistants API e processa as ações necessárias
 * 
 * Esta função monitora o status de um run, executa tools quando necessário,
 * e retorna a resposta final do assistente com informações de uso de tokens.
 * Envia eventos em tempo real para o cliente através do Socket.IO.
 * 
 * @param {string} threadId - ID da thread do Assistants API
 * @param {string} runId - ID do run que está sendo executado
 * @param {Socket} socket - Socket.IO para emitir eventos em tempo real
 * @returns {Promise<{message: string, tokenUsage: TokenUsage}>} Resposta final e uso de tokens
 * @throws {Error} Se o run falhar ou ocorrer algum erro
 */
async function waitForRunCompletion(
  threadId: string,
  runId: string,
  socket: Socket
): Promise<{ message: string; tokenUsage: TokenUsage }> {
  if (!llmAdapter) {
    throw new Error('LLM adapter não está configurado. Configure o provider primeiro.');
  }

  let iterationCount = 0;
  const MAX_ITERATIONS = 100; // Previne loops infinitos
  
  // Acumula tokens de todas as iterações
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  
  while (iterationCount < MAX_ITERATIONS) {
    iterationCount++;
    
    console.log(`🔄 Verificando status do run ${runId} (tentativa ${iterationCount})...`);

    const run = await llmAdapter.retrieveRun(threadId, runId);
    console.log(`📊 Status do run: ${run.status}`);

    // Nota: O uso de tokens é capturado e retornado por waitForRunCompletion dos adaptadores
    // Não acessamos run.usage aqui pois não existe na interface LLMRun

    // Caso 1: Run completado com sucesso
    if (run.status === 'completed') {
      console.log(`✅ Run concluído! Buscando mensagens da thread...`);

      const messages = await llmAdapter.listMessages(threadId, 10);

      // Emite todas as mensagens do assistente para o cliente
      for (const message of messages.reverse()) {
        if (message.role === 'assistant') {
          // Obtém tokens acumulados da thread para incluir na mensagem
          const threadTokens = threadTokensMap.get(threadId) || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
          
          const messageData = {
            type: 'assistant',
            message: message.content,
            messageId: message.id,
            tokenUsage: threadTokens, // Inclui tokens acumulados na mensagem
            details: {
              threadId,
              role: 'assistant',
              createdAt: message.created_at
            }
          };
          socket.emit('agent_message', messageData);
          emitToMonitors(socket.id, 'agent_message', messageData);
        }
      }

      // Retorna a última mensagem do assistente com informações de tokens
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role === 'assistant') {
        const responseText = lastMessage.content;
        console.log(`📨 Mensagem recuperada da thread (${responseText.length} caracteres)`);
        console.log(`💰 Total de tokens utilizados: ${totalTokens} (prompt: ${totalPromptTokens}, completion: ${totalCompletionTokens})`);
        
        return {
          message: responseText,
          tokenUsage: {
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            totalTokens: totalTokens
          }
        };
      }
      return {
        message: 'Resposta não disponível.',
        tokenUsage: {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalTokens
        }
      };
    }

    // Caso 2: Run falhou
    if (run.status === 'failed') {
      const errorMessage = run.last_error?.message || 'Erro desconhecido';
      console.error(`❌ Run falhou: ${errorMessage}`);
      
      // Log de erro de run
      saveLogToJson({
        type: 'error',
        socketId: socket.id,
        threadId: threadId,
        runId: run.id,
        error: errorMessage,
        errorStack: run.last_error?.code || 'unknown',
        status: 'failed',
        metadata: {
          errorType: 'run_failed',
          lastError: run.last_error
        }
      });
      
      throw new Error(`Run falhou: ${errorMessage}`);
    }

    // Caso 3: Run requer ação (execução de tools)
    if (run.status === 'requires_action') {
      console.log(`🔧 Run requer ação: agente precisa executar funções`);

      // Type casting para acessar required_action (específico do OpenAI)
      const runWithAction = run as any;
      const toolCalls = runWithAction.required_action?.submit_tool_outputs?.tool_calls || [];
      
      if (toolCalls.length === 0) {
        throw new Error('Run requer ação mas nenhuma tool foi especificada');
      }

      // Prepara informações sobre as tools que serão executadas
      const toolCallsInfo = toolCalls
        .map((tc: any) => {
          if (tc.type === 'function') {
            const args = JSON.parse(tc.function.arguments);
            return {
              toolCallId: tc.id,
              functionName: tc.function.name,
              arguments: args,
              rawArguments: tc.function.arguments
            };
          }
          return null;
        })
        .filter(Boolean);

      // Notifica o cliente sobre as funções que serão executadas
      const functionCallsData = {
        type: 'function_calls',
        toolCalls: toolCallsInfo,
        details: {
          runId,
          toolCallsCount: toolCalls.length
        }
      };
      socket.emit('agent_message', functionCallsData);
      emitToMonitors(socket.id, 'agent_message', functionCallsData);

      console.log(`🔨 ${toolCalls.length} função(ões) solicitada(s) pelo agente`);

      // Executa todas as funções solicitadas em paralelo
      const toolOutputs = await Promise.all(
        toolCalls.map(async (toolCall: any, index: number) => {
          if (toolCall.type !== 'function') {
            return null;
          }

          const functionName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          
          console.log(`🔧 [${index + 1}/${toolCalls.length}] Executando função: ${functionName}`, args);
          
          // Emite evento de ação para o cliente
          const actionMessage = formatActionMessage(functionName, args);
          const agentActionData = {
            action: actionMessage,
            functionName: functionName,
            args: args
          };
          socket.emit('agent_action', agentActionData);
          emitToMonitors(socket.id, 'agent_action', agentActionData);
          
          // Log de execução de tool
          saveLogToJson({
            type: 'tool_execution',
            socketId: socket.id,
            threadId: threadId,
            runId: run.id,
            toolName: functionName,
            toolArgs: args,
            metadata: {
              toolCallId: toolCall.id,
              index: index + 1,
              total: toolCalls.length
            }
          });
          
          // Executa a função
          const startTime = Date.now();
          const result = await executeTool(functionName, args, socket);
          const executionTime = Date.now() - startTime;
          
          console.log(`✅ [${index + 1}/${toolCalls.length}] Função ${functionName} executada (${executionTime}ms) - Resultado: ${result.length} caracteres`);

          // Log de resultado de tool
          saveLogToJson({
            type: 'tool_result',
            socketId: socket.id,
            threadId: threadId,
            runId: run.id,
            toolName: functionName,
            toolResult: result.substring(0, 500), // Limita tamanho do log
            toolExecutionTime: executionTime,
            metadata: {
              toolCallId: toolCall.id,
              resultLength: result.length,
              success: !result.startsWith('Erro:')
            }
          });

          // Emite resultado da função para o cliente
          const functionResultData = {
            type: 'function_result',
            functionName: functionName,
            arguments: args,
            result: result,
            executionTime: executionTime,
            details: {
              toolCallId: toolCall.id,
              success: !result.startsWith('Erro:')
            }
          };
          socket.emit('agent_message', functionResultData);
          emitToMonitors(socket.id, 'agent_message', functionResultData);
          
          // Emite evento de conclusão da ação
          const actionCompleteData = {
            action: actionMessage,
            success: !result.startsWith('Erro:'),
            result: result.substring(0, 500) // Preview do resultado
          };
          socket.emit('agent_action_complete', actionCompleteData);
          emitToMonitors(socket.id, 'agent_action_complete', actionCompleteData);
          
          return {
            tool_call_id: toolCall.id,
            output: result
          };
        })
      );

      // Remove nulls e filtra apenas resultados válidos
      const validOutputs = toolOutputs.filter(
        (output: any): output is NonNullable<typeof output> => output !== null
      );

      console.log(`📦 Preparando ${validOutputs.length} resultado(s) para enviar ao agente...`);

      // Notifica o cliente sobre o processamento
      const processingData = {
        action: '⚙️ Processando resultados...',
        functionName: 'processing'
      };
      socket.emit('agent_action', processingData);
      emitToMonitors(socket.id, 'agent_action', processingData);

      // Mostra o que está sendo enviado de volta ao agente
      const functionOutputsData = {
        type: 'function_outputs',
        outputs: validOutputs.map((output: any) => ({
          toolCallId: output.tool_call_id,
          output: output.output.substring(0, 1000) + (output.output.length > 1000 ? '...' : ''),
          outputLength: output.output.length
        })),
        details: {
          runId,
          outputsCount: validOutputs.length
        }
      };
      socket.emit('agent_message', functionOutputsData);
      emitToMonitors(socket.id, 'agent_message', functionOutputsData);

      // Envia os resultados das funções de volta para o assistente
      console.log(`📤 Enviando ${validOutputs.length} resultado(s) de volta ao agente...`);

      await llmAdapter.submitToolOutputs(threadId, runId, validOutputs);

      console.log(`✅ Resultados enviados. Aguardando processamento do agente...`);

      // Aguarda um pouco antes de verificar o status novamente
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }

    // Caso 4: Run em fila ou em progresso
    if (run.status === 'queued' || run.status === 'in_progress') {
      console.log(`⏳ Run em progresso (${run.status})...`);
    }

    // Aguarda antes de verificar novamente
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Run não completou após ${MAX_ITERATIONS} iterações`);
}

// ============================================================================
// ROTAS HTTP
// ============================================================================

/**
 * Rota raiz: Serve o cliente HTML
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

/**
 * Rota para página de monitoramento
 */
app.get('/monitor', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/monitor.html'));
});

/**
 * API: Lista todas as conexões ativas
 */
app.get('/api/connections', (req, res) => {
  const connections = Array.from(connectionsMap.values()).map(conn => ({
    socketId: conn.socketId,
    threadId: conn.threadId,
    connectedAt: conn.connectedAt.toISOString(),
    lastActivity: conn.lastActivity.toISOString(),
    messageCount: conn.messageCount,
    userAgent: conn.userAgent,
    ipAddress: conn.ipAddress
  }));
  res.json({ connections });
});

/**
 * API: Obtém informações de uma conexão específica
 */
app.get('/api/connections/:socketId', (req, res) => {
  const { socketId } = req.params;
  const connection = connectionsMap.get(socketId);
  if (!connection) {
    return res.status(404).json({ error: 'Conexão não encontrada' });
  }
  res.json({
    socketId: connection.socketId,
    threadId: connection.threadId,
    connectedAt: connection.connectedAt.toISOString(),
    lastActivity: connection.lastActivity.toISOString(),
    messageCount: connection.messageCount,
    userAgent: connection.userAgent,
    ipAddress: connection.ipAddress
  });
});

/**
 * API: Lista todos os agentes disponíveis
 */
app.get('/api/agents', async (req, res) => {
  try {
    const agents = getAgentsConfig();
    const groups = getGroupsInfo(agents);
    const mainSelector = getMainSelector(agents);
    const fallbackAgent = getFallbackAgent(agents);
    
    // Formata agentes para resposta
    const formattedAgents = agents.map(agent => {
      const agentAny = agent as any;
      return {
        name: agent.name,
        description: agent.description,
        model: agent.model,
        priority: agentAny.priority ?? 999,
        role: agentAny.role || 'agent',
        groupId: agentAny.groupId || null,
        groupName: agentAny.groupName || null,
        toolsCount: agent.tools.length,
        tools: agent.tools.map((tool: any) => {
          if (tool.type === 'function' && tool.function) {
            return tool.function.name;
          }
          return 'unknown';
        }).filter(Boolean)
      };
    });
    
    // Organiza grupos
    const formattedGroups = Array.from(groups.values()).map(group => ({
      id: group.groupId,
      name: group.groupName,
      orchestrator: {
        name: group.orchestrator.name,
        description: group.orchestrator.description,
        toolsCount: group.orchestrator.tools.length,
        tools: group.orchestrator.tools.map((tool: any) => {
          if (tool.type === 'function' && tool.function) {
            return tool.function.name;
          }
          return 'unknown';
        }).filter(Boolean)
      },
      agents: group.agents.map(agent => ({
        name: agent.name,
        description: agent.description,
        toolsCount: agent.tools.length,
        tools: agent.tools.map((tool: any) => {
          if (tool.type === 'function' && tool.function) {
            return tool.function.name;
          }
          return 'unknown';
        }).filter(Boolean)
      }))
    }));
    
    res.json({
      total: agents.length,
      mainSelector: mainSelector ? {
        name: mainSelector.name,
        description: mainSelector.description,
        toolsCount: mainSelector.tools.length,
        tools: mainSelector.tools.map((tool: any) => {
          if (tool.type === 'function' && tool.function) {
            return tool.function.name;
          }
          return 'unknown';
        }).filter(Boolean)
      } : null,
      fallbackAgent: fallbackAgent ? {
        name: fallbackAgent.name,
        description: fallbackAgent.description,
        toolsCount: fallbackAgent.tools.length,
        tools: fallbackAgent.tools.map((tool: any) => {
          if (tool.type === 'function' && tool.function) {
            return tool.function.name;
          }
          return 'unknown';
        }).filter(Boolean)
      } : null,
      groups: formattedGroups,
      agents: formattedAgents
    });
  } catch (error: any) {
    console.error('Erro ao obter agentes:', error);
    res.status(500).json({ error: 'Erro ao obter lista de agentes' });
  }
});

app.get('/api/tokens', async (req, res) => {
  try {
    const tokensFilePath = path.join(process.cwd(), 'tokens.json');
    
    if (!fs.existsSync(tokensFilePath)) {
      return res.json({
        totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        entries: [],
        lastUpdated: null
      });
    }
    
    const fileContent = fs.readFileSync(tokensFilePath, 'utf-8');
    const tokensData = JSON.parse(fileContent);
    
    res.json(tokensData);
  } catch (error: any) {
    console.error('Erro ao obter tokens:', error);
    res.status(500).json({ error: 'Erro ao obter histórico de tokens' });
  }
});

app.get('/api/logs', async (req, res) => {
  try {
    const logsFilePath = path.join(process.cwd(), 'logs.json');
    
    if (!fs.existsSync(logsFilePath)) {
      return res.json({
        totalEntries: 0,
        entries: [],
        lastUpdated: null,
        statistics: {
          totalConnections: 0,
          totalMessages: 0,
          totalToolExecutions: 0,
          totalErrors: 0,
          totalTokens: 0,
          totalCost: 0
        }
      });
    }
    
    const fileContent = fs.readFileSync(logsFilePath, 'utf-8');
    const logsData = JSON.parse(fileContent);
    
    // Garante compatibilidade
    if (!logsData.statistics.totalCost) {
      logsData.statistics.totalCost = 0;
    }
    
    res.json(logsData);
  } catch (error: any) {
    console.error('Erro ao obter logs:', error);
    res.status(500).json({ error: 'Erro ao obter histórico de logs' });
  }
});

/**
 * API: Obtém configuração atual
 */
/**
 * API: Limpa conversa de uma thread
 */
app.delete('/api/conversations/:threadId', async (req, res) => {
  try {
    const { threadId } = req.params;
    clearConversation(threadId);
    res.json({ success: true, message: 'Conversa limpa com sucesso' });
  } catch (error: any) {
    console.error('Erro ao limpar conversa:', error);
    res.status(500).json({ error: 'Erro ao limpar conversa' });
  }
});

/**
 * API: Carrega conversa de uma thread
 */
app.get('/api/conversations/:threadId', async (req, res) => {
  try {
    const { threadId } = req.params;
    const conversation = loadConversation(threadId);
    if (!conversation) {
      return res.json({ messages: [] });
    }
    res.json({ messages: conversation.messages });
  } catch (error: any) {
    console.error('Erro ao carregar conversa:', error);
    res.status(500).json({ error: 'Erro ao carregar conversa' });
  }
});

app.get('/api/config', async (req, res) => {
  try {
    const config = loadConfigFromJson();
    
    // Prepara resposta com informações de OpenAI
    let openaiConfig: any = {
      configured: false,
      apiKeyPreview: null
    };
    
    if (config?.openaiApiKey) {
      const maskedKey = config.openaiApiKey.substring(0, 7) + '...' + config.openaiApiKey.substring(config.openaiApiKey.length - 4);
      openaiConfig = {
        configured: true,
        apiKeyPreview: maskedKey
      };
    }
    
    // Prepara resposta com informações de StackSpot
    let stackspotConfig: any = {
      configured: false,
      clientIdPreview: null,
      realm: 'stackspot-freemium'
    };
    
    if (config?.stackspotClientId && config?.stackspotClientSecret) {
      const maskedClientId = config.stackspotClientId.substring(0, 8) + '...' + config.stackspotClientId.substring(config.stackspotClientId.length - 4);
      stackspotConfig = {
        configured: true,
        clientIdPreview: maskedClientId,
        realm: config.stackspotRealm || 'stackspot-freemium'
      };
    }
    
    // Retorna formato completo esperado pelo frontend
    res.json({
      llmProvider: config?.llmProvider || 'openai',
      openai: openaiConfig,
      stackspot: stackspotConfig,
      port: config?.port || 3000,
      lastUpdated: config?.lastUpdated || null
    });
  } catch (error: any) {
    console.error('Erro ao obter configuração:', error);
    res.status(500).json({ error: 'Erro ao obter configuração' });
  }
});

/**
 * API: Salva configuração (suporta OpenAI e StackSpot)
 */
app.post('/api/config', async (req, res) => {
  try {
    const { llmProvider, openaiApiKey, stackspotClientId, stackspotClientSecret, stackspotRealm, port } = req.body;
    
    // Valida provider
    if (!llmProvider || (llmProvider !== 'openai' && llmProvider !== 'stackspot')) {
      return res.status(400).json({ error: 'Provider deve ser "openai" ou "stackspot"' });
    }
    
    // Valida credenciais baseado no provider
    if (llmProvider === 'openai') {
      if (!openaiApiKey || typeof openaiApiKey !== 'string' || openaiApiKey.trim() === '') {
        return res.status(400).json({ error: 'OpenAI API key é obrigatória' });
      }
      if (!openaiApiKey.startsWith('sk-')) {
        return res.status(400).json({ error: 'OpenAI API key inválida. Deve começar com "sk-"' });
      }
    } else if (llmProvider === 'stackspot') {
      if (!stackspotClientId || typeof stackspotClientId !== 'string' || stackspotClientId.trim() === '') {
        return res.status(400).json({ error: 'StackSpot Client ID é obrigatório' });
      }
      if (!stackspotClientSecret || typeof stackspotClientSecret !== 'string' || stackspotClientSecret.trim() === '') {
        return res.status(400).json({ error: 'StackSpot Client Secret é obrigatório' });
      }
    }
    
    // Carrega configuração existente
    const existingConfig = loadConfigFromJson() || {};
    
    // Atualiza configuração
    const newConfig: AppConfig = {
      ...existingConfig,
      llmProvider: llmProvider as 'openai' | 'stackspot',
      port: port || existingConfig.port || 3000
    };
    
    // Adiciona credenciais do provider selecionado
    if (llmProvider === 'openai') {
      newConfig.openaiApiKey = openaiApiKey.trim();
      // Remove credenciais do StackSpot se estiver mudando de provider
      delete newConfig.stackspotClientId;
      delete newConfig.stackspotClientSecret;
      delete newConfig.stackspotRealm;
    } else if (llmProvider === 'stackspot') {
      newConfig.stackspotClientId = stackspotClientId.trim();
      newConfig.stackspotClientSecret = stackspotClientSecret.trim();
      newConfig.stackspotRealm = stackspotRealm?.trim() || 'stackspot-freemium';
      // Remove credenciais do OpenAI se estiver mudando de provider
      delete newConfig.openaiApiKey;
    }
    
    // Salva no config.json
    saveConfigToJson(newConfig);
    
    // Atualiza variáveis de ambiente
    if (llmProvider === 'openai') {
      process.env.OPENAI_API_KEY = newConfig.openaiApiKey!;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    
    if (newConfig.port) {
      process.env.PORT = newConfig.port.toString();
    }
    
    // Reinicializa adaptador LLM
    initializeLLMAdapter();
    
    // Recria AgentManager com novo adaptador LLM
    if (llmAdapter) {
      agentManager = new AgentManager(llmAdapter);
      // Reinicializa agentes com o novo adaptador
      initializeAgents().catch((err: any) => {
        console.error('❌ Erro ao reinicializar agentes:', err);
      });
      
      // Cria threads para sockets que estavam pendentes (sem credenciais)
      const currentAdapter = llmAdapter;
      if (currentAdapter) {
        io.sockets.sockets.forEach(async (socket) => {
          const connInfo = connectionsMap.get(socket.id);
          if (connInfo && connInfo.threadId === 'pending') {
            try {
              const thread = await currentAdapter.createThread();
              threadMap.set(socket.id, thread.id);
              connInfo.threadId = thread.id;
              connectionsMap.set(socket.id, connInfo);
              
              // Emite mensagem de sucesso
              const providerName = llmProvider === 'openai' ? 'OpenAI' : 'StackSpot';
              socket.emit('config_saved', {
                type: 'config_saved',
                message: `✅ ${providerName} configurado com sucesso!`,
                details: 'Agora você pode usar o DelsucIA normalmente.',
                timestamp: new Date().toISOString()
              });
              
              console.log(`✅ Thread criada para socket pendente ${socket.id}: ${thread.id}`);
            } catch (error) {
              console.error(`❌ Erro ao criar thread para socket ${socket.id}:`, error);
            }
          }
        });
      }
    }
    
    // Prepara resposta com preview das credenciais
    let credentialPreview = '';
    if (llmProvider === 'openai') {
      credentialPreview = openaiApiKey.substring(0, 7) + '...' + openaiApiKey.substring(openaiApiKey.length - 4);
    } else {
      credentialPreview = stackspotClientId.substring(0, 8) + '...' + stackspotClientId.substring(stackspotClientId.length - 4);
    }
    
    res.json({
      success: true,
      message: 'Configuração salva com sucesso',
      credentialPreview: credentialPreview,
      lastUpdated: newConfig.lastUpdated
    });
  } catch (error: any) {
    console.error('Erro ao salvar configuração:', error);
    res.status(500).json({ error: 'Erro ao salvar configuração: ' + error.message });
  }
});

// ============================================================================
// CONFIGURAÇÃO DO SOCKET.IO
// ============================================================================

/**
 * Configuração de conexões Socket.IO
 * 
 * Cada cliente conectado recebe:
 * - Uma nova thread do Assistants API
 * - Capacidade de enviar mensagens e receber respostas
 * - Feedback em tempo real sobre ações do agente
 */
/**
 * Função helper para emitir eventos para monitores de uma conexão específica
 */
function emitToMonitors(targetSocketId: string, event: string, data: any) {
  // Emite apenas para sockets que estão monitorando esta conexão específica
  let emittedCount = 0;
  monitoringSockets.forEach((monitoredSocketId, monitorSocketId) => {
    if (monitoredSocketId === targetSocketId) {
      const monitorSocket = io.sockets.sockets.get(monitorSocketId);
      if (monitorSocket) {
        monitorSocket.emit('monitored_event', {
          targetSocketId,
          event,
          data,
          timestamp: new Date().toISOString()
        });
        emittedCount++;
        console.log(`📡 Evento '${event}' emitido para monitor ${monitorSocketId} (monitorando ${targetSocketId})`);
      }
    }
  });
  if (emittedCount === 0 && monitoringSockets.size > 0) {
    console.log(`⚠️ Evento '${event}' não foi emitido para nenhum monitor (target: ${targetSocketId}, monitores ativos: ${monitoringSockets.size})`);
  }
}

io.on('connection', async (socket: Socket) => {
  console.log('Cliente conectado:', socket.id);

  try {
    // Verifica se llmAdapter está configurado
    if (!llmAdapter) {
      const config = loadConfigFromJson();
      const provider = config?.llmProvider || 'openai';
      const providerName = provider === 'openai' ? 'OpenAI' : 'StackSpot';
      
      // Emite mensagem especial para o chat quando provider não está configurado
      socket.emit('config_required', {
        type: 'config_required',
        message: `⚠️ ${providerName} não configurado`,
        details: `Para usar o DelsucIA, você precisa configurar suas credenciais do ${providerName}.`,
        action: 'Clique no botão "⚙️ Config" no topo da página para configurar.',
        timestamp: new Date().toISOString()
      });
      
      // Salva conexão sem thread (será criada quando provider for configurado)
      const connectionInfo: ConnectionInfo = {
        socketId: socket.id,
        threadId: 'pending',
        connectedAt: new Date(),
        lastActivity: new Date(),
        messageCount: 0,
        userAgent: socket.handshake.headers['user-agent'],
        ipAddress: socket.handshake.address || socket.request.socket.remoteAddress
      };
      connectionsMap.set(socket.id, connectionInfo);
      
      // Log de conexão sem API key
      saveLogToJson({
        type: 'connection',
        socketId: socket.id,
        metadata: {
          userAgent: connectionInfo.userAgent,
          ipAddress: connectionInfo.ipAddress,
          connectedAt: connectionInfo.connectedAt.toISOString(),
          apiKeyMissing: true
        }
      });
      
      return;
    }

    // Verifica se o cliente enviou um threadId para reutilizar (reconexão)
    let threadId: string | null = null;
    let awaitingRestore = true; // Flag para indicar que estamos aguardando restore_thread
    let timeoutHandle: NodeJS.Timeout | null = null; // Handle do setTimeout para poder cancelá-lo
    
    socket.on('restore_thread', async (data: { threadId?: string }) => {
      awaitingRestore = false; // Marca que não estamos mais aguardando
      console.log(`📥 restore_thread recebido para socket ${socket.id}, threadId: ${data.threadId || 'nenhum'}`);
      
      // Cancela o setTimeout se ainda não foi executado
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
        console.log(`🚫 Cancelando setTimeout de criação de thread para socket ${socket.id}`);
      }
      
      if (data.threadId && llmAdapter) {
        const existingThreadId = threadMap.get(socket.id);
        
        // Se já existe a mesma thread, apenas reenvia as mensagens salvas
        if (existingThreadId && existingThreadId === data.threadId) {
          console.log(`♻️ Thread já restaurada para socket ${socket.id}: ${data.threadId}, reenviando mensagens...`);
          const savedConversation = loadConversation(data.threadId);
          if (savedConversation && savedConversation.messages && savedConversation.messages.length > 0) {
            console.log(`📚 Reenviando ${savedConversation.messages.length} mensagem(ns) salva(s) para thread ${data.threadId}`);
            // Usa setTimeout para garantir que o evento seja enviado após o socket estar totalmente conectado
            setTimeout(() => {
              socket.emit('load_conversation', {
                messages: savedConversation.messages
              });
            }, 50);
          } else {
            console.log(`⚠️ Nenhuma mensagem encontrada para thread ${data.threadId}`);
          }
          socket.emit('thread_restored', { threadId: data.threadId });
          return;
        }

        try {
          // Verifica se a thread ainda existe
          if (!llmAdapter) {
            throw new Error('LLM adapter não configurado');
          }
          await llmAdapter.retrieveThread(data.threadId);
          threadId = data.threadId;
          
          // IMPORTANTE: Adiciona ao threadMap ANTES de qualquer outra coisa
          // para evitar que o setTimeout crie uma thread duplicada
          threadMap.set(socket.id, threadId);
          console.log(`♻️ Thread reutilizada para socket ${socket.id}: ${threadId} (adicionada ao map)`);
          
          // Carrega conversa salva
          const savedConversation = loadConversation(threadId);
          if (savedConversation && savedConversation.messages && savedConversation.messages.length > 0) {
            console.log(`📚 Carregando ${savedConversation.messages.length} mensagem(ns) salva(s) para thread ${threadId}`);
            // Usa setTimeout para garantir que o evento seja enviado após o socket estar totalmente conectado
            setTimeout(() => {
              socket.emit('load_conversation', {
                messages: savedConversation.messages
              });
            }, 50);
          } else {
            console.log(`⚠️ Nenhuma mensagem encontrada para thread ${threadId}`);
          }
          
          // Atualiza informações da conexão
          const connectionInfo: ConnectionInfo = {
            socketId: socket.id,
            threadId: threadId,
            connectedAt: new Date(),
            lastActivity: new Date(),
            messageCount: savedConversation?.messages.filter(m => m.role === 'user').length || 0,
            userAgent: socket.handshake.headers['user-agent'],
            ipAddress: socket.handshake.address || socket.request.socket.remoteAddress
          };
          connectionsMap.set(socket.id, connectionInfo);
          
          socket.emit('thread_restored', { threadId: threadId });
          return;
        } catch (error) {
          console.log(`⚠️ Thread ${data.threadId} não encontrada ou inválida, criando nova...`);
        }
      }
      
      // Se não conseguiu reutilizar, verifica se já existe uma thread no threadMap
      // (pode ter sido criada pelo setTimeout)
      const existingThreadInMap = threadMap.get(socket.id);
      if (!threadId && !existingThreadInMap) {
        // Só cria nova thread se realmente não há nenhuma thread no map
        console.log(`⚠️ Nenhuma thread válida encontrada no restore_thread, mas não criando aqui - aguardando timeout do servidor...`);
        // Não cria thread aqui, deixa o setTimeout fazer isso se necessário
      } else if (existingThreadInMap && !threadId) {
        // Thread já existe no map mas não foi definida aqui (foi criada pelo setTimeout)
        console.log(`ℹ️ Thread ${existingThreadInMap} já existe no map para socket ${socket.id}, não criando nova`);
      }
      
      // Marca que não estamos mais aguardando (mesmo se não conseguiu restaurar)
      awaitingRestore = false;
    });
    
    // Função auxiliar para criar nova thread
    async function createNewThread() {
      if (!llmAdapter) return;
      
      const thread = await llmAdapter.createThread();
      threadId = thread.id;
      threadMap.set(socket.id, threadId);
      console.log('Thread criada para socket', socket.id, ':', threadId);

      // Carrega conversa salva se existir (pode não existir para thread nova)
      const savedConversation = loadConversation(threadId);
      if (savedConversation && savedConversation.messages && savedConversation.messages.length > 0) {
        console.log(`📚 Carregando ${savedConversation.messages.length} mensagem(ns) salva(s) para thread ${threadId}`);
        // Usa setTimeout para garantir que o evento seja enviado após o socket estar totalmente conectado
        setTimeout(() => {
          socket.emit('load_conversation', {
            messages: savedConversation.messages
          });
        }, 50);
      }
      
      // Emite threadId para o frontend salvar no localStorage
      socket.emit('thread_created', { threadId: threadId });
      
      // Registra informações da conexão após criar thread
      const connectionInfo: ConnectionInfo = {
        socketId: socket.id,
        threadId: threadId,
        connectedAt: new Date(),
        lastActivity: new Date(),
        messageCount: 0,
        userAgent: socket.handshake.headers['user-agent'],
        ipAddress: socket.handshake.address || socket.request.socket.remoteAddress
      };
      connectionsMap.set(socket.id, connectionInfo);
      
      // Notifica monitores sobre nova conexão
      emitToMonitors(socket.id, 'connection', {
        socketId: connectionInfo.socketId,
        threadId: connectionInfo.threadId,
        connectedAt: connectionInfo.connectedAt.toISOString(),
        lastActivity: connectionInfo.lastActivity.toISOString(),
        messageCount: connectionInfo.messageCount,
        userAgent: connectionInfo.userAgent,
        ipAddress: connectionInfo.ipAddress
      });
      
      // Log de conexão nova
      saveLogToJson({
        type: 'connection',
        socketId: socket.id,
        threadId: threadId,
        metadata: {
          userAgent: connectionInfo.userAgent,
          ipAddress: connectionInfo.ipAddress,
          restored: false
        }
      });
    }
    
    // Aguarda um pouco para receber o evento restore_thread, depois cria nova se necessário
    timeoutHandle = setTimeout(async () => {
      // Verifica novamente se threadId foi definido (pode ter sido restaurado no handler acima)
      const currentThreadId = threadMap.get(socket.id);
      
      // Se ainda estamos aguardando restore_thread e não há thread, aguarda mais um pouco
      if (awaitingRestore && !currentThreadId) {
        console.log(`⏳ Ainda aguardando restore_thread para socket ${socket.id}, aguardando mais 200ms...`);
        setTimeout(async () => {
          const finalThreadId = threadMap.get(socket.id);
          if (!finalThreadId && llmAdapter) {
            console.log(`⚠️ Nenhuma thread encontrada para socket ${socket.id} após aguardar restore_thread, criando nova...`);
            await createNewThread();
            
            // Registra informações da conexão após criar thread
            const newThreadId = threadMap.get(socket.id);
            if (newThreadId) {
              const connectionInfo: ConnectionInfo = {
                socketId: socket.id,
                threadId: newThreadId,
                connectedAt: new Date(),
                lastActivity: new Date(),
                messageCount: 0,
                userAgent: socket.handshake.headers['user-agent'],
                ipAddress: socket.handshake.address || socket.request.socket.remoteAddress
              };
              connectionsMap.set(socket.id, connectionInfo);
            }
          } else {
            console.log(`✅ Thread ${finalThreadId} foi restaurada para socket ${socket.id} durante a espera`);
          }
        }, 200);
        return;
      }
      
      // Se não está aguardando restore_thread mas não há thread, cria nova
      // IMPORTANTE: Verifica novamente o threadMap aqui porque pode ter sido atualizado após o restore_thread
      const finalCheckThreadId = threadMap.get(socket.id);
      
      if (!finalCheckThreadId && llmAdapter && !awaitingRestore) {
        console.log(`⚠️ Nenhuma thread encontrada para socket ${socket.id} após restore_thread, criando nova...`);
        await createNewThread();
        
        // Registra informações da conexão após criar thread
        const newThreadId = threadMap.get(socket.id);
        if (newThreadId) {
          const connectionInfo: ConnectionInfo = {
            socketId: socket.id,
            threadId: newThreadId,
            connectedAt: new Date(),
            lastActivity: new Date(),
            messageCount: 0,
            userAgent: socket.handshake.headers['user-agent'],
            ipAddress: socket.handshake.address || socket.request.socket.remoteAddress
          };
          connectionsMap.set(socket.id, connectionInfo);
        }
      } else if (finalCheckThreadId) {
        console.log(`✅ Thread ${finalCheckThreadId} já existe para socket ${socket.id} (foi restaurada ou criada), não criando nova`);
      } else if (awaitingRestore) {
        console.log(`⏳ Ainda aguardando restore_thread para socket ${socket.id}...`);
      }
      
      // Marca o timeout como executado
      timeoutHandle = null;
    }, 500); // Aumentado para 500ms para dar mais tempo ao restore_thread


    // Notifica monitores será feito quando connectionInfo for criado
    // (será feito dentro de createNewThread ou restore_thread)

    // Handler para iniciar monitoramento de uma conexão
    socket.on('start_monitoring', (data: { targetSocketId: string }) => {
      const targetSocket = io.sockets.sockets.get(data.targetSocketId);
      if (targetSocket) {
        monitoringSockets.set(socket.id, data.targetSocketId);
        socket.emit('monitoring_started', {
          targetSocketId: data.targetSocketId,
          message: 'Monitoramento iniciado'
        });
        console.log(`Socket ${socket.id} começou a monitorar ${data.targetSocketId}`);
        
        // Envia informações da conexão atual
        const connInfo = connectionsMap.get(data.targetSocketId);
        if (connInfo) {
          socket.emit('monitored_event', {
            targetSocketId: data.targetSocketId,
            event: 'connection_info',
            data: {
              socketId: connInfo.socketId,
              threadId: connInfo.threadId,
              connectedAt: connInfo.connectedAt.toISOString(),
              lastActivity: connInfo.lastActivity.toISOString(),
              messageCount: connInfo.messageCount,
              userAgent: connInfo.userAgent,
              ipAddress: connInfo.ipAddress
            },
            timestamp: new Date().toISOString()
          });
        }
      } else {
        socket.emit('monitoring_error', {
          message: 'Conexão alvo não encontrada'
        });
      }
    });

    // Handler para parar monitoramento
    socket.on('stop_monitoring', () => {
      monitoringSockets.delete(socket.id);
      socket.emit('monitoring_stopped', {
        message: 'Monitoramento parado'
      });
      console.log(`Socket ${socket.id} parou de monitorar`);
    });

    // Handler para limpar conversa
    socket.on('clear_conversation', async () => {
      const oldThreadId = threadMap.get(socket.id);
      
      if (!openai) {
        socket.emit('error', {
          message: 'OpenAI não configurado'
        });
        return;
      }

      try {
        // Limpa a conversa antiga do JSON se existir
        // Passa tanto threadId quanto socketId para garantir que encontre a conversa
        if (oldThreadId) {
          clearConversation(oldThreadId, socket.id);
          console.log(`🗑️ Limpando conversa para thread ${oldThreadId} e socket ${socket.id}`);
        } else {
          // Mesmo sem threadId, tenta limpar por socketId
          console.log(`⚠️ Nenhum threadId encontrado no map, tentando limpar por socketId ${socket.id}`);
          clearConversation('', socket.id);
        }

        // Cria uma nova thread
        if (!llmAdapter) {
          throw new Error('LLM adapter não configurado');
        }
        const newThread = await llmAdapter.createThread();
        const newThreadId = newThread.id;
        
        // Atualiza o threadMap com a nova thread
        threadMap.set(socket.id, newThreadId);
        console.log(`🆕 Nova thread criada após limpar conversa: ${newThreadId} (socket: ${socket.id})`);

        // Atualiza informações da conexão
        const connectionInfo: ConnectionInfo = {
          socketId: socket.id,
          threadId: newThreadId,
          connectedAt: new Date(),
          lastActivity: new Date(),
          messageCount: 0,
          userAgent: socket.handshake.headers['user-agent'],
          ipAddress: socket.handshake.address || socket.request.socket.remoteAddress
        };
        connectionsMap.set(socket.id, connectionInfo);

        // Emite eventos para o frontend
        socket.emit('conversation_cleared', {
          message: 'Conversa limpa com sucesso',
          newThreadId: newThreadId
        });
        
        // Emite novo threadId para salvar no localStorage
        socket.emit('thread_created', { threadId: newThreadId });

        // Log de limpeza e criação de nova thread
        saveLogToJson({
          type: 'connection',
          socketId: socket.id,
          threadId: newThreadId,
          metadata: {
            action: 'conversation_cleared',
            oldThreadId: oldThreadId,
            newThreadId: newThreadId
          }
        });
      } catch (error: any) {
        console.error('Erro ao limpar conversa e criar nova thread:', error);
        socket.emit('error', {
          message: 'Erro ao limpar conversa'
        });
      }
    });

    /**
     * Handler para mensagens do cliente
     * 
     * Processa a mensagem do usuário:
     * 1. Seleciona o agente apropriado
     * 2. Adiciona a mensagem à thread
     * 3. Cria um run para processar a mensagem
     * 4. Aguarda a conclusão e retorna a resposta
     */
    socket.on('message', async (data: { message: string }) => {
      console.log('Mensagem recebida:', data.message);

      // Verifica se llmAdapter está configurado
      if (!llmAdapter) {
        // Emite mensagem especial para o chat
        socket.emit('config_required', {
          type: 'config_required',
          message: '⚠️ LLM Provider não configurado',
          details: 'Para usar o DelsucIA, você precisa configurar um LLM Provider (OpenAI ou StackSpot).',
          action: 'Clique no botão "⚙️ Config" no topo da página para configurar.',
          timestamp: new Date().toISOString()
        });
        return;
      }

      let threadId = threadMap.get(socket.id);
      
      // Se não há thread, cria uma nova automaticamente
      if (!threadId) {
        if (!llmAdapter) {
          socket.emit('error', {
            message: 'LLM adapter não configurado. Configure o provider primeiro.'
          });
          return;
        }
        
        console.log(`⚠️ Thread não encontrada para socket ${socket.id}, criando nova automaticamente...`);
        try {
          const newThread = await llmAdapter.createThread();
          threadId = newThread.id;
          threadMap.set(socket.id, threadId);
          
          // Registra informações da conexão
          const connectionInfo: ConnectionInfo = {
            socketId: socket.id,
            threadId: threadId,
            connectedAt: new Date(),
            lastActivity: new Date(),
            messageCount: 0,
            userAgent: socket.handshake.headers['user-agent'],
            ipAddress: socket.handshake.address || socket.request.socket.remoteAddress
          };
          connectionsMap.set(socket.id, connectionInfo);
          
          // Emite threadId para o frontend salvar no localStorage
          socket.emit('thread_created', { threadId: threadId });
          
          console.log(`✅ Thread criada automaticamente para socket ${socket.id}: ${threadId}`);
        } catch (error: any) {
          console.error(`❌ Erro ao criar thread automaticamente:`, error);
          socket.emit('error', {
            message: `Erro ao criar thread: ${error.message}`
          });
          return;
        }
      }

      // Atualiza atividade da conexão
      const connInfo = connectionsMap.get(socket.id);
      if (connInfo) {
        connInfo.lastActivity = new Date();
        connInfo.messageCount++;
        connectionsMap.set(socket.id, connInfo);
      }

      try {
        console.log(`📤 Mensagem recebida: "${data.message}"`);
        
        // Detecta se o usuário está pedindo para ler um arquivo
        // Padrões: "ler arquivo X", "leia X", "o que tem em X", "conteúdo de X", "dados de X", "quais dados tem em X", etc.
        const filePathPattern = /(?:ler|leia|read|conteúdo|conteudo|dados|o que tem|quais dados|mostre|mostrar|exiba|exibir|abrir|abre)\s+(?:o\s+)?(?:arquivo\s+)?([A-Za-z]:[\\\/][^\s]+|\.\.?[\\\/][^\s]+|[^\s]+\.[a-zA-Z0-9]+)/i;
        const filePathMatch = data.message.match(filePathPattern);
        
        let enhancedMessage = data.message;
        let fileContent = '';
        
        // Se detectou um caminho de arquivo, tenta ler automaticamente
        if (filePathMatch && filePathMatch[1]) {
          const detectedFilePath = filePathMatch[1].trim();
          console.log(`📂 Detectado pedido de leitura de arquivo: ${detectedFilePath}`);
          
          try {
            fileContent = await fileSystemFunctions.readFile(detectedFilePath);
            console.log(`✅ Arquivo lido com sucesso (${fileContent.length} caracteres)`);
            
            // Adiciona o conteúdo do arquivo à mensagem para o agente
            enhancedMessage = `${data.message}\n\n[Conteúdo do arquivo ${detectedFilePath}]:\n${fileContent}`;
          } catch (error: any) {
            console.log(`⚠️ Erro ao ler arquivo automaticamente: ${error.message}`);
            // Continua com a mensagem original se não conseguir ler
          }
        }
        
        console.log(`🔍 Analisando mensagem para selecionar agente...`);

        // Seleciona o agente apropriado para a mensagem
        if (!agentManager) {
          throw new Error('AgentManager não está configurado');
        }
        const { agentId, config } = await agentManager.getAgentForMessage(data.message);
        
        // Notifica o cliente sobre qual agente está sendo usado
        const agentSelectedData = {
          agentName: config.name,
          description: config.description
        };
        socket.emit('agent_selected', agentSelectedData);
        emitToMonitors(socket.id, 'agent_selected', agentSelectedData);

        console.log(`✅ Agente selecionado: "${config.name}" (ID: ${agentId})`);

        // Log de seleção de agente
        saveLogToJson({
          type: 'agent_selection',
          socketId: socket.id,
          threadId: threadId,
          agentName: config.name,
          agentId: agentId,
          message: data.message
        });

        // Adiciona mensagem do usuário à thread (usa enhancedMessage se arquivo foi lido)
        console.log(`📝 Adicionando mensagem à thread...`);

        if (!llmAdapter) {
          throw new Error('LLM adapter não configurado');
        }
        const userMessage = await llmAdapter.addMessage(threadId, 'user', enhancedMessage);

        // Emite a mensagem do usuário de volta para o cliente
        const userMessageData = {
          type: 'user',
          message: data.message,
          messageId: userMessage.id,
          details: {
            threadId,
            role: 'user',
            createdAt: userMessage.created_at
          }
        };
        socket.emit('agent_message', userMessageData);
        emitToMonitors(socket.id, 'agent_message', userMessageData);
        
        // Se um arquivo foi lido, notifica o cliente
        if (fileContent && filePathMatch) {
          socket.emit('file_read', {
            filePath: filePathMatch[1],
            content: fileContent.substring(0, 500) + (fileContent.length > 500 ? '...' : ''),
            fullLength: fileContent.length
          });
        }

        // Salva mensagem do usuário na conversa
        saveConversationMessage(threadId, socket.id, 'user', data.message);

        console.log(`✅ Mensagem adicionada à thread com sucesso (ID: ${userMessage.id})`);

        // Log de mensagem enviada
        saveLogToJson({
          type: 'message_sent',
          socketId: socket.id,
          threadId: threadId,
          message: data.message,
          agentName: config.name,
          metadata: {
            messageId: userMessage.id,
            createdAt: userMessage.created_at
          }
        });

        // Cria um run para processar a mensagem com o agente selecionado
        console.log(`🚀 Criando run para processar mensagem...`);

        if (!llmAdapter) {
          throw new Error('LLM adapter não configurado');
        }
        const run = await llmAdapter.createRun(threadId, agentId);

        console.log(`✅ Run criado: ${run.id} (Status: ${run.status})`);

        // Log de criação de run
        saveLogToJson({
          type: 'run_status',
          socketId: socket.id,
          threadId: threadId,
          runId: run.id,
          agentName: config.name,
          status: run.status,
          metadata: {
            assistantId: agentId
          }
        });

        // Aguarda a conclusão do run e processa ações necessárias
        const { message: responseMessage, tokenUsage } = await llmAdapter.waitForRunCompletion(threadId, run.id, socket);

        console.log(`✅ Run concluído com sucesso`);

        // Obtém tokens acumulados totais da thread (todas as mensagens)
        const threadTokens = threadTokensMap.get(threadId) || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

        // Envia resposta final de volta para o cliente com informações de tokens
        const responseData = {
          message: responseMessage,
          originalMessage: data.message,
          agentName: config.name,
          tokenUsage: {
            // Tokens desta mensagem específica
            promptTokens: tokenUsage.promptTokens,
            completionTokens: tokenUsage.completionTokens,
            totalTokens: tokenUsage.totalTokens
          },
          accumulatedTokenUsage: {
            // Total acumulado de todas as mensagens na thread
            promptTokens: threadTokens.promptTokens,
            completionTokens: threadTokens.completionTokens,
            totalTokens: threadTokens.totalTokens
          }
        };
        socket.emit('response', responseData);
        emitToMonitors(socket.id, 'response', responseData);

        console.log(`Resposta enviada pelo agente "${config.name}":`, responseMessage);
        console.log(`💰 Tokens desta mensagem: ${tokenUsage.totalTokens} (prompt: ${tokenUsage.promptTokens}, completion: ${tokenUsage.completionTokens})`);
        console.log(`💰 Total acumulado na thread: ${threadTokens.totalTokens} (prompt: ${threadTokens.promptTokens}, completion: ${threadTokens.completionTokens})`);

        // Salva mensagem do assistente na conversa
        saveConversationMessage(
          threadId,
          socket.id,
          'assistant',
          responseMessage,
          config.name,
          tokenUsage
        );

        // Salva tokens em arquivo JSON
        saveTokensToJson(
          threadId,
          config.name,
          data.message,
          tokenUsage,
          threadTokens,
          config.model
        );

        // Calcula custos para os logs
        const tokenCost = calculateTokenCost(tokenUsage, config.model);
        const accumulatedTokenCost = calculateTokenCost(threadTokens, config.model);

        // Log de resposta
        saveLogToJson({
          type: 'response',
          socketId: socket.id,
          threadId: threadId,
          runId: run.id,
          agentName: config.name,
          agentId: agentId,
          message: data.message,
          response: responseMessage,
          tokenUsage: tokenUsage,
          accumulatedTokenUsage: threadTokens,
          tokenCost: tokenCost,
          accumulatedTokenCost: accumulatedTokenCost,
          metadata: {
            responseLength: responseMessage.length,
            model: config.model
          }
        });

        // Log de uso de tokens
        saveLogToJson({
          type: 'token_usage',
          socketId: socket.id,
          threadId: threadId,
          runId: run.id,
          agentName: config.name,
          tokenUsage: tokenUsage,
          accumulatedTokenUsage: threadTokens,
          tokenCost: tokenCost,
          accumulatedTokenCost: accumulatedTokenCost,
          metadata: {
            model: config.model
          }
        });
      } catch (error: any) {
        console.error('Erro ao processar mensagem:', error);
        
        // Log de erro
        const errorThreadId = threadMap.get(socket.id);
        saveLogToJson({
          type: 'error',
          socketId: socket.id,
          threadId: errorThreadId,
          error: error.message || 'Erro desconhecido',
          errorStack: error.stack,
          metadata: {
            errorName: error.name,
            errorType: 'message_processing'
          }
        });
        
        socket.emit('error', {
          message: error.message || 'Erro ao processar sua mensagem. Por favor, tente novamente.'
        });
      }
    });

    /**
     * Handler para desconexão do cliente
     * 
     * Limpa a thread associada ao socket quando o cliente desconecta
     */
    socket.on('disconnect', async () => {
      console.log('Cliente desconectado:', socket.id);
      
      const disconnectThreadId = threadMap.get(socket.id);
      const connInfo = connectionsMap.get(socket.id);
      
      // Log de desconexão
      saveLogToJson({
        type: 'disconnection',
        socketId: socket.id,
        threadId: disconnectThreadId,
        metadata: {
          messageCount: connInfo?.messageCount || 0,
          connectedAt: connInfo?.connectedAt.toISOString(),
          lastActivity: connInfo?.lastActivity.toISOString()
        }
      });
      
      // Notifica monitores sobre desconexão
      emitToMonitors(socket.id, 'disconnect', { socketId: socket.id });
      
      // Remove dos monitores se estava monitorando
      monitoringSockets.delete(socket.id);
      
      // Remove monitores que estavam monitorando este socket
      const monitorsToRemove: string[] = [];
      monitoringSockets.forEach((targetId, monitorId) => {
        if (targetId === socket.id) {
          monitorsToRemove.push(monitorId);
        }
      });
      monitorsToRemove.forEach(monitorId => {
        const monitorSocket = io.sockets.sockets.get(monitorId);
        if (monitorSocket) {
          monitorSocket.emit('monitored_event', {
            targetSocketId: socket.id,
            event: 'disconnect',
            data: { socketId: socket.id },
            timestamp: new Date().toISOString()
          });
        }
        monitoringSockets.delete(monitorId);
      });
      
      if (disconnectThreadId) {
        threadMap.delete(socket.id);
        // Limpa tokens acumulados da thread
        threadTokensMap.delete(disconnectThreadId);
        // Opcionalmente, você pode deletar a thread aqui
        // await openai.beta.threads.del(threadId);
        console.log('Thread removida para socket:', socket.id);
      }
      
      // Remove da lista de conexões
      connectionsMap.delete(socket.id);
    });
  } catch (error: any) {
    console.error('Erro ao configurar conexão:', error);
    
    // Detecta erro de autenticação (API key incorreta)
    const isAuthError = error?.status === 401 || 
                       error?.code === 'invalid_api_key' ||
                       error?.message?.toLowerCase().includes('incorrect api key') ||
                       error?.message?.toLowerCase().includes('invalid api key') ||
                       error?.error?.type === 'invalid_request_error' ||
                       error?.error?.code === 'invalid_api_key';
    
    if (isAuthError) {
      // Emite mensagem especial para o chat sobre API key incorreta
      socket.emit('api_key_invalid', {
        type: 'api_key_invalid',
        message: '❌ API Key inválida ou incorreta',
        details: 'A API Key configurada está incorreta ou inválida. Por favor, verifique sua API Key.',
        action: 'Clique no botão "⚙️ Config" no topo da página para configurar uma API Key válida.',
        errorMessage: error?.error?.message || error?.message || 'API key inválida',
        timestamp: new Date().toISOString()
      });
      
      // Log de erro de autenticação
      saveLogToJson({
        type: 'error',
        socketId: socket.id,
        error: error?.error?.message || error?.message || 'API key inválida',
        errorStack: error.stack,
        metadata: {
          errorName: error.name || 'AuthenticationError',
          errorType: 'api_key_invalid',
          statusCode: error?.status || 401,
          errorCode: error?.code || error?.error?.code || 'invalid_api_key'
        }
      });
    } else {
      // Log de erro genérico na conexão
      saveLogToJson({
        type: 'error',
        socketId: socket.id,
        error: error.message || 'Erro desconhecido ao configurar conexão',
        errorStack: error.stack,
        metadata: {
          errorName: error.name,
          errorType: 'connection_setup'
        }
      });
      
      socket.emit('error', {
        message: 'Erro ao inicializar assistente. Tente novamente.'
      });
    }
  }
});

// ============================================================================
// GERENCIAMENTO DE SHUTDOWN
// ============================================================================

const isNodemon = isRunningUnderNodemon();
const shutdownConfig = getShutdownConfig(isNodemon);

/**
 * Handler para shutdown graceful do servidor
 * 
 * @param {string} signal - Sinal recebido (SIGTERM, SIGINT, etc.)
 */
async function handleShutdown(signal: string): Promise<void> {
  console.log(`\n${signal} recebido. Fechando servidor...`);
  
  await performGracefulShutdown(httpServer, io, shutdownConfig);
  
  process.exit(isNodemon && signal === 'SIGTERM' ? 0 : 1);
}

// Configura handlers para sinais de encerramento
if (isNodemon) {
  process.on('SIGTERM', () => {
    console.log('🔄 Reiniciando servidor (nodemon)...');
    handleShutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    console.log('🛑 Parando servidor (Ctrl+C)...');
    handleShutdown('SIGINT');
  });
} else {
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

// Handlers para erros não tratados
process.on('uncaughtException', (err) => {
  console.error('Erro não tratado:', err);
  handleShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promessa rejeitada não tratada:', reason);
  handleShutdown('unhandledRejection');
});

// ============================================================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================================================

let isStarting = false;

/**
 * Inicia o servidor HTTP com retry automático em caso de porta ocupada
 * 
 * @param {number} retries - Número de tentativas restantes
 * @param {number} delay - Delay entre tentativas em milissegundos
 * @returns {Promise<void>} Promise que resolve quando o servidor iniciar
 */
async function startServer(retries = 5, delay = isNodemon ? 3000 : 2000): Promise<void> {
  if (isStarting) {
    console.log('⏳ Servidor já está iniciando, aguardando...');
    return;
  }

  isStarting = true;

  return new Promise((resolve, reject) => {
    // Se o servidor já está escutando, fecha primeiro
    if (httpServer.listening) {
      console.log('🔄 Fechando instância anterior do servidor...');
      httpServer.close(() => {
        console.log('✅ Instância anterior fechada. Aguardando liberação da porta...');
        setTimeout(() => {
          startNewServer();
        }, isNodemon ? 500 : 1000);
      });
    } else {
      startNewServer();
    }

    function startNewServer() {
      httpServer.listen(PORT, () => {
        console.log(`✅ Servidor rodando na porta ${PORT}`);
        console.log(`🌐 Acesse http://localhost:${PORT} para testar`);
        isStarting = false;
        resolve();
      });

      httpServer.on('error', async (err: NodeJS.ErrnoException) => {
        isStarting = false;
        
        if (err.code === 'EADDRINUSE') {
          console.error(`\n❌ Erro: A porta ${PORT} já está em uso.`);
          
          if (retries > 0) {
            console.log(`🔄 Tentando novamente em ${delay / 1000} segundos... (${retries} tentativas restantes)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return startServer(retries - 1, delay).then(resolve).catch(reject);
          }
          
          console.error(`\nPara resolver, você pode:`);
          console.error(`1. Parar o processo que está usando a porta ${PORT}:`);
          console.error(`   Windows: netstat -ano | findstr :${PORT} e depois taskkill /PID <PID> /F`);
          console.error(`   Linux/Mac: lsof -ti:${PORT} | xargs kill -9`);
          console.error(`2. Ou usar uma porta diferente definindo a variável PORT:`);
          console.error(`   Windows PowerShell: $env:PORT=3001; npm run dev`);
          console.error(`   Windows CMD: set PORT=3001 && npm run dev`);
          console.error(`   Linux/Mac: PORT=3001 npm run dev`);
          reject(err);
        } else {
          console.error(`\n❌ Erro ao iniciar o servidor:`, err);
          reject(err);
        }
      });
    }
  });
}

// Inicia o servidor
startServer().catch((err) => {
  console.error('Falha ao iniciar o servidor após várias tentativas:', err);
  process.exit(1);
});
