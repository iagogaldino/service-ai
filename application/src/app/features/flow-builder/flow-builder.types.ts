export type FlowNodeType = 'start' | 'agent' | 'file-search' | 'end';

export interface StoredFlowNode {
  id: string;
  type: FlowNodeType;
  label: string;
  position: {
    x: number;
    y: number;
  };
}

export interface StoredFlowConnection {
  id: string;
  source: {
    nodeId: string;
    output: string;
  };
  target: {
    nodeId: string;
    input: string;
  };
}

export interface StoredFlowGraph {
  nodes: StoredFlowNode[];
  connections: StoredFlowConnection[];
}

