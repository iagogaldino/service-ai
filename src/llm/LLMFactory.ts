/**
 * Factory para criar adaptadores de LLM
 */

import { LLMAdapter } from './adapters/LLMAdapter';
import { OpenAIAdapter } from './adapters/OpenAIAdapter';
import { StackSpotAdapter, StackSpotConfig } from './adapters/StackSpotAdapter';

export type LLMProvider = 'openai' | 'stackspot';

export interface LLMConfig {
  provider: LLMProvider;
  openai?: {
    apiKey: string;
  };
  stackspot?: StackSpotConfig;
}

/**
 * Cria um adaptador de LLM baseado na configuração
 */
export function createLLMAdapter(config: LLMConfig): LLMAdapter {
  switch (config.provider) {
    case 'openai':
      if (!config.openai?.apiKey) {
        throw new Error('OpenAI API key é obrigatória quando provider é "openai"');
      }
      return new OpenAIAdapter(config.openai.apiKey);

    case 'stackspot':
      if (!config.stackspot?.clientId || !config.stackspot?.clientSecret) {
        throw new Error('StackSpot clientId e clientSecret são obrigatórios quando provider é "stackspot"');
      }
      return new StackSpotAdapter(config.stackspot);

    default:
      throw new Error(`Provider "${config.provider}" não suportado`);
  }
}
