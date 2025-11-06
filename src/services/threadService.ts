/**
 * Serviço de gerenciamento de threads
 */

import { TokenUsage } from '../types';

// Armazena threads por socket ID (mapeia socket.id -> thread.id)
const threadMap = new Map<string, string>();

// Armazena tokens acumulados por thread
const threadTokensMap = new Map<string, TokenUsage>();

/**
 * Obtém o threadId de um socket
 */
export function getThreadId(socketId: string): string | undefined {
  return threadMap.get(socketId);
}

/**
 * Define o threadId para um socket
 */
export function setThreadId(socketId: string, threadId: string): void {
  threadMap.set(socketId, threadId);
}

/**
 * Remove o threadId de um socket
 */
export function removeThreadId(socketId: string): void {
  threadMap.delete(socketId);
}

/**
 * Obtém tokens acumulados de uma thread
 */
export function getThreadTokens(threadId: string): TokenUsage {
  return threadTokensMap.get(threadId) || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

/**
 * Atualiza tokens acumulados de uma thread
 */
export function updateThreadTokens(threadId: string, tokenUsage: TokenUsage): void {
  const current = getThreadTokens(threadId);
  threadTokensMap.set(threadId, {
    promptTokens: current.promptTokens + tokenUsage.promptTokens,
    completionTokens: current.completionTokens + tokenUsage.completionTokens,
    totalTokens: current.totalTokens + tokenUsage.totalTokens
  });
}

/**
 * Remove tokens de uma thread
 */
export function removeThreadTokens(threadId: string): void {
  threadTokensMap.delete(threadId);
}

/**
 * Limpa todos os dados de uma thread
 */
export function clearThread(socketId: string): void {
  const threadId = getThreadId(socketId);
  if (threadId) {
    removeThreadTokens(threadId);
  }
  removeThreadId(socketId);
}

