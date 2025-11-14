import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface SettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsMenu: React.FC<SettingsMenuProps> = ({ isOpen, onClose }) => {
  const [showControls, setShowControls] = useState(() => {
    const saved = localStorage.getItem('showFlowControls');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    if (showControls !== undefined) {
      localStorage.setItem('showFlowControls', JSON.stringify(showControls));
      // Dispara evento customizado para notificar outros componentes
      window.dispatchEvent(new CustomEvent('flowControlsVisibilityChanged', { 
        detail: { showControls } 
      }));
    }
  }, [showControls]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          zIndex: 9998,
        }}
      />
      {/* Menu */}
      <div
        style={{
          position: 'fixed',
          top: '60px',
          right: '20px',
          width: '280px',
          backgroundColor: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
          zIndex: 9999,
          padding: '16px',
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}>
          <h3 style={{
            fontSize: '16px',
            fontWeight: 600,
            color: '#ffffff',
            margin: 0,
          }}>
            Configurações
          </h3>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              backgroundColor: 'transparent',
              color: '#9ca3af',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: '4px',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#e0e0e0'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}>
          <label style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#ffffff',
            cursor: 'pointer',
          }}>
            Mostrar controles de zoom
          </label>
          <button
            onClick={() => setShowControls(!showControls)}
            style={{
              width: '44px',
              height: '24px',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: showControls ? '#3b82f6' : '#2a2a2a',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background-color 0.2s',
            }}
          >
            <div style={{
              position: 'absolute',
              top: '2px',
              left: showControls ? '22px' : '2px',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: '#fff',
              transition: 'left 0.2s',
            }} />
          </button>
        </div>
      </div>
    </>
  );
};

export default SettingsMenu;

