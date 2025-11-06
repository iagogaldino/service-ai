# Como Executar os Exemplos

## 1. Instalar Dependências

```bash
cd sdk-stackspot
npm install
```

## 2. Configurar Credenciais

Edite o arquivo do exemplo que deseja executar e configure suas credenciais:

```typescript
const stackspot = new StackSpot({
  clientId: 'SEU_CLIENT_ID',
  clientSecret: 'SEU_CLIENT_SECRET',
  realm: 'stackspot-freemium',
});
```

E também configure o ID do agente:

```typescript
const agentId = 'SEU_AGENT_ID'; // ID do agente criado no painel StackSpot
```

## 3. Executar os Exemplos

### Exemplo Básico
```bash
npm run example:basic
```

### Exemplo de Thread ID
```bash
npm run example:thread-id
```

### Exemplo de Comparação com OpenAI
```bash
npm run example:comparison
```

## 4. Executar Manualmente (Alternativa)

Se preferir executar diretamente com ts-node:

```bash
# Instalar ts-node globalmente (se ainda não tiver)
npm install -g ts-node

# Executar exemplo
npx ts-node examples/basic-usage.ts
```

## 5. Compilar e Executar (Alternativa)

```bash
# Compilar o SDK
npm run build

# Executar o exemplo compilado (se você compilar os exemplos também)
node dist/examples/basic-usage.js
```

## Arquivos de Exemplo

- `examples/basic-usage.ts` - Exemplo completo de uso básico
- `examples/thread-id-usage.ts` - Exemplo de uso de thread_id
- `examples/comparison-openai.ts` - Comparação com OpenAI SDK

## Notas

- Certifique-se de ter Node.js 16+ instalado
- As credenciais devem ser válidas do StackSpot
- O agente ID deve existir no seu painel StackSpot
