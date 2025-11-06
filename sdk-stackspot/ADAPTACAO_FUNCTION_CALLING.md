# 🔧 Adaptação: Function Calling para StackSpot

## 📋 Problema

StackSpot não suporta function calling nativo como OpenAI. Quando o agente quer executar uma ferramenta (ex: `write_file`), ele apenas menciona na resposta, mas não executa automaticamente.

## 💡 Solução Proposta

Implementar um **parser de intenções** que:
1. Analisa a resposta do agente StackSpot
2. Detecta quando o agente quer executar uma ferramenta
3. Extrai os parâmetros da chamada
4. Executa a ferramenta localmente
5. Envia o resultado de volta ao agente em uma nova mensagem
6. Repete até que a tarefa seja concluída

## 🎯 Abordagem

### Opção 1: Parser de Resposta (Recomendado)

Analisar a resposta do agente e detectar padrões como:
- `write_file path=... content=...`
- `read_file path=...`
- `list_directory dirPath=...`

### Opção 2: Instruções Especiais no Prompt

Instruct o agente a formatar chamadas de função de forma específica:
```
Para executar uma função, use o formato:
[TOOL:function_name]
args: {"param1": "value1", "param2": "value2"}
[/TOOL]
```

### Opção 3: Pós-processamento Automático

Após receber a resposta do StackSpot:
1. Verificar se contém menções a ferramentas
2. Se sim, executar automaticamente
3. Enviar resultado como nova mensagem

## 🚀 Implementação Sugerida

Criar um módulo `FunctionCallParser` que:
- Detecta padrões de chamadas de função
- Valida parâmetros
- Executa ferramentas
- Retorna resultados formatados

