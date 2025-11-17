import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  onConfirm,
  onCancel,
  type = 'danger',
}) => {
  if (!isOpen) return null;

  const getColors = () => {
    switch (type) {
      case 'danger':
        return {
          iconBg: '#ef4444',
          buttonBg: '#ef4444',
          buttonHover: '#dc2626',
        };
      case 'warning':
        return {
          iconBg: '#f59e0b',
          buttonBg: '#f59e0b',
          buttonHover: '#d97706',
        };
      case 'info':
        return {
          iconBg: '#3b82f6',
          buttonBg: '#3b82f6',
          buttonHover: '#2563eb',
        };
      default:
        return {
          iconBg: '#ef4444',
          buttonBg: '#ef4444',
          buttonHover: '#dc2626',
        };
    }
  };

  const colors = getColors();

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        backdropFilter: 'blur(4px)',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: '#1a1a1a',
          borderRadius: '12px',
          border: '1px solid #2a2a2a',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          width: '90%',
          maxWidth: '400px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: colors.iconBg,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={20} color="white" />
          </div>
          <div style={{ flex: 1 }}>
            <h3
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#ffffff',
                margin: 0,
                marginBottom: '4px',
              }}
            >
              {title}
            </h3>
            <p
              style={{
                fontSize: '14px',
                color: '#9ca3af',
                margin: 0,
                lineHeight: '1.5',
              }}
            >
              {message}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
            marginTop: '8px',
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              border: '1px solid #2a2a2a',
              backgroundColor: 'transparent',
              borderRadius: '8px',
              color: '#9ca3af',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#2a2a2a';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#9ca3af';
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '10px 20px',
              border: 'none',
              backgroundColor: colors.buttonBg,
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = colors.buttonHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = colors.buttonBg;
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;

