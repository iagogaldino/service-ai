# 🚀 Teste Rápido - Passo a Passo

## Para testar o acesso a arquivos:

### 1️⃣ Terminal 1: Inicie o Servidor Principal

```bash
cd C:\Users\iago_\Desktop\Projects\ServiceIA
npm run dev
```

Aguarde até ver:
```
✅ Servidor rodando na porta 3000
🌐 Acesse http://localhost:3000 para testar
```

### 2️⃣ Terminal 2: Execute o Teste

```bash
cd C:\Users\iago_\Desktop\Projects\ServiceIA\sdk-stackspot
npm run test:file-access
```

### 3️⃣ Resultado Esperado

Você deve ver:
```
✅ Conectado ao servidor principal
📤 Enviando mensagem ao agente...
⏳ Aguardando resposta do agente...
📄 Resposta do agente:
────────────────────────────────────────────────────────
[Conteúdo do package.json será mostrado aqui]
────────────────────────────────────────────────────────
✅ Teste concluído com sucesso!
```

---

## ⚠️ Se der erro:

1. **"connect_error"**: Servidor não está rodando
   - Verifique se o Terminal 1 está com o servidor ativo
   - Verifique se a porta 3000 está livre

2. **"Timeout"**: Servidor não respondeu
   - Verifique se o servidor está processando mensagens
   - Verifique os logs do servidor no Terminal 1

3. **Agente não acessa arquivo**: 
   - Verifique se o agente tem `tools: ["fileSystem"]` no `agents.json`
   - Verifique se o caminho do arquivo está correto

