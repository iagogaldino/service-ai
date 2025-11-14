# 📋 Resumo: Carregamento de Agentes do Backend

## ✅ O que foi adicionado ao plano

### 1. **Carregamento Inicial de Agentes**
- Ao abrir a aplicação, busca todos os agentes do backend via `GET /api/agents/config`
- Transforma cada agente em nó do React Flow
- Renderiza agentes no canvas automaticamente
- Permite visualizar e editar agentes existentes

### 2. **Sincronização Bidirecional**

#### Backend → React Flow (Carregamento)
```
1. Aplicação inicia
2. GET /api/agents/config
3. Transforma agentes em nós
4. Renderiza no canvas
5. Usuário pode editar
```

#### React Flow → Backend (Deploy)
```
1. Usuário clica "Deploy"
2. Coleta nós "agent" do canvas
3. Para cada agente:
   - Verifica se existe no backend (nome + grupo)
   - Se existe → UPDATE (PUT)
   - Se não existe → CREATE (POST)
4. Backend atualiza agents.json
5. Feedback visual
```

### 3. **Detecção de Mudanças**
- **Agente novo**: Nó no canvas sem correspondente no backend → CREATE
- **Agente existente**: Nó no canvas com mesmo nome e grupo → UPDATE
- **Agente deletado**: Agente no backend sem nó correspondente → DELETE (opcional)

## 📦 Arquivos que serão criados/modificados

### Novos Arquivos
1. `src/services/apiService.ts` - Comunicação com backend
2. `src/utils/agentTransformer.ts` - Transformação de dados

### Arquivos Modificados
1. `src/types/index.ts` - Adicionar campos faltantes
2. `src/components/AgentConfigPanel.tsx` - Adicionar campos (description, groupId, priority, shouldUse)
3. `src/App.tsx` - Carregamento inicial e deploy
4. `src/components/TopBar.tsx` - Conectar botão Deploy

## 🔄 Fluxo Completo

### Inicialização
```typescript
// App.tsx
useEffect(() => {
  const loadAgents = async () => {
    const backendNodes = await loadAgentsFromBackend(getAgentsConfig);
    setAllNodes([startNode, ...backendNodes]);
  };
  loadAgents();
}, []);
```

### Deploy
```typescript
// App.tsx
const handleDeploy = async () => {
  const agentNodes = allNodes.filter(node => node.data.type === 'agent');
  const hierarchy = await getAgentsConfig();
  
  for (const node of agentNodes) {
    const config = node.data.config!;
    const existing = findExistingAgent(config.name, config.groupId, hierarchy);
    
    if (existing) {
      await updateAgent(config.groupId, config.name, transformAgentForBackend(config));
    } else {
      await createAgent(config.groupId, transformAgentForBackend(config));
    }
  }
};
```

## ✅ Funcionalidades

1. ✅ **Carregar agentes existentes** do backend na inicialização
2. ✅ **Renderizar agentes** no React Flow como nós
3. ✅ **Editar agentes existentes** via AgentConfigPanel
4. ✅ **Criar novos agentes** visualmente no canvas
5. ✅ **Deploy**: Sincronizar mudanças com o backend (create/update)
6. ✅ **Detectar agentes existentes** (create vs update)
7. ✅ **Feedback visual** (loading, sucesso, erros)

## 🎯 Próximos Passos

1. Implementar `apiService.ts` com todas as funções
2. Implementar `agentTransformer.ts` com transformações
3. Atualizar tipos em `types/index.ts`
4. Adicionar campos no `AgentConfigPanel`
5. Implementar carregamento inicial no `App.tsx`
6. Implementar deploy no `App.tsx`
7. Conectar botão Deploy no `TopBar`

## 📝 Notas Importantes

- Agentes são carregados apenas uma vez na inicialização
- Deploy atualiza ou cria agentes conforme necessário
- Nome + Grupo identifica unicamente um agente
- Agentes podem ser editados localmente antes do deploy
- Feedback visual mostra sucesso/erro de cada operação

