# Sistema de Agentes Reutilizável

Este sistema permite criar e gerenciar múltiplos agentes especializados de forma fácil e reutilizável.

## 📁 Estrutura

```
src/
├── agents/
│   ├── config.ts          # Configuração dos agentes
│   ├── agentManager.ts    # Gerenciador de agentes
│   └── README.md          # Esta documentação
├── tools/
│   └── fileSystemTools.ts # Ferramentas disponíveis para agentes
└── server.ts              # Servidor principal
```

## 🚀 Como Funciona

### 1. Seleção Automática de Agentes

O sistema analisa a mensagem do usuário e automaticamente seleciona o agente mais apropriado baseado em palavras-chave e contexto.

### 2. Agentes Disponíveis

#### Code Analyzer
- **Quando usar**: Perguntas sobre arquivos, código, análise de projetos
- **Ferramentas**: Acesso a list_directory, read_file, find_file
- **Palavras-chave**: arquivo, código, main.ts, analise, leia, lista, encontre

#### General Assistant
- **Quando usar**: Conversas gerais, dúvidas diversas
- **Ferramentas**: Nenhuma (apenas conversação)
- **Palavras-chave**: Padrão (usado quando nenhum outro agente se aplica)

## ➕ Como Adicionar um Novo Agente

### Passo 1: Editar `config.ts`

Adicione a configuração do novo agente no array `agentsConfig`:

```typescript
{
  name: 'Meu Novo Agente',
  description: 'Descrição do que o agente faz',
  instructions: `Instruções detalhadas para o agente...
  O que ele deve fazer, como deve se comportar, etc.`,
  model: 'gpt-4-turbo-preview', // ou outro modelo
  tools: [], // Array de ferramentas disponíveis
  shouldUse: (message: string) => {
    // Lógica para determinar quando usar este agente
    const lowerMessage = message.toLowerCase();
    const keywords = ['palavra1', 'palavra2', 'palavra3'];
    return keywords.some(keyword => lowerMessage.includes(keyword));
  }
}
```

### Passo 2: Criar Ferramentas (Opcional)

Se seu agente precisar de ferramentas personalizadas, crie um novo arquivo em `src/tools/`:

```typescript
// src/tools/myCustomTools.ts
export const myCustomFunctions = {
  async minhaFuncao(param: string): Promise<string> {
    // Implementação
    return 'resultado';
  }
};

export const myTools = [
  {
    type: 'function' as const,
    function: {
      name: 'minha_funcao',
      description: 'Descrição da função',
      parameters: {
        type: 'object',
        properties: {
          param: {
            type: 'string',
            description: 'Descrição do parâmetro'
          }
        },
        required: ['param']
      }
    }
  }
];
```

Depois, atualize `agentManager.ts` para incluir a execução das novas ferramentas:

```typescript
export async function executeTool(functionName: string, args: any): Promise<string> {
  switch (functionName) {
    // ... casos existentes
    case 'minha_funcao':
      return await myCustomFunctions.minhaFuncao(args.param);
    default:
      return `Função desconhecida: ${functionName}`;
  }
}
```

### Passo 3: Importar no Config

No `config.ts`, importe as ferramentas:

```typescript
import { tools as myTools } from '../tools/myCustomTools';
```

E use no agente:

```typescript
tools: myTools,
```

## 📝 Exemplo Completo

### Agente de Tradução

```typescript
// Em config.ts
{
  name: 'Translation Agent',
  description: 'Especializado em traduzir textos entre idiomas',
  instructions: `Você é um tradutor profissional. 
  Traduza textos mantendo o contexto e o tom original.
  Se o usuário não especificar o idioma de destino, use português brasileiro.`,
  model: 'gpt-4-turbo-preview',
  tools: [],
  shouldUse: (message: string) => {
    const lowerMessage = message.toLowerCase();
    const keywords = ['traduz', 'translate', 'tradução', 'translation'];
    return keywords.some(keyword => lowerMessage.includes(keyword));
  }
}
```

### Agente de Matemática

```typescript
// Em config.ts
{
  name: 'Math Assistant',
  description: 'Especializado em resolver problemas matemáticos',
  instructions: `Você é um assistente matemático especializado.
  Resolva problemas passo a passo, mostrando todo o raciocínio.
  Use fórmulas apropriadas e explique cada etapa.`,
  model: 'gpt-4-turbo-preview',
  tools: [],
  shouldUse: (message: string) => {
    const lowerMessage = message.toLowerCase();
    const keywords = ['calcule', 'calcular', 'matemática', 'math', 'equação', 'fórmula'];
    const hasNumbers = /\d/.test(message);
    return keywords.some(keyword => lowerMessage.includes(keyword)) || hasNumbers;
  }
}
```

## 🎯 Boas Práticas

1. **Nomes Descritivos**: Use nomes claros para os agentes
2. **Palavras-chave Específicas**: Seja específico nas palavras-chave para evitar conflitos
3. **Instruções Claras**: Escreva instruções detalhadas para o agente
4. **Ordem Importante**: Agentes mais específicos devem vir antes do agente geral
5. **Teste**: Teste diferentes mensagens para garantir que o agente correto é selecionado

## 🔧 Debugging

Para ver qual agente está sendo usado, verifique os logs do servidor:

```
🤖 Usando agente: "Code Analyzer" - Agente especializado em analisar...
```

Ou no cliente, você verá uma mensagem indicando qual agente foi selecionado.

## 📚 Referências

- [OpenAI Assistants API](https://platform.openai.com/docs/assistants)
- [Function Calling](https://platform.openai.com/docs/guides/function-calling)

