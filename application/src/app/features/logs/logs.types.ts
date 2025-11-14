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
  | 'monitoring';

export type LlmProvider = 'stackspot' | 'openai';

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
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  tokenCost?: {
    promptCost: number;
    completionCost: number;
    totalCost: number;
  };
  metadata?: Record<string, any>;
  llmProvider?: LlmProvider;
}

export interface LogsResponse {
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
  filteredBy?: LlmProvider;
}

