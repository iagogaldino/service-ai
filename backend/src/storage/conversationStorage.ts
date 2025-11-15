/**
 * Storage para conversas
 */

import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { Conversation, ConversationsJsonFile, ConversationMessage, TokenUsage, LLMProvider } from '../types';

/**
 * Salva uma mensagem na conversa (versão síncrona - mantida para compatibilidade)
 */
export function saveConversationMessage(
  threadId: string,
  socketId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  agentName?: string,
  tokenUsage?: TokenUsage,
  llmProvider?: LLMProvider
): void {
  // Chama versão assíncrona sem bloquear
  saveConversationMessageAsync(threadId, socketId, role, content, agentName, tokenUsage, llmProvider).catch(error => {
    console.error('❌ Erro ao salvar mensagem na conversa:', error);
  });
}

/**
 * Salva uma mensagem na conversa de forma assíncrona (não bloqueante)
 */
export async function saveConversationMessageAsync(
  threadId: string,
  socketId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  agentName?: string,
  tokenUsage?: TokenUsage,
  llmProvider?: LLMProvider
): Promise<void> {
  try {
    const conversationsFilePath = path.join(process.cwd(), 'conversations.json');
    
    let conversationsData: ConversationsJsonFile;
    try {
      const fileContent = (await fsPromises.readFile(conversationsFilePath, 'utf-8')).trim();
      if (fileContent === '') {
        conversationsData = createEmptyConversationsData();
      } else {
        try {
          conversationsData = JSON.parse(fileContent);
          if (!conversationsData.conversations) {
            conversationsData.conversations = [];
          }
        } catch (parseError: any) {
          // JSON malformado - faz backup e recria arquivo
          console.error('❌ Erro ao fazer parse do conversations.json (JSON malformado):', parseError.message);
          const backupPath = `${conversationsFilePath}.backup.${Date.now()}`;
          try {
            await fsPromises.copyFile(conversationsFilePath, backupPath);
            console.log(`💾 Backup do arquivo corrompido salvo em: ${backupPath}`);
          } catch (backupError) {
            console.warn('⚠️ Não foi possível criar backup do arquivo corrompido:', backupError);
          }
          conversationsData = createEmptyConversationsData();
        }
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Arquivo não existe, cria novo
        conversationsData = createEmptyConversationsData();
      } else {
        // Outro erro de leitura
        console.error('❌ Erro ao ler conversations.json:', error.message);
        conversationsData = createEmptyConversationsData();
      }
    }

    // Busca conversa existente ou cria nova
    let conversation = conversationsData.conversations.find(conv => conv.threadId === threadId);
    
    if (!conversation) {
      conversation = {
        threadId,
        socketId,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        messages: [],
        llmProvider: llmProvider
      };
      conversationsData.conversations.push(conversation);
    }

    // Adiciona mensagem
    const message: ConversationMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: new Date().toISOString(),
      agentName,
      tokenUsage,
      llmProvider: llmProvider || conversation.llmProvider
    };

    conversation.messages.push(message);
    conversation.lastUpdated = new Date().toISOString();
    conversation.llmProvider = llmProvider || conversation.llmProvider;

    conversationsData.lastUpdated = new Date().toISOString();

    // Escreve o arquivo de forma segura
    try {
      await fsPromises.writeFile(conversationsFilePath, JSON.stringify(conversationsData, null, 2), 'utf-8');
    } catch (writeError: any) {
      console.error('❌ Erro ao escrever conversations.json:', writeError.message);
      throw writeError;
    }
  } catch (error: any) {
    console.error('❌ Erro ao salvar mensagem na conversa:', error.message || error);
    // Não propaga o erro para não quebrar o fluxo principal
  }
}

/**
 * Carrega conversa de uma thread
 */
export function loadConversation(threadId: string): Conversation | null {
  try {
    const conversationsFilePath = path.join(process.cwd(), 'conversations.json');
    
    if (!fs.existsSync(conversationsFilePath)) {
      return null;
    }

    const fileContent = fs.readFileSync(conversationsFilePath, 'utf-8').trim();
    
    if (!fileContent || fileContent.length === 0) {
      const initialData = createEmptyConversationsData();
      fs.writeFileSync(conversationsFilePath, JSON.stringify(initialData, null, 2), 'utf-8');
      return null;
    }

    let conversationsData: ConversationsJsonFile;
    try {
      conversationsData = JSON.parse(fileContent);
    } catch (parseError) {
      console.error('❌ Erro ao fazer parse do JSON do conversations.json:', parseError);
      const initialData = createEmptyConversationsData();
      fs.writeFileSync(conversationsFilePath, JSON.stringify(initialData, null, 2), 'utf-8');
      return null;
    }
    
    if (!conversationsData || !Array.isArray(conversationsData.conversations)) {
      const initialData = createEmptyConversationsData();
      fs.writeFileSync(conversationsFilePath, JSON.stringify(initialData, null, 2), 'utf-8');
      return null;
    }
    
    const conversation = conversationsData.conversations.find(conv => conv.threadId === threadId);
    return conversation || null;
  } catch (error) {
    console.error('❌ Erro ao carregar conversa:', error);
    return null;
  }
}

/**
 * Limpa conversa de uma thread
 */
export function clearConversation(threadId: string, socketId?: string): void {
  try {
    const conversationsFilePath = path.join(process.cwd(), 'conversations.json');
    
    if (!fs.existsSync(conversationsFilePath)) {
      return;
    }

    const fileContent = fs.readFileSync(conversationsFilePath, 'utf-8').trim();
    if (!fileContent) {
      return;
    }

    let conversationsData: ConversationsJsonFile;
    try {
      conversationsData = JSON.parse(fileContent);
    } catch (error) {
      console.error('❌ Erro ao fazer parse do JSON:', error);
      return;
    }

    if (!conversationsData || !Array.isArray(conversationsData.conversations)) {
      return;
    }

    // Remove a conversa
    const initialLength = conversationsData.conversations.length;
    conversationsData.conversations = conversationsData.conversations.filter(
      conv => conv.threadId !== threadId && (socketId ? conv.socketId !== socketId : true)
    );

    if (conversationsData.conversations.length < initialLength) {
      conversationsData.lastUpdated = new Date().toISOString();
      fs.writeFileSync(conversationsFilePath, JSON.stringify(conversationsData, null, 2), 'utf-8');
      console.log(`🗑️ Conversa ${threadId} removida do conversations.json`);
    }
  } catch (error) {
    console.error('❌ Erro ao limpar conversa:', error);
  }
}

/**
 * Cria estrutura vazia de conversas
 */
function createEmptyConversationsData(): ConversationsJsonFile {
  return {
    conversations: [],
    lastUpdated: new Date().toISOString()
  };
}

