import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { 
  Play, 
  Square, 
  StickyNote, 
  Database, 
  Shield, 
  Grid3x3,
  GitBranch,
  RotateCw,
  Hand,
  ArrowRightLeft,
  RefreshCw,
  MousePointer2
} from 'lucide-react';
import { CustomNodeData, ComponentType, IfElseConfig, UserApprovalConfig } from '../types';

const iconMap: Record<ComponentType, React.ReactNode> = {
  start: <Play size={14} fill="white" />,
  agent: <MousePointer2 size={14} fill="white" />,
  classify: <div style={{ width: 14, height: 14, borderTop: '2px solid white', borderBottom: '2px solid white' }} />,
  end: <Square size={14} strokeWidth={2} fill="none" stroke="white" />,
  note: <StickyNote size={14} fill="white" />,
  'file-search': <Database size={14} fill="white" />,
  guardrails: <Shield size={14} fill="white" />,
  mcp: <Grid3x3 size={14} fill="white" />,
  'if-else': <GitBranch size={14} fill="white" />,
  while: <RotateCw size={14} fill="white" />,
  'user-approval': <Hand size={14} fill="white" />,
  transform: <ArrowRightLeft size={14} fill="white" />,
  'set-state': <RefreshCw size={14} fill="white" />,
};

const colorMap: Record<ComponentType, string> = {
  start: '#14b8a6', // teal
  agent: '#60a5fa', // light blue
  classify: '#f97316',
  end: '#10b981',
  note: '#6b7280',
  'file-search': '#eab308',
  guardrails: '#eab308',
  mcp: '#eab308',
  'if-else': '#f97316',
  while: '#f97316',
  'user-approval': '#f97316',
  transform: '#a855f7',
  'set-state': '#a855f7',
};

const CustomNode: React.FC<NodeProps<CustomNodeData>> = ({ data, selected, id }) => {
  const color = colorMap[data.type];
  const icon = iconMap[data.type];
  const isActive = data.isActive || false;
  const [isHovered, setIsHovered] = useState(false);
  const ifElseConfig = data.type === 'if-else' ? (data.config as IfElseConfig | undefined) : undefined;
  const userApprovalConfig = data.type === 'user-approval' ? (data.config as UserApprovalConfig | undefined) : undefined;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        backgroundColor: '#1a1a1a',
        border: `1px solid ${selected ? color : '#3a3a3a'}`,
        borderRadius: '10px',
        padding: data.type === 'user-approval' ? '0 14px 12px 14px' : '12px 14px',
        minWidth: '160px',
        transition: 'all 0.2s',
        boxShadow: selected ? `0 0 0 1px ${color}` : 'none',
        position: 'relative',
        zIndex: 1,
        display: 'block',
        visibility: 'visible',
        opacity: 1,
        overflow: 'hidden',
      }}
    >
      {/* Efeito de skeleton loading quando ativo */}
      {isActive && (
        <>
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: '-100%',
              width: '100%',
              height: '100%',
              background: 'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.4), transparent)',
              animation: 'skeleton-loading 1.5s infinite',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(90deg, transparent 0%, rgba(59, 130, 246, 0.1) 50%, transparent 100%)',
              backgroundSize: '200% 100%',
              animation: 'skeleton-shimmer 2s infinite',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        </>
      )}
      {/* Handle de entrada - não aparece no nó start */}
      {data.type !== 'start' && (
        <Handle
          type="target"
          position={Position.Left}
          style={{
            background: '#555',
            width: '12px',
            height: '12px',
            border: '2px solid #1a1a1a',
            opacity: isHovered ? 1 : 0,
            transition: 'opacity 0.2s',
          }}
        />
      )}
      {/* Header especial para user-approval */}
      {data.type === 'user-approval' ? (
        <div style={{ 
          backgroundColor: '#f97316', 
          borderRadius: '8px 8px 0 0',
          margin: '-12px -14px 12px -14px',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          position: 'relative',
          zIndex: 1,
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#ffffff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {userApprovalConfig?.name || data.label}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative', zIndex: 1 }}>
          <div style={{
            width: '32px',
            height: '32px',
            backgroundColor: color,
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#ffffff',
              marginBottom: data.type === 'agent' ? '2px' : '0',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {data.label}
            </div>
            {data.type === 'agent' && (
              <div style={{
                fontSize: '12px',
                color: '#9ca3af',
                fontWeight: 400,
              }}>
                Agent
              </div>
            )}
          </div>
        </div>
      )}
      {/* Exibir condições do if/else */}
      {data.type === 'if-else' && ifElseConfig && ifElseConfig.conditions.length > 0 && (
        <div style={{ marginTop: '12px', position: 'relative', zIndex: 1 }}>
          {ifElseConfig.conditions.map((condition, index) => {
            // Calcula a posição vertical do handle baseado na posição do slot
            // Header: ~60px, gap: 12px, cada slot: ~32px (8px padding * 2 + ~16px altura)
            const slotTop = 60 + 12 + (index * (32 + 6)); // 60 (header) + 12 (marginTop) + index * (altura slot + margin)
            const handleTop = `${slotTop + 16}px`; // Centro do slot
            
            return (
              <div
                key={condition.id}
                style={{
                  backgroundColor: '#0a0a0a',
                  borderRadius: '6px',
                  padding: '8px',
                  marginBottom: index < ifElseConfig.conditions.length - 1 ? '6px' : '0',
                  border: '1px solid #2a2a2a',
                  position: 'relative',
                }}
              >
                <div style={{
                  fontSize: '11px',
                  color: '#9ca3af',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {condition.caseName || `If ${index + 1}`}
                </div>
                <Handle
                  type="source"
                  id={`source-${condition.id}`}
                  position={Position.Right}
                  style={{
                    background: '#555',
                    width: '12px',
                    height: '12px',
                    border: '2px solid #1a1a1a',
                    opacity: isHovered ? 1 : 0,
                    transition: 'opacity 0.2s',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    right: '-6px',
                  }}
                />
              </div>
            );
          })}
          {ifElseConfig.conditions.length > 0 && (
            <div
              style={{
                backgroundColor: '#0a0a0a',
                borderRadius: '6px',
                padding: '8px',
                marginTop: '6px',
                border: '1px solid #2a2a2a',
                position: 'relative',
              }}
            >
              <div style={{
                fontSize: '11px',
                color: '#9ca3af',
              }}>
                {ifElseConfig.elseLabel || 'Else'}
              </div>
              <Handle
                type="source"
                id="source-else"
                position={Position.Right}
                style={{
                  background: '#555',
                  width: '12px',
                  height: '12px',
                  border: '2px solid #1a1a1a',
                  opacity: isHovered ? 1 : 0,
                  transition: 'opacity 0.2s',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  right: '-6px',
                }}
              />
            </div>
          )}
        </div>
      )}
      {/* Exibir slots do user-approval */}
      {data.type === 'user-approval' && (
        <div style={{ marginTop: '12px', position: 'relative', zIndex: 1 }}>
          {/* Slot Approve */}
          <div
            style={{
              backgroundColor: '#0a0a0a',
              borderRadius: '6px',
              padding: '8px',
              marginBottom: '6px',
              border: '1px solid #2a2a2a',
              position: 'relative',
            }}
          >
            <div style={{
              fontSize: '11px',
              color: '#9ca3af',
            }}>
              Approve
            </div>
            <Handle
              type="source"
              id="source-approve"
              position={Position.Right}
              style={{
                background: '#555',
                width: '12px',
                height: '12px',
                border: '2px solid #1a1a1a',
                opacity: isHovered ? 1 : 0,
                transition: 'opacity 0.2s',
                top: '50%',
                transform: 'translateY(-50%)',
                right: '-6px',
              }}
            />
          </div>
          {/* Slot Reject */}
          <div
            style={{
              backgroundColor: '#0a0a0a',
              borderRadius: '6px',
              padding: '8px',
              border: '1px solid #2a2a2a',
              position: 'relative',
            }}
          >
            <div style={{
              fontSize: '11px',
              color: '#9ca3af',
            }}>
              Reject
            </div>
            <Handle
              type="source"
              id="source-reject"
              position={Position.Right}
              style={{
                background: '#555',
                width: '12px',
                height: '12px',
                border: '2px solid #1a1a1a',
                opacity: isHovered ? 1 : 0,
                transition: 'opacity 0.2s',
                top: '50%',
                transform: 'translateY(-50%)',
                right: '-6px',
              }}
            />
          </div>
        </div>
      )}
      {/* Handle de saída padrão para outros tipos de nós */}
      {data.type !== 'if-else' && data.type !== 'user-approval' && (
        <Handle
          type="source"
          position={Position.Right}
          style={{
            background: '#555',
            width: '12px',
            height: '12px',
            border: '2px solid #1a1a1a',
            opacity: isHovered ? 1 : 0,
            transition: 'opacity 0.2s',
          }}
        />
      )}
      {/* Handle de saída padrão para if/else sem configuração */}
      {data.type === 'if-else' && (!ifElseConfig || ifElseConfig.conditions.length === 0) && (
        <Handle
          type="source"
          position={Position.Right}
          style={{
            background: '#555',
            width: '12px',
            height: '12px',
            border: '2px solid #1a1a1a',
            opacity: isHovered ? 1 : 0,
            transition: 'opacity 0.2s',
          }}
        />
      )}
      <style>{`
        @keyframes skeleton-loading {
          0% {
            left: -100%;
          }
          100% {
            left: 100%;
          }
        }
        @keyframes skeleton-shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
      `}</style>
    </div>
  );
};

export default CustomNode;

