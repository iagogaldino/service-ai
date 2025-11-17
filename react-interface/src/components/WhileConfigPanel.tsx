import React, { useState, useEffect } from 'react';
import { Copy, Trash2, Bookmark } from 'lucide-react';
import { CustomNode, WhileConfig } from '../types';
import VariableAutocomplete from './VariableAutocomplete';
import ConfirmDialog from './ConfirmDialog';

interface WhileConfigPanelProps {
  node: CustomNode | null;
  onUpdate: (nodeId: string, config: WhileConfig) => void;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
}

const WhileConfigPanel: React.FC<WhileConfigPanelProps> = ({ 
  node, 
  onUpdate, 
  onClose,
  onDelete 
}) => {
  if (!node || node.data.type !== 'while') {
    return null;
  }

  const [config, setConfig] = useState<WhileConfig>(
    (node.data.config as WhileConfig) || {
      while: {
        condition: '',
        maxIterations: 100,
        steps: [],
      },
    }
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Atualiza o config quando o node muda (quando seleciona outro nó)
  useEffect(() => {
    if (node && node.data.config) {
      setConfig(node.data.config as WhileConfig);
    } else if (node) {
      setConfig({
        while: {
          condition: '',
          maxIterations: 100,
          steps: [],
        },
      });
    }
  }, [node?.id, node?.data.config]);

  const handleChange = (field: keyof WhileConfig['while'], value: any) => {
    const newConfig: WhileConfig = {
      ...config,
      while: {
        ...config.while,
        [field]: value,
      },
    };
    setConfig(newConfig);
    onUpdate(node.id, newConfig);
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
    console.log('Copiar nó While');
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
                While
              </h2>
              <p style={{
                fontSize: '14px',
                color: '#9ca3af',
              }}>
                Loop while a condition is true
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
          {/* Expression */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{
              fontSize: '14px',
              fontWeight: 500,
              color: '#ffffff',
              marginBottom: '8px',
              display: 'block',
            }}>
              Expression
            </label>
            <VariableAutocomplete
              value={config.while.condition || ''}
              onChange={(value) => handleChange('condition', value)}
              placeholder="e.g. input.foo == 5"
              minHeight="80px"
            />
            <p style={{
              fontSize: '12px',
              color: '#9ca3af',
              marginTop: '8px',
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

          {/* Max Iterations */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{
              fontSize: '14px',
              fontWeight: 500,
              color: '#ffffff',
              marginBottom: '8px',
              display: 'block',
            }}>
              Max Iterations
            </label>
            <input
              type="number"
              value={config.while.maxIterations || 100}
              onChange={(e) => handleChange('maxIterations', parseInt(e.target.value) || 100)}
              min="1"
              max="1000"
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
            <p style={{
              fontSize: '12px',
              color: '#9ca3af',
              marginTop: '8px',
              margin: 0,
            }}>
              Maximum number of loop iterations to prevent infinite loops (default: 100)
            </p>
          </div>

          {/* Steps Info */}
          <div style={{
            marginBottom: '24px',
            padding: '12px',
            backgroundColor: '#0a0a0a',
            border: '1px solid #2a2a2a',
            borderRadius: '6px',
          }}>
            <p style={{
              fontSize: '12px',
              color: '#9ca3af',
              margin: 0,
              lineHeight: '1.5',
            }}>
              <strong style={{ color: '#ffffff' }}>Steps:</strong> Configure the steps to be repeated inside the loop by connecting nodes to this While node. The steps will be executed in order on each iteration while the condition is true.
            </p>
          </div>
        </div>
      </div>
      
      {/* Modal de confirmação de exclusão */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Deletar Nó While"
        message="Tem certeza que deseja deletar este nó While? Esta ação não pode ser desfeita."
        confirmText="Deletar"
        cancelText="Cancelar"
        type="danger"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};

export default WhileConfigPanel;

