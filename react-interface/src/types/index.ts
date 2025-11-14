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

export interface IfElseCondition {
  id: string;
  caseName?: string;
  condition: string;
}

export interface IfElseConfig {
  conditions: IfElseCondition[];
  elseLabel?: string;
}

export interface UserApprovalConfig {
  name: string;
  message?: string;
}

export interface CustomNodeData {
  label: string;
  type: ComponentType;
  config?: AgentConfig | IfElseConfig | UserApprovalConfig;
}

/**
 * Regra de seleção do agente (shouldUse)
 */
export interface ShouldUseRule {
  type: 'keywords' | 'regex' | 'complex' | 'default';
  keywords?: string[];
  pattern?: string;
  rules?: ShouldUseRule[];
  operator?: 'AND' | 'OR';
  exclude?: ShouldUseRule;
}

/**
 * Configuração de um agente no React Flow
 */
export interface AgentConfig {
  name: string;
  description?: string;
  instructions: string;
  includeChatHistory: boolean;
  model: string;
  tools: string[];
  outputFormat: 'text' | 'json' | 'structured';
  groupId?: string;
  shouldUse?: ShouldUseRule;
  stackspotAgentId?: string;
}

export type CustomNode = Node<CustomNodeData>;
export type CustomEdge = Edge;

