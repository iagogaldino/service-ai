import React from 'react';
import { Hand, MousePointer2, Undo2, Redo2 } from 'lucide-react';

interface BottomBarProps {
  onToolChange: (tool: 'pan' | 'select') => void;
  currentTool: 'pan' | 'select';
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const BottomBar: React.FC<BottomBarProps> = ({ 
  onToolChange, 
  currentTool, 
  onUndo, 
  onRedo,
  canUndo,
  canRedo 
}) => {
  return (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: '#1a1a1a',
      border: '1px solid #2a2a2a',
      borderRadius: '8px',
      padding: '8px',
      display: 'flex',
      gap: '4px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      zIndex: 1000,
    }}>
      <button
        onClick={() => onToolChange('pan')}
        style={{
          width: '36px',
          height: '36px',
          border: 'none',
          backgroundColor: currentTool === 'pan' ? '#2a2a2a' : 'transparent',
          color: '#e0e0e0',
          cursor: 'pointer',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          if (currentTool !== 'pan') e.currentTarget.style.backgroundColor = '#2a2a2a';
        }}
        onMouseLeave={(e) => {
          if (currentTool !== 'pan') e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <Hand size={18} />
      </button>
      <button
        onClick={() => onToolChange('select')}
        style={{
          width: '36px',
          height: '36px',
          border: 'none',
          backgroundColor: currentTool === 'select' ? '#2a2a2a' : 'transparent',
          color: '#e0e0e0',
          cursor: 'pointer',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          if (currentTool !== 'select') e.currentTarget.style.backgroundColor = '#2a2a2a';
        }}
        onMouseLeave={(e) => {
          if (currentTool !== 'select') e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <MousePointer2 size={18} />
      </button>
      <div style={{ width: '1px', backgroundColor: '#2a2a2a', margin: '4px 0' }} />
      <button
        onClick={onUndo}
        disabled={!canUndo}
        style={{
          width: '36px',
          height: '36px',
          border: 'none',
          backgroundColor: 'transparent',
          color: canUndo ? '#e0e0e0' : '#6b7280',
          cursor: canUndo ? 'pointer' : 'not-allowed',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          if (canUndo) e.currentTarget.style.backgroundColor = '#2a2a2a';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <Undo2 size={18} />
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        style={{
          width: '36px',
          height: '36px',
          border: 'none',
          backgroundColor: 'transparent',
          color: canRedo ? '#e0e0e0' : '#6b7280',
          cursor: canRedo ? 'pointer' : 'not-allowed',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          if (canRedo) e.currentTarget.style.backgroundColor = '#2a2a2a';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <Redo2 size={18} />
      </button>
    </div>
  );
};

export default BottomBar;

