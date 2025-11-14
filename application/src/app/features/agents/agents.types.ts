export type AgentFormMode = 'create' | 'edit';
export type AgentFormTarget = 'agent' | 'orchestrator' | 'fallback';

export interface AgentSelection {
  target: AgentFormTarget;
  mode: AgentFormMode;
  groupId?: string;
  agentName?: string;
}

export interface AgentJsonConfig {
  name: string;
  description: string;
  model: string;
  priority: number;
  tools?: string[];
  instructions: string;
  shouldUse: Record<string, unknown>;
  stackspotAgentId?: string;
  [key: string]: any;
}

export interface GroupConfig {
  id: string;
  name: string;
  description?: string;
  orchestrator?: AgentJsonConfig | null;
  agents: AgentJsonConfig[];
}

export interface AgentsHierarchy {
  mainSelector?: AgentJsonConfig | null;
  groups?: GroupConfig[];
  fallbackAgent?: AgentJsonConfig | null;
  toolSets: Record<string, string[]>;
}

export interface AgentSummary {
  name: string;
  description: string;
  model?: string;
  priority?: number;
  role?: string;
  groupId?: string | null;
  groupName?: string | null;
  toolsCount?: number;
  tools?: string[];
}

export interface AgentGroupSummary {
  id: string;
  name: string;
  orchestrator?: AgentSummary | null;
  agents: AgentSummary[];
}

export interface AgentsSummary {
  total: number;
  agents: AgentSummary[];
  mainSelector?: AgentSummary | null;
  fallbackAgent?: AgentSummary | null;
  groups: AgentGroupSummary[];
}

