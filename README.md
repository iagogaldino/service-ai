# DelsucIA

Projeto Node.js com TypeScript que integra Socket.IO com a **Assistants API da OpenAI** para comunicação em tempo real com agentes inteligentes.

## 🚀 Tecnologias

- **Node.js** - Runtime JavaScript
- **TypeScript** - Superset do JavaScript com tipagem estática
- **Socket.IO** - Biblioteca para comunicação WebSocket em tempo real
- **OpenAI Assistants API** - SDK de Agentes da OpenAI com threads persistentes
- **Express** - Framework web para Node.js

## 📋 Pré-requisitos

- Node.js (versão 16 ou superior)
- npm ou yarn

## 🛠️ Instalação

1. Clone o repositório ou navegue até a pasta do projeto

2. Instale as dependências:
```bash
npm install
```

3. Configure a API key:
   - Inicie o servidor: `npm run dev`
   - Acesse `http://localhost:3000` no navegador
   - Clique no botão "⚙️ Config" e configure sua API key da OpenAI
   - A configuração será salva automaticamente em `config.json`

## 🎯 Como usar

### Modo Desenvolvimento
```bash
npm run dev
```

### Modo Produção
```bash
npm run build
npm start
```

O servidor estará rodando em `http://localhost:3000`

## 📡 Como funciona

1. O cliente se conecta ao servidor via Socket.IO
2. Uma **thread** é criada automaticamente para cada conexão (mantém contexto da conversa)
3. O cliente envia mensagens através do socket (ex: "Hello")
4. O servidor adiciona a mensagem à thread e cria um **run** para processar
5. O **assistente** (agente) processa a mensagem usando a Assistants API
6. A resposta da IA é enviada de volta ao cliente através do mesmo canal socket
7. O contexto da conversa é mantido na thread para cada conexão

### ✨ Recursos da Assistants API

- **Threads Persistentes**: Cada conexão tem sua própria thread que mantém o histórico da conversa
- **Agentes Inteligentes**: Usa GPT-4 Turbo para respostas mais inteligentes
- **Contexto Mantido**: O assistente lembra do contexto da conversa anterior
- **Gerenciamento Automático**: O assistente é criado automaticamente na primeira execução
- **Navegação de Arquivos**: O agente pode navegar, ler e analisar arquivos do projeto

### 🗂️ Funcionalidades de Navegação de Arquivos

O agente possui três ferramentas principais para trabalhar com arquivos:

1. **`list_directory`** - Lista arquivos e diretórios em um caminho específico
   - Exemplo: "Liste os arquivos na pasta src"
   
2. **`read_file`** - Lê o conteúdo completo de um arquivo
   - Exemplo: "Leia o arquivo src/server.ts"
   
3. **`find_file`** - Procura arquivos por nome no projeto
   - Exemplo: "Encontre arquivos chamados main.ts"

**Exemplo de uso:**
- "Me explique o que tem no código de main.ts"
- "Qual é a estrutura do projeto?"
- "Analise o arquivo server.ts e me diga o que ele faz"

## 🤖 Sistema de Agentes

O DelsucIA utiliza um sistema hierárquico de agentes organizados em grupos com orquestradores.

### 📊 Estrutura Hierárquica

```
Seletor Principal (Main Selector)
  ├── Orquestrador de Grupo A (FileSystem & Terminal)
  │   ├── Code Analyzer
  │   └── Terminal Executor
  └── Orquestrador de Grupo B (Database)
      ├── Database Reader
      └── Database Writer
```

### 🎯 Componentes do Sistema

#### 1. Main Selector
- **Função**: Rotear mensagens para grupos apropriados
- **Prioridade**: -1 (mais alta)
- **Quando usar**: Seletor inteligente que analisa a mensagem e decide qual grupo deve lidar

#### 2. Grupos
Cada grupo contém:
- **id**: Identificador único do grupo
- **name**: Nome descritivo
- **description**: Descrição do propósito do grupo
- **orchestrator**: Orquestrador do grupo
- **agents**: Array de agentes especializados do grupo

#### 3. Orquestrador
- **Função**: Coordenar agentes dentro do grupo
- **Responsabilidades**:
  - Analisar tarefas dentro do contexto do grupo
  - Decidir qual agente(s) deve(m) executar
  - Coordenar múltiplos agentes para tarefas complexas

#### 4. Agentes Especializados
- **Função**: Executar tarefas específicas
- **Pertencem a**: Um grupo específico
- **Coordenados por**: Orquestrador do grupo

#### 5. Fallback Agent
- **Função**: Agente padrão quando nenhum grupo/orquestrador corresponde
- **Prioridade**: 999 (mais baixa)

### 📝 Configuração via JSON

Os agentes são configurados através do arquivo `src/agents/agents.json`. O sistema suporta estrutura hierárquica ou legacy.

#### Estrutura Hierárquica

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

### 🔄 Regras de Seleção (shouldUse)

O sistema suporta diferentes tipos de regras para determinar quando um agente deve ser usado:

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

### 🚀 Como Adicionar um Novo Agente

#### Passo 1: Editar `agents.json`

Adicione um novo objeto no array `agents` do grupo apropriado ou crie um novo grupo:

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

#### Passo 2: Reiniciar o Servidor

O servidor carregará automaticamente os novos agentes do JSON.

### 🔧 Conjuntos de Tools (ToolSets)

O JSON suporta conjuntos pré-definidos de tools:

```json
{
  "toolSets": {
    "fileSystem": [
      "list_directory",
      "read_file",
      "find_file",
      "write_file"
    ],
    "terminal": [
      "execute_command",
      "check_service_status"
    ]
  }
}
```

No campo `tools` do agente, você pode usar:
- Nome de um conjunto: `["fileSystem"]`
- Nome de uma tool individual: `["execute_command"]`
- Combinação: `["fileSystem", "execute_command"]`

### 📊 Prioridades

A prioridade determina a ordem de verificação:
- **Prioridade -1**: Main Selector (verificado primeiro)
- **Prioridade 0**: Orquestradores
- **Prioridade 1+**: Agentes especializados
- **Prioridade 999**: Fallback Agent (último recurso)

## 💰 Tracking de Tokens

O sistema rastreia automaticamente o uso de tokens durante interações com os agentes e retorna essa informação junto com a resposta final para o frontend.

### 📊 Estrutura de Dados

```typescript
interface TokenUsage {
  promptTokens: number;      // Tokens usados no prompt/entrada
  completionTokens: number;  // Tokens usados na resposta/saída
  totalTokens: number;        // Total de tokens (prompt + completion)
}
```

### 🎯 Eventos do Servidor

O sistema emite três tipos de eventos relacionados a tokens:

#### 1. Evento `token_usage` (em tempo real)
Emitido sempre que tokens são utilizados em um run:

```javascript
socket.on('token_usage', (data) => {
  // data.tokens - Tokens desta mensagem/run específica
  // data.accumulated - Total acumulado na thread
  console.log('Tokens desta mensagem:', data.tokens.totalTokens);
  console.log('Total acumulado:', data.accumulated.totalTokens);
});
```

#### 2. Evento `agent_message` (com tokens acumulados)
Cada mensagem do agente inclui tokens acumulados:

```javascript
socket.on('agent_message', (data) => {
  if (data.tokenUsage) {
    console.log('Mensagem:', data.message);
    console.log('Tokens acumulados:', data.tokenUsage.totalTokens);
  }
});
```

#### 3. Evento `response` (resposta final)
Inclui tokens da mensagem atual e total acumulado:

```javascript
socket.on('response', (data) => {
  // data.tokenUsage - Tokens desta mensagem específica
  // data.accumulatedTokenUsage - Total acumulado de todas as mensagens
  console.log('Tokens desta mensagem:', data.tokenUsage.totalTokens);
  console.log('Total acumulado na thread:', data.accumulatedTokenUsage.totalTokens);
});
```

### 💵 Cálculo de Custo

O sistema calcula automaticamente o custo em dólares baseado nos preços do modelo OpenAI:

- **GPT-4 Turbo**: $0.01 / 1K tokens (prompt) + $0.03 / 1K tokens (completion)
- **GPT-4**: $0.03 / 1K tokens (prompt) + $0.06 / 1K tokens (completion)
- **GPT-3.5 Turbo**: $0.0015 / 1K tokens (prompt) + $0.002 / 1K tokens (completion)

Os custos são salvos automaticamente em `tokens.json` e podem ser visualizados no frontend através do botão "💰 Tokens".

### 📈 Persistência

O uso de tokens é salvo automaticamente em `tokens.json` com:
- Total de tokens e custos por thread
- Histórico de interações
- Estatísticas por agente
- Custo total acumulado

## 📝 Sistema de Logs

O sistema registra todas as atividades da aplicação em `logs.json` para total controle e monitoramento.

### 📊 Tipos de Logs

- **connection**: Conexões de clientes
- **disconnection**: Desconexões de clientes
- **agent_selection**: Seleção de agentes
- **message_sent**: Mensagens enviadas
- **run_status**: Status de runs do OpenAI
- **tool_execution**: Execução de tools
- **tool_result**: Resultados de tools
- **response**: Respostas finais
- **token_usage**: Uso de tokens
- **error**: Erros e exceções

### 📈 Estatísticas

O sistema mantém estatísticas automáticas:
- Total de conexões
- Total de mensagens processadas
- Total de tokens utilizados
- Custo total acumulado
- Erros ocorridos

### 🔍 Visualização

Os logs podem ser visualizados no frontend através do botão "📝 Logs", que exibe:
- Estatísticas gerais
- Histórico detalhado de eventos
- Filtros por tipo de log
- Informações de tokens e custos

## 🌐 Cliente Web

Acesse `http://localhost:3000` no seu navegador para usar a interface web que permite:

- **Chat**: Conectar ao servidor via Socket.IO e enviar mensagens
- **Agentes**: Visualizar todos os agentes configurados e suas ferramentas
- **Tokens**: Visualizar histórico de uso de tokens e custos
- **Logs**: Visualizar logs da aplicação em tempo real
- **Configuração**: Configurar API key e porta do servidor

### Funcionalidades do Frontend

- Conectar ao servidor via Socket.IO
- Enviar mensagens para a IA
- Receber respostas em tempo real
- Ver o status da conexão
- Visualizar tokens utilizados em tempo real
- Visualizar histórico de tokens e custos
- Visualizar logs da aplicação
- Configurar API key e porta via interface

## 📝 Exemplo de uso

### Cliente HTML (já incluído)
O projeto inclui um cliente HTML que se conecta automaticamente ao servidor.

### Exemplo programático
```javascript
const io = require('socket.io-client');
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Conectado!');
  
  socket.emit('message', { message: 'Hello' });
});

socket.on('response', (data) => {
  console.log('Resposta:', data.message);
  console.log('Tokens:', data.tokenUsage.totalTokens);
  console.log('Custo:', data.cost);
});
```

## 🔌 Integração a partir de outras aplicações

Outros serviços podem consumir o DelsucIA como um **provider de agentes** de forma headless. Abaixo estão os passos recomendados para construir uma integração server-to-server.

### 1. Habilite e configure o serviço
- Execute `npm run dev` (ou `npm start` em produção).
- Configure o provider ativo via `POST /api/config` (OpenAI ou StackSpot) ou pela interface web.
- Garanta que a aplicação cliente tenha acesso de rede ao host/porta do DelsucIA.

### 2. Conecte-se via Socket.IO
Use o protocolo WebSocket para trocar mensagens com os agentes. O exemplo abaixo mostra um backend Node/TypeScript se conectando ao serviço:

```typescript
import { io, Socket } from 'socket.io-client';

const socket: Socket = io('http://delsucia.internal:3000', {
  transports: ['websocket'],
  reconnectionAttempts: 3,
});

socket.on('connect', () => {
  console.log('[delsucia] conectado', socket.id);

  // opcional: restaura uma thread existente salva na sua aplicação
  const savedThreadId = loadThreadIdForUser('user-123');
  if (savedThreadId) {
    socket.emit('restore_thread', { threadId: savedThreadId });
  }

  // envia a primeira mensagem
  socket.emit('message', { message: 'Precisamos gerar um relatório mensal.' });
});

socket.on('thread_created', ({ threadId }) => {
  console.log('[delsucia] nova thread', threadId);
  persistThreadIdForUser('user-123', threadId);
});

socket.on('agent_selected', (data) => {
  console.log('[delsucia] agente escolhido', data.agentName, data.llmProvider);
});

socket.on('agent_message', (data) => {
  // Inclui mensagens do usuário encaminhadas, respostas intermediárias,
  // chamadas de função e resultados das tools
  console.log('[delsucia] evento agent_message', data.type, data.message);
});

socket.on('agent_action', (data) => {
  console.log('[delsucia] ação em andamento', data.action);
});

socket.on('agent_action_complete', (data) => {
  console.log('[delsucia] ação finalizada', data.action, data.success);
});

socket.on('response', (data) => {
  console.log('[delsucia] resposta final', data.message);
  console.log('[delsucia] tokens desta mensagem', data.tokenUsage.totalTokens);
  console.log('[delsucia] tokens acumulados', data.accumulatedTokenUsage.totalTokens);
});

socket.on('error', (err) => {
  console.error('[delsucia] erro', err);
});
```

#### Exemplo rápido em Python
```python
import socketio

sio = socketio.Client()

@sio.event
def connect():
    print('conectado')
    sio.emit('message', {'message': 'Olá do Python!'})

@sio.on('response')
def handle_response(data):
    print('resposta:', data['message'])

sio.connect('http://localhost:3000', transports=['websocket'])
sio.wait()
```

### 3. Conheça os eventos emitidos
- `thread_created`: nova thread persistente criada para a conexão.
- `thread_restored`: confirmação de restauração de uma thread existente.
- `agent_selected`: identifica o agente e provider que atuarão na mensagem.
- `agent_message`: transmite tudo o que circula entre agentes (mensagens de usuário, respostas, chamadas de função, resultados).
- `agent_action`: descrição de actions em andamento (execução de tool).
- `agent_action_complete`: status final da action anterior.
- `response`: resposta final do run atual (contém tokens desta interação e acumulados).
- `token_usage`: eventos incrementais de tokens (caso a UI esteja habilitada).
- `error` / `config_required` / `api_key_invalid`: tratativas de erro ou necessidade de configuração.

> **Dica:** sempre grave o `threadId` retornado (via `thread_created` ou `thread_restored`) no seu domínio. Emitir `restore_thread` ao reconectar mantém o contexto da conversa.

### 4. REST APIs auxiliares
Além do canal em tempo real, o DelsucIA expõe endpoints REST úteis para integrações e dashboards:

| Método | Rota | Uso |
|--------|------|-----|
| `GET` | `/api/agents` | Lista agentes, grupos e ferramentas disponíveis. |
| `GET` | `/api/agents/config` | Obtém o conteúdo hierárquico de `agents.json` incluindo grupos, toolsets e metadados. |
| `POST` | `/api/agents/groups/:groupId/agents` | Cria um novo agente no grupo informado (CRUD). |
| `PUT` | `/api/agents/groups/:groupId/agents/:agentName` | Atualiza um agente existente dentro do grupo (CRUD). |
| `DELETE` | `/api/agents/groups/:groupId/agents/:agentName` | Remove um agente do grupo (CRUD). |
| `GET` | `/api/connections` | Mostra conexões Socket.IO ativas. |
| `GET` | `/api/connections/:socketId` | Detalhes de uma conexão específica. |
| `GET` | `/api/tokens?llmProvider=openai` | Histórico agregado de tokens e custos (filtrável por provider). |
| `GET` | `/api/logs` | Últimos logs gerados pelo serviço. |
| `POST` | `/api/config` | Configura o provider e credenciais (OpenAI ou StackSpot). |
| `GET` | `/api/config` | Obtém o estado atual de configuração. |

Todas as rotas expõem JSON. Quando integrar, utilize um token ou camada de autenticação própria (ex.: API Gateway) para proteger estes endpoints se o serviço ficar disponível fora da rede interna.

#### Payloads e exemplos do CRUD de agentes

**Criar agente (`POST /api/agents/groups/:groupId/agents`)**

```http
POST /api/agents/groups/filesystem-terminal/agents HTTP/1.1
Content-Type: application/json

{
  "name": "Docs Generator",
  "description": "Gera documentação a partir de comentários de código.",
  "model": "gpt-4-turbo-preview",
  "priority": 10,
  "tools": ["fileSystem"],
  "instructions": "Crie documentação com base nos arquivos fornecidos.",
  "shouldUse": {
    "type": "keywords",
    "keywords": ["documentação", "docs", "README"]
  }
}
```

Resposta esperada (`201 Created`):

```json
{
  "name": "Docs Generator",
  "description": "Gera documentação a partir de comentários de código.",
  "model": "gpt-4-turbo-preview",
  "priority": 10,
  "tools": ["fileSystem"],
  "instructions": "Crie documentação com base nos arquivos fornecidos.",
  "shouldUse": {
    "type": "keywords",
    "keywords": ["documentação", "docs", "README"]
  }
}
```

**Atualizar agente (`PUT /api/agents/groups/:groupId/agents/:agentName`)**

```http
PUT /api/agents/groups/filesystem-terminal/agents/Docs%20Generator HTTP/1.1
Content-Type: application/json

{
  "priority": 5,
  "instructions": "Atualize a documentação analisando os arquivos modificados.",
  "tools": ["fileSystem", "terminal"]
}
```

Resposta esperada (`200 OK`):

```json
{
  "name": "Docs Generator",
  "description": "Gera documentação a partir de comentários de código.",
  "model": "gpt-4-turbo-preview",
  "priority": 5,
  "tools": ["fileSystem", "terminal"],
  "instructions": "Atualize a documentação analisando os arquivos modificados.",
  "shouldUse": {
    "type": "keywords",
    "keywords": ["documentação", "docs", "README"]
  }
}
```

**Remover agente (`DELETE /api/agents/groups/:groupId/agents/:agentName`)**

```http
DELETE /api/agents/groups/filesystem-terminal/agents/Docs%20Generator HTTP/1.1
```

Resposta esperada (`200 OK`):

```json
{
  "success": true
}
```

### 5. Boas práticas
- Sempre trate `socket.on('error')` para reagir a credenciais inválidas ou ausência de provider.
- Sincronize `threadId` com um identificador da sua aplicação (usuário, sessão, ticket).
- Reaproveite a mesma conexão Socket.IO para múltiplas requisições sequenciais do mesmo ator; o cache de contexto fica na thread.
- Para resetar o contexto, emita `clear_conversation` e aguarde o novo `thread_created`.
- Use as rotas REST para auditoria (`/api/logs`) e billing (`/api/tokens`) periódicos.
- Versões mobile/desktop podem embutir o mesmo fluxo com bibliotecas Socket.IO compatíveis.

Seguindo os passos acima, qualquer aplicação externa consegue orquestrar agentes, acompanhar chamadas de tool em tempo real e integrar o DelsucIA como um serviço de IA conversacional completo.

## 📁 Estrutura do Projeto

```
DelsucIA/
├── src/
│   ├── agents/
│   │   ├── agents.json       # Configuração dos agentes
│   │   ├── agentLoader.ts    # Carregador de agentes
│   │   ├── agentManager.ts   # Gerenciador de agentes OpenAI
│   │   └── config.ts          # Configuração e seleção de agentes
│   ├── config/
│   │   └── env.ts            # Gerenciamento de configurações
│   ├── tools/
│   │   ├── fileSystemTools.ts # Ferramentas de sistema de arquivos
│   │   └── terminalTools.ts    # Ferramentas de terminal
│   ├── utils/
│   │   ├── functionDescriptions.ts
│   │   └── serverHelpers.ts
│   ├── server.ts             # Servidor Socket.IO com integração OpenAI
│   └── main.ts
├── client/
│   └── index.html            # Cliente web
├── dist/                     # Arquivos compilados (TypeScript)
├── package.json
├── tsconfig.json
├── config.json               # Configurações da aplicação (criado via frontend)
├── tokens.json               # Histórico de tokens (gerado automaticamente)
├── logs.json                 # Logs da aplicação (gerado automaticamente)
└── README.md
```

## ⚙️ Configuração

### Configuração via Frontend
A aplicação utiliza `config.json` para armazenar configurações. Configure através da interface web:
- `openaiApiKey`: Sua chave da API OpenAI (necessária para Assistants API)
- `port`: Porta do servidor (padrão: 3000)

### Assistente
O assistente é criado automaticamente na primeira execução com:
- **Nome**: DelsucIA Assistant
- **Modelo**: GPT-4 Turbo Preview
- **Instruções**: Assistente especializado em analisar e navegar por projetos de código
- **Tools**: Funções para listar diretórios, ler arquivos e procurar arquivos

Você pode personalizar os agentes editando o arquivo `src/agents/agents.json`.

### Segurança de Arquivos
- ✅ Acesso restrito apenas ao diretório raiz do projeto
- ✅ Proteção contra acesso a arquivos fora do projeto (path traversal)
- ✅ Limite de 1MB por arquivo
- ✅ Ignora automaticamente `node_modules`, `.git` e `dist`

## ⚡ Performance

O sistema de agentes dinâmicos foi otimizado para manter performance equivalente ao sistema hardcoded:

### Otimizações Implementadas

1. **Cache de Configurações**: Cache em memória após primeira carga
2. **Cache de Agentes Ordenados**: Agentes pré-ordenados por prioridade
3. **Cache de Agentes Específicos**: Referências diretas para agentes comuns
4. **Compilação de Regex**: Regex compiladas durante criação
5. **Versão Síncrona Otimizada**: `selectAgentSync()` sem overhead de Promise
6. **Inicialização na Startup**: Carregamento dos agentes na inicialização

### Benchmarks

| Operação | Sistema Anterior | Sistema Novo (com otimizações) |
|----------|------------------|--------------------------------|
| Seleção de agente | ~0.1-0.5ms | **~0.1-0.5ms** |
| Carregamento inicial | 0ms (hardcoded) | ~5-10ms (apenas na startup) |
| Chamadas subsequentes | ~0.1-0.5ms | **~0.1-0.5ms** |

**Conclusão**: A nova implementação NÃO perde performance significativa. Com as otimizações implementadas, a seleção de agentes é tão rápida quanto antes, com overhead inicial mínimo apenas na startup.

## 🔒 Segurança

⚠️ **Importante**: Nunca commite os seguintes arquivos no repositório (estão no `.gitignore`):
- `config.json` - Contém API keys
- `tokens.json` - Histórico de uso
- `logs.json` - Logs da aplicação

## 🐛 Troubleshooting

### Erro: "Nenhum agente configurado"
**Causa**: Arquivo JSON não encontrado ou inválido  
**Solução**: Verifique se `agents.json` existe e está no formato correto

### Erro: "Tool não encontrada"
**Causa**: Tool referenciada não está registrada  
**Solução**: Verifique se a tool está no `toolSets` ou registre-a

### Agente não está sendo selecionado
**Causa**: Regras shouldUse muito restritivas ou conflito de prioridade  
**Solução**: 
1. Verifique as palavras-chave/regex
2. Ajuste a prioridade
3. Teste a regra manualmente

### Erro: "API key não configurada"
**Causa**: API key não foi configurada via frontend  
**Solução**: Acesse a interface web e configure a API key no botão "⚙️ Config"

### Erro: "AuthenticationError: Incorrect API key"
**Causa**: API key inválida ou expirada  
**Solução**: Verifique a API key configurada e atualize se necessário

## 📚 Referências

- [OpenAI Assistants API](https://platform.openai.com/docs/assistants)
- [Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Socket.IO Documentation](https://socket.io/docs/)

## 📄 Licença

ISC
