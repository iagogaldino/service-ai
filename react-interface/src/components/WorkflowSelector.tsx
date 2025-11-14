import React, { useState, useEffect } from 'react';
import { Workflow, listWorkflows, getActiveWorkflow, activateWorkflow, createWorkflow, updateWorkflow, deleteWorkflow, convertReactFlowToWorkflow, convertWorkflowToReactFlow } from '../services/workflowService';
import { Node, Edge } from 'reactflow';
import { CustomNodeData } from '../types';
import { Loader2, Plus, Check, X } from 'lucide-react';

interface WorkflowSelectorProps {
  nodes: Node<CustomNodeData>[];
  edges: Edge[];
  onWorkflowSelect: (workflow: Workflow | null) => void;
  onWorkflowLoad: (nodes: Node<CustomNodeData>[], edges: Edge[]) => void;
}

const WorkflowSelector: React.FC<WorkflowSelectorProps> = ({
  nodes,
  edges,
  onWorkflowSelect,
  onWorkflowLoad,
}) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowVersion, setWorkflowVersion] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      setIsLoading(true);
      const [allWorkflows, active] = await Promise.all([
        listWorkflows(),
        getActiveWorkflow(),
      ]);
      setWorkflows(allWorkflows);
      setActiveWorkflow(active);
      if (active) {
        setSelectedWorkflowId(active.id);
        onWorkflowSelect(active);
      }
    } catch (error) {
      console.error('Erro ao carregar workflows:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWorkflowSelect = async (workflowId: string | null) => {
    if (!workflowId) {
      setSelectedWorkflowId(null);
      setActiveWorkflow(null);
      onWorkflowSelect(null);
      return;
    }

    const workflow = workflows.find(w => w.id === workflowId);
    if (!workflow) return;

    setSelectedWorkflowId(workflowId);
    
    // Carrega workflow no canvas
    const { nodes: workflowNodes, edges: workflowEdges } = convertWorkflowToReactFlow(workflow);
    onWorkflowLoad(workflowNodes, workflowEdges);
    onWorkflowSelect(workflow);
  };

  const handleActivateWorkflow = async (workflowId: string) => {
    try {
      await activateWorkflow(workflowId);
      await loadWorkflows();
    } catch (error) {
      console.error('Erro ao ativar workflow:', error);
    }
  };

  // Função para gerar próxima versão baseada em workflows existentes com o mesmo nome
  const getNextVersion = (workflowName: string, currentVersion?: string): string => {
    // Encontra todas as versões existentes deste workflow
    const sameNameWorkflows = workflows.filter(w => w.name === workflowName);
    const versions = sameNameWorkflows
      .map(w => w.version)
      .filter((v): v is string => !!v)
      .sort((a, b) => {
        // Ordena versões semanticamente (ex: "1.0.0", "1.1.0", "2.0.0")
        const partsA = a.split('.').map(Number);
        const partsB = b.split('.').map(Number);
        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
          const partA = partsA[i] || 0;
          const partB = partsB[i] || 0;
          if (partA !== partB) return partB - partA; // Ordem decrescente
        }
        return 0;
      });
    
    if (versions.length === 0) {
      // Primeira versão
      return '1.0.0';
    }
    
    // Se há versão atual, incrementa o patch
    if (currentVersion) {
      const parts = currentVersion.split('.').map(Number);
      parts[2] = (parts[2] || 0) + 1; // Incrementa patch
      return parts.join('.');
    }
    
    // Pega a versão mais recente e incrementa o patch
    const latestVersion = versions[0];
    const parts = latestVersion.split('.').map(Number);
    parts[2] = (parts[2] || 0) + 1; // Incrementa patch
    return parts.join('.');
  };

  const handleSaveWorkflow = async () => {
    if (!workflowName.trim()) {
      alert('Nome do workflow é obrigatório');
      return;
    }

    // Debug: Verifica se edges estão sendo passadas
    console.log('📦 Salvando workflow:', {
      nome: workflowName,
      nodes: nodes.length,
      edges: edges.length,
      edgesDetails: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
    });

    try {
      setIsSaving(true);
      
      // Se está criando nova versão, usa o mesmo nome mas gera nova versão
      if (isCreatingVersion && selectedWorkflowId) {
        const workflow = workflows.find(w => w.id === selectedWorkflowId);
        if (workflow) {
          const nextVersion = workflowVersion.trim() || getNextVersion(workflow.name, workflow.version);
          const newWorkflow = convertReactFlowToWorkflow(
            nodes, 
            edges, 
            workflow.name, // Mantém o mesmo nome
            workflowDescription.trim() || workflow.description,
            nextVersion
          );
          console.log('📝 Workflow convertido (nova versão):', {
            nodes: newWorkflow.nodes.length,
            edges: newWorkflow.edges.length,
            edgesDetails: newWorkflow.edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
          });
          await createWorkflow(newWorkflow);
        }
      } else if (selectedWorkflowId) {
        // Atualiza workflow existente (mantém versão)
        const workflow = workflows.find(w => w.id === selectedWorkflowId);
        if (workflow) {
          const updated = convertReactFlowToWorkflow(
            nodes, 
            edges, 
            workflowName.trim(),
            workflowDescription.trim() || workflow.description,
            workflow.version // Mantém a versão atual
          );
          console.log('📝 Workflow convertido (atualização):', {
            nodes: updated.nodes.length,
            edges: updated.edges.length,
            edgesDetails: updated.edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
          });
          await updateWorkflow(selectedWorkflowId, updated);
        }
      } else {
        // Cria novo workflow
        const version = workflowVersion.trim() || '1.0.0';
        const newWorkflow = convertReactFlowToWorkflow(
          nodes, 
          edges, 
          workflowName.trim(),
          workflowDescription.trim(),
          version
        );
        console.log('📝 Workflow convertido (novo):', {
          nodes: newWorkflow.nodes.length,
          edges: newWorkflow.edges.length,
          edgesDetails: newWorkflow.edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
        });
        await createWorkflow(newWorkflow);
      }
      
      await loadWorkflows();
      setShowSaveDialog(false);
      setWorkflowName('');
      setWorkflowVersion('');
      setWorkflowDescription('');
      setIsCreatingVersion(false);
    } catch (error) {
      console.error('Erro ao salvar workflow:', error);
      alert('Erro ao salvar workflow');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteWorkflow = async (workflowId: string) => {
    if (!confirm('Tem certeza que deseja deletar este workflow?')) {
      return;
    }

    try {
      await deleteWorkflow(workflowId);
      if (selectedWorkflowId === workflowId) {
        setSelectedWorkflowId(null);
        onWorkflowSelect(null);
      }
      await loadWorkflows();
    } catch (error) {
      console.error('Erro ao deletar workflow:', error);
      alert('Erro ao deletar workflow');
    }
  };

  if (isLoading) {
    return (
      <div style={{
        padding: '16px',
        color: '#9ca3af',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
        Carregando workflows...
      </div>
    );
  }

  return (
    <div style={{
      padding: '16px',
      backgroundColor: '#1a1a1a',
      borderRight: '1px solid #2a2a2a',
      height: '100%',
      overflowY: 'auto',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
      }}>
        <h3 style={{
          fontSize: '14px',
          fontWeight: 600,
          color: '#ffffff',
          margin: 0,
        }}>
          Workflows
        </h3>
        <button
          onClick={() => {
            if (selectedWorkflowId) {
              // Criar nova versão a partir do workflow selecionado
              const selected = workflows.find(w => w.id === selectedWorkflowId);
              if (selected) {
                setIsCreatingVersion(true);
                setWorkflowName(selected.name);
                setWorkflowDescription(selected.description || '');
                setWorkflowVersion(''); // Nova versão será gerada automaticamente
              }
            } else {
              // Novo workflow
              setIsCreatingVersion(false);
              setWorkflowName('');
              setWorkflowDescription('');
              setWorkflowVersion('1.0.0');
            }
            setShowSaveDialog(true);
          }}
          style={{
            padding: '6px 12px',
            border: '1px solid #3a3a3a',
            backgroundColor: '#2a2a2a',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '12px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Plus size={14} />
          Salvar
        </button>
      </div>

      {showSaveDialog && (
        <div style={{
          marginBottom: '16px',
          padding: '12px',
          backgroundColor: '#2a2a2a',
          borderRadius: '4px',
          border: '1px solid #3a3a3a',
        }}>
          {isCreatingVersion && (
            <div style={{
              padding: '8px',
              backgroundColor: '#1e3a8a',
              borderRadius: '4px',
              marginBottom: '12px',
              fontSize: '12px',
              color: '#93c5fd',
            }}>
              💡 Criando nova versão de "{workflowName}"
            </div>
          )}
          <input
            type="text"
            placeholder="Nome do workflow"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            disabled={isCreatingVersion}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: isCreatingVersion ? '#2a2a2a' : '#1a1a1a',
              border: '1px solid #3a3a3a',
              color: isCreatingVersion ? '#6b7280' : '#ffffff',
              fontSize: '13px',
              borderRadius: '4px',
              marginBottom: '8px',
              cursor: isCreatingVersion ? 'not-allowed' : 'text',
            }}
          />
          <textarea
            placeholder="Descrição (opcional)"
            value={workflowDescription}
            onChange={(e) => setWorkflowDescription(e.target.value)}
            rows={2}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#1a1a1a',
              border: '1px solid #3a3a3a',
              color: '#ffffff',
              fontSize: '13px',
              borderRadius: '4px',
              marginBottom: '8px',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
          <input
            type="text"
            placeholder={isCreatingVersion ? "Versão (ex: 1.0.0) - deixe vazio para gerar automaticamente" : "Versão (ex: 1.0.0)"}
            value={workflowVersion}
            onChange={(e) => setWorkflowVersion(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#1a1a1a',
              border: '1px solid #3a3a3a',
              color: '#ffffff',
              fontSize: '13px',
              borderRadius: '4px',
              marginBottom: '8px',
            }}
          />
          <div style={{
            display: 'flex',
            gap: '8px',
          }}>
            <button
              onClick={handleSaveWorkflow}
              disabled={isSaving}
              style={{
                flex: 1,
                padding: '6px 12px',
                border: 'none',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  Salvando...
                </>
              ) : (
                <>
                  <Check size={14} />
                  Salvar
                </>
              )}
            </button>
            <button
              onClick={() => {
                setShowSaveDialog(false);
                setWorkflowName('');
                setWorkflowVersion('');
                setWorkflowDescription('');
                setIsCreatingVersion(false);
              }}
              style={{
                padding: '6px 12px',
                border: 'none',
                backgroundColor: '#3a3a3a',
                color: '#ffffff',
                cursor: 'pointer',
                fontSize: '12px',
                borderRadius: '4px',
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        {workflows.length === 0 ? (
          <div style={{
            padding: '16px',
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '13px',
          }}>
            Nenhum workflow salvo
          </div>
        ) : (
          workflows.map(workflow => {
            // Agrupa workflows por nome para mostrar versões
            const sameNameWorkflows = workflows.filter(w => w.name === workflow.name);
            const isFirstOfName = sameNameWorkflows.indexOf(workflow) === 0;
            
            return (
            <div
              key={workflow.id}
              style={{
                padding: '12px',
                backgroundColor: selectedWorkflowId === workflow.id ? '#2a2a2a' : '#1f1f1f',
                border: `1px solid ${selectedWorkflowId === workflow.id ? '#3b82f6' : '#2a2a2a'}`,
                borderRadius: '4px',
                cursor: 'pointer',
              }}
              onClick={() => handleWorkflowSelect(workflow.id)}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '4px',
              }}>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}>
                  <span style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#ffffff',
                  }}>
                    {workflow.name}
                  </span>
                  {workflow.version && (
                    <span style={{
                      fontSize: '11px',
                      color: '#9ca3af',
                    }}>
                      v{workflow.version}
                    </span>
                  )}
                </div>
                {activeWorkflow?.id === workflow.id && (
                  <span style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    backgroundColor: '#3b82f6',
                    color: '#ffffff',
                    borderRadius: '2px',
                  }}>
                    Ativo
                  </span>
                )}
              </div>
              {workflow.description && (
                <div style={{
                  fontSize: '12px',
                  color: '#9ca3af',
                  marginBottom: '8px',
                }}>
                  {workflow.description}
                </div>
              )}
              <div style={{
                display: 'flex',
                gap: '8px',
                marginTop: '8px',
              }}>
                {activeWorkflow?.id !== workflow.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleActivateWorkflow(workflow.id);
                    }}
                    style={{
                      flex: 1,
                      padding: '4px 8px',
                      border: 'none',
                      backgroundColor: '#3a3a3a',
                      color: '#ffffff',
                      cursor: 'pointer',
                      fontSize: '11px',
                      borderRadius: '3px',
                    }}
                  >
                    Ativar
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteWorkflow(workflow.id);
                  }}
                  style={{
                    padding: '4px 8px',
                    border: 'none',
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontSize: '11px',
                    borderRadius: '3px',
                  }}
                >
                  Deletar
                </button>
              </div>
            </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default WorkflowSelector;

