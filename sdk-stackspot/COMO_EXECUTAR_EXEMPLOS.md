# 🚀 Como Executar os Exemplos

## 📋 Pré-requisitos

1. Certifique-se de estar no diretório do SDK:
```bash
cd sdk-stackspot
```

2. Instale as dependências (se ainda não instalou):
```bash
npm install
```

3. **IMPORTANTE**: Para exemplos de acesso a arquivos, o servidor principal precisa estar rodando:
```bash
# Em outro terminal
cd C:\Users\iago_\Desktop\Projects\ServiceIA
npm run dev
```

## 🎯 Opções de Execução

### Opção 1: Teste Rápido de Acesso a Arquivos (Recomendado)

Testa se o agente consegue ler um arquivo via Socket.IO:

```bash
npm run test:file-access
```

**O que faz:**
- Conecta ao servidor principal via Socket.IO
- Envia mensagem pedindo para ler `package.json`
- Mostra a resposta do agente com o conteúdo lido

**⚠️ Requisito**: Servidor principal rodando (`npm run dev`)

---

### Opção 2: Exemplo Completo de Acesso a Arquivos

Demonstra múltiplas operações com arquivos via Socket.IO:

```bash
npm run example:file-access
```

**O que faz:**
- Lista arquivos do diretório raiz
- Lê conteúdo de `package.json`
- Analisa estrutura do diretório `src/`
- Busca arquivos `config.json`

**⚠️ Requisito**: Servidor principal rodando (`npm run dev`)

---

### Opção 3: Exemplo Básico (SDK Direto)

Exemplo simples de conversa usando o SDK diretamente (não precisa do servidor):

```bash
npm run example:basic
```

**O que faz:**
- Cria thread e envia mensagem
- Recebe resposta do agente
- Demonstra uso básico do SDK

---

### Opção 4: Executar Diretamente com ts-node

Se preferir executar diretamente:

```bash
# Teste rápido (via Socket.IO)
npx ts-node examples/quick-file-test.ts

# Exemplo completo (via Socket.IO)
npx ts-node examples/file-access-example.ts

# Exemplo básico (SDK direto)
npx ts-node examples/basic-usage.ts
```

---

## ⚙️ Configuração (Opcional)

Os exemplos usam valores padrão, mas você pode configurar via variáveis de ambiente:

### Windows (PowerShell):
```powershell
$env:STACKSPOT_CLIENT_ID="seu-client-id"
$env:STACKSPOT_CLIENT_SECRET="seu-client-secret"
$env:STACKSPOT_AGENT_ID="seu-agent-id"
npm run test:file-access
```

### Linux/Mac:
```bash
export STACKSPOT_CLIENT_ID="seu-client-id"
export STACKSPOT_CLIENT_SECRET="seu-client-secret"
export STACKSPOT_AGENT_ID="seu-agent-id"
npm run test:file-access
```

---

## 📝 O que Esperar

### Saída do Teste Rápido (via Socket.IO):
```
🚀 Teste Rápido: Acesso a Arquivo via Socket.IO

⚠️  Certifique-se de que o servidor principal está rodando (npm run dev)

📁 Arquivo a ser lido: C:\Users\...\ServiceIA\package.json

✅ Conectado ao servidor principal

📤 Enviando mensagem ao agente...
   Mensagem: "Leia o arquivo: C:\Users\...\package.json"

⏳ Aguardando resposta do agente...

📄 Resposta do agente:
────────────────────────────────────────────────────────────────────────────────
[Conteúdo do arquivo package.json lido pelo agente]
────────────────────────────────────────────────────────────────────────────────

📊 Tokens: 150

✅ Teste concluído com sucesso!
```

---

## ⚠️ Troubleshooting

### Erro: "Cannot find module socket.io-client"
```bash
# Instale as dependências
cd sdk-stackspot
npm install
```

### Erro: "connect_error" ou "Erro ao conectar ao servidor"
- **Certifique-se de que o servidor principal está rodando:**
  ```bash
  cd C:\Users\iago_\Desktop\Projects\ServiceIA
  npm run dev
  ```
- Verifique se o servidor está na porta 3000
- Verifique se não há firewall bloqueando a conexão

### Erro: "Run falhou" ou "403 Forbidden"
- Verifique se o `agentId` está correto no código ou variável de ambiente
- Confirme que o agente tem ferramentas de filesystem habilitadas
- Verifique as credenciais (Client ID e Client Secret)

### Agente não acessa arquivos
- Confirme que o agente está configurado com `tools: ["fileSystem"]` no `agents.json`
- Verifique se o caminho do arquivo está correto
- Certifique-se de que o servidor principal está processando as mensagens corretamente

---

## 🎯 Diferença entre os Exemplos

### Exemplos via Socket.IO (Acesso a Arquivos)
- `test:file-access` - Teste rápido
- `example:file-access` - Exemplo completo
- **Requisito**: Servidor principal rodando
- **Funcionalidade**: Acesso a filesystem funciona ✅

### Exemplos SDK Direto (Conversa Básica)
- `example:basic` - Conversa simples
- **Requisito**: Apenas credenciais do StackSpot
- **Funcionalidade**: Acesso a filesystem NÃO funciona ❌

---

## 💡 Dicas

- **Para testar acesso a arquivos**: Use os exemplos via Socket.IO
- **Para testar o SDK**: Use `example:basic` (não precisa do servidor)
- **Para desenvolvimento**: Mantenha o servidor rodando em um terminal separado
- Os exemplos via Socket.IO usam caminhos absolutos do Windows
- Para Linux/Mac, ajuste os caminhos nos arquivos de exemplo

---

## 🚀 Fluxo Completo de Teste

1. **Terminal 1**: Inicie o servidor principal
   ```bash
   cd C:\Users\iago_\Desktop\Projects\ServiceIA
   npm run dev
   ```

2. **Terminal 2**: Execute o teste
   ```bash
   cd sdk-stackspot
   npm run test:file-access
   ```

3. **Resultado**: O agente deve ler o arquivo e mostrar o conteúdo!
