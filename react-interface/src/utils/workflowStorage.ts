/**
 * Utilitário para salvar e carregar workflows (edges e layout) no localStorage
 * 
 * Este módulo gerencia a persistência de conexões entre agentes no React Flow.
 */

import { Node, Edge } from 'reactflow';
import { CustomNodeData } from '../types';
import { logToBackend } from '../services/frontendLogger';

const STORAGE_KEY = 'delsucIA_workflow';
const STORAGE_KEY_NODES = 'delsucIA_workflow_nodes';
const STORAGE_KEY_EDGES = 'delsucIA_workflow_edges';

/**
 * Interface para dados do workflow salvos
 */
export interface WorkflowData {
  nodes: Node<CustomNodeData>[];
  edges: Edge[];
  savedAt: string;
  version: string;
}

/**
 * Cache para evitar salvamentos desnecessários
 */
let lastSavedWorkflow: string | null = null;
let saveTimeout: NodeJS.Timeout | null = null;

/**
 * Salva nós e edges no localStorage com debounce para evitar loops infinitos
 * 
 * @param nodes - Nós do React Flow
 * @param edges - Edges do React Flow
 */
export function saveWorkflow(
  nodes: Node<CustomNodeData>[],
  edges: Edge[]
): void {
  try {
    // Cria string de comparação (sem campos que mudam a cada render)
    const workflowString = JSON.stringify({
      nodes: nodes.map(n => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: {
          label: n.data.label,
          type: n.data.type,
          config: n.data.config,
        },
      })),
      edges: edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        condition: e.data?.condition,
      })),
    });

    // Se não mudou, não salva
    if (workflowString === lastSavedWorkflow) {
      return;
    }

    // Cancela timeout anterior se existir
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // Debounce: salva após 500ms de inatividade
    saveTimeout = setTimeout(() => {
      try {
        const workflowData: WorkflowData = {
          nodes,
          edges,
          savedAt: new Date().toISOString(),
          version: '1.0.0',
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(workflowData));
        localStorage.setItem(STORAGE_KEY_NODES, JSON.stringify(nodes));
        localStorage.setItem(STORAGE_KEY_EDGES, JSON.stringify(edges));
        
        lastSavedWorkflow = workflowString;
        
        const logData = {
          nodes: nodes.length,
          edges: edges.length,
          nodeIds: nodes.map(n => n.id),
          edgeDetails: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
        };
        
        // Log removido para reduzir sobrecarga - apenas loga erros
      } catch (error) {
        console.error('[Workflow] Erro ao salvar workflow:', error);
      }
      saveTimeout = null;
    }, 500); // Debounce de 500ms
  } catch (error) {
    console.error('[Workflow] Erro ao preparar salvamento:', error);
    // localStorage pode estar desabilitado ou cheio
  }
}

/**
 * Carrega nós e edges do localStorage
 * 
 * @returns Objeto com nós e edges ou null se não houver dados salvos
 */
export function loadWorkflow(): WorkflowData | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return null;
    }

    const workflowData: WorkflowData = JSON.parse(saved);
    
    // Validação básica
    if (!workflowData.nodes || !Array.isArray(workflowData.nodes)) {
      return null;
    }
    if (!workflowData.edges || !Array.isArray(workflowData.edges)) {
      workflowData.edges = []; // Permite workflow sem edges
    }

    const logData = {
      nodes: workflowData.nodes.length,
      edges: workflowData.edges.length,
      savedAt: workflowData.savedAt,
      nodeIds: workflowData.nodes.map(n => n.id),
      edgeDetails: workflowData.edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
    };
    
    // Log removido para reduzir sobrecarga

    return workflowData;
  } catch (error) {
    console.error('[Workflow] Erro ao carregar workflow:', error);
    return null;
  }
}

/**
 * Carrega apenas edges do localStorage
 * 
 * @returns Array de edges ou array vazio
 */
export function loadEdges(): Edge[] {
  try {
    // Tenta carregar do storage principal primeiro (mais completo)
    const savedWorkflow = localStorage.getItem(STORAGE_KEY);
    if (savedWorkflow) {
      const workflowData: WorkflowData = JSON.parse(savedWorkflow);
      if (workflowData.edges && Array.isArray(workflowData.edges)) {
        const logData = {
          edges: workflowData.edges.length,
          edgesDetails: workflowData.edges.map(e => ({ id: e.id, source: e.source, target: e.target }))
        };
        // Log removido para reduzir sobrecarga
        return workflowData.edges;
      }
    }
    
    // Fallback: carrega do storage específico de edges
    const saved = localStorage.getItem(STORAGE_KEY_EDGES);
    if (!saved) {
      // Log removido para reduzir sobrecarga
      return [];
    }

    const edges: Edge[] = JSON.parse(saved);
    const validEdges = Array.isArray(edges) ? edges : [];
    const logData = {
      edges: validEdges.length,
      edgesDetails: validEdges.map(e => ({ id: e.id, source: e.source, target: e.target }))
    };
    // Log removido para reduzir sobrecarga
    return validEdges;
  } catch (error) {
    console.error('[Workflow] Erro ao carregar edges:', error);
    return [];
  }
}

/**
 * Carrega apenas nós do localStorage
 * 
 * @returns Array de nós ou array vazio
 */
export function loadNodes(): Node<CustomNodeData>[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_NODES);
    if (!saved) {
      return [];
    }

    const nodes: Node<CustomNodeData>[] = JSON.parse(saved);
    return Array.isArray(nodes) ? nodes : [];
  } catch (error) {
    console.error('[Workflow] Erro ao carregar nós:', error);
    return [];
  }
}

/**
 * Limpa dados do workflow do localStorage
 */
export function clearWorkflow(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_NODES);
    localStorage.removeItem(STORAGE_KEY_EDGES);
    console.log('[Workflow] Dados removidos do localStorage');
  } catch (error) {
    console.error('[Workflow] Erro ao limpar workflow:', error);
  }
}

/**
 * Filtra edges válidas (remove edges que referenciam nós inexistentes)
 * 
 * @param edges - Edges a serem validadas
 * @param nodes - Nós disponíveis
 * @returns Array de edges válidas
 */
export function filterValidEdges(
  edges: Edge[],
  nodes: Node<CustomNodeData>[]
): Edge[] {
  const nodeIds = new Set(nodes.map(node => node.id));
  
  const validEdges = edges.filter(edge => {
    const isValid = nodeIds.has(edge.source) && nodeIds.has(edge.target);
    if (!isValid) {
      const warningMsg = `[Workflow] Edge inválida removida: ${edge.source}->${edge.target} (nós não encontrados)`;
      console.warn(warningMsg);
      logToBackend('warn', warningMsg, {
        edgeId: edge.id,
        source: edge.source,
        target: edge.target,
        nodeIds: Array.from(nodeIds),
        sourceExists: nodeIds.has(edge.source),
        targetExists: nodeIds.has(edge.target),
      });
    }
    return isValid;
  });
  
  return validEdges;
}

/**
 * Mescla agentes carregados do backend com workflow salvo
 * 
 * @param backendNodes - Nós carregados do backend
 * @param savedEdges - Edges salvas no localStorage
 * @returns Objeto com nós mesclados e edges válidas
 */
export function mergeWorkflowWithBackendAgents(
  backendNodes: Node<CustomNodeData>[],
  savedEdges: Edge[]
): { nodes: Node<CustomNodeData>[]; edges: Edge[] } {
  // Carrega nós salvos (pode incluir posições customizadas)
  const savedNodes = loadNodes();
  
  // Cria mapa de nós salvos por ID para buscar posições
  const savedNodesMap = new Map(
    savedNodes.map(node => [node.id, node])
  );

  // Cria mapa de nós do backend por identificador único (groupId + agentName)
  // para evitar duplicatas
  const backendNodesMap = new Map<string, Node<CustomNodeData>>();
  backendNodes.forEach(node => {
    const key = node.data.type === 'agent' && node.data.config?.groupId
      ? `${node.data.config.groupId}-${node.data.config.name}`
      : node.id; // Para nós não-agentes, usa ID
    backendNodesMap.set(key, node);
  });

  // Mescla nós: usa posições dos salvos, mas dados atualizados do backend
  const mergedNodes: Node<CustomNodeData>[] = [];
  const processedKeys = new Set<string>();

  // Primeiro: processa nós do backend (fonte de verdade)
  backendNodes.forEach(backendNode => {
    const key = backendNode.data.type === 'agent' && backendNode.data.config?.groupId
      ? `${backendNode.data.config.groupId}-${backendNode.data.config.name}`
      : backendNode.id;
    
    // Busca nó salvo com mesmo ID ou mesma chave
    let savedNode = savedNodesMap.get(backendNode.id);
    
    // Se não encontrou por ID, tenta buscar por nome do agente
    if (!savedNode && backendNode.data.type === 'agent') {
      // Busca nós salvos com mesmo nome de agente
      const matchingSavedNodes = savedNodes.filter(n => 
        n.data.type === 'agent' && 
        n.data.config?.name === backendNode.data.config?.name
      );
      if (matchingSavedNodes.length > 0) {
        // Pega o primeiro (mais recente) e remove os outros
        savedNode = matchingSavedNodes[0];
      }
    }

    // Cria nó mesclado
    const mergedNode: Node<CustomNodeData> = savedNode
      ? {
          ...savedNode,
          id: backendNode.id, // Usa ID do backend (pode ter mudado)
          data: backendNode.data, // Usa dados atualizados do backend
        }
      : backendNode;

    mergedNodes.push(mergedNode);
    processedKeys.add(key);
  });

  // Adiciona apenas nós especiais salvos que não são agentes (ex: Start, End, etc.)
  savedNodes.forEach(savedNode => {
    // Ignora nós que são agentes (já foram processados)
    if (savedNode.data.type === 'agent') {
      return;
    }
    
    // Verifica se já foi adicionado
    const exists = mergedNodes.some(n => n.id === savedNode.id);
    if (!exists) {
      console.log(`[Workflow] Adicionando nó especial salvo: ${savedNode.id} (tipo: ${savedNode.data.type})`);
      mergedNodes.push(savedNode);
    } else {
      console.log(`[Workflow] Nó especial já existe: ${savedNode.id} (tipo: ${savedNode.data.type})`);
    }
  });
  
  // Garante que o nó "start" sempre existe
  const hasStartNode = mergedNodes.some(n => n.id === 'start' && n.data.type === 'start');
  if (!hasStartNode) {
    console.log(`[Workflow] ⚠️ Nó "start" não encontrado, criando um novo...`);
    const startNode: Node<CustomNodeData> = {
      id: 'start',
      type: 'custom',
      position: { x: 100, y: 300 },
      data: { label: 'Start', type: 'start' },
    };
    mergedNodes.unshift(startNode); // Adiciona no início
  }

  // Remove duplicatas baseado em nome de agente
  const deduplicatedNodes: Node<CustomNodeData>[] = [];
  const seenKeys = new Set<string>();

  mergedNodes.forEach(node => {
    const key = node.data.type === 'agent' && node.data.config?.name
      ? `agent-${node.data.config.name}`
      : node.id;

    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      deduplicatedNodes.push(node);
    }
  });

  // Cria mapa de IDs dos nós finais para validação
  const finalNodeIds = new Set(deduplicatedNodes.map(n => n.id));
  
  // Cria mapa de IDs antigos (dos nós salvos) para novos IDs (dos nós mesclados)
  const nodeIdMap = new Map<string, string>();
  
  const mappingLogData = {
    savedNodes: savedNodes.length,
    savedEdges: savedEdges.length,
    savedEdgesIds: savedEdges.map(e => ({ source: e.source, target: e.target })),
    deduplicatedNodes: deduplicatedNodes.length,
    deduplicatedNodesIds: deduplicatedNodes.map(n => n.id),
    savedNodeIds: savedNodes.map(n => n.id),
  };
  
    // Log removido para reduzir sobrecarga
  
  // Mapeia IDs baseado em identificação única (nome de agente) ou ID direto
  savedNodes.forEach(savedNode => {
    if (savedNode.data.type === 'agent' && savedNode.data.config) {
      // Busca nó correspondente no merge por nome do agente
      const matchingNode = deduplicatedNodes.find(node => 
        node.data.type === 'agent' && 
        node.data.config &&
        node.data.config.name === savedNode.data.config?.name
      );
      
      if (matchingNode) {
        nodeIdMap.set(savedNode.id, matchingNode.id);
        // Log de debug removido para reduzir sobrecarga
      }
    } else {
      // Para nós não-agentes (Start, End, etc), verifica se ID existe
      if (finalNodeIds.has(savedNode.id)) {
        nodeIdMap.set(savedNode.id, savedNode.id);
      }
    }
  });
  
  // Adiciona mapeamentos diretos para IDs que já existem
  deduplicatedNodes.forEach(node => {
    if (!nodeIdMap.has(node.id)) {
      nodeIdMap.set(node.id, node.id);
    }
  });
  
  // Mapeia também edges que referenciam agentes que não estão em savedNodes
  // mas que podem ser encontrados pelos nós finais através do nome do agente
  // Novo formato de ID: agent-{agentName}-{timestamp}-{index}
  savedEdges.forEach(edge => {
    // Para source
    if (!nodeIdMap.has(edge.source) && edge.source.startsWith('agent-')) {
      const sourceNode = savedNodes.find(n => n.id === edge.source);
      if (sourceNode && sourceNode.data.type === 'agent' && sourceNode.data.config) {
        // Se encontrou o nó salvo, usa o nome do agente para encontrar correspondência
        const agentName = sourceNode.data.config.name;
        const matchingNode = deduplicatedNodes.find(node => 
          node.data.type === 'agent' && 
          node.data.config &&
          node.data.config.name === agentName
        );
        if (matchingNode) {
          nodeIdMap.set(edge.source, matchingNode.id);
        }
      } else {
        // Tenta extrair o nome do agente diretamente do ID
        // Formato: agent-{agentName}-{timestamp}-{index}
        // Remove prefixo "agent-" e sufixo "-{timestamp}-{index}"
        const parts = edge.source.replace(/^agent-/, '').split('-');
        if (parts.length >= 3) {
          // O nome do agente é tudo antes dos últimos 2 elementos (timestamp e index)
          const agentNameParts = parts.slice(0, -2);
          const agentName = agentNameParts.join('-');
          
          // Tenta encontrar nó correspondente pelo nome
          const matchingNode = deduplicatedNodes.find(node => 
            node.data.type === 'agent' && 
            node.data.config &&
            node.data.config.name === agentName
          );
          if (matchingNode) {
            nodeIdMap.set(edge.source, matchingNode.id);
          }
        }
      }
    }
    // Para target
    if (!nodeIdMap.has(edge.target) && edge.target.startsWith('agent-')) {
      const targetNode = savedNodes.find(n => n.id === edge.target);
      if (targetNode && targetNode.data.type === 'agent' && targetNode.data.config) {
        // Se encontrou o nó salvo, usa o nome do agente para encontrar correspondência
        const agentName = targetNode.data.config.name;
        const matchingNode = deduplicatedNodes.find(node => 
          node.data.type === 'agent' && 
          node.data.config &&
          node.data.config.name === agentName
        );
        if (matchingNode) {
          nodeIdMap.set(edge.target, matchingNode.id);
        }
      } else {
        // Tenta extrair o nome do agente diretamente do ID
        // Formato: agent-{agentName}-{timestamp}-{index}
        const parts = edge.target.replace(/^agent-/, '').split('-');
        if (parts.length >= 3) {
          // O nome do agente é tudo antes dos últimos 2 elementos (timestamp e index)
          const agentNameParts = parts.slice(0, -2);
          const agentName = agentNameParts.join('-');
          
          // Tenta encontrar nó correspondente pelo nome
          const matchingNode = deduplicatedNodes.find(node => 
            node.data.type === 'agent' && 
            node.data.config &&
            node.data.config.name === agentName
          );
          if (matchingNode) {
            nodeIdMap.set(edge.target, matchingNode.id);
          }
        }
      }
    }
  });

  // Mapeia edges para usar novos IDs
  const mappedEdges = savedEdges.map(edge => {
    let newSource = nodeIdMap.get(edge.source);
    let newTarget = nodeIdMap.get(edge.target);
    
    // Se não encontrou mapeamento direto, tenta buscar pelo nome do agente
    if (!newSource) {
      // Para source = 'start', mantém como 'start'
      if (edge.source === 'start') {
        newSource = 'start';
      } else {
        // Tenta encontrar o nó pelo ID parcial (pode ser que o ID tenha mudado mas o agente seja o mesmo)
        const sourceNode = savedNodes.find(n => n.id === edge.source);
        if (sourceNode && sourceNode.data.type === 'agent' && sourceNode.data.config) {
          const matchingNode = deduplicatedNodes.find(node => 
            node.data.type === 'agent' && 
            node.data.config &&
            node.data.config.name === sourceNode.data.config?.name
          );
          if (matchingNode) {
            newSource = matchingNode.id;
            nodeIdMap.set(edge.source, newSource); // Salva no mapa para próximas edges
          }
        } else {
          // Se não encontrou em savedNodes, tenta extrair nome do agente diretamente do ID da edge
          // Novo formato: agent-{agentName}-{timestamp}-{index}
          const parts = edge.source.replace(/^agent-/, '').split('-');
          if (parts.length >= 3) {
            // O nome do agente é tudo antes dos últimos 2 elementos (timestamp e index)
            const agentNameParts = parts.slice(0, -2);
            const agentName = agentNameParts.join('-');
            
            // Tenta encontrar nó correspondente pelo nome
            const matchingNode = deduplicatedNodes.find(node => 
              node.data.type === 'agent' && 
              node.data.config &&
              node.data.config.name === agentName
            );
            if (matchingNode) {
              newSource = matchingNode.id;
              nodeIdMap.set(edge.source, newSource);
            }
          }
        }
      }
    }
    
    if (!newTarget) {
      // Para target, tenta encontrar pelo nome do agente
      const targetNode = savedNodes.find(n => n.id === edge.target);
      if (targetNode && targetNode.data.type === 'agent' && targetNode.data.config) {
        const matchingNode = deduplicatedNodes.find(node => 
          node.data.type === 'agent' && 
          node.data.config &&
          node.data.config.name === targetNode.data.config?.name
        );
        if (matchingNode) {
          newTarget = matchingNode.id;
          nodeIdMap.set(edge.target, newTarget); // Salva no mapa para próximas edges
        }
      } else if (edge.target.startsWith('agent-')) {
        // Se não encontrou em savedNodes, tenta extrair nome do agente diretamente do ID da edge
        // Novo formato: agent-{agentName}-{timestamp}-{index}
        const parts = edge.target.replace(/^agent-/, '').split('-');
        if (parts.length >= 3) {
          // O nome do agente é tudo antes dos últimos 2 elementos (timestamp e index)
          const agentNameParts = parts.slice(0, -2);
          const agentName = agentNameParts.join('-');
          
          // Tenta encontrar nó correspondente pelo nome
          const matchingNode = deduplicatedNodes.find(node => 
            node.data.type === 'agent' && 
            node.data.config &&
            node.data.config.name === agentName
          );
          if (matchingNode) {
            newTarget = matchingNode.id;
            nodeIdMap.set(edge.target, newTarget);
          }
        }
      } else {
        // Se não é agente, verifica se o ID existe nos nós finais
        if (finalNodeIds.has(edge.target)) {
          newTarget = edge.target;
        }
      }
    }
    
    if (newSource && newTarget) {
      const mappedEdge = {
        ...edge,
        id: edge.id || `edge-${newSource}-${newTarget}-${Date.now()}`,
        source: newSource,
        target: newTarget,
      };
      
      // Log removido para reduzir sobrecarga
      
      return mappedEdge;
    }
    
    // Se não encontrou mapeamento, tenta usar o ID original
    const warningData = {
      source: edge.source,
      target: edge.target,
      sourceEncontrado: !!newSource,
      targetEncontrado: !!newTarget,
      nodeIdsFinais: Array.from(finalNodeIds),
      nodeIdMapEntries: Array.from(nodeIdMap.entries()),
    };
    console.warn(`[Workflow] Edge não mapeada: ${edge.source}->${edge.target}`, warningData);
    logToBackend('warn', `[Workflow] Edge não mapeada: ${edge.source}->${edge.target}`, warningData);
    return edge;
  });

  // Filtra edges válidas (apenas entre nós que existem)
  const validEdges = filterValidEdges(mappedEdges, deduplicatedNodes);

  const mergeLogData = {
    nodesSalvos: savedNodes.length,
    nodesBackend: backendNodes.length,
    nodesMerged: deduplicatedNodes.length,
    edgesSalvas: savedEdges.length,
    edgesMapeadas: mappedEdges.length,
    edgesValidas: validEdges.length,
    nodeIds: deduplicatedNodes.map(n => n.id),
    edgeSources: mappedEdges.map(e => e.source),
    edgeTargets: mappedEdges.map(e => e.target),
    validEdgeDetails: validEdges.map(e => ({ id: e.id, source: e.source, target: e.target })),
    removedEdges: mappedEdges.filter(e => !validEdges.includes(e)),
  };
  
    // Log removido para reduzir sobrecarga

  return {
    nodes: deduplicatedNodes,
    edges: validEdges,
  };
}

