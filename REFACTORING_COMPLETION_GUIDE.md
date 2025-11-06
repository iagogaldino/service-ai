# Guia para Completar a Refatoração - Fase 2

## Estado Atual

✅ **Concluído:**
- Handlers Socket.IO criados em `src/handlers/socketHandlers.ts`
- Serviços criados (monitoringService, messageService)
- Handler antigo comentado no `server.ts` (linhas ~1570-2494)

⚠️ **Pendente:**
- Remover completamente o código comentado do handler antigo
- Remover funções duplicadas (saveLogToJson, saveTokensToJson, etc.)
- Substituir todas as referências às variáveis antigas pelos serviços
- Corrigir erros de lint

## Próximos Passos

### 1. Remover Código Comentado
- Remover o bloco comentado de `/*` até `*/` (linhas ~1570-2494)
- Isso eliminará a maioria dos erros de lint

### 2. Remover Funções Duplicadas
As seguintes funções ainda existem no `server.ts` mas já estão nos módulos:
- `saveLogToJson()` → usar `saveLog()` de `storage/logStorage.ts`
- `saveTokensToJson()` → usar `saveTokens()` de `storage/tokenStorage.ts`
- `saveConversationMessage()` → já está importada de `storage/conversationStorage.ts`
- `loadConversation()` → já está importada de `storage/conversationStorage.ts`
- `clearConversation()` → já está importada de `storage/conversationStorage.ts`
- `waitForRunCompletion()` → não está mais sendo usada (os adapters têm sua própria implementação)
- `emitToMonitors()` → já está importada de `services/monitoringService.ts`

### 3. Remover Interfaces Duplicadas
Interfaces que já estão em `src/types/index.ts`:
- `TokenUsage`
- `TokenCost`
- `TokenHistoryEntry`
- `TokensJsonFile`
- `LogEntry`
- `Conversation`
- `ConnectionInfo`
- `LogType`

### 4. Substituir Referências às Variáveis Antigas

**Variáveis antigas → Serviços:**
- `threadMap` → usar `getThreadId()`, `setThreadId()` de `threadService`
- `connectionsMap` → usar `getConnection()`, `getAllConnections()` de `connectionService`
- `monitoringSockets` → usar funções de `monitoringService`
- `threadTokensMap` → usar `getThreadTokens()`, `updateThreadTokens()` de `threadService`

## Comandos Úteis

```bash
# Ver erros de lint
npm run lint

# Testar se o servidor compila
npm run build

# Ver quantas linhas foram reduzidas
wc -l src/server.ts
```

## Observações Importantes

1. **Não deletar tudo de uma vez** - Fazer de forma incremental
2. **Testar após cada mudança** - Garantir que não quebrou nada
3. **O handler comentado não está sendo usado** - Pode ser removido com segurança
4. **As funções duplicadas precisam ser substituídas** - Não apenas removidas

## Estrutura Final Esperada

Após completar a refatoração:
- `server.ts` deve ter apenas:
  - Configuração do Express/Socket.IO
  - Inicialização de serviços
  - Rotas REST
  - Função de shutdown
- Todo o código de handlers Socket.IO deve estar em `src/handlers/socketHandlers.ts`
- Todo o código de storage deve estar nos módulos de storage
- Todo o código de serviços deve estar nos módulos de serviços

