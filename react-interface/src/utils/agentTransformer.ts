/**
 * Utilitários para transformação de dados entre React Flow e Backend
 * 
 * Este módulo contém funções para transformar agentes entre o formato
 * usado no React Flow e o formato esperado pelo backend.
 */

import { AgentConfig, CustomNodeData, ShouldUseRule } from '../types';
import { BackendAgent, AgentsFile } from '../services/apiService';
import { Node } from 'reactflow';

/**
 * Valores padrão para configuração de agentes
 */
const DEFAULT_SHOULD_USE: ShouldUseRule = {
  type: 'default',
};

/**
 * Transforma AgentConfig do React Flow em payload do backend
 * 
 * @param nodeAgent - Configuração do agente no React Flow
 * @returns Configuração do agente no formato do backend
 */
export function transformAgentForBackend(
  nodeAgent: AgentConfig
): BackendAgent {
  // Valida campos obrigatórios
  if (!nodeAgent.name || !nodeAgent.name.trim()) {
    throw new Error('Nome do agente é obrigatório');
  }
  
  if (!nodeAgent.instructions || !nodeAgent.instructions.trim()) {
    throw new Error('Instruções do agente são obrigatórias');
  }
  
  if (!nodeAgent.model || !nodeAgent.model.trim()) {
    throw new Error('Modelo do agente é obrigatório');
  }

  // Garante que description sempre tenha um valor (usa name como fallback)
  const description = nodeAgent.description?.trim() || nodeAgent.name.trim() || 'Agente sem descrição';
  
  return {
    name: nodeAgent.name.trim(),
    description: description,
    instructions: nodeAgent.instructions.trim(),
    model: nodeAgent.model.trim(),
    tools: Array.isArray(nodeAgent.tools) ? nodeAgent.tools.filter(Boolean) : [],
    shouldUse: nodeAgent.shouldUse || DEFAULT_SHOULD_USE,
    ...(nodeAgent.stackspotAgentId && { stackspotAgentId: nodeAgent.stackspotAgentId }),
  };
}

/**
 * Transforma agente do backend em nó do React Flow
 * 
 * @param agent - Agente do backend
 * @param index - Índice para posicionamento do nó
 * @param existingNodeId - ID do nó existente para preservar (opcional)
 * @returns Nó do React Flow
 */
export function transformBackendAgentToNode(
  agent: BackendAgent,
  index: number = 0,
  existingNodeId?: string
): Node<CustomNodeData> {
  // Preserva o ID existente se fornecido, caso contrário gera um novo
  const nodeId = existingNodeId || `agent-${agent.name}-${Date.now()}-${index}`;
  
  // Calcula posição baseada no índice (grid 3 colunas)
  const x = 100 + (index % 3) * 250;
  const y = 100 + Math.floor(index / 3) * 150;
  
  return {
    id: nodeId,
    type: 'custom',
    position: { x, y },
    data: {
      label: agent.name,
      type: 'agent',
      config: {
        name: agent.name,
        description: agent.description,
        instructions: agent.instructions,
        includeChatHistory: true, // Default para React Flow
        model: agent.model,
        tools: agent.tools || [],
        outputFormat: 'text', // Default para React Flow
        shouldUse: agent.shouldUse as ShouldUseRule,
        ...(agent.stackspotAgentId && { stackspotAgentId: agent.stackspotAgentId }),
      },
    },
  };
}

/**
 * Carrega todos os agentes do backend e transforma em nós do React Flow
 * 
 * @param getAgentsConfig - Função para buscar configuração de agentes
 * @param existingNodes - Nós existentes para preservar IDs (opcional)
 * @returns Array de nós do React Flow
 * @throws {Error} Se houver erro ao carregar agentes
 */
export async function loadAgentsFromBackend(
  getAgentsConfig: () => Promise<AgentsFile>,
  existingNodes?: Node<CustomNodeData>[]
): Promise<Node<CustomNodeData>[]> {
  try {
    const agentsFile = await getAgentsConfig();
    const nodes: Node<CustomNodeData>[] = [];
    let index = 0;

    // Carrega agentes da lista plana
    for (const agent of agentsFile.agents) {
      // Tenta encontrar um nó existente com o mesmo nome de agente para preservar o ID
      const existingNode = existingNodes?.find(
        n => n.data.type === 'agent' && n.data.config?.name === agent.name
      );
      
      const nodeId = existingNode?.id;
      if (nodeId) {
        console.log(`[AgentTransformer] Preservando ID do nó para agente "${agent.name}": ${nodeId}`);
      }
      nodes.push(transformBackendAgentToNode(agent, index++, nodeId));
    }

    return nodes;
  } catch (error) {
    console.error('Erro ao carregar agentes do backend:', error);
    throw new Error(
      `Erro ao carregar agentes: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    );
  }
}

/**
 * Verifica se um agente já existe no backend (por nome)
 * 
 * @param agentName - Nome do agente
 * @param agentsFile - Estrutura de agentes do backend
 * @returns Agente encontrado ou null
 */
export function findExistingAgent(
  agentName: string,
  agentsFile: AgentsFile
): BackendAgent | null {
  return agentsFile.agents.find((a) => a.name === agentName) || null;
}

/**
 * Valida configuração de agente antes do deploy
 * 
 * @param config - Configuração do agente
 * @returns Array de erros encontrados (vazio se válido)
 */
export function validateAgentConfig(config: AgentConfig): string[] {
  const errors: string[] = [];

  if (!config.name || !config.name.trim()) {
    errors.push('Nome do agente é obrigatório');
  }

  // Description é opcional no backend, mas recomendada
  // Se não tiver description, usa o nome como fallback
  if (!config.description || !config.description.trim()) {
    // Não é erro, apenas warning
    console.warn(`Agente "${config.name}" não tem descrição`);
  }

  if (!config.instructions || !config.instructions.trim()) {
    errors.push('Instruções do agente são obrigatórias');
  }

  if (!config.model || !config.model.trim()) {
    errors.push('Modelo do agente é obrigatório');
  }

  if (!config.shouldUse) {
    errors.push('Regra shouldUse é obrigatória');
  }

  return errors;
}

// Função removida - não há mais grupos

