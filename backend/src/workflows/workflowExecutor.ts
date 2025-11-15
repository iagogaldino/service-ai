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

      // 3.1. Determina o tipo real do nó (pode estar em data.type para compatibilidade com React Flow)
      const actualNodeType = currentNode.data?.type || currentNode.type;
      
      // 3.2. Emite evento de nó iniciado
      if (socket) {
        console.log(`📤 [Backend] Emitindo workflow_node_started para nó: ${currentNode.id} (tipo: ${actualNodeType})`);
        socket.emit('workflow_node_started', {
          nodeId: currentNode.id,
          nodeType: actualNodeType,
          nodeName: currentNode.data?.label || currentNode.id,
        });
      }

      // 3.3. Executa nó atual
      console.log(`🔄 Executando nó: ${currentNode.id} (tipo: ${currentNode.type}, tipo real: ${actualNodeType})`);
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

      // 3.4. Emite evento de nó completado (usa tipo real do nó)
      if (socket) {
        const actualNodeType = currentNode.data?.type || currentNode.type;
        console.log(`📤 [Backend] Emitindo workflow_node_completed para nó: ${currentNode.id} (tipo: ${actualNodeType})`);
        socket.emit('workflow_node_completed', {
          nodeId: currentNode.id,
          nodeType: actualNodeType,
          nodeName: currentNode.data?.label || currentNode.id,
          result: result,
        });
        console.log(`✅ [Backend] Evento workflow_node_completed emitido com sucesso para nó: ${currentNode.id}`);
      }

      // 3.5. Encontra próximo nó
      const nextEdge = findNextEdge(workflow, currentNode, context);
      
      if (!nextEdge) {
        // Sem próximo nó, finaliza
        if (socket) {
          const actualNodeType = currentNode.data?.type || currentNode.type;
          socket.emit('workflow_node_completed', {
            nodeId: currentNode.id,
            nodeType: actualNodeType,
            nodeName: currentNode.data?.label || currentNode.id,
            result: result,
            isEnd: true,
          });
          console.log(`📤 Evento workflow_node_completed emitido (fim do workflow) para nó: ${currentNode.id} (tipo: ${actualNodeType})`);
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
  // Determina o tipo real do nó (pode estar em data.type para compatibilidade com React Flow)
  // Verifica data.type ANTES de node.type para garantir que nós if-else e user-approval sejam reconhecidos
  const actualType = node.data?.type || node.type;
  
  // Se o tipo real for if-else ou user-approval, usa ele diretamente
  if (actualType === 'if-else' || actualType === 'user-approval') {
    switch (actualType) {
      case 'if-else':
        // Nós if-else apenas avaliam condições e retornam resultado
        // A seleção da edge correta é feita na função findNextEdge
        const ifElseConfig = node.data?.config;
        const conditions = ifElseConfig?.conditions || [];
        
        // Avalia cada condição e retorna o resultado
        let evaluatedCondition: string | null = null;
        for (const condition of conditions) {
          if (condition.condition) {
            // Processa template na condição
            const processedCondition = processTemplate(condition.condition, {
              input_user: context.message || '',
              agent_response: context.lastResult?.response || '',
            });
            
            console.log(`🔍 Avaliando condição if-else: "${processedCondition}"`);
          }
        }
        
        return {
          type: 'if-else',
          evaluated: true,
          conditionMet: evaluatedCondition !== null,
          evaluatedCondition: evaluatedCondition,
        };
      
      case 'user-approval':
        // Nós user-approval aguardam aprovação (não implementado ainda)
        return {
          type: 'user-approval',
          evaluated: true,
        };
    }
  }
  
  // Para outros tipos, usa o switch normal
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
  
  // Verifica se o nó atual é do tipo if-else (incluindo verificação em data.type)
  const actualType = currentNode.data?.type || currentNode.type;
  if (actualType === 'if-else') {
    const ifElseConfig = currentNode.data?.config;
    const conditions = ifElseConfig?.conditions || [];
    
    // Para nós if-else, avalia as condições na ordem e retorna a primeira que for verdadeira
    for (const condition of conditions) {
      if (condition.condition && condition.id) {
        // Processa template na condição
        const processedCondition = processTemplate(condition.condition, {
          input_user: context.message || '',
          agent_response: context.lastResult?.response || '',
        });
        
        // Avalia a condição (implementação simplificada por enquanto)
        // TODO: Implementar avaliação real usando CEL ou outra biblioteca
        const conditionMet = evaluateIfElseCondition(processedCondition, context);
        
        if (conditionMet) {
          // Encontra a edge correspondente a esta condição
          // O ID da edge deve ser no formato: source-condition-{conditionId}
          const conditionEdgeId = `source-condition-${condition.id}`;
          const conditionEdge = edges.find(e => 
            e.id.includes(conditionEdgeId) || 
            e.id.includes(`source-${condition.id}`) ||
            e.id === `reactflow__edge-${currentNode.id}source-condition-${condition.id}`
          );
          
          if (conditionEdge) {
            console.log(`✅ Condição if-else atendida: "${condition.caseName || condition.id}", seguindo para edge: ${conditionEdge.id}`);
            return conditionEdge;
          }
        }
      }
    }
    
    // Se nenhuma condição foi atendida, retorna a edge "else"
    const elseEdge = edges.find(e => 
      e.id.includes('source-else') ||
      e.id === `reactflow__edge-${currentNode.id}source-else`
    );
    
    if (elseEdge) {
      console.log(`✅ Nenhuma condição atendida, seguindo para edge else: ${elseEdge.id}`);
      return elseEdge;
    }
    
    // Fallback: retorna primeira edge se não encontrou else
    console.warn(`⚠️ Nenhuma edge else encontrada para nó if-else ${currentNode.id}, usando primeira edge`);
    return edges.length > 0 ? edges[0] : null;
  }
  
  // Para outros tipos de nós, retorna primeira edge sem condição ou com condição atendida
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
 * Avalia condição de if-else
 * Por enquanto, implementação simplificada que detecta condições básicas
 */
function evaluateIfElseCondition(
  condition: string,
  context: ExecutionContext
): boolean {
  if (!condition) {
    return false;
  }

  // Converte condição para minúsculas para comparação
  const lowerCondition = condition.toLowerCase();
  const inputUser = (context.message || '').toLowerCase();
  const agentResponse = (context.lastResult?.response || '').toLowerCase();

  // Substitui variáveis na condição
  let processedCondition = condition;
  processedCondition = processedCondition.replace(/\{\{\s*input_user\s*\}\}/gi, context.message || '');
  processedCondition = processedCondition.replace(/\{\{\s*agent_response\s*\}\}/gi, context.lastResult?.response || '');

  // Detecção básica de condições comuns
  // Exemplo: "mais de 10" -> verifica se input_user tem mais de 10 caracteres
  if (lowerCondition.includes('mais de') || lowerCondition.includes('maior que')) {
    const match = processedCondition.match(/(\d+)/);
    if (match) {
      const number = parseInt(match[1], 10);
      const length = (context.message || '').length;
      if (lowerCondition.includes('caracter') || lowerCondition.includes('caractere')) {
        return length > number;
      }
      // Por padrão, verifica comprimento do texto
      return length > number;
    }
  }

  // Condição sempre verdadeira por padrão (para desenvolvimento)
  // TODO: Implementar avaliação real usando CEL (Common Expression Language) ou outra biblioteca
  console.warn(`⚠️ Avaliação de condição if-else não totalmente implementada: "${condition}"`);
  return false; // Por padrão, retorna false para seguir para o else
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

