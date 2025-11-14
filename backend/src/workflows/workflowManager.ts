/**
 * Gerenciador de Workflows
 * 
 * Responsável por carregar, salvar e gerenciar workflows.
 */

import fs from 'fs/promises';
import path from 'path';
import { Workflow, WorkflowConfig } from './workflowTypes';

/**
 * Caminho do arquivo workflows.json
 */
const WORKFLOW_FILE = path.join(__dirname, 'workflows.json');

/**
 * Cache de configuração de workflows
 */
let workflowConfigCache: WorkflowConfig | null = null;

/**
 * Carrega workflows do arquivo JSON
 * 
 * @returns Configuração de workflows
 */
export async function loadWorkflows(): Promise<WorkflowConfig> {
  if (workflowConfigCache) {
    return workflowConfigCache;
  }

  try {
    const data = await fs.readFile(WORKFLOW_FILE, 'utf-8');
    workflowConfigCache = JSON.parse(data);
    return workflowConfigCache!;
  } catch (error) {
    // Se arquivo não existe, cria estrutura padrão
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('⚠️ Arquivo workflows.json não encontrado, criando padrão...');
      workflowConfigCache = {
        workflows: [],
        activeWorkflowId: undefined,
      };
      await saveWorkflows(workflowConfigCache);
      return workflowConfigCache;
    }
    console.error('❌ Erro ao carregar workflows:', error);
    throw error;
  }
}

/**
 * Salva workflows no arquivo JSON
 * 
 * @param config - Configuração de workflows a ser salva
 */
export async function saveWorkflows(config: WorkflowConfig): Promise<void> {
  try {
    config.updatedAt = new Date().toISOString();
    await fs.writeFile(WORKFLOW_FILE, JSON.stringify(config, null, 2), 'utf-8');
    workflowConfigCache = config;
    console.log('✅ Workflows salvos com sucesso');
  } catch (error) {
    console.error('❌ Erro ao salvar workflows:', error);
    throw error;
  }
}

/**
 * Recarrega workflows do arquivo (limpa cache)
 * 
 * @returns Configuração de workflows recarregada
 */
export async function reloadWorkflows(): Promise<WorkflowConfig> {
  workflowConfigCache = null;
  return await loadWorkflows();
}

/**
 * Obtém workflow por ID
 * 
 * @param id - ID do workflow
 * @returns Workflow encontrado ou null
 */
export async function getWorkflow(id: string): Promise<Workflow | null> {
  const config = await loadWorkflows();
  return config.workflows.find(w => w.id === id) || null;
}

/**
 * Obtém workflow ativo
 * 
 * @returns Workflow ativo ou null
 */
export async function getActiveWorkflow(): Promise<Workflow | null> {
  const config = await loadWorkflows();
  if (!config.activeWorkflowId) {
    return null;
  }
  return getWorkflow(config.activeWorkflowId);
}

/**
 * Lista todos os workflows
 * 
 * @returns Array de workflows
 */
export async function listWorkflows(): Promise<Workflow[]> {
  const config = await loadWorkflows();
  return config.workflows;
}

/**
 * Cria novo workflow
 * 
 * @param workflow - Dados do workflow (sem id, createdAt, updatedAt)
 * @returns Workflow criado
 */
export async function createWorkflow(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
  const config = await loadWorkflows();
  
  // Gera ID único
  const id = workflow.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
  
  const newWorkflow: Workflow = {
    ...workflow,
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  config.workflows.push(newWorkflow);
  await saveWorkflows(config);
  
  return newWorkflow;
}

/**
 * Atualiza workflow existente
 * 
 * @param id - ID do workflow
 * @param updates - Atualizações a aplicar
 * @returns Workflow atualizado
 */
export async function updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow> {
  const config = await loadWorkflows();
  const index = config.workflows.findIndex(w => w.id === id);
  
  if (index === -1) {
    throw new Error(`Workflow ${id} não encontrado`);
  }
  
  config.workflows[index] = {
    ...config.workflows[index],
    ...updates,
    id, // Garante que ID não seja alterado
    updatedAt: new Date().toISOString(),
  };
  
  await saveWorkflows(config);
  return config.workflows[index];
}

/**
 * Deleta workflow
 * 
 * @param id - ID do workflow a ser deletado
 */
export async function deleteWorkflow(id: string): Promise<void> {
  const config = await loadWorkflows();
  const originalLength = config.workflows.length;
  config.workflows = config.workflows.filter(w => w.id !== id);
  
  if (config.workflows.length === originalLength) {
    throw new Error(`Workflow ${id} não encontrado`);
  }
  
  // Se era o workflow ativo, remove referência
  if (config.activeWorkflowId === id) {
    config.activeWorkflowId = undefined;
  }
  
  await saveWorkflows(config);
}

/**
 * Define workflow ativo
 * 
 * @param id - ID do workflow a ser ativado (null para desativar)
 */
export async function setActiveWorkflow(id: string | null): Promise<void> {
  const config = await loadWorkflows();
  
  if (id) {
    // Valida se workflow existe
    const workflow = config.workflows.find(w => w.id === id);
    if (!workflow) {
      throw new Error(`Workflow ${id} não encontrado`);
    }
    config.activeWorkflowId = id;
  } else {
    config.activeWorkflowId = undefined;
  }
  
  await saveWorkflows(config);
}

/**
 * Obtém configuração atual (síncrono, retorna cache se disponível)
 * 
 * @returns Configuração de workflows ou null se não carregada
 */
export function getWorkflowsConfig(): WorkflowConfig | null {
  return workflowConfigCache;
}

