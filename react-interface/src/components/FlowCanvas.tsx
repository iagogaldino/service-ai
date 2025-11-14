import React, { useCallback, useRef, useEffect, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Background,
  Controls,
  ReactFlowProvider,
  useReactFlow,
  ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import '../reactflow.css';
import CustomNode from './CustomNode';
import { CustomNodeData, ComponentDefinition } from '../types';

const nodeTypes = {
  custom: CustomNode,
};

interface FlowCanvasProps {
  onNodeSelect: (node: Node<CustomNodeData> | null) => void;
  selectedNode: Node<CustomNodeData> | null;
  onNodesUpdate?: (nodes: Node<CustomNodeData>[]) => void;
  onNodeDelete?: (nodeId: string) => void;
  onEdgeSelect?: (edge: Edge | null) => void;
  selectedEdge: Edge | null;
  onEdgesUpdate?: (edges: Edge[]) => void;
  initialNodes?: Node<CustomNodeData>[];
  initialEdges?: Edge[];
  activeNodeId?: string | null;
  completedNodeIds?: Set<string>;
  activeEdgeId?: string | null;
  completedEdgeIds?: Set<string>;
}

const FlowCanvas: React.FC<FlowCanvasProps> = ({ 
  onNodeSelect, 
  selectedNode, 
  onNodesUpdate, 
  onNodeDelete, 
  onEdgeSelect, 
  selectedEdge, 
  onEdgesUpdate,
  initialNodes,
  initialEdges,
  activeNodeId,
  completedNodeIds = new Set(),
  activeEdgeId,
  completedEdgeIds = new Set(),
}) => {
  const [showControls, setShowControls] = useState(() => {
    const saved = localStorage.getItem('showFlowControls');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    const handleVisibilityChange = (event: CustomEvent) => {
      setShowControls(event.detail.showControls);
    };

    window.addEventListener('flowControlsVisibilityChanged', handleVisibilityChange as EventListener);
    
    return () => {
      window.removeEventListener('flowControlsVisibilityChanged', handleVisibilityChange as EventListener);
    };
  }, []);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  
  // Nós iniciais: usa os passados como prop ou cria nó "start" padrão
  const defaultNodes: Node<CustomNodeData>[] = [
    {
      id: 'start',
      type: 'custom',
      position: { x: 100, y: 300 },
      data: { label: 'Start', type: 'start' },
    },
  ];
  
  const [nodes, setNodes, onNodesChange] = useNodesState<CustomNodeData>(
    initialNodes || defaultNodes
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    initialEdges || []
  );
  
  // Log inicial dos nós
  useEffect(() => {
    console.log('[FlowCanvas] Estado inicial dos nós:', {
      nodesCount: nodes.length,
      nodeIds: nodes.map(n => `${n.id}(${n.data?.type})`).join(', '),
      initialNodesCount: initialNodes?.length || 0,
      initialNodeIds: initialNodes?.map(n => `${n.id}(${n.data?.type})`).join(', ') || 'nenhum',
    });
  }, []);
  const [hasInitialized, setHasInitialized] = useState(false);
  const previousEdgesRef = useRef<Edge[]>([]);
  const isSyncingRef = useRef(false);
  const isSyncingNodesRef = useRef(false);
  const lastInitialNodesRef = useRef<string>(''); // Para evitar loops infinitos
  const previousNodesRef = useRef<Node<CustomNodeData>[]>([]);

  // Aplica estilos visuais aos nós baseado no estado de execução
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        const isActive = activeNodeId === node.id;
        const isCompleted = completedNodeIds.has(node.id);
        
        // Cria uma cópia do nó com estilos atualizados
        const updatedNode = { ...node };
        
        if (isActive) {
          // Nó ativo: apenas efeito de skeleton, sem borda destacada
          // Remove estilos de borda para manter o design original
          const { border, boxShadow, ...restStyle } = node.style || {};
          updatedNode.style = restStyle;
          updatedNode.data = {
            ...node.data,
            isActive: true,
          };
        } else if (isCompleted) {
          // Nó completado: volta ao estilo original, sem borda destacada
          const { border, boxShadow, opacity, backgroundColor, ...restStyle } = node.style || {};
          updatedNode.style = restStyle;
          updatedNode.data = {
            ...node.data,
            isActive: false, // Remove efeito de skeleton quando completado
            isCompleted: true,
          };
        } else {
          // Remove completamente os estados visuais se não estiver ativo ou completado
          // Remove border, boxShadow e opacity customizados para voltar ao estado padrão
          const { border, boxShadow, opacity, backgroundColor, ...restStyle } = node.style || {};
          // Se não há outros estilos, remove completamente o objeto style
          if (Object.keys(restStyle).length === 0) {
            updatedNode.style = undefined;
          } else {
            updatedNode.style = restStyle;
          }
          updatedNode.data = {
            ...node.data,
            isActive: false,
            isCompleted: false,
          };
        }
        
        return updatedNode;
      })
    );
  }, [activeNodeId, completedNodeIds, setNodes]);

  // Aplica estilos visuais às edges baseado no estado de execução
  useEffect(() => {
    setEdges((eds) =>
      eds.map((edge) => {
        const isActive = activeEdgeId === edge.id;
        const isCompleted = completedEdgeIds.has(edge.id);
        
        const updatedEdge = { ...edge };
        
        if (isActive) {
          // Edge ativa: destaque com cor azul e animação
          updatedEdge.style = {
            ...edge.style,
            stroke: '#3b82f6',
            strokeWidth: 3,
          };
          updatedEdge.animated = true;
          updatedEdge.markerEnd = {
            type: 'arrowclosed',
            color: '#3b82f6',
          };
        } else if (isCompleted) {
          // Edge completada: destaque com cor verde
          updatedEdge.style = {
            ...edge.style,
            stroke: '#10b981',
            strokeWidth: 2,
          };
          updatedEdge.animated = false;
          updatedEdge.markerEnd = {
            type: 'arrowclosed',
            color: '#10b981',
          };
        } else {
          // Remove completamente os estados visuais
          // Remove stroke, strokeWidth e markerEnd customizados para voltar ao estado padrão
          const { stroke, strokeWidth, ...restStyle } = edge.style || {};
          // Se não há outros estilos, remove completamente o objeto style
          if (Object.keys(restStyle).length === 0) {
            updatedEdge.style = undefined;
          } else {
            updatedEdge.style = restStyle;
          }
          updatedEdge.animated = false;
          // Remove markerEnd customizado se existir
          if (edge.markerEnd && (edge.markerEnd as any).color) {
            updatedEdge.markerEnd = undefined;
          }
        }
        
        return updatedEdge;
      })
    );
  }, [activeEdgeId, completedEdgeIds, setEdges]);
  
  // Ref para armazenar a última chave de IDs processada (para evitar execuções desnecessárias)
  const lastProcessedIdsRef = useRef<string>('');
  
  // Sincronizar nós e edges iniciais quando forem fornecidos pela primeira vez
  useEffect(() => {
    // Cria uma chave baseada nos IDs dos nós para comparar
    const nodesIdsKey = initialNodes?.map(n => n.id).sort().join('|') || '';
    
    // Se a chave não mudou desde a última execução, ignora completamente
    if (nodesIdsKey && lastProcessedIdsRef.current === nodesIdsKey) {
      return;
    }
    
    if (initialNodes && initialNodes.length > 0 && !hasInitialized) {
      console.log('[FlowCanvas] Inicializando nós:', {
        nodesCount: initialNodes.length,
        nodeIds: initialNodes.map(n => `${n.id}(${n.data?.type})`).join(', '),
        nodePositions: initialNodes.map(n => `${n.id}: (${n.position.x}, ${n.position.y})`).join(', '),
      });
      
      // Corrige posições negativas ou inválidas
      const correctedNodes = initialNodes.map((node, index) => {
        // Se a posição é negativa ou muito grande, ajusta para uma posição válida
        let { x, y } = node.position;
        if (x < 0 || x > 10000) {
          x = 100 + (index * 200); // Posiciona horizontalmente
        }
        if (y < 0 || y > 10000) {
          y = 100 + (index * 150); // Posiciona verticalmente
        }
        
        if (x !== node.position.x || y !== node.position.y) {
          console.log(`[FlowCanvas] Corrigindo posição do nó ${node.id}: (${node.position.x}, ${node.position.y}) -> (${x}, ${y})`);
        }
        
        return {
          ...node,
          position: { x, y },
        };
      });
      
      // Atualiza a referência antes de setNodes para evitar loop (usa apenas IDs)
      const nodesIdsKey = correctedNodes.map(n => n.id).sort().join('|');
      lastInitialNodesRef.current = nodesIdsKey;
      lastProcessedIdsRef.current = nodesIdsKey;
      
      // Marca que estamos sincronizando de fora para não notificar de volta
      isSyncingNodesRef.current = true;
      setNodes(correctedNodes);
      previousNodesRef.current = [...correctedNodes];
      // Usa requestAnimationFrame para garantir que a flag seja resetada após o estado atualizar
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          isSyncingNodesRef.current = false;
        });
      });
      if (initialEdges && initialEdges.length > 0) {
        isSyncingRef.current = true;
        setEdges(initialEdges);
        previousEdgesRef.current = [...initialEdges];
        isSyncingRef.current = false;
      }
      setHasInitialized(true);
      console.log('[FlowCanvas] ✅ Inicialização concluída');
    } else if (initialNodes && initialNodes.length > 0 && hasInitialized) {
      // Compara apenas os IDs dos nós, não as posições (que podem mudar pelo ReactFlow)
      const nodesIdsKey = initialNodes.map(n => n.id).sort().join('|');
      
      // Se os IDs dos nós não mudaram desde a última atualização, não atualiza (evita loop)
      if (lastInitialNodesRef.current === nodesIdsKey || lastProcessedIdsRef.current === nodesIdsKey) {
        return;
      }
      
      // Verifica se realmente há mudança nos nós (comparando com os nós atuais)
      const currentNodesIds = nodes.map(n => n.id).sort().join('|');
      if (currentNodesIds === nodesIdsKey) {
        // Os mesmos nós já estão renderizados, apenas atualiza a referência
        lastInitialNodesRef.current = nodesIdsKey;
        lastProcessedIdsRef.current = nodesIdsKey;
        return;
      }
      
      console.log('[FlowCanvas] Atualizando nós após inicialização:', {
        nodesCount: initialNodes.length,
        nodeIds: initialNodes.map(n => `${n.id}(${n.data?.type})`).join(', '),
        nodePositions: initialNodes.map(n => `${n.id}: (${n.position.x}, ${n.position.y})`).join(', '),
        previousIds: lastInitialNodesRef.current,
        currentIds: currentNodesIds,
        newIds: nodesIdsKey,
      });
      
      // Corrige posições negativas ou inválidas também na atualização
      const correctedNodes = initialNodes.map((node, index) => {
        let { x, y } = node.position;
        if (x < 0 || x > 10000) {
          x = 100 + (index * 200);
        }
        if (y < 0 || y > 10000) {
          y = 100 + (index * 150);
        }
        
        if (x !== node.position.x || y !== node.position.y) {
          console.log(`[FlowCanvas] Corrigindo posição do nó ${node.id}: (${node.position.x}, ${node.position.y}) -> (${x}, ${y})`);
        }
        
        return {
          ...node,
          position: { x, y },
        };
      });
      
      // Atualiza a referência antes de setNodes para evitar loop (usa apenas IDs)
      lastInitialNodesRef.current = nodesIdsKey;
      lastProcessedIdsRef.current = nodesIdsKey;
      
      // Marca que estamos sincronizando de fora para não notificar de volta
      isSyncingNodesRef.current = true;
      setNodes(correctedNodes);
      previousNodesRef.current = [...correctedNodes];
      // Usa requestAnimationFrame para garantir que a flag seja resetada após o estado atualizar
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          isSyncingNodesRef.current = false;
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNodes, initialEdges]);
  
  // Sincronizar edges quando initialEdges mudar externamente (após inicialização)
  useEffect(() => {
    if (hasInitialized && initialEdges) {
      // Compara se as edges realmente mudaram comparando com as edges atuais
      const edgesChanged = 
        initialEdges.length !== edges.length ||
        initialEdges.some((edge, index) => {
          const currentEdge = edges[index];
          return !currentEdge || 
                 edge.id !== currentEdge.id ||
                 edge.source !== currentEdge.source ||
                 edge.target !== currentEdge.target;
        });
      
      if (edgesChanged) {
        // Marca que estamos sincronizando de fora para não notificar de volta
        isSyncingRef.current = true;
        setEdges(initialEdges);
        previousEdgesRef.current = [...initialEdges];
        // Usa requestAnimationFrame para garantir que a flag seja resetada após o estado atualizar
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            isSyncingRef.current = false;
          });
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEdges, hasInitialized]);

  // Sincronizar selectedNode com os nós
  useEffect(() => {
    if (selectedNode) {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === selectedNode.id ? selectedNode : node
        )
      );
    }
  }, [selectedNode, setNodes]);

  // Notificar mudanças nos nós (mas apenas se não estivermos sincronizando de fora)
  useEffect(() => {
    if (!hasInitialized) {
      // Não notifica mudanças durante inicialização para evitar sobrescrever dados válidos
      return;
    }
    
    // Se estamos sincronizando de fora, não notifica
    if (isSyncingNodesRef.current) {
      return;
    }
    
    // Compara com os nós anteriores para evitar notificações desnecessárias
    const nodesChanged = 
      previousNodesRef.current.length !== nodes.length ||
      previousNodesRef.current.some((prevNode, index) => {
        const currentNode = nodes[index];
        return !currentNode || 
               prevNode.id !== currentNode.id ||
               prevNode.position.x !== currentNode.position.x ||
               prevNode.position.y !== currentNode.position.y ||
               prevNode.data?.label !== currentNode.data?.label ||
               prevNode.selected !== currentNode.selected;
      });
    
    if (!nodesChanged) {
      // Não houve mudança real, não precisa fazer nada
      return;
    }
    
    // Se houve mudança, verifica se veio de sincronização externa
    // Compara se os nós são iguais aos initialNodes (sincronização externa)
    const isExternalSync = initialNodes && 
      initialNodes.length === nodes.length &&
      initialNodes.every((node, index) => {
        const currentNode = nodes[index];
        return currentNode && 
               node.id === currentNode.id &&
               node.position.x === currentNode.position.x &&
               node.position.y === currentNode.position.y;
      });
    
    if (isExternalSync) {
      // É uma sincronização externa, atualiza a referência sem notificar
      previousNodesRef.current = [...nodes];
      return;
    }
    
    // Mudança legítima do usuário, notifica o App
    if (onNodesUpdate) {
      previousNodesRef.current = [...nodes];
      onNodesUpdate(nodes);
    }
  }, [nodes, onNodesUpdate, hasInitialized, initialNodes]);

  // Notificar mudanças nas edges (mas apenas se já foi inicializado para evitar loop)
  useEffect(() => {
    if (!hasInitialized) {
      // Não notifica mudanças durante inicialização para evitar sobrescrever dados válidos
      return;
    }
    
    // Se estamos sincronizando de fora, não notifica
    if (isSyncingRef.current) {
      return;
    }
    
    // Compara com as edges anteriores para evitar notificações desnecessárias
    const edgesChanged = 
      previousEdgesRef.current.length !== edges.length ||
      previousEdgesRef.current.some((prevEdge, index) => {
        const currentEdge = edges[index];
        return !currentEdge || 
               prevEdge.id !== currentEdge.id ||
               prevEdge.source !== currentEdge.source ||
               prevEdge.target !== currentEdge.target;
      });
    
    if (!edgesChanged) {
      // Não houve mudança real, não precisa fazer nada
      return;
    }
    
    // Se houve mudança, verifica se veio de sincronização externa
    // Compara se as edges são iguais às initialEdges (sincronização externa)
    const isExternalSync = initialEdges && 
      initialEdges.length === edges.length &&
      initialEdges.every((edge, index) => {
        const currentEdge = edges[index];
        return currentEdge && 
               edge.id === currentEdge.id &&
               edge.source === currentEdge.source &&
               edge.target === currentEdge.target;
      });
    
    if (isExternalSync) {
      // É uma sincronização externa, atualiza a referência sem notificar
      previousEdgesRef.current = [...edges];
      return;
    }
    
    // Mudança legítima do usuário, notifica o App
    if (onEdgesUpdate) {
      previousEdgesRef.current = [...edges];
      onEdgesUpdate(edges);
    }
  }, [edges, onEdgesUpdate, hasInitialized, initialEdges]);

  // Expor função de deletar nó
  useEffect(() => {
    if (onNodeDelete) {
      // Criar uma referência para a função de deletar
      (window as any).__deleteNode = (nodeId: string) => {
        setNodes((nds) => nds.filter((node) => node.id !== nodeId));
        setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
        if (selectedNode?.id === nodeId) {
          onNodeSelect(null);
        }
      };
    }
    return () => {
      delete (window as any).__deleteNode;
    };
  }, [onNodeDelete, setNodes, setEdges, selectedNode, onNodeSelect]);

  // Expor função de deletar edge
  useEffect(() => {
    (window as any).__deleteEdge = (edgeId: string) => {
      setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
      if (selectedEdge?.id === edgeId && onEdgeSelect) {
        onEdgeSelect(null);
      }
    };
    return () => {
      delete (window as any).__deleteEdge;
    };
  }, [setEdges, selectedEdge, onEdgeSelect]);

  const onConnect = useCallback(
    (params: Connection) => {
      // Log removido para reduzir sobrecarga
      const newEdge = addEdge(params, edges);
      setEdges(newEdge);
      // Notifica imediatamente sobre a mudança
      if (onEdgesUpdate) {
        onEdgesUpdate(newEdge);
      }
    },
    [setEdges, edges, onEdgesUpdate]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      const componentData = event.dataTransfer.getData('application/reactflow');

      if (!componentData || !reactFlowBounds) {
        return;
      }

      try {
        const component: ComponentDefinition = JSON.parse(componentData);
        const position = {
          x: event.clientX - reactFlowBounds.left - 80,
          y: event.clientY - reactFlowBounds.top - 20,
        };

        // Configuração padrão para nós do tipo "agent"
        const defaultAgentConfig = component.id === 'agent' ? {
          config: {
            name: component.label || 'New Agent',
            description: `Agente ${component.label || 'New Agent'} criado no React Flow`,
            instructions: 'Você é um assistente útil e prestativo.',
            includeChatHistory: true,
            model: 'gpt-4-turbo-preview',
            tools: [],
            outputFormat: 'text' as const,
            groupId: 'filesystem-terminal',
            shouldUse: {
              type: 'default' as const,
            },
          },
        } : {};

        const newNode: Node<CustomNodeData> = {
          id: `${component.id}-${Date.now()}`,
          type: 'custom',
          position,
          data: {
            label: component.label,
            type: component.id,
            ...defaultAgentConfig,
          },
        };

        setNodes((nds) => nds.concat(newNode));
      } catch (error) {
        console.error('Error parsing component data:', error);
      }
    },
    [setNodes]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<CustomNodeData>) => {
      onNodeSelect(node);
    },
    [onNodeSelect]
  );

  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
    if (onEdgeSelect) {
      onEdgeSelect(null);
    }
  }, [onNodeSelect, onEdgeSelect]);

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      if (onEdgeSelect) {
        onEdgeSelect(edge);
      }
      onNodeSelect(null);
    },
    [onEdgeSelect, onNodeSelect]
  );

  // Callback para quando o ReactFlow é inicializado
  const onInit = useCallback((reactFlowInstance: ReactFlowInstance) => {
    console.log('[FlowCanvas] ReactFlow inicializado, ajustando viewport...');
    reactFlowInstanceRef.current = reactFlowInstance;
    // Aguarda um pouco para garantir que os nós foram renderizados
    setTimeout(() => {
      // Ajusta viewport para incluir todos os nós
      reactFlowInstance.fitView({ 
        padding: 0.2, 
        duration: 0, // Sem animação para ajuste imediato
        includeHiddenNodes: false,
        minZoom: 0.1,
        maxZoom: 2,
      });
      console.log('[FlowCanvas] ✅ Viewport ajustado (onInit)');
      
      // Força um segundo ajuste após um pequeno delay para garantir que tudo está renderizado
      setTimeout(() => {
        reactFlowInstance.fitView({ 
          padding: 0.2, 
          duration: 400,
          includeHiddenNodes: false,
          minZoom: 0.1,
          maxZoom: 2,
        });
        console.log('[FlowCanvas] ✅ Viewport ajustado novamente (onInit delay)');
      }, 100);
    }, 300);
  }, []);

  // Ref para armazenar a instância do ReactFlow
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
  
  // Ajusta viewport quando os nós mudam (após inicialização)
  useEffect(() => {
    if (hasInitialized && nodes.length > 0 && reactFlowInstanceRef.current) {
      // Usa setTimeout para garantir que os nós foram renderizados
      const timer = setTimeout(() => {
        console.log('[FlowCanvas] Ajustando viewport após mudança de nós...', {
          nodesCount: nodes.length,
          nodePositions: nodes.map(n => `${n.id}: (${n.position.x}, ${n.position.y})`).join(', '),
        });
        reactFlowInstanceRef.current?.fitView({ 
          padding: 0.2, 
          duration: 0, // Sem animação para ajuste imediato
          includeHiddenNodes: false,
          minZoom: 0.1,
          maxZoom: 2,
        });
        
        // Força um segundo ajuste após um pequeno delay
        setTimeout(() => {
          reactFlowInstanceRef.current?.fitView({ 
            padding: 0.2, 
            duration: 400,
            includeHiddenNodes: false,
            minZoom: 0.1,
            maxZoom: 2,
          });
        }, 100);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [hasInitialized, nodes.length]);

  return (
    <div
      ref={reactFlowWrapper}
      style={{ 
        width: '100%', 
        height: '100%', 
        backgroundColor: '#0a0a0a',
        position: 'relative',
        zIndex: 0,
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges.map(edge => ({
          ...edge,
          selected: selectedEdge?.id === edge.id,
        }))}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onEdgeClick={onEdgeClick}
        onInit={onInit}
        nodeTypes={nodeTypes}
        fitView={false}
        style={{ backgroundColor: '#0a0a0a' }}
        connectionLineStyle={{ stroke: '#2a2a2a', strokeWidth: 2 }}
        defaultEdgeOptions={{ 
          style: { stroke: '#2a2a2a', strokeWidth: 2 },
          type: 'smoothstep',
        }}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      >
        <Background color="#1a1a1a" gap={16} />
        {showControls && (
          <Controls
            style={{
              button: {
                backgroundColor: '#1a1a1a',
                border: '1px solid #2a2a2a',
                color: '#e0e0e0',
              },
            }}
          />
        )}
      </ReactFlow>
    </div>
  );
};

const FlowCanvasWithProvider: React.FC<FlowCanvasProps> = (props) => {
  return (
    <ReactFlowProvider>
      <FlowCanvas {...props} />
    </ReactFlowProvider>
  );
};

export default FlowCanvasWithProvider;

