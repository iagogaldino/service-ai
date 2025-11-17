import React, { useState, useRef } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NodeResizer } from '@reactflow/node-resizer';
import { RotateCw } from 'lucide-react';
import { CustomNodeData, WhileConfig } from '../types';

/**
 * Componente customizado para nó WHILE que funciona como container
 * Estilo OpenAI Build Agents
 */
const WhileNode: React.FC<NodeProps<CustomNodeData>> = ({ data, selected, id, width, height }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const whileConfig = data.type === 'while' ? (data.config as WhileConfig | undefined) : undefined;
  const isActive = data.isActive || false;

  // Garante que width e height sejam números válidos
  const nodeWidth = typeof width === 'number' ? width : 400;
  const nodeHeight = typeof height === 'number' ? height : 300;


  return (
    <div
      ref={containerRef}
      style={{
        width: nodeWidth,
        height: nodeHeight,
        position: 'relative',
        minWidth: 200,
        minHeight: 150,
      }}
      onMouseDown={(e) => {
        // Previne o arrasto do nó quando clica nos handles do NodeResizer
        const target = e.target as HTMLElement;
        const isResizeHandle = target.closest('.react-flow__resize-control');
        if (isResizeHandle) {
          e.stopPropagation();
          setIsResizing(true);
        }
      }}
      onMouseUp={() => {
        setIsResizing(false);
      }}
    >
      {/* NodeResizer para permitir redimensionamento */}
      <NodeResizer
        minWidth={200}
        minHeight={150}
        isVisible={selected}
        lineStyle={{
          border: '2px solid #3b82f6',
          borderRadius: '4px',
        }}
        handleStyle={{
          backgroundColor: '#3b82f6',
          border: '2px solid #1a1a1a',
          borderRadius: '4px',
          width: '12px',
          height: '12px',
        }}
        onResizeStart={(e) => {
          // O evento pode ser um MouseEvent ou outro tipo
          if (e && typeof e === 'object' && 'stopPropagation' in e && typeof e.stopPropagation === 'function') {
            e.stopPropagation();
          }
          setIsResizing(true);
          // Desabilita arrasto do nó durante redimensionamento
          const nodeElement = containerRef.current?.closest('.react-flow__node');
          if (nodeElement) {
            (nodeElement as HTMLElement).setAttribute('data-draggable', 'false');
            (nodeElement as HTMLElement).style.pointerEvents = 'none';
          }
        }}
        onResizeEnd={() => {
          setIsResizing(false);
          // Reabilita arrasto do nó após redimensionamento
          const nodeElement = containerRef.current?.closest('.react-flow__node');
          if (nodeElement) {
            (nodeElement as HTMLElement).setAttribute('data-draggable', 'true');
            (nodeElement as HTMLElement).style.pointerEvents = 'auto';
          }
        }}
      />
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          backgroundColor: 'transparent',
          border: `2px dashed ${selected ? '#9ca3af' : '#6b7280'}`,
          borderRadius: '12px',
          padding: '16px',
          minWidth: '200px',
          minHeight: '150px',
          width: '100%',
          height: '100%',
          transition: 'all 0.2s',
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          overflow: 'visible',
          boxSizing: 'border-box',
          pointerEvents: 'auto',
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

      {/* Handle de entrada */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: '#3b82f6',
          width: '10px',
          height: '10px',
          border: '2px solid #1a1a1a',
          opacity: 1,
          transition: 'opacity 0.2s',
        }}
      />

      {/* Header do container */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'row', 
        alignItems: 'flex-start',
        gap: '8px',
        marginBottom: '8px',
        position: 'relative',
        zIndex: 3,
      }}>
        <div style={{
          color: '#9ca3af',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: '2px',
        }}>
          <RotateCw size={16} strokeWidth={1.5} color="#9ca3af" />
        </div>
        <div style={{
          fontSize: '14px',
          fontWeight: 500,
          color: '#9ca3af',
          lineHeight: '1.4',
        }}>
          {data.label || 'While'}
        </div>
      </div>

      {/* Área para nós filhos será renderizada pelo React Flow usando parentId */}
      <div style={{
        flex: 1,
        width: '100%',
        minHeight: '100px',
        position: 'relative',
        pointerEvents: 'none', // Permite que os nós filhos sejam interativos
      }}>
        {/* Os nós filhos serão renderizados aqui pelo React Flow */}
      </div>

      {/* Handle de saída */}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: '#3b82f6',
          width: '10px',
          height: '10px',
          border: '2px solid #1a1a1a',
          opacity: 1,
          transition: 'opacity 0.2s',
        }}
      />

      {data.executionTime !== undefined && (
        <div style={{
          fontSize: '11px',
          color: '#3b82f6',
          fontWeight: 500,
          marginTop: '8px',
          position: 'relative',
          zIndex: 3,
        }}>
          ⏱️ {(data.executionTime / 1000).toFixed(2)}s
        </div>
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
    </div>
  );
};

export default WhileNode;

