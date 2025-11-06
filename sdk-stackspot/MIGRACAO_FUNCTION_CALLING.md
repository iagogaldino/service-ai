# Migração do Function Calling para o SDK

## Resumo

O código de function calling foi movido do serviço principal (`src/utils/functionCallParser.ts`) para dentro do SDK StackSpot (`sdk-stackspot/src/utils/functionCallParser.ts`). Agora toda a lógica de detecção e execução de function calls está encapsulada no SDK, mantendo o código do serviço principal limpo.

## Mudanças Realizadas

### 1. SDK StackSpot (`sdk-stackspot/`)

#### Novos Arquivos
- **`src/utils/functionCallParser.ts`**: Módulo completo de detecção e execução de function calls
  - `detectFunctionCalls()`: Detecta padrões de function calls na resposta do agente
  - `executeDetectedFunctions()`: Executa funções usando um callback fornecido
  - `formatFunctionResults()`: Formata resultados para enviar de volta ao agente

#### Arquivos Modificados

**`src/types.ts`**:
- Adicionado tipo `ToolExecutor`: Callback para executar tools
- Adicionado `toolExecutor?: ToolExecutor` em `StackSpotConfig`
- Adicionado `enableFunctionCalling?: boolean` em `StackSpotConfig`

**`src/resources/runs.ts`**:
- Adicionado suporte a `toolExecutor` e `enableFunctionCalling` no construtor
- Integrada detecção automática de function calls após receber resposta do StackSpot
- Execução automática de funções detectadas
- Criação de follow-up run para processar resultados

**`src/resources/threads.ts`**:
- Adicionado suporte a `toolExecutor` e `enableFunctionCalling` no construtor
- Passa esses parâmetros para `Runs`

**`src/stackspot.ts`**:
- Passa `toolExecutor` e `enableFunctionCalling` para `Threads` na inicialização

**`src/index.ts`**:
- Exporta `functionCallParser` e outros utilitários

### 2. Serviço Principal (`src/`)

#### Arquivos Modificados

**`src/llm/adapters/StackSpotAdapter.ts`**:
- Importa `executeTool` do `agentManager`
- Cria `toolExecutor` que conecta ao `executeTool` do servidor
- Passa `toolExecutor` e `enableFunctionCalling: true` ao criar o SDK

**`src/server.ts`**:
- **Removido**: Import de `functionCallParser`
- **Removido**: Toda a lógica de detecção e execução de function calls (linhas ~2136-2163)
- **Simplificado**: `waitForRunCompletion` agora apenas aguarda a conclusão (function calling é automático no SDK)

#### Arquivos Removidos
- **`src/utils/functionCallParser.ts`**: Movido para o SDK

## Como Funciona

1. **Inicialização**: Quando `StackSpotAdapter` é criado, ele:
   - Cria um `toolExecutor` que chama `executeTool` do servidor
   - Passa esse executor para o SDK StackSpot

2. **Execução de Run**: Quando um run é executado no SDK:
   - SDK recebe resposta do StackSpot API
   - SDK detecta automaticamente function calls na resposta
   - SDK executa as funções usando o `toolExecutor` fornecido
   - SDK envia resultados de volta ao agente em um follow-up run
   - SDK retorna a resposta final processada

3. **Serviço Principal**: O serviço apenas:
   - Aguarda a conclusão do run
   - Recebe a resposta final (já processada pelo SDK)

## Vantagens

✅ **Encapsulamento**: Toda a lógica de function calling está no SDK
✅ **Reutilização**: O SDK pode ser usado em outros projetos sem depender do serviço
✅ **Manutenibilidade**: Mudanças no function calling não afetam o código do serviço
✅ **Testabilidade**: O SDK pode ser testado independentemente
✅ **Separação de Responsabilidades**: SDK cuida de function calling, serviço cuida de orquestração

## Uso

O function calling funciona automaticamente quando:
- `toolExecutor` é fornecido na configuração do SDK
- `enableFunctionCalling` é `true` (padrão quando `toolExecutor` está presente)

Não é necessário fazer nada no código do serviço - tudo é automático!

## Compatibilidade

- ✅ Mantém compatibilidade com código existente
- ✅ Não quebra nenhuma funcionalidade
- ✅ Function calling continua funcionando como antes
- ✅ Agora está encapsulado no SDK

