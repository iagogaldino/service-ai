/**
 * Rotas de API para Workflows
 * 
 * Gerencia todas as rotas HTTP relacionadas a workflows.
 */

import { Router, Request, Response } from 'express';
import {
  loadWorkflows,
  getWorkflow,
  getActiveWorkflow,
  listWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  setActiveWorkflow,
} from '../workflows/workflowManager';
import { Workflow } from '../workflows/workflowTypes';

/**
 * Dependências necessárias para as rotas de workflows
 */
export interface WorkflowRoutesDependencies {
  // Pode adicionar dependências futuras aqui
}

/**
 * Cria e configura todas as rotas de workflows
 * 
 * @param app - Instância do Express Router
 * @param deps - Dependências necessárias para as rotas
 */
export function setupWorkflowRoutes(app: Router, deps?: WorkflowRoutesDependencies): void {
  /**
   * Helper de tratamento de erro para operações de workflows
   */
  const handleWorkflowError = (res: Response, error: unknown) => {
    if (error instanceof Error) {
      console.error('Erro ao manipular workflow:', error);
      return res.status(500).json({ error: error.message });
    }
    console.error('Erro inesperado ao manipular workflows:', error);
    return res.status(500).json({ error: 'Erro interno ao manipular workflows.' });
  };

  /**
   * GET /api/workflows
   * Lista todos os workflows
   */
  app.get('/api/workflows', async (req: Request, res: Response) => {
    try {
      const workflows = await listWorkflows();
      res.json({ workflows });
    } catch (error) {
      handleWorkflowError(res, error);
    }
  });

  /**
   * GET /api/workflows/active
   * Obtém workflow ativo
   */
  app.get('/api/workflows/active', async (req: Request, res: Response) => {
    try {
      const workflow = await getActiveWorkflow();
      if (!workflow) {
        return res.status(404).json({ error: 'Nenhum workflow ativo' });
      }
      res.json({ workflow });
    } catch (error) {
      handleWorkflowError(res, error);
    }
  });

  /**
   * GET /api/workflows/:id
   * Obtém workflow específico
   */
  app.get('/api/workflows/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const workflow = await getWorkflow(id);
      if (!workflow) {
        return res.status(404).json({ error: `Workflow ${id} não encontrado` });
      }
      res.json({ workflow });
    } catch (error) {
      handleWorkflowError(res, error);
    }
  });

  /**
   * POST /api/workflows
   * Cria novo workflow
   */
  app.post('/api/workflows', async (req: Request, res: Response) => {
    try {
      const workflowData = req.body as Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>;
      
      // Validação básica
      if (!workflowData.name) {
        return res.status(400).json({ error: 'Nome do workflow é obrigatório' });
      }
      if (!workflowData.nodes || !Array.isArray(workflowData.nodes)) {
        return res.status(400).json({ error: 'Nodes é obrigatório e deve ser um array' });
      }
      if (!workflowData.edges || !Array.isArray(workflowData.edges)) {
        return res.status(400).json({ error: 'Edges é obrigatório e deve ser um array' });
      }

      const workflow = await createWorkflow(workflowData);
      res.status(201).json({ workflow });
    } catch (error) {
      handleWorkflowError(res, error);
    }
  });

  /**
   * PUT /api/workflows/:id
   * Atualiza workflow existente
   */
  app.put('/api/workflows/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body as Partial<Workflow>;
      
      // Não permite alterar ID
      if (updates.id && updates.id !== id) {
        return res.status(400).json({ error: 'Não é possível alterar o ID do workflow' });
      }

      const workflow = await updateWorkflow(id, updates);
      res.json({ workflow });
    } catch (error) {
      handleWorkflowError(res, error);
    }
  });

  /**
   * DELETE /api/workflows/:id
   * Deleta workflow
   */
  app.delete('/api/workflows/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await deleteWorkflow(id);
      res.json({ success: true, message: `Workflow ${id} deletado com sucesso` });
    } catch (error) {
      handleWorkflowError(res, error);
    }
  });

  /**
   * POST /api/workflows/:id/activate
   * Ativa um workflow (define como ativo)
   */
  app.post('/api/workflows/:id/activate', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await setActiveWorkflow(id);
      res.json({ success: true, message: `Workflow ${id} ativado com sucesso` });
    } catch (error) {
      handleWorkflowError(res, error);
    }
  });

  /**
   * POST /api/workflows/deactivate
   * Desativa workflow ativo
   */
  app.post('/api/workflows/deactivate', async (req: Request, res: Response) => {
    try {
      await setActiveWorkflow(null);
      res.json({ success: true, message: 'Workflow desativado com sucesso' });
    } catch (error) {
      handleWorkflowError(res, error);
    }
  });

  /**
   * GET /api/workflows/config
   * Obtém configuração completa de workflows (incluindo ativo)
   */
  app.get('/api/workflows/config', async (req: Request, res: Response) => {
    try {
      const config = await loadWorkflows();
      res.json({ config });
    } catch (error) {
      handleWorkflowError(res, error);
    }
  });
}

