/**
 * Serviço de comunicação com a API de projetos do backend
 */

// URL da API do backend
const API_URL = import.meta.env.DEV 
  ? '' // Em dev, usa proxy do Vite (relativo)
  : (import.meta.env?.VITE_API_URL as string) || 'http://localhost:3000';

/**
 * Tipos de projeto
 */
export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectsConfig {
  projects: Project[];
  activeProjectId?: string;
  updatedAt?: string;
}

/**
 * Erro customizado para operações de API
 */
export class ProjectApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'ProjectApiError';
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
      throw new ProjectApiError(
        `Resposta não é JSON. Status: ${response.status}. Conteúdo: ${text.substring(0, 100)}`,
        response.status,
        text
      );
    }

    const data = await response.json();

    if (!response.ok) {
      throw new ProjectApiError(
        data.error || `Erro HTTP: ${response.status}`,
        response.status,
        data
      );
    }

    return data;
  } catch (error) {
    if (error instanceof ProjectApiError) {
      throw error;
    }
    
    // Erros de rede
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ProjectApiError(
        'Erro de conexão com o backend. Verifique se o servidor está rodando em http://localhost:3000',
        0,
        error
      );
    }

    throw new ProjectApiError(
      error instanceof Error ? error.message : 'Erro desconhecido',
      undefined,
      error
    );
  }
}

/**
 * Lista todos os projetos
 */
export async function listProjects(): Promise<Project[]> {
  const data = await fetchApi<{ projects: Project[] }>('/api/projects');
  return data.projects;
}

/**
 * Obtém projeto por ID
 */
export async function getProject(id: string): Promise<Project> {
  const data = await fetchApi<{ project: Project }>(`/api/projects/${id}`);
  return data.project;
}

/**
 * Obtém projeto ativo
 */
export async function getActiveProject(): Promise<Project | null> {
  try {
    const data = await fetchApi<{ project: Project }>('/api/projects/active');
    return data.project;
  } catch (error) {
    if (error instanceof ProjectApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Cria novo projeto
 */
export async function createProject(
  projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Project> {
  const data = await fetchApi<{ project: Project }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(projectData),
  });
  return data.project;
}

/**
 * Atualiza projeto existente
 */
export async function updateProject(
  id: string,
  updates: Partial<Project>
): Promise<Project> {
  const data = await fetchApi<{ project: Project }>(`/api/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return data.project;
}

/**
 * Deleta projeto
 */
export async function deleteProject(id: string): Promise<void> {
  await fetchApi(`/api/projects/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Ativa projeto (define como ativo)
 */
export async function activateProject(id: string): Promise<void> {
  await fetchApi(`/api/projects/${id}/activate`, {
    method: 'POST',
  });
}

/**
 * Desativa projeto ativo
 */
export async function deactivateProject(): Promise<void> {
  await fetchApi('/api/projects/deactivate', {
    method: 'POST',
  });
}

/**
 * Obtém configuração completa de projetos
 */
export async function getProjectsConfig(): Promise<ProjectsConfig> {
  const data = await fetchApi<{ config: ProjectsConfig }>('/api/projects/config');
  return data.config;
}

/**
 * Salva workflows no projeto ativo
 */
export async function saveProjectWorkflows(workflows: any[], activeWorkflowId?: string): Promise<void> {
  const activeProject = await getActiveProject();
  if (!activeProject) {
    throw new Error('Nenhum projeto ativo');
  }
  
  await fetchApi(`/api/projects/${activeProject.id}/workflows`, {
    method: 'PUT',
    body: JSON.stringify({ workflows, activeWorkflowId }),
  });
}

/**
 * Carrega workflows do projeto ativo
 */
export async function loadProjectWorkflows(): Promise<{ workflows: any[]; activeWorkflowId?: string }> {
  const activeProject = await getActiveProject();
  if (!activeProject) {
    return { workflows: [] };
  }
  
  try {
    const data = await fetchApi<{ workflows: any[]; activeWorkflowId?: string }>(
      `/api/projects/${activeProject.id}/workflows`
    );
    return data;
  } catch (error) {
    // Se não encontrou endpoint ou projeto não tem workflows, retorna vazio
    return { workflows: [] };
  }
}

