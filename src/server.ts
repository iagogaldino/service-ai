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
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import OpenAI from 'openai';
import path from 'path';
import { AgentManager, executeTool } from './agents/agentManager';
import { loadEnvironmentVariables, validateRequiredEnvVars, getEnvAsNumber, logEnvironmentInfo } from './config/env';
import { formatActionMessage } from './utils/functionDescriptions';
import { isRunningUnderNodemon, getShutdownConfig, gracefulShutdown as performGracefulShutdown } from './utils/serverHelpers';
import { initializeAgents } from './agents/config';

// ============================================================================
// CONFIGURAÇÃO DE AMBIENTE
// ============================================================================

loadEnvironmentVariables();
validateRequiredEnvVars(['OPENAI_API_KEY']);
logEnvironmentInfo(['OPENAI_API_KEY']);

// ============================================================================
// INICIALIZAÇÃO DE SERVIÇOS
// ============================================================================

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

// Inicializa o cliente OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const PORT = getEnvAsNumber('PORT', 3000);
const agentManager = new AgentManager(openai);

// Inicializa agentes (carrega do JSON e faz cache na inicialização)
initializeAgents().catch((err: any) => {
  console.error('❌ Erro ao inicializar agentes:', err);
  process.exit(1);
});

// Armazena threads por socket ID (mapeia socket.id -> thread.id)
const threadMap = new Map<string, string>();

// Armazena informações sobre conexões ativas para monitoramento
interface ConnectionInfo {
  socketId: string;
  threadId: string;
  connectedAt: Date;
  lastActivity: Date;
  messageCount: number;
  userAgent?: string;
  ipAddress?: string;
}

const connectionsMap = new Map<string, ConnectionInfo>();
const monitoringSockets = new Map<string, string>(); // Map: monitorSocketId -> targetSocketId

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Aguarda a conclusão de um run do Assistants API e processa as ações necessárias
 * 
 * Esta função monitora o status de um run, executa tools quando necessário,
 * e retorna a resposta final do assistente. Envia eventos em tempo real
 * para o cliente através do Socket.IO.
 * 
 * @param {string} threadId - ID da thread do Assistants API
 * @param {string} runId - ID do run que está sendo executado
 * @param {Socket} socket - Socket.IO para emitir eventos em tempo real
 * @returns {Promise<string>} Resposta final do assistente
 * @throws {Error} Se o run falhar ou ocorrer algum erro
 */
async function waitForRunCompletion(
  threadId: string,
  runId: string,
  socket: Socket
): Promise<string> {
  let iterationCount = 0;
  const MAX_ITERATIONS = 100; // Previne loops infinitos
  
  while (iterationCount < MAX_ITERATIONS) {
    iterationCount++;
    
    console.log(`🔄 Verificando status do run ${runId} (tentativa ${iterationCount})...`);

    const run = await openai.beta.threads.runs.retrieve(threadId, runId);
    console.log(`📊 Status do run: ${run.status}`);

    // Caso 1: Run completado com sucesso
    if (run.status === 'completed') {
      console.log(`✅ Run concluído! Buscando mensagens da thread...`);

      const messages = await openai.beta.threads.messages.list(threadId, {
        limit: 10,
      });

      // Emite todas as mensagens do assistente para o cliente
      for (const message of messages.data.reverse()) {
        if (message.role === 'assistant' && message.content.length > 0) {
          const content = message.content[0];
          if (content.type === 'text' && 'text' in content) {
            const messageData = {
              type: 'assistant',
              message: content.text.value,
              messageId: message.id,
              details: {
                threadId,
                role: 'assistant',
                createdAt: message.created_at,
                runId: message.run_id
              }
            };
            socket.emit('agent_message', messageData);
            emitToMonitors(socket.id, 'agent_message', messageData);
          }
        }
      }

      // Retorna a última mensagem do assistente
      const lastMessage = messages.data[messages.data.length - 1];
      if (
        lastMessage.content[0].type === 'text' &&
        'text' in lastMessage.content[0]
      ) {
        const responseText = lastMessage.content[0].text.value;
        console.log(`📨 Mensagem recuperada da thread (${responseText.length} caracteres)`);
        return responseText;
      }
      return 'Resposta não disponível.';
    }

    // Caso 2: Run falhou
    if (run.status === 'failed') {
      const errorMessage = run.last_error?.message || 'Erro desconhecido';
      console.error(`❌ Run falhou: ${errorMessage}`);
      throw new Error(`Run falhou: ${errorMessage}`);
    }

    // Caso 3: Run requer ação (execução de tools)
    if (run.status === 'requires_action') {
      console.log(`🔧 Run requer ação: agente precisa executar funções`);

      const toolCalls = run.required_action?.submit_tool_outputs?.tool_calls || [];
      
      if (toolCalls.length === 0) {
        throw new Error('Run requer ação mas nenhuma tool foi especificada');
      }

      // Prepara informações sobre as tools que serão executadas
      const toolCallsInfo = toolCalls
        .map(tc => {
          if (tc.type === 'function') {
            const args = JSON.parse(tc.function.arguments);
            return {
              toolCallId: tc.id,
              functionName: tc.function.name,
              arguments: args,
              rawArguments: tc.function.arguments
            };
          }
          return null;
        })
        .filter(Boolean);

      // Notifica o cliente sobre as funções que serão executadas
      const functionCallsData = {
        type: 'function_calls',
        toolCalls: toolCallsInfo,
        details: {
          runId,
          toolCallsCount: toolCalls.length
        }
      };
      socket.emit('agent_message', functionCallsData);
      emitToMonitors(socket.id, 'agent_message', functionCallsData);

      console.log(`🔨 ${toolCalls.length} função(ões) solicitada(s) pelo agente`);

      // Executa todas as funções solicitadas em paralelo
      const toolOutputs = await Promise.all(
        toolCalls.map(async (toolCall, index) => {
          if (toolCall.type !== 'function') {
            return null;
          }

          const functionName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          
          console.log(`🔧 [${index + 1}/${toolCalls.length}] Executando função: ${functionName}`, args);
          
          // Emite evento de ação para o cliente
          const actionMessage = formatActionMessage(functionName, args);
          const agentActionData = {
            action: actionMessage,
            functionName: functionName,
            args: args
          };
          socket.emit('agent_action', agentActionData);
          emitToMonitors(socket.id, 'agent_action', agentActionData);
          
          // Executa a função
          const startTime = Date.now();
          const result = await executeTool(functionName, args, socket);
          const executionTime = Date.now() - startTime;
          
          console.log(`✅ [${index + 1}/${toolCalls.length}] Função ${functionName} executada (${executionTime}ms) - Resultado: ${result.length} caracteres`);

          // Emite resultado da função para o cliente
          const functionResultData = {
            type: 'function_result',
            functionName: functionName,
            arguments: args,
            result: result,
            executionTime: executionTime,
            details: {
              toolCallId: toolCall.id,
              success: !result.startsWith('Erro:')
            }
          };
          socket.emit('agent_message', functionResultData);
          emitToMonitors(socket.id, 'agent_message', functionResultData);
          
          // Emite evento de conclusão da ação
          const actionCompleteData = {
            action: actionMessage,
            success: !result.startsWith('Erro:'),
            result: result.substring(0, 500) // Preview do resultado
          };
          socket.emit('agent_action_complete', actionCompleteData);
          emitToMonitors(socket.id, 'agent_action_complete', actionCompleteData);
          
          return {
            tool_call_id: toolCall.id,
            output: result
          };
        })
      );

      // Remove nulls e filtra apenas resultados válidos
      const validOutputs = toolOutputs.filter(
        (output): output is NonNullable<typeof output> => output !== null
      );

      console.log(`📦 Preparando ${validOutputs.length} resultado(s) para enviar ao agente...`);

      // Notifica o cliente sobre o processamento
      const processingData = {
        action: '⚙️ Processando resultados...',
        functionName: 'processing'
      };
      socket.emit('agent_action', processingData);
      emitToMonitors(socket.id, 'agent_action', processingData);

      // Mostra o que está sendo enviado de volta ao agente
      const functionOutputsData = {
        type: 'function_outputs',
        outputs: validOutputs.map(output => ({
          toolCallId: output.tool_call_id,
          output: output.output.substring(0, 1000) + (output.output.length > 1000 ? '...' : ''),
          outputLength: output.output.length
        })),
        details: {
          runId,
          outputsCount: validOutputs.length
        }
      };
      socket.emit('agent_message', functionOutputsData);
      emitToMonitors(socket.id, 'agent_message', functionOutputsData);

      // Envia os resultados das funções de volta para o assistente
      console.log(`📤 Enviando ${validOutputs.length} resultado(s) de volta ao agente...`);

      await openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
        tool_outputs: validOutputs
      });

      console.log(`✅ Resultados enviados. Aguardando processamento do agente...`);

      // Aguarda um pouco antes de verificar o status novamente
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }

    // Caso 4: Run em fila ou em progresso
    if (run.status === 'queued' || run.status === 'in_progress') {
      console.log(`⏳ Run em progresso (${run.status})...`);
    }

    // Aguarda antes de verificar novamente
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Run não completou após ${MAX_ITERATIONS} iterações`);
}

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

/**
 * API: Lista todas as conexões ativas
 */
app.get('/api/connections', (req, res) => {
  const connections = Array.from(connectionsMap.values()).map(conn => ({
    socketId: conn.socketId,
    threadId: conn.threadId,
    connectedAt: conn.connectedAt.toISOString(),
    lastActivity: conn.lastActivity.toISOString(),
    messageCount: conn.messageCount,
    userAgent: conn.userAgent,
    ipAddress: conn.ipAddress
  }));
  res.json({ connections });
});

/**
 * API: Obtém informações de uma conexão específica
 */
app.get('/api/connections/:socketId', (req, res) => {
  const { socketId } = req.params;
  const connection = connectionsMap.get(socketId);
  if (!connection) {
    return res.status(404).json({ error: 'Conexão não encontrada' });
  }
  res.json({
    socketId: connection.socketId,
    threadId: connection.threadId,
    connectedAt: connection.connectedAt.toISOString(),
    lastActivity: connection.lastActivity.toISOString(),
    messageCount: connection.messageCount,
    userAgent: connection.userAgent,
    ipAddress: connection.ipAddress
  });
});

// ============================================================================
// CONFIGURAÇÃO DO SOCKET.IO
// ============================================================================

/**
 * Configuração de conexões Socket.IO
 * 
 * Cada cliente conectado recebe:
 * - Uma nova thread do Assistants API
 * - Capacidade de enviar mensagens e receber respostas
 * - Feedback em tempo real sobre ações do agente
 */
/**
 * Função helper para emitir eventos para monitores de uma conexão específica
 */
function emitToMonitors(targetSocketId: string, event: string, data: any) {
  // Emite apenas para sockets que estão monitorando esta conexão específica
  let emittedCount = 0;
  monitoringSockets.forEach((monitoredSocketId, monitorSocketId) => {
    if (monitoredSocketId === targetSocketId) {
      const monitorSocket = io.sockets.sockets.get(monitorSocketId);
      if (monitorSocket) {
        monitorSocket.emit('monitored_event', {
          targetSocketId,
          event,
          data,
          timestamp: new Date().toISOString()
        });
        emittedCount++;
        console.log(`📡 Evento '${event}' emitido para monitor ${monitorSocketId} (monitorando ${targetSocketId})`);
      }
    }
  });
  if (emittedCount === 0 && monitoringSockets.size > 0) {
    console.log(`⚠️ Evento '${event}' não foi emitido para nenhum monitor (target: ${targetSocketId}, monitores ativos: ${monitoringSockets.size})`);
  }
}

io.on('connection', async (socket: Socket) => {
  console.log('Cliente conectado:', socket.id);

  try {
    // Cria uma nova thread para esta conexão
    const thread = await openai.beta.threads.create();
    threadMap.set(socket.id, thread.id);
    console.log('Thread criada para socket', socket.id, ':', thread.id);

    // Registra informações da conexão
    const connectionInfo: ConnectionInfo = {
      socketId: socket.id,
      threadId: thread.id,
      connectedAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      userAgent: socket.handshake.headers['user-agent'],
      ipAddress: socket.handshake.address || socket.request.socket.remoteAddress
    };
    connectionsMap.set(socket.id, connectionInfo);

    // Notifica todos os monitores sobre nova conexão
    emitToMonitors(socket.id, 'connection', {
      socketId: connectionInfo.socketId,
      threadId: connectionInfo.threadId,
      connectedAt: connectionInfo.connectedAt.toISOString(),
      lastActivity: connectionInfo.lastActivity.toISOString(),
      messageCount: connectionInfo.messageCount,
      userAgent: connectionInfo.userAgent,
      ipAddress: connectionInfo.ipAddress
    });

    // Handler para iniciar monitoramento de uma conexão
    socket.on('start_monitoring', (data: { targetSocketId: string }) => {
      const targetSocket = io.sockets.sockets.get(data.targetSocketId);
      if (targetSocket) {
        monitoringSockets.set(socket.id, data.targetSocketId);
        socket.emit('monitoring_started', {
          targetSocketId: data.targetSocketId,
          message: 'Monitoramento iniciado'
        });
        console.log(`Socket ${socket.id} começou a monitorar ${data.targetSocketId}`);
        
        // Envia informações da conexão atual
        const connInfo = connectionsMap.get(data.targetSocketId);
        if (connInfo) {
          socket.emit('monitored_event', {
            targetSocketId: data.targetSocketId,
            event: 'connection_info',
            data: {
              socketId: connInfo.socketId,
              threadId: connInfo.threadId,
              connectedAt: connInfo.connectedAt.toISOString(),
              lastActivity: connInfo.lastActivity.toISOString(),
              messageCount: connInfo.messageCount,
              userAgent: connInfo.userAgent,
              ipAddress: connInfo.ipAddress
            },
            timestamp: new Date().toISOString()
          });
        }
      } else {
        socket.emit('monitoring_error', {
          message: 'Conexão alvo não encontrada'
        });
      }
    });

    // Handler para parar monitoramento
    socket.on('stop_monitoring', () => {
      monitoringSockets.delete(socket.id);
      socket.emit('monitoring_stopped', {
        message: 'Monitoramento parado'
      });
      console.log(`Socket ${socket.id} parou de monitorar`);
    });

    /**
     * Handler para mensagens do cliente
     * 
     * Processa a mensagem do usuário:
     * 1. Seleciona o agente apropriado
     * 2. Adiciona a mensagem à thread
     * 3. Cria um run para processar a mensagem
     * 4. Aguarda a conclusão e retorna a resposta
     */
    socket.on('message', async (data: { message: string }) => {
      console.log('Mensagem recebida:', data.message);

      const threadId = threadMap.get(socket.id);
      if (!threadId) {
        socket.emit('error', {
          message: 'Thread não encontrada. Reconecte-se.'
        });
        return;
      }

      // Atualiza atividade da conexão
      const connInfo = connectionsMap.get(socket.id);
      if (connInfo) {
        connInfo.lastActivity = new Date();
        connInfo.messageCount++;
        connectionsMap.set(socket.id, connInfo);
      }

      try {
        console.log(`📤 Mensagem recebida: "${data.message}"`);
        console.log(`🔍 Analisando mensagem para selecionar agente...`);

        // Seleciona o agente apropriado para a mensagem
        const { agentId, config } = await agentManager.getAgentForMessage(data.message);
        
        // Notifica o cliente sobre qual agente está sendo usado
        const agentSelectedData = {
          agentName: config.name,
          description: config.description
        };
        socket.emit('agent_selected', agentSelectedData);
        emitToMonitors(socket.id, 'agent_selected', agentSelectedData);

        console.log(`✅ Agente selecionado: "${config.name}" (ID: ${agentId})`);

        // Adiciona mensagem do usuário à thread
        console.log(`📝 Adicionando mensagem à thread...`);

        const userMessage = await openai.beta.threads.messages.create(threadId, {
          role: 'user',
          content: data.message,
        });

        // Emite a mensagem do usuário de volta para o cliente
        const userMessageData = {
          type: 'user',
          message: data.message,
          messageId: userMessage.id,
          details: {
            threadId,
            role: 'user',
            createdAt: userMessage.created_at
          }
        };
        socket.emit('agent_message', userMessageData);
        emitToMonitors(socket.id, 'agent_message', userMessageData);

        console.log(`✅ Mensagem adicionada à thread com sucesso (ID: ${userMessage.id})`);

        // Cria um run para processar a mensagem com o agente selecionado
        console.log(`🚀 Criando run para processar mensagem...`);

        const run = await openai.beta.threads.runs.create(threadId, {
          assistant_id: agentId,
        });

        console.log(`✅ Run criado: ${run.id} (Status: ${run.status})`);

        // Aguarda a conclusão do run e processa ações necessárias
        const responseMessage = await waitForRunCompletion(threadId, run.id, socket);

        console.log(`✅ Run concluído com sucesso`);

        // Envia resposta final de volta para o cliente
        const responseData = {
          message: responseMessage,
          originalMessage: data.message,
          agentName: config.name
        };
        socket.emit('response', responseData);
        emitToMonitors(socket.id, 'response', responseData);

        console.log(`Resposta enviada pelo agente "${config.name}":`, responseMessage);
      } catch (error: any) {
        console.error('Erro ao processar mensagem:', error);
        socket.emit('error', {
          message: error.message || 'Erro ao processar sua mensagem. Por favor, tente novamente.'
        });
      }
    });

    /**
     * Handler para desconexão do cliente
     * 
     * Limpa a thread associada ao socket quando o cliente desconecta
     */
    socket.on('disconnect', async () => {
      console.log('Cliente desconectado:', socket.id);
      
      // Notifica monitores sobre desconexão
      emitToMonitors(socket.id, 'disconnect', { socketId: socket.id });
      
      // Remove dos monitores se estava monitorando
      monitoringSockets.delete(socket.id);
      
      // Remove monitores que estavam monitorando este socket
      const monitorsToRemove: string[] = [];
      monitoringSockets.forEach((targetId, monitorId) => {
        if (targetId === socket.id) {
          monitorsToRemove.push(monitorId);
        }
      });
      monitorsToRemove.forEach(monitorId => {
        const monitorSocket = io.sockets.sockets.get(monitorId);
        if (monitorSocket) {
          monitorSocket.emit('monitored_event', {
            targetSocketId: socket.id,
            event: 'disconnect',
            data: { socketId: socket.id },
            timestamp: new Date().toISOString()
          });
        }
        monitoringSockets.delete(monitorId);
      });
      
      const threadId = threadMap.get(socket.id);
      if (threadId) {
        threadMap.delete(socket.id);
        // Opcionalmente, você pode deletar a thread aqui
        // await openai.beta.threads.del(threadId);
        console.log('Thread removida para socket:', socket.id);
      }
      
      // Remove da lista de conexões
      connectionsMap.delete(socket.id);
    });
  } catch (error) {
    console.error('Erro ao configurar conexão:', error);
    socket.emit('error', {
      message: 'Erro ao inicializar assistente. Tente novamente.'
    });
  }
});

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
async function startServer(retries = 5, delay = isNodemon ? 3000 : 2000): Promise<void> {
  if (isStarting) {
    console.log('⏳ Servidor já está iniciando, aguardando...');
    return;
  }

  isStarting = true;

  return new Promise((resolve, reject) => {
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
      httpServer.listen(PORT, () => {
        console.log(`✅ Servidor rodando na porta ${PORT}`);
        console.log(`🌐 Acesse http://localhost:${PORT} para testar`);
        isStarting = false;
        resolve();
      });

      httpServer.on('error', async (err: NodeJS.ErrnoException) => {
        isStarting = false;
        
        if (err.code === 'EADDRINUSE') {
          console.error(`\n❌ Erro: A porta ${PORT} já está em uso.`);
          
          if (retries > 0) {
            console.log(`🔄 Tentando novamente em ${delay / 1000} segundos... (${retries} tentativas restantes)`);
            await new Promise(resolve => setTimeout(resolve, delay));
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
      });
    }
  });
}

// Inicia o servidor
startServer().catch((err) => {
  console.error('Falha ao iniciar o servidor após várias tentativas:', err);
  process.exit(1);
});
