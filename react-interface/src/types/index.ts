import { Node, Edge } from 'reactflow';

export type ComponentType = 
  | 'agent'
  | 'classify'
  | 'end'
  | 'note'
  | 'file-search'
  | 'guardrails'
  | 'mcp'
  | 'if-else'
  | 'while'
  | 'user-approval'
  | 'transform'
  | 'set-state'
  | 'start';

export interface ComponentDefinition {
  id: ComponentType;
  label: string;
  category: 'core' | 'tools' | 'logic' | 'data';
  icon: string;
  color: string;
}

export interface CustomNodeData {
  label: string;
  type: ComponentType;
  config?: AgentConfig;
}

export interface AgentConfig {
  name: string;
  instructions: string;
  includeChatHistory: boolean;
  model: string;
  tools: string[];
  outputFormat: 'text' | 'json' | 'structured';
}

export type CustomNode = Node<CustomNodeData>;
export type CustomEdge = Edge;

