/**
 * Utilitários para cálculo de tokens e custos
 */

import { TokenUsage, TokenCost } from '../types';

/**
 * Preços por modelo (por 1000 tokens) - atualizado em 2024
 */
export const MODEL_PRICING: Record<string, { prompt: number; completion: number }> = {
  'gpt-4-turbo-preview': { prompt: 0.01, completion: 0.03 },
  'gpt-4': { prompt: 0.03, completion: 0.06 },
  'gpt-4-32k': { prompt: 0.06, completion: 0.12 },
  'gpt-4-0125-preview': { prompt: 0.01, completion: 0.03 },
  'gpt-4-1106-preview': { prompt: 0.01, completion: 0.03 },
  'gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 },
  'gpt-3.5-turbo-16k': { prompt: 0.003, completion: 0.004 },
};

/**
 * Calcula o custo em dólares baseado nos tokens e modelo usado
 */
export function calculateTokenCost(
  tokenUsage: TokenUsage, 
  model: string = 'gpt-4-turbo-preview'
): TokenCost {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4-turbo-preview'];
  
  const promptCost = (tokenUsage.promptTokens / 1000) * pricing.prompt;
  const completionCost = (tokenUsage.completionTokens / 1000) * pricing.completion;
  const totalCost = promptCost + completionCost;
  
  return {
    promptCost: Math.round(promptCost * 10000) / 10000,
    completionCost: Math.round(completionCost * 10000) / 10000,
    totalCost: Math.round(totalCost * 10000) / 10000
  };
}

