/**
 * Serviço de comunicação com a API do backend DelsucIA
 * 
 * Este módulo contém todas as funções para comunicação com o backend,
 * incluindo CRUD de agentes, carregamento de configurações e grupos.
 */

// URL da API do backend
// Em desenvolvimento, usa proxy do Vite (vazio = mesma origem)
// Em produção, usa variável de ambiente ou padrão
const API_URL = import.meta.env.DEV 
  ? '' // Em dev, usa proxy do Vite (relativo)
  : (import.meta.env?.VITE_API_URL as string) || 'http://localhost:3000';

/**
 * Tipos do backend (estrutura do agents.json)
 */
export interface BackendAgent {
  name: string;
  description: string;
  instructions: string;
  model: string;
  tools: string[];
  shouldUse: {
    type: 'keywords' | 'regex' | 'complex' | 'default';
    keywords?: string[];
    pattern?: string;
    rules?: any[];
    operator?: 'AND' | 'OR';
    exclude?: any;
  };
  stackspotAgentId?: string;
}

// Interfaces de grupos removidas - agora usamos lista plana

export interface AgentsFile {
  agents: BackendAgent[];
  toolSets: Record<string, string[]>;
}

/**
 * Resposta formatada da API de agentes (lista plana)
 */
export interface AgentsResponse {
  agents: Array<{
    name: string;
    description: string;
    model: string;
    toolsCount: number;
    tools: string[];
    stackspotAgentId?: string;
  }>;
}

/**
 * Erro customizado para operações de API
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Função auxiliar para fazer requisições HTTP
 */
async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  
  // Log para debug (apenas em desenvolvimento)
  if (import.meta.env.DEV) {
    console.log(`[API] ${options?.method || 'GET'} ${url}`);
  }
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    // Verifica se a resposta é realmente JSON
    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');

    // Lê o texto da resposta uma vez (pode ser JSON ou HTML)
    const responseText = await response.text();

    if (!response.ok) {
      let errorData: any = {};
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      if (isJson) {
        try {
          errorData = JSON.parse(responseText);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // Se não conseguir fazer parse do JSON, usa o texto
          errorMessage = `HTTP ${response.status}: ${responseText.substring(0, 200)}`;
        }
      } else {
        // Se não for JSON, é provavelmente HTML de erro (404, 500, etc)
        errorMessage = `HTTP ${response.status}: Recebido HTML em vez de JSON. Verifique se o backend está rodando em ${API_URL} e se o endpoint ${endpoint} está correto.`;
        console.error('Resposta não-JSON recebida:', responseText.substring(0, 500));
      }
      
      throw new ApiError(errorMessage, response.status, errorData);
    }

    if (!isJson) {
      console.error('Resposta não-JSON recebida:', responseText.substring(0, 500));
      throw new ApiError(
        `Resposta não é JSON. Verifique se o backend está rodando em ${API_URL}. Endpoint: ${endpoint}. Resposta: ${responseText.substring(0, 200)}`,
        response.status,
        { responseText: responseText.substring(0, 500) }
      );
    }

    // Parse do JSON apenas se for JSON válido
    try {
      return JSON.parse(responseText) as T;
    } catch (e) {
      throw new ApiError(
        `Erro ao fazer parse do JSON. Resposta: ${responseText.substring(0, 200)}`,
        response.status,
        { responseText: responseText.substring(0, 500) }
      );
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    // Verifica se é erro de rede (CORS, conexão, etc)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ApiError(
        `Erro de conexão: Não foi possível conectar ao backend em ${API_URL}. Verifique se o backend está rodando.`,
        undefined,
        error
      );
    }
    
    throw new ApiError(
      `Erro de rede: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      undefined,
      error
    );
  }
}

/**
 * Obtém a estrutura completa dos agentes do backend (lista plana)
 * 
 * @returns Estrutura com lista plana de agentes e toolSets
 * @throws {ApiError} Se houver erro ao buscar os agentes
 */
export async function getAgentsConfig(): Promise<AgentsFile> {
  return fetchApi<AgentsFile>('/api/agents/config');
}

/**
 * Obtém lista formatada de agentes do backend
 * 
 * @returns Lista formatada de agentes com informações resumidas
 * @throws {ApiError} Se houver erro ao buscar os agentes
 */
export async function getAllAgents(): Promise<AgentsResponse> {
  return fetchApi<AgentsResponse>('/api/agents');
}

/**
 * Cria um novo agente (sem grupos)
 * 
 * @param agent - Configuração do agente a ser criado
 * @returns Agente criado
 * @throws {ApiError} Se houver erro ao criar o agente
 */
export async function createAgent(
  agent: BackendAgent
): Promise<BackendAgent> {
  return fetchApi<BackendAgent>(
    '/api/agents',
    {
      method: 'POST',
      body: JSON.stringify(agent),
    }
  );
}

/**
 * Atualiza um agente existente (sem grupos)
 * 
 * @param agentName - Nome do agente a ser atualizado
 * @param updates - Campos a serem atualizados
 * @returns Agente atualizado
 * @throws {ApiError} Se houver erro ao atualizar o agente
 */
export async function updateAgent(
  agentName: string,
  updates: Partial<BackendAgent>
): Promise<BackendAgent> {
  return fetchApi<BackendAgent>(
    `/api/agents/${encodeURIComponent(agentName)}`,
    {
      method: 'PUT',
      body: JSON.stringify(updates),
    }
  );
}

/**
 * Remove um agente (sem grupos)
 * 
 * @param agentName - Nome do agente a ser removido
 * @returns Confirmação de sucesso
 * @throws {ApiError} Se houver erro ao deletar o agente
 */
export async function deleteAgent(
  agentName: string
): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>(
    `/api/agents/${encodeURIComponent(agentName)}`,
    {
      method: 'DELETE',
    }
  );
}

