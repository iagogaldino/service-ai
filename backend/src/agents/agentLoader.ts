/**
 * Sistema de Carregamento Dinâmico de Agentes
 * 
 * Este módulo permite carregar agentes de um arquivo JSON,
 * convertendo configurações estáticas em objetos AgentConfig dinâmicos.
 */

import fs from 'fs/promises';
import path from 'path';
import { AgentConfig } from './config';
import { tools as fileSystemTools } from '../tools/fileSystemTools';
import { tools as terminalTools } from '../tools/terminalTools';

/**
 * Caminho padrão do arquivo agents.json
 * 
 * Nota: __dirname aponta para a pasta dist/agents quando compilado,
 * mas o arquivo agents.json está sempre em src/agents (não é copiado)
 */
const getAgentsJsonPath = (): string => {
  const fs = require('fs');
  
  // Lista de caminhos possíveis em ordem de prioridade
  const possiblePaths = [
    path.join(process.cwd(), 'src', 'agents', 'agents.json'), // Sempre usa src/agents
    path.join(__dirname, 'agents.json'), // Se __dirname já aponta para src/agents
    path.join(__dirname, '..', '..', 'src', 'agents', 'agents.json'), // Se estiver em dist/agents
    path.join(__dirname, '..', 'src', 'agents', 'agents.json'), // Alternativa
  ];

  // Testa cada caminho
  for (const filePath of possiblePaths) {
    try {
      if (fs.existsSync(filePath)) {
        console.log(`✅ Arquivo agents.json encontrado em: ${filePath}`);
        return filePath;
      }
    } catch (error) {
      // Ignora erro
    }
  }

  // Se não encontrou, usa o caminho padrão relativo ao cwd
  const defaultPath = path.join(process.cwd(), 'src', 'agents', 'agents.json');
  console.warn(`⚠️ Arquivo agents.json não encontrado em nenhum caminho, usando: ${defaultPath}`);
  return defaultPath;
};

export const AGENTS_JSON_PATH = getAgentsJsonPath();

/**
 * Interface para configuração de regras shouldUse em JSON
 */
export interface ShouldUseRule {
  type: 'keywords' | 'regex' | 'complex' | 'default';
  keywords?: string[];
  pattern?: string;
  rules?: ShouldUseRule[];
  operator?: 'AND' | 'OR';
  exclude?: ShouldUseRule;
  priorityKeywords?: string[];
}

/**
 * Interface para configuração de agente em JSON
 */
export interface AgentJsonConfig {
  name: string;
  description: string;
  model: string;
  priority: number;
  tools?: string[]; // Opcional para permitir agentes sem tools
  instructions: string;
  shouldUse: ShouldUseRule;
  stackspotAgentId?: string; // ID do agente no StackSpot (opcional)
  [key: string]: any; // Permite campos extras
}

/**
 * Interface para o arquivo JSON completo (estrutura simplificada - lista plana de agentes)
 */
export interface AgentsJsonFile {
  agents: AgentJsonConfig[];
  toolSets: Record<string, string[]>;
}

// Tipo união removido - agora só temos uma estrutura simples

/**
 * Registro de todas as tools disponíveis
 * Mapeia nomes de tools para seus objetos reais
 */
const TOOL_REGISTRY: Record<string, any[]> = {
  list_directory: fileSystemTools.filter(t => t.function.name === 'list_directory'),
  read_file: fileSystemTools.filter(t => t.function.name === 'read_file'),
  find_file: fileSystemTools.filter(t => t.function.name === 'find_file'),
  detect_framework: fileSystemTools.filter(t => t.function.name === 'detect_framework'),
  write_file: fileSystemTools.filter(t => t.function.name === 'write_file'),
  execute_command: terminalTools.filter(t => t.function.name === 'execute_command'),
  check_service_status: terminalTools.filter(t => t.function.name === 'check_service_status'),
  start_service: terminalTools.filter(t => t.function.name === 'start_service'),
  stop_service: terminalTools.filter(t => t.function.name === 'stop_service'),
};

/**
 * Conjuntos pré-definidos de tools
 */
const TOOL_SETS: Record<string, string[]> = {
  fileSystem: ['list_directory', 'read_file', 'find_file', 'detect_framework', 'write_file'],
  terminal: ['execute_command', 'check_service_status', 'start_service', 'stop_service'],
  execute_command: ['execute_command'],
};

/**
 * Resolve um conjunto de tools pelo nome
 * 
 * @param {string} toolSetName - Nome do conjunto de tools
 * @returns {any[]} Array de tools
 */
function resolveToolSet(toolSetName: string): any[] {
  if (TOOL_SETS[toolSetName]) {
    return TOOL_SETS[toolSetName]
      .flatMap(toolName => TOOL_REGISTRY[toolName] || [])
      .filter(Boolean);
  }
  
  // Se não for um conjunto, tenta como nome de tool individual
  return TOOL_REGISTRY[toolSetName] || [];
}

/**
 * Resolve uma lista de tools (pode incluir conjuntos e tools individuais)
 * 
 * @param {string[]} toolNames - Lista de nomes de tools ou conjuntos
 * @param {Record<string, string[]>} customToolSets - Conjuntos customizados do JSON
 * @returns {any[]} Array de tools resolvidas
 */
function resolveTools(toolNames: string[] | undefined | null, customToolSets?: Record<string, string[]>): any[] {
  // Garante que toolNames seja um array válido
  if (!toolNames || !Array.isArray(toolNames)) {
    return [];
  }

  const resolvedTools: any[] = [];
  const addedTools = new Set<string>();

  // Mescla conjuntos customizados com os padrões
  const allToolSets = { ...TOOL_SETS, ...customToolSets };

  for (const toolName of toolNames) {
    // Garante que toolName seja uma string válida
    if (!toolName || typeof toolName !== 'string') {
      continue;
    }

    // Verifica se é um conjunto customizado
    if (customToolSets && customToolSets[toolName]) {
      const customToolSet = customToolSets[toolName];
      if (Array.isArray(customToolSet)) {
        for (const individualTool of customToolSet) {
          if (!addedTools.has(individualTool) && TOOL_REGISTRY[individualTool]) {
            resolvedTools.push(...TOOL_REGISTRY[individualTool]);
            addedTools.add(individualTool);
          }
        }
      }
      continue;
    }

    // Verifica se é um conjunto padrão
    if (allToolSets[toolName] && Array.isArray(allToolSets[toolName])) {
      for (const individualTool of allToolSets[toolName]) {
        if (!addedTools.has(individualTool) && TOOL_REGISTRY[individualTool]) {
          resolvedTools.push(...TOOL_REGISTRY[individualTool]);
          addedTools.add(individualTool);
        }
      }
      continue;
    }

    // Tenta como tool individual
    if (TOOL_REGISTRY[toolName] && !addedTools.has(toolName)) {
      resolvedTools.push(...TOOL_REGISTRY[toolName]);
      addedTools.add(toolName);
    }
  }

  return resolvedTools;
}

/**
 * Cria uma função shouldUse a partir de uma regra JSON
 * 
 * @param {ShouldUseRule} rule - Regra em formato JSON
 * @returns {(message: string) => boolean} Função shouldUse
 */
function createShouldUseFunction(rule: ShouldUseRule): (message: string) => boolean {
  switch (rule.type) {
    case 'keywords':
      return (message: string) => {
        const lowerMessage = message.toLowerCase();
        if (rule.keywords) {
          return rule.keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
        }
        return false;
      };

    case 'regex':
      // Otimização: compila regex uma vez durante a criação da função
      let compiledRegex: RegExp | null = null;
      if (rule.pattern) {
        try {
          compiledRegex = new RegExp(rule.pattern, 'i');
        } catch (error) {
          console.error(`Erro ao compilar regex para pattern "${rule.pattern}":`, error);
        }
      }
      return (message: string) => {
        if (compiledRegex) {
          return compiledRegex.test(message);
        }
        return false;
      };

    case 'complex':
      if (!rule.rules) {
        return () => false;
      }

      const ruleFunctions = rule.rules.map(createShouldUseFunction);
      const operator = rule.operator || 'OR';

      return (message: string) => {
        if (operator === 'AND') {
          return ruleFunctions.every(fn => fn(message));
        } else {
          return ruleFunctions.some(fn => fn(message));
        }
      };

    case 'default':
      if (rule.exclude) {
        const excludeFn = createShouldUseFunction(rule.exclude);
        return (message: string) => {
          // Retorna true por padrão, a menos que a regra de exclusão seja verdadeira
          return !excludeFn(message);
        };
      }
      // Sem exclusão, sempre retorna true (agente padrão)
      return () => true;

    default:
      return () => false;
  }
}

/**
 * Converte uma configuração JSON de agente em AgentConfig
 * 
 * @param {AgentJsonConfig} agentJson - Configuração JSON do agente
 * @param {Record<string, string[]>} toolSets - Conjuntos de tools disponíveis
 * @returns {AgentConfig} Configuração do agente
 */
export function convertAgentJsonToConfig(
  agentJson: AgentJsonConfig,
  toolSets: Record<string, string[]>
): AgentConfig {
  // Garante que tools seja um array válido
  const toolsArray = Array.isArray(agentJson.tools) ? agentJson.tools : (agentJson.tools ? [agentJson.tools] : []);
  
  // Resolve as tools
  const tools = resolveTools(toolsArray, toolSets);

  // Cria a função shouldUse
  const shouldUse = createShouldUseFunction(agentJson.shouldUse);

  // Cria o AgentConfig
  const agentConfig: AgentConfig = {
    name: agentJson.name,
    description: agentJson.description,
    instructions: agentJson.instructions,
    model: agentJson.model,
    tools: tools,
    shouldUse: shouldUse,
  };

  // Adiciona prioridade como propriedade customizada
  (agentConfig as any).priority = agentJson.priority;
  
  // Preserva campos extras do JSON (como stackspotAgentId)
  // Copia todas as propriedades que não são campos padrão do AgentConfig
  const standardFields = ['name', 'description', 'instructions', 'model', 'tools', 'shouldUse', 'priority'];
  for (const key in agentJson) {
    if (!standardFields.includes(key)) {
      (agentConfig as any)[key] = agentJson[key];
    }
  }

  return agentConfig;
}

// Função removida - não há mais estrutura hierárquica

/**
 * Carrega agentes do arquivo JSON (suporta estrutura hierárquica e legacy)
 * 
 * @param {string} jsonPath - Caminho para o arquivo JSON (opcional, padrão: agents.json)
 * @returns {Promise<AgentConfig[]>} Array de configurações de agentes
 */
export async function loadAgentsFromJson(jsonPath?: string): Promise<AgentConfig[]> {
  const filePath = jsonPath || AGENTS_JSON_PATH;

  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const jsonData: AgentsJsonFile = JSON.parse(fileContent);

    const allAgents: AgentConfig[] = [];
    const toolSets = jsonData.toolSets || {};
    
    // Estrutura simplificada: apenas lista plana de agentes
    if (Array.isArray(jsonData.agents)) {
      for (const agentJson of jsonData.agents) {
        const agentConfig = convertAgentJsonToConfig(agentJson, toolSets);
        allAgents.push(agentConfig);
      }
    } else {
      throw new Error('Estrutura JSON inválida: deve conter "agents" como array');
    }

    // Ordena por prioridade (menor número = maior prioridade)
    allAgents.sort((a, b) => {
      const priorityA = (a as any).priority ?? 999;
      const priorityB = (b as any).priority ?? 999;
      return priorityA - priorityB;
    });

    console.log(`✅ ${allAgents.length} agente(s) carregado(s) do arquivo JSON`);
    return allAgents;
  } catch (error: any) {
    console.error(`❌ Erro ao carregar agentes do JSON:`, error.message);
    throw new Error(`Falha ao carregar agentes: ${error.message}`);
  }
}

/**
 * Obtém informações sobre grupos e orquestradores dos agentes carregados
 * 
 * @param {AgentConfig[]} agents - Array de agentes carregados
 * @returns {Map<string, {groupId: string, groupName: string, orchestrator: AgentConfig, agents: AgentConfig[]}>} Mapa de grupos
 */
export function getGroupsInfo(agents: AgentConfig[]): Map<string, {
  groupId: string;
  groupName: string;
  orchestrator: AgentConfig;
  agents: AgentConfig[];
}> {
  const groupsMap = new Map();

  for (const agent of agents) {
    const agentAny = agent as any;
    if (agentAny.role === 'orchestrator' && agentAny.groupId) {
      const groupId = agentAny.groupId;
      if (!groupsMap.has(groupId)) {
        groupsMap.set(groupId, {
          groupId: groupId,
          groupName: agentAny.groupName || groupId,
          orchestrator: agent,
          agents: []
        });
      }
    } else if (agentAny.role === 'agent' && agentAny.groupId) {
      const groupId = agentAny.groupId;
      if (!groupsMap.has(groupId)) {
        groupsMap.set(groupId, {
          groupId: groupId,
          groupName: agentAny.groupName || groupId,
          orchestrator: null as any,
          agents: []
        });
      }
      groupsMap.get(groupId).agents.push(agent);
    }
  }

  return groupsMap;
}

/**
 * Obtém o Main Selector dos agentes carregados
 * 
 * @param {AgentConfig[]} agents - Array de agentes carregados
 * @returns {AgentConfig | null} Main Selector ou null
 */
export function getMainSelector(agents: AgentConfig[]): AgentConfig | null {
  const mainSelector = agents.find(agent => (agent as any).role === 'mainSelector');
  return mainSelector || null;
}

/**
 * Obtém o Fallback Agent dos agentes carregados
 * 
 * @param {AgentConfig[]} agents - Array de agentes carregados
 * @returns {AgentConfig | null} Fallback Agent ou null
 */
export function getFallbackAgent(agents: AgentConfig[]): AgentConfig | null {
  const fallback = agents.find(agent => (agent as any).role === 'fallback');
  return fallback || null;
}

/**
 * Obtém o orquestrador de um grupo específico
 * 
 * @param {AgentConfig[]} agents - Array de agentes carregados
 * @param {string} groupId - ID do grupo
 * @returns {AgentConfig | null} Orquestrador do grupo ou null
 */
export function getGroupOrchestrator(agents: AgentConfig[], groupId: string): AgentConfig | null {
  const orchestrator = agents.find(agent => {
    const agentAny = agent as any;
    return agentAny.role === 'orchestrator' && agentAny.groupId === groupId;
  });
  return orchestrator || null;
}

/**
 * Registra uma nova tool no sistema
 * 
 * @param {string} toolName - Nome da tool
 * @param {any} toolObject - Objeto da tool (formato OpenAI)
 */
export function registerTool(toolName: string, toolObject: any): void {
  if (!TOOL_REGISTRY[toolName]) {
    TOOL_REGISTRY[toolName] = [];
  }
  TOOL_REGISTRY[toolName].push(toolObject);
}

/**
 * Registra um novo conjunto de tools
 * 
 * @param {string} setName - Nome do conjunto
 * @param {string[]} toolNames - Lista de nomes de tools
 */
export function registerToolSet(setName: string, toolNames: string[]): void {
  TOOL_SETS[setName] = toolNames;
}

/**
 * Lê o arquivo agents.json bruto sem conversão
 */
export async function readAgentsJsonRaw(jsonPath: string = AGENTS_JSON_PATH): Promise<AgentsJsonFile> {
  try {
    const fileContent = await fs.readFile(jsonPath, 'utf-8');
    return JSON.parse(fileContent) as AgentsJsonFile;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`Arquivo agents.json não encontrado em: ${jsonPath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Erro ao parsear agents.json: ${error.message}`);
    }
    throw new Error(`Erro ao ler agents.json: ${error.message || 'Erro desconhecido'}`);
  }
}

/**
 * Salva dados diretamente no arquivo agents.json
 */
export async function saveAgentsJson(data: AgentsJsonFile, jsonPath: string = AGENTS_JSON_PATH): Promise<void> {
  await fs.writeFile(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
}

