/**
 * Serviço de processamento de mensagens
 */

import { Socket } from 'socket.io';
import { LLMAdapter } from '../llm/adapters/LLMAdapter';
import { AgentManager, executeTool } from '../agents/agentManager';
import { findAgentConfigByName } from '../agents/config';
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

const ACTION_DETECTOR_AGENT_NAME = 'Action Intent Detector';

interface ActionIntentResult {
  action: string;
  confidence?: number;
  filePath?: string;
  arguments?: Record<string, any>;
}

interface ActionIntentContext {
  contextSnippet: string;
  details?: Record<string, any>;
}

function parseActionDetectorResponse(rawResponse: string): ActionIntentResult | null {
  if (!rawResponse) {
    return null;
  }

  let cleaned = rawResponse.trim();

  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[\w-]*\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  const firstBraceIndex = cleaned.indexOf('{');
  const lastBraceIndex = cleaned.lastIndexOf('}');

  if (firstBraceIndex !== -1 && lastBraceIndex !== -1) {
    cleaned = cleaned.slice(firstBraceIndex, lastBraceIndex + 1);
  }

  let parsed: any;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  if (typeof parsed.action !== 'string') {
    return null;
  }

  const result: ActionIntentResult = {
    action: parsed.action.trim().toLowerCase(),
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
    filePath: typeof parsed.filePath === 'string' ? parsed.filePath.trim() : undefined,
    arguments: typeof parsed.arguments === 'object' && parsed.arguments !== null ? parsed.arguments : undefined,
  };

  if (!result.filePath && result.arguments && typeof result.arguments.filePath === 'string') {
    result.filePath = result.arguments.filePath.trim();
  }

  return result;
}

async function detectActionIntent(message: string, llmAdapter: LLMAdapter): Promise<ActionIntentResult | null> {
  try {
    const actionAgentConfig = await findAgentConfigByName(ACTION_DETECTOR_AGENT_NAME);

    if (!actionAgentConfig) {
      console.warn('⚠️ Action Intent Detector não configurado. Consulte agents.json para habilitar essa função.');
      return inferActionIntentHeuristics(message);
    }

    const agentId = await llmAdapter.getOrCreateAgent(actionAgentConfig);
    const thread = await llmAdapter.createThread({ purpose: 'action_intent_detection' });

    const detectorPrompt = [
      'Analise a mensagem abaixo e retorne apenas o JSON solicitado nas instruções do agente.',
      'Mensagem do usuário:',
      message,
    ].join('\n\n');

    await llmAdapter.addMessage(thread.id, 'user', detectorPrompt);
    const run = await llmAdapter.createRun(thread.id, agentId);
    const { message: detectorResponse } = await llmAdapter.waitForRunCompletion(thread.id, run.id);

    const parsed = parseActionDetectorResponse(detectorResponse);

    if (!parsed) {
      console.warn('⚠️ Resposta inválida do Action Intent Detector:', detectorResponse);
      return inferActionIntentHeuristics(message);
    }

    if (parsed.action === 'none' || (parsed.confidence !== undefined && parsed.confidence < 0.4)) {
      const heuristicIntent = inferActionIntentHeuristics(message);
      if (heuristicIntent) {
        return heuristicIntent;
      }
    }

    return parsed;
  } catch (error: any) {
    console.warn('⚠️ Erro ao executar Action Intent Detector:', error?.message || error);
    return inferActionIntentHeuristics(message);
  }
}

function escapeForPowerShellSingleQuote(value: string): string {
  return value.replace(/'/g, "''");
}

function buildListDirectoryCommand(
  dirPath: string,
  extension?: string,
  pattern?: string,
  recursive: boolean = true
): { command: string; workingDirectory?: string } {
  const escapedDir = escapeForPowerShellSingleQuote(dirPath);

  let filterClause = '';
  if (pattern && pattern.trim()) {
    filterClause = ` -Filter '${escapeForPowerShellSingleQuote(pattern.trim())}'`;
  } else if (extension && extension.trim()) {
    const normalizedExtension = extension.trim().replace(/^\./, '');
    filterClause = ` -Filter '*.${escapeForPowerShellSingleQuote(normalizedExtension)}'`;
  }

  const recurseFlag = recursive ? ' -Recurse' : '';
  const command = `powershell -NoProfile -Command "Get-ChildItem -Path '.'${filterClause}${recurseFlag} -File | Select-Object -ExpandProperty FullName"`;
  return { command, workingDirectory: dirPath };
}

async function runCommandForIntent(
  command: string,
  workingDirectory: string | undefined,
  socket: Socket
): Promise<ActionIntentContext | null> {
  try {
    const startTime = Date.now();
    const rawResult = await executeTool(
      'execute_command',
      { command, workingDirectory },
      socket
    );

    const executionTimeMs = Date.now() - startTime;
    const output =
      typeof rawResult === 'string'
        ? rawResult
        : JSON.stringify(rawResult, null, 2);

    const trimmedOutput =
      output.length > 4000 ? `${output.slice(0, 4000)}\n... [resultado truncado]` : output;

    const contextSnippet = [
      '[Resultado de comando executado automaticamente]',
      `Comando: ${command}`,
      workingDirectory ? `Diretório de trabalho: ${workingDirectory}` : '',
      `Duração: ${executionTimeMs}ms`,
      '',
      trimmedOutput
    ]
      .filter(Boolean)
      .join('\n');

    if (socket) {
      const payload = {
        command,
        workingDirectory: workingDirectory || null,
        durationMs: executionTimeMs,
        output: trimmedOutput
      };
      socket.emit('command_executed', payload);
      emitToMonitors(socket.id, 'command_executed', payload);
    }

    return {
      contextSnippet,
      details: {
        command,
        workingDirectory,
        executionTimeMs
      }
    };
  } catch (error: any) {
    console.warn('⚠️ Erro ao executar comando detectado automaticamente:', error?.message || error);
    if (socket) {
      const payload = {
        command,
        workingDirectory: workingDirectory || null,
        error: error?.message || 'Erro ao executar comando'
      };
      socket.emit('command_execution_failed', payload);
      emitToMonitors(socket.id, 'command_execution_failed', payload);
    }
    return null;
  }
}

async function enrichMessageWithActionIntent(
  actionIntent: ActionIntentResult | null,
  message: string,
  socket: Socket
): Promise<ActionIntentContext | null> {
  if (!actionIntent) {
    return null;
  }

  const args = actionIntent.arguments || {};

  if (actionIntent.action === 'list_directory') {
    const dirPath: string | undefined =
      args.dirPath ||
      args.path ||
      args.startDir ||
      actionIntent.filePath;

    if (!dirPath) {
      return null;
    }

    const recursive =
      typeof args.recursive === 'boolean'
        ? args.recursive
        : /subdiretório|subdiretorio|subfolder|recurs/i.test(message);

    const extension: string | undefined =
      args.extension ||
      (args.pattern && typeof args.pattern === 'string' && args.pattern.startsWith('*.')
        ? args.pattern.slice(2)
        : undefined);

    const pattern: string | undefined = args.pattern;

    const listCommand = buildListDirectoryCommand(dirPath, extension, pattern, recursive);
    return await runCommandForIntent(listCommand.command, listCommand.workingDirectory, socket);
  }

  if (actionIntent.action === 'execute_command') {
    const command: string | undefined = args.command || args.cmd;
    if (!command) {
      return null;
    }
    const workingDirectory: string | undefined =
      args.workingDirectory ||
      args.cwd ||
      actionIntent.filePath;

    return await runCommandForIntent(command, workingDirectory, socket);
  }

  return null;
}

function extractPathsFromMessage(message: string): string[] {
  const pathPattern = /([A-Za-z]:[\\\/][^\s"']+|\.\.?[\\\/][^\s"']+)/g;
  const matches = Array.from(message.matchAll(pathPattern)).map((match) => match[1]?.trim()).filter(Boolean);
  return matches as string[];
}

function inferActionIntentHeuristics(message: string): ActionIntentResult | null {
  const lowerMessage = message.toLowerCase();
  const paths = extractPathsFromMessage(message);

  const listKeywords = [
    'listar', 'lista', 'list', 'mostrar', 'mostra', 'mostre', 'traga', 'trazer', 'me traga', 'quero ver', 'quais arquivos',
    'listagem', 'files', 'arquivos', 'mostrar arquivos', 'listar arquivos'
  ];

  const hasListIntent = listKeywords.some((keyword) => lowerMessage.includes(keyword));

  if (hasListIntent && paths.length > 0) {
    const extensionMatch = lowerMessage.match(/\.([a-z0-9]{1,6})\b/);
    const extension =
      extensionMatch && extensionMatch[1] && !extensionMatch[1].includes('\\')
        ? extensionMatch[1]
        : undefined;

    const recursive = /subdiretório|subdiretorio|subpasta|subfolder|todos os diretórios|todos os diretorios|recurs/i.test(
      lowerMessage
    );

    return {
      action: 'list_directory',
      confidence: 0.65,
      filePath: paths[0],
      arguments: {
        dirPath: paths[0],
        extension,
        recursive
      }
    };
  }

  const commandMatch = message.match(/(?:execute|rodar|rode|run|start|inicie|iniciar)\s+([^\n]+)/i);
  if (commandMatch && commandMatch[1]) {
    return {
      action: 'execute_command',
      confidence: 0.6,
      arguments: {
        command: commandMatch[1].trim(),
        workingDirectory: paths[0]
      }
    };
  }

  return null;
}

/**
 * Detecta se a mensagem contém uma solicitação de leitura de arquivo
 */
export function detectFileReadRequest(message: string): { detected: boolean; filePath?: string } {
  const lowerMessage = message.toLowerCase();

  const triggerKeywords = [
    'ler', 'leia', 'read', 'conteúdo', 'conteudo', 'dados', 'mostrar',
    'mostre', 'abrir', 'abre', 'exibir', 'exiba', 'o que tem', 'quais dados',
    'analise', 'analisa', 'analisar', 'explicar', 'explique'
  ];

  const keywordDetected = triggerKeywords.some(keyword => lowerMessage.includes(keyword));

  const primaryPattern =
    /(?:ler|leia|read|conteúdo|conteudo|dados|o que tem|quais dados|mostre|mostrar|exiba|exibir|abrir|abre|analise|analisa|analisar|explique|explicar)[^A-Za-z0-9]{0,40}(?:arquivo[^A-Za-z0-9]{0,10})?(?:is|é|do|da|deste|desse|desta|dessa|:|=|->)?\s*([A-Za-z]:[\\\/][^\s"']+|\.\.?[\\\/][^\s"']+|[^:\s"']+\.[A-Za-z0-9]+)/i;

  const primaryMatch = message.match(primaryPattern);

  if (primaryMatch && primaryMatch[1]) {
    return { detected: true, filePath: primaryMatch[1].trim() };
  }

  if (keywordDetected) {
    const fallbackPattern = /([A-Za-z]:[\\\/][^\s"']+|\.\.?[\\\/][^\s"']+|[^:\s"']+\.[A-Za-z0-9]+)/g;
    const candidates = Array.from(message.matchAll(fallbackPattern))
      .map(match => match[1]?.trim())
      .filter(Boolean) as string[];

    if (candidates.length > 0) {
      const candidate = candidates.find(pathCandidate =>
        /[\\\/]/.test(pathCandidate) || /\.[A-Za-z0-9]+$/.test(pathCandidate)
      );

      if (candidate) {
        return { detected: true, filePath: candidate };
      }
    }
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
    
    // Detecta intenção geral de ação (ex.: leitura de arquivo, execução de comando)
    const actionIntent = await detectActionIntent(message, llmAdapter);

    if (actionIntent) {
      const actionIntentData = {
        action: actionIntent.action,
        confidence: actionIntent.confidence ?? null,
        filePath: actionIntent.filePath ?? null,
        arguments: actionIntent.arguments ?? null,
      };
      socket.emit('action_intent_detected', actionIntentData);
      emitToMonitors(socket.id, 'action_intent_detected', actionIntentData);
    }

    // Detecta se o usuário está pedindo para ler um arquivo
    let fileDetection: ReturnType<typeof detectFileReadRequest> = { detected: false };

    if (actionIntent && actionIntent.action === 'read_file' && actionIntent.filePath) {
      fileDetection = {
        detected: true,
        filePath: actionIntent.filePath,
      };
      console.log(`🎯 Action Intent Detector identificou leitura de arquivo: ${actionIntent.filePath}`);
    } else {
      fileDetection = detectFileReadRequest(message);
    }

    let enhancedMessage = message;
    let fileContent = '';
    const actionContext = await enrichMessageWithActionIntent(actionIntent, message, socket);

    if (actionContext?.contextSnippet) {
      enhancedMessage = `${enhancedMessage}\n\n${actionContext.contextSnippet}`;
    }
    
    if (fileDetection.detected && fileDetection.filePath) {
      console.log(`📂 Detectado pedido de leitura de arquivo: ${fileDetection.filePath}`);
      const result = await enhanceMessageWithFile(message, fileDetection.filePath);
      enhancedMessage = result.enhancedMessage;
      fileContent = result.fileContent;
    }
    
    console.log(`🔍 Analisando mensagem para selecionar agente...`);

    // Seleciona o agente apropriado para a mensagem
    const { agentId, config } = await agentManager.getAgentForMessage(message);
    
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
      llmProvider: getCurrentLLMProvider()
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

    // Cria um run para processar a mensagem com o agente selecionado
    console.log(`🚀 Criando run para processar mensagem...`);
    const run = await llmAdapter.createRun(threadId, agentId);

    console.log(`✅ Run criado: ${run.id} (Status: ${run.status})`);

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
        assistantId: agentId
      }
    });

    // Aguarda a conclusão do run (o adapter já trata tool calling internamente)
    const { message: responseMessage, tokenUsage } = await llmAdapter.waitForRunCompletion(threadId, run.id, socket);

    console.log(`✅ Run concluído com sucesso`);

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

