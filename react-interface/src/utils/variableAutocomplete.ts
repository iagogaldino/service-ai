/**
 * Variáveis disponíveis para autocomplete em templates
 */

export interface VariableDefinition {
  name: string;
  description: string;
  example?: string;
}

export const AVAILABLE_VARIABLES: VariableDefinition[] = [
  {
    name: 'input_user',
    description: 'Mensagem original do usuário',
    example: '{{ input_user }}'
  },
  {
    name: 'agent_response',
    description: 'Resposta do agente anterior no workflow (apenas em workflows)',
    example: '{{ agent_response }}'
  },
];

/**
 * Filtra variáveis baseado no texto digitado após {{
 */
export function filterVariables(searchText: string): VariableDefinition[] {
  if (!searchText) {
    return AVAILABLE_VARIABLES;
  }
  
  const lowerSearch = searchText.toLowerCase();
  return AVAILABLE_VARIABLES.filter(variable => 
    variable.name.toLowerCase().includes(lowerSearch) ||
    variable.description.toLowerCase().includes(lowerSearch)
  );
}

/**
 * Extrai o texto após {{ para busca
 */
export function extractSearchText(text: string, cursorPosition: number): string {
  // Garante que text é uma string válida
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // Garante que cursorPosition é um número válido
  if (typeof cursorPosition !== 'number' || cursorPosition < 0) {
    return '';
  }
  
  // Procura por {{ antes da posição do cursor
  const textBeforeCursor = text.substring(0, cursorPosition);
  const lastOpenBrace = textBeforeCursor.lastIndexOf('{{');
  
  if (lastOpenBrace === -1) {
    return '';
  }
  
  // Pega o texto após {{
  const afterOpenBrace = textBeforeCursor.substring(lastOpenBrace + 2);
  // Remove espaços e caracteres especiais para busca
  return afterOpenBrace.trim();
}

/**
 * Verifica se o cursor está dentro de um {{ ... }}
 */
export function isInsideVariable(text: string, cursorPosition: number): boolean {
  // Garante que text é uma string válida
  if (!text || typeof text !== 'string') {
    return false;
  }
  
  // Garante que cursorPosition é um número válido
  if (typeof cursorPosition !== 'number' || cursorPosition < 0) {
    return false;
  }
  
  const textBeforeCursor = text.substring(0, cursorPosition);
  const lastOpenBrace = textBeforeCursor.lastIndexOf('{{');
  
  if (lastOpenBrace === -1) {
    return false;
  }
  
  // Verifica se há }} após o cursor
  const textAfterCursor = text.substring(cursorPosition);
  const nextCloseBrace = textAfterCursor.indexOf('}}');
  
  // Se não há }}, ainda está dentro da variável
  return nextCloseBrace === -1 || nextCloseBrace > 0;
}

