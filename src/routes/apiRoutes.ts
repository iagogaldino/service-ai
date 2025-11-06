/**
 * Módulo de rotas da API REST
 * 
 * Este módulo contém todas as rotas HTTP da aplicação,
 * separadas da lógica do servidor principal para melhor organização.
 */

import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import { getAllConnections, getConnection } from '../services/connectionService';
import { getAgentsConfig } from '../agents/config';
import { getGroupsInfo, getMainSelector, getFallbackAgent } from '../agents/agentLoader';
import { loadTokens } from '../storage/tokenStorage';
import { loadLogs } from '../storage/logStorage';
import { clearConversation, loadConversation } from '../storage/conversationStorage';
import { getCurrentLLMProvider } from '../services/llmService';
import { loadConfigFromJson, saveConfigToJson, AppConfig } from '../config/env';
import { validateLLMCredentials } from '../validation/credentialValidator';
import { updateLLMConfig, initializeLLMAdapter, getLLMAdapter } from '../services/llmService';
import { LLMProvider } from '../types';
import { LLMAdapter } from '../llm/adapters/LLMAdapter';
import { AgentManager } from '../agents/agentManager';
import { initializeAgents } from '../agents/config';
import { setThreadId } from '../services/threadService';

/**
 * Dependências necessárias para as rotas
 */
export interface ApiRoutesDependencies {
  io: Server;
  getLLMAdapter: () => LLMAdapter | null;
  getAgentManager: () => AgentManager | null;
  setAgentManager: (manager: AgentManager) => void;
}

/**
 * Cria e configura todas as rotas da API
 * 
 * @param app - Instância do Express Router
 * @param deps - Dependências necessárias para as rotas
 */
export function setupApiRoutes(app: Router, deps: ApiRoutesDependencies): void {
  /**
   * API: Lista todas as conexões ativas
   */
  app.get('/api/connections', (req: Request, res: Response) => {
    const connections = getAllConnections().map(conn => ({
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
  app.get('/api/connections/:socketId', (req: Request, res: Response) => {
    const { socketId } = req.params;
    const connection = getConnection(socketId);
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

  /**
   * API: Lista todos os agentes disponíveis
   */
  app.get('/api/agents', async (req: Request, res: Response) => {
    try {
      const agents = getAgentsConfig();
      const groups = getGroupsInfo(agents);
      const mainSelector = getMainSelector(agents);
      const fallbackAgent = getFallbackAgent(agents);
      
      // Formata agentes para resposta
      const formattedAgents = agents.map(agent => {
        const agentAny = agent as any;
        return {
          name: agent.name,
          description: agent.description,
          model: agent.model,
          priority: agentAny.priority ?? 999,
          role: agentAny.role || 'agent',
          groupId: agentAny.groupId || null,
          groupName: agentAny.groupName || null,
          toolsCount: agent.tools.length,
          tools: agent.tools.map((tool: any) => {
            if (tool.type === 'function' && tool.function) {
              return tool.function.name;
            }
            return 'unknown';
          }).filter(Boolean)
        };
      });
      
      // Organiza grupos
      const formattedGroups = Array.from(groups.values()).map(group => ({
        id: group.groupId,
        name: group.groupName,
        orchestrator: {
          name: group.orchestrator.name,
          description: group.orchestrator.description,
          toolsCount: group.orchestrator.tools.length,
          tools: group.orchestrator.tools.map((tool: any) => {
            if (tool.type === 'function' && tool.function) {
              return tool.function.name;
            }
            return 'unknown';
          }).filter(Boolean)
        },
        agents: group.agents.map(agent => ({
          name: agent.name,
          description: agent.description,
          toolsCount: agent.tools.length,
          tools: agent.tools.map((tool: any) => {
            if (tool.type === 'function' && tool.function) {
              return tool.function.name;
            }
            return 'unknown';
          }).filter(Boolean)
        }))
      }));
      
      res.json({
        total: agents.length,
        mainSelector: mainSelector ? {
          name: mainSelector.name,
          description: mainSelector.description,
          toolsCount: mainSelector.tools.length,
          tools: mainSelector.tools.map((tool: any) => {
            if (tool.type === 'function' && tool.function) {
              return tool.function.name;
            }
            return 'unknown';
          }).filter(Boolean)
        } : null,
        fallbackAgent: fallbackAgent ? {
          name: fallbackAgent.name,
          description: fallbackAgent.description,
          toolsCount: fallbackAgent.tools.length,
          tools: fallbackAgent.tools.map((tool: any) => {
            if (tool.type === 'function' && tool.function) {
              return tool.function.name;
            }
            return 'unknown';
          }).filter(Boolean)
        } : null,
        groups: formattedGroups,
        agents: formattedAgents
      });
    } catch (error: any) {
      console.error('Erro ao obter agentes:', error);
      res.status(500).json({ error: 'Erro ao obter lista de agentes' });
    }
  });

  /**
   * API: Obtém histórico de tokens
   */
  app.get('/api/tokens', async (req: Request, res: Response) => {
    try {
      // Obtém o provider para filtrar (query param ou provider atual)
      const requestedProvider = req.query.llmProvider as string | undefined;
      const filterProvider = (requestedProvider as LLMProvider) || getCurrentLLMProvider();
      
      // Usa função do módulo de storage que já filtra e recalcula
      const tokensData = loadTokens(filterProvider);
      
      res.json({
        totalTokens: tokensData.totalTokens,
        totalCost: tokensData.totalCost,
        entries: tokensData.entries,
        lastUpdated: tokensData.lastUpdated,
        filteredBy: filterProvider
      });
    } catch (error: any) {
      console.error('Erro ao obter tokens:', error);
      res.status(500).json({ error: 'Erro ao obter histórico de tokens' });
    }
  });

  /**
   * API: Obtém histórico de logs
   */
  app.get('/api/logs', async (req: Request, res: Response) => {
    try {
      // Obtém o provider para filtrar (query param ou provider atual)
      const requestedProvider = req.query.llmProvider as string | undefined;
      const filterProvider = (requestedProvider as LLMProvider) || getCurrentLLMProvider();
      
      // Usa função do módulo de storage que já filtra e recalcula estatísticas
      const logsData = loadLogs(filterProvider);
      
      res.json({
        totalEntries: logsData.totalEntries,
        entries: logsData.entries,
        lastUpdated: logsData.lastUpdated,
        statistics: logsData.statistics,
        filteredBy: filterProvider
      });
    } catch (error: any) {
      console.error('Erro ao obter logs:', error);
      res.status(500).json({ error: 'Erro ao obter histórico de logs' });
    }
  });

  /**
   * API: Limpa conversa de uma thread
   */
  app.delete('/api/conversations/:threadId', async (req: Request, res: Response) => {
    try {
      const { threadId } = req.params;
      clearConversation(threadId);
      res.json({ success: true, message: 'Conversa limpa com sucesso' });
    } catch (error: any) {
      console.error('Erro ao limpar conversa:', error);
      res.status(500).json({ error: 'Erro ao limpar conversa' });
    }
  });

  /**
   * API: Carrega conversa de uma thread
   */
  app.get('/api/conversations/:threadId', async (req: Request, res: Response) => {
    try {
      const { threadId } = req.params;
      const conversation = loadConversation(threadId);
      if (!conversation) {
        return res.json({ messages: [], llmProvider: null });
      }
      res.json({ 
        messages: conversation.messages,
        llmProvider: conversation.llmProvider || getCurrentLLMProvider()
      });
    } catch (error: any) {
      console.error('Erro ao carregar conversa:', error);
      res.status(500).json({ error: 'Erro ao carregar conversa' });
    }
  });

  /**
   * API: Obtém configuração atual
   */
  app.get('/api/config', async (req: Request, res: Response) => {
    try {
      const config = loadConfigFromJson();
      
      // Prepara resposta com informações de OpenAI
      let openaiConfig: any = {
        configured: false,
        apiKeyPreview: null
      };
      
      if (config?.openaiApiKey) {
        const maskedKey = config.openaiApiKey.substring(0, 7) + '...' + config.openaiApiKey.substring(config.openaiApiKey.length - 4);
        openaiConfig = {
          configured: true,
          apiKeyPreview: maskedKey
        };
      }
      
      // Prepara resposta com informações de StackSpot
      let stackspotConfig: any = {
        configured: false,
        clientIdPreview: null,
        realm: 'stackspot-freemium'
      };
      
      if (config?.stackspotClientId && config?.stackspotClientSecret) {
        const maskedClientId = config.stackspotClientId.substring(0, 8) + '...' + config.stackspotClientId.substring(config.stackspotClientId.length - 4);
        stackspotConfig = {
          configured: true,
          clientIdPreview: maskedClientId,
          realm: config.stackspotRealm || 'stackspot-freemium'
        };
      }
      
      // Retorna formato completo esperado pelo frontend
      res.json({
        llmProvider: config?.llmProvider || 'openai',
        openai: openaiConfig,
        stackspot: stackspotConfig,
        port: config?.port || 3000,
        lastUpdated: config?.lastUpdated || null
      });
    } catch (error: any) {
      console.error('Erro ao obter configuração:', error);
      res.status(500).json({ error: 'Erro ao obter configuração' });
    }
  });

  /**
   * API: Salva configuração (suporta OpenAI e StackSpot)
   */
  app.post('/api/config', async (req: Request, res: Response) => {
    try {
      const { llmProvider, openaiApiKey, stackspotClientId, stackspotClientSecret, stackspotRealm, port } = req.body;
      
      // Valida provider
      if (!llmProvider || (llmProvider !== 'openai' && llmProvider !== 'stackspot')) {
        return res.status(400).json({ error: 'Provider deve ser "openai" ou "stackspot"' });
      }
      
      // Valida credenciais apenas do provider que está sendo configurado
      // Permite salvar apenas o provider sem precisar das credenciais (para alternar entre providers)
      if (llmProvider === 'openai' && openaiApiKey) {
        if (typeof openaiApiKey !== 'string' || openaiApiKey.trim() === '') {
          return res.status(400).json({ error: 'OpenAI API key inválida' });
        }
        if (!openaiApiKey.startsWith('sk-')) {
          return res.status(400).json({ error: 'OpenAI API key inválida. Deve começar com "sk-"' });
        }
      } else if (llmProvider === 'stackspot') {
        // Para StackSpot, se estiver fornecendo credenciais, valida ambas
        if (stackspotClientId || stackspotClientSecret) {
          if (!stackspotClientId || typeof stackspotClientId !== 'string' || stackspotClientId.trim() === '') {
            return res.status(400).json({ error: 'StackSpot Client ID é obrigatório quando fornecendo credenciais' });
          }
          if (!stackspotClientSecret || typeof stackspotClientSecret !== 'string' || stackspotClientSecret.trim() === '') {
            return res.status(400).json({ error: 'StackSpot Client Secret é obrigatório quando fornecendo credenciais' });
          }
        }
      }
      
      // Se estiver apenas mudando o provider sem fornecer credenciais novas,
      // verifica se já existem credenciais salvas para o provider escolhido
      const existingConfig = loadConfigFromJson() || {};
      if (llmProvider === 'openai' && !openaiApiKey && !existingConfig.openaiApiKey) {
        return res.status(400).json({ error: 'OpenAI API key é obrigatória. Forneça uma API key para configurar o OpenAI.' });
      }
      if (llmProvider === 'stackspot' && !stackspotClientId && !existingConfig.stackspotClientId) {
        return res.status(400).json({ error: 'StackSpot Client ID e Client Secret são obrigatórios. Forneça as credenciais para configurar o StackSpot.' });
      }
      
      // Atualiza configuração preservando todas as credenciais existentes
      const newConfig: AppConfig = {
        ...existingConfig,
        llmProvider: llmProvider as 'openai' | 'stackspot',
        port: port || existingConfig.port || 3000
      };
      
      // Atualiza apenas as credenciais do provider selecionado, mantendo as outras
      if (llmProvider === 'openai') {
        if (openaiApiKey) {
          newConfig.openaiApiKey = openaiApiKey.trim();
        }
        // Mantém credenciais do StackSpot se existirem
        // (não remove mais)
      } else if (llmProvider === 'stackspot') {
        if (stackspotClientId) {
          newConfig.stackspotClientId = stackspotClientId.trim();
        }
        if (stackspotClientSecret) {
          newConfig.stackspotClientSecret = stackspotClientSecret.trim();
        }
        if (stackspotRealm) {
          newConfig.stackspotRealm = stackspotRealm.trim() || 'stackspot-freemium';
        }
        // Mantém credenciais do OpenAI se existirem
        // (não remove mais)
      }
      
      // Valida credenciais antes de salvar e reinicializar
      const providerToValidate = (newConfig.llmProvider ?? llmProvider) as LLMProvider;
      const validation = validateLLMCredentials(providerToValidate, newConfig);
      if (!validation.valid) {
        return res.status(400).json({ 
          success: false,
          error: validation.error || 'Credenciais inválidas para o provider selecionado'
        });
      }
      
      // Salva no config.json
      saveConfigToJson(newConfig);
      
      // Atualiza variáveis de ambiente baseado no provider ativo
      // Mantém ambas as configurações no JSON, mas usa apenas o provider selecionado
      if (llmProvider === 'openai' && newConfig.openaiApiKey) {
        process.env.OPENAI_API_KEY = newConfig.openaiApiKey;
      }
      // Não deleta OPENAI_API_KEY mesmo se mudar para StackSpot, pois pode ser usado depois
      
      if (newConfig.port) {
        process.env.PORT = newConfig.port.toString();
      }
      
      // Reinicializa adaptador LLM (já validado acima)
      await initializeLLMAdapter();
      
      // Verifica se o adapter foi inicializado com sucesso
      const llmAdapter = deps.getLLMAdapter();
      if (!llmAdapter) {
        return res.status(500).json({ 
          success: false,
          error: `Não foi possível inicializar o adaptador ${llmProvider}. Verifique as credenciais.`
        });
      }
      
      // Recria AgentManager com novo adaptador LLM
      const agentManager = new AgentManager(llmAdapter);
      deps.setAgentManager(agentManager);
      
      // Reinicializa agentes com o novo adaptador
      initializeAgents().catch((err: any) => {
        console.error('❌ Erro ao reinicializar agentes:', err);
      });
      
      // Cria threads para sockets que estavam pendentes (sem credenciais)
      // Nota: Isso agora é gerenciado pelos handlers Socket.IO
      const currentAdapter = llmAdapter;
      if (currentAdapter) {
        deps.io.sockets.sockets.forEach(async (socket) => {
          const connInfo = getConnection(socket.id);
          if (connInfo && connInfo.threadId === 'pending') {
            try {
              const thread = await currentAdapter.createThread();
              setThreadId(socket.id, thread.id);
              
              // Emite mensagem de sucesso
              const providerName = llmProvider === 'openai' ? 'OpenAI' : 'StackSpot';
              socket.emit('config_saved', {
                type: 'config_saved',
                message: `✅ ${providerName} configurado com sucesso!`,
                details: 'Agora você pode usar o DelsucIA normalmente.',
                timestamp: new Date().toISOString()
              });
              
              console.log(`✅ Thread criada para socket pendente ${socket.id}: ${thread.id}`);
            } catch (error) {
              console.error(`❌ Erro ao criar thread para socket ${socket.id}:`, error);
            }
          }
        });
      }
      
      // Prepara resposta com preview das credenciais
      let credentialPreview = '';
      if (llmProvider === 'openai' && newConfig.openaiApiKey) {
        credentialPreview = newConfig.openaiApiKey.substring(0, 7) + '...' + newConfig.openaiApiKey.substring(newConfig.openaiApiKey.length - 4);
      } else if (llmProvider === 'stackspot' && newConfig.stackspotClientId) {
        credentialPreview = newConfig.stackspotClientId.substring(0, 8) + '...' + newConfig.stackspotClientId.substring(newConfig.stackspotClientId.length - 4);
      }
      
      res.json({
        success: true,
        message: 'Configuração salva com sucesso',
        llmProvider: newConfig.llmProvider,
        credentialPreview
      });
    } catch (error: any) {
      console.error('Erro ao salvar configuração:', error);
      res.status(500).json({ error: error.message || 'Erro ao salvar configuração' });
    }
  });
}
