import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AVAILABLE_VARIABLES, filterVariables, extractSearchText, isInsideVariable, VariableDefinition } from '../utils/variableAutocomplete';

// Cria um Set com os nomes das variáveis disponíveis para busca rápida
const AVAILABLE_VARIABLE_NAMES = new Set(AVAILABLE_VARIABLES.map(v => v.name));

interface VariableAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  minHeight?: string;
}

const VariableAutocomplete: React.FC<VariableAutocompleteProps> = ({
  value,
  onChange,
  onKeyDown,
  placeholder,
  style,
  minHeight = '120px',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<VariableDefinition[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const valueKeyRef = useRef(0); // Key para forçar re-render quando value mudar externamente

  // Sincroniza o textarea quando o prop value mudar externamente
  // IMPORTANTE: Só sincronizar se o textarea NÃO tiver foco (usuário não está digitando)
  useEffect(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const currentValue = textarea.value || '';
      const newValue = value || '';
      const hasFocus = document.activeElement === textarea;
      
      // Só atualizar se:
      // 1. O valor realmente mudou
      // 2. O textarea NÃO tem foco (usuário não está digitando)
      // 3. O valor atual do textarea é diferente do novo valor
      if (currentValue !== newValue && !hasFocus) {
        const cursorPos = textarea.selectionStart || 0;
        textarea.value = newValue;
        valueKeyRef.current += 1;
        // Restaurar posição do cursor
        setTimeout(() => {
          if (textareaRef.current) {
            const newCursorPos = Math.min(cursorPos, newValue.length);
            textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
          }
        }, 0);
      }
    }
  }, [value]);

  // Atualiza sugestões quando o texto ou posição do cursor muda
  const updateSuggestions = useCallback(() => {
    if (!textareaRef.current) return;

    const textareaValue = textareaRef.current.value || '';
    const position = textareaRef.current.selectionStart || 0;

    if (isInsideVariable(textareaValue, position)) {
      const searchText = extractSearchText(textareaValue, position);
      const filtered = filterVariables(searchText);
      
      if (filtered.length > 0) {
        setSuggestions(filtered);
        setShowSuggestions(true);
        setSelectedIndex(0);
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleKeyUp = () => {
      setTimeout(() => updateSuggestions(), 10);
    };
    const handleClick = () => updateSuggestions();
    const handleSelect = () => updateSuggestions();
    
    textarea.addEventListener('keyup', handleKeyUp);
    textarea.addEventListener('click', handleClick);
    textarea.addEventListener('select', handleSelect);

    return () => {
      textarea.removeEventListener('keyup', handleKeyUp);
      textarea.removeEventListener('click', handleClick);
      textarea.removeEventListener('select', handleSelect);
    };
  }, [updateSuggestions]);

  // Atualiza posição do popup quando necessário
  useEffect(() => {
    if (!showSuggestions || !containerRef.current || !suggestionsRef.current) return;

    const updatePosition = () => {
      if (!containerRef.current || !suggestionsRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const width = Math.max(320, containerRef.current.offsetWidth);
      
      suggestionsRef.current.style.top = `${rect.bottom + 4 + window.scrollY}px`;
      suggestionsRef.current.style.left = `${rect.left + window.scrollX}px`;
      suggestionsRef.current.style.width = `${width}px`;
      suggestionsRef.current.style.visibility = 'visible';
    };

    requestAnimationFrame(() => {
      updatePosition();
    });
    
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [showSuggestions]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Obter valor diretamente do evento - não interferir com o comportamento padrão
    const newValue = e.target.value;
    // Notificar o componente pai de forma assíncrona para não bloquear
    requestAnimationFrame(() => {
      onChange(newValue);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    const beforeValue = textarea?.value || '';
    const beforeSelectionStart = textarea?.selectionStart || 0;
    
    // Permitir Ctrl+Z (undo) e Ctrl+Y (redo) funcionarem normalmente
    // Também permitir Ctrl+A (selecionar tudo), Ctrl+C (copiar), Ctrl+V (colar), Ctrl+X (cortar)
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === 'z' || key === 'y' || key === 'a' || key === 'c' || key === 'v' || key === 'x') {
        // Não fazer nada - deixar o navegador gerenciar esses atalhos
        if (onKeyDown) {
          onKeyDown(e);
        }
        return;
      }
    }
    
    // CRÍTICO: Para Backspace e Delete, NUNCA fazer nada além de permitir comportamento padrão
    if (e.key === 'Backspace' || e.key === 'Delete') {
      // Fechar sugestões se estiverem abertas
      if (showSuggestions) {
        setShowSuggestions(false);
      }
      
      // NÃO prevenir comportamento padrão - deixar o navegador apagar normalmente
      // NÃO chamar onChange aqui - deixar o onChange natural do textarea fazer isso
      
      if (onKeyDown) {
        onKeyDown(e);
      }
      
      // Verificar após um pequeno delay se o valor mudou
      setTimeout(() => {
        if (textareaRef.current) {
          const afterValue = textareaRef.current.value;
          const afterSelectionStart = textareaRef.current.selectionStart;
          const beforeSelectionEnd = textarea?.selectionEnd || beforeSelectionStart;
          const hasSelection = beforeSelectionStart !== beforeSelectionEnd;
          
          // Se o valor não mudou mas deveria ter mudado, forçar a atualização manualmente
          if (beforeValue === afterValue) {
            let newValue: string;
            let newCursorPos: number;
            
            if (hasSelection) {
              // Há texto selecionado - apagar a seleção inteira
              newValue = beforeValue.substring(0, beforeSelectionStart) + beforeValue.substring(beforeSelectionEnd);
              newCursorPos = beforeSelectionStart;
            } else if (beforeSelectionStart > 0 && beforeSelectionStart <= beforeValue.length) {
              // Não há seleção - apagar um caractere antes do cursor
              newValue = beforeValue.substring(0, beforeSelectionStart - 1) + beforeValue.substring(beforeSelectionStart);
              newCursorPos = beforeSelectionStart - 1;
            } else {
              // Não deveria mudar
              return;
            }
            
            if (textareaRef.current) {
              // Usar document.execCommand para manter o histórico de undo/redo
              // Primeiro, selecionar o texto que precisa ser removido
              if (hasSelection) {
                textareaRef.current.setSelectionRange(beforeSelectionStart, beforeSelectionEnd);
                // Tentar usar deleteCommand para manter o histórico
                const deleted = document.execCommand('delete', false);
                if (!deleted) {
                  // Fallback: atualizar manualmente se execCommand não funcionar
                  textareaRef.current.value = newValue;
                  textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                } else {
                  // Se execCommand funcionou, apenas ajustar a posição do cursor
                  setTimeout(() => {
                    if (textareaRef.current) {
                      textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                    }
                  }, 0);
                }
              } else {
                // Para um único caractere, tentar usar deleteCommand
                textareaRef.current.setSelectionRange(beforeSelectionStart - 1, beforeSelectionStart);
                const deleted = document.execCommand('delete', false);
                if (!deleted) {
                  // Fallback: atualizar manualmente
                  textareaRef.current.value = newValue;
                  textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                } else {
                  setTimeout(() => {
                    if (textareaRef.current) {
                      textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                    }
                  }, 0);
                }
              }
              
              // Atualizar o valor via onChange após um pequeno delay para garantir que o undo funcione
              setTimeout(() => {
                if (textareaRef.current) {
                  onChange(textareaRef.current.value);
                }
              }, 0);
            }
          }
        }
      }, 10);
      
      return; // Retornar imediatamente sem fazer mais nada
    }
    
    if (e.key === 'Escape') {
      setShowSuggestions(false);
      if (onKeyDown) {
        onKeyDown(e);
      }
      return;
    }
    
    // Só interceptar navegação nas sugestões se elas estiverem abertas
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertVariable(suggestions[selectedIndex]);
        return;
      }
    }
    
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  const insertVariable = (variable: VariableDefinition) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const currentValue = textarea.value || '';
    const position = textarea.selectionStart || 0;
    const textBeforeCursor = currentValue.substring(0, position);
    const textAfterCursor = currentValue.substring(position);
    
    const lastOpenBrace = textBeforeCursor.lastIndexOf('{{');
    if (lastOpenBrace === -1) return;
    
    const beforeVariable = currentValue.substring(0, lastOpenBrace);
    const variableText = `{{ ${variable.name} }}`;
    const newValue = beforeVariable + variableText + textAfterCursor;
    
    // Atualizar textarea diretamente
    textarea.value = newValue;
    onChange(newValue);
    
    // Posicionar cursor
    setTimeout(() => {
      if (textareaRef.current) {
        const newPosition = beforeVariable.length + variableText.length;
        textareaRef.current.setSelectionRange(newPosition, newPosition);
        textareaRef.current.focus();
      }
    }, 0);
    
    setShowSuggestions(false);
  };

  const handleSuggestionClick = (variable: VariableDefinition) => {
    insertVariable(variable);
  };

  // Função para destacar variáveis no texto
  const highlightVariables = (text: string) => {
    const safeText = text || '';
    if (!safeText) return [{ text: '', isVariable: false }];
    
    const variableRegex = /\{\{\s*(\w+)\s*\}\}/g;
    const parts: Array<{ text: string; isVariable: boolean }> = [];
    let lastIndex = 0;
    let match;

    while ((match = variableRegex.exec(safeText)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          text: safeText.substring(lastIndex, match.index),
          isVariable: false,
        });
      }
      
      const variableName = match[1];
      const isValidVariable = AVAILABLE_VARIABLE_NAMES.has(variableName);
      
      parts.push({
        text: match[0],
        isVariable: isValidVariable,
      });
      
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < safeText.length) {
      parts.push({
        text: safeText.substring(lastIndex),
        isVariable: false,
      });
    }
    
    return parts.length > 0 ? parts : [{ text: safeText, isVariable: false }];
  };

  // Obter valor atual do textarea para o highlight - ler diretamente do DOM
  const getCurrentValue = () => {
    return textareaRef.current?.value || value || '';
  };
  
  const highlightedParts = highlightVariables(getCurrentValue());

  return (
    <div 
      ref={containerRef} 
      style={{ 
        position: 'relative', 
        width: '100%',
        pointerEvents: 'auto',
      }}
    >
      <textarea
        key={`textarea-${valueKeyRef.current}`}
        ref={textareaRef}
        defaultValue={value || ''}
        onChange={handleChange}
        onInput={(e) => {
          // onInput é mais confiável que onChange para textarea não controlado
          handleChange(e as any);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => {
          // Para Backspace/Delete, forçar atualização do valor
          if (e.key === 'Backspace' || e.key === 'Delete') {
            setTimeout(() => {
              if (textareaRef.current) {
                onChange(textareaRef.current.value);
              }
            }, 0);
          }
          // Atualizar sugestões de forma assíncrona
          setTimeout(() => updateSuggestions(), 10);
        }}
        onSelect={updateSuggestions}
        onPaste={(e) => {
          // Deixar o paste acontecer naturalmente, depois atualizar
          setTimeout(() => {
            if (textareaRef.current) {
              onChange(textareaRef.current.value);
              updateSuggestions();
            }
          }, 0);
        }}
        placeholder={placeholder}
        style={{
          width: '100%',
          minHeight,
          padding: '10px 12px',
          backgroundColor: 'transparent',
          border: '1px solid #2a2a2a',
          borderRadius: '6px',
          color: 'transparent',
          fontSize: '14px',
          fontFamily: 'inherit',
          resize: 'vertical',
          position: 'relative',
          zIndex: 10,
          caretColor: '#ffffff',
          outline: 'none',
          ...style,
        }}
      />
      {/* Overlay para destacar variáveis */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          padding: '10px 12px',
          pointerEvents: 'none',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          fontSize: '14px',
          fontFamily: 'inherit',
          lineHeight: '1.5',
          zIndex: 0,
          overflow: 'hidden',
          border: '1px solid transparent',
          borderRadius: '6px',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none',
          touchAction: 'none',
        }}
      >
        {highlightedParts.map((part, index) => (
          <span
            key={index}
            style={{
              color: part.isVariable ? '#3b82f6' : '#ffffff',
              fontWeight: part.isVariable ? 600 : 'normal',
            }}
          >
            {part.text}
          </span>
        ))}
      </div>
      
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            backgroundColor: '#1a1a1a',
            border: '1px solid #2a2a2a',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.3)',
            zIndex: 99999,
            minWidth: '320px',
            width: '320px',
            maxWidth: '500px',
            maxHeight: '300px',
            overflowY: 'auto',
            overflowX: 'hidden',
            visibility: 'hidden',
          }}
        >
          {suggestions.map((variable, index) => (
            <div
              key={variable.name}
              onClick={() => handleSuggestionClick(variable)}
              onMouseEnter={() => setSelectedIndex(index)}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                backgroundColor: index === selectedIndex ? '#2a2a2a' : 'transparent',
                borderBottom: index < suggestions.length - 1 ? '1px solid #2a2a2a' : 'none',
                transition: 'background-color 0.15s',
              }}
            >
              <div style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#3b82f6',
                marginBottom: '4px',
                fontFamily: 'monospace',
              }}>
                {variable.example || `{{ ${variable.name} }}`}
              </div>
              <div style={{
                fontSize: '12px',
                color: '#9ca3af',
              }}>
                {variable.description}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VariableAutocomplete;
