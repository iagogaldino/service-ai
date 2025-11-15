/**
 * Storage para logs
 */

import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { LogEntry, LogsJsonFile, LogType, LLMProvider } from '../types';
import { loadConfigFromJson } from '../config/env';

// Fila para garantir que apenas uma operação de escrita aconteça por vez
let writeQueue: Promise<void> = Promise.resolve();

/**
 * Função auxiliar para recuperar JSON corrompido
 */
function recoverJson(content: string): LogsJsonFile | null {
  // Remove qualquer conteúdo após o último } válido
  const trimmed = content.trim();
  
  // Estratégia 1: Procura pelo último } que fecha o objeto principal
  let lastBrace = trimmed.lastIndexOf('}');
  while (lastBrace > 0) {
    try {
      const candidate = trimmed.substring(0, lastBrace + 1);
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.entries)) {
        return parsed as LogsJsonFile;
      }
    } catch {
      // Continua tentando
    }
    // Procura o próximo } anterior
    lastBrace = trimmed.lastIndexOf('}', lastBrace - 1);
  }
  
  // Estratégia 2: Tenta encontrar o início do objeto statistics
  const statsIndex = trimmed.lastIndexOf('"statistics"');
  if (statsIndex > 0) {
    // Encontra o } que fecha statistics
    let statsEnd = trimmed.indexOf('}', statsIndex);
    if (statsEnd > 0) {
      // Encontra o } que fecha o objeto principal
      const mainEnd = trimmed.indexOf('}', statsEnd + 1);
      if (mainEnd > 0) {
        try {
          const candidate = trimmed.substring(0, mainEnd + 1);
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.entries)) {
            return parsed as LogsJsonFile;
          }
        } catch {
          // Falhou
        }
      }
    }
  }
  
  return null;
}

/**
 * Interface para logs do frontend
 */
export interface FrontendLogEntry {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: any;
  source?: string;
  userAgent?: string;
  ip?: string;
}

/**
 * Interface para arquivo de logs do frontend
 */
interface FrontendLogsFile {
  entries: FrontendLogEntry[];
  totalEntries: number;
  lastUpdated: string;
}

/**
 * Obtém o LLM provider atual do config.json
 */
function getCurrentLLMProvider(): LLMProvider {
  try {
    const config = loadConfigFromJson();
    return config?.llmProvider || 'stackspot';
  } catch (error) {
    console.warn('⚠️ Erro ao obter LLM provider, usando padrão (stackspot):', error);
    return 'stackspot';
  }
}

/**
 * Salva uma entrada de log em um arquivo JSON (versão síncrona - mantida para compatibilidade)
 */
export function saveLog(logEntry: Omit<LogEntry, 'id' | 'timestamp'>): void {
  // Chama versão assíncrona sem bloquear
  saveLogAsync(logEntry).catch(error => {
    console.error('❌ Erro ao salvar log no JSON:', error);
  });
}

/**
 * Salva uma entrada de log em um arquivo JSON de forma assíncrona (não bloqueante)
 */
export async function saveLogAsync(logEntry: Omit<LogEntry, 'id' | 'timestamp'>): Promise<void> {
  try {
    const logsFilePath = path.join(process.cwd(), 'logs.json');
    
    // Gera ID único para o log
    const id = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullLogEntry: LogEntry = {
      ...logEntry,
      id,
      timestamp: new Date().toISOString(),
      llmProvider: logEntry.llmProvider || getCurrentLLMProvider()
    };
    
    // Lê o arquivo existente ou cria estrutura vazia
    let logsData: LogsJsonFile;
    try {
      const fileContent = await fsPromises.readFile(logsFilePath, 'utf-8');
      if (fileContent.trim() === '') {
        logsData = createEmptyLogsData();
      } else {
        try {
          // Tenta fazer parse do JSON
          logsData = JSON.parse(fileContent);
          if (!logsData.statistics || !logsData.statistics.totalCost) {
            if (!logsData.statistics) {
              logsData.statistics = {
                totalConnections: 0,
                totalMessages: 0,
                totalToolExecutions: 0,
                totalErrors: 0,
                totalTokens: 0,
                totalCost: 0
              };
            } else {
              logsData.statistics.totalCost = logsData.statistics.totalCost || 0;
            }
          }
        } catch (parseError: any) {
          // Se o JSON estiver corrompido, tenta recuperar o conteúdo válido
          console.warn('⚠️ JSON corrompido detectado, tentando recuperar...', parseError.message);
          
          const recovered = recoverJson(fileContent);
          if (recovered) {
            logsData = recovered;
            console.log('✅ JSON recuperado com sucesso');
            // Salva o JSON recuperado imediatamente para evitar corrupção futura
            await fsPromises.writeFile(logsFilePath, JSON.stringify(logsData, null, 2), 'utf-8');
          } else {
            console.error('❌ Não foi possível recuperar JSON, criando estrutura vazia');
            logsData = createEmptyLogsData();
          }
        }
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logsData = createEmptyLogsData();
      } else {
        // Em caso de outros erros, cria estrutura vazia para não bloquear
        console.error('❌ Erro ao ler arquivo de logs, criando estrutura vazia:', error.message);
        logsData = createEmptyLogsData();
      }
    }

    // Adiciona nova entrada
    logsData.entries.push(fullLogEntry);
    logsData.totalEntries = logsData.entries.length;
    logsData.lastUpdated = new Date().toISOString();

    // Atualiza estatísticas
    updateStatistics(logsData, fullLogEntry);

    // Mantém apenas as últimas 10000 entradas
    const MAX_ENTRIES = 10000;
    if (logsData.entries.length > MAX_ENTRIES) {
      logsData.entries = logsData.entries.slice(-MAX_ENTRIES);
      logsData.totalEntries = logsData.entries.length;
    }

    // Adiciona à fila para garantir que apenas uma escrita aconteça por vez
    // Não aguarda a conclusão para não bloquear (fire and forget com tratamento de erro)
    writeQueue = writeQueue.then(async () => {
      try {
        // Lê novamente o arquivo antes de escrever para evitar sobrescrever mudanças concorrentes
        let currentData: LogsJsonFile;
        try {
          const currentContent = await fsPromises.readFile(logsFilePath, 'utf-8');
          if (currentContent.trim() === '') {
            currentData = createEmptyLogsData();
          } else {
            try {
              currentData = JSON.parse(currentContent);
              if (!currentData.statistics || !currentData.statistics.totalCost) {
                if (!currentData.statistics) {
                  currentData.statistics = {
                    totalConnections: 0,
                    totalMessages: 0,
                    totalToolExecutions: 0,
                    totalErrors: 0,
                    totalTokens: 0,
                    totalCost: 0
                  };
                } else {
                  currentData.statistics.totalCost = currentData.statistics.totalCost || 0;
                }
              }
            } catch (parseError: any) {
              // Se corrompido, tenta recuperar usando a mesma função
              const recovered = recoverJson(currentContent);
              if (recovered) {
                currentData = recovered;
              } else {
                currentData = createEmptyLogsData();
              }
            }
          }
        } catch (error: any) {
          if (error.code === 'ENOENT') {
            currentData = createEmptyLogsData();
          } else {
            currentData = createEmptyLogsData();
          }
        }

        // Verifica se a entrada já existe (evita duplicatas)
        const entryExists = currentData.entries.some(e => e.id === fullLogEntry.id);
        if (!entryExists) {
          currentData.entries.push(fullLogEntry);
          currentData.totalEntries = currentData.entries.length;
          currentData.lastUpdated = new Date().toISOString();
          updateStatistics(currentData, fullLogEntry);

          // Mantém apenas as últimas 10000 entradas
          if (currentData.entries.length > MAX_ENTRIES) {
            currentData.entries = currentData.entries.slice(-MAX_ENTRIES);
            currentData.totalEntries = currentData.entries.length;
          }
        }

        // Escreve o arquivo de forma atômica usando writeFile
        await fsPromises.writeFile(logsFilePath, JSON.stringify(currentData, null, 2), 'utf-8');
      } catch (writeError: any) {
        console.error('❌ Erro ao escrever log no arquivo:', writeError);
        // Não relança o erro para não quebrar a fila
      }
    }).catch((error: any) => {
      // Tratamento de erro na fila para evitar que trave
      console.error('❌ Erro na fila de escrita de logs:', error);
    });

    // NÃO aguarda a escrita - fire and forget para não bloquear
    // A fila garante ordem, mas não bloqueia a execução
  } catch (error) {
    console.error('❌ Erro ao salvar log no JSON:', error);
  }
}

/**
 * Cria estrutura vazia para logs do frontend
 */
function createEmptyFrontendLogsData(): FrontendLogsFile {
  return {
    entries: [],
    totalEntries: 0,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Salva log do frontend em arquivo JSON
 * 
 * @param logEntry - Entrada de log do frontend
 */
export function saveFrontendLog(logEntry: FrontendLogEntry): void {
  try {
    const logsFilePath = path.join(process.cwd(), 'frontend-logs.json');
    
    // Lê o arquivo existente ou cria estrutura vazia
    let logsData: FrontendLogsFile;
    if (fs.existsSync(logsFilePath)) {
      const fileContent = fs.readFileSync(logsFilePath, 'utf-8');
      if (fileContent.trim() === '') {
        logsData = createEmptyFrontendLogsData();
      } else {
        logsData = JSON.parse(fileContent);
      }
    } else {
      logsData = createEmptyFrontendLogsData();
    }

    // Adiciona nova entrada
    logsData.entries.push(logEntry);
    logsData.totalEntries = logsData.entries.length;
    logsData.lastUpdated = new Date().toISOString();

    // Mantém apenas as últimas 5000 entradas (para não ocupar muito espaço)
    const MAX_ENTRIES = 5000;
    if (logsData.entries.length > MAX_ENTRIES) {
      logsData.entries = logsData.entries.slice(-MAX_ENTRIES);
      logsData.totalEntries = logsData.entries.length;
    }

    // Salva o arquivo
    fs.writeFileSync(logsFilePath, JSON.stringify(logsData, null, 2), 'utf-8');
  } catch (error) {
    console.error('❌ Erro ao salvar log do frontend:', error);
  }
}

/**
 * Carrega logs do frontend do arquivo JSON
 * 
 * @param limit - Limite de entradas a retornar (padrão: 1000)
 * @returns Array de logs do frontend
 */
export function loadFrontendLogs(limit: number = 1000): FrontendLogEntry[] {
  try {
    const logsFilePath = path.join(process.cwd(), 'frontend-logs.json');
    
    if (!fs.existsSync(logsFilePath)) {
      return [];
    }

    const fileContent = fs.readFileSync(logsFilePath, 'utf-8');
    if (fileContent.trim() === '') {
      return [];
    }

    const logsData: FrontendLogsFile = JSON.parse(fileContent);
    
    // Retorna as últimas entradas até o limite
    return logsData.entries.slice(-limit);
  } catch (error) {
    console.error('❌ Erro ao carregar logs do frontend:', error);
    return [];
  }
}

/**
 * Carrega logs do arquivo JSON
 */
export function loadLogs(llmProvider?: LLMProvider): LogsJsonFile {
  try {
    const logsFilePath = path.join(process.cwd(), 'logs.json');
    
    if (!fs.existsSync(logsFilePath)) {
      return createEmptyLogsData();
    }

    const fileContent = fs.readFileSync(logsFilePath, 'utf-8');
    if (fileContent.trim() === '') {
      return createEmptyLogsData();
    }

    const logsData: LogsJsonFile = JSON.parse(fileContent);
    
    // Filtra por provider se especificado
    if (llmProvider) {
      const filteredEntries = logsData.entries.filter(
        entry => entry.llmProvider === llmProvider
      );
      
      // Recalcula estatísticas baseado nos logs filtrados
      const statistics = {
        totalConnections: 0,
        totalMessages: 0,
        totalToolExecutions: 0,
        totalErrors: 0,
        totalTokens: 0,
        totalCost: 0
      };
      
      filteredEntries.forEach(entry => {
        switch (entry.type) {
          case 'connection':
            statistics.totalConnections++;
            break;
          case 'message_sent':
          case 'message_received':
            statistics.totalMessages++;
            break;
          case 'tool_execution':
            statistics.totalToolExecutions++;
            break;
          case 'error':
            statistics.totalErrors++;
            break;
          case 'token_usage':
            if (entry.tokenUsage) {
              statistics.totalTokens += entry.tokenUsage.totalTokens;
            }
            if (entry.tokenCost) {
              statistics.totalCost += entry.tokenCost.totalCost;
            }
            break;
        }
      });
      
      statistics.totalCost = Math.round(statistics.totalCost * 10000) / 10000;
      
      return {
        totalEntries: filteredEntries.length,
        entries: filteredEntries,
        lastUpdated: logsData.lastUpdated,
        statistics
      };
    }
    
    return logsData;
  } catch (error) {
    console.error('❌ Erro ao carregar logs:', error);
    return createEmptyLogsData();
  }
}

/**
 * Cria estrutura vazia de logs
 */
function createEmptyLogsData(): LogsJsonFile {
  return {
    totalEntries: 0,
    entries: [],
    lastUpdated: new Date().toISOString(),
    statistics: {
      totalConnections: 0,
      totalMessages: 0,
      totalToolExecutions: 0,
      totalErrors: 0,
      totalTokens: 0,
      totalCost: 0
    }
  };
}

/**
 * Atualiza estatísticas baseado no tipo de log
 */
function updateStatistics(logsData: LogsJsonFile, entry: LogEntry): void {
  switch (entry.type) {
    case 'connection':
      logsData.statistics.totalConnections++;
      break;
    case 'message_sent':
    case 'message_received':
      logsData.statistics.totalMessages++;
      break;
    case 'tool_execution':
      logsData.statistics.totalToolExecutions++;
      break;
    case 'error':
      logsData.statistics.totalErrors++;
      break;
    case 'token_usage':
      if (entry.tokenUsage) {
        logsData.statistics.totalTokens += entry.tokenUsage.totalTokens;
      }
      if (entry.tokenCost) {
        logsData.statistics.totalCost += entry.tokenCost.totalCost;
        logsData.statistics.totalCost = Math.round(logsData.statistics.totalCost * 10000) / 10000;
      }
      break;
  }
}

