/**
 * Serviço de gerenciamento de LLM
 */

import { LLMAdapter } from '../llm/adapters/LLMAdapter';
import { createLLMAdapter } from '../llm/LLMFactory';
import { loadConfigFromJson, saveConfigToJson, AppConfig } from '../config/env';
import { validateLLMCredentials } from '../validation/credentialValidator';
import { LLMProvider } from '../types';

let llmAdapter: LLMAdapter | undefined;

/**
 * Inicializa o adaptador de LLM baseado na configuração
 */
export function initializeLLMAdapter(): void {
  const config = loadConfigFromJson();
  const provider = config?.llmProvider || 'openai';

  const validation = validateLLMCredentials(provider, config);
  if (!validation.valid) {
    console.warn(`⚠️ Não foi possível inicializar adaptador ${provider}: ${validation.error}`);
    llmAdapter = undefined;
    return;
  }

  try {
    const llmConfig = {
      provider: provider as LLMProvider,
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
    console.log(`✅ Adaptador ${provider} inicializado com sucesso`);
  } catch (error: any) {
    console.error(`❌ Erro ao inicializar adaptador ${provider}:`, error.message);
    llmAdapter = undefined;
  }
}

/**
 * Obtém o adaptador LLM atual
 */
export function getLLMAdapter(): LLMAdapter | undefined {
  return llmAdapter;
}

/**
 * Obtém o LLM provider atual
 */
export function getCurrentLLMProvider(): LLMProvider {
  try {
    const config = loadConfigFromJson();
    return config?.llmProvider || 'openai';
  } catch (error) {
    console.warn('⚠️ Erro ao obter LLM provider, usando padrão (openai):', error);
    return 'openai';
  }
}

/**
 * Atualiza configuração e reinicializa o adaptador
 */
export function updateLLMConfig(newConfig: AppConfig): { success: boolean; error?: string } {
  const validation = validateLLMCredentials(
    newConfig.llmProvider || 'openai', 
    newConfig
  );
  
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  saveConfigToJson(newConfig);
  
  if (newConfig.llmProvider === 'openai' && newConfig.openaiApiKey) {
    process.env.OPENAI_API_KEY = newConfig.openaiApiKey;
  }
  
  if (newConfig.port) {
    process.env.PORT = newConfig.port.toString();
  }

  initializeLLMAdapter();

  if (!llmAdapter) {
    return { 
      success: false, 
      error: `Não foi possível inicializar o adaptador ${newConfig.llmProvider}. Verifique as credenciais.` 
    };
  }

  return { success: true };
}

