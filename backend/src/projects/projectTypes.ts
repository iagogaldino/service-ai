/**
 * Tipos para sistema de projetos
 * 
 * Define as interfaces TypeScript para projetos.
 */

import { AgentsJsonFile } from '../agents/agentLoader';
import { Workflow } from '../workflows/workflowTypes';

/**
 * Projeto completo
 */
export interface Project {
  id: string;
  name: string;
  description?: string;
  agents?: AgentsJsonFile; // Agentes do projeto (lista plana)
  workflows?: Workflow[]; // Workflows do projeto
  activeWorkflowId?: string; // ID do workflow ativo do projeto
  createdAt: string;
  updatedAt: string;
}

/**
 * Configuração de projetos (arquivo JSON)
 */
export interface ProjectsConfig {
  projects: Project[];
  activeProjectId?: string;
  updatedAt?: string;
}

