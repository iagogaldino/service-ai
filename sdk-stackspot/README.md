# StackSpot SDK

SDK do StackSpot similar ao OpenAI SDK para integração com StackSpot GenAI API.

## Instalação

```bash
npm install
npm run build
```

## Uso

### Configuração Básica

```typescript
import StackSpot from '@stackspot/sdk';

const stackspot = new StackSpot({
  clientId: 'seu-client-id',
  clientSecret: 'seu-client-secret',
  realm: 'stackspot-freemium', // opcional, padrão: stackspot-freemium
});
```

### Thread ID (Contexto de Conversa)

O SDK suporta **thread_id** completo, similar ao OpenAI. Cada thread mantém seu próprio histórico de mensagens:

```typescript
// Criar thread (retorna thread_id único)
const thread = await stackspot.beta.threads.create();
const threadId = thread.id; // Ex: "thread_1234567890_abc123"

// Todas as operações usam o thread_id
await stackspot.beta.threads.messages.create(threadId, {
  role: 'user',
  content: 'Olá!',
});

// Criar run na thread
const run = await stackspot.beta.threads.runs.create(threadId, {
  assistant_id: '01K9CFTZRCA6CPPXSFZKNCA0KW',
});

// Recuperar thread existente
const retrievedThread = await stackspot.beta.threads.retrieve(threadId);

// Listar mensagens da thread
const messages = await stackspot.beta.threads.messages.list(threadId);

// Listar runs da thread
const runs = await stackspot.beta.threads.runs.list(threadId);
```

**Importante**: Threads são armazenadas em memória por padrão. Para produção, implemente persistência (banco de dados ou arquivo JSON).

### Criar um Agente

```typescript
const assistant = await stackspot.beta.assistants.create({
  name: 'Meu Agente',
  instructions: 'Você é um assistente útil.',
  model: 'gpt-4',
});
```

**Nota:** StackSpot não tem API para criar agentes dinamicamente. Os agentes são criados no painel do StackSpot. Este método apenas valida e retorna a configuração. Use o ID do agente criado no painel.

### Criar uma Thread

```typescript
const thread = await stackspot.beta.threads.create({
  messages: [
    {
      role: 'user',
      content: 'Olá!',
    },
  ],
});
```

### Adicionar Mensagem

```typescript
const message = await stackspot.beta.threads.messages.create(thread.id, {
  role: 'user',
  content: 'Como você está?',
});
```

### Criar e Executar um Run

```typescript
const run = await stackspot.beta.threads.runs.create(thread.id, {
  assistant_id: '01K9CFTZRCA6CPPXSFZKNCA0KW', // ID do agente do StackSpot
  stream: false,
});

// Aguardar conclusão
while (run.status === 'queued' || run.status === 'in_progress') {
  await new Promise(resolve => setTimeout(resolve, 1000));
  run = await stackspot.beta.threads.runs.retrieve(thread.id, run.id);
}

// Obter mensagens atualizadas
const messages = await stackspot.beta.threads.messages.list(thread.id);
console.log(messages.data);
```

### Exemplo Completo

```typescript
import StackSpot from '@stackspot/sdk';

async function exemplo() {
  const stackspot = new StackSpot({
    clientId: '520ede51-716c-4e97-9c72-afe66852fbde',
    clientSecret: '1LOor8BPbGsgAU73x801KFvFu7wPO379zf06eS11xv7O3DplOMrto7W9u5RgqkwS',
  });

  // Criar thread
  const thread = await stackspot.beta.threads.create();

  // Adicionar mensagem do usuário
  await stackspot.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Olá, como você está?',
  });

  // Criar e executar run
  const run = await stackspot.beta.threads.runs.create(thread.id, {
    assistant_id: '01K9CFTZRCA6CPPXSFZKNCA0KW',
  });

  // Aguardar conclusão
  let currentRun = run;
  while (currentRun.status === 'queued' || currentRun.status === 'in_progress') {
    await new Promise(resolve => setTimeout(resolve, 1000));
    currentRun = await stackspot.beta.threads.runs.retrieve(thread.id, run.id);
  }

  // Obter resposta
  const messages = await stackspot.beta.threads.messages.list(thread.id);
  const lastMessage = messages.data.find(m => m.role === 'assistant');
  console.log('Resposta:', lastMessage?.content[0].text.value);
}

exemplo();
```

## Exemplos

O SDK inclui vários exemplos na pasta `examples/`:

### Exemplo Básico
```bash
npm run example:basic
```

### Exemplo de Acesso a Arquivos
Testa se o agente consegue acessar diretórios e arquivos do projeto:

```bash
# Teste rápido (lê um arquivo)
npm run test:file-access

# Exemplo completo (múltiplas operações)
npm run example:file-access
```

O exemplo de acesso a arquivos demonstra:
- Listar arquivos de um diretório
- Ler conteúdo de arquivos específicos
- Analisar estrutura de diretórios
- Buscar arquivos por nome

**Requisitos**: O agente deve estar configurado com ferramentas de filesystem (`listDirectory`, `readFile`, `findFile`).

Veja `examples/README_FILE_ACCESS.md` para mais detalhes.

### Outros Exemplos
```bash
npm run example:thread-id      # Exemplo de uso de thread_id
npm run example:comparison     # Comparação com OpenAI SDK
```

## Diferenças em relação ao OpenAI SDK

1. **Agentes**: StackSpot não permite criar agentes via API. Use o ID do agente criado no painel.
2. **Threads**: Threads são simuladas no lado do cliente, mantendo histórico de mensagens em memória.
   - ✅ **Thread ID funciona igual ao OpenAI**: Cada thread tem um ID único
   - ✅ **Mensagens são associadas a thread_id**: Mantém contexto por thread
   - ✅ **Runs são executados em thread_id específico**: Cada run pertence a uma thread
   - ⚠️ **Persistência**: Threads são em memória por padrão (implemente persistência para produção)
3. **Runs**: Runs são simulados fazendo chamadas à API de chat do StackSpot.
4. **Streaming**: Suportado via parâmetro `stream: true` no `createRun`.

## Estrutura

```
sdk-stackspot/
├── src/
│   ├── index.ts              # Exportações principais
│   ├── stackspot.ts          # Cliente principal
│   ├── client.ts             # Cliente HTTP e autenticação
│   ├── types.ts              # Tipos e interfaces
│   └── resources/
│       ├── assistants.ts     # Gerenciamento de agentes
│       ├── threads.ts        # Gerenciamento de threads
│       ├── messages.ts       # Gerenciamento de mensagens
│       └── runs.ts           # Gerenciamento de runs
├── package.json
├── tsconfig.json
└── README.md
```

## Autenticação

O SDK gerencia automaticamente a autenticação OAuth2:
- Obtém token de acesso usando `client_credentials`
- Renova token automaticamente quando expira
- Inclui token em todas as requisições

## Licença

ISC
