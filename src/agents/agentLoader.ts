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
 * Interface para configuração de regras shouldUse em JSON
 */
interface ShouldUseRule {
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
interface AgentJsonConfig {
  name: string;
  description: string;
  model: string;
  priority: number;
  tools: string[];
  instructions: string;
  shouldUse: ShouldUseRule;
}

/**
 * Interface para o arquivo JSON completo
 */
interface AgentsJsonFile {
  agents: AgentJsonConfig[];
  toolSets: Record<string, string[]>;
}

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
function resolveTools(toolNames: string[], customToolSets?: Record<string, string[]>): any[] {
  const resolvedTools: any[] = [];
  const addedTools = new Set<string>();

  // Mescla conjuntos customizados com os padrões
  const allToolSets = { ...TOOL_SETS, ...customToolSets };

  for (const toolName of toolNames) {
    // Verifica se é um conjunto customizado
    if (customToolSets && customToolSets[toolName]) {
      for (const individualTool of customToolSets[toolName]) {
        if (!addedTools.has(individualTool) && TOOL_REGISTRY[individualTool]) {
          resolvedTools.push(...TOOL_REGISTRY[individualTool]);
          addedTools.add(individualTool);
        }
      }
      continue;
    }

    // Verifica se é um conjunto padrão
    if (allToolSets[toolName]) {
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
 * Carrega agentes do arquivo JSON
 * 
 * @param {string} jsonPath - Caminho para o arquivo JSON (opcional, padrão: agents.json)
 * @returns {Promise<AgentConfig[]>} Array de configurações de agentes
 */
export async function loadAgentsFromJson(jsonPath?: string): Promise<AgentConfig[]> {
  const defaultPath = path.join(__dirname, 'agents.json');
  const filePath = jsonPath || defaultPath;

  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const jsonData: AgentsJsonFile = JSON.parse(fileContent);

    const agents: AgentConfig[] = jsonData.agents.map(agentJson => {
      // Resolve as tools
      const tools = resolveTools(agentJson.tools, jsonData.toolSets);

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

      // Adiciona prioridade como propriedade customizada (se necessário)
      (agentConfig as any).priority = agentJson.priority;

      return agentConfig;
    });

    // Ordena por prioridade (menor número = maior prioridade)
    agents.sort((a, b) => {
      const priorityA = (a as any).priority ?? 999;
      const priorityB = (b as any).priority ?? 999;
      return priorityA - priorityB;
    });

    console.log(`✅ ${agents.length} agente(s) carregado(s) do arquivo JSON`);
    return agents;
  } catch (error: any) {
    console.error(`❌ Erro ao carregar agentes do JSON:`, error.message);
    throw new Error(`Falha ao carregar agentes: ${error.message}`);
  }
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

