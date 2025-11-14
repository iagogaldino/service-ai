import React from 'react';
import { Trash2, Play, MousePointer2, Check, ChevronDown } from 'lucide-react';
import { Edge, Node } from 'reactflow';
import { CustomNodeData } from '../types';

interface EdgeConfigPanelProps {
  edge: Edge | null;
  sourceNode: Node<CustomNodeData> | null;
  targetNode: Node<CustomNodeData> | null;
  onClose: () => void;
  onDelete: (edgeId: string) => void;
}

const EdgeConfigPanel: React.FC<EdgeConfigPanelProps> = ({ 
  edge, 
  sourceNode, 
  targetNode,
  onClose,
  onDelete 
}) => {
  if (!edge) {
    return null;
  }

  const handleDelete = () => {
    if (window.confirm('Tem certeza que deseja deletar esta conexão?')) {
      onDelete(edge.id);
      onClose();
    }
  };

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'start':
        return <Play size={16} fill="white" />;
      case 'agent':
        return <MousePointer2 size={16} fill="white" />;
      default:
        return null;
    }
  };

  const getNodeColor = (type: string) => {
    switch (type) {
      case 'start':
        return '#14b8a6';
      case 'agent':
        return '#60a5fa';
      default:
        return '#3a3a3a';
    }
  };

  return (
      <div style={{
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
      }}>
      <div 
        className="sidebar-scroll"
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
              Edge
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#9ca3af',
            }}>
              Inspect connection
            </p>
          </div>
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

      <div style={{ 
        padding: '24px', 
        flex: 1, 
        overflowY: 'auto',
        minHeight: 0,
      }}>
        {/* Source */}
        <div style={{ 
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <label style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#9ca3af',
          }}>
            Source
          </label>
          {sourceNode && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}>
              <div style={{
                width: '24px',
                height: '24px',
                backgroundColor: getNodeColor(sourceNode.data.type),
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {getNodeIcon(sourceNode.data.type)}
              </div>
              <span style={{
                fontSize: '14px',
                fontWeight: 500,
                color: '#ffffff',
              }}>
                {sourceNode.data.label}
              </span>
            </div>
          )}
        </div>

        {/* Target */}
        <div style={{ 
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <label style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#9ca3af',
          }}>
            Target
          </label>
          {targetNode && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}>
              <div style={{
                width: '24px',
                height: '24px',
                backgroundColor: getNodeColor(targetNode.data.type),
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {getNodeIcon(targetNode.data.type)}
              </div>
              <span style={{
                fontSize: '14px',
                fontWeight: 500,
                color: '#ffffff',
              }}>
                {targetNode.data.label}
              </span>
            </div>
          )}
        </div>

        {/* Connection Status */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: 500,
            color: '#ffffff',
            marginBottom: '12px',
          }}>
            Connection status
          </label>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '6px',
          }}>
            <Check size={16} color="#10b981" strokeWidth={3} />
            <span style={{
              fontSize: '14px',
              fontWeight: 500,
              color: '#10b981',
            }}>
              Valid
            </span>
          </div>
          <p style={{
            fontSize: '13px',
            color: '#9ca3af',
            marginLeft: '0',
            marginTop: '4px',
          }}>
            Connection is set up correctly.
          </p>
        </div>

        {/* Source Output Schema */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: 500,
            color: '#ffffff',
            marginBottom: '8px',
          }}>
            Source output schema
          </label>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <span style={{
              fontSize: '14px',
              color: '#ffffff',
            }}>
              object
            </span>
            <ChevronDown size={16} color="#9ca3af" />
          </div>
        </div>

        {/* Target Input Schema */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: 500,
            color: '#ffffff',
            marginBottom: '8px',
          }}>
            Target input schema
          </label>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <span style={{
              fontSize: '14px',
              color: '#ffffff',
            }}>
              object
            </span>
            <ChevronDown size={16} color="#9ca3af" />
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default EdgeConfigPanel;

