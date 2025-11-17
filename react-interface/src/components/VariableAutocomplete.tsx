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
  const [cursorPosition, setCursorPosition] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Atualiza sugestões quando o texto ou posição do cursor muda
  const updateSuggestions = useCallback(() => {
    if (!textareaRef.current) return;

    // Garante que value é uma string válida
    const safeValue = value || '';
    
    const position = textareaRef.current.selectionStart || 0;
    setCursorPosition(position);

    // Verifica se está digitando dentro de {{ ... }}
    if (isInsideVariable(safeValue, position)) {
      const searchText = extractSearchText(safeValue, position);
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
  }, [value]);

  useEffect(() => {
    updateSuggestions();
  }, [updateSuggestions]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Adiciona listeners para detectar mudanças na seleção
    textarea.addEventListener('keyup', updateSuggestions);
    textarea.addEventListener('click', updateSuggestions);
    textarea.addEventListener('select', updateSuggestions);

    return () => {
      textarea.removeEventListener('keyup', updateSuggestions);
      textarea.removeEventListener('click', updateSuggestions);
      textarea.removeEventListener('select', updateSuggestions);
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

    // Usa requestAnimationFrame para garantir que o DOM está atualizado
    requestAnimationFrame(() => {
      updatePosition();
    });
    
    // Atualiza posição ao fazer scroll ou redimensionar
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [showSuggestions, value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertVariable(suggestions[selectedIndex]);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    }
    
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  const insertVariable = (variable: VariableDefinition) => {
    if (!textareaRef.current) return;

    // Garante que value é uma string válida
    const safeValue = value || '';

    const textarea = textareaRef.current;
    const position = textarea.selectionStart || 0;
    const textBeforeCursor = safeValue.substring(0, position);
    const textAfterCursor = safeValue.substring(position);
    
    // Encontra onde começa o {{
    const lastOpenBrace = textBeforeCursor.lastIndexOf('{{');
    if (lastOpenBrace === -1) return;
    
    // Substitui o texto entre {{ e o cursor pela variável completa
    const beforeVariable = safeValue.substring(0, lastOpenBrace);
    const variableText = `{{ ${variable.name} }}`;
    const newValue = beforeVariable + variableText + textAfterCursor;
    
    onChange(newValue);
    
    // Posiciona o cursor após a variável
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
    // Garante que text é uma string válida
    const safeText = text || '';
    if (!safeText) return [{ text: '', isVariable: false }];
    
    // Regex para encontrar variáveis {{ nome_variavel }}
    const variableRegex = /\{\{\s*(\w+)\s*\}\}/g;
    const parts: Array<{ text: string; isVariable: boolean }> = [];
    let lastIndex = 0;
    let match;

    while ((match = variableRegex.exec(safeText)) !== null) {
      // Adiciona texto antes da variável
      if (match.index > lastIndex) {
        parts.push({
          text: safeText.substring(lastIndex, match.index),
          isVariable: false,
        });
      }
      
      // Extrai o nome da variável (sem os espaços e chaves)
      const variableName = match[1];
      
      // Verifica se a variável existe na lista de variáveis disponíveis
      const isValidVariable = AVAILABLE_VARIABLE_NAMES.has(variableName);
      
      // Adiciona a variável (destacada apenas se for válida)
      parts.push({
        text: match[0],
        isVariable: isValidVariable,
      });
      
      lastIndex = match.index + match[0].length;
    }
    
    // Adiciona texto restante
    if (lastIndex < safeText.length) {
      parts.push({
        text: safeText.substring(lastIndex),
        isVariable: false,
      });
    }
    
    return parts.length > 0 ? parts : [{ text: safeText, isVariable: false }];
  };

  const highlightedParts = highlightVariables(value || '');

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <textarea
        ref={textareaRef}
        value={value || ''}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{
          width: '100%',
          minHeight,
          padding: '10px 12px',
          backgroundColor: 'transparent',
          border: '1px solid #2a2a2a',
          borderRadius: '6px',
          color: 'transparent', // Texto transparente para mostrar o overlay
          fontSize: '14px',
          fontFamily: 'inherit',
          resize: 'vertical',
          position: 'relative',
          zIndex: 2,
          caretColor: '#ffffff',
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
          zIndex: 1,
          overflow: 'hidden',
          border: '1px solid transparent',
          borderRadius: '6px',
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
            visibility: 'hidden', // Inicialmente invisível até calcular posição
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

