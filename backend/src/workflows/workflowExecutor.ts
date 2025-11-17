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
      const result = await executeNode(currentNode, context, agentManager, socket, workflow);
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
      const nextEdge = await findNextEdge(workflow, currentNode, context, agentManager, socket);
      
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
  socket?: Socket,
  workflow?: Workflow // Adicionado para suportar execução de steps no WHILE
): Promise<any> {
  // Determina o tipo real do nó (pode estar em data.type para compatibilidade com React Flow)
  // Verifica data.type ANTES de node.type para garantir que nós if-else e user-approval sejam reconhecidos
  const actualType = node.data?.type || node.type;
  
  // Se o tipo real for if-else, user-approval ou while, usa ele diretamente
  if (actualType === 'if-else' || actualType === 'user-approval' || actualType === 'while') {
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
      
      case 'while':
        // Executa loop while
        return await executeWhileNode(node, context, agentManager, socket, workflow);
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
async function findNextEdge(
  workflow: Workflow,
  currentNode: WorkflowNode,
  context: ExecutionContext,
  agentManager: AgentManager,
  socket?: Socket
): Promise<WorkflowEdge | null> {
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
        
        // Avalia a condição usando agente LLM especializado
        const conditionMet = await evaluateIfElseCondition(processedCondition, context, agentManager, socket);
        
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
 * Avalia condição de if-else usando um agente LLM especializado
 * O agente analisa a condição e o contexto para determinar se é verdadeira
 */
async function evaluateIfElseCondition(
  condition: string,
  context: ExecutionContext,
  agentManager: AgentManager,
  socket?: Socket
): Promise<boolean> {
  if (!condition) {
    return false;
  }

  try {
    const llmAdapter = getLLMAdapter();
    if (!llmAdapter) {
      console.warn('⚠️ LLM adapter não disponível, usando avaliação simplificada');
      return evaluateIfElseConditionSimple(condition, context);
    }

    // Cria agente especializado para avaliação de condições
    const conditionAgentConfig: AgentConfig = {
      name: 'Condition Evaluator',
      description: 'Agente especializado em avaliar condições lógicas e booleanas',
      instructions: `Você é um agente especializado em avaliar condições lógicas.

Sua função é analisar uma condição e um contexto, e determinar se a condição é VERDADEIRA ou FALSA.

IMPORTANTE:
- Você deve responder APENAS com "true" ou "false" (sem aspas, sem explicações)
- Não adicione nenhum texto adicional, apenas "true" ou "false"
- Avalie a condição de forma lógica e precisa
- Considere o contexto fornecido (mensagem do usuário, resposta do agente anterior, etc.)

Exemplos:
- Condição: "input_user contém 'sim'" + Contexto: mensagem="sim, quero" → Resposta: true
- Condição: "agent_response tem mais de 100 caracteres" + Contexto: response="texto curto" → Resposta: false
- Condição: "input_user é um número maior que 10" + Contexto: mensagem="15" → Resposta: true

Avalie a condição fornecida e responda apenas "true" ou "false".`,
      model: '', // Usa modelo padrão do adapter (string vazia = padrão)
      tools: [],
      priority: 0,
      shouldUse: () => true, // Sempre disponível para avaliação de condições
    };

    // Prepara o prompt com a condição e o contexto
    const contextInfo = {
      input_user: context.message || '',
      agent_response: context.lastResult?.response || '',
      last_node: context.lastNode || '',
      variables: JSON.stringify(context.variables || {}),
    };

    const evaluationPrompt = `Avalie a seguinte condição:

CONDIÇÃO: "${condition}"

CONTEXTO:
- Mensagem do usuário (input_user): "${contextInfo.input_user}"
- Resposta do agente anterior (agent_response): "${contextInfo.agent_response}"
- Último nó executado: "${contextInfo.last_node}"
- Variáveis do workflow: ${contextInfo.variables}

Responda APENAS com "true" se a condição for VERDADEIRA, ou "false" se for FALSA.
Não adicione nenhum texto adicional, apenas "true" ou "false".`;

    // Cria thread temporária para avaliação
    const thread = await llmAdapter.createThread();
    
    // Adiciona mensagem do usuário
    await llmAdapter.addMessage(thread.id, 'user', evaluationPrompt);
    
    // Cria e executa o agente
    const agentId = await llmAdapter.getOrCreateAgent(conditionAgentConfig);
    const run = await llmAdapter.createRun(thread.id, agentId, socket);
    
    // Aguarda resposta
    const { message: response } = await llmAdapter.waitForRunCompletion(thread.id, run.id, socket);
    
    // Processa resposta - deve ser "true" ou "false"
    const normalizedResponse = response.trim().toLowerCase();
    const isTrue = normalizedResponse === 'true' || 
                   normalizedResponse === 'verdadeiro' ||
                   normalizedResponse.startsWith('true') ||
                   normalizedResponse.includes('verdadeiro');
    
    console.log(`🔍 Condição avaliada: "${condition}" → ${isTrue ? 'TRUE' : 'FALSE'}`);
    console.log(`   Resposta do agente: "${response}"`);
    
    return isTrue;
    
  } catch (error: any) {
    console.error('❌ Erro ao avaliar condição com agente LLM:', error);
    console.warn('⚠️ Fallback para avaliação simplificada');
    // Fallback para avaliação simplificada em caso de erro
    return evaluateIfElseConditionSimple(condition, context);
  }
}

/**
 * Avaliação simplificada de condição (fallback)
 * Usada quando o LLM não está disponível ou há erro
 */
function evaluateIfElseConditionSimple(
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

  // Verifica se contém palavras-chave
  if (lowerCondition.includes('contém') || lowerCondition.includes('contains')) {
    const match = processedCondition.match(/contém\s+['"]([^'"]+)['"]/i) || 
                  processedCondition.match(/contains\s+['"]([^'"]+)['"]/i);
    if (match) {
      const keyword = match[1].toLowerCase();
      return inputUser.includes(keyword) || agentResponse.includes(keyword);
    }
  }

  // Verifica comparações numéricas simples
  if (lowerCondition.includes('igual a') || lowerCondition.includes('==')) {
    const match = processedCondition.match(/(\d+)/);
    if (match) {
      const number = parseInt(match[1], 10);
      const inputNumber = parseInt(context.message || '0', 10);
      return inputNumber === number;
    }
  }

  // Por padrão, retorna false
  console.warn(`⚠️ Condição não reconhecida na avaliação simplificada: "${condition}"`);
  return false;
}

/**
 * Executa nó WHILE (loop condicional)
 * Estilo OpenAI Build Agents
 */
async function executeWhileNode(
  node: WorkflowNode,
  context: ExecutionContext,
  agentManager: AgentManager,
  socket?: Socket,
  workflow?: Workflow
): Promise<any> {
  const whileConfig = node.data?.config?.while;
  
  if (!whileConfig || !whileConfig.condition) {
    throw new Error(`Nó WHILE ${node.id} não tem condição configurada`);
  }

  const maxIterations = whileConfig.maxIterations || 100;
  const steps = whileConfig.steps || [];
  const condition = whileConfig.condition;

  console.log(`🔄 [WHILE] Iniciando loop no nó ${node.id}`);
  console.log(`   Condição: "${condition}"`);
  console.log(`   Max iterações: ${maxIterations}`);
  console.log(`   Steps: ${steps.length > 0 ? steps.join(', ') : 'nenhum'}`);

  const loopResults: any[] = [];
  let iteration = 0;
  let conditionMet = true;

  // Inicializa variável de iteração no contexto se não existir
  if (!context.variables) {
    context.variables = {};
  }
  context.variables.iteration = 0;
  context.variables.loop_count = 0;

  // Loop principal
  while (conditionMet && iteration < maxIterations) {
    iteration++;
    context.variables.iteration = iteration;
    context.variables.loop_count = iteration;

    console.log(`🔄 [WHILE] Iteração ${iteration}/${maxIterations}`);

    // Processa a condição substituindo variáveis do contexto
    // Suporta padrão Build Agents: context.*, inputs.*, step.*
    const processedCondition = processWhileCondition(condition, context, iteration);

    // Avalia condição usando agente LLM
    try {
      conditionMet = await evaluateIfElseCondition(processedCondition, context, agentManager, socket);
      console.log(`   Condição avaliada: ${conditionMet ? 'TRUE' : 'FALSE'}`);
    } catch (error: any) {
      console.error(`❌ Erro ao avaliar condição do WHILE:`, error);
      conditionMet = false; // Em caso de erro, para o loop
      break;
    }

    // Se condição ainda é verdadeira, executa os steps
    if (conditionMet) {
      console.log(`   Executando ${steps.length} step(s) na iteração ${iteration}`);

      // Executa cada step dentro do loop
      const stepResults: any[] = [];
      for (const stepId of steps) {
        if (!workflow) {
          console.warn(`   ⚠️ Workflow não disponível, não é possível executar step: ${stepId}`);
          stepResults.push({
            stepId,
            iteration,
            executed: false,
            error: 'Workflow não disponível',
          });
          continue;
        }

        // Encontra o nó do step no workflow
        const stepNode = workflow.nodes.find(n => n.id === stepId);
        if (!stepNode) {
          console.warn(`   ⚠️ Step não encontrado no workflow: ${stepId}`);
          stepResults.push({
            stepId,
            iteration,
            executed: false,
            error: 'Step não encontrado',
          });
          continue;
        }

        console.log(`   → Executando step: ${stepId} (${stepNode.type})`);
        
        try {
          // Executa o nó do step
          const stepResult = await executeNode(stepNode, context, agentManager, socket, workflow);
          
          // Atualiza contexto com resultado do step
          context.lastResult = stepResult;
          context.lastNode = stepId;
          context.history.push({
            nodeId: stepId,
            result: stepResult,
            timestamp: new Date().toISOString(),
          });

          stepResults.push({
            stepId,
            iteration,
            executed: true,
            result: stepResult,
          });

          // Emite evento de step completado
          if (socket) {
            socket.emit('workflow_node_completed', {
              nodeId: stepId,
              nodeType: stepNode.data?.type || stepNode.type,
              nodeName: stepNode.data?.label || stepId,
              result: stepResult,
              isWhileStep: true,
              whileIteration: iteration,
            });
          }
        } catch (error: any) {
          console.error(`   ❌ Erro ao executar step ${stepId}:`, error);
          stepResults.push({
            stepId,
            iteration,
            executed: false,
            error: error.message || 'Erro desconhecido',
          });
        }
      }

      loopResults.push({
        iteration,
        condition: processedCondition,
        conditionMet: true,
        stepResults,
        timestamp: new Date().toISOString(),
      });

      // Atualiza contexto com resultados da iteração
      context.variables.last_iteration_result = stepResults;
      context.variables.last_loop_result = stepResults[stepResults.length - 1];

      // Pequeno delay para evitar execução muito rápida
      await new Promise(resolve => setTimeout(resolve, 100));
    } else {
      console.log(`   Condição falsa, saindo do loop`);
    }
  }

  // Verifica se saiu por limite de iterações
  if (iteration >= maxIterations && conditionMet) {
    console.warn(`⚠️ [WHILE] Loop atingiu limite de ${maxIterations} iterações`);
  }

  const result = {
    type: 'while',
    condition: condition,
    iterations: iteration,
    maxIterations: maxIterations,
    completed: !conditionMet, // true se saiu porque condição ficou falsa
    stoppedByLimit: iteration >= maxIterations && conditionMet,
    results: loopResults,
    finalContext: {
      iteration: context.variables.iteration,
      loop_count: context.variables.loop_count,
    },
  };

  console.log(`✅ [WHILE] Loop concluído: ${iteration} iteração(ões) executada(s)`);
  
  return result;
}

/**
 * Processa condição do WHILE substituindo variáveis do padrão Build Agents
 * Suporta: context.*, inputs.*, step.*
 */
function processWhileCondition(
  condition: string,
  context: ExecutionContext,
  iteration: number
): string {
  let processed = condition;

  // Substitui context.*
  // Ex: context.count -> context.variables.count ou context.message
  processed = processed.replace(/context\.(\w+)/g, (match, varName) => {
    if (varName === 'message') {
      return `"${context.message || ''}"`;
    }
    if (varName === 'iteration' || varName === 'loop_count') {
      return String(iteration);
    }
    if (context.variables && context.variables[varName] !== undefined) {
      const value = context.variables[varName];
      return typeof value === 'string' ? `"${value}"` : String(value);
    }
    return 'undefined';
  });

  // Substitui inputs.*
  // Ex: inputs.foo -> context.variables.foo ou context.message
  processed = processed.replace(/inputs\.(\w+)/g, (match, varName) => {
    if (context.variables && context.variables[varName] !== undefined) {
      const value = context.variables[varName];
      return typeof value === 'string' ? `"${value}"` : String(value);
    }
    // Fallback para message se não encontrar na variável
    if (varName === 'message' || varName === 'text') {
      return `"${context.message || ''}"`;
    }
    return 'undefined';
  });

  // Substitui step.*
  // Ex: step.result -> último resultado do step
  processed = processed.replace(/step\.(\w+)/g, (match, prop) => {
    if (prop === 'result' && context.lastResult) {
      const result = context.lastResult;
      if (typeof result === 'string') {
        return `"${result}"`;
      }
      return JSON.stringify(result);
    }
    if (prop === 'response' && context.lastResult?.response) {
      return `"${context.lastResult.response}"`;
    }
    return 'undefined';
  });

  // Substitui variáveis de template padrão
  processed = processTemplate(processed, {
    input_user: context.message || '',
    agent_response: context.lastResult?.response || '',
    iteration: String(iteration),
    loop_count: String(iteration),
  });

  return processed;
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

