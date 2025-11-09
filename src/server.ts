/**
 * Servidor principal da aplicação
 * 
 * Este módulo gerencia:
 * - Configuração do Express e Socket.IO
 * - Integração com OpenAI Assistants API
 * - Gerenciamento de threads e mensagens
 * - Execução de tools/funções dos agentes
 * - Comunicação em tempo real com clientes
 */

import express from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import OpenAI from 'openai';
import path from 'path';
import { AgentManager } from './agents/agentManager';
import { loadEnvironmentVariables, validateRequiredEnvVars, getEnvAsNumber, logEnvironmentInfo, loadConfigFromJson } from './config/env';
import { isRunningUnderNodemon, getShutdownConfig, gracefulShutdown as performGracefulShutdown } from './utils/serverHelpers';
import { initializeAgents } from './agents/config';
import { LLMAdapter } from './llm/adapters/LLMAdapter';
import { initializeLLMAdapter, getLLMAdapter } from './services/llmService';
import { initializeSocketHandlers, updateAdapterAndManager } from './handlers/socketHandlers';
import { setupApiRoutes, ApiRoutesDependencies } from './routes/apiRoutes';
import { ServiceInitializationInfo } from './types';

// ============================================================================
// CONFIGURAÇÃO DE AMBIENTE
// ============================================================================

loadEnvironmentVariables();
validateRequiredEnvVars(['OPENAI_API_KEY']);
logEnvironmentInfo(['OPENAI_API_KEY']);

// ============================================================================
// INICIALIZAÇÃO DE SERVIÇOS
// ============================================================================

const WORKING_DIRECTORY = process.cwd();
const CONFIG_PATH = path.join(WORKING_DIRECTORY, 'config.json');
const AGENTS_PATH = path.join(__dirname, 'agents', 'agents.json');
const initialConfigSnapshot = loadConfigFromJson();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Inicializa o cliente OpenAI (será atualizado quando a API key for configurada)
let openai: OpenAI | undefined;

// Função para inicializar/atualizar o cliente OpenAI
function initializeOpenAIClient(): void {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    openai = new OpenAI({
      apiKey: apiKey,
    });
    console.log('✅ Cliente OpenAI inicializado');
  } else {
    openai = undefined;
    console.warn('⚠️  Cliente OpenAI não inicializado - API key não configurada');
  }
}

// Inicializa na primeira vez
initializeOpenAIClient();

const PORT = getEnvAsNumber('PORT', 3000);
let llmAdapter: LLMAdapter | undefined;
let agentManager: AgentManager | undefined;

// Inicializa o adaptador de LLM usando o serviço
initializeLLMAdapter();
llmAdapter = getLLMAdapter();

// Inicializa AgentManager se llmAdapter estiver disponível
if (llmAdapter) {
  agentManager = new AgentManager(llmAdapter);
} else {
  console.warn('⚠️ AgentManager não inicializado - LLM adapter não configurado');
}

// Inicializa agentes (carrega do JSON e faz cache na inicialização)
// Só inicializa se tiver llmAdapter configurado
if (llmAdapter) {
  initializeAgents().catch((err: any) => {
    console.error('❌ Erro ao inicializar agentes:', err);
    // Não faz exit(1) para permitir configuração via frontend
  });
}

// Funções para gerenciar AgentManager (necessárias para as rotas)
function getAgentManager(): AgentManager | undefined {
  return agentManager;
}

function setAgentManager(manager: AgentManager): void {
  agentManager = manager;
  // Atualiza handlers Socket.IO com novo manager
  updateAdapterAndManager(getLLMAdapter() || undefined, manager);
}

// Inicializa handlers Socket.IO
initializeSocketHandlers(io, llmAdapter, agentManager);

// Configura rotas da API
const apiRouter = express.Router();
const apiDeps: ApiRoutesDependencies = {
  io,
  getLLMAdapter: () => getLLMAdapter() || null,
  getAgentManager: () => getAgentManager() || null,
  setAgentManager: setAgentManager
};
setupApiRoutes(apiRouter, apiDeps);
app.use(apiRouter);

// Nota: Threads, conexões, tokens e monitoramento agora são gerenciados pelos serviços:
// - src/services/threadService.ts
// - src/services/connectionService.ts  
// - src/services/monitoringService.ts
// As interfaces ConnectionInfo, TokenUsage, etc estão em src/types/index.ts

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

// Nota: Interfaces e tipos agora estão em src/types/index.ts
// TokenUsage, TokenCost, TokenHistoryEntry, TokensJsonFile, LogType, LogEntry, etc.
// calculateTokenCost() está em src/utils/tokenCalculator.ts
// getCurrentLLMProvider() está em src/services/llmService.ts e src/storage/logStorage.ts

// ============================================================================
// FUNÇÕES AUXILIARES REMOVIDAS
// ============================================================================
// As seguintes funções foram movidas para módulos dedicados:
// - saveLogToJson -> src/storage/logStorage.ts (saveLog)
// - saveTokensToJson -> src/storage/tokenStorage.ts (saveTokens)
// - saveConversationMessage -> src/storage/conversationStorage.ts
// - loadConversation -> src/storage/conversationStorage.ts
// - clearConversation -> src/storage/conversationStorage.ts
// - waitForRunCompletion -> src/llm/adapters/*Adapter.ts (implementado nos adapters)

// ============================================================================
// ROTAS HTTP
// ============================================================================

/**
 * Rota raiz: Serve o cliente HTML
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

/**
 * Rota para página de monitoramento
 */
app.get('/monitor', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/monitor.html'));
});

// Nota: Todas as rotas da API (/api/*) foram movidas para src/routes/apiRoutes.ts

// ============================================================================
// CONFIGURAÇÃO DO SOCKET.IO
// ============================================================================

// ============================================================================
// HANDLERS SOCKET.IO
// ============================================================================
// Nota: Todos os handlers Socket.IO foram movidos para src/handlers/socketHandlers.ts
// A função initializeSocketHandlers() é chamada na linha 109
// O handler antigo foi completamente removido abaixo

// Handler antigo removido - código foi movido para src/handlers/socketHandlers.ts
// A função initializeSocketHandlers() é chamada na linha 121

// ============================================================================
// GERENCIAMENTO DE SHUTDOWN
// ============================================================================

const isNodemon = isRunningUnderNodemon();
const shutdownConfig = getShutdownConfig(isNodemon);

/**
 * Handler para shutdown graceful do servidor
 * 
 * @param {string} signal - Sinal recebido (SIGTERM, SIGINT, etc.)
 */
async function handleShutdown(signal: string): Promise<void> {
  console.log(`\n${signal} recebido. Fechando servidor...`);
  
  await performGracefulShutdown(httpServer, io, shutdownConfig);
  
  process.exit(isNodemon && signal === 'SIGTERM' ? 0 : 1);
}

// Configura handlers para sinais de encerramento
if (isNodemon) {
  process.on('SIGTERM', () => {
    console.log('🔄 Reiniciando servidor (nodemon)...');
    handleShutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    console.log('🛑 Parando servidor (Ctrl+C)...');
    handleShutdown('SIGINT');
  });
} else {
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

// Handlers para erros não tratados
process.on('uncaughtException', (err) => {
  console.error('Erro não tratado:', err);
  handleShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promessa rejeitada não tratada:', reason);
  handleShutdown('unhandledRejection');
});

// ============================================================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================================================

let isStarting = false;

/**
 * Inicia o servidor HTTP com retry automático em caso de porta ocupada
 * 
 * @param {number} retries - Número de tentativas restantes
 * @param {number} delay - Delay entre tentativas em milissegundos
 * @returns {Promise<void>} Promise que resolve quando o servidor iniciar
 */
function buildInitializationInfo(): ServiceInitializationInfo {
  const config = initialConfigSnapshot || loadConfigFromJson();

  return {
    port: PORT,
    serverUrl: `http://localhost:${PORT}`,
    configPath: CONFIG_PATH,
    agentsPath: AGENTS_PATH,
    llmProvider: config?.llmProvider || 'stackspot',
    openaiApiKeyConfigured: Boolean(config?.openaiApiKey),
    stackspotCredentialsConfigured: Boolean(config?.stackspotClientId && config?.stackspotClientSecret),
    workingDirectory: WORKING_DIRECTORY,
    configLastUpdated: config?.lastUpdated,
  };
}

async function startServer(retries = 5, delay = isNodemon ? 3000 : 2000): Promise<ServiceInitializationInfo> {
  if (isStarting) {
    console.log('⏳ Servidor já está iniciando, aguardando...');
    return new Promise((resolve) => {
      const check = () => {
        if (!isStarting && httpServer.listening) {
          resolve(buildInitializationInfo());
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });
  }

  isStarting = true;

  return new Promise<ServiceInitializationInfo>((resolve, reject) => {
    // Se o servidor já está escutando, fecha primeiro
    if (httpServer.listening) {
      console.log('🔄 Fechando instância anterior do servidor...');
      httpServer.close(() => {
        console.log('✅ Instância anterior fechada. Aguardando liberação da porta...');
        setTimeout(() => {
          startNewServer();
        }, isNodemon ? 500 : 1000);
      });
    } else {
      startNewServer();
    }

    function startNewServer() {
      const onError = async (err: NodeJS.ErrnoException) => {
        isStarting = false;

        if (err.code === 'EADDRINUSE') {
          console.error(`\n❌ Erro: A porta ${PORT} já está em uso.`);

          if (retries > 0) {
            console.log(`🔄 Tentando novamente em ${delay / 1000} segundos... (${retries} tentativas restantes)`);
            await new Promise(resolveDelay => setTimeout(resolveDelay, delay));
            return startServer(retries - 1, delay).then(resolve).catch(reject);
          }

          console.error(`\nPara resolver, você pode:`);
          console.error(`1. Parar o processo que está usando a porta ${PORT}:`);
          console.error(`   Windows: netstat -ano | findstr :${PORT} e depois taskkill /PID <PID> /F`);
          console.error(`   Linux/Mac: lsof -ti:${PORT} | xargs kill -9`);
          console.error(`2. Ou usar uma porta diferente definindo a variável PORT:`);
          console.error(`   Windows PowerShell: $env:PORT=3001; npm run dev`);
          console.error(`   Windows CMD: set PORT=3001 && npm run dev`);
          console.error(`   Linux/Mac: PORT=3001 npm run dev`);
          reject(err);
        } else {
          console.error(`\n❌ Erro ao iniciar o servidor:`, err);
          reject(err);
        }
      };

      httpServer.once('error', onError);

      httpServer.listen(PORT, () => {
        console.log(`✅ Servidor rodando na porta ${PORT}`);
        console.log(`🌐 Acesse http://localhost:${PORT} para testar`);
        httpServer.removeListener('error', onError);
        isStarting = false;
        resolve(buildInitializationInfo());
      });
    }
  });
}

// Inicia o servidor e expõe promessa de inicialização
export const serviceInitialization = startServer();

serviceInitialization.catch((err) => {
  console.error('Falha ao iniciar o servidor após várias tentativas:', err);
  process.exit(1);
});

export default serviceInitialization;
