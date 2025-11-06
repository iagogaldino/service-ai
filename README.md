# ServiceIA

Projeto Node.js com TypeScript que integra Socket.IO com a **Assistants API da OpenAI** para comunicação em tempo real com agentes inteligentes.

## 🚀 Tecnologias

- **Node.js** - Runtime JavaScript
- **TypeScript** - Superset do JavaScript com tipagem estática
- **Socket.IO** - Biblioteca para comunicação WebSocket em tempo real
- **OpenAI Assistants API** - SDK de Agentes da OpenAI com threads persistentes
- **Express** - Framework web para Node.js

## 📋 Pré-requisitos

- Node.js (versão 16 ou superior)
- npm ou yarn

## 🛠️ Instalação

1. Clone o repositório ou navegue até a pasta do projeto

2. Instale as dependências:
```bash
npm install
```

3. Configure a API key:
   - Inicie o servidor: `npm run dev`
   - Acesse `http://localhost:3000` no navegador
   - Clique no botão "⚙️ Config" e configure sua API key da OpenAI
   - A configuração será salva automaticamente em `config.json`

## 🎯 Como usar

### Modo Desenvolvimento
```bash
npm run dev
```

### Modo Produção
```bash
npm run build
npm start
```

O servidor estará rodando em `http://localhost:3000`

## 📡 Como funciona

1. O cliente se conecta ao servidor via Socket.IO
2. Uma **thread** é criada automaticamente para cada conexão (mantém contexto da conversa)
3. O cliente envia mensagens através do socket (ex: "Hello")
4. O servidor adiciona a mensagem à thread e cria um **run** para processar
5. O **assistente** (agente) processa a mensagem usando a Assistants API
6. A resposta da IA é enviada de volta ao cliente através do mesmo canal socket
7. O contexto da conversa é mantido na thread para cada conexão

### ✨ Recursos da Assistants API

- **Threads Persistentes**: Cada conexão tem sua própria thread que mantém o histórico da conversa
- **Agentes Inteligentes**: Usa GPT-4 Turbo para respostas mais inteligentes
- **Contexto Mantido**: O assistente lembra do contexto da conversa anterior
- **Gerenciamento Automático**: O assistente é criado automaticamente na primeira execução
- **Navegação de Arquivos**: O agente pode navegar, ler e analisar arquivos do projeto

### 🗂️ Funcionalidades de Navegação de Arquivos

O agente possui três ferramentas principais para trabalhar com arquivos:

1. **`list_directory`** - Lista arquivos e diretórios em um caminho específico
   - Exemplo: "Liste os arquivos na pasta src"
   
2. **`read_file`** - Lê o conteúdo completo de um arquivo
   - Exemplo: "Leia o arquivo src/server.ts"
   
3. **`find_file`** - Procura arquivos por nome no projeto
   - Exemplo: "Encontre arquivos chamados main.ts"

**Exemplo de uso:**
- "Me explique o que tem no código de main.ts"
- "Qual é a estrutura do projeto?"
- "Analise o arquivo server.ts e me diga o que ele faz"

## 🌐 Cliente Web

Acesse `http://localhost:3000` no seu navegador para usar a interface web que permite:
- Conectar ao servidor via Socket.IO
- Enviar mensagens para a IA
- Receber respostas em tempo real
- Ver o status da conexão

## 📝 Exemplo de uso

### Cliente HTML (já incluído)
O projeto inclui um cliente HTML que se conecta automaticamente ao servidor.

### Exemplo programático
```javascript
const io = require('socket.io-client');
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Conectado!');
  
  socket.emit('message', { message: 'Hello' });
});

socket.on('response', (data) => {
  console.log('Resposta:', data.message);
});
```

## 📁 Estrutura do Projeto

```
ServiceIA/
├── src/
│   └── server.ts          # Servidor Socket.IO com integração OpenAI
├── client/
│   └── index.html         # Cliente web de exemplo
├── dist/                  # Arquivos compilados (TypeScript)
├── package.json
├── tsconfig.json
├── config.json            # Configurações da aplicação (criado via frontend)
└── README.md
```

## ⚙️ Configuração

### Configuração via Frontend
A aplicação utiliza `config.json` para armazenar configurações. Configure através da interface web:
- `openaiApiKey`: Sua chave da API OpenAI (necessária para Assistants API)
- `port`: Porta do servidor (padrão: 3000)

### Assistente
O assistente é criado automaticamente na primeira execução com:
- **Nome**: ServiceIA Assistant
- **Modelo**: GPT-4 Turbo Preview
- **Instruções**: Assistente especializado em analisar e navegar por projetos de código
- **Tools**: Funções para listar diretórios, ler arquivos e procurar arquivos

Você pode personalizar o assistente editando a função `getOrCreateAssistant()` em `src/server.ts`.

### Segurança de Arquivos
- ✅ Acesso restrito apenas ao diretório raiz do projeto
- ✅ Proteção contra acesso a arquivos fora do projeto (path traversal)
- ✅ Limite de 1MB por arquivo
- ✅ Ignora automaticamente `node_modules`, `.git` e `dist`

## 🔒 Segurança

⚠️ **Importante**: Nunca commite o arquivo `config.json` no repositório. Ele está no `.gitignore` por padrão.

## 📄 Licença

ISC

