/**
 * Tipos para sistema de workflows
 * 
 * Define as interfaces TypeScript para workflows, nós e edges.
 */

/**
 * Regra shouldUse para condições em edges
 */
export interface ShouldUseRule {
  type: 'keywords' | 'regex' | 'complex' | 'default';
  keywords?: string[];
  pattern?: string;
  rules?: ShouldUseRule[];
  operator?: 'AND' | 'OR';
  exclude?: ShouldUseRule;
  priorityKeywords?: string[];
}

/**
 * Condição de uma edge (conexão entre nós)
 */
export interface EdgeCondition {
  type: 'shouldUse' | 'result' | 'auto' | 'custom';
  shouldUseRule?: ShouldUseRule;
  when?: 'always' | 'success' | 'error' | 'condition';
  customScript?: string; // Para validações customizadas (futuro)
}

/**
 * Nó de um workflow
 */
export interface WorkflowNode {
  id: string;
  type: 'start' | 'agent' | 'end' | 'condition' | 'merge' | 'if-else' | 'user-approval';
  agentName?: string; // Se type = 'agent'
  position: { x: number; y: number };
  data?: {
    label?: string;
    type?: string; // Tipo interno (para compatibilidade com React Flow)
    condition?: string; // Para type = 'condition'
    config?: {
      conditions?: Array<{
        id: string;
        caseName?: string;
        condition?: string;
      }>;
      elseLabel?: string;
    };
    [key: string]: any; // Permite campos extras
  };
}

/**
 * Edge (conexão) entre nós
 */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: EdgeCondition;
  animated?: boolean;
  label?: string;
  style?: Record<string, any>;
  [key: string]: any; // Permite campos extras
}

/**
 * Workflow completo
 */
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  version?: string; // Versão do workflow (ex: "1.0.0", "2.1.3")
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  active?: boolean; // Workflow ativo
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Configuração de workflows (arquivo JSON)
 */
export interface WorkflowConfig {
  workflows: Workflow[];
  activeWorkflowId?: string;
  updatedAt?: string;
}

/**
 * Contexto de execução de um workflow
 */
export interface ExecutionContext {
  message: string;
  lastResult?: any;
  lastNode?: string;
  variables?: Record<string, any>; // Variáveis do workflow
  history: Array<{
    nodeId: string;
    result: any;
    timestamp: string;
  }>;
}

/**
 * Resultado da execução de um workflow
 */
export interface WorkflowExecutionResult {
  success: boolean;
  result: any;
  path: string[]; // IDs dos nós executados
  context: ExecutionContext;
  error?: string;
}

