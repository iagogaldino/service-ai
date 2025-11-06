# 🔧 Como Function Calling Funciona no StackSpot

## 📋 Visão Geral

Como o StackSpot não suporta function calling nativo, implementamos um **parser automático** que detecta quando o agente quer executar ferramentas e as executa automaticamente.

## 🎯 Como Funciona

### 1. Agente Responde
O agente StackSpot responde normalmente, mas pode mencionar ferramentas no formato:
```
write_file path=C:\Users\...\arquivo.txt content=conteúdo aqui
```

### 2. Parser Detecta
O sistema detecta automaticamente padrões como:
- `write_file path=... content=...`
- `read_file path=...`
- `list_directory dirPath=...`
- `find_file fileName=...`
- `execute_command command=...`

### 3. Funções São Executadas
As funções são executadas localmente no servidor.

### 4. Resultados Enviados de Volta
Os resultados são enviados de volta ao agente em uma nova mensagem.

### 5. Agente Processa Resultados
O agente recebe os resultados e pode continuar a tarefa.

## 📝 Formatos Suportados

### Formato 1: Simples (Recomendado)
```
write_file path=C:\Users\...\package.json content={"name": "test"}
```

### Formato 2: JSON Explícito
```
[TOOL:write_file]
{"filePath": "C:\\Users\\...\\package.json", "content": "{\"name\": \"test\"}"}
[/TOOL]
```

### Formato 3: Múltiplas Linhas
```
write_file
path=C:\Users\...\server.ts
content=import express from 'express';
const app = express();
...
```

## 🚀 Exemplo de Uso

### Mensagem do Usuário:
```
Crie um servidor Express em C:\Users\...\teste
```

### Resposta do Agente (com function calling):
```
Vou criar o servidor Express. Primeiro vou criar o package.json:

write_file path=C:\Users\...\teste\package.json content={"name": "teste", "dependencies": {"express": "^4.18.2"}}

Agora vou criar o server.ts:

write_file path=C:\Users\...\teste\server.ts content=import express from 'express';...
```

### O Sistema:
1. ✅ Detecta `write_file` na resposta
2. ✅ Executa a função automaticamente
3. ✅ Envia resultados de volta ao agente
4. ✅ Agente confirma criação dos arquivos

## ⚙️ Configuração

### Ativar Function Calling Automático

O sistema está **ativado por padrão** quando você usa o provider StackSpot.

### Desativar (se necessário)

No `src/server.ts`, comente a seção:
```typescript
// if (llmAdapter.provider === 'stackspot') {
//   const functionCalls = detectFunctionCalls(responseMessage);
//   ...
// }
```

## 📊 Limitações

1. **Precisão**: O parser depende de padrões na resposta do agente
2. **Múltiplas Chamadas**: Suporta múltiplas funções na mesma resposta
3. **Loop Infinito**: O sistema limita a 1 iteração de follow-up por segurança

## 🔍 Debug

Para ver o que está sendo detectado, verifique os logs do servidor:
```
🔧 Detectadas 2 chamada(s) de função na resposta do StackSpot
🔧 Executando função detectada: write_file { filePath: '...', content: '...' }
✅ Função write_file executada com sucesso
📤 Enviando 2 resultado(s) de volta ao agente StackSpot...
```

## 💡 Dicas

1. **Instrua o agente** a usar o formato correto nas instruções do `agents.json`
2. **Teste com mensagens simples** primeiro
3. **Verifique os logs** se as funções não estão sendo detectadas
4. **Use formato JSON explícito** para maior precisão

---

**Status**: ✅ Implementado e Funcional

