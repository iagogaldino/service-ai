export type ChatMessageRole = 'user' | 'assistant' | 'system' | 'action';

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  sender: string;
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

