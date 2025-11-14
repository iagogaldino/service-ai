import React, { useState, useEffect } from 'react';
import { Book, Trash2, Plus, Pencil, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { AgentConfig, CustomNode, ShouldUseRule } from '../types';
// Removido: useGroups - não há mais grupos

interface AgentConfigPanelProps {
  node: CustomNode | null;
  onUpdate: (nodeId: string, config: AgentConfig) => void;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
}

const AgentConfigPanel: React.FC<AgentConfigPanelProps> = ({ 
  node, 
  onUpdate, 
  onClose,
  onDelete 
}) => {
  if (!node || node.data.type !== 'agent') {
    return null;
  }

  const [config, setConfig] = useState<AgentConfig>(
    node.data.config || {
      name: node.data.label || 'Agent',
      description: '',
      instructions: '',
      includeChatHistory: true,
      model: 'gpt-4-turbo-preview',
      tools: [],
      outputFormat: 'text',
      shouldUse: {
        type: 'default',
      },
    }
  );
  const [showMore, setShowMore] = useState(false);
  const [modelParams, setModelParams] = useState({
    temperature: 1.00,
    maxTokens: 2048,
    topP: 1.00,
  });
  const [chatKit, setChatKit] = useState({
    displayResponseInChat: true,
    showInProgressMessages: true,
    showSearchSources: true,
  });
  const [advanced, setAdvanced] = useState({
    continueOnError: false,
    writeToConversationHistory: true,
  });

  const handleChange = (field: keyof AgentConfig, value: any) => {
    const newConfig = { ...config, [field]: value };
    setConfig(newConfig);
    onUpdate(node.id, newConfig);
  };
  
  // Removido: useEffect para grupos - não há mais grupos

  const handleDelete = () => {
    if (window.confirm('Tem certeza que deseja deletar este agente?')) {
      onDelete(node.id);
      onClose();
    }
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
                {config.name || 'My agent'}
              </h2>
              <p style={{
                fontSize: '14px',
                color: '#9ca3af',
              }}>
                Call the model with your instructions and tools.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{
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
                <Book size={18} />
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
          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              color: '#ffffff',
              marginBottom: '8px',
            }}>
              Name
          </label>
          <input
            type="text"
            value={config.name}
            onChange={(e) => handleChange('name', e.target.value)}
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

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              color: '#ffffff',
              marginBottom: '8px',
            }}>
              Description
          </label>
          <textarea
            value={config.description || ''}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Descrição breve do propósito do agente"
            style={{
              width: '100%',
              minHeight: '60px',
              padding: '10px 12px',
              backgroundColor: 'transparent',
              border: '1px solid #2a2a2a',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '14px',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
          </div>

          {/* Removido: Campo de grupo - não há mais grupos */}

          <div style={{ marginBottom: '24px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}>
            <label style={{
              fontSize: '14px',
              fontWeight: 500,
              color: '#ffffff',
            }}>
              Instructions
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{
                width: '24px',
                height: '24px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#e0e0e0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Plus size={16} />
              </button>
              <button style={{
                width: '24px',
                height: '24px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#e0e0e0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Pencil size={16} />
              </button>
            </div>
          </div>
          <textarea
            value={config.instructions}
            onChange={(e) => handleChange('instructions', e.target.value)}
            placeholder="Se o usuário pedir para analisar o curriculum, analise o file search"
            style={{
              width: '100%',
              minHeight: '120px',
              padding: '10px 12px',
              backgroundColor: 'transparent',
              border: '1px solid #2a2a2a',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '14px',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
          </div>

          <div style={{ marginBottom: '24px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <label style={{
              fontSize: '14px',
              fontWeight: 500,
              color: '#ffffff',
            }}>
              Include chat history
            </label>
            <button
              onClick={() => handleChange('includeChatHistory', !config.includeChatHistory)}
              style={{
                width: '44px',
                height: '24px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: config.includeChatHistory ? '#3b82f6' : '#2a2a2a',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background-color 0.2s',
              }}
            >
              <div style={{
                position: 'absolute',
                top: '2px',
                left: config.includeChatHistory ? '22px' : '2px',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                backgroundColor: '#fff',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              color: '#ffffff',
              marginBottom: '8px',
            }}>
              Model
          </label>
          <select
            value={config.model}
            onChange={(e) => handleChange('model', e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'transparent',
              border: '1px solid #2a2a2a',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            <option value="gpt-4-turbo-preview">gpt-4-turbo-preview</option>
            <option value="gpt-4">gpt-4</option>
            <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
          </select>
          </div>

          <div style={{ marginBottom: '24px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}>
            <label style={{
              fontSize: '14px',
              fontWeight: 500,
              color: '#ffffff',
            }}>
              Tools
            </label>
            <button style={{
              width: '24px',
              height: '24px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#e0e0e0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Plus size={16} />
            </button>
          </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              color: '#ffffff',
              marginBottom: '8px',
            }}>
              Output format
          </label>
          <select
            value={config.outputFormat}
            onChange={(e) => handleChange('outputFormat', e.target.value as 'text' | 'json' | 'structured')}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'transparent',
              border: '1px solid #2a2a2a',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            <option value="text">Text</option>
            <option value="json">JSON</option>
            <option value="structured">Structured</option>
          </select>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              color: '#ffffff',
              marginBottom: '8px',
            }}>
              Should Use Rule Type
          </label>
          <select
            value={config.shouldUse?.type || 'default'}
            onChange={(e) => {
              const type = e.target.value as ShouldUseRule['type'];
              handleChange('shouldUse', {
                ...config.shouldUse,
                type,
                // Limpa campos não relevantes quando muda o tipo
                ...(type === 'keywords' && { keywords: config.shouldUse?.keywords || [] }),
                ...(type === 'regex' && { pattern: config.shouldUse?.pattern || '' }),
                ...(type === 'default' && {}),
              });
            }}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'transparent',
              border: '1px solid #2a2a2a',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            <option value="default">Default</option>
            <option value="keywords">Keywords</option>
            <option value="regex">Regex</option>
            <option value="complex">Complex</option>
          </select>
          </div>

          {config.shouldUse?.type === 'keywords' && (
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: '#ffffff',
                marginBottom: '8px',
              }}>
                Keywords (separadas por vírgula)
          </label>
              <input
                type="text"
                value={config.shouldUse?.keywords?.join(', ') || ''}
                onChange={(e) => {
                  const keywords = e.target.value
                    .split(',')
                    .map(k => k.trim())
                    .filter(k => k.length > 0);
                  handleChange('shouldUse', {
                    ...config.shouldUse,
                    keywords,
                  });
                }}
                placeholder="ex: criar, create, código, code"
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
          )}

          {config.shouldUse?.type === 'regex' && (
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: '#ffffff',
                marginBottom: '8px',
              }}>
                Regex Pattern
          </label>
              <input
                type="text"
                value={config.shouldUse?.pattern || ''}
                onChange={(e) => {
                  handleChange('shouldUse', {
                    ...config.shouldUse,
                    pattern: e.target.value,
                  });
                }}
                placeholder="ex: (npm|node)\\s+[^\\s]"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'transparent',
                  border: '1px solid #2a2a2a',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          )}

          {/* More Section */}
          {showMore && (
            <>
              {/* Model parameters */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#ffffff',
                  marginBottom: '20px',
                }}>
                  Model parameters
                </h3>
                
                {/* Temperature */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}>
                    <label style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#ffffff',
                    }}>
                      Temperature
                    </label>
                    <span style={{
                      fontSize: '14px',
                      color: '#9ca3af',
                      fontFamily: 'monospace',
                    }}>
                      {modelParams.temperature.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.01"
                    value={modelParams.temperature}
                    onChange={(e) => setModelParams({ ...modelParams, temperature: parseFloat(e.target.value) })}
                    style={{
                      width: '100%',
                      height: '6px',
                      borderRadius: '3px',
                      background: '#2a2a2a',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  />
                </div>

                {/* Max tokens */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}>
                    <label style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#ffffff',
                    }}>
                      Max tokens
                    </label>
                    <span style={{
                      fontSize: '14px',
                      color: '#9ca3af',
                      fontFamily: 'monospace',
                    }}>
                      {modelParams.maxTokens}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="8192"
                    step="1"
                    value={modelParams.maxTokens}
                    onChange={(e) => setModelParams({ ...modelParams, maxTokens: parseInt(e.target.value) })}
                    style={{
                      width: '100%',
                      height: '6px',
                      borderRadius: '3px',
                      background: '#2a2a2a',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  />
                </div>

                {/* Top P */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}>
                    <label style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#ffffff',
                    }}>
                      Top P
                    </label>
                    <span style={{
                      fontSize: '14px',
                      color: '#9ca3af',
                      fontFamily: 'monospace',
                    }}>
                      {modelParams.topP.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={modelParams.topP}
                    onChange={(e) => setModelParams({ ...modelParams, topP: parseFloat(e.target.value) })}
                    style={{
                      width: '100%',
                      height: '6px',
                      borderRadius: '3px',
                      background: '#2a2a2a',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  />
                </div>
              </div>

              {/* ChatKit */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#ffffff',
                  marginBottom: '20px',
                }}>
                  ChatKit
                </h3>
                
                {/* Display response in chat */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <label style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#ffffff',
                    }}>
                      Display response in chat
                    </label>
                    <button
                      onClick={() => setChatKit({ ...chatKit, displayResponseInChat: !chatKit.displayResponseInChat })}
                      style={{
                        width: '44px',
                        height: '24px',
                        borderRadius: '12px',
                        border: 'none',
                        backgroundColor: chatKit.displayResponseInChat ? '#3b82f6' : '#2a2a2a',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'background-color 0.2s',
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: '2px',
                        left: chatKit.displayResponseInChat ? '22px' : '2px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: '#fff',
                        transition: 'left 0.2s',
                      }} />
                    </button>
                  </div>
                </div>

                {/* Show in-progress messages */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <label style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#ffffff',
                    }}>
                      Show in-progress messages
                    </label>
                    <button
                      onClick={() => setChatKit({ ...chatKit, showInProgressMessages: !chatKit.showInProgressMessages })}
                      style={{
                        width: '44px',
                        height: '24px',
                        borderRadius: '12px',
                        border: 'none',
                        backgroundColor: chatKit.showInProgressMessages ? '#3b82f6' : '#2a2a2a',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'background-color 0.2s',
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: '2px',
                        left: chatKit.showInProgressMessages ? '22px' : '2px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: '#fff',
                        transition: 'left 0.2s',
                      }} />
                    </button>
                  </div>
                </div>

                {/* Show search sources */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <label style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#ffffff',
                    }}>
                      Show search sources
                    </label>
                    <button
                      onClick={() => setChatKit({ ...chatKit, showSearchSources: !chatKit.showSearchSources })}
                      style={{
                        width: '44px',
                        height: '24px',
                        borderRadius: '12px',
                        border: 'none',
                        backgroundColor: chatKit.showSearchSources ? '#3b82f6' : '#2a2a2a',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'background-color 0.2s',
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: '2px',
                        left: chatKit.showSearchSources ? '22px' : '2px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: '#fff',
                        transition: 'left 0.2s',
                      }} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Advanced */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#ffffff',
                  marginBottom: '20px',
                }}>
                  Advanced
                </h3>
                
                {/* Continue on error */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <label style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#ffffff',
                    }}>
                      Continue on error
                    </label>
                    <button
                      onClick={() => setAdvanced({ ...advanced, continueOnError: !advanced.continueOnError })}
                      style={{
                        width: '44px',
                        height: '24px',
                        borderRadius: '12px',
                        border: 'none',
                        backgroundColor: advanced.continueOnError ? '#3b82f6' : '#2a2a2a',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'background-color 0.2s',
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: '2px',
                        left: advanced.continueOnError ? '22px' : '2px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: '#fff',
                        transition: 'left 0.2s',
                      }} />
                    </button>
                  </div>
                </div>

                {/* Write to conversation history */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <label style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#ffffff',
                    }}>
                      Write to conversation history
                    </label>
                    <button
                      onClick={() => setAdvanced({ ...advanced, writeToConversationHistory: !advanced.writeToConversationHistory })}
                      style={{
                        width: '44px',
                        height: '24px',
                        borderRadius: '12px',
                        border: 'none',
                        backgroundColor: advanced.writeToConversationHistory ? '#3b82f6' : '#2a2a2a',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'background-color 0.2s',
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: '2px',
                        left: advanced.writeToConversationHistory ? '22px' : '2px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: '#fff',
                        transition: 'left 0.2s',
                      }} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #2a2a2a',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <button
            onClick={() => setShowMore(!showMore)}
            style={{
              padding: '8px 12px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#e0e0e0'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}
          >
            {showMore ? 'Less' : 'More'}
            {showMore ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button style={{
            padding: '8px 16px',
            border: 'none',
            backgroundColor: '#2a2a2a',
            color: '#9ca3af',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'background-color 0.2s, color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#3a3a3a';
            e.currentTarget.style.color = '#e0e0e0';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#2a2a2a';
            e.currentTarget.style.color = '#9ca3af';
          }}
          >
            Evaluate
            <ExternalLink size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentConfigPanel;

