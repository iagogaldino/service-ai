# Sistema de Agentes Dinâmicos

Este documento explica como funciona o sistema de criação dinâmica de agentes via JSON.

## 📋 Visão Geral

O sistema agora permite criar e gerenciar agentes através de um arquivo JSON (`agents.json`), facilitando a adição, remoção e modificação de agentes sem precisar alterar código TypeScript.

## 🏗️ Arquitetura

### Arquivos Principais

- **`agents.json`**: Banco de dados de agentes em formato JSON
- **`agentLoader.ts`**: Carregador que converte JSON em objetos AgentConfig
- **`config.ts`**: Gerenciador de configurações e seleção de agentes
- **`agentManager.ts`**: Gerenciador de agentes OpenAI (criação/cache)

### Fluxo de Carregamento

```
agents.json → agentLoader.ts → config.ts → agentManager.ts → OpenAI API
```

## 📝 Estrutura do JSON

### Agente Individual

```json
{
  "name": "Nome do Agente",
  "description": "Descrição do agente",
  "model": "gpt-4-turbo-preview",
  "priority": 0,
  "tools": ["fileSystem", "execute_command"],
  "instructions": "Instruções detalhadas...",
  "shouldUse": {
    "type": "keywords",
    "keywords": ["palavra1", "palavra2"]
  }
}
```

### Campos do Agente

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `name` | string | Nome único do agente |
| `description` | string | Descrição do propósito |
| `model` | string | Modelo OpenAI (ex: "gpt-4-turbo-preview") |
| `priority` | number | Prioridade (menor = maior prioridade) |
| `tools` | string[] | Lista de tools ou conjuntos de tools |
| `instructions` | string | Prompt system para o agente |
| `shouldUse` | object | Regras de seleção do agente |

### Regras shouldUse

#### 1. Keywords (Palavras-chave)

```json
{
  "type": "keywords",
  "keywords": ["criar", "create", "código", "code"]
}
```

Verifica se a mensagem contém alguma das palavras-chave.

#### 2. Regex (Expressão Regular)

```json
{
  "type": "regex",
  "pattern": "(npm|node|yarn)\\s+[^\\s]"
}
```

Verifica se a mensagem corresponde ao padrão regex.

#### 3. Complex (Regras Complexas)

```json
{
  "type": "complex",
  "operator": "OR",
  "rules": [
    {
      "type": "keywords",
      "keywords": ["execute", "executar"]
    },
    {
      "type": "regex",
      "pattern": "npm\\s+\\w+"
    }
  ]
}
```

Combina múltiplas regras com operador AND ou OR.

#### 4. Default (Agente Padrão)

```json
{
  "type": "default",
  "exclude": {
    "type": "regex",
    "pattern": "(npm|node)\\s+"
  }
}
```

Usado para agentes padrão. Pode ter regras de exclusão.

### Conjuntos de Tools

O JSON suporta conjuntos pré-definidos de tools:

```json
{
  "toolSets": {
    "fileSystem": [
      "list_directory",
      "read_file",
      "find_file",
      "detect_framework",
      "write_file"
    ],
    "terminal": [
      "execute_command",
      "check_service_status",
      "start_service",
      "stop_service"
    ]
  }
}
```

No campo `tools` do agente, você pode usar:
- Nome de um conjunto: `["fileSystem"]`
- Nome de uma tool individual: `["execute_command"]`
- Combinação: `["fileSystem", "execute_command"]`

## 🚀 Como Adicionar um Novo Agente

### Passo 1: Editar `agents.json`

Adicione um novo objeto no array `agents`:

```json
{
  "name": "Translation Agent",
  "description": "Especializado em traduzir textos",
  "model": "gpt-4-turbo-preview",
  "priority": 5,
  "tools": [],
  "instructions": "Você é um tradutor profissional...",
  "shouldUse": {
    "type": "keywords",
    "keywords": ["traduz", "translate", "tradução"]
  }
}
```

### Passo 2: Reiniciar o Servidor

O servidor carregará automaticamente os novos agentes do JSON.

## 📚 Exemplos

### Exemplo 1: Agente de Tradução

```json
{
  "name": "Translation Agent",
  "description": "Especializado em traduzir textos entre idiomas",
  "model": "gpt-4-turbo-preview",
  "priority": 5,
  "tools": [],
  "instructions": "Você é um tradutor profissional. Traduza textos mantendo o contexto e o tom original. Se o usuário não especificar o idioma de destino, use português brasileiro.",
  "shouldUse": {
    "type": "keywords",
    "keywords": ["traduz", "translate", "tradução", "translation", "traduza"]
  }
}
```

### Exemplo 2: Agente de Matemática

```json
{
  "name": "Math Assistant",
  "description": "Especializado em resolver problemas matemáticos",
  "model": "gpt-4-turbo-preview",
  "priority": 5,
  "tools": [],
  "instructions": "Você é um assistente matemático especializado. Resolva problemas passo a passo, mostrando todo o raciocínio.",
  "shouldUse": {
    "type": "complex",
    "operator": "OR",
    "rules": [
      {
        "type": "keywords",
        "keywords": ["calcule", "calcular", "matemática", "math", "equação"]
      },
      {
        "type": "regex",
        "pattern": "\\d+\\s*[+\\-*/]\\s*\\d+"
      }
    ]
  }
}
```

### Exemplo 3: Agente com Tools Customizadas

```json
{
  "name": "Database Agent",
  "description": "Especializado em operações de banco de dados",
  "model": "gpt-4-turbo-preview",
  "priority": 3,
  "tools": ["fileSystem"],
  "instructions": "Você ajuda com operações de banco de dados...",
  "shouldUse": {
    "type": "keywords",
    "keywords": ["database", "banco de dados", "sql", "query"]
  }
}
```

## 🔧 Registrando Novas Tools

Se você criar uma nova tool, registre-a no sistema:

```typescript
import { registerTool, registerToolSet } from './agents/agentLoader';

// Registrar uma tool individual
registerTool('my_custom_tool', {
  type: 'function',
  function: {
    name: 'my_custom_tool',
    description: 'Descrição da tool',
    parameters: { /* ... */ }
  }
});

// Registrar um conjunto de tools
registerToolSet('myToolSet', ['my_custom_tool', 'another_tool']);
```

## 📊 Prioridades

A prioridade determina a ordem de verificação:

- **Prioridade 0**: Maior prioridade (verificado primeiro)
- **Prioridade 999**: Menor prioridade (agente padrão)

**Exemplo:**
- Code Analyzer: priority 0
- Terminal Executor: priority 1
- Outros agentes: priority 5-10
- General Assistant: priority 999

## 🔄 Hot Reload

Para recarregar agentes sem reiniciar o servidor:

```typescript
import { reloadAgentsConfig } from './agents/config';

// Recarrega os agentes do JSON
await reloadAgentsConfig();
```

## ✅ Validação

O sistema valida automaticamente:
- ✅ Estrutura do JSON
- ✅ Regras shouldUse
- ✅ Tools disponíveis
- ✅ Prioridades

## 🐛 Troubleshooting

### Erro: "Nenhum agente configurado"

**Causa**: Arquivo JSON não encontrado ou inválido

**Solução**: Verifique se `agents.json` existe e está no formato correto

### Erro: "Tool não encontrada"

**Causa**: Tool referenciada não está registrada

**Solução**: Verifique se a tool está no `TOOL_REGISTRY` ou registre-a

### Agente não está sendo selecionado

**Causa**: Regras shouldUse muito restritivas ou conflito de prioridade

**Solução**: 
1. Verifique as palavras-chave/regex
2. Ajuste a prioridade
3. Teste a regra manualmente

## 📖 Referências

- [OpenAI Assistants API](https://platform.openai.com/docs/assistants)
- [Function Calling](https://platform.openai.com/docs/guides/function-calling)

