/**
 * Gerenciador de Agentes OpenAI
 * 
 * Este módulo gerencia a criação, cache e seleção de agentes (assistants)
 * da OpenAI Assistants API. Mantém um cache de IDs de agentes para evitar
 * recriações desnecessárias e atualiza agentes existentes com configurações
 * mais recentes.
 */

import OpenAI from 'openai';
import { Socket } from 'socket.io';
import { AgentConfig, selectAgent } from './config';
import { fileSystemFunctions } from '../tools/fileSystemTools';
import { executeCommand, checkServiceStatus, startService, stopService, killProcessOnPort } from '../tools/terminalTools';

/**
 * Gerenciador de agentes OpenAI
 * 
 * Responsável por:
 * - Criar e manter agentes (assistants) na OpenAI
 * - Cachear IDs de agentes para melhor performance
 * - Atualizar agentes existentes com novas configurações
 * - Selecionar o agente apropriado para cada mensagem
 */
export class AgentManager {
  private openai: OpenAI;
  private agentCache: Map<string, string> = new Map(); // Cache de IDs dos agentes (nome -> ID)

  /**
   * Construtor do AgentManager
   * 
   * @param {OpenAI} openai - Cliente OpenAI configurado
   */
  constructor(openai: OpenAI) {
    this.openai = openai;
  }

  /**
   * Obtém ou cria um agente baseado na configuração
   * 
   * Esta função:
   * 1. Verifica o cache local primeiro
   * 2. Se encontrado no cache, atualiza o agente com as configurações mais recentes
   * 3. Se não encontrado, busca na API da OpenAI
   * 4. Se não encontrado na API, cria um novo agente
   * 
   * @param {AgentConfig} config - Configuração do agente a ser criado/obtido
   * @returns {Promise<string>} ID do agente na OpenAI
   * @throws {Error} Se houver erro ao criar ou atualizar o agente
   */
  async getOrCreateAgent(config: AgentConfig): Promise<string> {
    // Verifica o cache primeiro
    if (this.agentCache.has(config.name)) {
      const cachedId = this.agentCache.get(config.name)!;
      
      // Atualiza o agente com as configurações mais recentes
      try {
        await this.openai.beta.assistants.update(cachedId, {
          tools: config.tools,
          instructions: config.instructions,
        });
        console.log(`✅ Agente "${config.name}" atualizado (ID: ${cachedId})`);
        return cachedId;
      } catch (error) {
        console.log(`⚠️ Erro ao atualizar agente, tentando criar novo...`);
        this.agentCache.delete(config.name);
      }
    }

    // Busca agentes existentes na API
    try {
      const assistants = await this.openai.beta.assistants.list({
        limit: 20
      });

      const existingAssistant = assistants.data.find(
        (a) => a.name === config.name
      );

      if (existingAssistant) {
        // Atualiza o assistente existente
        await this.openai.beta.assistants.update(existingAssistant.id, {
          tools: config.tools,
          instructions: config.instructions,
        });
        
        this.agentCache.set(config.name, existingAssistant.id);
        console.log(`✅ Agente "${config.name}" encontrado e atualizado (ID: ${existingAssistant.id})`);
        return existingAssistant.id;
      }
    } catch (error) {
      console.error(`Erro ao buscar agentes:`, error);
    }

    // Cria um novo agente se não foi encontrado
    try {
      const assistant = await this.openai.beta.assistants.create({
        name: config.name,
        instructions: config.instructions,
        model: config.model,
        tools: config.tools,
      });

      this.agentCache.set(config.name, assistant.id);
      console.log(`✅ Novo agente "${config.name}" criado (ID: ${assistant.id})`);
      return assistant.id;
    } catch (error) {
      console.error(`Erro ao criar agente "${config.name}":`, error);
      throw error;
    }
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
