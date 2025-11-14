/**
 * Serviço para enviar logs do frontend para o backend
 * 
 * Este módulo permite que o frontend envie logs importantes para o backend
 * para análise e debug.
 */

const API_URL = import.meta.env.DEV 
  ? '' // In dev, use Vite proxy (relative path)
  : (import.meta.env?.VITE_API_URL as string) || 'http://localhost:3000';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface FrontendLog {
  level: LogLevel;
  message: string;
  data?: any;
  timestamp?: string;
  source?: string;
}

/**
 * Cache para evitar envio excessivo de logs
 */
let logQueue: FrontendLog[] = [];
let flushTimeout: NodeJS.Timeout | null = null;
const MAX_QUEUE_SIZE = 50;
const FLUSH_INTERVAL = 2000; // 2 segundos

/**
 * Envia log para o backend (com debounce e batching)
 */
async function sendLogToBackend(log: FrontendLog): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/api/logs/frontend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...log,
        timestamp: log.timestamp || new Date().toISOString(),
        source: log.source || 'react-frontend',
      }),
    });

    if (!response.ok) {
      console.warn('[FrontendLogger] Erro ao enviar log para backend:', response.status);
    }
  } catch (error) {
    // Não loga erro para evitar loop infinito
    // Silently fail - não queremos que logging cause problemas
  }
}

/**
 * Adiciona log à fila e agenda envio
 */
function queueLog(log: FrontendLog): void {
  logQueue.push(log);
  
  // Limita tamanho da fila
  if (logQueue.length > MAX_QUEUE_SIZE) {
    logQueue.shift(); // Remove o mais antigo
  }
  
  // Agenda flush
  if (flushTimeout) {
    clearTimeout(flushTimeout);
  }
  
  flushTimeout = setTimeout(() => {
    flushLogs();
  }, FLUSH_INTERVAL);
}

/**
 * Envia todos os logs da fila para o backend
 */
async function flushLogs(): Promise<void> {
  if (logQueue.length === 0) {
    return;
  }
  
  const logsToSend = [...logQueue];
  logQueue = [];
  
  // Envia todos os logs em paralelo
  await Promise.allSettled(logsToSend.map(log => sendLogToBackend(log)));
}

/**
 * Envia log do frontend para o backend
 * 
 * @param level - Nível do log (debug, info, warn, error)
 * @param message - Mensagem do log
 * @param data - Dados adicionais (opcional)
 */
export function logToBackend(level: LogLevel, message: string, data?: any): void {
  // Sempre loga no console do frontend também
  const consoleMethod = level === 'error' ? console.error 
    : level === 'warn' ? console.warn 
    : level === 'debug' ? console.debug 
    : console.log;
  
  if (data) {
    consoleMethod(`[FrontendLogger] ${message}`, data);
  } else {
    consoleMethod(`[FrontendLogger] ${message}`);
  }
  
  // Adiciona à fila para envio ao backend
  queueLog({ level, message, data });
}

/**
 * Envia log de debug
 */
export function debug(message: string, data?: any): void {
  logToBackend('debug', message, data);
}

/**
 * Envia log de informação
 */
export function info(message: string, data?: any): void {
  logToBackend('info', message, data);
}

/**
 * Envia log de aviso
 */
export function warn(message: string, data?: any): void {
  logToBackend('warn', message, data);
}

/**
 * Envia log de erro
 */
export function error(message: string, data?: any): void {
  logToBackend('error', message, data);
}

/**
 * Envia logs imediatamente (sem batching) - útil para erros críticos
 */
export async function logImmediate(level: LogLevel, message: string, data?: any): Promise<void> {
  console.log(`[FrontendLogger] ${level.toUpperCase()}: ${message}`, data || '');
  await sendLogToBackend({ level, message, data });
}

/**
 * Força envio de todos os logs pendentes
 */
export async function flush(): Promise<void> {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
  await flushLogs();
}

// Envia logs pendentes antes de fechar a página
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flush();
  });
}

