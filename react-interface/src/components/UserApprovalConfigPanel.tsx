import React, { useState } from 'react';
import { Copy, Trash2, Plus } from 'lucide-react';
import { CustomNode, UserApprovalConfig } from '../types';
import VariableAutocomplete from './VariableAutocomplete';

interface UserApprovalConfigPanelProps {
  node: CustomNode | null;
  onUpdate: (nodeId: string, config: UserApprovalConfig) => void;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
}

const UserApprovalConfigPanel: React.FC<UserApprovalConfigPanelProps> = ({ 
  node, 
  onUpdate, 
  onClose,
  onDelete 
}) => {
  if (!node || node.data.type !== 'user-approval') {
    return null;
  }

  const [config, setConfig] = useState<UserApprovalConfig>(
    (node.data.config as UserApprovalConfig) || {
      name: 'User approval',
      message: '',
    }
  );

  const handleChange = (field: keyof UserApprovalConfig, value: any) => {
    const newConfig = { ...config, [field]: value };
    setConfig(newConfig);
    onUpdate(node.id, newConfig);
  };

  const handleDelete = () => {
    if (window.confirm('Tem certeza que deseja deletar este nó User approval?')) {
      onDelete(node.id);
      onClose();
    }
  };

  const handleCopy = () => {
    // TODO: Implementar funcionalidade de copiar
    console.log('Copiar nó user approval');
  };

  const handleAddContext = () => {
    // TODO: Implementar funcionalidade de adicionar contexto
    console.log('Adicionar contexto');
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
                User approval
              </h2>
              <p style={{
                fontSize: '14px',
                color: '#9ca3af',
              }}>
                Pause for a human to approve or reject a step
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
          {/* Campo Name */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{
              fontSize: '14px',
              fontWeight: 500,
              color: '#ffffff',
              marginBottom: '8px',
              display: 'block',
            }}>
              Name
            </label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="User approval"
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

          {/* Campo Message */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{
              fontSize: '14px',
              fontWeight: 500,
              color: '#ffffff',
              marginBottom: '8px',
              display: 'block',
            }}>
              Message
            </label>
            <div style={{ position: 'relative' }}>
              <VariableAutocomplete
                value={config.message || ''}
                onChange={(value) => handleChange('message', value)}
                placeholder="Describe the message to show the user. Eg. ok to proceed?"
                minHeight="120px"
              />
              <button
                onClick={handleAddContext}
                style={{
                  position: 'absolute',
                  bottom: '8px',
                  right: '8px',
                  padding: '6px 12px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'color 0.2s, background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.style.backgroundColor = '#2a2a2a';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#9ca3af';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Plus size={14} />
                Add context {'{=}'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserApprovalConfigPanel;

