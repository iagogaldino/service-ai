# 🚀 Plano de Implementação: Sistema de Nós

## 📋 Resumo Executivo

Este documento detalha como implementar um sistema baseado em nós/grafos que funciona **paralelamente** ao sistema hierárquico atual, permitindo:

1. ✅ Usar hierarquia para casos simples (padrão)
2. ✅ Usar workflows para casos complexos (opcional)
3. ✅ Migrar gradualmente quando necessário

---

## 🏗️ Arquitetura Proposta

### Visão Geral

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                     │
│                                                          │
│  ┌──────────────┐          ┌──────────────┐            │
│  │ React Flow   │ ────────>│ Workflow UI  │            │
│  │ (Visual)     │          │ (Criar/Editar)│            │
│  └──────┬───────┘          └──────┬───────┘            │
│         │                         │                     │
│         └───────────┬─────────────┘                     │
│                     │                                   │
│                     ▼                                   │
│              ┌──────────────┐                          │
│              │ API Service  │                          │
│              └──────┬───────┘                          │
└─────────────────────┼──────────────────────────────────┘
                      │
                      │ HTTP/WebSocket
                      ▼
┌─────────────────────────────────────────────────────────┐
│                      BACKEND (Node.js)                   │
│                                                          │
│  ┌────────────────────────────────────────────┐        │
│  │     Message Handler (Socket.IO)            │        │
│  │                                             │        │
│  │  ┌──────────────┐      ┌──────────────┐   │        │
│  │  │ Hierarchical │      │   Workflow   │   │        │
│  │  │   Handler    │      │   Handler    │   │        │
│  │  │ (Atual)      │      │   (Novo)     │   │        │
│  │  └──────┬───────┘      └──────┬───────┘   │        │
│  │         │                     │            │        │
│  │         └──────────┬──────────┘            │        │
│  │                    │                       │        │
│  │                    ▼                       │        │
│  │              ┌──────────┐                 │        │
│  │              │  Router  │                 │        │
│  │              │ (Escolhe)│                 │        │
│  │              └────┬─────┘                 │        │
│  └───────────────────┼───────────────────────┘        │
│                      │                                  │
│         ┌────────────┼────────────┐                    │
│         ▼            ▼            ▼                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │  Agents  │  │ Workflow │  │  Agent   │            │
│  │  Config  │  │  Manager │  │ Manager  │            │
│  │ (JSON)   │  │  (Novo)  │  │ (Atual)  │            │
│  └──────────┘  └──────────┘  └──────────┘            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Estrutura de Arquivos

### Backend (Novos Arquivos)

```
src/
├── workflows/
│   ├── workflowManager.ts       # Gerenciador de workflows
│   ├── workflowLoader.ts        # Carregador de workflows
│   ├── workflowExecutor.ts      # Executor de workflows
│   └── workflowTypes.ts         # Tipos TypeScript
├── routes/
│   └── workflowRoutes.ts        # Rotas de API para workflows
└── workflows.json               # Arquivo de workflows (novo)
```

### Frontend (Modificações)

```
react-interface/src/
├── services/
│   └── workflowService.ts       # Serviço de API para workflows (novo)
├── utils/
│   └── workflowExecutor.ts      # Executor de workflows no frontend (novo)
└── components/
    └── WorkflowSelector.tsx     # Seletor de workflow (novo)
```

---

## 🔧 Implementação Detalhada

### Fase 1: Estrutura Base (Backend)

#### 1.1. Criar Tipos TypeScript

**`src/workflows/workflowTypes.ts`**

```typescript
/**
 * Tipos para sistema de workflows
 */

export interface WorkflowNode {
  id: string;
  type: 'start' | 'agent' | 'end' | 'condition' | 'merge';
  agentName?: string; // Se type = 'agent'
  position: { x: number; y: number };
  data?: {
    label?: string;
    condition?: string; // Para type = 'condition'
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: EdgeCondition;
  animated?: boolean;
}

export interface EdgeCondition {
  type: 'shouldUse' | 'result' | 'auto' | 'custom';
  shouldUseRule?: {
    type: 'keywords' | 'regex' | 'complex' | 'default';
    keywords?: string[];
    pattern?: string;
    rules?: any[];
    operator?: 'AND' | 'OR';
  };
  when?: 'always' | 'success' | 'error' | 'condition';
  customScript?: string; // Para validações customizadas
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  active?: boolean; // Workflow ativo
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowConfig {
  workflows: Workflow[];
  activeWorkflowId?: string;
}

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

export interface WorkflowExecutionResult {
  success: boolean;
  result: any;
  path: string[]; // IDs dos nós executados
  context: ExecutionContext;
  error?: string;
}
```

#### 1.2. Criar Gerenciador de Workflows

**`src/workflows/workflowManager.ts`**

```typescript
/**
 * Gerenciador de Workflows
 * 
 * Responsável por carregar, salvar e gerenciar workflows.
 */

import fs from 'fs/promises';
import path from 'path';
import { Workflow, WorkflowConfig } from './workflowTypes';

const WORKFLOW_FILE = path.join(__dirname, 'workflows.json');

let workflowConfigCache: WorkflowConfig | null = null;

/**
 * Carrega workflows do arquivo JSON
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
    console.warn('Arquivo workflows.json não encontrado, criando padrão...');
    workflowConfigCache = {
      workflows: [],
      activeWorkflowId: undefined,
    };
    await saveWorkflows(workflowConfigCache);
    return workflowConfigCache;
  }
}

/**
 * Salva workflows no arquivo JSON
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
 * Obtém workflow por ID
 */
export async function getWorkflow(id: string): Promise<Workflow | null> {
  const config = await loadWorkflows();
  return config.workflows.find(w => w.id === id) || null;
}

/**
 * Obtém workflow ativo
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
 */
export async function listWorkflows(): Promise<Workflow[]> {
  const config = await loadWorkflows();
  return config.workflows;
}

/**
 * Cria novo workflow
 */
export async function createWorkflow(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
  const config = await loadWorkflows();
  
  const newWorkflow: Workflow = {
    ...workflow,
    id: workflow.name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  config.workflows.push(newWorkflow);
  await saveWorkflows(config);
  
  return newWorkflow;
}

/**
 * Atualiza workflow existente
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
    updatedAt: new Date().toISOString(),
  };
  
  await saveWorkflows(config);
  return config.workflows[index];
}

/**
 * Deleta workflow
 */
export async function deleteWorkflow(id: string): Promise<void> {
  const config = await loadWorkflows();
  config.workflows = config.workflows.filter(w => w.id !== id);
  
  // Se era o workflow ativo, remove referência
  if (config.activeWorkflowId === id) {
    config.activeWorkflowId = undefined;
  }
  
  await saveWorkflows(config);
}

/**
 * Define workflow ativo
 */
export async function setActiveWorkflow(id: string | null): Promise<void> {
  const config = await loadWorkflows();
  config.activeWorkflowId = id || undefined;
  await saveWorkflows(config);
}
```

#### 1.3. Criar Executor de Workflows

**`src/workflows/workflowExecutor.ts`**

```typescript
/**
 * Executor de Workflows
 * 
 * Responsável por executar workflows e processar mensagens através de nós.
 */

import { Workflow, WorkflowNode, WorkflowEdge, ExecutionContext, WorkflowExecutionResult, EdgeCondition } from './workflowTypes';
import { getAgentsConfig, AgentConfig } from '../agents/config';
import { AgentManager } from '../agents/agentManager';

/**
 * Executa um workflow completo
 */
export async function executeWorkflow(
  workflow: Workflow,
  message: string,
  agentManager: AgentManager
): Promise<WorkflowExecutionResult> {
  const context: ExecutionContext = {
    message,
    history: [],
    variables: {},
  };

  try {
    // 1. Encontra nó inicial (Start)
    const startNode = workflow.nodes.find(n => n.type === 'start');
    if (!startNode) {
      throw new Error('Workflow não tem nó Start');
    }

    // 2. Seleciona primeiro nó a executar
    let currentNode = selectInitialNode(workflow, startNode, message);

    // 3. Loop de execução
    const path: string[] = [];
    while (currentNode && currentNode.type !== 'end') {
      path.push(currentNode.id);

      // 3.1. Executa nó atual
      const result = await executeNode(currentNode, context, agentManager);
      
      // 3.2. Atualiza contexto
      context.lastResult = result;
      context.lastNode = currentNode.id;
      context.history.push({
        nodeId: currentNode.id,
        result,
        timestamp: new Date().toISOString(),
      });

      // 3.3. Encontra próximo nó
      const nextEdge = findNextEdge(workflow, currentNode, context);
      
      if (!nextEdge) {
        // Sem próximo nó, finaliza
        break;
      }

      // 3.4. Avalia condição da edge
      if (evaluateEdgeCondition(nextEdge.condition, context)) {
        currentNode = workflow.nodes.find(n => n.id === nextEdge.target);
      } else {
        // Condição não atendida, finaliza
        break;
      }

      // Prevenção de loops infinitos
      if (path.length > 100) {
        throw new Error('Loop infinito detectado no workflow');
      }
    }

    return {
      success: true,
      result: context.lastResult,
      path,
      context,
    };
  } catch (error) {
    return {
      success: false,
      result: null,
      path: context.history.map(h => h.nodeId),
      context,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Seleciona nó inicial baseado em edges do Start
 */
function selectInitialNode(
  workflow: Workflow,
  startNode: WorkflowNode,
  message: string
): WorkflowNode {
  const startEdges = workflow.edges.filter(e => e.source === startNode.id);
  
  // Avalia cada edge
  for (const edge of startEdges) {
    if (evaluateEdgeCondition(edge.condition, { message, history: [], variables: {} })) {
      const targetNode = workflow.nodes.find(n => n.id === edge.target);
      if (targetNode) {
        return targetNode;
      }
    }
  }
  
  // Fallback: primeiro nó conectado ao Start
  if (startEdges.length > 0) {
    const targetNode = workflow.nodes.find(n => n.id === startEdges[0].target);
    if (targetNode) {
      return targetNode;
    }
  }
  
  throw new Error('Nenhum nó inicial encontrado');
}

/**
 * Executa um nó específico
 */
async function executeNode(
  node: WorkflowNode,
  context: ExecutionContext,
  agentManager: AgentManager
): Promise<any> {
  switch (node.type) {
    case 'agent':
      if (!node.agentName) {
        throw new Error(`Nó ${node.id} do tipo agent não tem agentName`);
      }
      
      // Busca configuração do agente
      const agents = getAgentsConfig();
      const agentConfig = agents.find(a => a.name === node.agentName);
      
      if (!agentConfig) {
        throw new Error(`Agente ${node.agentName} não encontrado`);
      }
      
      // Executa agente
      const { agentId } = await agentManager.getAgentForMessage(context.message);
      // Aqui você precisaria de uma função para executar o agente
      // Por enquanto, retorna configuração
      return {
        agentId,
        agentName: node.agentName,
        config: agentConfig,
      };
    
    case 'condition':
      // Nós de condição apenas avaliam
      return { type: 'condition', evaluated: true };
    
    case 'end':
      return { type: 'end', finished: true };
    
    default:
      return { type: node.type };
  }
}

/**
 * Encontra próximo edge válido
 */
function findNextEdge(
  workflow: Workflow,
  currentNode: WorkflowNode,
  context: ExecutionContext
): WorkflowEdge | null {
  const edges = workflow.edges.filter(e => e.source === currentNode.id);
  
  // Retorna primeira edge sem condição ou com condição atendida
  for (const edge of edges) {
    if (!edge.condition || evaluateEdgeCondition(edge.condition, context)) {
      return edge;
    }
  }
  
  return null;
}

/**
 * Avalia condição de uma edge
 */
function evaluateEdgeCondition(
  condition: EdgeCondition | undefined,
  context: ExecutionContext
): boolean {
  if (!condition) {
    return true; // Sem condição = sempre passa
  }

  switch (condition.type) {
    case 'shouldUse':
      if (condition.shouldUseRule) {
        return evaluateShouldUseRule(condition.shouldUseRule, context.message);
      }
      return true;
    
    case 'result':
      if (condition.when === 'always') return true;
      if (condition.when === 'success') return !context.lastResult?.error;
      if (condition.when === 'error') return !!context.lastResult?.error;
      return true;
    
    case 'auto':
      return condition.when === 'always';
    
    default:
      return true;
  }
}

/**
 * Avalia regra shouldUse (simplificado)
 */
function evaluateShouldUseRule(rule: any, message: string): boolean {
  if (!rule) return true;

  switch (rule.type) {
    case 'keywords':
      if (rule.keywords) {
        const lowerMessage = message.toLowerCase();
        return rule.keywords.some((kw: string) => lowerMessage.includes(kw.toLowerCase()));
      }
      return false;
    
    case 'regex':
      if (rule.pattern) {
        try {
          const regex = new RegExp(rule.pattern, 'i');
          return regex.test(message);
        } catch {
          return false;
        }
      }
      return false;
    
    case 'default':
      return true;
    
    default:
      return true;
  }
}
```

---

## 📝 Próximos Passos

Para continuar a implementação:

1. **Criar rotas de API** (`src/routes/workflowRoutes.ts`)
2. **Integrar com Socket.IO** (modificar `src/handlers/socketHandlers.ts`)
3. **Criar serviço no frontend** (`react-interface/src/services/workflowService.ts`)
4. **Adicionar UI de seleção** (`react-interface/src/components/WorkflowSelector.tsx`)
5. **Testar execução** com workflow simples

---

## ✅ Checklist de Implementação

### Backend
- [ ] Criar `workflowTypes.ts`
- [ ] Criar `workflowManager.ts`
- [ ] Criar `workflowExecutor.ts`
- [ ] Criar `workflowRoutes.ts`
- [ ] Integrar com Socket.IO
- [ ] Criar `workflows.json` inicial
- [ ] Testar CRUD de workflows
- [ ] Testar execução de workflow simples

### Frontend
- [ ] Criar `workflowService.ts`
- [ ] Criar `WorkflowSelector.tsx`
- [ ] Integrar salvamento de workflows
- [ ] Adicionar botão "Executar Workflow"
- [ ] Mostrar execução em tempo real
- [ ] Testar salvamento/carregamento

### Documentação
- [ ] Documentar API de workflows
- [ ] Criar guia de uso
- [ ] Exemplos de workflows
- [ ] Guia de migração

---

## 🎯 Resumo

Este plano permite implementar um sistema de workflows **sem quebrar** o sistema hierárquico atual. A solução híbrida oferece:

- ✅ Flexibilidade para casos complexos
- ✅ Simplicidade para casos básicos
- ✅ Migração gradual quando necessário
- ✅ Compatibilidade total com sistema atual

