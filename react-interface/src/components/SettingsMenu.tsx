import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { getLLMConfig, updateLLMConfig, LLMConfig } from '../services/apiService';

interface SettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsMenu: React.FC<SettingsMenuProps> = ({ isOpen, onClose }) => {
  const [showControls, setShowControls] = useState(() => {
    const saved = localStorage.getItem('showFlowControls');
    return saved ? JSON.parse(saved) : false;
  });

  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<'openai' | 'stackspot' | 'ollama'>('openai');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Carrega configuração ao abrir o menu
  useEffect(() => {
    if (isOpen) {
      loadLLMConfig();
    }
  }, [isOpen]);

  const loadLLMConfig = async () => {
    try {
      setIsLoading(true);
      const config = await getLLMConfig();
      setLlmConfig(config);
      setSelectedProvider(config.llmProvider);
    } catch (error) {
      console.error('Erro ao carregar configuração de LLM:', error);
      setSaveMessage({ type: 'error', text: 'Erro ao carregar configuração' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleProviderChange = async (provider: 'openai' | 'stackspot' | 'ollama') => {
    if (isSaving) return;
    
    // Verifica se o provider escolhido está configurado
    if (provider === 'openai' && !llmConfig?.openai.configured) {
      setSaveMessage({ 
        type: 'error', 
        text: 'OpenAI não está configurado. Configure a API key primeiro.' 
      });
      return;
    }
    
    if (provider === 'stackspot' && !llmConfig?.stackspot.configured) {
      setSaveMessage({ 
        type: 'error', 
        text: 'StackSpot não está configurado. Configure as credenciais primeiro.' 
      });
      return;
    }
    
    // Ollama sempre está configurado (não precisa de credenciais)

    try {
      setIsSaving(true);
      setSaveMessage(null);
      
      const result = await updateLLMConfig({ llmProvider: provider });
      
      if (result.success) {
        setSelectedProvider(provider);
        const providerName = provider === 'openai' ? 'OpenAI' : provider === 'stackspot' ? 'StackSpot' : 'Ollama';
        setSaveMessage({ 
          type: 'success', 
          text: `Provider alterado para ${providerName}` 
        });
        // Recarrega configuração
        await loadLLMConfig();
        
        // Limpa mensagem após 3 segundos
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage({ type: 'error', text: result.error || 'Erro ao atualizar provider' });
      }
    } catch (error: any) {
      console.error('Erro ao atualizar provider:', error);
      setSaveMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Erro ao atualizar provider' 
      });
    } finally {
      setIsSaving(false);
    }
  };

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

        {/* Seção de LLM Provider */}
        <div style={{
          marginTop: '24px',
          paddingTop: '24px',
          borderTop: '1px solid #2a2a2a',
        }}>
          <label style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#ffffff',
            marginBottom: '12px',
            display: 'block',
          }}>
            Provider LLM
          </label>
          
          {isLoading ? (
            <div style={{ color: '#9ca3af', fontSize: '12px' }}>Carregando...</div>
          ) : (
            <>
              <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}>
              <button
                onClick={() => handleProviderChange('openai')}
                disabled={isSaving || selectedProvider === 'openai'}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: selectedProvider === 'openai' ? '2px solid #3b82f6' : '1px solid #2a2a2a',
                  backgroundColor: selectedProvider === 'openai' ? '#1e3a5f' : '#1a1a1a',
                  color: '#ffffff',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.6 : 1,
                  fontSize: '13px',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>OpenAI</span>
                {llmConfig?.openai.configured && (
                  <span style={{
                    fontSize: '11px',
                    color: '#10b981',
                    marginLeft: '8px',
                  }}>✓</span>
                )}
              </button>
              
              <button
                onClick={() => handleProviderChange('stackspot')}
                disabled={isSaving || selectedProvider === 'stackspot'}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: selectedProvider === 'stackspot' ? '2px solid #3b82f6' : '1px solid #2a2a2a',
                  backgroundColor: selectedProvider === 'stackspot' ? '#1e3a5f' : '#1a1a1a',
                  color: '#ffffff',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.6 : 1,
                  fontSize: '13px',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>StackSpot</span>
                {llmConfig?.stackspot.configured && (
                  <span style={{
                    fontSize: '11px',
                    color: '#10b981',
                    marginLeft: '8px',
                  }}>✓</span>
                )}
              </button>
              
              <button
                onClick={() => handleProviderChange('ollama')}
                disabled={isSaving || selectedProvider === 'ollama'}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: selectedProvider === 'ollama' ? '2px solid #3b82f6' : '1px solid #2a2a2a',
                  backgroundColor: selectedProvider === 'ollama' ? '#1e3a5f' : '#1a1a1a',
                  color: '#ffffff',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.6 : 1,
                  fontSize: '13px',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>Ollama</span>
                {llmConfig?.ollama.configured && (
                  <span style={{
                    fontSize: '11px',
                    color: '#10b981',
                    marginLeft: '8px',
                  }}>✓</span>
                )}
              </button>
            </div>
            
            {saveMessage && (
              <div style={{
                marginTop: '12px',
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: saveMessage.type === 'success' ? '#10b98120' : '#ef444420',
                color: saveMessage.type === 'success' ? '#10b981' : '#ef4444',
                fontSize: '12px',
              }}>
                {saveMessage.text}
              </div>
            )}
            
            {llmConfig && (
              <div style={{
                marginTop: '12px',
                fontSize: '11px',
                color: '#9ca3af',
              }}>
                {selectedProvider === 'openai' && llmConfig.openai.configured && (
                  <div>API Key: {llmConfig.openai.apiKeyPreview}</div>
                )}
                {selectedProvider === 'stackspot' && llmConfig.stackspot.configured && (
                  <div>Client ID: {llmConfig.stackspot.clientIdPreview}</div>
                )}
                {selectedProvider === 'ollama' && llmConfig.ollama.configured && (
                  <div>Base URL: {llmConfig.ollama.baseUrl}<br />Model: {llmConfig.ollama.defaultModel}</div>
                )}
              </div>
            )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default SettingsMenu;

