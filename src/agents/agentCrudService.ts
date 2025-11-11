import {
  AgentJsonConfig,
  AgentsJsonFileHierarchical,
  GroupConfig,
  isHierarchicalStructure,
  readAgentsJsonRaw,
  saveAgentsJson,
} from './agentLoader';
import { reloadAgentsConfig } from './config';

/**
 * Erro customizado para operações de CRUD de agentes.
 */
export class AgentCrudError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Estrutura esperada para o payload de criação de agente.
 */
export type AgentCreatePayload = Omit<AgentJsonConfig, 'priority'> & {
  priority?: number;
};

/**
 * Estrutura esperada para o payload de atualização de agente.
 */
export type AgentUpdatePayload = Partial<Omit<AgentJsonConfig, 'name'>> & {
  name?: string;
};

/**
 * Carrega o arquivo agents.json garantindo estrutura hierárquica.
 */
async function loadHierarchicalAgentsFile(): Promise<AgentsJsonFileHierarchical> {
  const raw = await readAgentsJsonRaw();

  if (!isHierarchicalStructure(raw)) {
    throw new AgentCrudError(
      'Operações de CRUD exigem que o arquivo agents.json esteja no formato hierárquico (com grupos).',
      500,
    );
  }

  return {
    toolSets: raw.toolSets || {},
    mainSelector: raw.mainSelector,
    fallbackAgent: raw.fallbackAgent,
    groups: raw.groups ? [...raw.groups] : [],
  };
}

/**
 * Normaliza e valida o payload do agente.
 */
interface NormalizeOptions {
  defaultPriority?: number;
}

function normalizeAgentPayload(
  input: AgentCreatePayload | AgentJsonConfig,
  options: NormalizeOptions = {},
): AgentJsonConfig {
  const base = input as AgentJsonConfig & Record<string, any>;
  const {
    name,
    description,
    instructions,
    model,
    shouldUse,
    priority,
    tools,
    ...rest
  } = base;

  const defaultPriority = options.defaultPriority ?? 999;

  const normalized: AgentJsonConfig = {
    name,
    description,
    instructions,
    model,
    shouldUse,
    priority: typeof priority === 'number' ? priority : defaultPriority,
    tools: Array.isArray(tools)
      ? tools.filter(Boolean)
      : tools
        ? [tools].filter(Boolean)
        : [],
    ...rest,
  };

  if (!normalized.name || typeof normalized.name !== 'string') {
    throw new AgentCrudError('Campo "name" é obrigatório para o agente.');
  }
  if (!normalized.description || typeof normalized.description !== 'string') {
    throw new AgentCrudError('Campo "description" é obrigatório para o agente.');
  }
  if (!normalized.instructions || typeof normalized.instructions !== 'string') {
    throw new AgentCrudError('Campo "instructions" é obrigatório para o agente.');
  }
  if (!normalized.model || typeof normalized.model !== 'string') {
    throw new AgentCrudError('Campo "model" é obrigatório para o agente.');
  }
  if (!normalized.shouldUse) {
    throw new AgentCrudError('Campo "shouldUse" é obrigatório para o agente.');
  }

  return normalized;
}

/**
 * Localiza um grupo pelo ID.
 */
function findGroup(groups: GroupConfig[], groupId: string): GroupConfig {
  const group = groups.find((g) => g.id === groupId);
  if (!group) {
    throw new AgentCrudError(`Grupo com id "${groupId}" não encontrado.`, 404);
  }
  return group;
}

/**
 * Persiste as alterações no arquivo e reinicializa o cache de configurações.
 */
async function persistAgentsFile(data: AgentsJsonFileHierarchical): Promise<void> {
  await saveAgentsJson(data);
  await reloadAgentsConfig();
}

/**
 * Retorna o conteúdo hierárquico atual do arquivo agents.json.
 */
export async function getAgentsHierarchy(): Promise<AgentsJsonFileHierarchical> {
  return loadHierarchicalAgentsFile();
}

/**
 * Cria um novo agente em um grupo específico.
 */
export async function createAgent(
  groupId: string,
  agentPayload: AgentCreatePayload,
): Promise<AgentJsonConfig> {
  if (!groupId) {
    throw new AgentCrudError('Parâmetro "groupId" é obrigatório.');
  }

  const data = await loadHierarchicalAgentsFile();
  const group = findGroup(data.groups || [], groupId);
  const normalizedAgent = normalizeAgentPayload(agentPayload);

  const exists = group.agents.some((agent) => agent.name === normalizedAgent.name);
  if (exists) {
    throw new AgentCrudError(
      `Já existe um agente com o nome "${normalizedAgent.name}" no grupo "${groupId}".`,
    );
  }

  group.agents.push(normalizedAgent);
  await persistAgentsFile(data);

  return normalizedAgent;
}

/**
 * Atualiza um agente existente dentro de um grupo.
 */
export async function updateAgent(
  groupId: string,
  agentName: string,
  updates: AgentUpdatePayload,
): Promise<AgentJsonConfig> {
  if (!groupId || !agentName) {
    throw new AgentCrudError('Parâmetros "groupId" e "agentName" são obrigatórios.');
  }

  const data = await loadHierarchicalAgentsFile();
  const group = findGroup(data.groups || [], groupId);

  const agentIndex = group.agents.findIndex((agent) => agent.name === agentName);
  if (agentIndex === -1) {
    throw new AgentCrudError(
      `Agente "${agentName}" não encontrado no grupo "${groupId}".`,
      404,
    );
  }

  const existing = group.agents[agentIndex];
  const merged: AgentJsonConfig = normalizeAgentPayload({
    ...existing,
    ...updates,
    name: updates.name ?? existing.name,
  });

  if (updates.name && updates.name !== agentName) {
    const nameConflict = group.agents.some(
      (agent, idx) => idx !== agentIndex && agent.name === updates.name,
    );
    if (nameConflict) {
      throw new AgentCrudError(
        `Já existe outro agente com o nome "${updates.name}" no grupo "${groupId}".`,
      );
    }
  }

  group.agents[agentIndex] = merged;
  await persistAgentsFile(data);

  return merged;
}

/**
 * Cria ou atualiza o agente fallback (General Assistant).
 */
export async function upsertFallbackAgent(
  payload: AgentCreatePayload | AgentUpdatePayload,
): Promise<AgentJsonConfig> {
  const data = await loadHierarchicalAgentsFile();
  const existingFallback = data.fallbackAgent;

  let normalizedFallback: AgentJsonConfig;

  if (existingFallback) {
    const mergedPayload: AgentJsonConfig = normalizeAgentPayload({
      ...existingFallback,
      ...payload,
      name: (payload as AgentUpdatePayload).name ?? existingFallback.name,
    });
    normalizedFallback = mergedPayload;
  } else {
    normalizedFallback = normalizeAgentPayload(payload as AgentCreatePayload);
  }

  data.fallbackAgent = normalizedFallback;
  await persistAgentsFile(data);

  return normalizedFallback;
}

/**
 * Cria ou atualiza o orquestrador de um grupo.
 */
export async function upsertGroupOrchestrator(
  groupId: string,
  orchestratorPayload: AgentCreatePayload,
): Promise<AgentJsonConfig> {
  if (!groupId) {
    throw new AgentCrudError('Parâmetro "groupId" é obrigatório.');
  }

  const data = await loadHierarchicalAgentsFile();
  const group = findGroup(data.groups || [], groupId);

  const normalizedOrchestrator = normalizeAgentPayload(orchestratorPayload, {
    defaultPriority: 0,
  });

  group.orchestrator = normalizedOrchestrator;
  await persistAgentsFile(data);

  return normalizedOrchestrator;
}

/**
 * Remove um agente de um grupo.
 */
export async function deleteAgent(
  groupId: string,
  agentName: string,
): Promise<void> {
  if (!groupId || !agentName) {
    throw new AgentCrudError('Parâmetros "groupId" e "agentName" são obrigatórios.');
  }

  const data = await loadHierarchicalAgentsFile();
  const group = findGroup(data.groups || [], groupId);

  const agentIndex = group.agents.findIndex((agent) => agent.name === agentName);
  if (agentIndex === -1) {
    throw new AgentCrudError(
      `Agente "${agentName}" não encontrado no grupo "${groupId}".`,
      404,
    );
  }

  group.agents.splice(agentIndex, 1);
  await persistAgentsFile(data);
}

