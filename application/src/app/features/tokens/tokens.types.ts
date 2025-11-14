export type LlmProvider = 'stackspot' | 'openai';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TokenCost {
  promptCost: number;
  completionCost: number;
  totalCost: number;
}

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
  llmProvider?: LlmProvider;
}

export interface TokensResponse {
  totalTokens: TokenUsage;
  totalCost: TokenCost;
  entries: TokenHistoryEntry[];
  lastUpdated: string;
  filteredBy?: LlmProvider;
}

