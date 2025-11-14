# 🚀 Plano de Implementação: Deploy de Agentes

## 📋 Visão Geral

O React Flow será usado como **interface visual para criar e gerenciar agentes**, e ao clicar em **"Deploy"**, todos os agentes criados na tela serão sincronizados com o backend DelsucIA via REST API.

**Funcionalidades principais:**
1. ✅ **Carregar agentes existentes** do backend na inicialização
2. ✅ **Renderizar agentes** no React Flow como nós
3. ✅ **Criar novos agentes** visualmente no canvas
4. ✅ **Editar agentes existentes** via `AgentConfigPanel`
5. ✅ **Deploy**: Sincronizar mudanças com o backend (create/update/delete)

## 🔄 Fluxo Completo

### 1. Carregamento Inicial (Ao abrir aplicação)
```
1. Aplicação inicia
2. Busca agentes do backend: GET /api/agents/config
3. Transforma cada agente do backend em nó do React Flow
4. Renderiza nós no canvas
5. Usuário pode visualizar e editar agentes existentes
```

### 2. Criação/Edição de Agentes
```
1. Usuário arrasta nó "agent" para o canvas (novo agente)
   OU
   Usuário clica em agente existente (editar)
2. Configura cada agente no AgentConfigPanel
3. Mudanças são salvas localmente no estado do React
```

### 3. Deploy (Sincronização com Backend)
```
1. Usuário clica em "Deploy" no TopBar
2. Sistema coleta todos os nós do tipo "agent"
3. Para cada agente:
   a. Verifica se já existe no backend (por nome + grupo)
   b. Se existe → UPDATE (PUT /api/agents/groups/:groupId/agents/:agentName)
   c. Se não existe → CREATE (POST /api/agents/groups/:groupId/agents)
4. Remove agentes deletados do canvas (se necessário)
5. Backend atualiza agents.json
6. Exibe feedback de sucesso/erro
7. Opcional: Recarrega agentes do backend para sincronizar
```

## 🏗️ Estrutura de Dados

### React Flow (Frontend)
```typescript
// Tipo atual no React Flow
interface AgentConfig {
  name: string;
  instructions: string;
  includeChatHistory: boolean;
  model: string; // Ex: "gpt-4-turbo-preview"
  tools: string[]; // Ex: ["fileSystem", "terminal"]
  outputFormat: 'text' | 'json' | 'structured';
}

// Nó no React Flow
interface Node {
  id: string;
  type: 'agent';
  data: {
    label: string;
    type: 'agent';
    config?: AgentConfig;
  };
}
```

### Backend (agents.json)
```typescript
// Formato esperado pelo backend
interface AgentJsonConfig {
  name: string;
  description: string;
  instructions: string;
  model: string;
  priority: number;
  tools: string[]; // Array de strings (toolSets ou tool names)
  shouldUse: {
    type: 'keywords' | 'regex' | 'complex' | 'default';
    keywords?: string[];
    pattern?: string;
    rules?: any[];
    operator?: 'AND' | 'OR';
  };
  stackspotAgentId?: string; // Opcional
}
```

## 🎯 Mapeamento Necessário

### 1. Campos Diretos (já existem)
- ✅ `name` → `name`
- ✅ `instructions` → `instructions`
- ✅ `model` → `model`
- ✅ `tools` → `tools` (array de strings)

### 2. Campos que Precisam ser Adicionados no React

#### A. **Group ID** (obrigatório)
- Adicionar campo no `AgentConfigPanel` para selecionar o grupo
- Ou criar grupo padrão se não especificado

#### B. **Description** (obrigatório)
- Adicionar campo no `AgentConfigPanel`
- Pode ser gerado automaticamente se não fornecido

#### C. **Priority** (opcional, padrão: 999)
- Adicionar campo no `AgentConfigPanel`

#### D. **shouldUse** (obrigatório)
- Adicionar seção no `AgentConfigPanel` para configurar regras
- Opções: keywords, regex, complex, default

### 3. Campos que Serão Ignorados no Deploy
- `includeChatHistory` - não usado no backend
- `outputFormat` - não usado no backend

## 📝 Mudanças Necessárias

### 1. Atualizar `types/index.ts`
```typescript
export interface AgentConfig {
  name: string;
  description?: string; // NOVO
  instructions: string;
  includeChatHistory: boolean;
  model: string;
  tools: string[];
  outputFormat: 'text' | 'json' | 'structured';
  groupId?: string; // NOVO - grupo onde o agente será criado
  priority?: number; // NOVO
  shouldUse?: { // NOVO
    type: 'keywords' | 'regex' | 'complex' | 'default';
    keywords?: string[];
    pattern?: string;
    rules?: any[];
    operator?: 'AND' | 'OR';
  };
}
```

### 2. Atualizar `AgentConfigPanel.tsx`
Adicionar campos para:
- Description (textarea)
- Group ID (select com grupos disponíveis)
- Priority (number input)
- Should Use Rules (seção expandida)

### 3. Criar `services/apiService.ts`
```typescript
// Serviço para comunicação com backend
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Tipos do backend
export interface BackendAgent {
  name: string;
  description: string;
  instructions: string;
  model: string;
  priority: number;
  tools: string[];
  shouldUse: {
    type: 'keywords' | 'regex' | 'complex' | 'default';
    keywords?: string[];
    pattern?: string;
    rules?: any[];
    operator?: 'AND' | 'OR';
  };
  stackspotAgentId?: string;
}

export interface BackendGroup {
  id: string;
  name: string;
  description: string;
  orchestrator: BackendAgent;
  agents: BackendAgent[];
}

export interface AgentsHierarchy {
  mainSelector: BackendAgent;
  fallbackAgent: BackendAgent;
  groups: BackendGroup[];
  toolSets: Record<string, string[]>;
}

// Funções da API
export async function getAgentsConfig(): Promise<AgentsHierarchy> {
  // GET /api/agents/config - retorna estrutura hierárquica completa
  const response = await fetch(`${API_URL}/api/agents/config`);
  if (!response.ok) throw new Error('Erro ao buscar agentes');
  return response.json();
}

export async function getAllAgents(): Promise<any> {
  // GET /api/agents - retorna lista formatada de agentes
  const response = await fetch(`${API_URL}/api/agents`);
  if (!response.ok) throw new Error('Erro ao buscar agentes');
  return response.json();
}

export async function createAgent(groupId: string, agent: BackendAgent) {
  // POST /api/agents/groups/:groupId/agents
  const response = await fetch(`${API_URL}/api/agents/groups/${groupId}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(agent),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Erro ao criar agente');
  }
  return response.json();
}

export async function updateAgent(groupId: string, agentName: string, updates: Partial<BackendAgent>) {
  // PUT /api/agents/groups/:groupId/agents/:agentName
  const response = await fetch(
    `${API_URL}/api/agents/groups/${groupId}/agents/${encodeURIComponent(agentName)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }
  );
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Erro ao atualizar agente');
  }
  return response.json();
}

export async function deleteAgent(groupId: string, agentName: string) {
  // DELETE /api/agents/groups/:groupId/agents/:agentName
  const response = await fetch(
    `${API_URL}/api/agents/groups/${groupId}/agents/${encodeURIComponent(agentName)}`,
    {
      method: 'DELETE',
    }
  );
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Erro ao deletar agente');
  }
  return response.json();
}
```

### 4. Criar `utils/agentTransformer.ts`
```typescript
import { AgentConfig, CustomNodeData } from '../types';
import { BackendAgent, AgentsHierarchy } from '../services/apiService';
import { Node } from 'reactflow';

/**
 * Transforma AgentConfig do React Flow em payload do backend
 */
export function transformAgentForBackend(
  nodeAgent: AgentConfig,
  defaultGroupId: string = 'filesystem-terminal'
): BackendAgent {
  return {
    name: nodeAgent.name,
    description: nodeAgent.description || nodeAgent.name, // Fallback para name se não tiver description
    instructions: nodeAgent.instructions,
    model: nodeAgent.model,
    priority: nodeAgent.priority ?? 999,
    tools: nodeAgent.tools || [],
    shouldUse: nodeAgent.shouldUse || {
      type: 'default',
    },
  };
}

/**
 * Transforma agente do backend em nó do React Flow
 */
export function transformBackendAgentToNode(
  agent: BackendAgent,
  groupId: string,
  index: number = 0
): Node<CustomNodeData> {
  const nodeId = `agent-${groupId}-${agent.name}-${Date.now()}-${index}`;
  
  return {
    id: nodeId,
    type: 'custom',
    position: {
      x: 100 + (index % 3) * 250, // Distribui horizontalmente
      y: 100 + Math.floor(index / 3) * 150, // Distribui verticalmente
    },
    data: {
      label: agent.name,
      type: 'agent',
      config: {
        name: agent.name,
        description: agent.description,
        instructions: agent.instructions,
        includeChatHistory: true, // Default
        model: agent.model,
        tools: agent.tools,
        outputFormat: 'text', // Default
        groupId: groupId,
        priority: agent.priority,
        shouldUse: agent.shouldUse,
      },
    },
  };
}

/**
 * Carrega todos os agentes do backend e transforma em nós do React Flow
 */
export async function loadAgentsFromBackend(
  getAgentsConfig: () => Promise<AgentsHierarchy>
): Promise<Node<CustomNodeData>[]> {
  const hierarchy = await getAgentsConfig();
  const nodes: Node<CustomNodeData>[] = [];
  let index = 0;

  // Carrega agentes de cada grupo
  for (const group of hierarchy.groups) {
    // Adiciona orquestrador como nó (opcional)
    // nodes.push(transformBackendAgentToNode(group.orchestrator, group.id, index++));

    // Adiciona agentes do grupo
    for (const agent of group.agents) {
      nodes.push(transformBackendAgentToNode(agent, group.id, index++));
    }
  }

  return nodes;
}

/**
 * Verifica se um agente já existe no backend (por nome e grupo)
 */
export function findExistingAgent(
  agentName: string,
  groupId: string,
  hierarchy: AgentsHierarchy
): BackendAgent | null {
  const group = hierarchy.groups.find(g => g.id === groupId);
  if (!group) return null;
  
  return group.agents.find(a => a.name === agentName) || null;
}
```

### 5. Implementar Carregamento de Agentes no `App.tsx`
```typescript
import { useEffect, useState } from 'react';
import { loadAgentsFromBackend } from './utils/agentTransformer';
import { getAgentsConfig } from './services/apiService';

const App = () => {
  const [allNodes, setAllNodes] = useState<Node<CustomNodeData>[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);

  // Carregar agentes do backend na inicialização
  useEffect(() => {
    const loadAgents = async () => {
      try {
        setIsLoadingAgents(true);
        const backendNodes = await loadAgentsFromBackend(getAgentsConfig);
        
        // Adiciona nó "start" se não existir
        const startNode = allNodes.find(n => n.id === 'start');
        if (startNode) {
          setAllNodes([startNode, ...backendNodes]);
        } else {
          setAllNodes([
            {
              id: 'start',
              type: 'custom',
              position: { x: 100, y: 300 },
              data: { label: 'Start', type: 'start' },
            },
            ...backendNodes,
          ]);
        }
      } catch (error) {
        console.error('Erro ao carregar agentes:', error);
        // Fallback: mantém nós atuais ou cria nó start
      } finally {
        setIsLoadingAgents(false);
      }
    };

    loadAgents();
  }, []); // Executa apenas uma vez na inicialização

  // ... resto do componente
};
```

### 6. Implementar Deploy no `App.tsx`
```typescript
import { transformAgentForBackend, findExistingAgent } from './utils/agentTransformer';
import { getAgentsConfig, createAgent, updateAgent, deleteAgent } from './services/apiService';

const handleDeploy = async () => {
  try {
    setIsDeploying(true);
    
    // 1. Coletar todos os nós do tipo "agent"
    const agentNodes = allNodes.filter(node => node.data.type === 'agent');
    
    // 2. Buscar estrutura atual do backend
    const hierarchy = await getAgentsConfig();
    
    // 3. Validar que todos têm configuração completa
    const invalidAgents = agentNodes.filter(node => {
      const config = node.data.config;
      return !config || !config.name || !config.instructions || !config.groupId;
    });
    
    if (invalidAgents.length > 0) {
      throw new Error(`Agentes inválidos: ${invalidAgents.map(n => n.data.label).join(', ')}`);
    }
    
    // 4. Para cada agente: criar ou atualizar
    const results = [];
    for (const node of agentNodes) {
      const config = node.data.config!;
      const groupId = config.groupId || 'filesystem-terminal';
      const backendAgent = transformAgentForBackend(config, groupId);
      
      // Verifica se agente já existe
      const existing = findExistingAgent(backendAgent.name, groupId, hierarchy);
      
      if (existing) {
        // UPDATE
        const updated = await updateAgent(groupId, backendAgent.name, backendAgent);
        results.push({ type: 'updated', agent: backendAgent.name, data: updated });
      } else {
        // CREATE
        const created = await createAgent(groupId, backendAgent);
        results.push({ type: 'created', agent: backendAgent.name, data: created });
      }
    }
    
    // 5. Mostrar feedback
    const createdCount = results.filter(r => r.type === 'created').length;
    const updatedCount = results.filter(r => r.type === 'updated').length;
    
    alert(`Deploy concluído! ${createdCount} criados, ${updatedCount} atualizados.`);
    
    // Opcional: Recarregar agentes do backend para sincronizar
    // await loadAgentsFromBackend(getAgentsConfig);
    
  } catch (error) {
    console.error('Erro no deploy:', error);
    alert(`Erro no deploy: ${error.message}`);
  } finally {
    setIsDeploying(false);
  }
};
```

## ✅ Checklist de Implementação

### Fase 1: Preparação dos Dados
- [ ] Adicionar campos faltantes no `AgentConfig` (description, groupId, priority, shouldUse)
- [ ] Atualizar `AgentConfigPanel` com novos campos
- [ ] Criar função para buscar grupos disponíveis da API
- [ ] Adicionar tipos TypeScript para backend (`BackendAgent`, `BackendGroup`, `AgentsHierarchy`)

### Fase 2: Serviço de API
- [ ] Criar `services/apiService.ts` com funções CRUD
- [ ] Implementar `getAgentsConfig()` para carregar estrutura completa
- [ ] Implementar `getAllAgents()` para lista formatada
- [ ] Implementar `createAgent()`, `updateAgent()`, `deleteAgent()`
- [ ] Implementar tratamento de erros
- [ ] Adicionar loading states

### Fase 3: Transformação de Dados
- [ ] Criar `utils/agentTransformer.ts`
- [ ] Implementar `transformAgentForBackend()` - React Flow → Backend
- [ ] Implementar `transformBackendAgentToNode()` - Backend → React Flow
- [ ] Implementar `loadAgentsFromBackend()` - Carregar todos os agentes
- [ ] Implementar `findExistingAgent()` - Verificar se agente existe
- [ ] Aplicar valores padrão quando necessário

### Fase 4: Carregamento Inicial
- [ ] Implementar carregamento de agentes no `App.tsx` (useEffect)
- [ ] Renderizar agentes carregados no React Flow
- [ ] Adicionar loading state durante carregamento
- [ ] Tratar erros de carregamento (fallback)
- [ ] Preservar nó "start" ao carregar agentes

### Fase 5: Deploy
- [ ] Implementar função `handleDeploy` no App
- [ ] Conectar botão "Deploy" no TopBar
- [ ] Validar configurações antes do deploy
- [ ] Detectar agentes existentes (create vs update)
- [ ] Enviar requisições para API (create/update)
- [ ] Implementar feedback visual (loading, sucesso, erros)
- [ ] Opcional: Recarregar agentes após deploy

### Fase 6: Melhorias
- [ ] Permitir deletar agentes (tanto no canvas quanto no backend)
- [ ] Permitir criar grupos novos (se necessário)
- [ ] Salvar estado do canvas no localStorage
- [ ] Botão "Reload" para recarregar agentes do backend
- [ ] Exibir status de cada agente (deployed, pending, error)
- [ ] Sincronização bidirecional (backend ↔ React Flow)

## 🔍 Validações Necessárias

Antes do deploy, validar:
1. ✅ Todos os agentes têm `name`
2. ✅ Todos os agentes têm `description`
3. ✅ Todos os agentes têm `instructions`
4. ✅ Todos os agentes têm `model`
5. ✅ Todos os agentes têm `groupId` ou usar padrão
6. ✅ Todos os agentes têm `shouldUse` configurado ou usar padrão
7. ✅ Verificar se grupo existe no backend

## 📊 Estrutura de Grupos (Exemplo)

Baseado no `agents.json`, os grupos disponíveis são:
- `filesystem-terminal` - Grupo A - FileSystem & Terminal
- `database` - Grupo B - Database (se existir)

## 🎨 UI/UX do Deploy

1. **Botão Deploy**: Já existe no TopBar (linha 213)
2. **Loading State**: Mostrar spinner durante deploy
3. **Resultado**:
   - ✅ Sucesso: "X agentes deployados com sucesso!"
   - ❌ Erro: Mostrar erros por agente
   - ⚠️ Warning: Avisos (ex: agente já existe, será atualizado)

## 🔄 Fluxo Alternativo: Update vs Create

- Se agente com mesmo nome já existe no grupo → **UPDATE** (PUT)
- Se agente não existe → **CREATE** (POST)

Para detectar, primeiro buscar agentes do grupo e comparar nomes.

## 🔄 Sincronização Bidirecional

### Backend → React Flow (Carregamento)
1. Ao abrir aplicação: `GET /api/agents/config`
2. Transforma cada agente em nó do React Flow
3. Renderiza nós no canvas
4. Agentes podem ser editados visualmente

### React Flow → Backend (Deploy)
1. Usuário clica em "Deploy"
2. Coleta todos os nós "agent" do canvas
3. Para cada agente:
   - Verifica se existe no backend (nome + grupo)
   - Se existe → `PUT /api/agents/groups/:groupId/agents/:agentName`
   - Se não existe → `POST /api/agents/groups/:groupId/agents`
4. Backend atualiza `agents.json`
5. Feedback visual de sucesso/erro

### Detecção de Mudanças
- **Agente novo**: Nó no canvas sem correspondente no backend → CREATE
- **Agente existente**: Nó no canvas com mesmo nome e grupo no backend → UPDATE
- **Agente deletado**: Agente no backend sem nó correspondente no canvas → DELETE (opcional)

## 📦 Estrutura de Arquivos

```
react-interface/
├── src/
│   ├── services/
│   │   └── apiService.ts          # Comunicação com backend
│   ├── utils/
│   │   └── agentTransformer.ts    # Transformação de dados
│   ├── types/
│   │   └── index.ts               # Tipos TypeScript (atualizado)
│   ├── components/
│   │   ├── AgentConfigPanel.tsx   # Painel de configuração (atualizado)
│   │   ├── TopBar.tsx             # Barra superior (atualizado)
│   │   └── FlowCanvas.tsx         # Canvas do React Flow
│   └── App.tsx                    # Componente principal (atualizado)
```

