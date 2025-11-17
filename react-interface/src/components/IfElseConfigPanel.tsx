import React, { useState, useEffect } from 'react';
import { Copy, Trash2, Plus, ExternalLink } from 'lucide-react';
import { CustomNode, IfElseConfig, IfElseCondition } from '../types';
import VariableAutocomplete from './VariableAutocomplete';
import ConfirmDialog from './ConfirmDialog';

interface IfElseConfigPanelProps {
  node: CustomNode | null;
  onUpdate: (nodeId: string, config: IfElseConfig) => void;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
}

const IfElseConfigPanel: React.FC<IfElseConfigPanelProps> = ({ 
  node, 
  onUpdate, 
  onClose,
  onDelete 
}) => {
  if (!node || node.data.type !== 'if-else') {
    return null;
  }

  const [config, setConfig] = useState<IfElseConfig>(
    (node.data.config as IfElseConfig) || {
      conditions: [],
      elseLabel: 'Else',
    }
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Atualiza o config quando o node muda (quando seleciona outro nó)
  useEffect(() => {
    if (node && node.data.config) {
      setConfig(node.data.config as IfElseConfig);
    } else if (node) {
      setConfig({
        conditions: [],
        elseLabel: 'Else',
      });
    }
  }, [node?.id, node?.data.config]);

  const handleChange = (field: keyof IfElseConfig, value: any) => {
    const newConfig = { ...config, [field]: value };
    setConfig(newConfig);
    onUpdate(node.id, newConfig);
  };

  const handleConditionChange = (conditionId: string, field: keyof IfElseCondition, value: string) => {
    const newConditions = config.conditions.map(cond =>
      cond.id === conditionId ? { ...cond, [field]: value } : cond
    );
    handleChange('conditions', newConditions);
  };

  const handleAddCondition = () => {
    const newCondition: IfElseCondition = {
      id: `condition-${Date.now()}`,
      caseName: '',
      condition: '',
    };
    handleChange('conditions', [...config.conditions, newCondition]);
  };

  const handleDeleteCondition = (conditionId: string) => {
    const newConditions = config.conditions.filter(cond => cond.id !== conditionId);
    handleChange('conditions', newConditions);
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    onDelete(node.id);
    onClose();
    setShowDeleteConfirm(false);
  };

  const handleCopy = () => {
    // TODO: Implementar funcionalidade de copiar
    console.log('Copiar nó if/else');
  };

  return (
    <div 
      data-agent-panel
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        width: '400px',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: '24px',
        paddingBottom: '96px',
        paddingLeft: '16px',
        paddingRight: '16px',
        boxSizing: 'border-box',
        pointerEvents: 'none',
        zIndex: 999,
      }}>
      <div 
        className="sidebar-scroll"
        data-agent-panel
        style={{
          width: '100%',
          flex: 1,
          minHeight: 0,
          backgroundColor: '#1a1a1a',
          borderRadius: '12px',
          border: '1px solid #2a2a2a',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          pointerEvents: 'auto',
          zIndex: 1000,
        }}>
        <div style={{
          padding: '24px',
          borderBottom: '1px solid #2a2a2a',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}>
            <div>
              <h2 style={{
                fontSize: '20px',
                fontWeight: 600,
                color: '#ffffff',
                marginBottom: '4px',
              }}>
                If / else
              </h2>
              <p style={{
                fontSize: '14px',
                color: '#9ca3af',
              }}>
                Create conditions to branch your workflow
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={handleCopy}
                style={{
                  width: '32px',
                  height: '32px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#e0e0e0'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}
              >
                <Copy size={18} />
              </button>
              <button
                onClick={handleDelete}
                style={{
                  width: '32px',
                  height: '32px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#e0e0e0'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        </div>

        <div style={{ 
          padding: '24px', 
          flex: 1, 
          overflowY: 'auto',
          minHeight: 0,
        }}>
          {/* Condições If */}
          {config.conditions.map((condition, index) => (
            <div key={condition.id} style={{ marginBottom: '24px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}>
                <label style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#ffffff',
                }}>
                  If {index > 0 && `(${index + 1})`}
                </label>
                <button
                  onClick={() => handleDeleteCondition(condition.id)}
                  style={{
                    width: '24px',
                    height: '24px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              
              <div style={{ marginBottom: '12px' }}>
                <input
                  type="text"
                  value={condition.caseName || ''}
                  onChange={(e) => handleConditionChange(condition.id, 'caseName', e.target.value)}
                  placeholder="Case name (optional)"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: 'transparent',
                    border: '1px solid #2a2a2a',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '14px',
                  }}
                />
              </div>
              
              <div>
                <VariableAutocomplete
                  value={condition.condition}
                  onChange={(value) => handleConditionChange(condition.id, 'condition', value)}
                  placeholder="Enter condition, e.g. input == 5"
                  minHeight="80px"
                />
              </div>
            </div>
          ))}

          {/* Seção Else */}
          {config.conditions.length > 0 && (
            <div style={{ marginBottom: '24px', paddingTop: '16px', borderTop: '1px solid #2a2a2a' }}>
              <label style={{
                fontSize: '14px',
                fontWeight: 500,
                color: '#ffffff',
                marginBottom: '12px',
                display: 'block',
              }}>
                Else
              </label>
              <input
                type="text"
                value={config.elseLabel || 'Else'}
                onChange={(e) => handleChange('elseLabel', e.target.value)}
                placeholder="Else"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'transparent',
                  border: '1px solid #2a2a2a',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '14px',
                }}
              />
            </div>
          )}

          {/* Informação sobre CEL */}
          {config.conditions.length > 0 && (
            <div style={{
              marginBottom: '24px',
              padding: '12px',
              backgroundColor: '#1a1a1a',
              border: '1px solid #2a2a2a',
              borderRadius: '6px',
            }}>
              <p style={{
                fontSize: '12px',
                color: '#9ca3af',
                margin: 0,
                lineHeight: '1.5',
              }}>
                Use Common Expression Language to create a custom expression.{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    // TODO: Abrir link de documentação
                    console.log('Learn more about CEL');
                  }}
                  style={{
                    color: '#3b82f6',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                >
                  Learn more.
                </a>
              </p>
            </div>
          )}

          {/* Botão Add */}
          <button
            onClick={handleAddCondition}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #2a2a2a',
              backgroundColor: '#1a1a1a',
              color: '#ffffff',
              cursor: 'pointer',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background-color 0.2s, border-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#2a2a2a';
              e.currentTarget.style.borderColor = '#3a3a3a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#1a1a1a';
              e.currentTarget.style.borderColor = '#2a2a2a';
            }}
          >
            <Plus size={16} />
            Add
          </button>
        </div>
      </div>
      
      {/* Modal de confirmação de exclusão */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Deletar Nó If/Else"
        message="Tem certeza que deseja deletar este nó If/Else? Esta ação não pode ser desfeita."
        confirmText="Deletar"
        cancelText="Cancelar"
        type="danger"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};

export default IfElseConfigPanel;

