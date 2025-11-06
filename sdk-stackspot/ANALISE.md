# Análise: SDK StackSpot vs OpenAI SDK

## Resumo

Foi criado um SDK para StackSpot que mantém a mesma interface e funcionalidade do OpenAI SDK, permitindo migração fácil entre as duas plataformas.

## Funcionalidades Implementadas

### ✅ Autenticação
- OAuth2 com `client_credentials`
- Gerenciamento automático de tokens
- Renovação automática de tokens expirados

### ✅ Agentes (Assistants)
- Interface compatível com OpenAI
- Validação de configuração
- **Limitação**: StackSpot não permite criar agentes via API. Use o ID do agente criado no painel.

### ✅ Threads (Conversas)
- Criação de threads
- Gerenciamento de histórico de mensagens
- **Diferença**: Threads são simuladas no lado do cliente (em memória)

### ✅ Mensagens
- Criar mensagens
- Listar mensagens
- Obter mensagem específica
- Atualizar mensagens
- Suporte a histórico de conversa

### ✅ Runs (Execuções)
- Criar e executar runs
- Aguardar conclusão
- Gerenciar status (queued, in_progress, completed, failed)
- **Implementação**: Faz chamadas à API de chat do StackSpot

## Diferenças em relação ao OpenAI

### 1. Agentes
- **OpenAI**: Permite criar agentes dinamicamente via API
- **StackSpot**: Agentes devem ser criados no painel. O SDK apenas valida configuração.

### 2. Threads
- **OpenAI**: Threads são persistidas no servidor
- **StackSpot**: Threads são simuladas no cliente (em memória). Para produção, use um banco de dados.

### 3. Runs
- **OpenAI**: Runs são executados no servidor da OpenAI
- **StackSpot**: Runs fazem chamadas à API de chat e simulam o comportamento

### 4. Tools/Funções
- **OpenAI**: Suporte nativo a tools e execução de funções
- **StackSpot**: Não suporta tools nativamente. Pode ser implementado no lado do cliente.

### 5. Streaming
- **OpenAI**: Suporte completo a streaming via SSE
- **StackSpot**: Suporte parcial (parâmetro `stream` existe, mas precisa implementação de SSE)

## Estrutura do SDK

```
sdk-stackspot/
├── src/
│   ├── index.ts              # Exportações principais
│   ├── stackspot.ts          # Cliente principal (similar a OpenAI)
│   ├── client.ts             # Cliente HTTP e autenticação
│   ├── types.ts              # Tipos TypeScript
│   └── resources/
│       ├── assistants.ts     # Gerenciamento de agentes
│       ├── threads.ts        # Gerenciamento de threads
│       ├── messages.ts       # Gerenciamento de mensagens
│       └── runs.ts          # Gerenciamento de runs
├── examples/
│   ├── basic-usage.ts       # Exemplo básico
│   └── comparison-openai.ts # Comparação com OpenAI
├── package.json
├── tsconfig.json
└── README.md
```

## Como Usar

### Exemplo Básico

```typescript
import StackSpot from '@stackspot/sdk';

const stackspot = new StackSpot({
  clientId: 'seu-client-id',
  clientSecret: 'seu-client-secret',
});

// Criar thread
const thread = await stackspot.beta.threads.create();

// Adicionar mensagem
await stackspot.beta.threads.messages.create(thread.id, {
  role: 'user',
  content: 'Olá!',
});

// Criar run
const run = await stackspot.beta.threads.runs.create(thread.id, {
  assistant_id: 'ID_DO_AGENTE_STACKSPOT',
});

// Aguardar conclusão
while (run.status === 'queued' || run.status === 'in_progress') {
  await new Promise(resolve => setTimeout(resolve, 1000));
  run = await stackspot.beta.threads.runs.retrieve(thread.id, run.id);
}

// Obter resposta
const messages = await stackspot.beta.threads.messages.list(thread.id);
```

## Integração com o Projeto Atual

Para integrar o SDK StackSpot no projeto `ServiceIA`:

1. **Substituir OpenAI por StackSpot**:
   ```typescript
   // Antes
   import OpenAI from 'openai';
   const openai = new OpenAI({ apiKey: '...' });
   
   // Depois
   import StackSpot from './sdk-stackspot';
   const stackspot = new StackSpot({
     clientId: '...',
     clientSecret: '...',
   });
   ```

2. **Atualizar AgentManager**:
   - Substituir `openai.beta.assistants` por `stackspot.beta.assistants`
   - Ajustar criação de agentes (usar IDs do StackSpot)

3. **Atualizar server.ts**:
   - Substituir chamadas à OpenAI API por StackSpot SDK
   - Ajustar lógica de threads (StackSpot simula threads)

4. **Persistência de Threads**:
   - Atualmente threads são em memória
   - Para produção, salvar threads em banco de dados ou arquivo JSON

## Melhorias Futuras

1. **Persistência de Threads**: Salvar threads em banco de dados
2. **Streaming Real**: Implementar suporte completo a SSE
3. **Cache de Tokens**: Melhorar gerenciamento de tokens
4. **Retry Logic**: Adicionar retry automático em caso de falhas
5. **Rate Limiting**: Implementar controle de rate limiting
6. **Tools Support**: Adicionar suporte a tools/funções customizadas

## Conclusão

O SDK criado mantém compatibilidade com a interface do OpenAI SDK, facilitando a migração. As principais diferenças são:
- Agentes devem ser criados no painel do StackSpot
- Threads são simuladas no cliente
- Runs fazem chamadas à API de chat do StackSpot

Para uso em produção, recomenda-se:
- Persistir threads em banco de dados
- Implementar cache de tokens
- Adicionar tratamento de erros robusto
- Implementar retry logic
