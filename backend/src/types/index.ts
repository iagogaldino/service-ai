/**
 * Tipos e interfaces compartilhados
 */

export type LogType = 
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
  | 'monitoring'
  | 'agent_prompt';

export type LLMProvider = 'openai' | 'stackspot' | 'ollama';

/**
 * Interface para informações de uso de tokens
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Interface para custo em dólares
 */
export interface TokenCost {
  promptCost: number;
  completionCost: number;
  totalCost: number;
}

/**
 * Interface para entrada de log
 */
export interface LogEntry {
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
  llmProvider?: LLMProvider;
}

/**
 * Interface para o formato completo do arquivo JSON de logs
 */
export interface LogsJsonFile {
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
 * Interface para entrada de histórico de tokens no JSON
 */
export interface TokenHistoryEntry {
  threadId: string;
  timestamp: string;
  agentName: string;
  message: string;
  tokenUsage: TokenUsage;
  accumulatedTokenUsage: TokenUsage;
  cost?: TokenCost;
  accumulatedCost?: TokenCost;
  model?: string;
  llmProvider?: LLMProvider;
}

/**
 * Interface para o formato completo do arquivo JSON de tokens
 */
export interface TokensJsonFile {
  totalTokens: TokenUsage;
  totalCost: TokenCost;
  entries: TokenHistoryEntry[];
  lastUpdated: string;
}

/**
 * Interface para uma mensagem de conversa
 */
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  agentName?: string;
  tokenUsage?: TokenUsage;
  llmProvider?: LLMProvider;
}

/**
 * Interface para uma conversa (thread)
 */
export interface Conversation {
  threadId: string;
  socketId: string;
  createdAt: string;
  lastUpdated: string;
  messages: ConversationMessage[];
  llmProvider?: LLMProvider;
}

/**
 * Interface para o formato completo do arquivo JSON de conversas
 */
export interface ConversationsJsonFile {
  conversations: Conversation[];
  lastUpdated: string;
}

/**
 * Interface para informações de conexão
 */
export interface ConnectionInfo {
  socketId: string;
  threadId: string;
  connectedAt: Date;
  lastActivity: Date;
  messageCount: number;
  userAgent?: string;
  ipAddress?: string;
}

