/**
 * Executor de Workflows
 * 
 * Responsável por executar workflows e processar mensagens através de nós.
 */

import { 
  Workflow, 
  WorkflowNode, 
  WorkflowEdge, 
  ExecutionContext, 
  WorkflowExecutionResult, 
  EdgeCondition,
  ShouldUseRule 
} from './workflowTypes';
import { getAgentsConfig, AgentConfig } from '../agents/config';
import { AgentManager } from '../agents/agentManager';
import { processMessageWithAgent } from '../services/messageService';
import { getLLMAdapter, getCurrentLLMProvider } from '../services/llmService';
import { Socket } from 'socket.io';
import { saveLog } from '../storage/logStorage';
import { getThreadId } from '../services/threadService';
import { processTemplate } from '../utils/templateProcessor';

/**
 * Executa um workflow completo
 * 
 * @param workflow - Workflow a ser executado
 * @param message - Mensagem inicial do usuário
 * @param agentManager - Gerenciador de agentes
 * @param socket - Socket.IO opcional para streaming
 * @returns Resultado da execução do workflow
 */
export async function executeWorkflow(
  workflow: Workflow,
  message: string,
  agentManager: AgentManager,
  socket?: Socket
): Promise<WorkflowExecutionResult> {
  const context: ExecutionContext = {
    message,
    history: [],
    variables: {},
  };

  try {
    // 1. Encontra nó inicial (Start)
    const startNode = workflow.nodes.find(n => n.type === 'start');
    if (!startNode) {
      throw new Error('Workflow não tem nó Start');
    }

    // 2. Seleciona primeiro nó a executar
    let currentNode = selectInitialNode(workflow, startNode, message);

    // 3. Loop de execução
    const path: string[] = [];
    let executionCount = 0;
    const MAX_EXECUTIONS = 100; // Prevenção de loops infinitos

    while (currentNode && currentNode.type !== 'end' && executionCount < MAX_EXECUTIONS) {
      executionCount++;
      path.push(currentNode.id);

      // 3.1. Emite evento de nó iniciado
      if (socket) {
        socket.emit('workflow_node_started', {
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          nodeName: currentNode.data?.label || currentNode.id,
        });
      }

      // 3.2. Executa nó atual
      console.log(`🔄 Executando nó: ${currentNode.id} (tipo: ${currentNode.type})`);
      const result = await executeNode(currentNode, context, agentManager, socket);
      console.log(`✅ Nó executado: ${currentNode.id}, resultado:`, JSON.stringify(result, null, 2));
      
      // 3.3. Atualiza contexto
      context.lastResult = result;
      context.lastNode = currentNode.id;
      context.history.push({
        nodeId: currentNode.id,
        result,
        timestamp: new Date().toISOString(),
      });

      // 3.4. Emite evento de nó completado
      if (socket) {
        socket.emit('workflow_node_completed', {
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          nodeName: currentNode.data?.label || currentNode.id,
          result: result,
        });
      }

      // 3.5. Encontra próximo nó
      const nextEdge = findNextEdge(workflow, currentNode, context);
      
      if (!nextEdge) {
        // Sem próximo nó, finaliza
        if (socket) {
          socket.emit('workflow_node_completed', {
            nodeId: currentNode.id,
            nodeType: currentNode.type,
            nodeName: currentNode.data?.label || currentNode.id,
            result: result,
            isEnd: true,
          });
        }
        break;
      }

      // 3.6. Emite evento de edge avaliada
      if (socket) {
        socket.emit('workflow_edge_evaluated', {
          edgeId: nextEdge.id,
          source: nextEdge.source,
          target: nextEdge.target,
          conditionMet: evaluateEdgeCondition(nextEdge.condition, context),
        });
      }

      // 3.7. Avalia condição da edge
      if (evaluateEdgeCondition(nextEdge.condition, context)) {
        const nextNode = workflow.nodes.find(n => n.id === nextEdge.target);
        if (!nextNode) {
          console.warn(`⚠️ Nó ${nextEdge.target} não encontrado no workflow`);
          break;
        }
        currentNode = nextNode;
      } else {
        // Condição não atendida, finaliza
        break;
      }
    }

    if (executionCount >= MAX_EXECUTIONS) {
      throw new Error('Loop infinito detectado no workflow (máximo de 100 execuções)');
    }

    return {
      success: true,
      result: context.lastResult,
      path,
      context,
    };
  } catch (error) {
    console.error('❌ Erro ao executar workflow:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Mensagem de erro:', errorMessage);
    return {
      success: false,
      result: null,
      path: context.history.map(h => h.nodeId),
      context,
      error: errorMessage,
    };
  }
}

/**
 * Seleciona nó inicial baseado em edges do Start
 */
function selectInitialNode(
  workflow: Workflow,
  startNode: WorkflowNode,
  message: string
): WorkflowNode {
  const startEdges = workflow.edges.filter(e => e.source === startNode.id);
  
  // Avalia cada edge
  for (const edge of startEdges) {
    const testContext: ExecutionContext = {
      message,
      history: [],
      variables: {},
    };
    
    if (evaluateEdgeCondition(edge.condition, testContext)) {
      const targetNode = workflow.nodes.find(n => n.id === edge.target);
      if (targetNode) {
        return targetNode;
      }
    }
  }
  
  // Fallback: primeiro nó conectado ao Start
  if (startEdges.length > 0) {
    const targetNode = workflow.nodes.find(n => n.id === startEdges[0].target);
    if (targetNode) {
      return targetNode;
    }
  }
  
  throw new Error('Nenhum nó inicial encontrado');
}

/**
 * Executa um nó específico
 */
async function executeNode(
  node: WorkflowNode,
  context: ExecutionContext,
  agentManager: AgentManager,
  socket?: Socket
): Promise<any> {
  switch (node.type) {
    case 'agent':
      if (!node.agentName) {
        throw new Error(`Nó ${node.id} do tipo agent não tem agentName`);
      }
      
      // Busca configuração do agente pelo nome especificado no nó
      const agents = getAgentsConfig();
      const agentConfig = agents.find(a => a.name === node.agentName);
      
      if (!agentConfig) {
        throw new Error(`Agente ${node.agentName} não encontrado`);
      }
      
      // Executa o agente através do messageService com agente específico
      // Usa a mensagem do contexto ou a mensagem original
      const messageToProcess = context.message || '';
      
      if (!socket) {
        throw new Error('Socket é necessário para executar agente no workflow');
      }
      
      // Obtém a resposta do agente anterior (se houver)
      let previousAgentResponse = '';
      if (context.lastResult && context.lastResult.response) {
        previousAgentResponse = context.lastResult.response;
        console.log(`📥 Resposta do agente anterior obtida: "${previousAgentResponse.substring(0, 100)}${previousAgentResponse.length > 100 ? '...' : ''}"`);
      }
      
      // Processa templates nas instruções do agente
      // Substitui {{ input_user }} pela mensagem e {{ agent_response }} pela resposta do agente anterior
      const processedInstructions = processTemplate(agentConfig.instructions, {
        input_user: messageToProcess,
        agent_response: previousAgentResponse,
      });
      
      // Cria uma cópia do agentConfig com instruções processadas
      const processedAgentConfig = {
        ...agentConfig,
        instructions: processedInstructions,
      };
      
      // Obtém ou cria o agente específico do workflow (com instruções processadas)
      const agentId = await agentManager.getOrCreateAgent(processedAgentConfig);
      
      // Obtém o adaptador LLM
      const llmAdapter = getLLMAdapter();
      if (!llmAdapter) {
        throw new Error('LLM adapter não está configurado');
      }
      
      // Registra o prompt recebido pelo agente nos logs
      const threadId = getThreadId(socket.id) || socket.id; // Usa threadId se disponível, senão socket.id
      saveLog({
        type: 'agent_prompt',
        socketId: socket.id,
        threadId: threadId,
        agentName: agentConfig.name,
        agentId: agentId,
        message: messageToProcess,
        llmProvider: getCurrentLLMProvider(),
        metadata: {
          nodeId: node.id,
          nodeType: node.type,
          workflowNode: node.data?.label || node.id,
          agentDescription: agentConfig.description,
          agentModel: agentConfig.model,
          originalInstructions: agentConfig.instructions,
          processedInstructions: processedInstructions,
          previousAgentResponse: previousAgentResponse || undefined,
          hasPreviousAgentResponse: !!previousAgentResponse,
        }
      });
      
      console.log(`📤 Processando mensagem com agente "${agentConfig.name}" (ID: ${agentId}): "${messageToProcess}"`);
      console.log(`📝 Prompt registrado nos logs para agente "${agentConfig.name}"`);
      if (processedInstructions !== agentConfig.instructions) {
        console.log(`🔄 Instruções processadas com template: "${processedInstructions.substring(0, 100)}..."`);
      }
      
      // Processa a mensagem usando o agente específico (não seleciona pela mensagem)
      const processResult = await processMessageWithAgent(
        socket,
        messageToProcess,
        llmAdapter,
        agentId,
        processedAgentConfig
      );
      console.log(`✅ Processamento concluído. Sucesso: ${processResult.success}, Resposta: ${processResult.response?.substring(0, 100)}...`);
      
      return {
        agentName: node.agentName,
        config: {
          name: agentConfig.name,
          description: agentConfig.description,
        },
        message: messageToProcess,
        response: processResult.response || '',
        success: processResult.success,
        error: processResult.error,
      };
    
    case 'condition':
      // Nós de condição apenas avaliam
      return { 
        type: 'condition', 
        evaluated: true,
        condition: node.data?.condition || '',
      };
    
    case 'merge':
      // Nós de merge combinam resultados
      return {
        type: 'merge',
        merged: true,
        results: context.history.map(h => h.result),
      };
    
    case 'end':
      return { 
        type: 'end', 
        finished: true,
        result: context.lastResult,
      };
    
    default:
      return { type: node.type };
  }
}

/**
 * Encontra próximo edge válido
 */
function findNextEdge(
  workflow: Workflow,
  currentNode: WorkflowNode,
  context: ExecutionContext
): WorkflowEdge | null {
  const edges = workflow.edges.filter(e => e.source === currentNode.id);
  
  // Retorna primeira edge sem condição ou com condição atendida
  for (const edge of edges) {
    if (!edge.condition || evaluateEdgeCondition(edge.condition, context)) {
      return edge;
    }
  }
  
  return null;
}

/**
 * Avalia condição de uma edge
 */
function evaluateEdgeCondition(
  condition: EdgeCondition | undefined,
  context: ExecutionContext
): boolean {
  if (!condition) {
    return true; // Sem condição = sempre passa
  }

  switch (condition.type) {
    case 'shouldUse':
      if (condition.shouldUseRule) {
        return evaluateShouldUseRule(condition.shouldUseRule, context.message);
      }
      return true;
    
    case 'result':
      if (condition.when === 'always') return true;
      if (condition.when === 'success') {
        return !context.lastResult?.error && context.lastResult !== null;
      }
      if (condition.when === 'error') {
        return !!context.lastResult?.error || context.lastResult === null;
      }
      return true;
    
    case 'auto':
      return condition.when === 'always';
    
    case 'custom':
      // TODO: Implementar execução de script customizado
      console.warn('Condições customizadas ainda não implementadas');
      return true;
    
    default:
      return true;
  }
}

/**
 * Avalia regra shouldUse
 */
function evaluateShouldUseRule(rule: ShouldUseRule, message: string): boolean {
  if (!rule) return true;

  const lowerMessage = message.toLowerCase();

  switch (rule.type) {
    case 'keywords':
      if (rule.keywords && rule.keywords.length > 0) {
        return rule.keywords.some(kw => 
          lowerMessage.includes(kw.toLowerCase())
        );
      }
      return false;
    
    case 'regex':
      if (rule.pattern) {
        try {
          const regex = new RegExp(rule.pattern, 'i');
          return regex.test(message);
        } catch (error) {
          console.error('Erro ao avaliar regex:', error);
          return false;
        }
      }
      return false;
    
    case 'complex':
      if (!rule.rules || rule.rules.length === 0) {
        return false;
      }

      const operator = rule.operator || 'OR';
      const results = rule.rules.map(r => evaluateShouldUseRule(r, message));

      if (operator === 'AND') {
        return results.every(r => r === true);
      } else {
        // OR
        return results.some(r => r === true);
      }
    
    case 'default':
      // Default sempre retorna true, a menos que tenha exclude
      if (rule.exclude) {
        return !evaluateShouldUseRule(rule.exclude, message);
      }
      return true;
    
    default:
      return true;
  }
}

