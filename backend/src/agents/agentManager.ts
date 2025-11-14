/**
 * Gerenciador de Agentes Multi-LLM
 * 
 * Este módulo gerencia a criação, cache e seleção de agentes (assistants)
 * usando adaptadores de LLM (OpenAI, StackSpot, etc.). Mantém um cache de IDs 
 * de agentes para evitar recriações desnecessárias e atualiza agentes existentes 
 * com configurações mais recentes.
 */

import { Socket } from 'socket.io';
import { AgentConfig, selectAgent } from './config';
import { fileSystemFunctions } from '../tools/fileSystemTools';
import { executeCommand, checkServiceStatus, startService, stopService, killProcessOnPort } from '../tools/terminalTools';
import { LLMAdapter } from '../llm/adapters/LLMAdapter';

/**
 * Gerenciador de agentes Multi-LLM
 * 
 * Responsável por:
 * - Criar e manter agentes (assistants) usando o adaptador configurado
 * - Cachear IDs de agentes para melhor performance
 * - Atualizar agentes existentes com novas configurações
 * - Selecionar o agente apropriado para cada mensagem
 */
export class AgentManager {
  private llmAdapter: LLMAdapter;
  private agentCache: Map<string, string> = new Map(); // Cache de IDs dos agentes (nome -> ID)

  /**
   * Construtor do AgentManager
   * 
   * @param {LLMAdapter} llmAdapter - Adaptador de LLM configurado
   */
  constructor(llmAdapter: LLMAdapter) {
    this.llmAdapter = llmAdapter;
  }

  /**
   * Obtém ou cria um agente baseado na configuração
   * 
   * Esta função usa o adaptador de LLM para criar/obter agentes.
   * 
   * @param {AgentConfig} config - Configuração do agente a ser criado/obtido
   * @returns {Promise<string>} ID do agente
   * @throws {Error} Se houver erro ao criar ou atualizar o agente
   */
  async getOrCreateAgent(config: AgentConfig): Promise<string> {
    // Usa o adaptador para obter ou criar o agente
    const agentId = await this.llmAdapter.getOrCreateAgent(config);
    
    // Atualiza cache
    if (!this.agentCache.has(config.name)) {
      this.agentCache.set(config.name, agentId);
      console.log(`✅ Agente "${config.name}" criado/obtido (ID: ${agentId})`);
    }
    
    return agentId;
  }

  /**
   * Seleciona e obtém o agente apropriado para uma mensagem
   * 
   * Analisa a mensagem do usuário e seleciona o agente mais apropriado
   * baseado nas regras de seleção definidas em cada configuração de agente.
   * 
   * @param {string} message - Mensagem do usuário
   * @returns {Promise<{agentId: string, config: AgentConfig}>} ID do agente e sua configuração
   */
  async getAgentForMessage(message: string): Promise<{ agentId: string; config: AgentConfig }> {
    const config = await selectAgent(message);
    const agentId = await this.getOrCreateAgent(config);
    
    console.log(`🤖 Usando agente: "${config.name}" - ${config.description}`);
    
    return { agentId, config };
  }
}

/**
 * Executa uma tool/função baseado no nome
 * 
 * Esta função é um dispatcher central que roteia chamadas de tools
 * para as funções apropriadas. Suporta tanto ferramentas de sistema
 * de arquivos quanto ferramentas de terminal.
 * 
 * @param {string} functionName - Nome da função/tool a ser executada
 * @param {any} args - Argumentos da função
 * @param {Socket} [socket] - Socket.IO opcional para streaming em tempo real (usado para comandos de terminal)
 * @returns {Promise<string>} Resultado da execução da função
 */
export async function executeTool(
  functionName: string, 
  args: any, 
  socket?: Socket
): Promise<string> {
  switch (functionName) {
    // ========================================================================
    // FERRAMENTAS DE SISTEMA DE ARQUIVOS
    // ========================================================================
    
    case 'list_directory':
      return await fileSystemFunctions.listDirectory(args.dirPath);
    
    case 'read_file':
      return await fileSystemFunctions.readFile(args.filePath);
    
    case 'find_file':
      return await fileSystemFunctions.findFile(args.fileName, args.startDir || '.');
    
    case 'detect_framework':
      return await fileSystemFunctions.detectFramework(args.projectPath);
    
    case 'write_file':
      return await fileSystemFunctions.writeFile(
        args.filePath, 
        args.content, 
        args.createDirectories !== false
      );
    
    // ========================================================================
    // FERRAMENTAS DE TERMINAL
    // ========================================================================
    
    case 'execute_command':
      // Passa o socket para permitir streaming em tempo real
      return await executeCommand(args.command, args.workingDirectory, socket);
    
    case 'check_service_status':
      return await checkServiceStatus(args.serviceName);
    
    case 'start_service':
      return await startService(args.serviceName);
    
    case 'stop_service':
      return await stopService(args.serviceName);
    
    case 'kill_process_on_port':
      return await killProcessOnPort(args.port);
    
    // ========================================================================
    // FERRAMENTA DESCONHECIDA
    // ========================================================================
    
    default:
      return `Função desconhecida: ${functionName}`;
  }
}
