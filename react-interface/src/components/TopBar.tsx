import React from 'react';
import { Pencil, Play, MoreVertical, Settings, Code, ChevronsUpDown, Compass } from 'lucide-react';

const TopBar: React.FC = () => {
  return (
    <div style={{
      height: '48px',
      backgroundColor: 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
    }}>
      {/* Left Section */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <button style={{
          border: 'none',
          backgroundColor: 'transparent',
          color: '#9ca3af',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          padding: '4px',
        }}>
          <span style={{ fontSize: '16px' }}>←</span>
        </button>
        <span style={{
          fontSize: '13px',
          fontWeight: 500,
          color: '#ffffff',
        }}>
          TeleAco
        </span>
        <button style={{
          padding: '4px 10px',
          border: 'none',
          backgroundColor: '#2a2a2a',
          color: '#9ca3af',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 500,
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#3a3a3a'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
        >
          <span>v1 production</span>
          <ChevronsUpDown size={12} />
        </button>
      </div>

      {/* Center Section - Segmented Button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
      }}>
        <div style={{
          display: 'flex',
          backgroundColor: '#2a2a2a',
          borderRadius: '8px',
          overflow: 'hidden',
          border: '1px solid #2a2a2a',
        }}>
          <button style={{
            padding: '6px 12px',
            border: 'none',
            backgroundColor: '#2a2a2a',
            color: '#ffffff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRight: '1px solid #1a1a1a',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#3a3a3a'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
          >
            <Pencil size={16} />
          </button>
          <button style={{
            padding: '6px 12px',
            border: 'none',
            backgroundColor: '#2a2a2a',
            color: '#ffffff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#3a3a3a'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
          >
            <Play size={16} />
          </button>
        </div>
      </div>

      {/* Right Section */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <button style={{
          padding: '6px',
          border: 'none',
          backgroundColor: 'transparent',
          color: '#9ca3af',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <MoreVertical size={18} />
        </button>
        <button style={{
          padding: '6px',
          border: 'none',
          backgroundColor: 'transparent',
          color: '#9ca3af',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <Settings size={18} />
        </button>
        <button style={{
          padding: '6px',
          border: 'none',
          backgroundColor: 'transparent',
          color: '#9ca3af',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <Compass size={18} />
        </button>
        <button style={{
          padding: '6px 12px',
          border: 'none',
          backgroundColor: 'transparent',
          color: '#9ca3af',
          cursor: 'pointer',
          fontSize: '13px',
          borderRadius: '4px',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          Evaluate
        </button>
        <button style={{
          padding: '6px 12px',
          border: 'none',
          backgroundColor: 'transparent',
          color: '#9ca3af',
          cursor: 'pointer',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          borderRadius: '4px',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <Code size={15} />
          Code
        </button>
        <button style={{
          padding: '6px 12px',
          border: 'none',
          backgroundColor: '#2a2a2a',
          color: '#9ca3af',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 500,
          borderRadius: '6px',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#3a3a3a'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
        >
          Deploy
        </button>
      </div>
    </div>
  );
};

export default TopBar;

