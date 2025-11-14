import React, { useState, useCallback, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import BottomBar from './components/BottomBar';
import FlowCanvas from './components/FlowCanvas';
import AgentConfigPanel from './components/AgentConfigPanel';
import EdgeConfigPanel from './components/EdgeConfigPanel';
import WorkflowSelector from './components/WorkflowSelector';
import TestWorkflowPanel from './components/TestWorkflowPanel';
import ProjectModal from './components/ProjectModal';
import ProjectSelector from './components/ProjectSelector';
import { Node, Edge } from 'reactflow';
import { CustomNodeData, ComponentDefinition, AgentConfig } from './types';
import { loadAgentsFromBackend, transformAgentForBackend, findExistingAgent, validateAgentConfig } from './utils/agentTransformer';
import { getAgentsConfig, createAgent, updateAgent, deleteAgent, ApiError, AgentsFile } from './services/apiService';
import { saveWorkflow, loadWorkflow, mergeWorkflowWithBackendAgents, loadEdges } from './utils/workflowStorage';
import { Workflow, createWorkflow, updateWorkflow, getActiveWorkflow, convertReactFlowToWorkflow, listWorkflows } from './services/workflowService';
import { getActiveProject, Project } from './services/projectService';
import { logToBackend, info, warn, error } from './services/frontendLogger';

function App() {
  const [selectedNode, setSelectedNode] = useState<Node<CustomNodeData> | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [allNodes, setAllNodes] = useState<Node<CustomNodeData>[]>([]);
  const [allEdges, setAllEdges] = useState<Edge[]>([]);
  const [currentTool, setCurrentTool] = useState<'pan' | 'select'>('select');
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deploySuccess, setDeploySuccess] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [showWorkflowSelector, setShowWorkflowSelector] = useState(false);
  const [showTestWorkflow, setShowTestWorkflow] = useState(false);
  const [isClosingTestWorkflow, setIsClosingTestWorkflow] = useState(false);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [showProjectSelector, setShowProjectSelector] = useState(true);
  const [isCheckingProject, setIsCheckingProject] = useState(true);
  
  // Estados para rastreamento visual do workflow
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [completedNodeIds, setCompletedNodeIds] = useState<Set<string>>(new Set());
  const [activeEdgeId, setActiveEdgeId] = useState<string | null>(null);
  const [completedEdgeIds, setCompletedEdgeIds] = useState<Set<string>>(new Set());

  // Handler para quando projeto é selecionado
  const handleProjectSelected = async (projectId: string) => {
    try {
      const { getProject } = await import('./services/projectService');
      const project = await getProject(projectId);
      setCurrentProject(project);
      setShowProjectSelector(false);
      setIsCheckingProject(false);
      console.log('✅ Projeto selecionado:', project.name);
    } catch (err) {
      console.error('Erro ao carregar projeto selecionado:', err);
    }
  };

  // Carregar agentes do backend na inicialização (apenas se houver projeto)
  useEffect(() => {
    // Só carrega agentes se houver projeto ativo
    if (!currentProject || isCheckingProject) {
      return;
    }

    const loadAgents = async () => {
      try {
        setIsLoadingAgents(true);
        
        // 1. Carrega agentes do backend
        const backendNodes = await loadAgentsFromBackend(getAgentsConfig, allNodes);
        
        // 2. Tenta carregar workflows do projeto ativo primeiro, depois do localStorage
        let savedEdges: Edge[] = [];
        try {
          const { loadProjectWorkflows } = await import('./services/projectService');
          const { workflows, activeWorkflowId } = await loadProjectWorkflows();
          
          if (workflows && workflows.length > 0 && activeWorkflowId) {
            const activeWorkflow = workflows.find(w => w.id === activeWorkflowId);
            if (activeWorkflow && activeWorkflow.edges) {
              // Converte edges do workflow para formato React Flow
              savedEdges = activeWorkflow.edges.map(edge => ({
                id: edge.id,
                source: edge.source,
                target: edge.target,
                animated: edge.animated,
                label: edge.label,
                style: edge.style,
                data: {
                  condition: edge.condition,
                },
              }));
              console.log('✅ Workflows carregados do projeto:', {
                workflows: workflows.length,
                activeWorkflowId,
                edges: savedEdges.length,
              });
            }
          }
        } catch (error) {
          console.warn('⚠️ Erro ao carregar workflows do projeto, usando localStorage:', error);
        }
        
        // Fallback: carrega do localStorage se não encontrou no projeto
        if (savedEdges.length === 0) {
          savedEdges = loadEdges();
        }
        const edgesLogData = {
          edges: savedEdges.length,
          edgesDetails: savedEdges.map(e => ({ id: e.id, source: e.source, target: e.target }))
        };
        // Log removido para reduzir sobrecarga
        
        // 3. Cria nó "start" se não existir
        const startNode: Node<CustomNodeData> = {
          id: 'start',
          type: 'custom',
          position: { x: 100, y: 300 },
          data: { label: 'Start', type: 'start' },
        };
        
        // 4. Mescla agentes do backend com workflow salvo
        const { nodes: mergedNodes, edges: validEdges } = mergeWorkflowWithBackendAgents(
          [startNode, ...backendNodes],
          savedEdges
        );
        
        // 5. Define nós e edges iniciais
        console.log('📊 Definindo nós e edges iniciais:', {
          nodesCount: mergedNodes.length,
          edgesCount: validEdges.length,
          nodeIds: mergedNodes.map(n => `${n.id}(${n.data?.type})`).join(', '),
        });
        setAllNodes(mergedNodes);
        setAllEdges(validEdges);
        
        const workflowLogData = {
          nodes: mergedNodes.length,
          edges: validEdges.length,
          edgesSalvas: savedEdges.length,
          edgesCarregadas: savedEdges.length,
          nodeIds: mergedNodes.map(n => n.id),
          edgeDetails: validEdges.map(e => ({ id: e.id, source: e.source, target: e.target })),
          savedEdgeDetails: savedEdges.map(e => ({ id: e.id, source: e.source, target: e.target })),
        };
        // Log removido para reduzir sobrecarga
        
        // IMPORTANTE: Sempre salva as edges válidas (mesmo se forem 0, para manter sincronização)
        // Mas só salva se houve mudança ou se há edges válidas para preservar
        if (validEdges.length > 0 || savedEdges.length !== validEdges.length) {
          saveWorkflow(mergedNodes, validEdges);
        }
      } catch (error) {
        console.error('Erro ao carregar agentes:', error);
        
        // Mostra mensagem de erro mais detalhada
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        if (errorMessage.includes('conexão') || errorMessage.includes('conectar')) {
          console.warn('⚠️ Backend não está acessível. Verifique se está rodando em http://localhost:3000');
          // Mostra mensagem visual ao usuário
          setDeployError(
            `Backend não está acessível.\n\n` +
            `Por favor, verifique:\n` +
            `1. O backend está rodando? (npm run dev no diretório raiz)\n` +
            `2. A URL está correta? (padrão: http://localhost:3000)\n` +
            `3. Há problemas de CORS?\n\n` +
            `Erro: ${errorMessage}`
          );
        }
        
        // Fallback: tenta carregar do localStorage ou cria nó start
        const savedWorkflow = loadWorkflow();
        if (savedWorkflow && savedWorkflow.nodes.length > 0) {
          // Log removido para reduzir sobrecarga
          setAllNodes(savedWorkflow.nodes);
          setAllEdges(savedWorkflow.edges);
          // NÃO salva de novo para não sobrescrever com dados possivelmente corrompidos
        } else {
          // Se não há dados salvos, cria apenas o nó start
          const startNode: Node<CustomNodeData> = {
            id: 'start',
            type: 'custom',
            position: { x: 100, y: 300 },
            data: { label: 'Start', type: 'start' },
          };
          setAllNodes([startNode]);
          // Carrega edges do localStorage se existirem, senão usa array vazio
          const savedEdgesOnly = loadEdges();
          setAllEdges(savedEdgesOnly);
          // Log removido para reduzir sobrecarga
        }
      } finally {
        setIsLoadingAgents(false);
      }
    };

    loadAgents();
  }, [currentProject, isCheckingProject]);

  // Handler para quando projeto é criado (chamado pelo ProjectSelector)
  const handleProjectCreated = async (projectId: string) => {
    try {
      const { getProject } = await import('./services/projectService');
      const project = await getProject(projectId);
      setCurrentProject(project);
      setShowProjectSelector(false);
      setIsCheckingProject(false);
      console.log('✅ Projeto criado e ativado:', project.name);
    } catch (err) {
      console.error('Erro ao carregar projeto criado:', err);
    }
  };

  const handleNodeSelect = useCallback((node: Node<CustomNodeData> | null) => {
    // Buscar o nó atualizado da lista de nós
    if (node) {
      const updatedNode = allNodes.find(n => n.id === node.id) || node;
      setSelectedNode(updatedNode);
      setSelectedEdge(null); // Deselecionar edge quando selecionar nó
    } else {
      setSelectedNode(null);
    }
  }, [allNodes]);

  // Fechar painel de agente ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // Se clicar no painel do agente ou em um nó/edge, não fecha
      if (
        target.closest('[data-agent-panel]') ||
        target.closest('.react-flow__node') ||
        target.closest('.react-flow__edge')
      ) {
        return;
      }
      
      // Se houver um agente selecionado, fecha o painel
      if (selectedNode && selectedNode.data.type === 'agent') {
        setSelectedNode(null);
      }
    };

    if (selectedNode && selectedNode.data.type === 'agent') {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedNode]);

  const handleEdgeSelect = useCallback((edge: Edge | null) => {
    setSelectedEdge(edge);
    setSelectedNode(null); // Deselecionar nó quando selecionar edge
  }, []);

  const handleNodesUpdate = useCallback((nodes: Node<CustomNodeData>[]) => {
    setAllNodes(nodes);
    // Salva workflow automaticamente no localStorage quando mudar (com debounce)
    saveWorkflow(nodes, allEdges);
    
    // Atualizar selectedNode se ele ainda existir
    if (selectedNode) {
      const updatedNode = nodes.find(n => n.id === selectedNode.id);
      if (updatedNode) {
        setSelectedNode(updatedNode);
      }
    }
  }, [selectedNode, allEdges]);

  const handleEdgesUpdate = useCallback((edges: Edge[]) => {
    setAllEdges(edges);
    // Salva edges automaticamente no localStorage quando mudarem
    saveWorkflow(allNodes, edges);
  }, [allNodes]);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    // Chamar a função global de deletar edge
    if ((window as any).__deleteEdge) {
      (window as any).__deleteEdge(edgeId);
    }
    // Remover da lista local também
    setAllEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
    if (selectedEdge && selectedEdge.id === edgeId) {
      setSelectedEdge(null);
    }
  }, [selectedEdge]);

  const handleUpdateNode = useCallback((nodeId: string, config: AgentConfig) => {
    // Atualizar o nó na lista de nós
    setAllNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                config,
                label: config.name,
              },
            }
          : node
      )
    );
    // Atualizar o selectedNode se for o mesmo
    if (selectedNode && selectedNode.id === nodeId) {
      setSelectedNode({
        ...selectedNode,
        data: {
          ...selectedNode.data,
          config,
          label: config.name,
        },
      });
    }
  }, [selectedNode]);

  const handleDeleteNode = useCallback(async (nodeId: string) => {
    const nodeToDelete = allNodes.find(node => node.id === nodeId);
    
    // Se for um agente, deleta no backend também
    if (nodeToDelete && nodeToDelete.data.type === 'agent' && nodeToDelete.data.config) {
      const config = nodeToDelete.data.config;
      
      try {
        console.log(`🗑️ Deletando agente no backend: ${config.name}`);
        await deleteAgent(config.name);
        console.log(`✅ Agente ${config.name} deletado com sucesso no backend`);
      } catch (error) {
        console.error(`❌ Erro ao deletar agente ${config.name} no backend:`, error);
        // Continua com a remoção local mesmo se falhar no backend
        if (error instanceof ApiError) {
          alert(`Erro ao deletar agente no backend: ${error.message}`);
        } else {
          alert(`Erro ao deletar agente no backend. O agente foi removido apenas localmente.`);
        }
      }
    }
    
    // Chamar a função global de deletar nó
    if ((window as any).__deleteNode) {
      (window as any).__deleteNode(nodeId);
    }
    // Remover da lista local também
    setAllNodes((nds) => nds.filter((node) => node.id !== nodeId));
    // Remove edges conectadas a este nó
    setAllEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    if (selectedNode && selectedNode.id === nodeId) {
      setSelectedNode(null);
    }
  }, [selectedNode, allNodes]);

  const handleDragStart = useCallback((component: ComponentDefinition) => {
    // This is handled by the drag and drop in FlowCanvas
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      // Apply the previous state
    }
  }, [historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      // Apply the next state
    }
  }, [historyIndex, history.length]);

  // Função de deploy
  const handleDeploy = useCallback(async () => {
    try {
      setIsDeploying(true);
      setDeployError(null);
      setDeploySuccess(null);
      
      // 1. Coletar todos os nós do tipo "agent"
      const agentNodes = allNodes.filter(node => node.data.type === 'agent');
      
      if (agentNodes.length === 0) {
        setDeployError('Nenhum agente encontrado para deploy');
        setIsDeploying(false);
        return;
      }
      
      // 2. Buscar estrutura atual do backend (pode falhar se backend não estiver rodando)
      let agentsFile: AgentsFile;
      try {
        agentsFile = await getAgentsConfig();
      } catch (error) {
        console.error('Erro ao buscar estrutura do backend:', error);
        // Tenta fazer deploy mesmo assim (pode ser que o backend não esteja respondendo à API de config, mas responde a create/update)
        agentsFile = {
          agents: [],
          toolSets: {},
        };
        console.warn('⚠️ Não foi possível buscar estrutura do backend, tentando deploy mesmo assim...');
      }
      
      // 3. Validar configurações
      const validationErrors: Array<{ agent: string; errors: string[] }> = [];
      for (const node of agentNodes) {
        const config = node.data.config;
        if (!config) {
          validationErrors.push({
            agent: node.data.label || node.id,
            errors: ['Configuração do agente não encontrada'],
          });
          continue;
        }
        
        const errors = validateAgentConfig(config);
        if (errors.length > 0) {
          validationErrors.push({
            agent: config.name || node.id,
            errors,
          });
        }
      }
      
      if (validationErrors.length > 0) {
        const errorMessages = validationErrors.map(
          ({ agent, errors }) => `${agent}: ${errors.join(', ')}`
        ).join('\n');
        setDeployError(`Erros de validação:\n${errorMessages}`);
        return;
      }
      
      // 4. Identificar agentes que devem ser deletados (existem no backend mas não estão no canvas)
      const agentsInCanvas = new Set(
        agentNodes.map(node => {
          const config = node.data.config;
          if (!config) return null;
          return config.name;
        }).filter(Boolean) as string[]
      );
      
      const agentsToDelete: string[] = [];
      for (const agent of agentsFile.agents) {
        if (!agentsInCanvas.has(agent.name)) {
          agentsToDelete.push(agent.name);
        }
      }
      
      // 5. Para cada agente: criar ou atualizar
      const results: Array<{ type: 'created' | 'updated' | 'deleted'; agent: string }> = [];
      const errors: Array<{ agent: string; error: string }> = [];
      
      for (const node of agentNodes) {
        const config = node.data.config!;
        
        try {
          const backendAgent = transformAgentForBackend(config);
          
          // Verifica se agente já existe
          const existing = findExistingAgent(backendAgent.name, agentsFile!);
          
          if (existing) {
            // UPDATE
            await updateAgent(backendAgent.name, backendAgent);
            results.push({ type: 'updated', agent: backendAgent.name });
          } else {
            // CREATE
            await createAgent(backendAgent);
            results.push({ type: 'created', agent: backendAgent.name });
          }
        } catch (error) {
          console.error(`Erro ao processar agente ${config.name}:`, error);
          errors.push({
            agent: config.name || node.id,
            error: error instanceof ApiError ? error.message : 'Erro desconhecido',
          });
        }
      }
      
      // 6. Deletar agentes que não estão mais no canvas
      for (const name of agentsToDelete) {
        try {
          console.log(`🗑️ Deletando agente do deploy: ${name}`);
          await deleteAgent(name);
          results.push({ type: 'deleted', agent: name });
        } catch (error) {
          console.error(`Erro ao deletar agente ${name}:`, error);
          errors.push({
            agent: name,
            error: error instanceof ApiError ? error.message : 'Erro desconhecido',
          });
        }
      }
      
      // 7. Mostrar feedback
      const createdCount = results.filter(r => r.type === 'created').length;
      const updatedCount = results.filter(r => r.type === 'updated').length;
      const deletedCount = results.filter(r => r.type === 'deleted').length;
      const errorCount = errors.length;
      
      if (errorCount > 0) {
        const errorMessages = errors.map(({ agent, error }) => `${agent}: ${error}`).join('\n');
        setDeployError(`${errorCount} erro(s):\n${errorMessages}`);
      }
      
      if (createdCount > 0 || updatedCount > 0 || deletedCount > 0) {
        const parts = [];
        if (createdCount > 0) parts.push(`${createdCount} criado(s)`);
        if (updatedCount > 0) parts.push(`${updatedCount} atualizado(s)`);
        if (deletedCount > 0) parts.push(`${deletedCount} deletado(s)`);
        setDeploySuccess(
          `Deploy concluído! ${parts.join(', ')}.`
        );
        
        // 7.5. Salva workflow completo no backend ANTES de recarregar
        try {
          console.log('💾 Salvando workflow completo no backend...');
          
          // Converte nodes e edges para formato de workflow
          const workflowData = convertReactFlowToWorkflow(
            allNodes,
            allEdges,
            'Workflow Principal',
            'Workflow criado/atualizado via deploy'
          );
          
          // Verifica se já existe um workflow ativo
          // Nota: 404 é esperado quando não há workflow ativo - não é um erro
          let activeWorkflow: Workflow | null = null;
          try {
            activeWorkflow = await getActiveWorkflow();
          } catch (error: any) {
            // Se não existe workflow ativo (404), é normal - vamos criar/atualizar um novo
            if (error?.status === 404) {
              // 404 é esperado - não é um erro real
              console.log('📝 Nenhum workflow ativo encontrado, verificando workflows existentes...');
            } else {
              // Outros erros são reais e devem ser logados
              console.error('Erro ao buscar workflow ativo:', error);
            }
          }
          
          let savedWorkflow: Workflow;
          if (activeWorkflow) {
            // Atualiza workflow existente
            console.log(`📝 Atualizando workflow existente: ${activeWorkflow.id}`);
            savedWorkflow = await updateWorkflow(activeWorkflow.id, {
              ...workflowData,
              active: true, // Mantém como ativo
            });
          } else {
            // Verifica se existe algum workflow com o mesmo nome
            const workflows = await listWorkflows();
            const existingWorkflow = workflows.find(w => w.name === workflowData.name);
            
            if (existingWorkflow) {
              // Atualiza workflow existente
              console.log(`📝 Atualizando workflow existente: ${existingWorkflow.id}`);
              savedWorkflow = await updateWorkflow(existingWorkflow.id, {
                ...workflowData,
                active: true, // Ativa o workflow
              });
            } else {
              // Cria novo workflow
              console.log('✨ Criando novo workflow no backend...');
              savedWorkflow = await createWorkflow({
                ...workflowData,
                active: true, // Cria já como ativo
              });
            }
          }
          
          console.log('✅ Workflow salvo no backend:', {
            id: savedWorkflow.id,
            nodes: savedWorkflow.nodes.length,
            edges: savedWorkflow.edges.length,
          });
          
          // Salva também no projeto ativo
          try {
            const { saveProjectWorkflows } = await import('./services/projectService');
            // Carrega workflows existentes do projeto
            const { listWorkflows } = await import('./services/workflowService');
            const allWorkflows = await listWorkflows();
            await saveProjectWorkflows(allWorkflows, savedWorkflow.id);
            console.log('✅ Workflow salvo também no projeto ativo');
          } catch (projectError) {
            console.error('⚠️ Erro ao salvar workflow no projeto:', projectError);
          }
          
          // Salva também no localStorage como backup
          saveWorkflow(allNodes, allEdges);
          console.log('✅ Workflow salvo também no localStorage como backup');
          
        } catch (workflowError) {
          console.error('⚠️ Erro ao salvar workflow no backend:', workflowError);
          // Não bloqueia o deploy, apenas loga o erro
          // Mas ainda salva no localStorage como backup
          saveWorkflow(allNodes, allEdges);
        }
        
        // 8. Recarrega agentes do backend para sincronizar após deploy
        try {
          console.log('🔄 Recarregando agentes do backend após deploy...');
          
          // IMPORTANTE: Salva as edges atuais ANTES de recarregar (preserva conexões)
          const currentEdges = allEdges;
          console.log('📦 Preservando edges atuais:', { edges: currentEdges.length });
          
          const backendNodes = await loadAgentsFromBackend(getAgentsConfig, allNodes);
          
          const startNode: Node<CustomNodeData> = {
            id: 'start',
            type: 'custom',
            position: { x: 100, y: 300 },
            data: { label: 'Start', type: 'start' },
          };
          
          // Usa edges atuais em vez de carregar do localStorage
          const { nodes: mergedNodes, edges: validEdges } = mergeWorkflowWithBackendAgents(
            [startNode, ...backendNodes],
            currentEdges // Usa edges atuais, não do localStorage
          );
          
          setAllNodes(mergedNodes);
          setAllEdges(validEdges);
          
          console.log('✅ Agentes recarregados após deploy:', {
            nodes: mergedNodes.length,
            edges: validEdges.length,
            edgesAntes: currentEdges.length,
          });
        } catch (reloadError) {
          console.error('⚠️ Erro ao recarregar agentes após deploy:', reloadError);
          // Não mostra erro ao usuário, apenas loga
        }
      }
      
      // Limpar mensagens após 5 segundos
      setTimeout(() => {
        setDeploySuccess(null);
        setDeployError(null);
      }, 5000);
      
    } catch (error) {
      console.error('Erro no deploy:', error);
      setDeployError(
        error instanceof ApiError 
          ? error.message 
          : 'Erro ao fazer deploy. Verifique se o backend está rodando.'
      );
    } finally {
      setIsDeploying(false);
    }
  }, [allNodes]);

  // Mostra seletor de projetos se ainda não selecionou
  if (showProjectSelector || isCheckingProject) {
    return <ProjectSelector onProjectSelected={handleProjectSelected} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar 
        onDeploy={handleDeploy} 
        isDeploying={isDeploying}
        onToggleWorkflowSelector={() => setShowWorkflowSelector(!showWorkflowSelector)}
        showWorkflowSelector={showWorkflowSelector}
        onTestWorkflow={async () => {
          if (!showTestWorkflow) {
            // Reseta os efeitos visuais antes de abrir o painel de teste
            setActiveNodeId(null);
            setCompletedNodeIds(new Set());
            setActiveEdgeId(null);
            setCompletedEdgeIds(new Set());
            
            // Força uma atualização dos nós e edges para remover estilos visuais
            // Remove estilos customizados dos nós
            setAllNodes((nodes) =>
              nodes.map((node) => {
                const { border, boxShadow, opacity, backgroundColor, ...restStyle } = node.style || {};
                const newNode = { ...node };
                if (Object.keys(restStyle).length === 0) {
                  newNode.style = undefined;
                } else {
                  newNode.style = restStyle;
                }
                return newNode;
              })
            );
            
            // Remove estilos customizados das edges
            setAllEdges((edges) =>
              edges.map((edge) => {
                const { stroke, strokeWidth, ...restStyle } = edge.style || {};
                const newEdge = { ...edge };
                if (Object.keys(restStyle).length === 0) {
                  newEdge.style = undefined;
                } else {
                  newEdge.style = restStyle;
                }
                newEdge.animated = false;
                if (edge.markerEnd && (edge.markerEnd as any).color) {
                  newEdge.markerEnd = undefined;
                }
                return newEdge;
              })
            );
            
            // Salva o workflow antes de abrir o painel de teste
            try {
              console.log('💾 Salvando workflow antes de testar...');
              
              // Converte nodes e edges para formato de workflow
              const workflowData = convertReactFlowToWorkflow(
                allNodes,
                allEdges,
                'Workflow Principal',
                'Workflow salvo antes de teste'
              );
              
              // Verifica se já existe um workflow ativo
              let activeWorkflow: Workflow | null = null;
              try {
                activeWorkflow = await getActiveWorkflow();
              } catch (error: any) {
                if (error?.status !== 404) {
                  console.error('Erro ao buscar workflow ativo:', error);
                }
              }
              
              let savedWorkflow: Workflow;
              if (activeWorkflow) {
                // Atualiza workflow existente
                console.log(`📝 Atualizando workflow existente: ${activeWorkflow.id}`);
                savedWorkflow = await updateWorkflow(activeWorkflow.id, {
                  ...workflowData,
                  active: true,
                });
              } else {
                // Verifica se existe algum workflow com o mesmo nome
                const workflows = await listWorkflows();
                const existingWorkflow = workflows.find(w => w.name === workflowData.name);
                
                if (existingWorkflow) {
                  // Atualiza workflow existente
                  console.log(`📝 Atualizando workflow existente: ${existingWorkflow.id}`);
                  savedWorkflow = await updateWorkflow(existingWorkflow.id, {
                    ...workflowData,
                    active: true,
                  });
                } else {
                  // Cria novo workflow
                  console.log('✨ Criando novo workflow no backend...');
                  savedWorkflow = await createWorkflow({
                    ...workflowData,
                    active: true,
                  });
                }
              }
              
              console.log('✅ Workflow salvo no backend:', {
                id: savedWorkflow.id,
                nodes: savedWorkflow.nodes.length,
                edges: savedWorkflow.edges.length,
              });
              
              // Salva também no projeto ativo
              try {
                const { saveProjectWorkflows } = await import('./services/projectService');
                const allWorkflows = await listWorkflows();
                await saveProjectWorkflows(allWorkflows, savedWorkflow.id);
                console.log('✅ Workflow salvo também no projeto ativo');
              } catch (projectError) {
                console.error('⚠️ Erro ao salvar workflow no projeto:', projectError);
              }
              
              // Salva também no localStorage como backup
              saveWorkflow(allNodes, allEdges);
              console.log('✅ Workflow salvo também no localStorage como backup');
              
            } catch (workflowError) {
              console.error('⚠️ Erro ao salvar workflow antes de testar:', workflowError);
              // Não bloqueia a abertura do painel de teste, apenas loga o erro
              // Mas ainda salva no localStorage como backup
              saveWorkflow(allNodes, allEdges);
            }
            
            // Abre o painel de teste após salvar
            setShowTestWorkflow(true);
          }
        }}
        onEditMode={() => {
          if (showTestWorkflow) {
            setIsClosingTestWorkflow(true);
            setTimeout(() => {
              setShowTestWorkflow(false);
              setIsClosingTestWorkflow(false);
            }, 300);
          }
        }}
        isTestMode={showTestWorkflow}
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {showWorkflowSelector ? (
          <WorkflowSelector
            nodes={allNodes}
            edges={allEdges}
            onWorkflowSelect={(workflow) => {
              setSelectedWorkflow(workflow);
            }}
            onWorkflowLoad={(nodes, edges) => {
              setAllNodes(nodes);
              setAllEdges(edges);
            }}
          />
        ) : !showTestWorkflow ? (
          <Sidebar onDragStart={handleDragStart} />
        ) : null}
        <div style={{ flex: 1, position: 'relative' }}>
            {isLoadingAgents ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#9ca3af',
                fontSize: '14px',
              }}>
                Carregando agentes...
              </div>
            ) : (
              <FlowCanvas 
                onNodeSelect={handleNodeSelect} 
                selectedNode={selectedNode}
                onNodesUpdate={handleNodesUpdate}
                onNodeDelete={handleDeleteNode}
                onEdgeSelect={handleEdgeSelect}
                selectedEdge={selectedEdge}
                onEdgesUpdate={handleEdgesUpdate}
                initialNodes={allNodes}
                initialEdges={allEdges}
                activeNodeId={activeNodeId}
                completedNodeIds={completedNodeIds}
                activeEdgeId={activeEdgeId}
                completedEdgeIds={completedEdgeIds}
              />
            )}
            <BottomBar
              onToolChange={setCurrentTool}
              currentTool={currentTool}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={historyIndex > 0}
              canRedo={historyIndex < history.length - 1}
            />
        </div>
        {(showTestWorkflow || isClosingTestWorkflow) && (
          <>
            <div
              onClick={() => {
                setIsClosingTestWorkflow(true);
                setTimeout(() => {
                  setShowTestWorkflow(false);
                  setIsClosingTestWorkflow(false);
                }, 300);
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                zIndex: 999,
                cursor: 'default',
                animation: isClosingTestWorkflow ? 'fadeOut 0.3s ease-out' : 'fadeIn 0.3s ease-out',
                transition: 'background-color 0.3s ease-out',
              }}
            />
            <TestWorkflowPanel
              nodes={allNodes}
              edges={allEdges}
              isClosing={isClosingTestWorkflow}
              onClose={() => {
                setIsClosingTestWorkflow(true);
                setTimeout(() => {
                  setShowTestWorkflow(false);
                  setIsClosingTestWorkflow(false);
                  // Limpa estados de rastreamento ao fechar
                  setActiveNodeId(null);
                  setCompletedNodeIds(new Set());
                  setActiveEdgeId(null);
                  setCompletedEdgeIds(new Set());
                }, 300);
              }}
              onWorkflowEvent={(event) => {
                if (event.type === 'node_started' && event.nodeId) {
                  if (event.nodeId === '__clear__') {
                    // Limpa todos os estados quando um novo workflow inicia
                    setActiveNodeId(null);
                    setCompletedNodeIds(new Set());
                    setActiveEdgeId(null);
                    setCompletedEdgeIds(new Set());
                  } else {
                    setActiveNodeId(event.nodeId);
                  }
                } else if (event.type === 'node_completed' && event.nodeId) {
                  setCompletedNodeIds(prev => new Set(prev).add(event.nodeId!));
                  setActiveNodeId(null);
                } else if (event.type === 'edge_evaluated' && event.edgeId) {
                  if (event.conditionMet) {
                    setActiveEdgeId(event.edgeId);
                    // Marca edge como completada após um delay
                    setTimeout(() => {
                      setCompletedEdgeIds(prev => new Set(prev).add(event.edgeId!));
                      setActiveEdgeId(null);
                    }, 500);
                  }
                }
              }}
            />
          </>
        )}
        {selectedNode && selectedNode.data.type === 'agent' && (
          <AgentConfigPanel
            node={selectedNode}
            onUpdate={handleUpdateNode}
            onClose={() => setSelectedNode(null)}
            onDelete={handleDeleteNode}
          />
        )}
        {selectedEdge && (
          <EdgeConfigPanel
            edge={selectedEdge}
            sourceNode={allNodes.find(n => n.id === selectedEdge.source) || null}
            targetNode={allNodes.find(n => n.id === selectedEdge.target) || null}
            onClose={() => setSelectedEdge(null)}
            onDelete={handleDeleteEdge}
          />
        )}
      </div>
      
      {/* ProjectModal removido - agora é gerenciado pelo ProjectSelector */}
      {/* Mensagens de feedback */}
      {deploySuccess && (
        <div style={{
          position: 'fixed',
          top: '60px',
          right: '20px',
          padding: '12px 20px',
          backgroundColor: '#10b981',
          color: '#ffffff',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          zIndex: 10000,
          maxWidth: '400px',
        }}>
          {deploySuccess}
        </div>
      )}
      
      {deployError && (
        <div style={{
          position: 'fixed',
          top: '60px',
          right: '20px',
          padding: '12px 20px',
          backgroundColor: '#ef4444',
          color: '#ffffff',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          zIndex: 10000,
          maxWidth: '400px',
          whiteSpace: 'pre-wrap',
        }}>
          {deployError}
        </div>
      )}

    </div>
  );
}

export default App;

