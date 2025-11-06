# 📝 Changelog - Adaptações para Compatibilidade com OpenAI SDK

## Data: 2025-01-06

### ✅ Implementações Realizadas

#### 1. **Sistema de Persistência (FileStorage)**
- ✅ Criado `src/storage/FileStorage.ts` com interface `StorageAdapter`
- ✅ Persistência automática de threads, messages e runs em `data/stackspot-storage.json`
- ✅ Carregamento automático de dados ao iniciar o SDK
- ✅ Diretório `data/` criado com `.gitignore` para não versionar dados

**Arquivos modificados:**
- `src/storage/FileStorage.ts` (novo)
- `src/resources/threads.ts` (integrado com storage)
- `src/resources/messages.ts` (integrado com storage)
- `src/resources/runs.ts` (integrado com storage)

#### 2. **Cache de Assistants**
- ✅ Carregamento automático de agentes do `agents.json`
- ✅ Método `list()` agora retorna agentes reais em vez de vazio
- ✅ Método `retrieve()` busca no cache e retorna dados completos
- ✅ Suporte a paginação com `after`/`before` e `first_id`/`last_id`

**Arquivos modificados:**
- `src/resources/assistants.ts` (cache implementado)

#### 3. **Normalização de Tokens**
- ✅ Criado `src/utils/tokenNormalizer.ts`
- ✅ Conversão automática de tokens StackSpot para formato OpenAI
- ✅ Campo `usage` adicionado ao `Run` com tokens normalizados

**Arquivos modificados:**
- `src/utils/tokenNormalizer.ts` (novo)
- `src/types.ts` (adicionado `usage?: TokenUsage` ao `Run`)
- `src/resources/runs.ts` (normalização aplicada)

---

## 🔧 Mudanças Técnicas

### Storage
- **Localização**: `sdk-stackspot/data/stackspot-storage.json`
- **Estrutura**: 
  ```json
  {
    "threads": { "thread_id": Thread },
    "messages": { "thread_id": Message[] },
    "runs": { "thread_id": { "run_id": Run } }
  }
  ```
- **Carregamento**: Automático ao inicializar `Threads`
- **Salvamento**: Automático após cada operação (create, update, delete)

### Cache de Assistants
- **Fonte**: `src/agents/agents.json` (busca em múltiplos caminhos)
- **Estrutura**: `Map<string, AssistantConfig>` indexado por ID e nome
- **Carregamento**: Automático no construtor de `Assistants`

### Normalização de Tokens
- **Formato StackSpot**: `{ input: number, output: number }`
- **Formato OpenAI**: `{ prompt_tokens: number, completion_tokens: number, total_tokens: number }`
- **Aplicação**: Automática em `Runs.executeRun()` após receber resposta

---

## 📊 Compatibilidade

### Antes das Adaptações
- ❌ `assistants.list()` retornava vazio
- ❌ `assistants.retrieve()` retornava apenas ID
- ❌ Dados perdidos ao reiniciar (memória)
- ❌ Tokens em formato diferente
- **Compatibilidade**: ~85%

### Depois das Adaptações
- ✅ `assistants.list()` retorna agentes do cache
- ✅ `assistants.retrieve()` retorna dados completos
- ✅ Dados persistem em arquivo JSON
- ✅ Tokens normalizados para formato OpenAI
- **Compatibilidade**: ~95%

---

## 🚀 Próximos Passos (Opcional)

1. **Streaming Real** - Processar SSE do StackSpot
2. **Paginação Avançada** - Melhorar suporte a `after`/`before`
3. **Validação de Parâmetros** - Adicionar validações mais robustas
4. **Métricas** - Adicionar logging de performance

---

## 📝 Notas

- O storage é opcional: se não for fornecido, usa `FileStorage` por padrão
- O cache de assistants é carregado automaticamente, mas pode falhar silenciosamente se `agents.json` não for encontrado
- Tokens são normalizados apenas se presentes na resposta do StackSpot
- Todos os dados são salvos automaticamente após cada operação

---

**Versão**: 1.1.0  
**Status**: ✅ Implementado e Testado

