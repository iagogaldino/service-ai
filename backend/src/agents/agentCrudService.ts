import {
  AgentJsonConfig,
  AgentsJsonFile,
  readAgentsJsonRaw,
  saveAgentsJson,
} from './agentLoader';
import { reloadAgentsConfig } from './config';
import { saveProjectAgents, loadProjectAgents } from '../projects/projectManager';

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
 * Carrega o arquivo agents.json (estrutura simplificada - lista plana).
 * Agora carrega do projeto ativo ao invés do arquivo agents.json.
 */
async function loadAgentsFile(): Promise<AgentsJsonFile> {
  try {
    // Tenta carregar do projeto ativo primeiro
    const projectAgents = await loadProjectAgents();
    if (projectAgents) {
      return {
        toolSets: projectAgents.toolSets || {},
        agents: projectAgents.agents ? [...projectAgents.agents] : [],
      };
    }
    
    // Fallback: tenta carregar do arquivo agents.json
    const raw = await readAgentsJsonRaw();

    // Garante estrutura simplificada
    if (!Array.isArray(raw.agents)) {
      throw new AgentCrudError(
        'Estrutura JSON inválida: deve conter "agents" como array.',
        500,
      );
    }

    return {
      toolSets: raw.toolSets || {},
      agents: raw.agents || [],
    };
  } catch (error) {
    if (error instanceof AgentCrudError) {
      throw error;
    }
    console.error('❌ Erro ao carregar arquivo de agentes:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido ao carregar agents.json';
    throw new AgentCrudError(
      `Falha ao carregar agentes: ${errorMessage}`,
      500,
    );
  }
}

/**
 * Normaliza e valida o payload do agente.
 */
function normalizeAgentPayload(input: AgentCreatePayload | AgentJsonConfig): AgentJsonConfig {
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

  const normalized: AgentJsonConfig = {
    name,
    description,
    instructions,
    model,
    shouldUse,
    priority: typeof priority === 'number' ? priority : 999,
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

// Função removida - não há mais grupos

/**
 * Persiste as alterações no projeto ativo e reinicializa o cache de configurações.
 */
async function persistAgentsFile(data: AgentsJsonFile): Promise<void> {
  try {
    // Tenta salvar no projeto ativo primeiro
    await saveProjectAgents(data);
    console.log('✅ Agentes salvos no projeto ativo');
  } catch (error) {
    // Se não houver projeto ativo, salva no arquivo agents.json (fallback)
    console.warn('⚠️ Nenhum projeto ativo encontrado, salvando em agents.json como fallback');
    await saveAgentsJson(data);
  }
  await reloadAgentsConfig();
}

/**
 * Retorna o conteúdo atual do arquivo agents.json (lista plana).
 */
export async function getAgentsFile(): Promise<AgentsJsonFile> {
  return loadAgentsFile();
}

/**
 * Cria um novo agente (lista plana, sem grupos).
 */
export async function createAgent(
  agentPayload: AgentCreatePayload,
): Promise<AgentJsonConfig> {
  const data = await loadAgentsFile();
  const normalizedAgent = normalizeAgentPayload(agentPayload);

  const exists = data.agents.some((agent) => agent.name === normalizedAgent.name);
  if (exists) {
    throw new AgentCrudError(
      `Já existe um agente com o nome "${normalizedAgent.name}".`,
    );
  }

  data.agents.push(normalizedAgent);
  await persistAgentsFile(data);

  return normalizedAgent;
}

/**
 * Atualiza um agente existente (lista plana, sem grupos).
 */
export async function updateAgent(
  agentName: string,
  updates: AgentUpdatePayload,
): Promise<AgentJsonConfig> {
  if (!agentName) {
    throw new AgentCrudError('Parâmetro "agentName" é obrigatório.');
  }

  const data = await loadAgentsFile();

  const agentIndex = data.agents.findIndex((agent) => agent.name === agentName);
  if (agentIndex === -1) {
    throw new AgentCrudError(
      `Agente "${agentName}" não encontrado.`,
      404,
    );
  }

  const existing = data.agents[agentIndex];
  const merged: AgentJsonConfig = normalizeAgentPayload({
    ...existing,
    ...updates,
    name: updates.name ?? existing.name,
  });

  if (updates.name && updates.name !== agentName) {
    const nameConflict = data.agents.some(
      (agent, idx) => idx !== agentIndex && agent.name === updates.name,
    );
    if (nameConflict) {
      throw new AgentCrudError(
        `Já existe outro agente com o nome "${updates.name}".`,
      );
    }
  }

  data.agents[agentIndex] = merged;
  await persistAgentsFile(data);

  return merged;
}

/**
 * Remove um agente (lista plana, sem grupos).
 */
export async function deleteAgent(
  agentName: string,
): Promise<void> {
  if (!agentName) {
    throw new AgentCrudError('Parâmetro "agentName" é obrigatório.');
  }

  const data = await loadAgentsFile();

  const agentIndex = data.agents.findIndex((agent) => agent.name === agentName);
  if (agentIndex === -1) {
    throw new AgentCrudError(
      `Agente "${agentName}" não encontrado.`,
      404,
    );
  }

  data.agents.splice(agentIndex, 1);
  await persistAgentsFile(data);
}

