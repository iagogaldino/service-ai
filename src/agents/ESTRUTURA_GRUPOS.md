# 📋 Estrutura de Grupos com Orquestradores

## 🎯 Visão Geral

O sistema agora suporta uma estrutura hierárquica de grupos com orquestradores:

```
Seletor Principal
  ├── Orquestrador de Grupo A
  │   ├── Code Analyzer
  │   └── Terminal Executor
  └── Orquestrador de Grupo B
      ├── Database Reader
      └── Database Writer
```

## 📊 Estrutura JSON

### Hierarquia Completa

```json
{
  "mainSelector": {
    "name": "Main Message Router",
    "description": "Seletor principal que roteia mensagens para os grupos",
    "model": "gpt-4-turbo-preview",
    "priority": -1,
    "tools": [],
    "instructions": "...",
    "shouldUse": { "type": "default" }
  },
  "groups": [
    {
      "id": "filesystem-terminal",
      "name": "Grupo A - FileSystem & Terminal",
      "description": "Especializado em operações com arquivos e terminal",
      "orchestrator": {
        "name": "FileSystem Group Orchestrator",
        "description": "Orquestra operações do grupo",
        "model": "gpt-4-turbo-preview",
        "priority": 0,
        "tools": ["fileSystem", "terminal"],
        "instructions": "...",
        "shouldUse": { "type": "keywords", "keywords": [...] }
      },
      "agents": [
        {
          "name": "Code Analyzer",
          "description": "...",
          "model": "gpt-4-turbo-preview",
          "priority": 1,
          "tools": ["fileSystem"],
          "instructions": "...",
          "shouldUse": { "type": "keywords", "keywords": [...] }
        }
      ]
    }
  ],
  "fallbackAgent": {
    "name": "General Assistant",
    "description": "...",
    "model": "gpt-4-turbo-preview",
    "priority": 999,
    "tools": [],
    "instructions": "...",
    "shouldUse": { "type": "default" }
  },
  "toolSets": {
    "fileSystem": [...],
    "terminal": [...]
  }
}
```

## 🔧 Componentes

### 1. Main Selector (Opcional)
- **Função**: Rotear mensagens para grupos apropriados
- **Prioridade**: -1 (mais alta)
- **Quando usar**: Se você quiser um seletor inteligente que analisa a mensagem e decide qual grupo deve lidar

### 2. Grupos
Cada grupo contém:
- **id**: Identificador único do grupo
- **name**: Nome descritivo
- **description**: Descrição do propósito do grupo
- **orchestrator**: Orquestrador do grupo
- **agents**: Array de agentes especializados do grupo

### 3. Orquestrador
- **Função**: Coordenar agentes dentro do grupo
- **Responsabilidades**:
  - Analisar tarefas dentro do contexto do grupo
  - Decidir qual agente(s) deve(m) executar
  - Coordenar múltiplos agentes para tarefas complexas

### 4. Agentes
- **Função**: Executar tarefas específicas
- **Pertencem a**: Um grupo específico
- **Coordenados por**: Orquestrador do grupo

### 5. Fallback Agent (Opcional)
- **Função**: Agente padrão quando nenhum grupo/orquestrador corresponde
- **Prioridade**: 999 (mais baixa)

## 📝 Exemplo de Uso

### Grupo A: FileSystem & Terminal

```json
{
  "id": "filesystem-terminal",
  "name": "Grupo A - FileSystem & Terminal",
  "orchestrator": {
    "name": "FileSystem Group Orchestrator",
    "shouldUse": {
      "type": "keywords",
      "keywords": ["arquivo", "file", "código", "terminal", "executar"]
    }
  },
  "agents": [
    {
      "name": "Code Analyzer",
      "shouldUse": {
        "type": "keywords",
        "keywords": ["arquivo", "código", "analise", "criar"]
      }
    },
    {
      "name": "Terminal Executor",
      "shouldUse": {
        "type": "keywords",
        "keywords": ["execute", "comando", "npm", "terminal"]
      }
    }
  ]
}
```

### Grupo B: Database

```json
{
  "id": "database",
  "name": "Grupo B - Database",
  "orchestrator": {
    "name": "Database Group Orchestrator",
    "shouldUse": {
      "type": "keywords",
      "keywords": ["banco de dados", "database", "sql", "query"]
    }
  },
  "agents": [
    {
      "name": "Database Reader",
      "shouldUse": {
        "type": "keywords",
        "keywords": ["select", "buscar", "ler", "consultar"]
      }
    },
    {
      "name": "Database Writer",
      "shouldUse": {
        "type": "keywords",
        "keywords": ["insert", "update", "delete", "inserir", "remover"]
      }
    }
  ]
}
```

## 🔄 Fluxo de Seleção

### Com Main Selector:
```
Mensagem → Main Selector → Orquestrador do Grupo → Agente Específico
```

### Sem Main Selector (atual):
```
Mensagem → Orquestrador do Grupo → Agente Específico
```

### Fallback:
```
Mensagem → (nenhum grupo corresponde) → Fallback Agent
```

## 🎯 Prioridades

A ordem de prioridade é:
1. **Main Selector** (priority: -1) - Se existir
2. **Orquestradores** (priority: 0) - Por grupo
3. **Agentes** (priority: 1+) - Dentro do grupo
4. **Fallback Agent** (priority: 999) - Último recurso

## 💡 Como Funciona

1. **Carregamento**: O sistema detecta automaticamente se o JSON usa estrutura hierárquica ou legacy
2. **Metadados**: Cada agente carregado recebe metadados:
   - `role`: 'mainSelector' | 'orchestrator' | 'agent' | 'fallback'
   - `groupId`: ID do grupo (se aplicável)
   - `groupName`: Nome do grupo (se aplicável)
3. **Seleção**: O sistema atual ainda seleciona agentes linearmente, mas agora pode identificar orquestradores e grupos

## 🔧 Funções Auxiliares

```typescript
import {
  getGroupsInfo,
  getMainSelector,
  getFallbackAgent,
  getGroupOrchestrator
} from './agentLoader';

// Obter informações de todos os grupos
const groups = getGroupsInfo(agents);

// Obter Main Selector
const mainSelector = getMainSelector(agents);

// Obter Fallback Agent
const fallback = getFallbackAgent(agents);

// Obter orquestrador de um grupo
const orchestrator = getGroupOrchestrator(agents, 'filesystem-terminal');
```

## ✅ Retrocompatibilidade

O sistema ainda suporta a estrutura antiga (legacy):

```json
{
  "agents": [...],
  "toolSets": {...}
}
```

Se o JSON não contiver `groups` ou `mainSelector`, será tratado como estrutura legacy.

## 🚀 Próximos Passos

Para implementar a lógica de orquestração completa, será necessário:
1. Modificar `selectAgent` para considerar grupos e orquestradores
2. Implementar delegação de orquestrador para agentes
3. Adicionar coordenação de múltiplos agentes quando necessário

