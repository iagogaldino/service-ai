# Prioridades de Refatoração

## Análise do `server.ts` (2777 linhas)

### 🔴 **PRIORIDADE ALTA** - Áreas que mais precisam de refatoração

### 1. **Handlers Socket.IO** (~850 linhas) ⚠️ **MAIS CRÍTICO**
**Localização**: Linhas 1748-2595+
**Problemas**:
- Todo o handler `io.on('connection')` tem ~850 linhas
- Handler `message` tem ~335 linhas com múltiplas responsabilidades
- Handler `restore_thread` tem ~100 linhas
- Lógica complexa misturada com gerenciamento de estado
- Dificulta testes e manutenção

**O que mover**:
- ✅ Criar `src/handlers/socketHandlers.ts`
- ✅ Separar handlers em funções individuais:
  - `handleConnection(socket)` 
  - `handleRestoreThread(socket, data)`
  - `handleMessage(socket, data)` - **MAIS COMPLEXO**
  - `handleClearConversation(socket)`
  - `handleDisconnect(socket)`
  - `handleStartMonitoring(socket, data)`
  - `handleStopMonitoring(socket)`

**Benefício**: Reduzirá `server.ts` em ~850 linhas

---

### 2. **Processamento de Mensagens** (~335 linhas) ⚠️ **MUITO COMPLEXO**
**Localização**: Linhas 2197-2532 dentro do handler `message`
**Problemas**:
- Múltiplas responsabilidades em uma única função:
  1. Detecção de leitura de arquivos
  2. Seleção de agente
  3. Adição de mensagem à thread
  4. Criação e processamento de run
  5. Gerenciamento de tokens
  6. Logging
  7. Emissão de eventos
- Código difícil de testar
- Difícil de reutilizar

**O que criar**:
- ✅ `src/services/messageService.ts`:
  - `processMessage(socket, message)` - Função principal
  - `detectFileReadRequest(message)` - Detecção de arquivos
  - `enhanceMessageWithFile(message, filePath)` - Leitura de arquivo
  - `processAgentResponse(threadId, agentId, message)` - Processar resposta
  - `saveMessageResponse(threadId, socketId, message, tokens)` - Salvar resposta

**Benefício**: Separação de responsabilidades, mais testável

---

### 3. **Rotas REST** (~570 linhas)
**Localização**: Linhas 1155-1725
**Problemas**:
- 12 rotas diferentes no mesmo arquivo
- Lógica de filtragem por provider repetida
- Leitura/escrita de arquivos JSON misturada com lógica de negócio
- Dificulta adicionar novas rotas

**O que criar**:
- ✅ `src/routes/apiRoutes.ts` - Registrar todas as rotas
- ✅ `src/routes/handlers/`:
  - `connectionsHandler.ts` - Rotas de conexões
  - `agentsHandler.ts` - Rotas de agentes
  - `tokensHandler.ts` - Rotas de tokens
  - `logsHandler.ts` - Rotas de logs
  - `conversationsHandler.ts` - Rotas de conversas
  - `configHandler.ts` - Rotas de configuração

**Benefício**: Reduzirá `server.ts` em ~570 linhas

---

### 4. **Funções de Storage ainda no server.ts** (~400 linhas)
**Localização**: Linhas 381-820
**Problemas**:
- Funções de storage ainda estão no server.ts:
  - `saveLogToJson()` (linhas 381-480)
  - `saveTokensToJson()` (linhas 493-566)
  - `saveConversationMessage()` (linhas 579-695)
  - `loadConversation()` (linhas 696-751)
  - `clearConversation()` (linhas 759-820)
- Já criamos módulos de storage, mas não estão sendo usados

**Ação**:
- ✅ Substituir chamadas antigas pelos novos módulos:
  - `saveLogToJson()` → `saveLog()` de `storage/logStorage.ts`
  - `saveTokensToJson()` → `saveTokens()` de `storage/tokenStorage.ts`
  - `saveConversationMessage()` → `saveConversationMessage()` de `storage/conversationStorage.ts`
  - `loadConversation()` → `loadConversation()` de `storage/conversationStorage.ts`
  - `clearConversation()` → `clearConversation()` de `storage/conversationStorage.ts`

**Benefício**: Removerá ~400 linhas duplicadas

---

### 5. **Funções de Validação e Cálculo**
**Localização**: 
- `validateLLMCredentials()` (linhas 80-104) - ✅ Já movido para `validation/credentialValidator.ts`
- `calculateTokenCost()` (linhas 224-237) - ✅ Já movido para `utils/tokenCalculator.ts`
- `initializeLLMAdapter()` (linhas 110-141) - ✅ Já movido para `services/llmService.ts`

**Ação**:
- ✅ Substituir chamadas antigas pelos novos módulos

---

## 📊 Resumo de Impacto

| Área | Linhas | Prioridade | Benefício |
|------|--------|------------|-----------|
| Handlers Socket.IO | ~850 | 🔴 ALTA | -850 linhas |
| Processamento de Mensagens | ~335 | 🔴 ALTA | Modularização |
| Rotas REST | ~570 | 🟡 MÉDIA | -570 linhas |
| Funções Storage | ~400 | 🟡 MÉDIA | -400 linhas |
| **TOTAL** | **~2155** | | **~1820 linhas removidas** |

**Resultado esperado**: `server.ts` reduzirá de **2777** para **~957 linhas** (65% de redução)

---

## 🎯 Plano de Ação Sugerido

### Fase 1: Substituir Storage (Mais Fácil) ⭐
1. Substituir todas as chamadas de storage antigas pelos novos módulos
2. Remover funções antigas de storage
3. **Benefício**: -400 linhas, código mais limpo

### Fase 2: Separar Handlers Socket.IO (Alto Impacto) ⭐⭐⭐
1. Criar `src/handlers/socketHandlers.ts`
2. Separar cada handler em função individual
3. Extrair lógica de processamento de mensagens
4. **Benefício**: -850 linhas, muito mais testável

### Fase 3: Criar Serviço de Mensagens (Complexidade) ⭐⭐
1. Criar `src/services/messageService.ts`
2. Mover lógica de processamento de mensagens
3. **Benefício**: Modularização, reutilização

### Fase 4: Separar Rotas REST (Organização) ⭐
1. Criar `src/routes/apiRoutes.ts`
2. Criar handlers individuais para cada grupo de rotas
3. **Benefício**: -570 linhas, fácil adicionar novas rotas

---

## 📝 Notas

- A refatoração pode ser feita **gradualmente**
- Testar cada fase antes de prosseguir
- Manter funcionalidade existente intacta
- Usar os novos módulos criados (storage, services, validation)

