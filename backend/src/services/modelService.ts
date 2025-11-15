/**
 * Serviço para gerenciar modelos de LLM
 * Busca e armazena modelos disponíveis para cada provider
 */

import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';
import { loadConfigFromJson } from '../config/env';

export interface LLMModel {
  id: string;
  name: string;
  provider: 'openai' | 'stackspot' | 'ollama';
  description?: string;
  contextLength?: number;
  maxTokens?: number;
  supportsStreaming?: boolean;
  supportsTools?: boolean;
}

export interface ModelsDatabase {
  models: LLMModel[];
  lastUpdated: string;
  providers: {
    openai?: { lastFetched: string; count: number };
    stackspot?: { lastFetched: string; count: number };
    ollama?: { lastFetched: string; count: number };
  };
}

const MODELS_DB_PATH = path.join(process.cwd(), 'models.json');

/**
 * Cria estrutura vazia de banco de dados de modelos
 */
function createEmptyModelsDatabase(): ModelsDatabase {
  return {
    models: [],
    lastUpdated: new Date().toISOString(),
    providers: {}
  };
}

/**
 * Carrega banco de dados de modelos
 */
export function loadModelsDatabase(): ModelsDatabase {
  try {
    if (!fs.existsSync(MODELS_DB_PATH)) {
      const emptyDb = createEmptyModelsDatabase();
      saveModelsDatabase(emptyDb);
      return emptyDb;
    }

    const fileContent = fs.readFileSync(MODELS_DB_PATH, 'utf-8').trim();
    if (!fileContent) {
      return createEmptyModelsDatabase();
    }

    const db = JSON.parse(fileContent) as ModelsDatabase;
    if (!db.models || !Array.isArray(db.models)) {
      return createEmptyModelsDatabase();
    }

    return db;
  } catch (error: any) {
    console.error('❌ Erro ao carregar models.json:', error.message);
    return createEmptyModelsDatabase();
  }
}

/**
 * Salva banco de dados de modelos
 */
export function saveModelsDatabase(db: ModelsDatabase): void {
  try {
    db.lastUpdated = new Date().toISOString();
    fs.writeFileSync(MODELS_DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  } catch (error: any) {
    console.error('❌ Erro ao salvar models.json:', error.message);
    throw error;
  }
}

/**
 * Busca modelos do Ollama via API
 */
export async function fetchOllamaModels(baseUrl: string = 'http://localhost:11434'): Promise<LLMModel[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000), // 10 segundos timeout
    });

    if (!response.ok) {
      throw new Error(`Ollama API retornou status ${response.status}`);
    }

    const data = await response.json() as { models: Array<{ name: string; modified_at: string; size: number }> };
    
    if (!data.models || !Array.isArray(data.models)) {
      return [];
    }

    return data.models.map(model => ({
      id: model.name,
      name: model.name,
      provider: 'ollama' as const,
      description: `Modelo Ollama: ${model.name}`,
      supportsStreaming: true,
      supportsTools: true,
    }));
  } catch (error: any) {
    console.error('❌ Erro ao buscar modelos do Ollama:', error.message);
    return [];
  }
}

/**
 * Lista modelos padrão da OpenAI
 */
export function getOpenAIModels(): LLMModel[] {
  return [
    {
      id: 'gpt-4-turbo-preview',
      name: 'gpt-4-turbo-preview',
      provider: 'openai',
      description: 'GPT-4 Turbo Preview - Modelo mais avançado da OpenAI',
      contextLength: 128000,
      maxTokens: 4096,
      supportsStreaming: true,
      supportsTools: true,
    },
    {
      id: 'gpt-4',
      name: 'gpt-4',
      provider: 'openai',
      description: 'GPT-4 - Modelo padrão GPT-4',
      contextLength: 8192,
      maxTokens: 4096,
      supportsStreaming: true,
      supportsTools: true,
    },
    {
      id: 'gpt-4-32k',
      name: 'gpt-4-32k',
      provider: 'openai',
      description: 'GPT-4 32K - Contexto estendido',
      contextLength: 32768,
      maxTokens: 4096,
      supportsStreaming: true,
      supportsTools: true,
    },
    {
      id: 'gpt-3.5-turbo',
      name: 'gpt-3.5-turbo',
      provider: 'openai',
      description: 'GPT-3.5 Turbo - Modelo rápido e eficiente',
      contextLength: 16385,
      maxTokens: 4096,
      supportsStreaming: true,
      supportsTools: true,
    },
    {
      id: 'gpt-3.5-turbo-16k',
      name: 'gpt-3.5-turbo-16k',
      provider: 'openai',
      description: 'GPT-3.5 Turbo 16K - Contexto estendido',
      contextLength: 16385,
      maxTokens: 4096,
      supportsStreaming: true,
      supportsTools: true,
    },
  ];
}

/**
 * Lista modelos padrão do StackSpot
 */
export function getStackSpotModels(): LLMModel[] {
  return [
    {
      id: 'default',
      name: 'default',
      provider: 'stackspot',
      description: 'Modelo padrão do StackSpot',
      supportsStreaming: true,
      supportsTools: true,
    },
  ];
}

/**
 * Atualiza modelos de um provider específico
 */
export async function updateProviderModels(provider: 'openai' | 'stackspot' | 'ollama'): Promise<number> {
  const db = loadModelsDatabase();
  const config = loadConfigFromJson();
  
  let newModels: LLMModel[] = [];
  
  try {
    switch (provider) {
      case 'ollama':
        const ollamaBaseUrl = config?.ollamaBaseUrl || 'http://localhost:11434';
        newModels = await fetchOllamaModels(ollamaBaseUrl);
        break;
      case 'openai':
        newModels = getOpenAIModels();
        break;
      case 'stackspot':
        newModels = getStackSpotModels();
        break;
    }

    // Remove modelos antigos do provider
    db.models = db.models.filter(m => m.provider !== provider);
    
    // Adiciona novos modelos
    db.models.push(...newModels);
    
    // Atualiza informações do provider
    db.providers[provider] = {
      lastFetched: new Date().toISOString(),
      count: newModels.length,
    };
    
    saveModelsDatabase(db);
    
    console.log(`✅ ${newModels.length} modelo(s) do ${provider} atualizado(s)`);
    return newModels.length;
  } catch (error: any) {
    console.error(`❌ Erro ao atualizar modelos do ${provider}:`, error.message);
    throw error;
  }
}

/**
 * Atualiza todos os modelos de todos os providers
 */
export async function updateAllProviderModels(): Promise<{ [key: string]: number }> {
  const results: { [key: string]: number } = {};
  
  try {
    results.openai = await updateProviderModels('openai');
  } catch (error) {
    results.openai = 0;
  }
  
  try {
    results.stackspot = await updateProviderModels('stackspot');
  } catch (error) {
    results.stackspot = 0;
  }
  
  try {
    results.ollama = await updateProviderModels('ollama');
  } catch (error) {
    results.ollama = 0;
  }
  
  return results;
}

/**
 * Busca modelos de um provider específico
 */
export function getModelsByProvider(provider: 'openai' | 'stackspot' | 'ollama'): LLMModel[] {
  const db = loadModelsDatabase();
  return db.models.filter(m => m.provider === provider);
}

/**
 * Busca todos os modelos
 */
export function getAllModels(): LLMModel[] {
  const db = loadModelsDatabase();
  return db.models;
}

/**
 * Busca um modelo específico por ID e provider
 */
export function getModelById(id: string, provider: 'openai' | 'stackspot' | 'ollama'): LLMModel | null {
  const db = loadModelsDatabase();
  return db.models.find(m => m.id === id && m.provider === provider) || null;
}

/**
 * Verifica se precisa atualizar modelos de um provider
 * (atualiza se nunca foi buscado ou se foi há mais de 24 horas)
 */
export function shouldUpdateProvider(provider: 'openai' | 'stackspot' | 'ollama'): boolean {
  const db = loadModelsDatabase();
  const providerInfo = db.providers[provider];
  
  if (!providerInfo || !providerInfo.lastFetched) {
    return true;
  }
  
  const lastFetched = new Date(providerInfo.lastFetched);
  const now = new Date();
  const hoursSinceUpdate = (now.getTime() - lastFetched.getTime()) / (1000 * 60 * 60);
  
  // Atualiza se foi há mais de 24 horas
  return hoursSinceUpdate > 24;
}

