import React, { useCallback, useRef, useEffect } from 'react';
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
}

const FlowCanvas: React.FC<FlowCanvasProps> = ({ onNodeSelect, selectedNode, onNodesUpdate, onNodeDelete, onEdgeSelect, selectedEdge, onEdgesUpdate }) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<CustomNodeData>([
    {
      id: 'start',
      type: 'custom',
      position: { x: 100, y: 300 },
      data: { label: 'Start', type: 'start' },
    },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

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

  // Notificar mudanças nos nós
  useEffect(() => {
    if (onNodesUpdate) {
      onNodesUpdate(nodes);
    }
  }, [nodes, onNodesUpdate]);

  // Notificar mudanças nas edges
  useEffect(() => {
    if (onEdgesUpdate) {
      onEdgesUpdate(edges);
    }
  }, [edges, onEdgesUpdate]);

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
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
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

        const newNode: Node<CustomNodeData> = {
          id: `${component.id}-${Date.now()}`,
          type: 'custom',
          position,
          data: {
            label: component.label,
            type: component.id,
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

  return (
    <div
      ref={reactFlowWrapper}
      style={{ width: '100%', height: '100%', backgroundColor: '#0a0a0a' }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onEdgeClick={onEdgeClick}
        nodeTypes={nodeTypes}
        edges={edges.map(edge => ({
          ...edge,
          selected: selectedEdge?.id === edge.id,
        }))}
        fitView
        style={{ backgroundColor: '#0a0a0a' }}
        connectionLineStyle={{ stroke: '#2a2a2a', strokeWidth: 2 }}
        defaultEdgeOptions={{ 
          style: { stroke: '#2a2a2a', strokeWidth: 2 },
          type: 'smoothstep',
        }}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      >
        <Background color="#1a1a1a" gap={16} />
        <Controls
          style={{
            button: {
              backgroundColor: '#1a1a1a',
              border: '1px solid #2a2a2a',
              color: '#e0e0e0',
            },
          }}
        />
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

