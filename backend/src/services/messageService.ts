/**
 * Serviço de processamento de mensagens
 */

import { Socket } from 'socket.io';
import { LLMAdapter } from '../llm/adapters/LLMAdapter';
import { AgentManager } from '../agents/agentManager';
import { AgentConfig } from '../agents/config';
import { fileSystemFunctions } from '../tools/fileSystemTools';
import { TokenUsage } from '../types';
import { getLLMAdapter, getCurrentLLMProvider } from './llmService';
import { getThreadId, setThreadId, getThreadTokens, updateThreadTokens } from './threadService';
import { updateConnectionActivity, incrementMessageCount } from './connectionService';
import { saveLog } from '../storage/logStorage';
import { saveTokens } from '../storage/tokenStorage';
import { saveConversationMessage } from '../storage/conversationStorage';
import { calculateTokenCost } from '../utils/tokenCalculator';
import { emitToMonitors } from './monitoringService';
import { processTemplate } from '../utils/templateProcessor';

/**
 * Detecta se a mensagem contém uma solicitação de leitura de arquivo
 */
export function detectFileReadRequest(message: string): { detected: boolean; filePath?: string } {
  const filePathPattern = /(?:ler|leia|read|conteúdo|conteudo|dados|o que tem|quais dados|mostre|mostrar|exiba|exibir|abrir|abre)\s+(?:o\s+)?(?:arquivo\s+)?([A-Za-z]:[\\\/][^\s]+|\.\.?[\\\/][^\s]+|[^\s]+\.[a-zA-Z0-9]+)/i;
  const match = message.match(filePathPattern);
  
  if (match && match[1]) {
    return { detected: true, filePath: match[1].trim() };
  }
  
  return { detected: false };
}

/**
 * Lê arquivo e retorna mensagem aprimorada com conteúdo
 */
export async function enhanceMessageWithFile(message: string, filePath: string): Promise<{ enhancedMessage: string; fileContent: string }> {
  try {
    const fileContent = await fileSystemFunctions.readFile(filePath);
    console.log(`✅ Arquivo lido com sucesso (${fileContent.length} caracteres)`);
    const enhancedMessage = `${message}\n\n[Conteúdo do arquivo ${filePath}]:\n${fileContent}`;
    return { enhancedMessage, fileContent };
  } catch (error: any) {
    console.log(`⚠️ Erro ao ler arquivo automaticamente: ${error.message}`);
    return { enhancedMessage: message, fileContent: '' };
  }
}

/**
 * Processa uma mensagem do usuário e retorna a resposta do agente
 */
export async function processMessage(
  socket: Socket,
  message: string,
  llmAdapter: LLMAdapter,
  agentManager: AgentManager
): Promise<{ success: boolean; error?: string }> {
  try {
    let threadId = getThreadId(socket.id);
    
    // Se não há thread, cria uma nova automaticamente
    if (!threadId) {
      console.log(`⚠️ Thread não encontrada para socket ${socket.id}, criando nova automaticamente...`);
      try {
        const newThread = await llmAdapter.createThread();
        threadId = newThread.id;
        setThreadId(socket.id, threadId);
        
        // Emite threadId para o frontend salvar no localStorage
        socket.emit('thread_created', { threadId: threadId });
        
        console.log(`✅ Thread criada automaticamente para socket ${socket.id}: ${threadId}`);
      } catch (error: any) {
        console.error(`❌ Erro ao criar thread automaticamente:`, error);
        socket.emit('error', {
          message: `Erro ao criar thread: ${error.message}`
        });
        return { success: false, error: error.message };
      }
    }

    // Atualiza atividade da conexão
    updateConnectionActivity(socket.id);
    incrementMessageCount(socket.id);

    console.log(`📤 Mensagem recebida: "${message}"`);
    
    // Detecta se o usuário está pedindo para ler um arquivo
    const fileDetection = detectFileReadRequest(message);
    let enhancedMessage = message;
    let fileContent = '';
    
    if (fileDetection.detected && fileDetection.filePath) {
      console.log(`📂 Detectado pedido de leitura de arquivo: ${fileDetection.filePath}`);
      const result = await enhanceMessageWithFile(message, fileDetection.filePath);
      enhancedMessage = result.enhancedMessage;
      fileContent = result.fileContent;
    }
    
    console.log(`🔍 Analisando mensagem para selecionar agente...`);

    // Seleciona o agente apropriado para a mensagem
    const { agentId, config } = await agentManager.getAgentForMessage(message);
    
    // Processa templates nas instruções do agente (substitui {{ input_user }} pela mensagem)
    const processedInstructions = processTemplate(config.instructions, {
      input_user: enhancedMessage,
    });
    
    // Cria uma cópia do config com instruções processadas
    const processedConfig = {
      ...config,
      instructions: processedInstructions,
    };
    
    // Atualiza o agente com as instruções processadas antes de processar a mensagem
    if (processedInstructions !== config.instructions) {
      console.log(`🔄 Processando templates nas instruções do agente "${config.name}"...`);
      console.log(`   Instruções originais: "${config.instructions.substring(0, 100)}..."`);
      console.log(`   Instruções processadas: "${processedInstructions.substring(0, 100)}..."`);
      
      // Atualiza o agente com as instruções processadas
      await llmAdapter.getOrCreateAgent(processedConfig);
    }
    
    // Notifica o cliente sobre qual agente está sendo usado
    const agentSelectedData = {
      agentName: config.name,
      description: config.description,
      llmProvider: getCurrentLLMProvider()
    };
    socket.emit('agent_selected', agentSelectedData);
    emitToMonitors(socket.id, 'agent_selected', agentSelectedData);

    console.log(`✅ Agente selecionado: "${config.name}" (ID: ${agentId})`);

    // Log de seleção de agente
    saveLog({
      type: 'agent_selection',
      socketId: socket.id,
      threadId: threadId,
      agentName: config.name,
      agentId: agentId,
      message: message,
      llmProvider: getCurrentLLMProvider(),
      metadata: {
        originalInstructions: config.instructions,
        processedInstructions: processedInstructions,
      }
    });

    // Adiciona mensagem do usuário à thread
    console.log(`📝 Adicionando mensagem à thread...`);
    const userMessage = await llmAdapter.addMessage(threadId, 'user', enhancedMessage);

    // Emite a mensagem do usuário de volta para o cliente
    const userMessageData = {
      type: 'user',
      message: message,
      messageId: userMessage.id,
      details: {
        threadId,
        role: 'user',
        createdAt: userMessage.created_at
      }
    };
    socket.emit('agent_message', userMessageData);
    emitToMonitors(socket.id, 'agent_message', userMessageData);
    
    // Se um arquivo foi lido, notifica o cliente
    if (fileContent && fileDetection.detected && fileDetection.filePath) {
      socket.emit('file_read', {
        filePath: fileDetection.filePath,
        content: fileContent.substring(0, 500) + (fileContent.length > 500 ? '...' : ''),
        fullLength: fileContent.length
      });
    }

    // Salva mensagem do usuário na conversa
    saveConversationMessage(threadId, socket.id, 'user', message, undefined, undefined, getCurrentLLMProvider());

    console.log(`✅ Mensagem adicionada à thread com sucesso (ID: ${userMessage.id})`);

    // Log de mensagem enviada
    saveLog({
      type: 'message_sent',
      socketId: socket.id,
      threadId: threadId,
      message: message,
      agentName: config.name,
      llmProvider: getCurrentLLMProvider(),
      metadata: {
        messageId: userMessage.id,
        createdAt: userMessage.created_at
      }
    });

    // Cria um run para processar a mensagem com o agente selecionado (usando config processado)
    console.log(`🚀 Criando run para processar mensagem...`);
    const executionStartTime = Date.now();
    const run = await llmAdapter.createRun(threadId, agentId);

    console.log(`✅ Run criado: ${run.id} (Status: ${run.status})`);

    // Emite evento de início de execução com timestamp
    socket.emit('agent_execution_start', {
      agentName: config.name,
      agentId: agentId,
      runId: run.id,
      startTime: executionStartTime,
      threadId: threadId,
    });
    emitToMonitors(socket.id, 'agent_execution_start', {
      agentName: config.name,
      agentId: agentId,
      runId: run.id,
      startTime: executionStartTime,
      threadId: threadId,
    });

    // Log de criação de run
    saveLog({
      type: 'run_status',
      socketId: socket.id,
      threadId: threadId,
      runId: run.id,
      agentName: config.name,
      status: run.status,
      llmProvider: getCurrentLLMProvider(),
      metadata: {
        assistantId: agentId,
        executionStartTime: executionStartTime,
      }
    });

    // Aguarda a conclusão do run (o adapter já trata tool calling internamente)
    const { message: responseMessage, tokenUsage } = await llmAdapter.waitForRunCompletion(threadId, run.id, socket);
    const executionEndTime = Date.now();
    const executionDuration = executionEndTime - executionStartTime;

    console.log(`✅ Run concluído com sucesso em ${executionDuration}ms`);

    // Emite evento de fim de execução com duração
    socket.emit('agent_execution_end', {
      agentName: config.name,
      agentId: agentId,
      runId: run.id,
      startTime: executionStartTime,
      endTime: executionEndTime,
      duration: executionDuration,
      durationSeconds: (executionDuration / 1000).toFixed(2),
      threadId: threadId,
    });
    emitToMonitors(socket.id, 'agent_execution_end', {
      agentName: config.name,
      agentId: agentId,
      runId: run.id,
      startTime: executionStartTime,
      endTime: executionEndTime,
      duration: executionDuration,
      durationSeconds: (executionDuration / 1000).toFixed(2),
      threadId: threadId,
    });

    // Atualiza tokens acumulados na thread
    updateThreadTokens(threadId, tokenUsage);
    const threadTokens = getThreadTokens(threadId);

    // Obtém o LLM provider atual
    const currentLLMProvider = getCurrentLLMProvider();

    // Envia resposta final de volta para o cliente com informações de tokens
    const responseData = {
      message: responseMessage,
      originalMessage: message,
      agentName: config.name,
      llmProvider: currentLLMProvider,
      tokenUsage: {
        promptTokens: tokenUsage.promptTokens,
        completionTokens: tokenUsage.completionTokens,
        totalTokens: tokenUsage.totalTokens
      },
      accumulatedTokenUsage: {
        promptTokens: threadTokens.promptTokens,
        completionTokens: threadTokens.completionTokens,
        totalTokens: threadTokens.totalTokens
      }
    };
    socket.emit('response', responseData);
    emitToMonitors(socket.id, 'response', responseData);

    console.log(`Resposta enviada pelo agente "${config.name}":`, responseMessage);
    console.log(`💰 Tokens desta mensagem: ${tokenUsage.totalTokens} (prompt: ${tokenUsage.promptTokens}, completion: ${tokenUsage.completionTokens})`);
    console.log(`💰 Total acumulado na thread: ${threadTokens.totalTokens} (prompt: ${threadTokens.promptTokens}, completion: ${threadTokens.completionTokens})`);

    // Salva mensagem do assistente na conversa
    saveConversationMessage(
      threadId,
      socket.id,
      'assistant',
      responseMessage,
      config.name,
      tokenUsage,
      currentLLMProvider
    );

    // Salva tokens em arquivo JSON
    saveTokens(
      threadId,
      config.name,
      message,
      tokenUsage,
      threadTokens,
      config.model,
      currentLLMProvider
    );

    // Calcula custos para os logs
    const tokenCost = calculateTokenCost(tokenUsage, config.model);
    const accumulatedTokenCost = calculateTokenCost(threadTokens, config.model);

    // Log de resposta
    saveLog({
      type: 'response',
      socketId: socket.id,
      threadId: threadId,
      runId: run.id,
      agentName: config.name,
      agentId: agentId,
      message: message,
      response: responseMessage,
      tokenUsage: tokenUsage,
      accumulatedTokenUsage: threadTokens,
      tokenCost: tokenCost,
      accumulatedTokenCost: accumulatedTokenCost,
      llmProvider: currentLLMProvider,
      metadata: {
        responseLength: responseMessage.length,
        model: config.model
      }
    });

    // Log de uso de tokens
    saveLog({
      type: 'token_usage',
      socketId: socket.id,
      threadId: threadId,
      runId: run.id,
      agentName: config.name,
      tokenUsage: tokenUsage,
      accumulatedTokenUsage: threadTokens,
      tokenCost: tokenCost,
      accumulatedTokenCost: accumulatedTokenCost,
      llmProvider: currentLLMProvider,
      metadata: {
        model: config.model
      }
    });

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao processar mensagem:', error);
    
    // Log de erro
    const errorThreadId = getThreadId(socket.id);
    saveLog({
      type: 'error',
      socketId: socket.id,
      threadId: errorThreadId,
      error: error.message || 'Erro desconhecido',
      errorStack: error.stack,
      llmProvider: getCurrentLLMProvider(),
      metadata: {
        errorName: error.name,
        errorType: 'message_processing'
      }
    });
    
    socket.emit('error', {
      message: error.message || 'Erro ao processar sua mensagem. Por favor, tente novamente.'
    });

    return { success: false, error: error.message };
  }
}

/**
 * Processa uma mensagem do usuário usando um agente específico (para workflows)
 * 
 * Esta função é similar a processMessage, mas usa um agente específico em vez de selecionar pela mensagem
 * 
 * @param socket - Socket.IO do cliente
 * @param message - Mensagem do usuário
 * @param llmAdapter - Adaptador de LLM
 * @param agentId - ID do agente a ser usado
 * @param agentConfig - Configuração do agente
 * @returns Resultado do processamento
 */
export async function processMessageWithAgent(
  socket: Socket,
  message: string,
  llmAdapter: LLMAdapter,
  agentId: string,
  agentConfig: AgentConfig
): Promise<{ success: boolean; error?: string; response?: string }> {
  try {
    let threadId = getThreadId(socket.id);
    
    // Se não há thread, cria uma nova automaticamente
    if (!threadId) {
      console.log(`⚠️ Thread não encontrada para socket ${socket.id}, criando nova automaticamente...`);
      try {
        const newThread = await llmAdapter.createThread();
        threadId = newThread.id;
        setThreadId(socket.id, threadId);
        
        // Emite threadId para o frontend salvar no localStorage
        socket.emit('thread_created', { threadId: threadId });
        
        console.log(`✅ Thread criada automaticamente para socket ${socket.id}: ${threadId}`);
      } catch (error: any) {
        console.error(`❌ Erro ao criar thread automaticamente:`, error);
        socket.emit('error', {
          message: `Erro ao criar thread: ${error.message}`
        });
        return { success: false, error: error.message };
      }
    }

    // Atualiza atividade da conexão
    updateConnectionActivity(socket.id);
    incrementMessageCount(socket.id);

    console.log(`📤 Mensagem recebida: "${message}"`);

    // Detecta se o usuário está pedindo para ler um arquivo
    const fileDetection = detectFileReadRequest(message);
    let enhancedMessage = message;
    let fileContent = '';

    if (fileDetection.detected && fileDetection.filePath) {
      console.log(`📂 Detectado pedido de leitura de arquivo: ${fileDetection.filePath}`);
      const result = await enhanceMessageWithFile(message, fileDetection.filePath);
      enhancedMessage = result.enhancedMessage;
      fileContent = result.fileContent;
    }

    // Notifica o cliente sobre qual agente está sendo usado
    const agentSelectedData = {
      agentName: agentConfig.name,
      description: agentConfig.description,
      llmProvider: getCurrentLLMProvider()
    };
    socket.emit('agent_selected', agentSelectedData);
    emitToMonitors(socket.id, 'agent_selected', agentSelectedData);

    // O agente já foi criado/atualizado no workflowExecutor com as instruções processadas
    // Não precisamos chamar getOrCreateAgent novamente aqui
    console.log(`✅ Usando agente específico: "${agentConfig.name}" (ID: ${agentId})`);

    // Log de seleção de agente
    // Nota: agentConfig já vem com instruções processadas do workflowExecutor
    saveLog({
      type: 'agent_selection',
      socketId: socket.id,
      threadId: threadId,
      agentName: agentConfig.name,
      agentId: agentId,
      message: message,
      llmProvider: getCurrentLLMProvider(),
      metadata: {
        originalInstructions: agentConfig.instructions,
        processedInstructions: agentConfig.instructions, // Já processadas no workflowExecutor
      }
    });

    // Adiciona mensagem do usuário à thread
    console.log(`📝 Adicionando mensagem à thread...`);
    const userMessage = await llmAdapter.addMessage(threadId, 'user', enhancedMessage);

    // Emite a mensagem do usuário de volta para o cliente
    const userMessageData = {
      type: 'user',
      message: message,
      messageId: userMessage.id,
      details: {
        threadId,
        role: 'user',
        createdAt: userMessage.created_at
      }
    };
    socket.emit('agent_message', userMessageData);
    emitToMonitors(socket.id, 'agent_message', userMessageData);

    // Se um arquivo foi lido, notifica o cliente
    if (fileContent && fileDetection.detected && fileDetection.filePath) {
      socket.emit('file_read', {
        filePath: fileDetection.filePath,
        content: fileContent.substring(0, 500) + (fileContent.length > 500 ? '...' : ''),
        fullLength: fileContent.length
      });
    }

    // Operações de storage são feitas de forma assíncrona (não bloqueiam)
    // Salva mensagem do usuário na conversa (assíncrono)
    saveConversationMessage(threadId, socket.id, 'user', message, undefined, undefined, getCurrentLLMProvider());

    console.log(`✅ Mensagem adicionada à thread com sucesso (ID: ${userMessage.id})`);

    // Log de mensagem enviada (assíncrono, não bloqueia)
    const messageSentTime = Date.now();
    saveLog({
      type: 'message_sent',
      socketId: socket.id,
      threadId: threadId,
      message: message,
      agentName: agentConfig.name,
      llmProvider: getCurrentLLMProvider(),
      metadata: {
        messageId: userMessage.id,
        createdAt: userMessage.created_at
      }
    });

    // Cria um run para processar a mensagem com o agente específico (usando config processado)
    console.log(`🚀 Criando run para processar mensagem com agente "${agentConfig.name}"...`);
    console.log(`   ThreadId: ${threadId}`);
    console.log(`   AgentId: ${agentId}`);
    console.log(`   Provider: ${getCurrentLLMProvider()}`);
    const executionStartTime = Date.now();
    const timeBeforeRun = Date.now();
    const timeSinceMessageSent = timeBeforeRun - messageSentTime;
    if (timeSinceMessageSent > 500) {
      console.warn(`⚠️ Tempo entre message_sent e criação de run: ${timeSinceMessageSent}ms (acima do esperado)`);
    }
    
    const runStartTime = Date.now();
    const run = await llmAdapter.createRun(threadId, agentId, socket);
    const runCreationTime = Date.now() - runStartTime;
    const totalTimeToRun = Date.now() - messageSentTime;
    
    console.log(`⏱️ Tempos: message_sent→run: ${timeSinceMessageSent}ms, criação run: ${runCreationTime}ms, total: ${totalTimeToRun}ms`);
    
    if (runCreationTime > 1000) {
      console.warn(`⚠️ Criação de run levou ${runCreationTime}ms (acima do esperado)`);
    }
    if (totalTimeToRun > 1500) {
      console.warn(`⚠️ Tempo total entre message_sent e run criado: ${totalTimeToRun}ms (acima do esperado)`);
    }

    console.log(`✅ Run criado: ${run.id} (Status: ${run.status})`);

    // Emite evento de início de execução com timestamp
    socket.emit('agent_execution_start', {
      agentName: agentConfig.name,
      agentId: agentId,
      runId: run.id,
      startTime: executionStartTime,
      threadId: threadId,
    });
    emitToMonitors(socket.id, 'agent_execution_start', {
      agentName: agentConfig.name,
      agentId: agentId,
      runId: run.id,
      startTime: executionStartTime,
      threadId: threadId,
    });

    // Log de criação de run
    saveLog({
      type: 'run_status',
      socketId: socket.id,
      threadId: threadId,
      runId: run.id,
      agentName: agentConfig.name,
      status: run.status,
      llmProvider: getCurrentLLMProvider(),
      metadata: {
        assistantId: agentId,
        executionStartTime: executionStartTime,
      }
    });

    // Aguarda a conclusão do run (o adapter já trata tool calling internamente)
    const { message: responseMessage, tokenUsage } = await llmAdapter.waitForRunCompletion(threadId, run.id, socket);
    const executionEndTime = Date.now();
    const executionDuration = executionEndTime - executionStartTime;

    console.log(`✅ Run concluído com sucesso em ${executionDuration}ms`);

    // Emite evento de fim de execução com duração
    socket.emit('agent_execution_end', {
      agentName: agentConfig.name,
      agentId: agentId,
      runId: run.id,
      startTime: executionStartTime,
      endTime: executionEndTime,
      duration: executionDuration,
      durationSeconds: (executionDuration / 1000).toFixed(2),
      threadId: threadId,
    });
    emitToMonitors(socket.id, 'agent_execution_end', {
      agentName: agentConfig.name,
      agentId: agentId,
      runId: run.id,
      startTime: executionStartTime,
      endTime: executionEndTime,
      duration: executionDuration,
      durationSeconds: (executionDuration / 1000).toFixed(2),
      threadId: threadId,
    });

    // Atualiza tokens acumulados na thread
    updateThreadTokens(threadId, tokenUsage);
    const threadTokens = getThreadTokens(threadId);

    // Obtém o LLM provider atual
    const currentLLMProvider = getCurrentLLMProvider();

    // Envia resposta final de volta para o cliente com informações de tokens
    const responseData = {
      message: responseMessage,
      originalMessage: message,
      agentName: agentConfig.name,
      llmProvider: currentLLMProvider,
      tokenUsage: {
        promptTokens: tokenUsage.promptTokens,
        completionTokens: tokenUsage.completionTokens,
        totalTokens: tokenUsage.totalTokens
      },
      accumulatedTokenUsage: {
        promptTokens: threadTokens.promptTokens,
        completionTokens: threadTokens.completionTokens,
        totalTokens: threadTokens.totalTokens
      }
    };
    socket.emit('response', responseData);
    emitToMonitors(socket.id, 'response', responseData);

    console.log(`Resposta enviada pelo agente "${agentConfig.name}":`, responseMessage);
    console.log(`💰 Tokens desta mensagem: ${tokenUsage.totalTokens} (prompt: ${tokenUsage.promptTokens}, completion: ${tokenUsage.completionTokens})`);
    console.log(`💰 Total acumulado na thread: ${threadTokens.totalTokens} (prompt: ${threadTokens.promptTokens}, completion: ${threadTokens.completionTokens})`);

    // Calcula custos para os logs (antes de retornar para não bloquear)
    const tokenCost = calculateTokenCost(tokenUsage, agentConfig.model || 'gpt-4-turbo-preview');
    const accumulatedTokenCost = calculateTokenCost(threadTokens, agentConfig.model || 'gpt-4-turbo-preview');

    // Operações de storage são feitas de forma assíncrona após retornar a resposta
    // Isso não bloqueia a resposta ao usuário
    // Garante que threadId seja string (não undefined)
    if (threadId) {
      const safeThreadId: string = threadId; // Type narrowing para garantir que é string
      
      // Salva logs críticos primeiro (com tratamento de erro individual)
      // Log de resposta é crítico e deve ser salvo mesmo se outras operações falharem
      Promise.resolve().then(() => {
        try {
          saveLog({
            type: 'response',
            socketId: socket.id,
            threadId: safeThreadId,
            runId: run.id,
            agentName: agentConfig.name,
            agentId: agentId,
            message: message,
            response: responseMessage,
            tokenUsage: tokenUsage,
            accumulatedTokenUsage: threadTokens,
            tokenCost: tokenCost,
            accumulatedTokenCost: accumulatedTokenCost,
            llmProvider: currentLLMProvider,
            metadata: {
              responseLength: responseMessage.length,
              model: agentConfig.model || 'gpt-4-turbo-preview'
            }
          });
        } catch (error: any) {
          console.error('❌ Erro crítico ao salvar log de response:', error);
        }
      }).catch(error => {
        console.error('❌ Erro crítico ao salvar log de response:', error);
      });

      // Outras operações de storage em paralelo
      Promise.all([
        // Salva mensagem do assistente na conversa (assíncrono)
        Promise.resolve().then(() => {
          try {
            saveConversationMessage(
              safeThreadId,
              socket.id,
              'assistant',
              responseMessage,
              agentConfig.name,
              tokenUsage,
              currentLLMProvider
            );
          } catch (error: any) {
            console.error('❌ Erro ao salvar conversação:', error.message);
          }
        }),
        // Salva tokens em arquivo JSON (assíncrono)
        Promise.resolve().then(() => {
          try {
            saveTokens(
              safeThreadId,
              agentConfig.name,
              message,
              tokenUsage,
              threadTokens,
              agentConfig.model || 'gpt-4-turbo-preview',
              currentLLMProvider
            );
          } catch (error: any) {
            console.error('❌ Erro ao salvar tokens:', error.message);
          }
        }),
        // Log de uso de tokens
        Promise.resolve().then(() => {
          try {
            saveLog({
              type: 'token_usage',
              socketId: socket.id,
              threadId: safeThreadId,
              runId: run.id,
              agentName: agentConfig.name,
              tokenUsage: tokenUsage,
              accumulatedTokenUsage: threadTokens,
              tokenCost: tokenCost,
              accumulatedTokenCost: accumulatedTokenCost,
              llmProvider: currentLLMProvider,
              metadata: {
                model: agentConfig.model || 'gpt-4-turbo-preview'
              }
            });
          } catch (error: any) {
            console.error('❌ Erro ao salvar log de token_usage:', error.message);
          }
        })
      ]).catch(error => {
        console.error('❌ Erro ao salvar dados de storage (não crítico):', error);
      });
    } else {
      // Se não há threadId, ainda tenta salvar o log de response
      console.warn('⚠️ ThreadId não disponível, salvando log de response sem threadId');
      try {
        saveLog({
          type: 'response',
          socketId: socket.id,
          threadId: 'unknown',
          runId: run.id,
          agentName: agentConfig.name,
          agentId: agentId,
          message: message,
          response: responseMessage,
          tokenUsage: tokenUsage,
          accumulatedTokenUsage: threadTokens,
          tokenCost: tokenCost,
          accumulatedTokenCost: accumulatedTokenCost,
          llmProvider: currentLLMProvider,
          metadata: {
            responseLength: responseMessage.length,
            model: agentConfig.model || 'gpt-4-turbo-preview'
          }
        });
      } catch (error: any) {
        console.error('❌ Erro crítico ao salvar log de response (sem threadId):', error);
      }
    }

    // Retorna imediatamente sem esperar operações de storage
    return { success: true, response: responseMessage };
  } catch (error: any) {
    console.error('Erro ao processar mensagem com agente específico:', error);
    
    // Log de erro
    const errorThreadId = getThreadId(socket.id);
    saveLog({
      type: 'error',
      socketId: socket.id,
      threadId: errorThreadId,
      error: error.message || 'Erro desconhecido',
      errorStack: error.stack,
      llmProvider: getCurrentLLMProvider(),
      metadata: {
        errorName: error.name,
        errorType: 'message_processing_with_agent'
      }
    });
    
    socket.emit('error', {
      message: error.message || 'Erro ao processar sua mensagem. Por favor, tente novamente.'
    });

    return { success: false, error: error.message };
  }
}

