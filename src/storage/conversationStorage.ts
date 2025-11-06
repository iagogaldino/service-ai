/**
 * Storage para conversas
 */

import fs from 'fs';
import path from 'path';
import { Conversation, ConversationsJsonFile, ConversationMessage, TokenUsage, LLMProvider } from '../types';

/**
 * Salva uma mensagem na conversa
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
  try {
    const conversationsFilePath = path.join(process.cwd(), 'conversations.json');
    
    let conversationsData: ConversationsJsonFile;
    if (fs.existsSync(conversationsFilePath)) {
      const fileContent = fs.readFileSync(conversationsFilePath, 'utf-8').trim();
      if (fileContent === '') {
        conversationsData = createEmptyConversationsData();
      } else {
        conversationsData = JSON.parse(fileContent);
        if (!conversationsData.conversations) {
          conversationsData.conversations = [];
        }
      }
    } else {
      conversationsData = createEmptyConversationsData();
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

    fs.writeFileSync(conversationsFilePath, JSON.stringify(conversationsData, null, 2), 'utf-8');
  } catch (error) {
    console.error('❌ Erro ao salvar mensagem na conversa:', error);
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

