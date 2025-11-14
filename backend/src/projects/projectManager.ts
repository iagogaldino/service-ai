/**
 * Gerenciador de Projetos
 * 
 * Responsável por carregar, salvar e gerenciar projetos.
 */

import fs from 'fs/promises';
import path from 'path';
import { Project, ProjectsConfig } from './projectTypes';
import { randomUUID } from 'crypto';
import { AgentsJsonFile, AgentJsonConfig } from '../agents/agentLoader';
import { Workflow } from '../workflows/workflowTypes';

/**
 * Caminho do arquivo projects.json
 */
const PROJECTS_FILE = path.join(__dirname, 'projects.json');

/**
 * Cache de configuração de projetos
 */
let projectsConfigCache: ProjectsConfig | null = null;

/**
 * Carrega projetos do arquivo JSON
 * 
 * @returns Configuração de projetos
 */
export async function loadProjects(): Promise<ProjectsConfig> {
  if (projectsConfigCache) {
    return projectsConfigCache;
  }

  try {
    const data = await fs.readFile(PROJECTS_FILE, 'utf-8');
    
    // Se arquivo está vazio ou só tem whitespace, cria estrutura padrão
    if (!data || !data.trim()) {
      console.warn('⚠️ Arquivo projects.json está vazio, criando estrutura padrão...');
      projectsConfigCache = {
        projects: [],
        activeProjectId: undefined,
      };
      await saveProjects(projectsConfigCache);
      return projectsConfigCache;
    }
    
    projectsConfigCache = JSON.parse(data);
    
    // Valida estrutura básica
    if (!projectsConfigCache || typeof projectsConfigCache !== 'object') {
      throw new Error('Estrutura inválida no arquivo projects.json');
    }
    
    // Garante que tem a estrutura mínima
    if (!Array.isArray(projectsConfigCache.projects)) {
      projectsConfigCache.projects = [];
    }
    
    return projectsConfigCache;
  } catch (error) {
    // Se arquivo não existe, cria estrutura padrão
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('⚠️ Arquivo projects.json não encontrado, criando padrão...');
      projectsConfigCache = {
        projects: [],
        activeProjectId: undefined,
      };
      await saveProjects(projectsConfigCache);
      return projectsConfigCache;
    }
    
    // Se erro de parsing JSON (arquivo corrompido ou vazio)
    if (error instanceof SyntaxError || (error as Error).message.includes('JSON')) {
      console.warn('⚠️ Arquivo projects.json está corrompido ou vazio, criando estrutura padrão...');
      projectsConfigCache = {
        projects: [],
        activeProjectId: undefined,
      };
      await saveProjects(projectsConfigCache);
      return projectsConfigCache;
    }
    
    console.error('❌ Erro ao carregar projetos:', error);
    throw error;
  }
}

/**
 * Salva projetos no arquivo JSON
 * 
 * @param config - Configuração de projetos a ser salva
 */
async function saveProjects(config: ProjectsConfig): Promise<void> {
  try {
    config.updatedAt = new Date().toISOString();
    await fs.writeFile(PROJECTS_FILE, JSON.stringify(config, null, 2), 'utf-8');
    projectsConfigCache = config;
  } catch (error) {
    console.error('❌ Erro ao salvar projetos:', error);
    throw error;
  }
}

/**
 * Lista todos os projetos
 * 
 * @returns Array de projetos
 */
export async function listProjects(): Promise<Project[]> {
  const config = await loadProjects();
  return config.projects;
}

/**
 * Obtém projeto por ID
 * 
 * @param id - ID do projeto
 * @returns Projeto ou null se não encontrado
 */
export async function getProject(id: string): Promise<Project | null> {
  const config = await loadProjects();
  return config.projects.find(p => p.id === id) || null;
}

/**
 * Obtém projeto ativo
 * 
 * @returns Projeto ativo ou null se não houver
 */
export async function getActiveProject(): Promise<Project | null> {
  const config = await loadProjects();
  if (!config.activeProjectId) {
    return null;
  }
  return getProject(config.activeProjectId);
}

/**
 * Cria novo projeto com estrutura inicial de agentes (grupo padrão)
 * 
 * @param projectData - Dados do projeto (sem id, createdAt, updatedAt)
 * @returns Projeto criado
 */
export async function createProject(
  projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Project> {
  const config = await loadProjects();
  
  // Cria estrutura inicial de agentes com grupo padrão
  const initialAgents = createInitialAgentsStructure();
  
  const newProject: Project = {
    id: randomUUID(),
    name: projectData.name,
    description: projectData.description,
    agents: initialAgents,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  config.projects.push(newProject);
  await saveProjects(config);
  
  return newProject;
}

/**
 * Atualiza projeto existente
 * 
 * @param id - ID do projeto
 * @param updates - Campos a serem atualizados
 * @returns Projeto atualizado
 */
export async function updateProject(
  id: string,
  updates: Partial<Omit<Project, 'id' | 'createdAt'>> & { updatedAt?: string }
): Promise<Project> {
  const config = await loadProjects();
  const projectIndex = config.projects.findIndex(p => p.id === id);
  
  if (projectIndex === -1) {
    throw new Error(`Projeto ${id} não encontrado`);
  }
  
  const updatedProject: Project = {
    ...config.projects[projectIndex],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  
  config.projects[projectIndex] = updatedProject;
  await saveProjects(config);
  
  return updatedProject;
}

/**
 * Deleta projeto
 * 
 * @param id - ID do projeto
 */
export async function deleteProject(id: string): Promise<void> {
  const config = await loadProjects();
  const projectIndex = config.projects.findIndex(p => p.id === id);
  
  if (projectIndex === -1) {
    throw new Error(`Projeto ${id} não encontrado`);
  }
  
  config.projects.splice(projectIndex, 1);
  
  // Se era o projeto ativo, remove a referência
  if (config.activeProjectId === id) {
    config.activeProjectId = undefined;
  }
  
  await saveProjects(config);
}

/**
 * Define projeto ativo
 * 
 * @param id - ID do projeto a ser ativado (ou null para desativar)
 */
export async function setActiveProject(id: string | null): Promise<void> {
  const config = await loadProjects();
  
  if (id !== null) {
    const project = await getProject(id);
    if (!project) {
      throw new Error(`Projeto ${id} não encontrado`);
    }
  }
  
  config.activeProjectId = id || undefined;
  await saveProjects(config);
}

/**
 * Salva agentes no projeto ativo
 * 
 * @param agents - Lista plana de agentes
 */
export async function saveProjectAgents(agents: AgentsJsonFile): Promise<void> {
  const config = await loadProjects();
  
  if (!config.activeProjectId) {
    throw new Error('Nenhum projeto ativo. Ative um projeto antes de salvar agentes.');
  }
  
  const projectIndex = config.projects.findIndex(p => p.id === config.activeProjectId);
  if (projectIndex === -1) {
    throw new Error(`Projeto ativo ${config.activeProjectId} não encontrado`);
  }
  
  config.projects[projectIndex].agents = agents;
  config.projects[projectIndex].updatedAt = new Date().toISOString();
  
  await saveProjects(config);
}

/**
 * Cria estrutura inicial de agentes (lista vazia)
 */
function createInitialAgentsStructure(): AgentsJsonFile {
  return {
    toolSets: {},
    agents: [],
  };
}

/**
 * Carrega agentes do projeto ativo
 * 
 * @returns Lista plana de agentes ou null se não houver projeto ativo
 */
export async function loadProjectAgents(): Promise<AgentsJsonFile | null> {
  const config = await loadProjects();
  
  if (!config.activeProjectId) {
    return null;
  }
  
  const project = config.projects.find(p => p.id === config.activeProjectId);
  if (!project) {
    return null;
  }

  // Se não tem agentes, inicializa com estrutura padrão e salva
  if (!project.agents || !project.agents.agents || project.agents.agents.length === 0) {
    const initialAgents = createInitialAgentsStructure();
    project.agents = initialAgents;
    project.updatedAt = new Date().toISOString();
    await saveProjects(config);
    return initialAgents;
  }
  
  return project.agents;
}

/**
 * Carrega agentes de um projeto específico
 * 
 * @param projectId - ID do projeto
 * @returns Lista plana de agentes ou null se não encontrado
 */
export async function loadProjectAgentsById(projectId: string): Promise<AgentsJsonFile | null> {
  const project = await getProject(projectId);
  if (!project) {
    return null;
  }
  
  if (!project.agents) {
    return {
      toolSets: {},
      agents: [],
    };
  }
  
  return project.agents;
}

/**
 * Salva workflows no projeto ativo
 * 
 * @param workflows - Array de workflows
 * @param activeWorkflowId - ID do workflow ativo (opcional)
 */
export async function saveProjectWorkflows(workflows: Workflow[], activeWorkflowId?: string): Promise<void> {
  const config = await loadProjects();
  
  if (!config.activeProjectId) {
    throw new Error('Nenhum projeto ativo. Ative um projeto antes de salvar workflows.');
  }
  
  const projectIndex = config.projects.findIndex(p => p.id === config.activeProjectId);
  if (projectIndex === -1) {
    throw new Error(`Projeto ativo ${config.activeProjectId} não encontrado`);
  }
  
  config.projects[projectIndex].workflows = workflows;
  config.projects[projectIndex].activeWorkflowId = activeWorkflowId;
  config.projects[projectIndex].updatedAt = new Date().toISOString();
  
  await saveProjects(config);
}

/**
 * Carrega workflows do projeto ativo
 * 
 * @returns Array de workflows ou array vazio se não houver projeto ativo
 */
export async function loadProjectWorkflows(): Promise<{ workflows: Workflow[]; activeWorkflowId?: string }> {
  const config = await loadProjects();
  
  if (!config.activeProjectId) {
    return { workflows: [] };
  }
  
  const project = config.projects.find(p => p.id === config.activeProjectId);
  if (!project) {
    return { workflows: [] };
  }
  
  return {
    workflows: project.workflows || [],
    activeWorkflowId: project.activeWorkflowId,
  };
}

/**
 * Limpa o cache (útil para testes ou reload)
 */
export function clearCache(): void {
  projectsConfigCache = null;
}

