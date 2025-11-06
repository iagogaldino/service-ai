# Mecanismo de Thread ID no StackSpot SDK

## ✅ Sim, o SDK tem suporte completo a `thread_id`!

O SDK implementa o mecanismo de `thread_id` de forma idêntica ao OpenAI SDK. Cada thread mantém seu próprio contexto e histórico de mensagens.

## Como Funciona

```
┌─────────────────────────────────────────────────────────────┐
│                    StackSpot SDK                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Criar Thread                                            │
│     ┌─────────────────────┐                                │
│     │ thread.create()     │ → thread_id: "thread_123..."    │
│     └─────────────────────┘                                │
│                                                              │
│  2. Adicionar Mensagens                                    │
│     ┌─────────────────────┐                                │
│     │ messages.create(     │                                │
│     │   thread_id,         │ → Mensagem associada ao       │
│     │   {content: "..."}   │   thread_id                   │
│     └─────────────────────┘                                │
│                                                              │
│  3. Executar Runs                                          │
│     ┌─────────────────────┐                                │
│     │ runs.create(         │                                │
│     │   thread_id,         │ → Run executado na thread     │
│     │   {assistant_id}     │   específica                  │
│     └─────────────────────┘                                │
│                                                              │
│  4. Histórico Mantido                                      │
│     ┌─────────────────────┐                                │
│     │ messages.list(       │ → Retorna apenas mensagens    │
│     │   thread_id)         │   da thread específica       │
│     └─────────────────────┘                                │
└─────────────────────────────────────────────────────────────┘
```

## Estrutura de Dados

### Thread
```typescript
{
  id: "thread_1234567890_abc123",  // ← thread_id único
  object: "thread",
  created_at: 1234567890,
  metadata: {}
}
```

### Message
```typescript
{
  id: "msg_...",
  thread_id: "thread_1234567890_abc123",  // ← Associa à thread
  role: "user" | "assistant",
  content: [...]
}
```

### Run
```typescript
{
  id: "run_...",
  thread_id: "thread_1234567890_abc123",  // ← Executado na thread
  assistant_id: "...",
  status: "completed"
}
```

## Exemplo Prático

```typescript
import StackSpot from '@stackspot/sdk';

const stackspot = new StackSpot({
  clientId: 'seu-client-id',
  clientSecret: 'seu-client-secret',
});

// 1. Criar thread (obtém thread_id)
const thread = await stackspot.beta.threads.create();
const threadId = thread.id; // "thread_1234567890_abc123"

// 2. Adicionar mensagens usando thread_id
await stackspot.beta.threads.messages.create(threadId, {
  role: 'user',
  content: 'Meu nome é João',
});

// 3. Executar run na thread
const run = await stackspot.beta.threads.runs.create(threadId, {
  assistant_id: '01K9CFTZRCA6CPPXSFZKNCA0KW',
});

// 4. Continuar conversa na mesma thread (mantém contexto)
await stackspot.beta.threads.messages.create(threadId, {
  role: 'user',
  content: 'Qual é o meu nome?', // O agente lembra que é "João"
});

// 5. Recuperar histórico da thread
const messages = await stackspot.beta.threads.messages.list(threadId);
// Retorna apenas mensagens desta thread específica
```

## Múltiplas Threads (Conversas Separadas)

```typescript
// Thread 1 - Conversa sobre programação
const thread1 = await stackspot.beta.threads.create();
await stackspot.beta.threads.messages.create(thread1.id, {
  content: 'Explique TypeScript'
});

// Thread 2 - Conversa sobre culinária
const thread2 = await stackspot.beta.threads.create();
await stackspot.beta.threads.messages.create(thread2.id, {
  content: 'Receita de bolo'
});

// Cada thread mantém seu próprio contexto isolado
// thread1.id ≠ thread2.id
// Mensagens não se misturam entre threads
```

## Operações Disponíveis com Thread ID

### Threads
- ✅ `threads.create()` - Cria thread e retorna `thread_id`
- ✅ `threads.retrieve(thread_id)` - Recupera thread específica
- ✅ `threads.update(thread_id, metadata)` - Atualiza thread
- ✅ `threads.del(thread_id)` - Deleta thread

### Mensagens
- ✅ `messages.create(thread_id, params)` - Adiciona mensagem à thread
- ✅ `messages.list(thread_id)` - Lista mensagens da thread
- ✅ `messages.retrieve(thread_id, message_id)` - Obtém mensagem específica
- ✅ `messages.update(thread_id, message_id, metadata)` - Atualiza mensagem

### Runs
- ✅ `runs.create(thread_id, params)` - Cria run na thread
- ✅ `runs.retrieve(thread_id, run_id)` - Obtém run específico
- ✅ `runs.list(thread_id)` - Lista runs da thread
- ✅ `runs.cancel(thread_id, run_id)` - Cancela run
- ✅ `runs.submitToolOutputs(thread_id, run_id, outputs)` - Submete outputs

## Armazenamento

### Estado Atual (Memória)
```typescript
// Em threads.ts
private threads: Map<string, Thread> = new Map();
private threadMessages: Map<string, Message[]> = new Map();
```

**Limitação**: Threads são perdidas quando o servidor reinicia.

### Para Produção (Recomendado)

Implemente persistência usando:

1. **Banco de Dados**:
   ```typescript
   // Salvar thread no banco
   await db.threads.save({
     id: threadId,
     created_at: thread.created_at,
     metadata: thread.metadata
   });
   
   // Salvar mensagens
   await db.messages.save({
     thread_id: threadId,
     content: message.content,
     role: message.role
   });
   ```

2. **Arquivo JSON** (similar ao projeto atual):
   ```typescript
   // Salvar em conversations.json
   {
     "threads": {
       "thread_123": {
         "id": "thread_123",
         "messages": [...]
       }
     }
   }
   ```

## Comparação com OpenAI

| Funcionalidade | OpenAI | StackSpot SDK |
|----------------|--------|---------------|
| Thread ID único | ✅ | ✅ |
| Mensagens por thread | ✅ | ✅ |
| Runs por thread | ✅ | ✅ |
| Histórico mantido | ✅ | ✅ |
| Persistência no servidor | ✅ | ⚠️ (em memória, precisa implementar) |
| Múltiplas threads | ✅ | ✅ |

## Conclusão

✅ **O SDK tem suporte completo a `thread_id`**, funcionando exatamente como o OpenAI SDK:
- Cada thread tem um ID único
- Mensagens são associadas a `thread_id`
- Runs são executados em `thread_id` específico
- Histórico é mantido por thread
- Múltiplas threads podem coexistir isoladamente

⚠️ **Única diferença**: Threads são armazenadas em memória por padrão. Para produção, implemente persistência (banco de dados ou arquivo JSON).
