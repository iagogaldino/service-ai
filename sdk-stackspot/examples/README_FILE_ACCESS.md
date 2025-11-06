# 📂 Exemplo: Acesso a Diretórios e Arquivos via Socket.IO

Este exemplo demonstra como usar Socket.IO para conectar ao servidor principal e permitir que o agente acesse diretórios e arquivos do projeto através das ferramentas de filesystem.

## 🎯 Objetivo

Mostrar como o agente pode:
- Listar arquivos de um diretório
- Ler conteúdo de arquivos específicos
- Analisar estrutura de diretórios
- Buscar arquivos por nome

## 🚀 Como Executar

### Opção 1: Usando npm script
```bash
cd sdk-stackspot
npm run example:file-access
```

### Opção 2: Executar diretamente
```bash
cd sdk-stackspot
npx ts-node examples/file-access-example.ts
```

## ⚙️ Configuração

O exemplo usa variáveis de ambiente ou valores padrão:

```typescript
const stackspot = new StackSpot({
  clientId: process.env.STACKSPOT_CLIENT_ID || 'seu-client-id',
  clientSecret: process.env.STACKSPOT_CLIENT_SECRET || 'seu-client-secret',
  realm: process.env.STACKSPOT_REALM || 'stackspot-freemium',
});

const agentId = process.env.STACKSPOT_AGENT_ID || 'seu-agent-id';
```

### Configurar via variáveis de ambiente:

**Windows (PowerShell):**
```powershell
$env:STACKSPOT_CLIENT_ID="seu-client-id"
$env:STACKSPOT_CLIENT_SECRET="seu-client-secret"
$env:STACKSPOT_AGENT_ID="seu-agent-id"
npm run example:file-access
```

**Linux/Mac:**
```bash
export STACKSPOT_CLIENT_ID="seu-client-id"
export STACKSPOT_CLIENT_SECRET="seu-client-secret"
export STACKSPOT_AGENT_ID="seu-agent-id"
npm run example:file-access
```

## 📋 O que o exemplo faz

1. **Lista arquivos do diretório raiz**
   - Envia mensagem pedindo para listar arquivos de `C:\Users\...\ServiceIA`
   - O agente usa a ferramenta `listDirectory` para responder

2. **Lê conteúdo de um arquivo**
   - Solicita leitura do `package.json`
   - O agente usa a ferramenta `readFile` para ler e retornar o conteúdo

3. **Analisa estrutura de diretório**
   - Pede análise do diretório `src/`
   - O agente lista arquivos e subdiretórios

4. **Busca arquivo por nome**
   - Solicita busca por arquivos `config.json`
   - O agente usa `findFile` para localizar

## ⚠️ Requisitos

1. **Servidor principal deve estar rodando:**
   ```bash
   cd C:\Users\iago_\Desktop\Projects\ServiceIA
   npm run dev
   ```

2. **O agente deve estar configurado com ferramentas de filesystem:**
   - `listDirectory` - Listar arquivos de um diretório
   - `readFile` - Ler conteúdo de arquivo
   - `findFile` - Buscar arquivo por nome
   
3. **O agente deve ter permissão para acessar os diretórios do projeto**

## 📝 Notas

- **Este exemplo usa Socket.IO** para conectar ao servidor principal (não chama a API diretamente)
- O exemplo usa caminhos absolutos do Windows (`C:\Users\...`)
- Para Linux/Mac, ajuste os caminhos conforme necessário
- O agente precisa estar configurado no `agents.json` com `stackspotAgentId` correto
- As ferramentas de filesystem devem estar habilitadas no agente
- O servidor principal (`src/server.ts`) precisa estar rodando para as ferramentas funcionarem

## 🔍 Exemplo de Resposta Esperada

```
📂 Exemplo 1: Listando arquivos do diretório raiz do projeto...

🤖 Resposta do agente:
Os arquivos e diretórios no diretório C:\Users\...\ServiceIA são:
- client/
- config.json
- package.json
- sdk-stackspot/
- src/
- README.md
...
```

## 🐛 Troubleshooting

**Erro: "Run falhou"**
- Verifique se o `agentId` está correto
- Confirme que o agente tem ferramentas de filesystem habilitadas

**Erro: "Thread não encontrada"**
- O storage pode não estar funcionando corretamente
- Verifique se o diretório `data/` existe e tem permissões de escrita

**Agente não acessa arquivos**
- Confirme que o agente está configurado com `tools: ["fileSystem"]`
- Verifique se o caminho do arquivo está correto (absoluto ou relativo)

