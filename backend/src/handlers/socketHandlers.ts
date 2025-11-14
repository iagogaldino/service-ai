/**
 * Handlers Socket.IO
 * 
 * Gerencia todos os eventos Socket.IO de forma modular
 */

import { Server, Socket } from 'socket.io';
import { LLMAdapter } from '../llm/adapters/LLMAdapter';
import { AgentManager } from '../agents/agentManager';
import { getLLMAdapter, getCurrentLLMProvider } from '../services/llmService';
import { getThreadId, setThreadId, clearThread, removeThreadTokens } from '../services/threadService';
import { 
  addConnection, 
  getConnection, 
  removeConnection, 
  updateConnectionActivity,
  incrementMessageCount 
} from '../services/connectionService';
import { saveLog } from '../storage/logStorage';
import { loadConversation } from '../storage/conversationStorage';
import { clearConversation } from '../storage/conversationStorage';
import { validateLLMCredentials } from '../validation/credentialValidator';
import { loadConfigFromJson } from '../config/env';
import { processMessage } from '../services/messageService';
import { 
  initializeMonitoring, 
  emitToMonitors, 
  startMonitoring, 
  stopMonitoring,
  cleanupMonitorsForDisconnectedSocket 
} from '../services/monitoringService';
import { ConnectionInfo } from '../types';
import { getActiveWorkflow, getWorkflow } from '../workflows/workflowManager';
import { executeWorkflow } from '../workflows/workflowExecutor';

// Referências globais (serão inicializadas)
let ioInstance: Server;
let llmAdapter: LLMAdapter | undefined;
let agentManager: AgentManager | undefined;

/**
 * Inicializa os handlers Socket.IO
 */
export function initializeSocketHandlers(
  io: Server,
  adapter: LLMAdapter | undefined,
  manager: AgentManager | undefined
): void {
  ioInstance = io;
  llmAdapter = adapter;
  agentManager = manager;
  
  // Inicializa serviço de monitoramento
  initializeMonitoring(io);
  
  // Registra handler de conexão
  io.on('connection', handleConnection);
}

/**
 * Handler principal de conexão
 */
async function handleConnection(socket: Socket): Promise<void> {
  console.log('Cliente conectado:', socket.id);

  try {
    // Verifica se llmAdapter está configurado
    if (!llmAdapter) {
      await handleConnectionWithoutAdapter(socket);
      return;
    }

    // Estado local para esta conexão
    let threadId: string | null = null;
    let awaitingRestore = true;
    let timeoutHandle: NodeJS.Timeout | null = null;

    // Handler para restaurar thread
    socket.on('restore_thread', async (data: { threadId?: string }) => {
      awaitingRestore = false;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
        console.log(`🚫 Cancelando setTimeout de criação de thread para socket ${socket.id}`);
      }
      await handleRestoreThread(socket, data, threadId);
      threadId = getThreadId(socket.id) || null;
    });

    // Timeout para criar thread se não houver restore_thread
    timeoutHandle = setTimeout(async () => {
      const currentThreadId = getThreadId(socket.id);
      
      if (awaitingRestore && !currentThreadId) {
        console.log(`⏳ Ainda aguardando restore_thread para socket ${socket.id}, aguardando mais 200ms...`);
        setTimeout(async () => {
          const finalThreadId = getThreadId(socket.id);
          if (!finalThreadId && llmAdapter) {
            await createNewThreadForSocket(socket);
          }
        }, 200);
        return;
      }
      
      const finalCheckThreadId = getThreadId(socket.id);
      if (!finalCheckThreadId && llmAdapter && !awaitingRestore) {
        await createNewThreadForSocket(socket);
      }
      
      timeoutHandle = null;
    }, 500);

    // Registra outros handlers
    registerSocketHandlers(socket);
    
  } catch (error: any) {
    await handleConnectionError(socket, error);
  }
}

/**
 * Handler para conexão sem adapter configurado
 */
async function handleConnectionWithoutAdapter(socket: Socket): Promise<void> {
  const config = loadConfigFromJson();
  const provider = config?.llmProvider || 'stackspot';
  const providerName = provider === 'openai' ? 'OpenAI' : 'StackSpot';
  
  socket.emit('config_required', {
    type: 'config_required',
    message: `⚠️ ${providerName} não configurado`,
    details: `Para usar o DelsucIA, você precisa configurar suas credenciais do ${providerName}.`,
    action: 'Clique no botão "⚙️ Config" no topo da página para configurar.',
    timestamp: new Date().toISOString()
  });
  
  const connectionInfo: ConnectionInfo = {
    socketId: socket.id,
    threadId: 'pending',
    connectedAt: new Date(),
    lastActivity: new Date(),
    messageCount: 0,
    userAgent: socket.handshake.headers['user-agent'],
    ipAddress: socket.handshake.address || socket.request.socket.remoteAddress
  };
  addConnection(connectionInfo);
  
  saveLog({
    type: 'connection',
    socketId: socket.id,
    llmProvider: getCurrentLLMProvider(),
    metadata: {
      userAgent: connectionInfo.userAgent,
      ipAddress: connectionInfo.ipAddress,
      connectedAt: connectionInfo.connectedAt.toISOString(),
      apiKeyMissing: true
    }
  });
}

/**
 * Handler para restaurar thread
 */
async function handleRestoreThread(
  socket: Socket, 
  data: { threadId?: string },
  currentThreadId: string | null
): Promise<void> {
  console.log(`📥 restore_thread recebido para socket ${socket.id}, threadId: ${data.threadId || 'nenhum'}`);
  
  if (!data.threadId || !llmAdapter) {
    return;
  }

  const existingThreadId = getThreadId(socket.id);
  const currentProvider = getCurrentLLMProvider();
  const savedConversation = loadConversation(data.threadId);
  
  // Verifica se a conversa salva é do mesmo provider atual
  if (savedConversation && savedConversation.llmProvider && savedConversation.llmProvider !== currentProvider) {
    console.log(`⚠️ Thread ${data.threadId} foi criada com provider ${savedConversation.llmProvider}, mas o provider atual é ${currentProvider}. Criando nova thread...`);
    return;
  }

  // Se já existe a mesma thread, apenas reenvia as mensagens
  if (existingThreadId && existingThreadId === data.threadId) {
    console.log(`♻️ Thread já restaurada para socket ${socket.id}: ${data.threadId}, reenviando mensagens...`);
    if (savedConversation && savedConversation.messages && savedConversation.messages.length > 0) {
      console.log(`📚 Reenviando ${savedConversation.messages.length} mensagem(ns) salva(s) para thread ${data.threadId}`);
      setTimeout(() => {
        socket.emit('load_conversation', {
          messages: savedConversation.messages,
          llmProvider: savedConversation.llmProvider || currentProvider
        });
      }, 50);
    }
    socket.emit('thread_restored', { threadId: data.threadId });
    return;
  }

  try {
    // Verifica se a thread ainda existe
    await llmAdapter!.retrieveThread(data.threadId);
    setThreadId(socket.id, data.threadId);
    console.log(`♻️ Thread reutilizada para socket ${socket.id}: ${data.threadId} (adicionada ao map)`);
    
    // Carrega conversa salva
    if (savedConversation && savedConversation.messages && savedConversation.messages.length > 0) {
      console.log(`📚 Carregando ${savedConversation.messages.length} mensagem(ns) salva(s) para thread ${data.threadId}`);
      setTimeout(() => {
        socket.emit('load_conversation', {
          messages: savedConversation.messages,
          llmProvider: savedConversation.llmProvider || currentProvider
        });
      }, 50);
    }
    
    // Atualiza informações da conexão
    const connectionInfo: ConnectionInfo = {
      socketId: socket.id,
      threadId: data.threadId,
      connectedAt: new Date(),
      lastActivity: new Date(),
      messageCount: savedConversation?.messages.filter(m => m.role === 'user').length || 0,
      userAgent: socket.handshake.headers['user-agent'],
      ipAddress: socket.handshake.address || socket.request.socket.remoteAddress
    };
    addConnection(connectionInfo);
    
    socket.emit('thread_restored', { threadId: data.threadId });
  } catch (error) {
    console.log(`⚠️ Thread ${data.threadId} não encontrada ou inválida, criando nova...`);
  }
}

/**
 * Cria uma nova thread para o socket
 */
async function createNewThreadForSocket(socket: Socket): Promise<void> {
  if (!llmAdapter) {
    const config = loadConfigFromJson();
    const provider = config?.llmProvider || 'stackspot';
    const validation = validateLLMCredentials(provider, config);
    console.error(`❌ Não é possível criar thread: ${validation.error || 'LLM adapter não configurado'}`);
    socket.emit('error', {
      message: `Não é possível criar thread: ${validation.error || 'LLM adapter não configurado. Configure o provider primeiro.'}`
    });
    return;
  }
  
  try {
    const thread = await llmAdapter.createThread();
    const threadId = thread.id;
    setThreadId(socket.id, threadId);
    console.log('Thread criada para socket', socket.id, ':', threadId);

    // Carrega conversa salva se existir
    const currentProvider = getCurrentLLMProvider();
    const savedConversation = loadConversation(threadId);
    if (savedConversation && savedConversation.messages && savedConversation.messages.length > 0) {
      if (savedConversation.llmProvider && savedConversation.llmProvider !== currentProvider) {
        console.log(`⚠️ Conversa salva é do provider ${savedConversation.llmProvider}, mas o provider atual é ${currentProvider}. Não carregando conversa.`);
      } else {
        console.log(`📚 Carregando ${savedConversation.messages.length} mensagem(ns) salva(s) para thread ${threadId}`);
        setTimeout(() => {
          socket.emit('load_conversation', {
            messages: savedConversation.messages,
            llmProvider: savedConversation.llmProvider || currentProvider
          });
        }, 50);
      }
    }
    
    // Emite threadId para o frontend
    socket.emit('thread_created', { threadId: threadId });
    
    // Registra informações da conexão
    const connectionInfo: ConnectionInfo = {
      socketId: socket.id,
      threadId: threadId,
      connectedAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      userAgent: socket.handshake.headers['user-agent'],
      ipAddress: socket.handshake.address || socket.request.socket.remoteAddress
    };
    addConnection(connectionInfo);
    
    // Notifica monitores
    emitToMonitors(socket.id, 'connection', {
      socketId: connectionInfo.socketId,
      threadId: connectionInfo.threadId,
      connectedAt: connectionInfo.connectedAt.toISOString(),
      lastActivity: connectionInfo.lastActivity.toISOString(),
      messageCount: connectionInfo.messageCount,
      userAgent: connectionInfo.userAgent,
      ipAddress: connectionInfo.ipAddress
    });
    
    // Log de conexão
    saveLog({
      type: 'connection',
      socketId: socket.id,
      threadId: threadId,
      llmProvider: getCurrentLLMProvider(),
      metadata: {
        userAgent: connectionInfo.userAgent,
        ipAddress: connectionInfo.ipAddress,
        restored: false
      }
    });
  } catch (error: any) {
    console.error('❌ Erro ao criar thread:', error);
    socket.emit('error', {
      message: `Erro ao criar thread: ${error.message || 'Erro desconhecido'}`
    });
  }
}

/**
 * Registra todos os handlers Socket.IO
 */
function registerSocketHandlers(socket: Socket): void {
  // Handler para iniciar monitoramento
  socket.on('start_monitoring', (data: { targetSocketId: string }) => {
    const result = startMonitoring(socket, data.targetSocketId);
    if (!result.success) {
      socket.emit('monitoring_error', {
        message: result.error || 'Erro ao iniciar monitoramento'
      });
    } else {
      console.log(`Socket ${socket.id} começou a monitorar ${data.targetSocketId}`);
    }
  });

  // Handler para parar monitoramento
  socket.on('stop_monitoring', () => {
    stopMonitoring(socket);
    console.log(`Socket ${socket.id} parou de monitorar`);
  });

  // Handler para limpar conversa
  socket.on('clear_conversation', async () => {
    await handleClearConversation(socket);
  });

  // Handler para mensagens
  socket.on('message', async (data: { message: string }) => {
    await handleMessage(socket, data);
  });

  // Handler para executar workflow
  socket.on('execute_workflow', async (data: { workflowId?: string; message: string }) => {
    await handleExecuteWorkflow(socket, data);
  });

  // Handler para desconexão
  socket.on('disconnect', async () => {
    await handleDisconnect(socket);
  });
}

/**
 * Handler para executar workflow
 */
async function handleExecuteWorkflow(
  socket: Socket,
  data: { workflowId?: string; message: string; workflow?: any }
): Promise<void> {
  if (!agentManager) {
    socket.emit('error', {
      message: 'AgentManager não configurado. Não é possível executar workflow.'
    });
    return;
  }

  try {
    let workflow;
    
    // Se workflow fornecido diretamente (do frontend), usa ele
    if (data.workflow) {
      workflow = data.workflow;
      // Garante que o workflow tem um ID válido
      if (!workflow.id) {
        workflow.id = `temp-workflow-${Date.now()}`;
      }
      console.log(`✅ Usando workflow fornecido do frontend: "${workflow.name}" (ID: ${workflow.id})`);
      console.log(`📊 Workflow tem ${workflow.nodes?.length || 0} nós e ${workflow.edges?.length || 0} edges`);
      console.log(`📋 Tipos de nós:`, workflow.nodes?.map((n: any) => `${n.id}(${n.type})`).join(', ') || 'nenhum');
      const startNodes = workflow.nodes?.filter((n: any) => n.type === 'start') || [];
      console.log(`🚀 Nós Start encontrados: ${startNodes.length}`, startNodes.map((n: any) => n.id));
    } else if (data.workflowId) {
      // Se workflowId fornecido, busca workflow específico
      workflow = await getWorkflow(data.workflowId);
      if (!workflow) {
        socket.emit('error', {
          message: `Workflow ${data.workflowId} não encontrado`
        });
        return;
      }
    } else {
      // Caso contrário, usa workflow ativo
      workflow = await getActiveWorkflow();
      if (!workflow) {
        socket.emit('error', {
          message: 'Nenhum workflow ativo. Selecione um workflow ou forneça um workflowId.'
        });
        return;
      }
    }

    console.log(`🔄 Executando workflow "${workflow.name}" com mensagem: "${data.message}"`);

    // Notifica início da execução
    socket.emit('workflow_started', {
      workflowId: workflow.id,
      workflowName: workflow.name,
      message: data.message
    });

    // Executa workflow
    const result = await executeWorkflow(workflow, data.message, agentManager, socket);

    if (result.success) {
      socket.emit('workflow_completed', {
        workflowId: workflow.id,
        workflowName: workflow.name,
        result: result.result,
        path: result.path,
        context: result.context
      });
    } else {
      socket.emit('workflow_error', {
        workflowId: workflow.id,
        workflowName: workflow.name,
        error: result.error,
        path: result.path
      });
    }
  } catch (error: any) {
    console.error('❌ Erro ao executar workflow:', error);
    socket.emit('error', {
      message: `Erro ao executar workflow: ${error.message || 'Erro desconhecido'}`
    });
  }
}

/**
 * Handler para limpar conversa
 */
async function handleClearConversation(socket: Socket): Promise<void> {
  const oldThreadId = getThreadId(socket.id);
  
  if (!llmAdapter) {
    const config = loadConfigFromJson();
    const provider = config?.llmProvider || 'stackspot';
    const validation = validateLLMCredentials(provider, config);
    socket.emit('error', {
      message: validation.error || 'LLM Provider não configurado. Configure o provider primeiro.'
    });
    return;
  }

  try {
    // Limpa conversa antiga
    if (oldThreadId) {
      clearConversation(oldThreadId, socket.id);
      console.log(`🗑️ Limpando conversa para thread ${oldThreadId} e socket ${socket.id}`);
    } else {
      clearConversation('', socket.id);
    }

    // Cria nova thread
    const newThread = await llmAdapter.createThread();
    const newThreadId = newThread.id;
    setThreadId(socket.id, newThreadId);
    console.log(`🆕 Nova thread criada após limpar conversa: ${newThreadId} (socket: ${socket.id})`);

    // Atualiza informações da conexão
    const connectionInfo: ConnectionInfo = {
      socketId: socket.id,
      threadId: newThreadId,
      connectedAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      userAgent: socket.handshake.headers['user-agent'],
      ipAddress: socket.handshake.address || socket.request.socket.remoteAddress
    };
    addConnection(connectionInfo);

    // Emite eventos
    socket.emit('conversation_cleared', {
      message: 'Conversa limpa com sucesso',
      newThreadId: newThreadId
    });
    socket.emit('thread_created', { threadId: newThreadId });

    // Log
    saveLog({
      type: 'connection',
      socketId: socket.id,
      threadId: newThreadId,
      llmProvider: getCurrentLLMProvider(),
      metadata: {
        action: 'conversation_cleared',
        oldThreadId: oldThreadId,
        newThreadId: newThreadId
      }
    });
  } catch (error: any) {
    console.error('Erro ao limpar conversa e criar nova thread:', error);
    socket.emit('error', {
      message: 'Erro ao limpar conversa'
    });
  }
}

/**
 * Handler para mensagens
 */
async function handleMessage(socket: Socket, data: { message: string; executeWorkflow?: boolean; workflow?: any }): Promise<void> {
  console.log('Mensagem recebida:', data.message);

  // Verifica se llmAdapter está configurado
  if (!llmAdapter || !agentManager) {
    const config = loadConfigFromJson();
    const provider = config?.llmProvider || 'stackspot';
    const validation = validateLLMCredentials(provider, config);
    
    socket.emit('config_required', {
      type: 'config_required',
      message: '⚠️ LLM Provider não configurado',
      details: validation.error || 'Para usar o DelsucIA, você precisa configurar um LLM Provider (OpenAI ou StackSpot).',
      action: 'Clique no botão "⚙️ Config" no topo da página para configurar.',
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Se executeWorkflow estiver true, executa workflow em vez de processar mensagem diretamente
  if (data.executeWorkflow) {
    await handleExecuteWorkflow(socket, { 
      message: data.message,
      workflow: data.workflow // Passa o workflow do frontend se fornecido
    });
    return;
  }

  // Processa mensagem usando o serviço
  await processMessage(socket, data.message, llmAdapter, agentManager);
}

/**
 * Handler para desconexão
 */
async function handleDisconnect(socket: Socket): Promise<void> {
  console.log('Cliente desconectado:', socket.id);
  
  const disconnectThreadId = getThreadId(socket.id);
  const connInfo = getConnection(socket.id);
  
  // Log de desconexão
  saveLog({
    type: 'disconnection',
    socketId: socket.id,
    threadId: disconnectThreadId,
    llmProvider: getCurrentLLMProvider(),
    metadata: {
      messageCount: connInfo?.messageCount || 0,
      connectedAt: connInfo?.connectedAt.toISOString(),
      lastActivity: connInfo?.lastActivity.toISOString()
    }
  });
  
  // Notifica monitores
  emitToMonitors(socket.id, 'disconnect', { socketId: socket.id });
  
  // Limpa monitores
  cleanupMonitorsForDisconnectedSocket(socket.id);
  
  // Limpa thread e tokens
  if (disconnectThreadId) {
    clearThread(socket.id);
    removeThreadTokens(disconnectThreadId);
    console.log('Thread removida para socket:', socket.id);
  }
  
  // Remove da lista de conexões
  removeConnection(socket.id);
}

/**
 * Handler para erros de conexão
 */
async function handleConnectionError(socket: Socket, error: any): Promise<void> {
  console.error('Erro ao configurar conexão:', error);
  
  const isAuthError = error?.status === 401 || 
                     error?.code === 'invalid_api_key' ||
                     error?.message?.toLowerCase().includes('incorrect api key') ||
                     error?.message?.toLowerCase().includes('invalid api key') ||
                     error?.error?.type === 'invalid_request_error' ||
                     error?.error?.code === 'invalid_api_key';
  
  if (isAuthError) {
    socket.emit('api_key_invalid', {
      type: 'api_key_invalid',
      message: '❌ API Key inválida ou incorreta',
      details: 'A API Key configurada está incorreta ou inválida. Por favor, verifique sua API Key.',
      action: 'Clique no botão "⚙️ Config" no topo da página para configurar uma API Key válida.',
      errorMessage: error?.error?.message || error?.message || 'API key inválida',
      timestamp: new Date().toISOString()
    });
    
    saveLog({
      type: 'error',
      socketId: socket.id,
      error: error?.error?.message || error?.message || 'API key inválida',
      errorStack: error.stack,
      llmProvider: getCurrentLLMProvider(),
      metadata: {
        errorName: error.name || 'AuthenticationError',
        errorType: 'api_key_invalid',
        statusCode: error?.status || 401,
        errorCode: error?.code || error?.error?.code || 'invalid_api_key'
      }
    });
  } else {
    saveLog({
      type: 'error',
      socketId: socket.id,
      error: error.message || 'Erro desconhecido ao configurar conexão',
      errorStack: error.stack,
      llmProvider: getCurrentLLMProvider(),
      metadata: {
        errorName: error.name,
        errorType: 'connection_setup'
      }
    });
    
    socket.emit('error', {
      message: 'Erro ao inicializar assistente. Tente novamente.'
    });
  }
}

/**
 * Atualiza referências do adapter e manager
 */
export function updateAdapterAndManager(adapter: LLMAdapter | undefined, manager: AgentManager | undefined): void {
  llmAdapter = adapter;
  agentManager = manager;
}

