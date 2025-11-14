/**
 * Processador de Templates/Variáveis
 * 
 * Substitui variáveis como {{ input_user }} e {{ agent_response }} nas instruções dos agentes
 * 
 * Variáveis disponíveis:
 * - {{ input_user }}: Mensagem original do usuário
 * - {{ agent_response }}: Resposta do agente anterior no workflow (apenas em workflows)
 */

export interface TemplateVariables {
  input_user?: string;
  agent_response?: string;
  [key: string]: string | undefined;
}

/**
 * Substitui variáveis em um template de string
 * 
 * @param template - Template com variáveis no formato {{ nome_variavel }}
 * @param variables - Objeto com os valores das variáveis
 * @returns String com variáveis substituídas
 * 
 * @example
 * processTemplate("Olá {{ input_user }}!", { input_user: "João" })
 * // Retorna: "Olá João!"
 * 
 * @example
 * processTemplate("Traduza: {{ agent_response }}", { agent_response: "Hello" })
 * // Retorna: "Traduza: Hello"
 */
export function processTemplate(
  template: string,
  variables: TemplateVariables
): string {
  if (!template || typeof template !== 'string') {
    return template;
  }

  let result = template;
  let hasReplacements = false;

  // Substitui cada variável encontrada no template
  for (const [key, value] of Object.entries(variables)) {
    if (value === undefined || value === null) {
      continue;
    }

    // Busca por {{ key }} ou {{key}} (com ou sem espaços)
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    const beforeReplace = result;
    result = result.replace(regex, String(value));
    
    if (beforeReplace !== result) {
      hasReplacements = true;
      console.log(`🔄 [TemplateProcessor] Substituído {{ ${key} }} por: "${String(value).substring(0, 50)}${String(value).length > 50 ? '...' : ''}"`);
    }
  }

  if (hasReplacements) {
    console.log(`✅ [TemplateProcessor] Template processado:`);
    console.log(`   Original: "${template.substring(0, 100)}${template.length > 100 ? '...' : ''}"`);
    console.log(`   Processado: "${result.substring(0, 100)}${result.length > 100 ? '...' : ''}"`);
  }

  return result;
}

/**
 * Extrai todas as variáveis de um template
 * 
 * @param template - Template com variáveis
 * @returns Array com os nomes das variáveis encontradas
 * 
 * @example
 * extractVariables("{{ input_user }} e {{ outro }}")
 * // Retorna: ["input_user", "outro"]
 */
export function extractVariables(template: string): string[] {
  if (!template || typeof template !== 'string') {
    return [];
  }

  const regex = /\{\{\s*(\w+)\s*\}\}/g;
  const variables: string[] = [];
  let match;

  while ((match = regex.exec(template)) !== null) {
    const variableName = match[1];
    if (!variables.includes(variableName)) {
      variables.push(variableName);
    }
  }

  return variables;
}

