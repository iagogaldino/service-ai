import path from 'path';
import fs from 'fs';

/**
 * Configuração e carregamento de variáveis de ambiente
 * 
 * Este módulo gerencia o carregamento de configurações via config.json.
 */

/**
 * Interface para o arquivo config.json
 */
export interface AppConfig {
  // Provider escolhido
  llmProvider?: 'openai' | 'stackspot';
  
  // Configuração OpenAI
  openaiApiKey?: string;
  
  // Configuração StackSpot
  stackspotClientId?: string;
  stackspotClientSecret?: string;
  stackspotRealm?: string;
  
  // Outras configurações
  port?: number;
  lastUpdated?: string;
}

/**
 * Carrega configuração do arquivo config.json
 * 
 * @returns {AppConfig | null} Configuração carregada ou null se não existir
 */
export function loadConfigFromJson(): AppConfig | null {
  try {
    const configPath = path.join(process.cwd(), 'config.json');
    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(fileContent) as AppConfig;
      console.log(`✅ Arquivo config.json carregado`);
      return config;
    }
  } catch (error) {
    console.warn('⚠️  Erro ao carregar config.json:', error);
  }
  return null;
}

/**
 * Salva configuração no arquivo config.json
 * 
 * @param config - Configuração a ser salva
 */
export function saveConfigToJson(config: AppConfig): void {
  try {
    const configPath = path.join(process.cwd(), 'config.json');
    const configToSave: AppConfig = {
      ...config,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2), 'utf-8');
    console.log(`✅ Configuração salva em config.json`);
  } catch (error) {
    console.error('❌ Erro ao salvar config.json:', error);
    throw error;
  }
}

/**
 * Carrega variáveis de ambiente do arquivo config.json
 * 
 * @returns {boolean} Retorna true se a configuração foi carregada com sucesso
 */
export function loadEnvironmentVariables(): boolean {
  const config = loadConfigFromJson();
  if (config?.openaiApiKey) {
    process.env.OPENAI_API_KEY = config.openaiApiKey;
    if (config.port) {
      process.env.PORT = config.port.toString();
    }
    console.log('✅ API Key carregada do config.json');
    return true;
  }

  return false;
}

/**
 * Valida se todas as variáveis de ambiente obrigatórias estão configuradas
 * 
 * @param {string[]} requiredVars - Array de nomes de variáveis obrigatórias
 * @throws {Error} Se alguma variável obrigatória não estiver configurada
 */
export function validateRequiredEnvVars(requiredVars: string[]): void {
  const missing: string[] = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    console.error(`❌ Erro: Variáveis de ambiente obrigatórias não encontradas:`);
    missing.forEach(varName => {
      console.error(`   - ${varName}`);
    });
    console.error(`\nPor favor, configure a API key através do frontend.`);
    // Não faz exit(1) para permitir que o usuário configure via frontend
    console.warn(`⚠️  Continuando sem API key - configure através do frontend antes de usar`);
  }
}

/**
 * Obtém o valor de uma variável de ambiente com valor padrão
 * 
 * @param {string} key - Nome da variável de ambiente
 * @param {string} defaultValue - Valor padrão se a variável não existir
 * @returns {string} Valor da variável ou valor padrão
 */
export function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Variável de ambiente ${key} não encontrada e nenhum valor padrão fornecido`);
  }
  
  return value;
}

/**
 * Obtém o valor de uma variável de ambiente como número
 * 
 * @param {string} key - Nome da variável de ambiente
 * @param {number} defaultValue - Valor padrão se a variável não existir
 * @returns {number} Valor da variável convertido para número ou valor padrão
 */
export function getEnvAsNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  
  if (value === undefined || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Variável de ambiente ${key} não encontrada e nenhum valor padrão fornecido`);
  }
  
  const numValue = parseInt(value, 10);
  if (isNaN(numValue)) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Variável de ambiente ${key} não é um número válido: ${value}`);
  }
  
  return numValue;
}

/**
 * Loga informações sobre variáveis de ambiente carregadas (apenas para debug)
 * 
 * @param {string[]} varsToLog - Array de nomes de variáveis para logar (parcialmente)
 */
export function logEnvironmentInfo(varsToLog: string[] = []): void {
  console.log(`📁 Diretório de trabalho: ${process.cwd()}`);
  console.log(`📁 __dirname: ${__dirname}`);
  
  varsToLog.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      const preview = value.length > 10 ? value.substring(0, 10) + '...' : value;
      console.log(`🔑 ${varName} carregada: Sim (preview: ${preview})`);
    } else {
      console.log(`🔑 ${varName} carregada: Não`);
    }
  });
}

