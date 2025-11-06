# 📂 Explicação: Acesso a Arquivos

## ⚠️ Problema Identificado

Quando executamos `npm run test:file-access`, o agente respondeu:

> "Desculpe, mas não tenho acesso direto ao sistema de arquivos do seu computador"

### Por quê isso acontece?

1. **O SDK chama diretamente a API do StackSpot**
   - O exemplo usa `stackspot.beta.threads.runs.create()` que chama a API do StackSpot diretamente
   - A API do StackSpot não tem acesso às ferramentas de filesystem do seu computador

2. **As ferramentas estão no servidor principal**
   - `read_file`, `list_directory`, `find_file` estão implementadas em `src/server.ts`
   - Elas só funcionam quando executadas no servidor principal

3. **StackSpot não suporta function calling nativo**
   - Diferente do OpenAI, o StackSpot não tem suporte nativo a function calling
   - As ferramentas precisam ser executadas localmente no servidor

## ✅ Solução: Usar o Servidor Principal

Para que o agente acesse arquivos, você precisa:

### Opção 1: Usar o Frontend (Recomendado)

1. Inicie o servidor principal:
   ```bash
   cd C:\Users\iago_\Desktop\Projects\ServiceIA
   npm run dev
   ```

2. Acesse o frontend:
   ```
   http://localhost:3000
   ```

3. No chat, envie a mensagem:
   ```
   Leia o arquivo: C:\Users\iago_\Desktop\Projects\ServiceIA\package.json
   ```

### Opção 2: Usar Socket.IO diretamente

Crie um script que conecta ao servidor via Socket.IO:

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  socket.emit('message', {
    message: 'Leia o arquivo: C:\\Users\\iago_\\Desktop\\Projects\\ServiceIA\\package.json'
  });
});

socket.on('response', (data) => {
  console.log('Resposta:', data.message);
  socket.disconnect();
});
```

## 🔍 Como Funciona

```
┌─────────────────┐
│   SDK StackSpot │  ← Chama API diretamente (sem acesso a filesystem)
│  (exemplo atual)│
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  API StackSpot  │  ← Não tem acesso ao seu computador
└─────────────────┘

┌─────────────────┐
│ Servidor        │  ← Tem acesso às ferramentas de filesystem
│ Principal       │
│ (src/server.ts) │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Ferramentas    │  ← read_file, list_directory, etc.
│  Filesystem     │
└─────────────────┘
```

## 📝 Resumo

- ✅ **SDK funciona**: Consegue criar threads, runs e receber respostas
- ❌ **Acesso a arquivos não funciona via SDK direto**: Precisa do servidor principal
- ✅ **Acesso a arquivos funciona via servidor**: Através do frontend ou Socket.IO

## 🎯 Próximos Passos

1. **Para testar acesso a arquivos**: Use o frontend em `http://localhost:3000`
2. **Para testar o SDK**: Use `npm run example:basic` (funciona perfeitamente)
3. **Para criar exemplo que acessa arquivos**: Use Socket.IO para conectar ao servidor principal

---

**Conclusão**: O SDK está funcionando corretamente! O problema é que as ferramentas de filesystem precisam ser executadas no servidor principal, não diretamente na API do StackSpot.

