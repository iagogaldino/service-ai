/**
 * Validação de credenciais LLM
 */

import { AppConfig } from '../config/env';
import { LLMProvider } from '../types';

/**
 * Valida se as credenciais necessárias para o provider estão disponíveis
 */
export function validateLLMCredentials(
  provider: LLMProvider, 
  config: AppConfig | null
): { valid: boolean; error?: string } {
  if (!config) {
    return { valid: false, error: 'Configuração não encontrada' };
  }

  if (provider === 'openai') {
    if (!config.openaiApiKey || config.openaiApiKey.trim() === '') {
      return { valid: false, error: 'OpenAI API key não configurada' };
    }
    if (!config.openaiApiKey.startsWith('sk-')) {
      return { valid: false, error: 'OpenAI API key inválida (deve começar com "sk-")' };
    }
    return { valid: true };
  } else if (provider === 'stackspot') {
    if (!config.stackspotClientId || config.stackspotClientId.trim() === '') {
      return { valid: false, error: 'StackSpot Client ID não configurado' };
    }
    if (!config.stackspotClientSecret || config.stackspotClientSecret.trim() === '') {
      return { valid: false, error: 'StackSpot Client Secret não configurado' };
    }
    return { valid: true };
  }

  return { valid: false, error: `Provider "${provider}" não suportado` };
}

