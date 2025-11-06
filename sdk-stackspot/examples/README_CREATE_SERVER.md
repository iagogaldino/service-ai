# 📝 Teste: Criar Servidor Express

Este teste verifica se o agente consegue gerar o código necessário para criar um servidor Express simples.

## ⚠️ Limitação Importante

**StackSpot não suporta function calling nativo**, então o agente não pode executar as ferramentas (`write_file`) automaticamente. 

O agente irá:
- ✅ Gerar o código completo dos arquivos
- ✅ Fornecer instruções de como criar
- ❌ **NÃO** criar os arquivos automaticamente

## 🚀 Como Executar

```bash
cd sdk-stackspot
npm run test:create-server
```

## 📋 O que o Teste Faz

1. Conecta ao servidor principal via Socket.IO
2. Envia mensagem pedindo para criar um servidor Express
3. O agente gera o código de:
   - `package.json` - Dependências e scripts
   - `server.ts` - Servidor Express básico
   - `tsconfig.json` - Configuração TypeScript
   - `README.md` - Instruções de uso

## 📝 Como Usar o Código Gerado

Após executar o teste:

1. **Copie o código** da resposta do agente
2. **Crie o diretório** (se não existir):
   ```bash
   mkdir C:\Users\iago_\Desktop\guinhogood\testesdkstackspot
   ```
3. **Crie os arquivos** manualmente com o código fornecido
4. **Instale as dependências**:
   ```bash
   cd C:\Users\iago_\Desktop\guinhogood\testesdkstackspot
   npm install
   ```
5. **Execute o servidor**:
   ```bash
   npm run dev
   ```

## 🔄 Alternativa: Usar OpenAI

Se você precisar que os arquivos sejam criados automaticamente, use o provider OpenAI que suporta function calling nativo:

1. Configure o provider como `openai` no `config.json`
2. O agente poderá executar `write_file` automaticamente
3. Os arquivos serão criados sem intervenção manual

## 📊 Resultado Esperado

O teste deve mostrar:
- ✅ Código completo do `package.json`
- ✅ Código completo do `server.ts`
- ✅ Código completo do `tsconfig.json`
- ✅ Código completo do `README.md`
- ⚠️ Nota sobre limitação do StackSpot

---

**Conclusão**: O teste valida que o agente consegue gerar código completo e funcional, mas a criação automática de arquivos requer function calling (disponível apenas no OpenAI).

