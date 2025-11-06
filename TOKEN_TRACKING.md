# 💰 Tracking de Tokens

## 📋 Visão Geral

O sistema agora rastreia automaticamente o uso de tokens durante interações com os agentes e retorna essa informação junto com a resposta final para o frontend.

## 🔧 Implementação

### Backend

O sistema captura o uso de tokens de cada run do Assistants API e acumula os valores de todas as iterações (incluindo quando há tool calls). As informações são retornadas no evento `response` do Socket.IO.

### Estrutura de Dados

```typescript
interface TokenUsage {
  promptTokens: number;      // Tokens usados no prompt/entrada
  completionTokens: number;  // Tokens usados na resposta/saída
  totalTokens: number;        // Total de tokens (prompt + completion)
}
```

### Eventos do Servidor

O sistema emite três tipos de eventos relacionados a tokens:

#### 1. Evento `token_usage` (em tempo real)
Emitido sempre que tokens são utilizados em um run:

```javascript
socket.on('token_usage', (data) => {
  // data.tokens - Tokens desta mensagem/run específica
  // data.accumulated - Total acumulado na thread
  console.log('Tokens desta mensagem:', data.tokens.totalTokens);
  console.log('Total acumulado:', data.accumulated.totalTokens);
});
```

#### 2. Evento `agent_message` (com tokens acumulados)
Cada mensagem do agente inclui tokens acumulados:

```javascript
socket.on('agent_message', (data) => {
  if (data.tokenUsage) {
    console.log('Mensagem:', data.message);
    console.log('Tokens acumulados:', data.tokenUsage.totalTokens);
  }
});
```

#### 3. Evento `response` (resposta final)
Inclui tokens da mensagem atual e total acumulado:

```javascript
socket.on('response', (data) => {
  // data.tokenUsage - Tokens desta mensagem específica
  // data.accumulatedTokenUsage - Total acumulado de todas as mensagens
  console.log('Tokens desta mensagem:', data.tokenUsage.totalTokens);
  console.log('Total acumulado na thread:', data.accumulatedTokenUsage.totalTokens);
});
```

## 📊 Exemplo de Uso no Frontend

### JavaScript/TypeScript

```javascript
// Conecta ao servidor
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Conectado ao servidor');
  
  // Envia mensagem
  socket.emit('message', { 
    message: 'Olá, como você está?' 
  });
});

// Recebe tokens em tempo real a cada mensagem/run
socket.on('token_usage', (data) => {
  const { tokens, accumulated } = data;
  
  console.log(`💰 Tokens desta mensagem: ${tokens.totalTokens}`);
  console.log(`  - Prompt: ${tokens.promptTokens}`);
  console.log(`  - Completion: ${tokens.completionTokens}`);
  
  console.log(`💰 Total acumulado: ${accumulated.totalTokens}`);
  console.log(`  - Prompt: ${accumulated.promptTokens}`);
  console.log(`  - Completion: ${accumulated.completionTokens}`);
});

// Recebe mensagens do agente (inclui tokens acumulados)
socket.on('agent_message', (data) => {
  if (data.type === 'assistant' && data.tokenUsage) {
    console.log('Mensagem:', data.message);
    console.log(`Tokens acumulados até agora: ${data.tokenUsage.totalTokens}`);
  }
});

// Recebe resposta final com informações completas de tokens
socket.on('response', (data) => {
  const { message, tokenUsage, accumulatedTokenUsage, agentName, originalMessage } = data;
  
  // Exibe a resposta
  console.log('Resposta:', message);
  console.log('Agente:', agentName);
  
  // Tokens desta mensagem específica
  if (tokenUsage) {
    console.log(`💰 Tokens desta mensagem: ${tokenUsage.totalTokens}`);
    console.log(`  - Prompt: ${tokenUsage.promptTokens}`);
    console.log(`  - Completion: ${tokenUsage.completionTokens}`);
  }
  
  // Total acumulado de todas as mensagens na thread
  if (accumulatedTokenUsage) {
    console.log(`💰 Total acumulado na thread: ${accumulatedTokenUsage.totalTokens}`);
    console.log(`  - Prompt: ${accumulatedTokenUsage.promptTokens}`);
    console.log(`  - Completion: ${accumulatedTokenUsage.completionTokens}`);
    
    // Exemplo: Calcular custo estimado (valores são exemplos)
    const costPer1kTokens = 0.01; // $0.01 por 1000 tokens (exemplo)
    const estimatedCost = (accumulatedTokenUsage.totalTokens / 1000) * costPer1kTokens;
    console.log(`  - Custo estimado total: $${estimatedCost.toFixed(4)}`);
  }
});
```

### HTML/Exemplo Visual

```html
<!DOCTYPE html>
<html>
<head>
  <title>Token Tracking Example</title>
  <style>
    .message {
      margin: 10px 0;
      padding: 10px;
      border-left: 3px solid #007bff;
      background: #f8f9fa;
    }
    .token-info {
      font-size: 0.9em;
      color: #666;
      margin-top: 5px;
    }
    .token-badge {
      display: inline-block;
      background: #28a745;
      color: white;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.8em;
      margin-left: 10px;
    }
    #total-tokens {
      position: fixed;
      bottom: 10px;
      right: 10px;
      background: #007bff;
      color: white;
      padding: 15px;
      border-radius: 5px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    }
  </style>
</head>
<body>
  <div id="chat-container"></div>
  <div id="total-tokens">
    <strong>Total Acumulado:</strong><br>
    <span id="total-token-count">0</span> tokens
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();
    const chatContainer = document.getElementById('chat-container');
    const totalTokenCount = document.getElementById('total-token-count');
    let accumulatedTokens = 0;

    // Recebe tokens em tempo real
    socket.on('token_usage', (data) => {
      accumulatedTokens = data.accumulated.totalTokens;
      totalTokenCount.textContent = accumulatedTokens;
    });

    // Recebe mensagens do agente (com tokens)
    socket.on('agent_message', (data) => {
      if (data.type === 'assistant') {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        
        let tokenBadge = '';
        if (data.tokenUsage) {
          tokenBadge = `<span class="token-badge">${data.tokenUsage.totalTokens} tokens</span>`;
        }
        
        messageDiv.innerHTML = `
          <strong>Agente:</strong> ${data.message}${tokenBadge}
          ${data.tokenUsage ? `<div class="token-info">Tokens acumulados: ${data.tokenUsage.totalTokens}</div>` : ''}
        `;
        chatContainer.appendChild(messageDiv);
      }
    });

    // Recebe resposta final
    socket.on('response', (data) => {
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message';
      messageDiv.style.borderLeftColor = '#28a745';
      
      let tokenInfo = '';
      if (data.tokenUsage && data.accumulatedTokenUsage) {
        tokenInfo = `
          <div class="token-info">
            <strong>Tokens desta mensagem:</strong> ${data.tokenUsage.totalTokens} 
            (Prompt: ${data.tokenUsage.promptTokens}, Completion: ${data.tokenUsage.completionTokens})<br>
            <strong>Total acumulado na thread:</strong> ${data.accumulatedTokenUsage.totalTokens}
            (Prompt: ${data.accumulatedTokenUsage.promptTokens}, Completion: ${data.accumulatedTokenUsage.completionTokens})
          </div>
        `;
        accumulatedTokens = data.accumulatedTokenUsage.totalTokens;
        totalTokenCount.textContent = accumulatedTokens;
      }
      
      messageDiv.innerHTML = `
        <strong>Resposta Final:</strong> ${data.message}
        ${tokenInfo}
      `;
      chatContainer.appendChild(messageDiv);
    });

    function sendMessage(message) {
      socket.emit('message', { message });
    }
  </script>
</body>
</html>
```

## 📈 Exibição de Tokens

### Formato Simples
```javascript
`Tokens: ${tokenUsage.totalTokens}`
```

### Formato Detalhado
```javascript
`Tokens: ${tokenUsage.totalTokens} (Prompt: ${tokenUsage.promptTokens}, Completion: ${tokenUsage.completionTokens})`
```

### Formato com Custo Estimado
```javascript
function calculateCost(tokenUsage, modelPricing) {
  const promptCost = (tokenUsage.promptTokens / 1000) * modelPricing.promptPer1k;
  const completionCost = (tokenUsage.completionTokens / 1000) * modelPricing.completionPer1k;
  return promptCost + completionCost;
}

// Exemplo de preços (valores são exemplos)
const gpt4Pricing = {
  promptPer1k: 0.03,      // $0.03 por 1000 tokens de prompt
  completionPer1k: 0.06   // $0.06 por 1000 tokens de completion
};

const cost = calculateCost(tokenUsage, gpt4Pricing);
console.log(`Custo estimado: $${cost.toFixed(4)}`);
```

## 🔍 Logs no Servidor

O servidor também registra informações de tokens no console:

```
💰 Tokens utilizados neste run: 225 (prompt: 150, completion: 75)
💰 Total de tokens utilizados: 225 (prompt: 150, completion: 75)
```

## 📝 Notas Importantes

1. **Múltiplas Iterações**: Se um run requer múltiplas chamadas de tools, os tokens são acumulados de todas as iterações.

2. **Disponibilidade**: O uso de tokens só está disponível quando o run está `completed`. Durante iterações intermediárias (como `requires_action`), o uso ainda não está disponível.

3. **Precisão**: Os valores são fornecidos diretamente pela API da OpenAI e são precisos.

4. **Custo**: O cálculo de custo precisa ser feito no frontend com base nos preços atuais do modelo usado. Os preços podem variar por modelo.

## 🎯 Casos de Uso

- **Monitoramento de Custos**: Acompanhar o consumo de tokens para estimar custos
- **Otimização**: Identificar interações que consomem muitos tokens
- **Transparência**: Mostrar ao usuário quantos tokens foram utilizados
- **Análise**: Coletar dados sobre padrões de uso

