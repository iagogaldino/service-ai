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
import '@reactflow/node-resizer/dist/style.css';
import '../reactflow.css';
import CustomNode from './CustomNode';
import WhileNode from './WhileNode';
import { CustomNodeData, ComponentDefinition, WhileConfig } from '../types';

const nodeTypes = {
  custom: CustomNode,
  while: WhileNode,
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
  nodeExecutionTimes?: Map<string, number>;
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
  nodeExecutionTimes,
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
  
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<CustomNodeData>(
    initialNodes || defaultNodes
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    initialEdges || []
  );

  // Wrapper customizado para onNodesChange que detecta quando um nó entra/sai de um container WHILE
  const onNodesChange = useCallback(
    (changes: any[]) => {
      // Filtra mudanças de posição para nós WHILE que estão sendo redimensionados
      // Se o nó WHILE está sendo redimensionado (mudança de width/height), não permite arrasto
      const filteredChanges = changes.filter((change) => {
        if (change.type === 'position') {
          const node = nodes.find((n) => n.id === change.id);
          // Se é um nó WHILE e há uma mudança de dimensão simultânea, pode ser redimensionamento
          if (node?.data.type === 'while') {
            // Verifica se há mudança de dimensão nos changes
            const hasDimensionChange = changes.some(
              (c) => c.type === 'dimensions' && c.id === change.id
            );
            if (hasDimensionChange) {
              return false; // Não aplica mudança de posição durante redimensionamento
            }
          }
        }
        return true;
      });

      // Primeiro, aplica as mudanças normalmente
      onNodesChangeBase(filteredChanges.length > 0 ? filteredChanges : changes);

      // Depois, verifica se algum nó foi movido e atualiza parentId se necessário
      // Usa setTimeout para garantir que as mudanças foram aplicadas
      setTimeout(() => {
        setNodes((nds) => {
          const updatedNodes = [...nds];
          let hasChanges = false;

          for (const change of changes) {
            if (change.type === 'position' && change.dragging === false) {
              // Quando o arrasto termina, verifica a posição final
              const node = updatedNodes.find((n) => n.id === change.id);
              if (!node || node.data.type === 'while') continue; // Ignora nós WHILE

              const nodePosition = node.position;
              let newParentId: string | undefined = undefined;

              // Verifica se o nó está dentro de algum container WHILE
              // Usa a área total do container para detecção
              for (const whileNode of updatedNodes) {
                if (
                  whileNode.data.type === 'while' &&
                  whileNode.width &&
                  whileNode.height &&
                  whileNode.id !== node.id
                ) {
                  // Área total do container (sem restrições de padding)
                  const whileLeft = whileNode.position.x;
                  const whileTop = whileNode.position.y;
                  const whileRight = whileNode.position.x + (whileNode.width as number);
                  const whileBottom = whileNode.position.y + (whileNode.height as number);

                  // Verifica se o centro do nó está dentro do container
                  const nodeCenterX = nodePosition.x + 80; // Aproximadamente metade da largura do nó
                  const nodeCenterY = nodePosition.y + 30; // Aproximadamente metade da altura do nó

                  if (
                    nodeCenterX >= whileLeft &&
                    nodeCenterX <= whileRight &&
                    nodeCenterY >= whileTop &&
                    nodeCenterY <= whileBottom
                  ) {
                    newParentId = whileNode.id;
                    break;
                  }
                }
              }

              // Se o parentId mudou, atualiza o nó
              if (node.parentId !== newParentId) {
                const nodeIndex = updatedNodes.findIndex((n) => n.id === node.id);
                if (nodeIndex !== -1) {
                  const oldParentId = node.parentId;
                  
                  // Calcula posição relativa se estiver dentro de um container
                  let newPosition = nodePosition;
                  if (newParentId) {
                    const parentNode = updatedNodes.find((n) => n.id === newParentId);
                    if (parentNode && parentNode.width && parentNode.height) {
                      const relativeX = nodePosition.x - parentNode.position.x;
                      const relativeY = nodePosition.y - parentNode.position.y;
                      
                      // Padding do container WHILE
                      const containerPadding = 16;
                      
                      // Tamanho aproximado do nó (pode ser ajustado)
                      const nodeWidth = 160;
                      const nodeHeight = 60;
                      
                      // Ajusta a posição para não ficar sobre a borda
                      const minX = containerPadding;
                      const minY = containerPadding + 40; // 40px para o header
                      const maxX = (parentNode.width as number) - nodeWidth - containerPadding;
                      const maxY = (parentNode.height as number) - nodeHeight - containerPadding;
                      
                      newPosition = {
                        x: parentNode.position.x + Math.max(minX, Math.min(relativeX, maxX)),
                        y: parentNode.position.y + Math.max(minY, Math.min(relativeY, maxY)),
                      };
                    } else {
                      newPosition = {
                        x: nodePosition.x - parentNode!.position.x,
                        y: nodePosition.y - parentNode!.position.y,
                      };
                    }
                  }

                  updatedNodes[nodeIndex] = {
                    ...updatedNodes[nodeIndex],
                    parentId: newParentId,
                    position: newPosition,
                  };

                  // Atualiza a configuração do WHILE antigo para remover o nó filho
                  if (oldParentId) {
                    const oldParentIndex = updatedNodes.findIndex((n) => n.id === oldParentId);
                    if (oldParentIndex !== -1 && updatedNodes[oldParentIndex].data.type === 'while') {
                      const oldWhileConfig = updatedNodes[oldParentIndex].data.config as WhileConfig | undefined;
                      const oldChildNodes = oldWhileConfig?.while?.childNodes || [];
                      updatedNodes[oldParentIndex] = {
                        ...updatedNodes[oldParentIndex],
                        data: {
                          ...updatedNodes[oldParentIndex].data,
                          config: {
                            ...oldWhileConfig,
                            while: {
                              ...oldWhileConfig?.while,
                              childNodes: oldChildNodes.filter((id) => id !== node.id),
                              steps: (oldWhileConfig?.while?.steps || []).filter((id) => id !== node.id),
                            },
                          } as WhileConfig,
                        },
                      };
                    }
                  }

                  // Atualiza a configuração do WHILE novo para incluir o nó filho
                  if (newParentId) {
                    const newParentIndex = updatedNodes.findIndex((n) => n.id === newParentId);
                    if (newParentIndex !== -1 && updatedNodes[newParentIndex].data.type === 'while') {
                      const newWhileConfig = updatedNodes[newParentIndex].data.config as WhileConfig | undefined;
                      const currentChildNodes = newWhileConfig?.while?.childNodes || [];
                      const currentSteps = newWhileConfig?.while?.steps || [];
                      if (!currentChildNodes.includes(node.id)) {
                        updatedNodes[newParentIndex] = {
                          ...updatedNodes[newParentIndex],
                          data: {
                            ...updatedNodes[newParentIndex].data,
                            config: {
                              ...newWhileConfig,
                              while: {
                                ...newWhileConfig?.while,
                                childNodes: [...currentChildNodes, node.id],
                                steps: [...currentSteps, node.id],
                              },
                            } as WhileConfig,
                          },
                        };
                      }
                    }
                  }

                  hasChanges = true;
                }
              }
            }
          }

          return hasChanges ? updatedNodes : nds;
        });
      }, 0);
    },
    [onNodesChangeBase, setNodes]
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
        
        // Adiciona tempo de execução se disponível
        if (nodeExecutionTimes && nodeExecutionTimes.has(node.id)) {
          updatedNode.data = {
            ...updatedNode.data,
            executionTime: nodeExecutionTimes.get(node.id),
          };
        }
        
        return updatedNode;
      })
    );
  }, [activeNodeId, completedNodeIds, nodeExecutionTimes, setNodes]);

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

  // Sincronizar selectedNode com os nós e marcar como selecionado
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        selected: selectedNode ? node.id === selectedNode.id : false,
        // Atualiza os dados do nó se for o selecionado
        ...(selectedNode && node.id === selectedNode.id ? { data: selectedNode.data } : {}),
      }))
    );
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
        const dropPosition = {
          x: event.clientX - reactFlowBounds.left - 80,
          y: event.clientY - reactFlowBounds.top - 20,
        };

        // Verifica se o drop está dentro de algum nó WHILE
        let parentWhileNode: Node<CustomNodeData> | null = null;
        setNodes((nds) => {
          // Encontra o nó WHILE que contém a posição do drop
          // Usa a área total do container (sem restrições de padding) para detecção
          console.log('[FlowCanvas] Verificando drop dentro do WHILE:', {
            dropPosition,
            nodesCount: nds.length,
            whileNodes: nds.filter(n => n.data.type === 'while').map(n => ({
              id: n.id,
              position: n.position,
              width: n.width,
              height: n.height,
            })),
          });
          
          for (const node of nds) {
            if (node.data.type === 'while' && node.width && node.height) {
              const nodeLeft = node.position.x;
              const nodeTop = node.position.y;
              const nodeRight = nodeLeft + (node.width as number);
              const nodeBottom = nodeTop + (node.height as number);
              
              console.log('[FlowCanvas] Verificando nó WHILE:', {
                nodeId: node.id,
                bounds: { nodeLeft, nodeTop, nodeRight, nodeBottom },
                dropPosition,
                isInside: dropPosition.x >= nodeLeft && dropPosition.x <= nodeRight && dropPosition.y >= nodeTop && dropPosition.y <= nodeBottom,
              });
              
              // Detecta se está dentro do container (área total)
              if (
                dropPosition.x >= nodeLeft &&
                dropPosition.x <= nodeRight &&
                dropPosition.y >= nodeTop &&
                dropPosition.y <= nodeBottom
              ) {
                parentWhileNode = node;
                console.log('[FlowCanvas] ✅ Nó WHILE encontrado!', node.id);
                break;
              }
            }
          }
          return nds;
        });

        // Se encontrou um container WHILE, ajusta a posição para ser relativa ao container
        let position = dropPosition;
        let shouldSetParentId = false;
        if (parentWhileNode && parentWhileNode.width && parentWhileNode.height) {
          // Calcula posição relativa ao container
          const relativeX = dropPosition.x - parentWhileNode.position.x;
          const relativeY = dropPosition.y - parentWhileNode.position.y;
          
          // Padding do container WHILE (16px conforme definido no WhileNode)
          const containerPadding = 16;
          
          // Tamanho aproximado de um nó agente (ajuste conforme necessário)
          const agentNodeWidth = 160;
          const agentNodeHeight = 60;
          
          // Ajusta a posição para não ficar sobre a borda
          // Garante que o nó fique dentro do container com padding
          const minX = containerPadding;
          const minY = containerPadding + 40; // 40px para o header do WHILE
          const maxX = (parentWhileNode.width as number) - agentNodeWidth - containerPadding;
          const maxY = (parentWhileNode.height as number) - agentNodeHeight - containerPadding;
          
          // Limita a posição dentro dos limites do container
          // IMPORTANTE: Posição relativa ao container (não absoluta)
          // Quando parentId é definido, o React Flow usa posição relativa automaticamente
          const adjustedRelativeX = Math.max(minX, Math.min(relativeX, maxX));
          const adjustedRelativeY = Math.max(minY, Math.min(relativeY, maxY));
          
          position = {
            x: adjustedRelativeX,
            y: adjustedRelativeY,
          };
          shouldSetParentId = true;
          
          console.log('[FlowCanvas] Agente adicionado dentro do WHILE:', {
            dropPosition,
            parentPosition: parentWhileNode.position,
            relativePosition: { x: relativeX, y: relativeY },
            adjustedPosition: position,
            parentId: parentWhileNode.id,
          });
        }

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

        // Configuração padrão para nó WHILE
        const defaultWhileConfig = component.id === 'while' ? {
          config: {
            while: {
              condition: 'context.iteration < 10',
              maxIterations: 100,
              steps: [],
            },
          },
        } : {};

        const newNodeId = `${component.id}-${Date.now()}`;
        const newNode: Node<CustomNodeData> = {
          id: newNodeId,
          type: component.id === 'while' ? 'while' : 'custom',
          position,
          ...(shouldSetParentId && parentWhileNode ? { parentId: parentWhileNode.id } : {}),
          data: {
            label: component.label,
            type: component.id,
            ...defaultAgentConfig,
            ...defaultWhileConfig,
          },
          // Para nó WHILE, define tamanho inicial maior para funcionar como container
          ...(component.id === 'while' ? {
            style: { width: 400, height: 300 },
            width: 400,
            height: 300,
            draggable: true,
            selectable: true,
          } : {}),
        };

        // Se o nó foi adicionado dentro de um WHILE, atualiza a configuração do WHILE
        if (parentWhileNode && component.id !== 'while') {
          setNodes((nds) => {
            return nds.map((node) => {
              if (node.id === parentWhileNode!.id && node.data.type === 'while') {
                const whileConfig = node.data.config as WhileConfig | undefined;
                const currentSteps = whileConfig?.while?.steps || [];
                const currentChildNodes = whileConfig?.while?.childNodes || [];
                return {
                  ...node,
                  data: {
                    ...node.data,
                    config: {
                      ...whileConfig,
                      while: {
                        ...whileConfig?.while,
                        steps: [...currentSteps, newNodeId],
                        childNodes: [...currentChildNodes, newNodeId],
                      },
                    } as WhileConfig,
                  },
                };
              }
              return node;
            });
          });
        }

        console.log('[FlowCanvas] Criando novo nó:', {
          newNodeId: newNodeId,
          position: newNode.position,
          parentId: newNode.parentId,
          type: newNode.data.type,
        });
        
        // Adiciona o nó
        setNodes((nds) => nds.concat(newNode));
        
        // Se o nó foi adicionado dentro de um WHILE, força o ajuste da posição após um pequeno delay
        // Isso garante que o React Flow processe o parentId primeiro
        if (shouldSetParentId && parentWhileNode) {
          setTimeout(() => {
            setNodes((nds) => {
              const nodeToUpdate = nds.find((n) => n.id === newNodeId);
              if (!nodeToUpdate) return nds;
              
              // Verifica se o parentId foi aplicado
              if (nodeToUpdate.parentId === parentWhileNode.id) {
                // A posição já deve estar relativa, mas vamos garantir
                const currentPosition = nodeToUpdate.position;
                const parentNode = nds.find((n) => n.id === parentWhileNode.id);
                
                if (parentNode && parentNode.width && parentNode.height) {
                  const containerPadding = 16;
                  const agentNodeWidth = 160;
                  const agentNodeHeight = 60;
                  
                  const minX = containerPadding;
                  const minY = containerPadding + 40;
                  const maxX = (parentNode.width as number) - agentNodeWidth - containerPadding;
                  const maxY = (parentNode.height as number) - agentNodeHeight - containerPadding;
                  
                  // Garante que a posição está dentro dos limites
                  const adjustedX = Math.max(minX, Math.min(currentPosition.x, maxX));
                  const adjustedY = Math.max(minY, Math.min(currentPosition.y, maxY));
                  
                  // Só atualiza se a posição mudou
                  if (adjustedX !== currentPosition.x || adjustedY !== currentPosition.y) {
                    console.log('[FlowCanvas] Ajustando posição do nó dentro do WHILE:', {
                      oldPosition: currentPosition,
                      newPosition: { x: adjustedX, y: adjustedY },
                    });
                    
                    return nds.map((n) =>
                      n.id === newNodeId
                        ? { ...n, position: { x: adjustedX, y: adjustedY } }
                        : n
                    );
                  }
                }
              } else {
                // Se o parentId não foi aplicado, tenta aplicar novamente
                console.log('[FlowCanvas] ParentId não foi aplicado, tentando novamente...');
                const parentNode = nds.find((n) => n.id === parentWhileNode.id);
                if (parentNode) {
                  return nds.map((n) =>
                    n.id === newNodeId
                      ? { ...n, parentId: parentWhileNode.id, position: position }
                      : n
                  );
                }
              }
              
              return nds;
            });
          }, 100);
        }
      } catch (error) {
        console.error('Error parsing component data:', error);
      }
    },
    [setNodes]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<CustomNodeData>) => {
      // Marca o nó como selecionado no estado do React Flow imediatamente
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          selected: n.id === node.id,
        }))
      );
      // Notifica o componente pai sobre a seleção
      onNodeSelect(node);
    },
    [onNodeSelect, setNodes]
  );

  const onPaneClick = useCallback(() => {
    // Desmarca todos os nós quando clica no painel
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        selected: false,
      }))
    );
    onNodeSelect(null);
    if (onEdgeSelect) {
      onEdgeSelect(null);
    }
  }, [onNodeSelect, onEdgeSelect, setNodes]);

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      // Desmarca todos os nós quando clica em uma edge
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          selected: false,
        }))
      );
      if (onEdgeSelect) {
        onEdgeSelect(edge);
      }
      onNodeSelect(null);
    },
    [onEdgeSelect, onNodeSelect, setNodes]
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
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
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

