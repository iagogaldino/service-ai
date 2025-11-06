# Guia de Refatoração

## Estrutura Modular Criada

A refatoração separa as responsabilidades em módulos específicos:

### 📁 Estrutura de Diretórios

```
src/
├── types/
│   └── index.ts              # Tipos e interfaces compartilhados
├── validation/
│   └── credentialValidator.ts # Validação de credenciais LLM
├── storage/
│   ├── logStorage.ts         # Gerenciamento de logs
│   ├── tokenStorage.ts       # Gerenciamento de tokens
│   └── conversationStorage.ts # Gerenciamento de conversas
├── services/
│   ├── llmService.ts         # Gerenciamento de LLM adapter
│   ├── threadService.ts      # Gerenciamento de threads
│   └── connectionService.ts  # Gerenciamento de conexões
├── utils/
│   └── tokenCalculator.ts    # Cálculo de custos de tokens
├── routes/
│   └── apiRoutes.ts          # Rotas REST (a criar)
├── handlers/
│   └── socketHandlers.ts     # Handlers Socket.IO (a criar)
└── server.ts                 # Servidor principal (refatorar)
```

## Módulos Criados

### ✅ 1. Types (`src/types/index.ts`)
- Centraliza todas as interfaces e tipos
- `LogEntry`, `TokenUsage`, `TokenCost`, `Conversation`, etc.
- `LLMProvider` type

### ✅ 2. Validation (`src/validation/credentialValidator.ts`)
- `validateLLMCredentials()` - Valida credenciais do provider

### ✅ 3. Storage Modules

#### `src/storage/logStorage.ts`
- `saveLog()` - Salva log
- `loadLogs()` - Carrega logs (com filtro por provider)

#### `src/storage/tokenStorage.ts`
- `saveTokens()` - Salva tokens
- `loadTokens()` - Carrega tokens (com filtro por provider)

#### `src/storage/conversationStorage.ts`
- `saveConversationMessage()` - Salva mensagem
- `loadConversation()` - Carrega conversa
- `clearConversation()` - Limpa conversa

### ✅ 4. Services

#### `src/services/llmService.ts`
- `initializeLLMAdapter()` - Inicializa adapter
- `getLLMAdapter()` - Obtém adapter atual
- `getCurrentLLMProvider()` - Obtém provider atual
- `updateLLMConfig()` - Atualiza configuração

#### `src/services/threadService.ts`
- `getThreadId()` / `setThreadId()` - Gerenciamento de threads
- `getThreadTokens()` / `updateThreadTokens()` - Gerenciamento de tokens
- `clearThread()` - Limpa thread

#### `src/services/connectionService.ts`
- `addConnection()` / `getConnection()` - Gerenciamento de conexões
- `updateConnectionActivity()` - Atualiza atividade
- `addMonitor()` / `getMonitorsForTarget()` - Gerenciamento de monitores

### ✅ 5. Utils

#### `src/utils/tokenCalculator.ts`
- `calculateTokenCost()` - Calcula custo de tokens
- `MODEL_PRICING` - Preços dos modelos

## Próximos Passos

### 🔄 1. Criar Rotas REST (`src/routes/apiRoutes.ts`)
Mover todas as rotas Express para este módulo:
- `GET /` - Servir HTML
- `GET /monitor` - Servir monitor HTML
- `GET /api/connections` - Listar conexões
- `GET /api/agents` - Listar agentes
- `GET /api/tokens` - Listar tokens
- `GET /api/logs` - Listar logs
- `GET /api/config` - Obter configuração
- `POST /api/config` - Salvar configuração
- `GET /api/conversations/:threadId` - Carregar conversa
- `DELETE /api/conversations/:threadId` - Limpar conversa

### 🔄 2. Criar Handlers Socket.IO (`src/handlers/socketHandlers.ts`)
Mover todos os handlers Socket.IO:
- `connection` - Nova conexão
- `restore_thread` - Restaurar thread
- `message` - Processar mensagem
- `clear_conversation` - Limpar conversa
- `start_monitoring` - Iniciar monitoramento
- `stop_monitoring` - Parar monitoramento
- `disconnect` - Desconexão

### 🔄 3. Refatorar `server.ts`
O arquivo `server.ts` deve ficar apenas com:
- Inicialização do Express e Socket.IO
- Configuração de middleware
- Registro de rotas
- Registro de handlers Socket.IO
- Inicialização do servidor

## Como Usar os Novos Módulos

### Exemplo: Usar Storage

```typescript
import { saveLog } from './storage/logStorage';
import { saveTokens } from './storage/tokenStorage';
import { saveConversationMessage } from './storage/conversationStorage';

// Salvar log
saveLog({
  type: 'connection',
  socketId: 'socket123',
  llmProvider: 'openai'
});

// Salvar tokens
saveTokens(
  'thread123',
  'Agent Name',
  'User message',
  { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  { promptTokens: 500, completionTokens: 250, totalTokens: 750 },
  'gpt-4-turbo-preview',
  'openai'
);
```

### Exemplo: Usar Services

```typescript
import { getLLMAdapter, getCurrentLLMProvider } from './services/llmService';
import { getThreadId, setThreadId } from './services/threadService';
import { addConnection, getConnection } from './services/connectionService';

// Obter adapter
const adapter = getLLMAdapter();

// Gerenciar thread
setThreadId('socket123', 'thread123');
const threadId = getThreadId('socket123');

// Gerenciar conexão
addConnection({
  socketId: 'socket123',
  threadId: 'thread123',
  connectedAt: new Date(),
  lastActivity: new Date(),
  messageCount: 0
});
```

## Benefícios da Refatoração

1. **Separação de Responsabilidades**: Cada módulo tem uma responsabilidade clara
2. **Reutilização**: Código pode ser reutilizado em diferentes contextos
3. **Testabilidade**: Módulos podem ser testados independentemente
4. **Manutenibilidade**: Mais fácil encontrar e corrigir bugs
5. **Escalabilidade**: Fácil adicionar novas funcionalidades
6. **Legibilidade**: Código mais limpo e organizado

## Migração Gradual

A refatoração pode ser feita gradualmente:
1. ✅ Criar novos módulos (já feito)
2. 🔄 Atualizar imports no `server.ts` para usar os novos módulos
3. 🔄 Mover rotas para `routes/apiRoutes.ts`
4. 🔄 Mover handlers para `handlers/socketHandlers.ts`
5. 🔄 Limpar código antigo do `server.ts`

