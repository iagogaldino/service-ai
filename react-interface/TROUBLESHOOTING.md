# 🔧 Troubleshooting: Erro de Conexão com Backend

## ❌ Erro: "Recebido HTML em vez de JSON"

Este erro acontece quando o frontend recebe HTML (geralmente uma página de erro) em vez de JSON do backend.

### Causas Comuns

1. **Backend não está rodando**
   - O backend precisa estar rodando antes do frontend
   - Verifique se o servidor está rodando: `npm run dev` no diretório raiz

2. **URL da API incorreta**
   - Padrão: `http://localhost:3000`
   - Verifique se o backend está na porta 3000
   - Pode configurar via variável de ambiente: `VITE_API_URL`

3. **Problema de CORS**
   - O backend precisa permitir requisições do frontend
   - Verifique a configuração CORS no backend

### Soluções

#### 1. Verificar se o backend está rodando

```bash
# No diretório raiz do projeto
npm run dev
# Deve mostrar: "Servidor rodando em http://localhost:3000"
```

#### 2. Testar o endpoint manualmente

Abra no navegador ou use curl:

```bash
# Testar endpoint de agentes
curl http://localhost:3000/api/agents/config

# Ou abra no navegador
# http://localhost:3000/api/agents/config
```

Deve retornar JSON, não HTML.

#### 3. Configurar URL da API (se necessário)

Crie um arquivo `.env` no diretório `react-interface`:

```env
VITE_API_URL=http://localhost:3000
```

#### 4. Verificar CORS no backend

O backend deve permitir requisições do frontend. Verifique no `src/server.ts`:

```typescript
app.use(cors({
  origin: 'http://localhost:5173', // URL do frontend Vite
  credentials: true
}));
```

### Mensagens de Erro Melhoradas

O código agora mostra mensagens mais claras:

- ✅ **"Erro de conexão"** → Backend não está rodando
- ✅ **"Recebido HTML em vez de JSON"** → Endpoint incorreto ou backend retornando HTML
- ✅ **"HTTP 404"** → Endpoint não encontrado
- ✅ **"HTTP 500"** → Erro no servidor

### Debug

1. Abra o Console do navegador (F12)
2. Verifique a mensagem de erro completa
3. Veja a URL que está sendo chamada no Network tab
4. Verifique o que o backend está retornando

### Exemplo de Configuração

#### Backend (src/server.ts)
```typescript
const PORT = process.env.PORT || 3000;
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
```

#### Frontend (.env no react-interface)
```env
VITE_API_URL=http://localhost:3000
```

### Testando a Conexão

1. Abra o navegador
2. Acesse: `http://localhost:3000/api/agents/config`
3. Deve retornar JSON com a estrutura de agentes
4. Se retornar HTML, o backend não está configurado corretamente

