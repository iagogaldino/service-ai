/**
 * Serviço de comunicação com a API de workflows do backend DelsucIA
 * 
 * Este módulo contém todas as funções para comunicação com o backend,
 * incluindo CRUD de workflows e execução de workflows.
 */

import { Node, Edge } from 'reactflow';
import { CustomNodeData } from '../types';

// URL da API do backend
const API_URL = import.meta.env.DEV 
  ? '' // Em dev, usa proxy do Vite (relativo)
  : (import.meta.env?.VITE_API_URL as string) || 'http://localhost:3000';

/**
 * Tipos de workflow
 */
export interface WorkflowNode {
  id: string;
  type: 'start' | 'agent' | 'end' | 'condition' | 'merge';
  agentName?: string;
  position: { x: number; y: number };
  data?: {
    label?: string;
    condition?: string;
    [key: string]: any;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: {
    type: 'shouldUse' | 'result' | 'auto' | 'custom';
    shouldUseRule?: {
      type: 'keywords' | 'regex' | 'complex' | 'default';
      keywords?: string[];
      pattern?: string;
      rules?: any[];
      operator?: 'AND' | 'OR';
    };
    when?: 'always' | 'success' | 'error' | 'condition';
  };
  animated?: boolean;
  label?: string;
  style?: Record<string, any>;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  version?: string; // Versão do workflow (ex: "1.0.0", "2.1.3")
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowConfig {
  workflows: Workflow[];
  activeWorkflowId?: string;
  updatedAt?: string;
}

/**
 * Erro customizado para operações de API
 */
export class WorkflowApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'WorkflowApiError';
  }
}

/**
 * Função auxiliar para fazer requisições HTTP
 */
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  try {
    const url = `${API_URL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    // Verifica se a resposta é JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      throw new WorkflowApiError(
        `Resposta não é JSON. Status: ${response.status}. Conteúdo: ${text.substring(0, 100)}`,
        response.status,
        text
      );
    }

    const data = await response.json();

    if (!response.ok) {
      // Para 404, não loga como erro crítico (é esperado em alguns casos)
      if (response.status === 404) {
        throw new WorkflowApiError(
          data.error || `Recurso não encontrado`,
          response.status,
          data
        );
      }
      throw new WorkflowApiError(
        data.error || `Erro HTTP: ${response.status}`,
        response.status,
        data
      );
    }

    return data;
  } catch (error) {
    if (error instanceof WorkflowApiError) {
      throw error;
    }
    
    // Erros de rede
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new WorkflowApiError(
        'Erro de conexão com o backend. Verifique se o servidor está rodando em http://localhost:3000',
        0,
        error
      );
    }

    throw new WorkflowApiError(
      error instanceof Error ? error.message : 'Erro desconhecido',
      undefined,
      error
    );
  }
}

/**
 * Lista todos os workflows
 */
export async function listWorkflows(): Promise<Workflow[]> {
  const data = await fetchApi<{ workflows: Workflow[] }>('/api/workflows');
  return data.workflows;
}

/**
 * Obtém workflow por ID
 */
export async function getWorkflow(id: string): Promise<Workflow> {
  const data = await fetchApi<{ workflow: Workflow }>(`/api/workflows/${id}`);
  return data.workflow;
}

/**
 * Obtém workflow ativo
 * Retorna null se não houver workflow ativo (404 é esperado e não é um erro)
 */
export async function getActiveWorkflow(): Promise<Workflow | null> {
  try {
    const url = `${API_URL}/api/workflows/active`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 404 é esperado quando não há workflow ativo - retorna null silenciosamente
    if (response.status === 404) {
      return null;
    }

    // Para outros status de erro, lança erro normalmente
    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      let errorData: any;
      if (contentType && contentType.includes('application/json')) {
        errorData = await response.json();
      } else {
        const text = await response.text();
        throw new WorkflowApiError(
          `Erro HTTP: ${response.status}. Conteúdo: ${text.substring(0, 100)}`,
          response.status,
          text
        );
      }
      throw new WorkflowApiError(
        errorData.error || `Erro HTTP: ${response.status}`,
        response.status,
        errorData
      );
    }

    const data = await response.json();
    return data.workflow;
  } catch (error) {
    // Se já é um WorkflowApiError, relança
    if (error instanceof WorkflowApiError) {
      throw error;
    }
    
    // Erros de rede
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new WorkflowApiError(
        'Erro de conexão com o backend. Verifique se o servidor está rodando em http://localhost:3000',
        0,
        error
      );
    }

    throw new WorkflowApiError(
      error instanceof Error ? error.message : 'Erro desconhecido',
      undefined,
      error
    );
  }
}

/**
 * Cria novo workflow
 */
export async function createWorkflow(
  workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Workflow> {
  const data = await fetchApi<{ workflow: Workflow }>('/api/workflows', {
    method: 'POST',
    body: JSON.stringify(workflow),
  });
  return data.workflow;
}

/**
 * Atualiza workflow existente
 */
export async function updateWorkflow(
  id: string,
  updates: Partial<Workflow>
): Promise<Workflow> {
  const data = await fetchApi<{ workflow: Workflow }>(`/api/workflows/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return data.workflow;
}

/**
 * Deleta workflow
 */
export async function deleteWorkflow(id: string): Promise<void> {
  await fetchApi(`/api/workflows/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Ativa workflow (define como ativo)
 */
export async function activateWorkflow(id: string): Promise<void> {
  await fetchApi(`/api/workflows/${id}/activate`, {
    method: 'POST',
  });
}

/**
 * Desativa workflow ativo
 */
export async function deactivateWorkflow(): Promise<void> {
  await fetchApi('/api/workflows/deactivate', {
    method: 'POST',
  });
}

/**
 * Obtém configuração completa de workflows
 */
export async function getWorkflowConfig(): Promise<WorkflowConfig> {
  const data = await fetchApi<{ config: WorkflowConfig }>('/api/workflows/config');
  return data.config;
}

/**
 * Converte nós e edges do React Flow para formato de workflow
 */
export function convertReactFlowToWorkflow(
  nodes: Node<CustomNodeData>[],
  edges: Edge[],
  name: string,
  description?: string,
  version?: string
): Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name,
    description,
    version,
    nodes: nodes.map(node => ({
      id: node.id,
      type: node.data.type === 'start' ? 'start' 
        : node.data.type === 'end' ? 'end'
        : node.data.type === 'agent' ? 'agent'
        : 'agent', // Default
      agentName: node.data.type === 'agent' && node.data.config 
        ? node.data.config.name 
        : undefined,
      position: node.position,
      data: {
        label: node.data.label,
        ...node.data,
      },
    })),
    edges: edges.map(edge => {
      // Garante que a edge tem ID válido
      const edgeId = edge.id || `edge-${edge.source}-${edge.target}-${Date.now()}`;
      return {
        id: edgeId,
        source: edge.source,
        target: edge.target,
        condition: edge.data?.condition,
        animated: edge.animated || false,
        label: edge.label,
        style: edge.style || {},
      };
    }),
    active: false,
  };
}

/**
 * Converte workflow para nós e edges do React Flow
 */
export function convertWorkflowToReactFlow(
  workflow: Workflow
): { nodes: Node<CustomNodeData>[]; edges: Edge[] } {
  const nodes: Node<CustomNodeData>[] = workflow.nodes.map(node => ({
    id: node.id,
    type: 'custom',
    position: node.position,
    data: {
      label: node.data?.label || node.agentName || node.type,
      type: node.type === 'start' ? 'start'
        : node.type === 'end' ? 'end'
        : node.type === 'agent' ? 'agent'
        : 'agent',
      config: node.agentName ? {
        name: node.agentName,
      } as any : undefined,
      ...node.data,
    },
  }));

  const edges: Edge[] = workflow.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: edge.animated,
    label: edge.label,
    style: edge.style,
    data: {
      condition: edge.condition,
    },
  }));

  return { nodes, edges };
}

