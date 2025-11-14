/**
 * Storage para logs
 */

import fs from 'fs';
import path from 'path';
import { LogEntry, LogsJsonFile, LogType, LLMProvider } from '../types';
import { loadConfigFromJson } from '../config/env';

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
 * Salva uma entrada de log em um arquivo JSON
 */
export function saveLog(logEntry: Omit<LogEntry, 'id' | 'timestamp'>): void {
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
    if (fs.existsSync(logsFilePath)) {
      const fileContent = fs.readFileSync(logsFilePath, 'utf-8');
      if (fileContent.trim() === '') {
        logsData = createEmptyLogsData();
      } else {
        logsData = JSON.parse(fileContent);
        if (!logsData.statistics.totalCost) {
          logsData.statistics.totalCost = 0;
        }
      }
    } else {
      logsData = createEmptyLogsData();
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

    // Salva o arquivo
    fs.writeFileSync(logsFilePath, JSON.stringify(logsData, null, 2), 'utf-8');
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

