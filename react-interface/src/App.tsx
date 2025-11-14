import React, { useState, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import BottomBar from './components/BottomBar';
import FlowCanvas from './components/FlowCanvas';
import AgentConfigPanel from './components/AgentConfigPanel';
import EdgeConfigPanel from './components/EdgeConfigPanel';
import { Node, Edge } from 'reactflow';
import { CustomNodeData, ComponentDefinition, AgentConfig } from './types';

function App() {
  const [selectedNode, setSelectedNode] = useState<Node<CustomNodeData> | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [allNodes, setAllNodes] = useState<Node<CustomNodeData>[]>([]);
  const [allEdges, setAllEdges] = useState<Edge[]>([]);
  const [currentTool, setCurrentTool] = useState<'pan' | 'select'>('select');
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

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

  const handleEdgeSelect = useCallback((edge: Edge | null) => {
    setSelectedEdge(edge);
    setSelectedNode(null); // Deselecionar nó quando selecionar edge
  }, []);

  const handleNodesUpdate = useCallback((nodes: Node<CustomNodeData>[]) => {
    setAllNodes(nodes);
    // Atualizar selectedNode se ele ainda existir
    if (selectedNode) {
      const updatedNode = nodes.find(n => n.id === selectedNode.id);
      if (updatedNode) {
        setSelectedNode(updatedNode);
      }
    }
  }, [selectedNode]);

  const handleEdgesUpdate = useCallback((edges: Edge[]) => {
    setAllEdges(edges);
  }, []);

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

  const handleDeleteNode = useCallback((nodeId: string) => {
    // Chamar a função global de deletar nó
    if ((window as any).__deleteNode) {
      (window as any).__deleteNode(nodeId);
    }
    // Remover da lista local também
    setAllNodes((nds) => nds.filter((node) => node.id !== nodeId));
    if (selectedNode && selectedNode.id === nodeId) {
      setSelectedNode(null);
    }
  }, [selectedNode]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        <Sidebar onDragStart={handleDragStart} />
        <div style={{ flex: 1, position: 'relative' }}>
          <FlowCanvas 
            onNodeSelect={handleNodeSelect} 
            selectedNode={selectedNode}
            onNodesUpdate={handleNodesUpdate}
            onNodeDelete={handleDeleteNode}
            onEdgeSelect={handleEdgeSelect}
            selectedEdge={selectedEdge}
            onEdgesUpdate={handleEdgesUpdate}
          />
          <BottomBar
            onToolChange={setCurrentTool}
            currentTool={currentTool}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={historyIndex > 0}
            canRedo={historyIndex < history.length - 1}
          />
        </div>
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
    </div>
  );
}

export default App;

