/**
 * Rotas de API para Projetos
 * 
 * Gerencia todas as rotas HTTP relacionadas a projetos.
 */

import { Router, Request, Response } from 'express';
import {
  loadProjects,
  getProject,
  getActiveProject,
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  setActiveProject,
} from '../projects/projectManager';
import { Project } from '../projects/projectTypes';

/**
 * Dependências necessárias para as rotas de projetos
 */
export interface ProjectRoutesDependencies {
  // Pode adicionar dependências futuras aqui
}

/**
 * Cria e configura todas as rotas de projetos
 * 
 * @param app - Instância do Express Router
 * @param deps - Dependências necessárias para as rotas
 */
export function setupProjectRoutes(app: Router, deps?: ProjectRoutesDependencies): void {
  /**
   * Helper de tratamento de erro para operações de projetos
   */
  const handleProjectError = (res: Response, error: unknown) => {
    if (error instanceof Error) {
      console.error('Erro ao manipular projeto:', error);
      return res.status(500).json({ error: error.message });
    }
    console.error('Erro inesperado ao manipular projetos:', error);
    return res.status(500).json({ error: 'Erro interno ao manipular projetos.' });
  };

  /**
   * GET /api/projects
   * Lista todos os projetos
   */
  app.get('/api/projects', async (req: Request, res: Response) => {
    try {
      const projects = await listProjects();
      res.json({ projects });
    } catch (error) {
      handleProjectError(res, error);
    }
  });

  /**
   * GET /api/projects/active
   * Obtém projeto ativo
   */
  app.get('/api/projects/active', async (req: Request, res: Response) => {
    try {
      const project = await getActiveProject();
      if (!project) {
        return res.status(404).json({ error: 'Nenhum projeto ativo' });
      }
      res.json({ project });
    } catch (error) {
      handleProjectError(res, error);
    }
  });

  /**
   * GET /api/projects/:id
   * Obtém projeto específico
   */
  app.get('/api/projects/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const project = await getProject(id);
      if (!project) {
        return res.status(404).json({ error: `Projeto ${id} não encontrado` });
      }
      res.json({ project });
    } catch (error) {
      handleProjectError(res, error);
    }
  });

  /**
   * POST /api/projects
   * Cria novo projeto
   */
  app.post('/api/projects', async (req: Request, res: Response) => {
    try {
      const projectData = req.body as Omit<Project, 'id' | 'createdAt' | 'updatedAt'>;
      
      // Validação básica
      if (!projectData.name || !projectData.name.trim()) {
        return res.status(400).json({ error: 'Nome do projeto é obrigatório' });
      }

      const project = await createProject(projectData);
      res.status(201).json({ project });
    } catch (error) {
      handleProjectError(res, error);
    }
  });

  /**
   * PUT /api/projects/:id
   * Atualiza projeto existente
   */
  app.put('/api/projects/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body as Partial<Project>;
      
      // Não permite alterar ID
      if (updates.id && updates.id !== id) {
        return res.status(400).json({ error: 'Não é possível alterar o ID do projeto' });
      }

      const project = await updateProject(id, updates);
      res.json({ project });
    } catch (error) {
      handleProjectError(res, error);
    }
  });

  /**
   * DELETE /api/projects/:id
   * Deleta projeto
   */
  app.delete('/api/projects/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await deleteProject(id);
      res.json({ success: true, message: `Projeto ${id} deletado com sucesso` });
    } catch (error) {
      handleProjectError(res, error);
    }
  });

  /**
   * POST /api/projects/:id/activate
   * Ativa um projeto (define como ativo)
   */
  app.post('/api/projects/:id/activate', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await setActiveProject(id);
      res.json({ success: true, message: `Projeto ${id} ativado com sucesso` });
    } catch (error) {
      handleProjectError(res, error);
    }
  });

  /**
   * POST /api/projects/deactivate
   * Desativa projeto ativo
   */
  app.post('/api/projects/deactivate', async (req: Request, res: Response) => {
    try {
      await setActiveProject(null);
      res.json({ success: true, message: 'Projeto desativado com sucesso' });
    } catch (error) {
      handleProjectError(res, error);
    }
  });

  /**
   * GET /api/projects/config
   * Obtém configuração completa de projetos (incluindo ativo)
   */
  app.get('/api/projects/config', async (req: Request, res: Response) => {
    try {
      const config = await loadProjects();
      res.json({ config });
    } catch (error) {
      handleProjectError(res, error);
    }
  });

  /**
   * PUT /api/projects/:id/workflows
   * Salva workflows no projeto
   */
  app.put('/api/projects/:id/workflows', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { workflows, activeWorkflowId } = req.body;
      
      if (!Array.isArray(workflows)) {
        return res.status(400).json({ error: 'Workflows deve ser um array' });
      }

      const project = await getProject(id);
      if (!project) {
        return res.status(404).json({ error: `Projeto ${id} não encontrado` });
      }

      await updateProject(id, {
        workflows,
        activeWorkflowId,
      });

      res.json({ success: true });
    } catch (error) {
      handleProjectError(res, error);
    }
  });

  /**
   * GET /api/projects/:id/workflows
   * Carrega workflows do projeto
   */
  app.get('/api/projects/:id/workflows', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const project = await getProject(id);
      
      if (!project) {
        return res.status(404).json({ error: `Projeto ${id} não encontrado` });
      }

      res.json({
        workflows: project.workflows || [],
        activeWorkflowId: project.activeWorkflowId,
      });
    } catch (error) {
      handleProjectError(res, error);
    }
  });
}

