import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Mic, Paperclip, Pencil } from 'lucide-react';
import { Node, Edge } from 'reactflow';
import { CustomNodeData } from '../types';
import { io, Socket } from 'socket.io-client';
import { convertReactFlowToWorkflow } from '../services/workflowService';

interface TestWorkflowPanelProps {
  nodes: Node<CustomNodeData>[];
  edges: Edge[];
  isClosing?: boolean;
  onClose: () => void;
  onWorkflowEvent?: (event: WorkflowEvent) => void;
}

interface WorkflowEvent {
  type: 'node_started' | 'node_completed' | 'edge_evaluated';
  nodeId?: string;
  edgeId?: string;
  source?: string;
  target?: string;
  conditionMet?: boolean;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const TestWorkflowPanel: React.FC<TestWorkflowPanelProps> = ({ 
  nodes, 
  edges, 
  isClosing = false,
  onClose,
  onWorkflowEvent,
  onExecutionTime
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Inicializar Socket.IO
  useEffect(() => {
    const API_URL = import.meta.env.DEV 
      ? 'http://localhost:3000'
      : (import.meta.env?.VITE_API_URL as string) || 'http://localhost:3000';

    const newSocket = io(API_URL, {
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('Socket conectado:', newSocket.id);
      // Restaurar thread se existir ou criar nova
      newSocket.emit('restore_thread', {});
    });

    newSocket.on('thread_restored', (data: { threadId: string }) => {
      console.log('Thread restaurada:', data.threadId);
      setThreadId(data.threadId);
    });

    newSocket.on('thread_created', (data: { threadId: string }) => {
      console.log('Thread criada:', data.threadId);
      setThreadId(data.threadId);
    });

    newSocket.on('load_conversation', (data: { messages: any[] }) => {
      if (data.messages && data.messages.length > 0) {
        const formattedMessages: Message[] = data.messages.map((msg: any) => ({
          id: msg.id || Date.now().toString(),
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content || msg.text || '',
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        }));
        setMessages(formattedMessages);
      }
    });

    newSocket.on('response', (data: { message: string; agentName?: string; tokenUsage?: any }) => {
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: data.message || '',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsProcessing(false);
    });

    // Listeners para medição de tempo de execução
    newSocket.on('agent_execution_start', (data: { agentName: string; agentId: string; runId: string; startTime: number }) => {
      console.log(`⏱️ Execução iniciada para agente "${data.agentName}" em ${new Date(data.startTime).toLocaleTimeString()}`);
    });

    newSocket.on('agent_execution_end', (data: { 
      agentName: string; 
      agentId: string; 
      runId: string; 
      startTime: number; 
      endTime: number; 
      duration: number; 
      durationSeconds: string;
    }) => {
      console.log(`⏱️ Execução concluída para agente "${data.agentName}" em ${data.durationSeconds}s (${data.duration}ms)`);
      
      // Adiciona mensagem informativa sobre o tempo de execução
      const executionMessage: Message = {
        id: `execution-${data.runId}`,
        role: 'assistant',
        content: `⏱️ Agente "${data.agentName}" executado em ${data.durationSeconds}s`,
        timestamp: new Date(data.endTime),
      };
      setMessages((prev) => [...prev, executionMessage]);
      
      // Encontra o nó correspondente ao agente e notifica o tempo de execução
      if (onExecutionTime) {
        // Tenta encontrar pelo nome do agente (mais comum em workflows)
        const agentNode = nodes.find(node => 
          node.data.type === 'agent' && 
          ((node.data.config as any)?.name === data.agentName || 
           (node.data.config as any)?.stackspotAgentId === data.agentId ||
           node.data.label === data.agentName)
        );
        if (agentNode) {
          onExecutionTime(agentNode.id, data.duration);
        } else {
          console.warn(`Nó não encontrado para agente "${data.agentName}" (ID: ${data.agentId})`);
        }
      }
    });

    // Listeners para eventos de workflow
    newSocket.on('workflow_started', () => {
      // Limpa estados anteriores quando um novo workflow inicia
      if (onWorkflowEvent) {
        // Emite evento especial para limpar estados (será tratado no App.tsx)
        onWorkflowEvent({
          type: 'node_started',
          nodeId: '__clear__',
        });
      }
    });

    newSocket.on('workflow_node_started', (data: { nodeId: string; nodeType: string; nodeName: string }) => {
      console.log('📥 [Frontend] Evento workflow_node_started recebido:', data);
      if (onWorkflowEvent) {
        onWorkflowEvent({
          type: 'node_started',
          nodeId: data.nodeId,
        });
      }
    });

    newSocket.on('workflow_node_completed', (data: { nodeId: string; nodeType: string; nodeName: string; isEnd?: boolean }) => {
      console.log('📥 [Frontend] Evento workflow_node_completed recebido:', data);
      if (onWorkflowEvent) {
        onWorkflowEvent({
          type: 'node_completed',
          nodeId: data.nodeId,
        });
      }
    });

    newSocket.on('workflow_edge_evaluated', (data: { edgeId: string; source: string; target: string; conditionMet: boolean }) => {
      if (onWorkflowEvent) {
        onWorkflowEvent({
          type: 'edge_evaluated',
          edgeId: data.edgeId,
          source: data.source,
          target: data.target,
          conditionMet: data.conditionMet,
        });
      }
    });

    newSocket.on('error', (error: any) => {
      console.error('Erro no socket:', error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: error.message || 'Erro desconhecido',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsProcessing(false);
    });

    newSocket.on('disconnect', () => {
      console.log('Socket desconectado');
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const handleSend = async () => {
    if (!inputValue.trim() || isProcessing || !socket) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const messageText = inputValue.trim();
    setInputValue('');
    setIsProcessing(true);

    // Enviar mensagem via Socket.IO com flag para executar workflow
    try {
      // Converte nós e edges atuais em um workflow
      console.log('📤 Convertendo workflow:', { nodesCount: nodes.length, edgesCount: edges.length });
      console.log('📋 Tipos de nós no frontend:', nodes.map(n => `${n.id}(${n.data?.type})`).join(', '));
      const startNodes = nodes.filter(n => n.data?.type === 'start');
      console.log('🚀 Nós Start no frontend:', startNodes.length, startNodes.map(n => n.id));
      
      // Garante que o nó "start" existe antes de converter
      let nodesToConvert = [...nodes];
      const hasStart = nodesToConvert.some(n => n.id === 'start' && n.data?.type === 'start');
      if (!hasStart) {
        console.warn('⚠️ Nó "start" não encontrado nos nós, adicionando...');
        nodesToConvert.unshift({
          id: 'start',
          type: 'custom',
          position: { x: 100, y: 300 },
          data: { label: 'Start', type: 'start' },
        });
      }
      
      const workflow = convertReactFlowToWorkflow(
        nodesToConvert,
        edges,
        'Test Workflow',
        'Workflow temporário para teste'
      );
      
      console.log('📦 Workflow convertido:', {
        nodesCount: workflow.nodes.length,
        edgesCount: workflow.edges.length,
        nodeTypes: workflow.nodes.map(n => `${n.id}(${n.type})`).join(', ')
      });
      
      // Verifica se o nó "start" está no workflow convertido
      const startInWorkflow = workflow.nodes.filter(n => n.type === 'start');
      console.log('🚀 Nós Start no workflow convertido:', startInWorkflow.length, startInWorkflow.map(n => n.id));
      
      socket.emit('message', {
        message: messageText,
        threadId: threadId || undefined,
        executeWorkflow: true, // Flag para executar workflow em vez de processar mensagem diretamente
        workflow: workflow, // Envia o workflow atual do frontend
      });
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Erro ao enviar mensagem. Verifique se o backend está rodando.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        right: '16px',
        top: '64px',
        width: '400px',
        height: 'calc(100vh - 160px)',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: '0',
        paddingBottom: '0',
        paddingLeft: '0',
        paddingRight: '0',
        boxSizing: 'border-box',
        pointerEvents: 'none',
        zIndex: 1000,
        animation: isClosing ? 'slideOutRight 0.3s ease-out' : 'slideInRight 0.3s ease-out',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#0a0a0a',
          border: '1px solid #1a1a1a',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: 'auto',
        }}
      >
      {/* Header */}
      <div
        style={{
          height: '48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: '1px solid #1a1a1a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#ffffff',
            }}
          >
            New chat
          </span>
          <button
            style={{
              padding: '4px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#9ca3af',
              cursor: 'pointer',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Pencil size={14} />
          </button>
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '6px',
            border: 'none',
            backgroundColor: 'transparent',
            color: '#9ca3af',
            cursor: 'pointer',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2a2a')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <X size={18} />
        </button>
      </div>

      {/* Chat Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0a0a0a',
        }}
      >
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px' }}>
          {messages.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9ca3af',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                  maxWidth: '400px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    border: '1px solid #2a2a2a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <Pencil size={24} color="#9ca3af" strokeWidth={1.5} />
                </div>
                <h2
                  style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    color: '#ffffff',
                    margin: 0,
                  }}
                >
                  Put your agent to the test.
                </h2>
                <p
                  style={{
                    fontSize: '14px',
                    color: '#9ca3af',
                    margin: 0,
                  }}
                >
                  Prompt the workflow as if you're the user.
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {messages.map((message) => (
                <div
                  key={message.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '70%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      backgroundColor:
                        message.role === 'user' ? '#3b82f6' : message.content.toLowerCase().includes('erro') || message.content.toLowerCase().includes('error') ? '#7f1d1d' : '#2a2a2a',
                      color: '#ffffff',
                      fontSize: '14px',
                      lineHeight: '1.5',
                      wordWrap: 'break-word',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {message.content}
                  </div>
                  <span
                    style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      paddingLeft: message.role === 'assistant' ? '4px' : '0',
                      paddingRight: message.role === 'user' ? '4px' : '0',
                    }}
                  >
                    {message.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
              {isProcessing && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                  }}
                >
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: '12px',
                      backgroundColor: '#2a2a2a',
                      color: '#9ca3af',
                      fontSize: '14px',
                    }}
                  >
                    Processing...
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div
        style={{
          padding: '16px',
          borderTop: '1px solid #1a1a1a',
          backgroundColor: '#0a0a0a',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '8px',
            backgroundColor: '#1a1a1a',
            borderRadius: '12px',
            padding: '8px 12px',
            border: '1px solid #2a2a2a',
          }}
        >
          <button
            style={{
              padding: '8px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#9ca3af',
              cursor: 'pointer',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2a2a')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Mic size={18} />
          </button>
          <button
            style={{
              padding: '8px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#9ca3af',
              cursor: 'pointer',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2a2a')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Paperclip size={18} />
          </button>
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Send a message..."
            style={{
              flex: 1,
              border: 'none',
              backgroundColor: 'transparent',
              color: '#ffffff',
              fontSize: '14px',
              resize: 'none',
              outline: 'none',
              minHeight: '24px',
              maxHeight: '120px',
              lineHeight: '1.5',
              padding: '4px 0',
              fontFamily: 'inherit',
            }}
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isProcessing}
            style={{
              width: '32px',
              height: '32px',
              border: 'none',
              backgroundColor: inputValue.trim() && !isProcessing ? '#3b82f6' : '#2a2a2a',
              color: '#ffffff',
              cursor: inputValue.trim() && !isProcessing ? 'pointer' : 'not-allowed',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              if (inputValue.trim() && !isProcessing) {
                e.currentTarget.style.backgroundColor = '#2563eb';
              }
            }}
            onMouseLeave={(e) => {
              if (inputValue.trim() && !isProcessing) {
                e.currentTarget.style.backgroundColor = '#3b82f6';
              }
            }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
      </div>
    </div>
  );
};

export default TestWorkflowPanel;

