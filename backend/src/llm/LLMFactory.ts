/**
 * Factory para criar adaptadores de LLM
 */

import { LLMAdapter } from './adapters/LLMAdapter';
import { OpenAIAdapter } from './adapters/OpenAIAdapter';
import { StackSpotAdapter, StackSpotConfig } from './adapters/StackSpotAdapter';
import { OllamaAdapter, OllamaConfig } from './adapters/OllamaAdapter';

export type LLMProvider = 'openai' | 'stackspot' | 'ollama';

export interface LLMConfig {
  provider: LLMProvider;
  openai?: {
    apiKey: string;
  };
  stackspot?: StackSpotConfig;
  ollama?: OllamaConfig;
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

    case 'ollama':
      return new OllamaAdapter(config.ollama);

    default:
      throw new Error(`Provider "${config.provider}" não suportado`);
  }
}
