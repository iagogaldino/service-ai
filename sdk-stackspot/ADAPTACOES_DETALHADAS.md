# 🔧 Adaptações Detalhadas para SDK StackSpot

## Objetivo: Alcançar compatibilidade total com OpenAI SDK

---

## 1. 🎯 Sistema de Cache Persistente de Assistants

### Problema
StackSpot não tem API para listar agentes, então `list()` retorna vazio e `retrieve()` não tem dados.

### Solução
Integrar com `agents.json` para popular cache de agentes.

### Implementação

**Arquivo**: `sdk-stackspot/src/resources/assistants.ts`

```typescript
import fs from 'fs/promises';
import path from 'path';

export class Assistants {
  private agentCache: Map<string, AssistantConfig> = new Map();
  private cacheLoaded = false;

  constructor(private client: StackSpotClient) {
    this.loadAgentsFromConfig().catch(err => {
      console.warn('Erro ao carregar agentes do config:', err);
    });
  }

  /**
   * Carrega agentes do agents.json
   */
  private async loadAgentsFromConfig(): Promise<void> {
    try {
      // Tenta encontrar agents.json no projeto
      const possiblePaths = [
        path.join(process.cwd(), 'src/agents/agents.json'),
        path.join(process.cwd(), 'agents.json'),
        path.join(__dirname, '../../src/agents/agents.json'),
      ];

      let agentsData: any = null;
      for (const configPath of possiblePaths) {
        try {
          const content = await fs.readFile(configPath, 'utf-8');
          agentsData = JSON.parse(content);
          break;
        } catch {
          continue;
        }
      }

      if (!agentsData) {
        console.warn('agents.json não encontrado, cache de agentes vazio');
        return;
      }

      // Processa agentes do JSON
      const agents: AssistantConfig[] = [];

      // Adiciona mainSelector se existir
      if (agentsData.mainSelector) {
        agents.push({
          id: agentsData.mainSelector.stackspotAgentId || `asst_${agentsData.mainSelector.name}`,
          name: agentsData.mainSelector.name,
          instructions: agentsData.mainSelector.instructions,
          model: agentsData.mainSelector.model,
          tools: agentsData.mainSelector.tools || [],
        });
      }

      // Adiciona grupos e seus agentes
      if (agentsData.groups) {
        for (const group of agentsData.groups) {
          // Orquestrador
          if (group.orchestrator) {
            agents.push({
              id: group.orchestrator.stackspotAgentId || `asst_${group.orchestrator.name}`,
              name: group.orchestrator.name,
              instructions: group.orchestrator.instructions,
              model: group.orchestrator.model,
              tools: group.orchestrator.tools || [],
            });
          }

          // Agentes do grupo
          if (group.agents) {
            for (const agent of group.agents) {
              agents.push({
                id: agent.stackspotAgentId || `asst_${agent.name}`,
                name: agent.name,
                instructions: agent.instructions,
                model: agent.model,
                tools: agent.tools || [],
              });
            }
          }
        }
      }

      // Adiciona fallback se existir
      if (agentsData.fallbackAgent) {
        agents.push({
          id: agentsData.fallbackAgent.stackspotAgentId || `asst_${agentsData.fallbackAgent.name}`,
          name: agentsData.fallbackAgent.name,
          instructions: agentsData.fallbackAgent.instructions,
          model: agentsData.fallbackAgent.model,
          tools: agentsData.fallbackAgent.tools || [],
        });
      }

      // Popula cache
      for (const agent of agents) {
        if (agent.id) {
          this.agentCache.set(agent.id, agent);
          // Também indexa por nome para busca
          if (agent.name) {
            this.agentCache.set(agent.name, agent);
          }
        }
      }

      this.cacheLoaded = true;
      console.log(`✅ ${agents.length} agente(s) carregado(s) do agents.json`);
    } catch (error: any) {
      console.error('Erro ao carregar agentes:', error.message);
    }
  }

  /**
   * Lista agentes do cache
   */
  async list(params?: { limit?: number; after?: string; before?: string }): Promise<PaginatedList<AssistantConfig>> {
    if (!this.cacheLoaded) {
      await this.loadAgentsFromConfig();
    }

    let agents = Array.from(this.agentCache.values())
      .filter(agent => agent.id && !agent.id.startsWith('asst_') || agent.id?.includes('01K')); // Filtra apenas IDs válidos do StackSpot

    // Remove duplicatas (agentes indexados por nome e ID)
    const uniqueAgents = new Map<string, AssistantConfig>();
    for (const agent of agents) {
      if (agent.id) {
        uniqueAgents.set(agent.id, agent);
      }
    }
    agents = Array.from(uniqueAgents.values());

    // Aplica paginação
    const limit = params?.limit || 20;
    const limitedAgents = agents.slice(0, limit);

    return {
      object: 'list',
      data: limitedAgents,
      has_more: agents.length > limit,
      first_id: limitedAgents[0]?.id,
      last_id: limitedAgents[limitedAgents.length - 1]?.id,
    };
  }

  /**
   * Obtém agente do cache
   */
  async retrieve(assistantId: string): Promise<AssistantConfig> {
    if (!this.cacheLoaded) {
      await this.loadAgentsFromConfig();
    }

    const agent = this.agentCache.get(assistantId);
    if (agent) {
      return agent;
    }

    // Se não encontrou, retorna básico (compatibilidade)
    return {
      id: assistantId,
    };
  }
}
```

**Benefícios**:
- ✅ `list()` retorna agentes reais em vez de vazio
- ✅ `retrieve()` retorna dados completos do agente
- ✅ Integração automática com `agents.json`
- ✅ Compatibilidade 100% com interface OpenAI

---

## 2. 💾 Persistência de Threads e Messages

### Problema
Dados perdidos ao reiniciar servidor (armazenamento em memória).

### Solução
Adicionar storage adapter com persistência em arquivo JSON.

### Implementação

**Arquivo**: `sdk-stackspot/src/storage/FileStorage.ts`

```typescript
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { Thread, Message, Run } from '../types';

export interface StorageAdapter {
  saveThread(thread: Thread): Promise<void>;
  loadThread(threadId: string): Promise<Thread | null>;
  listThreads(): Promise<Thread[]>;
  deleteThread(threadId: string): Promise<void>;
  
  saveMessage(threadId: string, message: Message): Promise<void>;
  loadMessages(threadId: string): Promise<Message[]>;
  
  saveRun(threadId: string, run: Run): Promise<void>;
  loadRun(threadId: string, runId: string): Promise<Run | null>;
  listRuns(threadId: string): Promise<Run[]>;
}

export class FileStorage implements StorageAdapter {
  private storagePath: string;
  private data: {
    threads: Record<string, Thread>;
    messages: Record<string, Message[]>;
    runs: Record<string, Record<string, Run>>;
  } = {
    threads: {},
    messages: {},
    runs: {},
  };

  constructor(storagePath: string = './stackspot-storage.json') {
    this.storagePath = path.resolve(storagePath);
    this.loadData().catch(err => {
      console.warn('Erro ao carregar dados:', err);
    });
  }

  private async loadData(): Promise<void> {
    try {
      if (existsSync(this.storagePath)) {
        const content = await fs.readFile(this.storagePath, 'utf-8');
        this.data = JSON.parse(content);
      }
    } catch (error: any) {
      console.warn('Erro ao carregar storage:', error.message);
    }
  }

  private async saveData(): Promise<void> {
    try {
      await fs.writeFile(this.storagePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error: any) {
      console.error('Erro ao salvar storage:', error.message);
    }
  }

  async saveThread(thread: Thread): Promise<void> {
    this.data.threads[thread.id] = thread;
    await this.saveData();
  }

  async loadThread(threadId: string): Promise<Thread | null> {
    await this.loadData();
    return this.data.threads[threadId] || null;
  }

  async listThreads(): Promise<Thread[]> {
    await this.loadData();
    return Object.values(this.data.threads);
  }

  async deleteThread(threadId: string): Promise<void> {
    delete this.data.threads[threadId];
    delete this.data.messages[threadId];
    delete this.data.runs[threadId];
    await this.saveData();
  }

  async saveMessage(threadId: string, message: Message): Promise<void> {
    if (!this.data.messages[threadId]) {
      this.data.messages[threadId] = [];
    }
    this.data.messages[threadId].push(message);
    await this.saveData();
  }

  async loadMessages(threadId: string): Promise<Message[]> {
    await this.loadData();
    return this.data.messages[threadId] || [];
  }

  async saveRun(threadId: string, run: Run): Promise<void> {
    if (!this.data.runs[threadId]) {
      this.data.runs[threadId] = {};
    }
    this.data.runs[threadId][run.id] = run;
    await this.saveData();
  }

  async loadRun(threadId: string, runId: string): Promise<Run | null> {
    await this.loadData();
    return this.data.runs[threadId]?.[runId] || null;
  }

  async listRuns(threadId: string): Promise<Run[]> {
    await this.loadData();
    return Object.values(this.data.runs[threadId] || {});
  }
}
```

**Modificar Threads para usar storage**:

```typescript
export class Threads {
  private storage: StorageAdapter;
  
  constructor(private client: StackSpotClient, storage?: StorageAdapter) {
    this.storage = storage || new FileStorage();
    // Carrega threads do storage ao iniciar
    this.loadFromStorage();
  }

  private async loadFromStorage(): Promise<void> {
    const threads = await this.storage.listThreads();
    for (const thread of threads) {
      this.threads.set(thread.id, thread);
      const messages = await this.storage.loadMessages(thread.id);
      this.threadMessages.set(thread.id, messages);
    }
  }

  async create(params?: CreateThreadParams): Promise<Thread> {
    const thread = /* ... criação atual ... */;
    await this.storage.saveThread(thread);
    return thread;
  }
}
```

**Benefícios**:
- ✅ Dados persistem entre reinicializações
- ✅ Compatível com armazenamento em memória (fallback)
- ✅ Fácil migrar para banco de dados depois

---

## 3. 🔄 Normalização de Tokens

### Problema
Formato de tokens diferente entre StackSpot e OpenAI.

### Solução
Normalizar sempre para formato OpenAI.

### Implementação

**Arquivo**: `sdk-stackspot/src/utils/tokenNormalizer.ts`

```typescript
import { TokenUsage } from '../types';
import { ChatResponse } from '../types';

export function normalizeTokens(stackspotResponse: ChatResponse): TokenUsage {
  const tokens = stackspotResponse.tokens || {};
  
  return {
    prompt_tokens: tokens.input || tokens.user || 0,
    completion_tokens: tokens.output || 0,
    total_tokens: (tokens.input || tokens.user || 0) + (tokens.output || 0),
  };
}

// Adicionar ao Run após receber resposta
const normalizedTokens = normalizeTokens(response);
run.usage = normalizedTokens; // Adicionar campo usage ao Run
```

**Modificar interface Run**:

```typescript
export interface Run {
  // ... campos existentes ...
  usage?: TokenUsage; // Adicionar campo usage
}
```

---

## 4. 📄 Paginação Completa

### Problema
Paginação básica, falta `after`/`before`.

### Solução
Implementar cursor-based pagination.

### Implementação

```typescript
async list(
  threadId: string,
  params?: { limit?: number; order?: 'asc' | 'desc'; after?: string; before?: string }
): Promise<PaginatedList<Message>> {
  let messages = this.threads.getThreadMessages(threadId);

  // Ordena
  const order = params?.order || 'desc';
  messages = [...messages].sort((a, b) => 
    order === 'asc' ? a.created_at - b.created_at : b.created_at - a.created_at
  );

  // Aplica cursor (after/before)
  let startIndex = 0;
  if (params?.after) {
    const afterIndex = messages.findIndex(m => m.id === params.after);
    if (afterIndex >= 0) startIndex = afterIndex + 1;
  }
  if (params?.before) {
    const beforeIndex = messages.findIndex(m => m.id === params.before);
    if (beforeIndex >= 0) messages = messages.slice(0, beforeIndex);
  }

  // Aplica limite
  const limit = params?.limit || 20;
  const limitedMessages = messages.slice(startIndex, startIndex + limit);

  return {
    object: 'list',
    data: limitedMessages,
    has_more: startIndex + limit < messages.length,
    first_id: limitedMessages[0]?.id,
    last_id: limitedMessages[limitedMessages.length - 1]?.id,
  };
}
```

---

## 5. 🎬 Streaming Real

### Problema
Streaming não totalmente implementado.

### Solução
Processar SSE do StackSpot.

### Implementação

```typescript
async create(threadId: string, params: CreateRunParams): Promise<Run> {
  // ... código existente ...

  if (params.stream) {
    const streamResponse = await this.client.postStream(
      `/v1/agent/${params.assistant_id}/chat`,
      chatParams
    );

    // Processa stream
    const reader = streamResponse.body?.getReader();
    if (reader) {
      // Processa chunks do stream
      // Emite eventos conforme recebe dados
    }
  }
}
```

---

## 📊 Resumo das Adaptações

| Adaptação | Prioridade | Complexidade | Impacto |
|-----------|------------|--------------|---------|
| Cache de Assistants | 🔴 Alta | Baixa | Alto |
| Persistência Threads/Messages | 🔴 Alta | Média | Crítico |
| Normalização Tokens | 🔴 Alta | Baixa | Médio |
| Paginação Completa | 🟡 Média | Baixa | Baixo |
| Streaming Real | 🟡 Média | Alta | Médio |

---

## 🚀 Ordem de Implementação Recomendada

1. **Cache de Assistants** (1-2 horas) - Mais rápido, alto impacto
2. **Normalização de Tokens** (30 min) - Rápido, melhora compatibilidade
3. **Persistência** (2-3 horas) - Crítico para produção
4. **Paginação** (1 hora) - Melhora API
5. **Streaming** (3-4 horas) - Funcionalidade avançada

---

**Total estimado**: 7-10 horas de desenvolvimento

**Resultado esperado**: Compatibilidade de 85% → 98% com OpenAI SDK

