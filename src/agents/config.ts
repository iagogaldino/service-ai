/**
 * Configuração de Agentes
 * 
 * Este módulo gerencia a configuração e seleção de agentes.
 * Agora suporta carregamento dinâmico de agentes via JSON.
 */

import { loadAgentsFromJson } from './agentLoader';
import path from 'path';

/**
 * Configuração de um agente OpenAI
 * 
 * Define as características e comportamento de um agente (assistant)
 * da OpenAI Assistants API.
 */
export interface AgentConfig {
  /** Nome único do agente */
  name: string;
  
  /** Descrição breve do propósito do agente */
  description: string;
  
  /** Instruções detalhadas para o comportamento do agente (prompt system) */
  instructions: string;
  
  /** Modelo OpenAI a ser usado (ex: 'gpt-4-turbo-preview') */
  model: string;
  
  /** Array de tools/funções disponíveis para o agente */
  tools: any[];
  
  /**
   * Função que determina se este agente deve ser usado para uma mensagem
   * 
   * @param {string} message - Mensagem do usuário
   * @returns {boolean} True se este agente deve processar a mensagem
   */
  shouldUse: (message: string) => boolean;
  
  /** Prioridade do agente (menor número = maior prioridade) - opcional */
  priority?: number;
}

/**
 * Cache de configurações de agentes carregadas
 */
let agentsConfigCache: AgentConfig[] | null = null;

/**
 * Cache de agentes ordenados por prioridade (otimização)
 */
let sortedAgentsCache: AgentConfig[] | null = null;

/**
 * Cache de agentes pré-filtrados por tipo (otimização)
 */
let codeAnalyzerCache: AgentConfig | null = null;
let generalAssistantCache: AgentConfig | null = null;

/**
 * Carrega as configurações de agentes (do JSON ou cache)
 * 
 * @returns {Promise<AgentConfig[]>} Array de configurações de agentes
 */
export async function loadAgentsConfig(): Promise<AgentConfig[]> {
  if (agentsConfigCache) {
    return agentsConfigCache;
  }

  try {
    const jsonPath = path.join(__dirname, 'agents.json');
    agentsConfigCache = await loadAgentsFromJson(jsonPath);
    
    // Prepara caches otimizados
    buildOptimizationCaches();
    
    return agentsConfigCache;
  } catch (error) {
    console.error('Erro ao carregar agentes do JSON, usando configuração padrão vazia:', error);
    return [];
  }
}

/**
 * Constrói caches de otimização para seleção rápida
 */
function buildOptimizationCaches(): void {
  if (!agentsConfigCache) return;
  
  // Cache de agentes ordenados
  sortedAgentsCache = [...agentsConfigCache].sort((a, b) => {
    const priorityA = a.priority ?? 999;
    const priorityB = b.priority ?? 999;
    return priorityA - priorityB;
  });
  
  // Cache de agentes específicos comuns
  codeAnalyzerCache = agentsConfigCache.find(agent => agent.name === 'Code Analyzer') || null;
  generalAssistantCache = agentsConfigCache.find(agent => agent.name === 'General Assistant') || 
                          agentsConfigCache.find(agent => agent.priority === 999) || null;
}

/**
 * Recarrega as configurações de agentes (útil para hot-reload)
 * 
 * @returns {Promise<AgentConfig[]>} Array de configurações de agentes recarregadas
 */
export async function reloadAgentsConfig(): Promise<AgentConfig[]> {
  agentsConfigCache = null;
  sortedAgentsCache = null;
  codeAnalyzerCache = null;
  generalAssistantCache = null;
  return await loadAgentsConfig();
}

/**
 * Obtém as configurações de agentes atuais (síncrono, retorna cache se disponível)
 * 
 * @returns {AgentConfig[]} Array de configurações de agentes ou array vazio se não carregado
 */
export function getAgentsConfig(): AgentConfig[] {
  return agentsConfigCache || [];
}

/**
 * Carrega agentes de forma síncrona (assume que já foram carregados)
 * Útil para inicialização do servidor
 * 
 * @returns {AgentConfig[]} Array de configurações de agentes
 */
export async function initializeAgents(): Promise<void> {
  await loadAgentsConfig();
}

/**
 * Determina qual agente usar baseado na mensagem do usuário
 * 
 * Esta função implementa uma lógica de seleção hierárquica baseada em prioridade:
 * 1. Verifica agentes com prioridade menor primeiro (maior prioridade)
 * 2. Para cada nível de prioridade, verifica se o agente deve ser usado
 * 3. Retorna o primeiro agente que corresponder à mensagem
 * 
 * OTIMIZAÇÕES:
 * - Usa cache de agentes ordenados (evita ordenação a cada chamada)
 * - Usa cache de agentes específicos (Code Analyzer, General Assistant)
 * - Versão síncrona quando possível (evita overhead de Promise)
 * 
 * @param {string} message - Mensagem do usuário a ser analisada
 * @param {AgentConfig[]} agents - Array de agentes para selecionar (opcional, usa cache se não fornecido)
 * @returns {Promise<AgentConfig>} Configuração do agente selecionado
 */
export async function selectAgent(
  message: string, 
  agents?: AgentConfig[]
): Promise<AgentConfig> {
  // Carrega agentes se não foram fornecidos (só acontece na primeira chamada)
  if (!agents) {
    agents = await loadAgentsConfig();
  }
  
  // Usa versão síncrona se os agentes já estão em cache
  return selectAgentSync(message);
}

/**
 * Versão síncrona de selectAgent (usa cache se disponível)
 * 
 * OTIMIZADA: Usa caches pré-construídos para evitar ordenação e busca repetidas
 * 
 * @param {string} message - Mensagem do usuário
 * @returns {AgentConfig} Configuração do agente selecionado
 */
export function selectAgentSync(message: string): AgentConfig {
  const agentsConfig = agentsConfigCache;
  
  if (!agentsConfig || agentsConfig.length === 0) {
    throw new Error('Nenhum agente configurado. Verifique o arquivo agents.json');
  }

  const lowerMessage = message.toLowerCase();

  // Verifica se há palavras de criação para priorizar Code Analyzer
  const hasCreateKeyword = ['criar', 'create', 'crie', 'novo', 'new', 'escrever', 'write'].some(
    keyword => lowerMessage.includes(keyword)
  );

  // Se houver palavra de criação, tenta Code Analyzer primeiro (usando cache)
  if (hasCreateKeyword && codeAnalyzerCache) {
    if (codeAnalyzerCache.shouldUse(message)) {
      return codeAnalyzerCache;
    }
  }

  // Usa cache de agentes ordenados (evita ordenação a cada chamada)
  const sortedAgents = sortedAgentsCache || agentsConfig;

  // Procura o primeiro agente que corresponde à mensagem
  for (const agent of sortedAgents) {
    // Pula Code Analyzer se já foi verificado acima
    if (hasCreateKeyword && agent.name === 'Code Analyzer') {
      continue;
    }

    if (agent.shouldUse(message)) {
      return agent;
    }
  }

  // Usa cache do agente padrão
  if (generalAssistantCache) {
    return generalAssistantCache;
  }

  // Fallback: retorna o último agente ordenado (menor prioridade = padrão)
  return sortedAgents[sortedAgents.length - 1];
}
