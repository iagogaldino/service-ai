import React, { useState, useEffect } from 'react';
import { 
  Send, 
  Square, 
  StickyNote, 
  FolderSearch, 
  Shield, 
  Grid3x3,
  GitBranch,
  RotateCw,
  ThumbsUp,
  ArrowRightLeft,
  RefreshCw,
  Check,
  Settings,
  X
} from 'lucide-react';
import { ComponentDefinition } from '../types';

const components: ComponentDefinition[] = [
  { id: 'agent', label: 'Agent', category: 'core', icon: 'agent', color: '#3b82f6' },
  { id: 'classify', label: 'Classify', category: 'core', icon: 'classify', color: '#f97316' },
  { id: 'end', label: 'End', category: 'core', icon: 'end', color: '#10b981' },
  { id: 'note', label: 'Note', category: 'core', icon: 'note', color: '#6b7280' },
  { id: 'file-search', label: 'File search', category: 'tools', icon: 'file-search', color: '#eab308' },
  { id: 'guardrails', label: 'Guardrails', category: 'tools', icon: 'guardrails', color: '#eab308' },
  { id: 'mcp', label: 'MCP', category: 'tools', icon: 'mcp', color: '#eab308' },
  { id: 'if-else', label: 'If / else', category: 'logic', icon: 'if-else', color: '#eab308' },
  { id: 'while', label: 'While', category: 'logic', icon: 'while', color: '#eab308' },
  { id: 'user-approval', label: 'User approval', category: 'logic', icon: 'user-approval', color: '#eab308' },
  { id: 'transform', label: 'Transform', category: 'data', icon: 'transform', color: '#a855f7' },
  { id: 'set-state', label: 'Set state', category: 'data', icon: 'set-state', color: '#a855f7' },
];

const iconMap: Record<string, React.ReactNode> = {
  agent: <Send size={12} fill="white" />,
  classify: (
    <div style={{ 
      width: 12, 
      height: 12, 
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}>
      <div style={{ width: '100%', height: '2px', backgroundColor: 'white', borderRadius: '1px' }} />
      <div style={{ width: '100%', height: '2px', backgroundColor: 'white', borderRadius: '1px' }} />
    </div>
  ),
  end: <Square size={12} strokeWidth={2} fill="none" />,
  note: <StickyNote size={12} />,
  'file-search': <FolderSearch size={12} />,
  guardrails: (
    <div style={{ position: 'relative', width: 12, height: 12 }}>
      <Shield size={12} fill="white" stroke="white" />
      <Check size={6} strokeWidth={3} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#eab308' }} />
    </div>
  ),
  mcp: <Grid3x3 size={12} />,
  'if-else': <GitBranch size={12} />,
  while: <RotateCw size={12} />,
  'user-approval': <ThumbsUp size={12} />,
  transform: <ArrowRightLeft size={12} />,
  'set-state': <RefreshCw size={12} />,
};

interface SidebarProps {
  onDragStart: (component: ComponentDefinition) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onDragStart }) => {
  const categories = ['core', 'tools', 'logic', 'data'] as const;
  const categoryLabels = {
    core: 'Core',
    tools: 'Tools',
    logic: 'Logic',
    data: 'Data',
  };

  // Estado para controlar quais componentes estão ativados
  const [enabledComponents, setEnabledComponents] = useState<Set<string>>(() => {
    // Carrega do localStorage ou usa todos ativados por padrão
    const saved = localStorage.getItem('enabledComponents');
    if (saved) {
      try {
        return new Set(JSON.parse(saved));
      } catch {
        return new Set(components.map(c => c.id));
      }
    }
    return new Set(components.map(c => c.id));
  });

  const [showSettings, setShowSettings] = useState(false);

  // Salva no localStorage quando mudar
  useEffect(() => {
    localStorage.setItem('enabledComponents', JSON.stringify(Array.from(enabledComponents)));
  }, [enabledComponents]);

  const toggleComponent = (componentId: string) => {
    setEnabledComponents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(componentId)) {
        newSet.delete(componentId);
      } else {
        newSet.add(componentId);
      }
      return newSet;
    });
  };

  const handleDragStart = (e: React.DragEvent, component: ComponentDefinition) => {
    e.dataTransfer.setData('application/reactflow', JSON.stringify(component));
    e.dataTransfer.effectAllowed = 'move';
    onDragStart(component);
  };

  return (
    <div style={{
      width: '240px',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      paddingTop: '24px',
      paddingBottom: '72px',
      paddingLeft: '16px',
      paddingRight: '16px',
      boxSizing: 'border-box',
      position: 'relative',
    }}>
      <div style={{
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
      }}>
        {/* Botão de configurações */}
        <div style={{
          padding: '12px',
          borderBottom: '1px solid #2a2a2a',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#9ca3af',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Components
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              width: '28px',
              height: '28px',
              border: 'none',
              backgroundColor: showSettings ? '#2a2a2a' : 'transparent',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#9ca3af',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#2a2a2a';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              if (!showSettings) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#9ca3af';
              }
            }}
          >
            <Settings size={16} />
          </button>
        </div>

        {/* Painel de configurações */}
        {showSettings && (
          <div style={{
            padding: '12px',
            borderBottom: '1px solid #2a2a2a',
            backgroundColor: '#0a0a0a',
            maxHeight: '300px',
            overflowY: 'auto',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#9ca3af',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Enable/Disable Components
              </div>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  width: '20px',
                  height: '20px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#9ca3af',
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
                <X size={14} />
              </button>
            </div>
            {categories.map(category => (
              <div key={category} style={{ marginBottom: '16px' }}>
                <div style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                  letterSpacing: '0.5px',
                }}>
                  {categoryLabels[category]}
                </div>
                {components
                  .filter(comp => comp.category === category)
                  .map(component => {
                    const isEnabled = enabledComponents.has(component.id);
                    return (
                      <div
                        key={component.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '6px 8px',
                          marginBottom: '4px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          backgroundColor: isEnabled ? 'transparent' : 'rgba(42, 42, 42, 0.3)',
                          opacity: isEnabled ? 1 : 0.5,
                        }}
                        onClick={() => toggleComponent(component.id)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(42, 42, 42, 0.5)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = isEnabled ? 'transparent' : 'rgba(42, 42, 42, 0.3)';
                        }}
                      >
                        <div style={{
                          width: '16px',
                          height: '16px',
                          border: `2px solid ${isEnabled ? component.color : '#6b7280'}`,
                          borderRadius: '4px',
                          backgroundColor: isEnabled ? component.color : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {isEnabled && <Check size={10} color="white" strokeWidth={3} />}
                        </div>
                        <div style={{
                          width: '20px',
                          height: '20px',
                          backgroundColor: component.color,
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          opacity: isEnabled ? 1 : 0.5,
                        }}>
                          {iconMap[component.icon]}
                        </div>
                        <span style={{ 
                          flex: 1, 
                          fontWeight: 400, 
                          fontSize: '12px',
                          color: isEnabled ? '#ffffff' : '#6b7280',
                        }}>
                          {component.label}
                        </span>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        )}

        {/* Lista de componentes */}
        <div
          className="sidebar-scroll"
          style={{ 
            padding: '12px 8px', 
            flex: 1, 
            overflowY: 'auto',
          }}>
          {categories.map(category => {
            const categoryComponents = components
              .filter(comp => comp.category === category && enabledComponents.has(comp.id));
            
            if (categoryComponents.length === 0) return null;
            
            return (
              <div key={category} style={{ marginBottom: '20px' }}>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  marginBottom: '10px',
                  marginLeft: '4px',
                  letterSpacing: '0.5px',
                }}>
                  {categoryLabels[category]}
                </div>
                {categoryComponents.map(component => (
                  <div
                    key={component.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, component)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 6px',
                      marginBottom: '2px',
                      cursor: 'grab',
                      borderRadius: '8px',
                      transition: 'all 0.2s',
                      color: '#ffffff',
                      fontSize: '13px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(42, 42, 42, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div style={{
                      width: '28px',
                      height: '28px',
                      backgroundColor: component.color,
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      flexShrink: 0,
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                    }}>
                      {iconMap[component.icon]}
                    </div>
                    <span style={{ flex: 1, fontWeight: 400, fontSize: '13px' }}>{component.label}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;

